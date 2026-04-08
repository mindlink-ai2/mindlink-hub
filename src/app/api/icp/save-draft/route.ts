import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceSupabase } from "@/lib/inbox-server";

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

  // Ne pas écraser un ICP déjà soumis/validé
  const { data: existing } = await supabase
    .from("icp_configs")
    .select("id, status")
    .eq("org_id", orgId)
    .maybeSingle();

  if (existing && existing.status !== "draft") {
    return NextResponse.json(
      { error: "Ce ciblage a déjà été soumis et ne peut pas être modifié." },
      { status: 409 }
    );
  }

  if (existing?.id) {
    const { error: updateErr } = await supabase
      .from("icp_configs")
      .update({
        filters: body.filters,
        preview_profiles: body.preview_profiles ?? [],
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (updateErr) {
      console.error("[icp/save-draft] update error", updateErr);
      return NextResponse.json({ error: "Erreur lors de la sauvegarde" }, { status: 500 });
    }
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
  }

  return NextResponse.json({ success: true });
}
