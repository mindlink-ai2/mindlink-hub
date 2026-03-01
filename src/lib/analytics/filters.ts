import type { z } from "zod";
import { analyticsAdminFiltersSchema } from "@/lib/analytics/schemas";

export type ParsedAnalyticsFilters = {
  fromDate: string;
  toDate: string;
  fromIso: string;
  toIso: string;
  previousFromIso: string;
  previousToIso: string;
  clientId: number | null;
  eventName: string | null;
  category: string | null;
  pagePath: string | null;
  limit: number;
  offset: number;
};

function toUtcStartIso(day: string): string {
  return `${day}T00:00:00.000Z`;
}

function toUtcEndIso(day: string): string {
  return `${day}T23:59:59.999Z`;
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(day: string, offset: number): string {
  const d = new Date(toUtcStartIso(day));
  d.setUTCDate(d.getUTCDate() + offset);
  return formatDay(d);
}

export function parseAnalyticsFilters(
  params: URLSearchParams,
  defaults?: { limit?: number; offset?: number }
): { ok: true; data: ParsedAnalyticsFilters } | { ok: false } {
  const raw = {
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    client_id: params.get("client_id") ?? undefined,
    event_name: params.get("event_name") ?? undefined,
    category: params.get("category") ?? undefined,
    page: params.get("page") ?? undefined,
    limit: params.get("limit") ?? defaults?.limit ?? undefined,
    offset: params.get("offset") ?? defaults?.offset ?? undefined,
  };

  const parsed = analyticsAdminFiltersSchema.safeParse(raw);
  if (!parsed.success) return { ok: false };

  const today = new Date();
  const todayDay = formatDay(today);
  const defaultFrom = addDays(todayDay, -6);

  const fromDate = parsed.data.from ?? defaultFrom;
  const toDate = parsed.data.to ?? todayDay;

  if (fromDate > toDate) return { ok: false };

  const fromIso = toUtcStartIso(fromDate);
  const toIso = toUtcEndIso(toDate);

  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();
  const rangeMs = Math.max(1, toMs - fromMs);

  const previousTo = new Date(fromMs - 1);
  const previousFrom = new Date(previousTo.getTime() - rangeMs);

  const data: ParsedAnalyticsFilters = {
    fromDate,
    toDate,
    fromIso,
    toIso,
    previousFromIso: previousFrom.toISOString(),
    previousToIso: previousTo.toISOString(),
    clientId: parsed.data.client_id ?? null,
    eventName: parsed.data.event_name ? parsed.data.event_name : null,
    category: parsed.data.category ? parsed.data.category : null,
    pagePath: parsed.data.page ? parsed.data.page : null,
    limit: parsed.data.limit ?? defaults?.limit ?? 50,
    offset: parsed.data.offset ?? defaults?.offset ?? 0,
  };

  return { ok: true, data };
}

export type AnalyticsAdminFiltersInput = z.input<typeof analyticsAdminFiltersSchema>;
