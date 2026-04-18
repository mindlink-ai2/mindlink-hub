import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceSupabase } from "@/lib/inbox-server";
import { computePeriod, countBusinessDays } from "@/lib/search-credits";

export const runtime = "nodejs";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabase = createServiceSupabase();

  const { data: clientRow, error: clientErr } = await supabase
    .from("clients")
    .select("id, quota")
    .eq("clerk_user_id", userId)
    .single();

  if (clientErr || !clientRow) {
    return NextResponse.json({ error: "Client introuvable" }, { status: 404 });
  }

  const orgId: number = clientRow.id;
  const quotaPerDay = Number(clientRow.quota) || 10;

  // Compute period from search_credits anchor
  const { data: creditRow } = await supabase
    .from("search_credits")
    .select("created_at")
    .eq("org_id", orgId)
    .maybeSingle();

  const periodAnchor = creditRow?.created_at
    ? new Date(creditRow.created_at as string)
    : new Date();
  const { periodStart, periodEnd } = computePeriod(periodAnchor);

  const today = new Date();
  const businessDaysRemaining = countBusinessDays(today, periodEnd);
  const quotaTotal = quotaPerDay * businessDaysRemaining;

  // Count leads already extracted in this period (from extraction_logs)
  const { data: logs } = await supabase
    .from("extraction_logs")
    .select("leads_count")
    .eq("org_id", orgId)
    .eq("status", "completed")
    .gte("started_at", periodStart.toISOString())
    .lte("started_at", periodEnd.toISOString());

  const quotaUsed = (logs ?? []).reduce(
    (sum, log) => sum + (Number(log.leads_count) || 0),
    0
  );
  const quotaRemaining = Math.max(0, quotaTotal - quotaUsed);

  return NextResponse.json({
    quota_total: quotaTotal,
    quota_used: quotaUsed,
    quota_remaining: quotaRemaining,
    quota_per_day: quotaPerDay,
    business_days_remaining: businessDaysRemaining,
    period_end: periodEnd.toISOString().split("T")[0],
  });
}
