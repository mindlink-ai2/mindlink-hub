import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceSupabase } from "@/lib/inbox-server";

export const runtime = "nodejs";

export async function GET() {
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
    return NextResponse.json({ credits_remaining: null });
  }

  const { data: credits } = await supabase
    .from("search_credits")
    .select("credits_total, credits_used")
    .eq("org_id", clientRow.id)
    .maybeSingle();

  if (!credits) {
    // Pas encore initialisé → retourner le quota par défaut
    return NextResponse.json({ credits_remaining: 15, credits_total: 15, credits_used: 0 });
  }

  return NextResponse.json({
    credits_remaining: credits.credits_total - credits.credits_used,
    credits_total: credits.credits_total,
    credits_used: credits.credits_used,
  });
}
