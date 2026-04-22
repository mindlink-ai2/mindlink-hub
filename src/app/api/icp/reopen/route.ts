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

  return NextResponse.json({ success: true });
}
