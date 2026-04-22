/**
 * Period utilities (period anchor, business-day counting).
 *
 * Historically this module also implemented search credits; that system has
 * been removed. Only quota-period helpers remain.
 */

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

/** Count business days (Mon-Fri) between two dates (exclusive of start, inclusive logic). */
export function countBusinessDays(from: Date, to: Date): number {
  if (to <= from) return 0;
  let count = 0;
  const cur = new Date(from);
  cur.setDate(cur.getDate() + 1);
  while (cur <= to) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}
