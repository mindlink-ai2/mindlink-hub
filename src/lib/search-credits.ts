/**
 * Search credits: 31-day auto-reset logic.
 *
 * Each client gets 5 credits per 31-day period, starting from their account
 * creation date. When a new period starts, credits_used is reset to 0.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const CREDITS_TOTAL = 5;
const PERIOD_DAYS = 31;
const PERIOD_MS = PERIOD_DAYS * 24 * 60 * 60 * 1000;

export interface CreditPeriod {
  periodStart: Date;
  periodEnd: Date;
  periodNumber: number;
}

/** Calculate the current 31-day period for a given account creation date. */
export function computePeriod(createdAt: Date, now: Date = new Date()): CreditPeriod {
  const diffMs = now.getTime() - createdAt.getTime();
  const periodNumber = Math.max(0, Math.floor(diffMs / PERIOD_MS));
  const periodStart = new Date(createdAt.getTime() + periodNumber * PERIOD_MS);
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
 * - If no search_credits row exists, creates one.
 * - If the stored period_start doesn't match the current period, resets credits_used to 0.
 * - Returns the current credit state.
 *
 * Requires `clientCreatedAt` (from clients.created_at) to compute periods.
 */
export async function resolveCredits(
  supabase: SupabaseClient,
  orgId: number,
  clientCreatedAt: string | Date
): Promise<ResolvedCredits> {
  const createdAt = new Date(clientCreatedAt);
  const { periodStart, periodEnd } = computePeriod(createdAt);

  const { data: creditRow } = await supabase
    .from("search_credits")
    .select("id, credits_total, credits_used, period_start")
    .eq("org_id", orgId)
    .maybeSingle();

  if (!creditRow) {
    // First time — create the row
    await supabase.from("search_credits").insert({
      org_id: orgId,
      credits_total: CREDITS_TOTAL,
      credits_used: 0,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
    });
    return {
      creditsTotal: CREDITS_TOTAL,
      creditsUsed: 0,
      creditsRemaining: CREDITS_TOTAL,
      periodStart,
      periodEnd,
    };
  }

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
        credits_total: CREDITS_TOTAL,
        credits_used: 0,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", creditRow.id);

    return {
      creditsTotal: CREDITS_TOTAL,
      creditsUsed: 0,
      creditsRemaining: CREDITS_TOTAL,
      periodStart,
      periodEnd,
    };
  }

  const used = creditRow.credits_used as number;
  return {
    creditsTotal: CREDITS_TOTAL,
    creditsUsed: used,
    creditsRemaining: Math.max(0, CREDITS_TOTAL - used),
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
