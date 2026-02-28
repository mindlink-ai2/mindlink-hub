"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import SubscriptionGate from "@/components/SubscriptionGate";

type DrilldownType =
  | "leads_today"
  | "leads_week"
  | "treated"
  | "followups_upcoming"
  | "followups_late";

type DashboardStats = {
  leadsToday: number;
  leadsWeek: number;
  traitementRate: number;
  relancesCount: number;
  relancesLate: number;
  unreadMessages: number;
  acceptedConnections30d: number;
  pendingLinkedinInvitations: number;
  responseRate: number;
};

type DrilldownItem = {
  id: string | number;
  source?: "maps" | "linkedin" | string | null;
  FirstName?: string | null;
  LastName?: string | null;
  Name?: string | null;
  Company?: string | null;
  location?: string | null;
  title?: string | null;
  phoneNumber?: string | null;
  website?: string | null;
  traite?: boolean | null;
  created_at?: string | null;
  next_followup_at?: string | null;
};

const EMPTY_STATS: DashboardStats = {
  leadsToday: 0,
  leadsWeek: 0,
  traitementRate: 0,
  relancesCount: 0,
  relancesLate: 0,
  unreadMessages: 0,
  acceptedConnections30d: 0,
  pendingLinkedinInvitations: 0,
  responseRate: 0,
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [loadingStats, setLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [active, setActive] = useState<DrilldownType | null>(null);
  const [items, setItems] = useState<DrilldownItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const drilldownRef = useRef<HTMLDivElement | null>(null);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    setStatsError(null);

    try {
      const res = await fetch("/api/dashboard/stats", {
        method: "GET",
        credentials: "include",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error("DASHBOARD_STATS_HTTP_ERROR:", {
          status: res.status,
          body: data,
        });
        setStatsError("Impossible de charger les statistiques pour le moment.");
        return;
      }

      setStats({
        leadsToday: Number(data?.leadsToday ?? 0),
        leadsWeek: Number(data?.leadsWeek ?? 0),
        traitementRate: Number(data?.traitementRate ?? 0),
        relancesCount: Number(data?.relancesCount ?? 0),
        relancesLate: Number(data?.relancesLate ?? 0),
        unreadMessages: Number(data?.unreadMessages ?? 0),
        acceptedConnections30d: Number(data?.acceptedConnections30d ?? 0),
        pendingLinkedinInvitations: Number(data?.pendingLinkedinInvitations ?? 0),
        responseRate: Number(data?.responseRate ?? 0),
      });
    } catch (err) {
      console.error("DASHBOARD_STATS_LOAD_ERROR:", err);
      setStatsError("Impossible de charger les statistiques pour le moment.");
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    if (!active) return;
    const raf = requestAnimationFrame(() => {
      drilldownRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(raf);
  }, [active]);

  const activeLabel = useMemo(() => {
    switch (active) {
      case "leads_today":
        return "Leads aujourd’hui";
      case "leads_week":
        return "Leads cette semaine";
      case "treated":
        return "Leads traités";
      case "followups_upcoming":
        return "Relances à venir";
      case "followups_late":
        return "Relances en retard";
      default:
        return "";
    }
  }, [active]);

  const loadDrilldown = async (type: DrilldownType) => {
    if (active === type) {
      setActive(null);
      setItems([]);
      setItemsError(null);
      setQ("");
      return;
    }

    setActive(type);
    setLoadingItems(true);
    setItems([]);
    setItemsError(null);
    setQ("");

    try {
      const res = await fetch(`/api/dashboard/drilldown?type=${type}`, {
        method: "GET",
        credentials: "include",
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        setItemsError(txt || "Erreur lors du chargement.");
        return;
      }

      const data = await res.json().catch(() => ({}));
      setItems(Array.isArray(data?.items) ? (data.items as DrilldownItem[]) : []);
    } catch (e) {
      console.error("DASHBOARD_DRILLDOWN_LOAD_ERROR:", e);
      setItemsError("Erreur réseau.");
    } finally {
      setLoadingItems(false);
    }
  };

  const openFromRow = (it: DrilldownItem) => {
    const src = it?.source === "maps" ? "maps" : "linkedin";

    if (active === "followups_upcoming" || active === "followups_late") {
      const url = `/dashboard/followups?open=${encodeURIComponent(
        String(it.id)
      )}&source=${src}`;
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    if (src === "maps") {
      const url = `/dashboard/maps?open=${encodeURIComponent(String(it.id))}`;
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    const url = `/dashboard/leads?open=${encodeURIComponent(String(it.id))}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const isFollowupsView =
    active === "followups_upcoming" || active === "followups_late";

  const filteredItems = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;

    return items.filter((it) => {
      const src = it?.source === "maps" ? "maps" : "linkedin";
      const sourceTxt = src;

      const name =
        src === "maps"
          ? String(it?.title ?? "")
          : String(
              (
                `${it?.FirstName ?? ""} ${it?.LastName ?? ""}`.trim() ||
                it?.Name ||
                ""
              ) ?? ""
            );

      const details =
        src === "maps"
          ? String(it?.phoneNumber || it?.website || "")
          : String(it?.Company || it?.location || "");

      return (
        sourceTxt.includes(term) ||
        name.toLowerCase().includes(term) ||
        details.toLowerCase().includes(term)
      );
    });
  }, [items, q]);

  return (
    <SubscriptionGate supportEmail="contact@lidmeo.com">
      <div className="h-full min-h-0 w-full bg-[linear-gradient(180deg,#f4f8ff_0%,#eef4ff_45%,#f7faff_100%)] px-4 pb-24 pt-8 sm:px-6">
        <div className="mx-auto w-full max-w-7xl space-y-8">
          <section className="relative overflow-hidden rounded-3xl border border-[#d8e4f8] bg-white/90 p-6 shadow-[0_30px_60px_-42px_rgba(22,64,128,0.6)] md:p-8">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute -left-28 -top-24 h-72 w-72 rounded-full bg-[#d9e8ff]/80 blur-3xl" />
              <div className="absolute -right-28 -top-28 h-80 w-80 rounded-full bg-[#d7f1ff]/70 blur-3xl" />
            </div>

            <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[#cbdcf7] bg-[#f7fbff] px-3 py-1 text-xs font-medium text-[#35588a]">
                  <span className="h-2 w-2 rounded-full bg-[#1f5eff]" />
                  Pilotage SaaS
                </div>
                <h1 className="hub-page-title mt-3">
                  Dashboard Lidmeo
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-[#51627b] md:text-base">
                  Suivez vos leads, vos relances et votre messagerie LinkedIn depuis un seul
                  espace.
                </p>
              </div>

              <div className="relative z-[90] flex flex-wrap gap-2.5">
                <Link
                  href="/dashboard/prospection"
                  className="inline-flex items-center justify-center rounded-full border border-[#1f5eff] bg-gradient-to-r from-[#1f5eff] to-[#1254ec] px-5 py-2.5 text-xs font-semibold text-white shadow-[0_14px_30px_-18px_rgba(31,94,255,0.9)] transition hover:-translate-y-[1px] md:text-sm"
                >
                  Prospection
                </Link>
                <Link
                  href="/dashboard/inbox"
                  className="inline-flex items-center justify-center rounded-full border border-[#c8d6ea] bg-[#f5f9ff] px-5 py-2.5 text-xs font-semibold text-[#0b1c33] transition hover:-translate-y-[1px] hover:border-[#afc7eb] hover:bg-[#edf4fd] md:text-sm"
                >
                  Messagerie
                </Link>
                <Link
                  href="/dashboard/followups"
                  className="inline-flex items-center justify-center rounded-full border border-[#c8d6ea] bg-[#f5f9ff] px-5 py-2.5 text-xs font-semibold text-[#0b1c33] transition hover:-translate-y-[1px] hover:border-[#afc7eb] hover:bg-[#edf4fd] md:text-sm"
                >
                  Relances
                </Link>
              </div>
            </div>
          </section>

          {statsError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>{statsError}</span>
                <button
                  type="button"
                  onClick={() => void loadStats()}
                  className="rounded-xl border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50"
                >
                  Réessayer
                </button>
              </div>
            </div>
          ) : null}

          <div className="space-y-8">
            <SectionHeader
              title="Acquisition"
              subtitle="Nouveaux leads et efficacité de traitement"
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <KPI
                label="Leads aujourd’hui"
                value={stats.leadsToday}
                color="from-[#1f5eff] to-[#74a1ff]"
                onClick={() => loadDrilldown("leads_today")}
                active={active === "leads_today"}
                loading={loadingStats}
              />
              <KPI
                label="Leads cette semaine"
                value={stats.leadsWeek}
                color="from-[#3a5f9b] to-[#8eb0df]"
                onClick={() => loadDrilldown("leads_week")}
                active={active === "leads_week"}
                loading={loadingStats}
              />
              <KPI
                label="Taux de traitement"
                value={`${stats.traitementRate}%`}
                color="from-[#2d67cc] to-[#8aa9e8]"
                onClick={() => loadDrilldown("treated")}
                active={active === "treated"}
                loading={loadingStats}
              />
            </div>

            <SectionHeader title="Relances" subtitle="Rythme de suivi commercial" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <KPI
                label="Relances à venir"
                value={stats.relancesCount}
                color="from-[#089682] to-[#46c0ab]"
                onClick={() => loadDrilldown("followups_upcoming")}
                active={active === "followups_upcoming"}
                loading={loadingStats}
              />
              <KPI
                label="Relances en retard"
                value={stats.relancesLate}
                color="from-[#b9742e] to-[#ddaa73]"
                onClick={() => loadDrilldown("followups_late")}
                active={active === "followups_late"}
                loading={loadingStats}
              />
            </div>

            <SectionHeader
              title="Messagerie"
              subtitle="Conversations LinkedIn et engagement des prospects"
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <KPI
                label="Messages non lus"
                value={stats.unreadMessages}
                color="from-[#2a70d5] to-[#85b7ff]"
                clickable={false}
                loading={loadingStats}
              />
              <KPI
                label="Connexions acceptées (30 jours)"
                value={stats.acceptedConnections30d}
                color="from-[#0e9a7a] to-[#7fdac4]"
                clickable={false}
                loading={loadingStats}
              />
              <KPI
                label="Invitations LinkedIn en attente"
                value={stats.pendingLinkedinInvitations}
                color="from-[#5f6f8f] to-[#a6b6d3]"
                clickable={false}
                loading={loadingStats}
              />
              <KPI
                label="Taux de réponse"
                value={`${stats.responseRate}%`}
                color="from-[#7b4ce2] to-[#b89af3]"
                clickable={false}
                loading={loadingStats}
              />
            </div>
          </div>

          {active && (
            <div
              ref={drilldownRef}
              className="overflow-hidden rounded-2xl border border-[#d7e3f4] bg-white shadow-[0_20px_44px_-32px_rgba(14,45,96,0.65)]"
            >
              <div className="flex flex-col gap-3 border-b border-[#d7e3f4] bg-[#f8fbff] px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-[#0b1c33]">{activeLabel}</h2>
                    <span className="rounded-full border border-[#c8d6ea] bg-[#f7fbff] px-2 py-0.5 text-[11px] text-[#51627b]">
                      {loadingItems ? "…" : `${filteredItems.length}`}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-[#51627b]">
                    Re-cliquez sur un KPI pour fermer la vue détaillée.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Rechercher (nom, société, localisation...)"
                    className="w-[280px] max-w-full rounded-xl border border-[#c8d6ea] bg-[#f5f9ff] px-3 py-2 text-[12px] text-[#0b1c33] placeholder:text-[#51627b] outline-none transition focus:border-[#90b5ff] focus:ring-2 focus:ring-[#dce8ff]"
                  />
                  <button
                    onClick={() => {
                      setActive(null);
                      setItems([]);
                      setItemsError(null);
                      setQ("");
                    }}
                    className="rounded-xl border border-[#c8d6ea] bg-[#f5f9ff] px-3 py-2 text-[12px] font-medium text-[#0b1c33] transition hover:bg-[#edf4fd]"
                  >
                    Fermer
                  </button>
                </div>
              </div>

              {loadingItems ? (
                <div className="px-5 py-10 text-sm text-[#51627b]">Chargement...</div>
              ) : itemsError ? (
                <div className="px-5 py-10 text-sm text-red-700">{itemsError}</div>
              ) : filteredItems.length === 0 ? (
                <div className="px-5 py-10 text-sm text-[#51627b]">Aucun élément.</div>
              ) : (
                <div>
                  <div className="hidden overflow-x-auto md:block">
                    {!isFollowupsView ? (
                      <table className="w-full border-separate border-spacing-0 text-sm">
                        <thead>
                          <tr className="bg-[#f8fbff] text-[11px] uppercase tracking-wide text-[#51627b]">
                            <th className="border-b border-[#d7e3f4] px-4 py-3 text-left">Source</th>
                            <th className="border-b border-[#d7e3f4] px-4 py-3 text-left">Nom</th>
                            <th className="border-b border-[#d7e3f4] px-4 py-3 text-left">
                              Informations
                            </th>
                            <th className="border-b border-[#d7e3f4] px-4 py-3 text-center">Traité</th>
                            <th className="border-b border-[#d7e3f4] px-4 py-3 text-center">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredItems.map((it) => {
                            const src = it?.source === "maps" ? "maps" : "linkedin";
                            const sourceLabel = src === "maps" ? "Maps" : "LinkedIn";

                            const name =
                              src === "maps"
                                ? it?.title || "—"
                                : (
                                    `${it?.FirstName ?? ""} ${it?.LastName ?? ""}`.trim() ||
                                    it?.Name ||
                                    "—"
                                  );

                            const details =
                              src === "maps"
                                ? it?.phoneNumber || it?.website || "—"
                                : it?.Company || it?.location || "—";

                            return (
                              <tr
                                key={`${it?.source ?? "x"}-${it?.id}`}
                                onClick={() => openFromRow(it)}
                                className="cursor-pointer border-b border-[#e4edf8] transition hover:bg-[#f8fbff]"
                              >
                                <td className="px-4 py-3 text-[#51627b]">
                                  <SourceBadge value={sourceLabel} variant={src} />
                                </td>
                                <td className="px-4 py-3 text-[#0b1c33]">
                                  {name}
                                  <div className="mt-0.5 text-[11px] text-[#51627b]">Ouvrir →</div>
                                </td>
                                <td className="px-4 py-3 text-[#51627b]">{details}</td>
                                <td className="px-4 py-3 text-center text-[#51627b]">
                                  {it?.traite ? "Oui" : "Non"}
                                </td>
                                <td className="px-4 py-3 text-center text-[#51627b]">
                                  {it?.created_at
                                    ? new Date(it.created_at).toLocaleDateString("fr-FR")
                                    : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <table className="w-full border-separate border-spacing-0 text-sm">
                        <thead>
                          <tr className="bg-[#f8fbff] text-[11px] uppercase tracking-wide text-[#51627b]">
                            <th className="border-b border-[#d7e3f4] px-4 py-3 text-left">Source</th>
                            <th className="border-b border-[#d7e3f4] px-4 py-3 text-left">Nom</th>
                            <th className="border-b border-[#d7e3f4] px-4 py-3 text-left">
                              Informations
                            </th>
                            <th className="border-b border-[#d7e3f4] px-4 py-3 text-center">
                              Prochaine relance
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredItems.map((it) => {
                            const src = it?.source === "maps" ? "maps" : "linkedin";
                            const sourceLabel = src === "maps" ? "Maps" : "LinkedIn";

                            const name =
                              src === "maps"
                                ? it?.title || "—"
                                : (
                                    `${it?.FirstName ?? ""} ${it?.LastName ?? ""}`.trim() ||
                                    it?.Name ||
                                    "—"
                                  );

                            const details =
                              src === "maps"
                                ? it?.phoneNumber || it?.website || "—"
                                : it?.Company || it?.location || "—";

                            return (
                              <tr
                                key={`${it?.source ?? "x"}-${it?.id}`}
                                onClick={() => openFromRow(it)}
                                className="cursor-pointer border-b border-[#e4edf8] transition hover:bg-[#f8fbff]"
                              >
                                <td className="px-4 py-3 text-[#51627b]">
                                  <SourceBadge value={sourceLabel} variant={src} />
                                </td>
                                <td className="px-4 py-3 text-[#0b1c33]">
                                  {name}
                                  <div className="mt-0.5 text-[11px] text-[#51627b]">Ouvrir →</div>
                                </td>
                                <td className="px-4 py-3 text-[#51627b]">{details}</td>
                                <td className="px-4 py-3 text-center text-[#51627b]">
                                  {it?.next_followup_at
                                    ? new Date(it.next_followup_at).toLocaleDateString("fr-FR")
                                    : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div className="space-y-2 p-3 md:hidden">
                    {filteredItems.map((it) => {
                      const src = it?.source === "maps" ? "maps" : "linkedin";
                      const sourceLabel = src === "maps" ? "Maps" : "LinkedIn";
                      const name =
                        src === "maps"
                          ? it?.title || "—"
                          : (`${it?.FirstName ?? ""} ${it?.LastName ?? ""}`.trim() || it?.Name || "—");
                      const details =
                        src === "maps"
                          ? it?.phoneNumber || it?.website || "—"
                          : it?.Company || it?.location || "—";

                      return (
                        <button
                          key={`${it?.source ?? "x"}-${it?.id}-mobile`}
                          type="button"
                          onClick={() => openFromRow(it)}
                          className="w-full rounded-xl border border-[#d7e3f4] bg-white px-3 py-2 text-left shadow-[0_10px_18px_-18px_rgba(18,43,86,0.68)] transition hover:bg-[#f9fbff] focus:outline-none focus:ring-2 focus:ring-[#dce8ff]"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <SourceBadge value={sourceLabel} variant={src} />
                                <p className="truncate text-[13px] font-medium text-[#0b1c33]">{name}</p>
                              </div>
                              <p className="mt-1 truncate text-[12px] text-[#51627b]">{details}</p>
                              <p className="mt-1 text-[11px] text-[#8093ad]">
                                {isFollowupsView
                                  ? `Relance: ${
                                      it?.next_followup_at
                                        ? new Date(it.next_followup_at).toLocaleDateString("fr-FR")
                                        : "—"
                                    }`
                                  : `Créé le ${
                                      it?.created_at
                                        ? new Date(it.created_at).toLocaleDateString("fr-FR")
                                        : "—"
                                    }`}
                              </p>
                            </div>
                            <span className="text-[12px] text-[#7a8fa9]">Ouvrir</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </SubscriptionGate>
  );
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <p className="text-base font-semibold text-[#0b1c33]">{title}</p>
        <p className="mt-0.5 text-[12px] text-[#51627b]">{subtitle}</p>
      </div>
      <div className="h-px flex-1 bg-[#d7e3f4]" />
    </div>
  );
}

function KPI({
  label,
  value,
  color,
  onClick,
  clickable = true,
  active = false,
  loading = false,
}: {
  label: string;
  value: string | number;
  color: string;
  onClick?: () => void;
  clickable?: boolean;
  active?: boolean;
  loading?: boolean;
}) {
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : -1}
      onClick={clickable ? onClick : undefined}
      onKeyDown={(e) => {
        if (!clickable) return;
        if (e.key === "Enter" || e.key === " ") onClick?.();
      }}
      className={[
        "relative overflow-hidden rounded-2xl border p-5 transition-all duration-200",
        "border-[#d7e3f4] bg-white shadow-[0_16px_30px_-24px_rgba(14,45,96,0.55)]",
        clickable
          ? "cursor-pointer hover:-translate-y-0.5 hover:border-[#bcd1f1]"
          : "cursor-default",
        active ? "border-[#8fb5ff] ring-2 ring-[#dce8ff]" : "",
      ].join(" ")}
    >
      <div className={`absolute inset-0 opacity-[0.14] bg-gradient-to-br ${color}`} />
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm text-[#51627b]">{label}</div>
          <span className="rounded-full border border-[#d7e3f4] bg-[#f8fbff] px-2 py-0.5 text-[11px] text-[#51627b]">
            {clickable ? (active ? "Ouvert" : "Détails") : "Info"}
          </span>
        </div>

        <div className="hub-kpi-number mt-3 text-4xl">
          {loading ? <span className="opacity-50">—</span> : value}
        </div>

        <div className="mt-2 text-[12px] text-[#51627b]">
          {clickable ? "Cliquez pour afficher la liste." : "Indicateur global en temps réel."}
        </div>
      </div>
    </div>
  );
}

function SourceBadge({
  value,
  variant,
}: {
  value: string;
  variant: "maps" | "linkedin";
}) {
  const cls =
    variant === "maps"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-[#d7e3f4] bg-[#ecf3ff] text-[#36598a]";

  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] ${cls}`}>{value}</span>;
}
