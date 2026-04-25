import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/platform-auth";
import { createServiceSupabase } from "@/lib/inbox-server";

export const runtime = "nodejs";

export async function GET() {
  const adminCtx = await getAdminContext();
  if (!adminCtx) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const supabase = createServiceSupabase();

  // Récupérer tous les clients — select("*") pour éviter tout souci de nom de colonne
  const { data: clients, error: clientsErr } = await supabase
    .from("clients")
    .select("*")
    .order("id", { ascending: true });

  if (clientsErr) {
    console.error(
      "[admin/clients] Supabase error:",
      clientsErr.message,
      clientsErr.details,
      clientsErr.hint,
      clientsErr.code
    );
    return NextResponse.json(
      { error: "Erreur base de données", detail: clientsErr.message },
      { status: 500 }
    );
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
    .select("org_id, leads_count, google_sheet_url, google_sheet_id, started_at, completed_at, status")
    .in("org_id", orgIds)
    .order("started_at", { ascending: false });

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

  const result = (clients as Array<Record<string, unknown>>).map((client) => {
    const clientId = client.id as number;
    const icp = icpByOrg.get(clientId);
    const extractions = extractionsByOrg.get(clientId) ?? [];

    const lastExtraction = extractions[0] ?? null;

    return {
      id: client.id,
      email: (client as Record<string, unknown>).email ?? null,
      // "name" ou fallback sur l'email si la colonne n'existe pas
      name: (client as Record<string, unknown>).name ?? null,
      company_name: (client as Record<string, unknown>).company_name ?? null,
      plan: client.plan ?? null,
      quota: client.quota ?? null,
      subscription_status: client.subscription_status ?? null,
      stripe_customer_id: client.stripe_customer_id ?? null,
      stripe_subscription_id: client.stripe_subscription_id ?? null,
      current_period_end: client.current_period_end ?? null,
      created_at: client.created_at ?? null,
      n8n_workflow_id: (client as Record<string, unknown>).n8n_workflow_id ?? null,
      n8n_folder_id: (client as Record<string, unknown>).n8n_folder_id ?? null,

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

      extraction_history: extractions
        .filter((e) => e.status === "completed" && e.google_sheet_url)
        .slice(0, 5)
        .map((e) => ({
          date: (e.completed_at ?? e.started_at) as string | null,
          leads_count: e.leads_count as number,
          google_sheet_url: e.google_sheet_url as string,
        })),
    };
  });

  return NextResponse.json({ clients: result });
}
