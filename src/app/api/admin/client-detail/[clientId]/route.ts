import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/inbox-server";
import { getSupportAdminContext } from "@/lib/support-admin-auth";
import { loadSetupState } from "@/lib/setup-state";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ clientId: string }> }
) {
  const adminCtx = await getSupportAdminContext();
  if (!adminCtx) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { clientId: clientIdRaw } = await context.params;
  const clientId = Number(clientIdRaw);
  if (!Number.isFinite(clientId)) {
    return NextResponse.json({ error: "invalid_client_id" }, { status: 400 });
  }

  const supabase = createServiceSupabase();

  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select(
      "id, email, company_name, plan, quota, subscription_status, stripe_customer_id, stripe_subscription_id, current_period_end, cancel_at_period_end, created_at, n8n_workflow_id, clerk_user_id"
    )
    .eq("id", clientId)
    .maybeSingle();

  if (clientErr || !client) {
    return NextResponse.json({ error: "client_not_found" }, { status: 404 });
  }

  const [
    setupState,
    onboardingStateRes,
    emailsRes,
    activityRes,
    leadsCountRes,
    lastLeadRes,
    extractionsRes,
  ] = await Promise.all([
    loadSetupState(supabase, clientId),
    supabase
      .from("client_onboarding_state")
      .select("state, created_at, linkedin_connected_at, icp_submitted_at, completed_at")
      .eq("client_id", clientId)
      .maybeSingle(),
    supabase
      .from("email_log")
      .select("id, kind, recipient, subject, status, error, metadata, sent_at")
      .eq("org_id", clientId)
      .order("sent_at", { ascending: false })
      .limit(100),
    supabase
      .from("client_activity_logs")
      .select("id, action, details, created_at")
      .eq("org_id", clientId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId),
    supabase
      .from("leads")
      .select("id, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("extraction_logs")
      .select("id, source, status, leads_count, created_at, completed_at, google_sheet_url, error_message")
      .eq("org_id", clientId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return NextResponse.json({
    client,
    setup: setupState,
    onboarding: onboardingStateRes.data ?? null,
    emails: emailsRes.data ?? [],
    activity: activityRes.data ?? [],
    leads: {
      total: typeof leadsCountRes.count === "number" ? leadsCountRes.count : 0,
      last_added_at: lastLeadRes.data?.created_at ?? null,
    },
    extractions: extractionsRes.data ?? [],
  });
}
