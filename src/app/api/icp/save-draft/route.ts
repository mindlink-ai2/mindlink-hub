import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceSupabase } from "@/lib/inbox-server";
import { logClientActivity } from "@/lib/client-activity";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: { filters: Record<string, unknown>; preview_profiles?: unknown[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  if (!body.filters || typeof body.filters !== "object") {
    return NextResponse.json({ error: "Filtres manquants" }, { status: 400 });
  }

  const supabase = createServiceSupabase();

  const { data: clientRow, error: clientErr } = await supabase
    .from("clients")
    .select("id")
    .eq("clerk_user_id", userId)
    .single();

  if (clientErr || !clientRow) {
    return NextResponse.json({ error: "Client introuvable" }, { status: 404 });
  }
  const orgId: number = clientRow.id;

  const { data: existing } = await supabase
    .from("icp_configs")
    .select("id, status")
    .eq("org_id", orgId)
    .maybeSingle();

  const apolloFilters = (body.filters as Record<string, unknown>)?.apollo_filters;
  console.log(
    "[icp/save-draft] org_id:", orgId,
    "existing:", existing ? `id=${existing.id} status=${existing.status}` : "none",
    "apollo_filters keys:", apolloFilters ? Object.keys(apolloFilters as Record<string, unknown>) : "null"
  );

  if (existing?.id) {
    // Always allow saving filters (status reset to draft if needed)
    const { error: updateErr } = await supabase
      .from("icp_configs")
      .update({
        filters: body.filters,
        preview_profiles: body.preview_profiles ?? [],
        status: "draft",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (updateErr) {
      console.error("[icp/save-draft] update error", updateErr);
      return NextResponse.json({ error: "Erreur lors de la sauvegarde" }, { status: 500 });
    }
    console.log("[icp/save-draft] updated id:", existing.id, "apollo_filters saved:", JSON.stringify(apolloFilters).slice(0, 300));
  } else {
    const { error: insertErr } = await supabase.from("icp_configs").insert({
      org_id: orgId,
      filters: body.filters,
      preview_profiles: body.preview_profiles ?? [],
      status: "draft",
    });

    if (insertErr) {
      console.error("[icp/save-draft] insert error", insertErr);
      return NextResponse.json({ error: "Erreur lors de la sauvegarde" }, { status: 500 });
    }
    console.log("[icp/save-draft] inserted new row for org_id:", orgId);
  }

  // Log activity only if modifying an already-submitted targeting
  const wasSubmitted =
    existing?.status === "submitted" ||
    existing?.status === "reviewed" ||
    existing?.status === "active";
  if (wasSubmitted) {
    await logClientActivity(supabase, orgId, "icp_modified");
  }

  return NextResponse.json({ success: true });
}
