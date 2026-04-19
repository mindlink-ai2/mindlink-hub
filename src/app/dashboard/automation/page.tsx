"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ExternalLink, Search, X } from "lucide-react";
import SubscriptionGate from "@/components/SubscriptionGate";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { useDebounce } from "@/hooks/useDebounce";
import { queryKeys } from "@/lib/query-keys";
import {
  getProspectionStatusClasses,
  getProspectionStatusDotClass,
  getProspectionStatusKey,
  getProspectionStatusLabel,
  type ProspectionStatusKey,
} from "@/lib/prospection-status";

// ─── Types ────────────────────────────────────────────────────────────────────

type Lead = {
  id: number | string;
  Name?: string | null;
  FirstName?: string | null;
  LastName?: string | null;
  Company?: string | null;
  linkedinJobTitle?: string | null;
  LinkedInURL?: string | null;
  created_at?: string | null;
  traite?: boolean | null;
  message_sent?: boolean | null;
  message_sent_at?: string | null;
  linkedin_invitation_status?: "sent" | "accepted" | null;
  linkedin_invitation_sent?: boolean | null;
};

type EnrichedLead = Lead & {
  _status: ProspectionStatusKey;
  _statusTimestamp: string | null;
};

type DateFilterKey = "all" | "today" | "7d" | "30d";
type StatusFilterKey = ProspectionStatusKey | "all";

type Stats = {
  total: number;
  todo: number;
  pending: number;
  connected: number;
  sent: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return "à l'instant";
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "hier";
  return `il y a ${diffD}j`;
}

function getStatusTimestamp(lead: Lead): string | null {
  const status = getProspectionStatusKey(lead);
  if (status === "sent" && lead.message_sent_at) return lead.message_sent_at;
  return lead.created_at ?? null;
}

function leadDisplayName(lead: Lead): string {
  return (
    `${lead.FirstName ?? ""} ${lead.LastName ?? ""}`.trim() || lead.Name || "—"
  );
}

function cutoffMs(filter: DateFilterKey): number {
  const now = Date.now();
  if (filter === "today") return now - 86_400_000;
  if (filter === "7d") return now - 7 * 86_400_000;
  if (filter === "30d") return now - 30 * 86_400_000;
  return 0;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RelativeTime({ timestamp }: { timestamp: string | null }) {
  // Tick every 30s to force re-render; relativeTime() is called during render
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const id = setInterval(() => forceUpdate((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  return <span>{relativeTime(timestamp)}</span>;
}

function StatusBadge({
  status,
  timestamp,
}: {
  status: ProspectionStatusKey;
  timestamp: string | null;
}) {
  const classes = getProspectionStatusClasses(status, "table");
  const dotClass = getProspectionStatusDotClass(status);
  const label = getProspectionStatusLabel(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium ${classes}`}
    >
      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${dotClass}`} />
      {label}
      {timestamp && (
        <>
          <span className="opacity-40">·</span>
          <RelativeTime timestamp={timestamp} />
        </>
      )}
    </span>
  );
}

const STATUS_OPTIONS: { key: StatusFilterKey; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "todo", label: "À faire" },
  { key: "pending", label: "En attente" },
  { key: "connected", label: "Connecté" },
  { key: "sent", label: "Message envoyé" },
];

const DATE_OPTIONS: { key: DateFilterKey; label: string }[] = [
  { key: "all", label: "Toutes dates" },
  { key: "today", label: "Aujourd'hui" },
  { key: "7d", label: "7 derniers jours" },
  { key: "30d", label: "30 derniers jours" },
];

const PER_PAGE_OPTIONS = [10, 25, 50];

// ─── Stats Cards ──────────────────────────────────────────────────────────────

function StatsCards({
  stats,
  loading,
  activeStatus,
  onStatusClick,
}: {
  stats: Stats;
  loading: boolean;
  activeStatus: StatusFilterKey;
  onStatusClick: (s: StatusFilterKey) => void;
}) {
  const cards: {
    key: StatusFilterKey;
    label: string;
    value: number;
    color: string;
    dotClass: string;
  }[] = [
    {
      key: "all",
      label: "Total prospects",
      value: stats.total,
      color: "from-[#1f5eff] to-[#74a1ff]",
      dotClass: "bg-[#1f5eff]",
    },
    {
      key: "todo",
      label: "À faire",
      value: stats.todo,
      color: "from-[#4b6ea8] to-[#8eaddd]",
      dotClass: "bg-[#6f85a6]",
    },
    {
      key: "pending",
      label: "En attente",
      value: stats.pending,
      color: "from-[#d97706] to-[#fbbf24]",
      dotClass: "bg-amber-500",
    },
    {
      key: "connected",
      label: "Connectés",
      value: stats.connected,
      color: "from-[#059669] to-[#34d399]",
      dotClass: "bg-emerald-500",
    },
    {
      key: "sent",
      label: "Message envoyé",
      value: stats.sent,
      color: "from-[#7c3aed] to-[#a78bfa]",
      dotClass: "bg-violet-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => {
        const isActive = activeStatus === card.key;
        return (
          <button
            key={card.key}
            type="button"
            onClick={() => onStatusClick(card.key)}
            className={[
              "relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200",
              "border-[#d7e3f4] bg-white shadow-[0_12px_24px_-18px_rgba(14,45,96,0.45)]",
              "hover:-translate-y-0.5 hover:border-[#bcd1f1]",
              isActive ? "border-[#8fb5ff] ring-2 ring-[#dce8ff]" : "",
            ].join(" ")}
          >
            <div
              className={`absolute inset-0 bg-gradient-to-br opacity-[0.12] ${card.color}`}
            />
            <div className="relative z-10">
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 flex-shrink-0 rounded-full ${card.dotClass}`} />
                <span className="truncate text-[11px] font-medium text-[#51627b]">
                  {card.label}
                </span>
              </div>
              <div className="mt-2 text-3xl font-bold tracking-tight text-[#0b1c33]">
                {loading ? <span className="opacity-40">—</span> : card.value}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Pagination ───────────────────��───────────────────────────────────────────

function Pagination({
  page,
  totalPages,
  total,
  perPage,
  onPage,
  onPerPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  perPage: number;
  onPage: (p: number) => void;
  onPerPage: (n: number) => void;
}) {
  const start = total === 0 ? 0 : (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, total);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-[#d7e3f4] px-4 py-3 sm:flex-row">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#51627b]">
        <span>
          {start}–{end} sur {total}
        </span>
        <span className="text-[#c0d0e4]">|</span>
        <span>Lignes par page :</span>
        {PER_PAGE_OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => { onPerPage(n); onPage(1); }}
            className={[
              "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition",
              perPage === n
                ? "border-[#1f5eff] bg-[#edf4ff] text-[#1f5eff]"
                : "border-[#d7e3f4] bg-white text-[#51627b] hover:border-[#bcd1f1]",
            ].join(" ")}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="rounded-lg border border-[#d7e3f4] bg-white p-1.5 text-[#51627b] transition hover:border-[#bcd1f1] disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-3 text-[12px] text-[#51627b]">
          Page {page} / {Math.max(1, totalPages)}
        </span>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          className="rounded-lg border border-[#d7e3f4] bg-white p-1.5 text-[#51627b] transition hover:border-[#bcd1f1] disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FullDashboardPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>("all");
  const [dateFilter, setDateFilter] = useState<DateFilterKey>("all");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  // Debounce la recherche pour éviter un re-filter à chaque frappe
  const debouncedSearch = useDebounce(searchTerm, 300);

  // Données mises en cache — partagées avec la page Leads si déjà chargées
  const { data: queryData, isLoading: loading, isError } = useQuery({
    queryKey: queryKeys.leads(),
    queryFn: async () => {
      const res = await fetch("/api/get-leads", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ leads: Lead[] }>;
    },
  });

  const error = isError ? "Impossible de charger les prospects." : null;

  const enrichedLeads = useMemo<EnrichedLead[]>(
    () =>
      (queryData?.leads ?? []).map((lead: Lead) => ({
        ...lead,
        _status: getProspectionStatusKey(lead),
        _statusTimestamp: getStatusTimestamp(lead),
      })),
    [queryData]
  );

  const stats = useMemo<Stats>(
    () => ({
      total: enrichedLeads.length,
      todo: enrichedLeads.filter((l) => l._status === "todo").length,
      pending: enrichedLeads.filter((l) => l._status === "pending").length,
      connected: enrichedLeads.filter((l) => l._status === "connected").length,
      sent: enrichedLeads.filter((l) => l._status === "sent").length,
    }),
    [enrichedLeads]
  );

  const filtered = useMemo<EnrichedLead[]>(() => {
    let result = enrichedLeads;

    if (debouncedSearch.trim()) {
      const term = debouncedSearch.trim().toLowerCase();
      result = result.filter((l) => {
        const name = leadDisplayName(l).toLowerCase();
        return (
          name.includes(term) ||
          (l.Company ?? "").toLowerCase().includes(term) ||
          (l.linkedinJobTitle ?? "").toLowerCase().includes(term)
        );
      });
    }

    if (statusFilter !== "all") {
      result = result.filter((l) => l._status === statusFilter);
    }

    if (dateFilter !== "all") {
      const cutoff = cutoffMs(dateFilter);
      result = result.filter((l) => {
        const ts = l.created_at ? new Date(l.created_at).getTime() : 0;
        return ts >= cutoff;
      });
    }

    return result;
  }, [enrichedLeads, debouncedSearch, statusFilter, dateFilter]);

  // page is reset to 1 directly in the filter handlers (see setSearchTerm, handleStatusClick, setDateFilter, setPerPage usages below)

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  const handleStatusClick = (s: StatusFilterKey) => {
    setStatusFilter((prev) => (prev === s ? "all" : s));
    setPage(1);
  };

  return (
    <SubscriptionGate supportEmail="contact@lidmeo.com">
      <div className="h-full min-h-0 w-full overflow-y-auto bg-[linear-gradient(180deg,#f4f8ff_0%,#eef4ff_45%,#f7faff_100%)] px-4 pb-24 pt-8 sm:px-6">
        <div className="mx-auto w-full max-w-7xl space-y-6">

          {/* ── Header ── */}
          <section className="relative overflow-hidden rounded-3xl border border-[#d8e4f8] bg-white/90 p-6 shadow-[0_30px_60px_-42px_rgba(22,64,128,0.6)] md:p-8">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute -left-28 -top-24 h-72 w-72 rounded-full bg-[#d9e8ff]/80 blur-3xl" />
              <div className="absolute -right-28 -top-28 h-80 w-80 rounded-full bg-[#d7f1ff]/70 blur-3xl" />
            </div>
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#cbdcf7] bg-[#f7fbff] px-3 py-1 text-xs font-medium text-[#35588a]">
                <span className="h-2 w-2 rounded-full bg-[#1f5eff]" />
                Plan Full
              </div>
              <h1 className="hub-page-title mt-3">Dashboard Prospects</h1>
              <p className="mt-2 max-w-2xl text-sm text-[#51627b] md:text-base">
                Vue d&apos;ensemble de tous vos prospects LinkedIn avec statuts en temps réel.
              </p>
            </div>
          </section>

          {/* ── KPI Cards ── */}
          <StatsCards
            stats={stats}
            loading={loading}
            activeStatus={statusFilter}
            onStatusClick={handleStatusClick}
          />

          {/* ── Table section ── */}
          <div className="overflow-hidden rounded-2xl border border-[#d7e3f4] bg-white shadow-[0_20px_44px_-32px_rgba(14,45,96,0.65)]">

            {/* Filter bar */}
            <div className="flex flex-col gap-3 border-b border-[#d7e3f4] bg-[#f8fbff] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              {/* Search */}
              <div className="relative w-full max-w-sm flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8093ad]" />
                <input
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                  placeholder="Rechercher (nom, entreprise, poste…)"
                  className="w-full rounded-xl border border-[#c8d6ea] bg-white py-2 pl-9 pr-8 text-[13px] text-[#0b1c33] placeholder:text-[#8093ad] outline-none transition focus:border-[#90b5ff] focus:ring-2 focus:ring-[#dce8ff]"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => { setSearchTerm(""); setPage(1); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8093ad] hover:text-[#51627b]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Date filters */}
              <div className="flex flex-wrap items-center gap-1.5">
                {DATE_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setDateFilter((prev) => (prev === opt.key ? "all" : opt.key));
                      setPage(1);
                    }}
                    className={[
                      "rounded-lg border px-3 py-1.5 text-[12px] font-medium transition",
                      dateFilter === opt.key
                        ? "border-[#1f5eff] bg-[#edf4ff] text-[#1f5eff]"
                        : "border-[#d7e3f4] bg-white text-[#51627b] hover:border-[#bcd1f1] hover:bg-[#f5f9ff]",
                    ].join(" ")}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Status filter chips */}
            <div className="flex flex-wrap items-center gap-2 border-b border-[#d7e3f4] px-4 py-3">
              {STATUS_OPTIONS.map((opt) => {
                const isActive = statusFilter === opt.key;
                let chipCls =
                  "border-[#d7e3f4] bg-white text-[#51627b] hover:border-[#bcd1f1]";
                if (isActive) {
                  if (opt.key === "all")
                    chipCls = "border-[#1f5eff] bg-[#edf4ff] text-[#1f5eff]";
                  else if (opt.key === "todo")
                    chipCls = "border-[#9cc0ff] bg-[#edf4ff] text-[#1f4f96]";
                  else if (opt.key === "pending")
                    chipCls = "border-amber-300 bg-amber-50 text-amber-700";
                  else if (opt.key === "connected")
                    chipCls = "border-emerald-300 bg-emerald-50 text-emerald-700";
                  else if (opt.key === "sent")
                    chipCls = "border-violet-300 bg-violet-50 text-violet-700";
                }

                const count =
                  opt.key === "todo"
                    ? stats.todo
                    : opt.key === "pending"
                    ? stats.pending
                    : opt.key === "connected"
                    ? stats.connected
                    : opt.key === "sent"
                    ? stats.sent
                    : null;

                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => handleStatusClick(opt.key)}
                    className={`rounded-full border px-3 py-1 text-[12px] font-medium transition ${chipCls}`}
                  >
                    {opt.label}
                    {count !== null && (
                      <span className="ml-1.5 opacity-60">{count}</span>
                    )}
                  </button>
                );
              })}

              {filtered.length !== enrichedLeads.length && (
                <span className="ml-auto rounded-full border border-[#d7e3f4] bg-[#f5f9ff] px-3 py-1 text-[12px] text-[#51627b]">
                  {filtered.length} résultat{filtered.length > 1 ? "s" : ""}
                </span>
              )}
            </div>

            {/* Table */}
            {loading ? (
              <SkeletonTable
                rows={10}
                headers={["Prénom / Nom", "Entreprise", "Poste", "Statut", "LinkedIn"]}
              />
            ) : error ? (
              <div className="px-5 py-14 text-center text-sm text-red-600">
                {error}
              </div>
            ) : paginated.length === 0 ? (
              <div className="px-5 py-14 text-center text-sm text-[#51627b]">
                Aucun prospect ne correspond aux filtres sélectionnés.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="bg-[#f8fbff] text-[11px] uppercase tracking-wide text-[#51627b]">
                      <th className="border-b border-[#d7e3f4] px-4 py-3 text-left">
                        Prénom / Nom
                      </th>
                      <th className="border-b border-[#d7e3f4] px-4 py-3 text-left">
                        Entreprise
                      </th>
                      <th className="border-b border-[#d7e3f4] px-4 py-3 text-left">
                        Poste
                      </th>
                      <th className="border-b border-[#d7e3f4] px-4 py-3 text-left">
                        Statut
                      </th>
                      <th className="border-b border-[#d7e3f4] px-4 py-3 text-left">
                        LinkedIn
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((lead) => (
                      <tr
                        key={String(lead.id)}
                        className="border-b border-[#e4edf8] transition hover:bg-[#f8fbff]"
                      >
                        <td className="px-4 py-3 font-medium text-[#0b1c33]">
                          {leadDisplayName(lead)}
                        </td>
                        <td className="px-4 py-3 text-[#51627b]">
                          {lead.Company || "—"}
                        </td>
                        <td className="max-w-[200px] px-4 py-3 text-[#51627b]">
                          <span className="block truncate">
                            {lead.linkedinJobTitle || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            status={lead._status}
                            timestamp={lead._statusTimestamp}
                          />
                        </td>
                        <td className="px-4 py-3">
                          {lead.LinkedInURL ? (
                            <a
                              href={lead.LinkedInURL}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-[#d7e3f4] bg-[#f5f9ff] px-2.5 py-1 text-[12px] font-medium text-[#36598a] transition hover:border-[#bcd1f1] hover:bg-[#edf4fd]"
                            >
                              LinkedIn
                              <ExternalLink className="h-3 w-3 opacity-60" />
                            </a>
                          ) : (
                            <span className="text-[#8093ad]">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {!loading && !error && filtered.length > 0 && (
              <Pagination
                page={page}
                totalPages={totalPages}
                total={filtered.length}
                perPage={perPage}
                onPage={setPage}
                onPerPage={setPerPage}
              />
            )}
          </div>
        </div>
      </div>
    </SubscriptionGate>
  );
}
