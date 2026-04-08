import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceSupabase } from "@/lib/inbox-server";

export const runtime = "nodejs";

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
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

  // Vérifier que le client a des crédits restants avant d'autoriser la réouverture
  const { data: credits } = await supabase
    .from("search_credits")
    .select("credits_total, credits_used")
    .eq("org_id", orgId)
    .maybeSingle();

  const creditsRemaining = credits
    ? credits.credits_total - credits.credits_used
    : 15; // pas encore initialisé → créédits disponibles

  if (creditsRemaining <= 0) {
    return NextResponse.json(
      { error: "Vous n'avez plus de crédits de recherche disponibles." },
      { status: 402 }
    );
  }

  // Repasser l'ICP en brouillon
  const { data: existing } = await supabase
    .from("icp_configs")
    .select("id, status")
    .eq("org_id", orgId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Aucun ciblage trouvé." }, { status: 404 });
  }

  const { error: updateErr } = await supabase
    .from("icp_configs")
    .update({
      status: "draft",
      submitted_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id);

  if (updateErr) {
    console.error("[icp/reopen] update error", updateErr.message);
    return NextResponse.json({ error: "Impossible de rouvrir le ciblage." }, { status: 500 });
  }

  return NextResponse.json({ success: true, credits_remaining: creditsRemaining });
}
