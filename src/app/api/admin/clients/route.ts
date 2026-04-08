import { NextResponse } from "next/server";
import { getSupportAdminContext } from "@/lib/support-admin-auth";
import { createServiceSupabase } from "@/lib/inbox-server";

export const runtime = "nodejs";

export async function GET() {
  const adminCtx = await getSupportAdminContext();
  if (!adminCtx) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const supabase = createServiceSupabase();

  // Récupérer tous les clients
  const { data: clients, error: clientsErr } = await supabase
    .from("clients")
    .select(
      "id, email, name, company_name, plan, quota, subscription_status, stripe_customer_id, stripe_subscription_id, current_period_end, created_at"
    )
    .order("id", { ascending: true });

  if (clientsErr) {
    console.error("[admin/clients] Supabase error on clients query:", clientsErr.message, clientsErr.details);
  }

  if (clientsErr) {
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }

  if (!clients || clients.length === 0) {
    return NextResponse.json({ clients: [] });
  }

  const orgIds = clients.map((c: { id: number }) => c.id);

  // Récupérer les configs ICP
  const { data: icpConfigs } = await supabase
    .from("icp_configs")
    .select("org_id, status, filters, submitted_at, updated_at")
    .in("org_id", orgIds);

  // Récupérer les dernières extractions
  const { data: extractionLogs } = await supabase
    .from("extraction_logs")
    .select("org_id, leads_count, google_sheet_url, started_at, completed_at, status")
    .in("org_id", orgIds)
    .order("started_at", { ascending: false });

  // Récupérer les crédits de recherche
  const { data: searchCredits } = await supabase
    .from("search_credits")
    .select("org_id, credits_total, credits_used")
    .in("org_id", orgIds);

  // Indexer par org_id
  const icpByOrg = new Map<number, Record<string, unknown>>();
  for (const icp of icpConfigs ?? []) {
    icpByOrg.set(icp.org_id, icp);
  }

  const extractionsByOrg = new Map<number, Array<Record<string, unknown>>>();
  for (const log of extractionLogs ?? []) {
    if (!extractionsByOrg.has(log.org_id)) {
      extractionsByOrg.set(log.org_id, []);
    }
    extractionsByOrg.get(log.org_id)!.push(log);
  }

  const creditsByOrg = new Map<number, Record<string, unknown>>();
  for (const c of searchCredits ?? []) {
    creditsByOrg.set(c.org_id, c);
  }

  const result = (clients as Array<Record<string, unknown>>).map((client) => {
    const clientId = client.id as number;
    const icp = icpByOrg.get(clientId);
    const extractions = extractionsByOrg.get(clientId) ?? [];
    const credits = creditsByOrg.get(clientId);

    const lastExtraction = extractions[0] ?? null;

    return {
      id: client.id,
      email: client.email,
      name: (client as Record<string, unknown>).name ?? null,
      company_name: (client as Record<string, unknown>).company_name ?? null,
      plan: client.plan ?? null,
      quota: client.quota ?? null,
      subscription_status: client.subscription_status ?? null,
      stripe_customer_id: client.stripe_customer_id ?? null,
      stripe_subscription_id: client.stripe_subscription_id ?? null,
      current_period_end: client.current_period_end ?? null,
      created_at: client.created_at ?? null,

      icp: icp
        ? {
            status: icp.status ?? "none",
            filters: icp.filters ?? {},
            submitted_at: icp.submitted_at ?? null,
            updated_at: icp.updated_at ?? null,
          }
        : { status: "none", filters: {}, submitted_at: null, updated_at: null },

      last_extraction: lastExtraction
        ? {
            leads_count: lastExtraction.leads_count,
            google_sheet_url: lastExtraction.google_sheet_url,
            date: lastExtraction.completed_at ?? lastExtraction.started_at,
            status: lastExtraction.status,
          }
        : null,

      extractions_count: extractions.filter((e) => e.status === "completed").length,

      credits: credits
        ? {
            total: (credits as Record<string, unknown>).credits_total,
            used: (credits as Record<string, unknown>).credits_used,
            remaining:
              ((credits as Record<string, unknown>).credits_total as number) -
              ((credits as Record<string, unknown>).credits_used as number),
          }
        : { total: 15, used: 0, remaining: 15 },
    };
  });

  return NextResponse.json({ clients: result });
}
