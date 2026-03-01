"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HubButton } from "@/components/ui/hub-button";

type OverviewData = {
  sessions: number;
  activeUsers: number;
  pageViews: number;
  clicks: number;
  topFeature: string | null;
  topFeatureCount: number;
  errors: number;
  totalEvents: number;
};

type AveragesData = {
  eventsPerSession: number;
  pageViewsPerSession: number;
  medianTimeOnPageMs: number;
};

type ClientOption = {
  clientId: number;
  totalEvents: number;
};

type SummaryResponse = {
  overview: OverviewData;
  averages: AveragesData;
  availableClients: ClientOption[];
};

type TopEvent = {
  eventName: string;
  total: number;
  previousTotal: number;
  delta: number;
  deltaPercent: number;
};

type TopFeature = {
  feature: string;
  total: number;
};

type TopPage = {
  pagePath: string;
  total: number;
};

type TopElement = {
  label: string;
  type: string | null;
  id: string | null;
  href: string | null;
  total: number;
};

type FunnelStep = {
  step: string;
  sessions: number;
  conversionRate: number;
};

type TopResponse = {
  topEvents: TopEvent[];
  topFeatures: TopFeature[];
  topPages: TopPage[];
  topElements: TopElement[];
  funnel: FunnelStep[];
};

type AnalyticsEventRow = {
  id: string;
  createdAt: string;
  clientId: number;
  userId: string | null;
  sessionId: string;
  eventName: string;
  category: string | null;
  pagePath: string | null;
  element: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  durationMs: number | null;
};

type EventsResponse = {
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
  events: AnalyticsEventRow[];
};

type FiltersState = {
  from: string;
  to: string;
  clientId: string;
  eventName: string;
  category: string;
  page: string;
};

const EMPTY_OVERVIEW: OverviewData = {
  sessions: 0,
  activeUsers: 0,
  pageViews: 0,
  clicks: 0,
  topFeature: null,
  topFeatureCount: 0,
  errors: 0,
  totalEvents: 0,
};

const EMPTY_AVERAGES: AveragesData = {
  eventsPerSession: 0,
  pageViewsPerSession: 0,
  medianTimeOnPageMs: 0,
};

function defaultDateRange(): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - 6);
  const from = fromDate.toISOString().slice(0, 10);
  return { from, to };
}

function formatNumber(value: number): string {
  return value.toLocaleString("fr-FR");
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("fr-FR");
}

function formatDurationMs(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 ms";
  if (value < 1000) return `${Math.round(value)} ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${minutes} min ${remaining}s`;
}

function buildQuery(filters: FiltersState, extra?: { offset?: number; limit?: number }): string {
  const params = new URLSearchParams();
  params.set("from", filters.from);
  params.set("to", filters.to);
  if (filters.clientId) params.set("client_id", filters.clientId);
  if (filters.eventName.trim()) params.set("event_name", filters.eventName.trim());
  if (filters.category.trim()) params.set("category", filters.category.trim());
  if (filters.page.trim()) params.set("page", filters.page.trim());
  if (extra?.offset !== undefined) params.set("offset", String(extra.offset));
  if (extra?.limit !== undefined) params.set("limit", String(extra.limit));
  return params.toString();
}

function getDeltaTone(value: number): string {
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-rose-700";
  return "text-[#51627b]";
}

export default function AnalyticsAdminClient() {
  const defaults = useMemo(defaultDateRange, []);
  const [filters, setFilters] = useState<FiltersState>({
    from: defaults.from,
    to: defaults.to,
    clientId: "",
    eventName: "",
    category: "",
    page: "",
  });

  const [loading, setLoading] = useState(true);
  const [loadingMoreEvents, setLoadingMoreEvents] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [overview, setOverview] = useState<OverviewData>(EMPTY_OVERVIEW);
  const [averages, setAverages] = useState<AveragesData>(EMPTY_AVERAGES);
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([]);

  const [topEvents, setTopEvents] = useState<TopEvent[]>([]);
  const [topFeatures, setTopFeatures] = useState<TopFeature[]>([]);
  const [topPages, setTopPages] = useState<TopPage[]>([]);
  const [topElements, setTopElements] = useState<TopElement[]>([]);
  const [funnel, setFunnel] = useState<FunnelStep[]>([]);

  const [events, setEvents] = useState<AnalyticsEventRow[]>([]);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [eventsOffset, setEventsOffset] = useState(0);
  const [eventsLimit, setEventsLimit] = useState(50);
  const [hasMoreEvents, setHasMoreEvents] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const query = buildQuery(filters, { offset: 0, limit: 50 });

      const [summaryRes, topRes, eventsRes] = await Promise.all([
        fetch(`/api/admin/analytics/summary?${query}`, { cache: "no-store" }),
        fetch(`/api/admin/analytics/top?${query}&limit=10`, { cache: "no-store" }),
        fetch(`/api/admin/analytics/events?${query}`, { cache: "no-store" }),
      ]);

      const [summaryJson, topJson, eventsJson] = await Promise.all([
        summaryRes.json().catch(() => ({})),
        topRes.json().catch(() => ({})),
        eventsRes.json().catch(() => ({})),
      ]);

      if (!summaryRes.ok) throw new Error(summaryJson?.error ?? "Impossible de charger le résumé.");
      if (!topRes.ok) throw new Error(topJson?.error ?? "Impossible de charger les tops.");
      if (!eventsRes.ok) throw new Error(eventsJson?.error ?? "Impossible de charger les événements.");

      const summaryData = summaryJson as SummaryResponse;
      const topData = topJson as TopResponse;
      const eventsData = eventsJson as EventsResponse;

      setOverview(summaryData.overview ?? EMPTY_OVERVIEW);
      setAverages(summaryData.averages ?? EMPTY_AVERAGES);
      setClientOptions(Array.isArray(summaryData.availableClients) ? summaryData.availableClients : []);

      setTopEvents(Array.isArray(topData.topEvents) ? topData.topEvents : []);
      setTopFeatures(Array.isArray(topData.topFeatures) ? topData.topFeatures : []);
      setTopPages(Array.isArray(topData.topPages) ? topData.topPages : []);
      setTopElements(Array.isArray(topData.topElements) ? topData.topElements : []);
      setFunnel(Array.isArray(topData.funnel) ? topData.funnel : []);

      setEvents(Array.isArray(eventsData.events) ? eventsData.events : []);
      setEventsOffset(eventsData.pagination?.offset ?? 0);
      setEventsLimit(eventsData.pagination?.limit ?? 50);
      setEventsTotal(eventsData.pagination?.total ?? 0);
      setHasMoreEvents(Boolean(eventsData.pagination?.hasMore));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement analytics.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const loadMoreEvents = useCallback(async () => {
    if (loadingMoreEvents || !hasMoreEvents) return;
    setLoadingMoreEvents(true);

    try {
      const nextOffset = eventsOffset + eventsLimit;
      const query = buildQuery(filters, { offset: nextOffset, limit: eventsLimit });
      const res = await fetch(`/api/admin/analytics/events?${query}`, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as EventsResponse;
      if (!res.ok) throw new Error("Impossible de charger plus d’événements.");

      setEvents((prev) => [...prev, ...(Array.isArray(data.events) ? data.events : [])]);
      setEventsOffset(data.pagination?.offset ?? nextOffset);
      setEventsLimit(data.pagination?.limit ?? eventsLimit);
      setEventsTotal(data.pagination?.total ?? eventsTotal);
      setHasMoreEvents(Boolean(data.pagination?.hasMore));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de pagination.");
    } finally {
      setLoadingMoreEvents(false);
    }
  }, [eventsLimit, eventsOffset, eventsTotal, filters, hasMoreEvents, loadingMoreEvents]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  return (
    <div className="relative h-full min-h-0 w-full px-4 pb-24 pt-6 sm:px-6">
      <div className="mx-auto w-full max-w-[1680px] space-y-5">
        <section className="hub-card-hero p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="hub-page-title mt-1 text-3xl md:text-4xl">Admin Analytics</h1>
              <p className="mt-2 text-sm text-[#51627b]">
                Tracking produit first-party (Hub + Supabase) avec filtres multi-clients.
              </p>
            </div>
            <HubButton type="button" onClick={() => void fetchAll()} disabled={loading}>
              {loading ? "Chargement..." : "Actualiser"}
            </HubButton>
          </div>
        </section>

        <section className="hub-card p-4 sm:p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <label className="text-xs text-[#51627b]">
              Du
              <input
                type="date"
                value={filters.from}
                onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value }))}
                className="mt-1 h-9 w-full rounded-xl border border-[#c8d6ea] bg-white px-3 text-sm text-[#0b1c33]"
              />
            </label>
            <label className="text-xs text-[#51627b]">
              Au
              <input
                type="date"
                value={filters.to}
                onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value }))}
                className="mt-1 h-9 w-full rounded-xl border border-[#c8d6ea] bg-white px-3 text-sm text-[#0b1c33]"
              />
            </label>
            <label className="text-xs text-[#51627b]">
              Client
              <select
                value={filters.clientId}
                onChange={(e) => setFilters((prev) => ({ ...prev, clientId: e.target.value }))}
                className="mt-1 h-9 w-full rounded-xl border border-[#c8d6ea] bg-white px-3 text-sm text-[#0b1c33]"
              >
                <option value="">Tous</option>
                {clientOptions.map((entry) => (
                  <option key={entry.clientId} value={String(entry.clientId)}>
                    {entry.clientId} ({formatNumber(entry.totalEvents)})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[#51627b]">
              Event name
              <input
                value={filters.eventName}
                onChange={(e) => setFilters((prev) => ({ ...prev, eventName: e.target.value }))}
                placeholder="ex: page_view"
                className="mt-1 h-9 w-full rounded-xl border border-[#c8d6ea] bg-white px-3 text-sm text-[#0b1c33]"
              />
            </label>
            <label className="text-xs text-[#51627b]">
              Category
              <input
                value={filters.category}
                onChange={(e) => setFilters((prev) => ({ ...prev, category: e.target.value }))}
                placeholder="ex: navigation"
                className="mt-1 h-9 w-full rounded-xl border border-[#c8d6ea] bg-white px-3 text-sm text-[#0b1c33]"
              />
            </label>
            <label className="text-xs text-[#51627b]">
              Page path
              <input
                value={filters.page}
                onChange={(e) => setFilters((prev) => ({ ...prev, page: e.target.value }))}
                placeholder="ex: /dashboard/inbox"
                className="mt-1 h-9 w-full rounded-xl border border-[#c8d6ea] bg-white px-3 text-sm text-[#0b1c33]"
              />
            </label>
          </div>

          <div className="mt-3 flex gap-2">
            <HubButton type="button" variant="primary" size="sm" onClick={() => void fetchAll()}>
              Appliquer les filtres
            </HubButton>
            <HubButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setFilters({
                  from: defaults.from,
                  to: defaults.to,
                  clientId: "",
                  eventName: "",
                  category: "",
                  page: "",
                })
              }
            >
              Réinitialiser
            </HubButton>
          </div>
        </section>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard label="Sessions" value={formatNumber(overview.sessions)} />
          <KpiCard label="Utilisateurs actifs" value={formatNumber(overview.activeUsers)} />
          <KpiCard label="Pages vues" value={formatNumber(overview.pageViews)} />
          <KpiCard label="Clics" value={formatNumber(overview.clicks)} />
          <KpiCard label="Erreurs" value={formatNumber(overview.errors)} />
          <KpiCard label="Total events" value={formatNumber(overview.totalEvents)} />
        </section>

        <section className="grid gap-3 xl:grid-cols-3">
          <article className="hub-card p-4">
            <h2 className="text-sm font-semibold text-[#0b1c33]">Averages / Moyennes</h2>
            <div className="mt-3 space-y-2 text-sm text-[#334155]">
              <p>Events / session : <strong>{averages.eventsPerSession.toFixed(2)}</strong></p>
              <p>Pages vues / session : <strong>{averages.pageViewsPerSession.toFixed(2)}</strong></p>
              <p>Median time_on_page : <strong>{formatDurationMs(averages.medianTimeOnPageMs)}</strong></p>
            </div>
          </article>

          <article className="hub-card p-4">
            <h2 className="text-sm font-semibold text-[#0b1c33]">Top Feature</h2>
            <div className="mt-3 text-sm text-[#334155]">
              <p className="text-lg font-semibold text-[#0b1c33]">
                {overview.topFeature ?? "—"}
              </p>
              <p className="mt-1">
                {formatNumber(overview.topFeatureCount)} utilisation(s)
              </p>
            </div>
          </article>

          <article className="hub-card p-4">
            <h2 className="text-sm font-semibold text-[#0b1c33]">Funnel</h2>
            <div className="mt-3 space-y-2">
              {funnel.length === 0 ? (
                <p className="text-sm text-[#51627b]">Aucune donnée funnel.</p>
              ) : (
                funnel.map((step) => (
                  <div key={step.step} className="rounded-xl border border-[#d7e3f4] bg-[#f8fbff] px-3 py-2">
                    <p className="text-xs text-[#51627b]">{step.step}</p>
                    <p className="text-sm font-semibold text-[#0b1c33]">
                      {formatNumber(step.sessions)} sessions ({step.conversionRate}%)
                    </p>
                  </div>
                ))
              )}
            </div>
          </article>
        </section>

        <section className="grid gap-3 xl:grid-cols-2">
          <article className="hub-card overflow-hidden">
            <div className="border-b border-[#d7e3f4] bg-[#f8fbff] px-4 py-3">
              <h2 className="text-sm font-semibold text-[#0b1c33]">Top Events</h2>
            </div>
            <div className="overflow-x-auto p-3">
              <table className="w-full min-w-[580px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-[#51627b]">
                    <th className="px-2 py-1">Event</th>
                    <th className="px-2 py-1">Période</th>
                    <th className="px-2 py-1">Précédente</th>
                    <th className="px-2 py-1">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {topEvents.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-2 py-4 text-[#51627b]">Aucun événement.</td>
                    </tr>
                  ) : (
                    topEvents.map((row) => (
                      <tr key={row.eventName} className="border-t border-[#edf3fb]">
                        <td className="px-2 py-2 font-medium text-[#0b1c33]">{row.eventName}</td>
                        <td className="px-2 py-2">{formatNumber(row.total)}</td>
                        <td className="px-2 py-2">{formatNumber(row.previousTotal)}</td>
                        <td className={`px-2 py-2 ${getDeltaTone(row.delta)}`}>
                          {row.delta >= 0 ? "+" : ""}
                          {formatNumber(row.delta)} ({row.deltaPercent}%)
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article className="hub-card overflow-hidden">
            <div className="border-b border-[#d7e3f4] bg-[#f8fbff] px-4 py-3">
              <h2 className="text-sm font-semibold text-[#0b1c33]">Heatmap légère (Top clicks)</h2>
            </div>
            <div className="overflow-x-auto p-3">
              <table className="w-full min-w-[580px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-[#51627b]">
                    <th className="px-2 py-1">Element</th>
                    <th className="px-2 py-1">Type</th>
                    <th className="px-2 py-1">Href / Id</th>
                    <th className="px-2 py-1">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {topElements.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-2 py-4 text-[#51627b]">Aucun click tracké.</td>
                    </tr>
                  ) : (
                    topElements.map((row, idx) => (
                      <tr key={`${row.label}-${idx}`} className="border-t border-[#edf3fb]">
                        <td className="px-2 py-2 font-medium text-[#0b1c33]">{row.label || "—"}</td>
                        <td className="px-2 py-2">{row.type || "—"}</td>
                        <td className="px-2 py-2 text-xs text-[#51627b]">
                          {row.href || row.id || "—"}
                        </td>
                        <td className="px-2 py-2">{formatNumber(row.total)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <section className="grid gap-3 xl:grid-cols-2">
          <article className="hub-card p-4">
            <h2 className="text-sm font-semibold text-[#0b1c33]">Top Features</h2>
            <div className="mt-3 space-y-2">
              {topFeatures.length === 0 ? (
                <p className="text-sm text-[#51627b]">Aucune feature_used.</p>
              ) : (
                topFeatures.map((row) => (
                  <div
                    key={row.feature}
                    className="flex items-center justify-between rounded-xl border border-[#d7e3f4] bg-[#f8fbff] px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-[#0b1c33]">{row.feature}</span>
                    <span className="tabular-nums text-[#51627b]">{formatNumber(row.total)}</span>
                  </div>
                ))
              )}
            </div>
          </article>

          <article className="hub-card p-4">
            <h2 className="text-sm font-semibold text-[#0b1c33]">Top Pages</h2>
            <div className="mt-3 space-y-2">
              {topPages.length === 0 ? (
                <p className="text-sm text-[#51627b]">Aucune page trackée.</p>
              ) : (
                topPages.map((row) => (
                  <div
                    key={row.pagePath}
                    className="flex items-center justify-between rounded-xl border border-[#d7e3f4] bg-[#f8fbff] px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-[#0b1c33]">{row.pagePath}</span>
                    <span className="tabular-nums text-[#51627b]">{formatNumber(row.total)}</span>
                  </div>
                ))
              )}
            </div>
          </article>
        </section>

        <section className="hub-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#d7e3f4] bg-[#f8fbff] px-4 py-3">
            <h2 className="text-sm font-semibold text-[#0b1c33]">Live Feed</h2>
            <span className="text-xs text-[#51627b]">
              {formatNumber(events.length)} / {formatNumber(eventsTotal)}
            </span>
          </div>
          <div className="overflow-x-auto p-3">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="text-left text-xs text-[#51627b]">
                  <th className="px-2 py-1">Time</th>
                  <th className="px-2 py-1">Client</th>
                  <th className="px-2 py-1">User</th>
                  <th className="px-2 py-1">Event</th>
                  <th className="px-2 py-1">Page</th>
                  <th className="px-2 py-1">Metadata</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-4 text-[#51627b]">
                      Aucun événement pour ce filtre.
                    </td>
                  </tr>
                ) : (
                  events.map((event) => (
                    <tr key={event.id} className="border-t border-[#edf3fb] align-top">
                      <td className="px-2 py-2 text-xs">{formatDateTime(event.createdAt)}</td>
                      <td className="px-2 py-2">{event.clientId}</td>
                      <td className="px-2 py-2 text-xs text-[#51627b]">{event.userId || "—"}</td>
                      <td className="px-2 py-2">
                        <div className="font-medium text-[#0b1c33]">{event.eventName}</div>
                        <div className="text-xs text-[#51627b]">{event.category || "—"}</div>
                      </td>
                      <td className="px-2 py-2 text-xs">{event.pagePath || "—"}</td>
                      <td className="px-2 py-2 text-xs">
                        <details>
                          <summary className="cursor-pointer text-[#1f5eff]">Voir</summary>
                          <pre className="mt-2 max-w-[420px] overflow-auto rounded-lg border border-[#d7e3f4] bg-[#f8fbff] p-2 text-[11px] text-[#334155]">
                            {JSON.stringify(
                              {
                                metadata: event.metadata,
                                element: event.element,
                                durationMs: event.durationMs,
                                sessionId: event.sessionId,
                              },
                              null,
                              2
                            )}
                          </pre>
                        </details>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-[#d7e3f4] bg-[#f8fbff] px-4 py-3">
            <HubButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void loadMoreEvents()}
              disabled={!hasMoreEvents || loadingMoreEvents}
            >
              {loadingMoreEvents ? "Chargement..." : hasMoreEvents ? "Charger plus" : "Fin de la liste"}
            </HubButton>
          </div>
        </section>
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="hub-card p-4">
      <p className="text-xs text-[#51627b]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-[#0b1c33]">{value}</p>
    </article>
  );
}
