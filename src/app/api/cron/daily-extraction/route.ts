import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/inbox-server";
import { autoExtractLeads } from "@/lib/auto-extract";
import { loadSetupState, isSetupComplete } from "@/lib/setup-state";
import { logClientActivity } from "@/lib/client-activity";

export const runtime = "nodejs";
export const maxDuration = 300;

const TEST_ORG_IDS = new Set<number>([16, 18]);

type ClientRow = {
  id: number;
  email: string | null;
  company_name: string | null;
  quota: number | null;
  subscription_status: string | null;
  n8n_workflow_id: string | null;
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = createServiceSupabase();

  const { data: clients, error: clientsErr } = await supabase
    .from("clients")
    .select("id, email, company_name, quota, subscription_status, n8n_workflow_id");

  if (clientsErr || !clients) {
    return NextResponse.json({ error: "clients fetch failed" }, { status: 500 });
  }

  const now = new Date();
  const todayStartIso = startOfDay(now).toISOString();
  const report: Array<Record<string, unknown>> = [];

  for (const raw of clients as ClientRow[]) {
    const client = raw;

    if (TEST_ORG_IDS.has(client.id)) {
      report.push({ orgId: client.id, action: "skip_test" });
      continue;
    }

    const status = (client.subscription_status ?? "").toLowerCase();
    const hasActiveSub =
      status === "active" || status === "trialing" || status === "past_due";
    if (!hasActiveSub) {
      report.push({ orgId: client.id, action: "skip_inactive", status });
      continue;
    }

    const setup = await loadSetupState(supabase, client.id);
    if (!isSetupComplete(setup)) {
      report.push({ orgId: client.id, action: "skip_setup_incomplete", setup });
      continue;
    }

    if (!client.n8n_workflow_id) {
      report.push({ orgId: client.id, action: "skip_no_workflow" });
      continue;
    }

    const quotaPerDay = Number(client.quota) || 0;
    if (!quotaPerDay) {
      report.push({ orgId: client.id, action: "skip_no_quota" });
      continue;
    }

    // Anti-doublon : déjà extrait aujourd'hui ?
    const { data: todayLogs } = await supabase
      .from("extraction_logs")
      .select("id")
      .eq("org_id", client.id)
      .in("source", ["auto_daily", "auto_renewal", "auto_completion"])
      .gte("created_at", todayStartIso)
      .limit(1);

    if (todayLogs && todayLogs.length > 0) {
      report.push({ orgId: client.id, action: "skip_already_extracted_today" });
      continue;
    }

    const result = await autoExtractLeads(supabase, client.id, quotaPerDay, "auto_daily");

    await logClientActivity(supabase, client.id, "leads_extracted", {
      source: "auto_daily",
      leads_count: result.leadsCount,
      quota_per_day: quotaPerDay,
      error: result.error ?? null,
    });

    report.push({
      orgId: client.id,
      action: "auto_daily",
      leads: result.leadsCount,
      quota: quotaPerDay,
      error: result.error,
    });
  }

  return NextResponse.json({ ok: true, processed: report.length, report });
}
