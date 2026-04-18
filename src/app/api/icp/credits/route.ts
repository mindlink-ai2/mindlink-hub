import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceSupabase } from "@/lib/inbox-server";
import { resolveCredits } from "@/lib/search-credits";

export const runtime = "nodejs";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabase = createServiceSupabase();

  const { data: clientRow, error: clientErr } = await supabase
    .from("clients")
    .select("id, plan")
    .eq("clerk_user_id", userId)
    .single();

  if (clientErr || !clientRow) {
    return NextResponse.json({ credits_remaining: null });
  }

  const credits = await resolveCredits(
    supabase,
    clientRow.id,
    (clientRow.plan as string) ?? undefined
  );

  return NextResponse.json({
    credits_remaining: credits.creditsRemaining,
    credits_total: credits.creditsTotal,
    credits_used: credits.creditsUsed,
    period_end: credits.periodEnd.toISOString(),
  });
}
