/**
 * Search credits: 31-day auto-reset logic.
 *
 * Credits per period depend on the client plan:
 *   - Essential → 1 credit
 *   - Full      → 4 credits
 *
 * The period anchor is search_credits.created_at (when the credits
 * row was first created). When a new period starts, credits_used
 * is reset to 0.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const CREDITS_DEFAULT = 4;
const CREDITS_ESSENTIAL = 1;
const PERIOD_DAYS = 31;
const PERIOD_MS = PERIOD_DAYS * 24 * 60 * 60 * 1000;

export interface CreditPeriod {
  periodStart: Date;
  periodEnd: Date;
  periodNumber: number;
}

/** Calculate the current 31-day period for a given anchor date. */
export function computePeriod(anchorDate: Date, now: Date = new Date()): CreditPeriod {
  const diffMs = now.getTime() - anchorDate.getTime();
  const periodNumber = Math.max(0, Math.floor(diffMs / PERIOD_MS));
  const periodStart = new Date(anchorDate.getTime() + periodNumber * PERIOD_MS);
  const periodEnd = new Date(periodStart.getTime() + PERIOD_MS);
  return { periodStart, periodEnd, periodNumber };
}

export interface ResolvedCredits {
  creditsTotal: number;
  creditsUsed: number;
  creditsRemaining: number;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Resolve credits for a client, auto-resetting if the period has changed.
 *
 * - If no search_credits row exists, creates one (anchor = now).
 * - Period is computed from search_credits.created_at (the row anchor).
 * - If the stored period_start doesn't match the current period, resets credits_used to 0.
 * - Returns the current credit state.
 */
export async function resolveCredits(
  supabase: SupabaseClient,
  orgId: number,
  plan?: string
): Promise<ResolvedCredits> {
  const total =
    plan?.toLowerCase() === "essential" ? CREDITS_ESSENTIAL : CREDITS_DEFAULT;

  const { data: creditRow } = await supabase
    .from("search_credits")
    .select("id, credits_total, credits_used, period_start, created_at")
    .eq("org_id", orgId)
    .maybeSingle();

  if (!creditRow) {
    // First time — create the row; anchor = now
    const now = new Date();
    const { periodStart, periodEnd } = computePeriod(now, now);
    await supabase.from("search_credits").insert({
      org_id: orgId,
      credits_total: total,
      credits_used: 0,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
    });
    return {
      creditsTotal: total,
      creditsUsed: 0,
      creditsRemaining: total,
      periodStart,
      periodEnd,
    };
  }

  // Use the row's created_at as anchor for period computation
  const anchor = new Date(creditRow.created_at);
  const { periodStart, periodEnd } = computePeriod(anchor);

  // Check if we need to reset (new period)
  const storedPeriodStart = creditRow.period_start
    ? new Date(creditRow.period_start)
    : null;

  const needsReset =
    !storedPeriodStart ||
    Math.abs(storedPeriodStart.getTime() - periodStart.getTime()) > 60_000; // 1min tolerance

  if (needsReset) {
    await supabase
      .from("search_credits")
      .update({
        credits_total: total,
        credits_used: 0,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", creditRow.id);

    return {
      creditsTotal: total,
      creditsUsed: 0,
      creditsRemaining: total,
      periodStart,
      periodEnd,
    };
  }

  const used = creditRow.credits_used as number;
  return {
    creditsTotal: total,
    creditsUsed: used,
    creditsRemaining: Math.max(0, total - used),
    periodStart,
    periodEnd,
  };
}

/** Count business days (Mon-Fri) between two dates (exclusive of start, inclusive logic). */
export function countBusinessDays(from: Date, to: Date): number {
  if (to <= from) return 0;
  let count = 0;
  const cur = new Date(from);
  // Start from tomorrow
  cur.setDate(cur.getDate() + 1);
  while (cur <= to) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}
