"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import SubscriptionGate from "@/components/SubscriptionGate";

type DrilldownType =
  | "leads_today"
  | "leads_week"
  | "treated"
  | "followups_upcoming"
  | "followups_late";

export default function DashboardPage() {
  const [stats, setStats] = useState({
    leadsToday: 0,
    leadsWeek: 0,
    traitementRate: 0,
    emailsSortedToday: 0,
    emailsSortedTotal: 0,
    relancesCount: 0,
    relancesLate: 0,
    mindlinkScore: 0,
  });

  const [loadingStats, setLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  // ✅ drilldown state
  const [active, setActive] = useState<DrilldownType | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);

  // ✅ UX: quick search inside drilldown (client-side only)
  const [q, setQ] = useState("");

  useEffect(() => {
    async function loadStats() {
      setLoadingStats(true);
      setStatsError(null);

      try {
        const res = await fetch("/api/dashboard/stats", {
          method: "GET",
          credentials: "include",
        });

        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          setStatsError(txt || "Erreur lors du chargement des statistiques.");
          setLoadingStats(false);
          return;
        }

        const data = await res.json();
        setStats(data);
      } catch (err) {
        console.error("❌ Erreur fetch stats:", err);
        setStatsError("Erreur réseau.");
      } finally {
        setLoadingStats(false);
      }
    }

    loadStats();
  }, []);

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
    // toggle close if same kpi clicked
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
        setLoadingItems(false);
        return;
      }

      const data = await res.json().catch(() => ({}));
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      console.error(e);
      setItemsError("Erreur réseau.");
    } finally {
      setLoadingItems(false);
    }
  };

  /* --------------------------------------------
      ✅ open row -> open correct page + sidebar
  -------------------------------------------- */
  const openFromRow = (it: any) => {
    const src = it?.source === "maps" ? "maps" : "linkedin";

    // Relances: open followups page + sidebar
    if (active === "followups_upcoming" || active === "followups_late") {
      const url = `/dashboard/followups?open=${encodeURIComponent(
        String(it.id)
      )}&source=${src}`;
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    // Leads: open correct source page + sidebar
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

      const contact =
        src === "maps"
          ? String(it?.email || it?.phoneNumber || it?.website || "")
          : String(it?.Company || it?.location || "");

      return (
        sourceTxt.includes(term) ||
        name.toLowerCase().includes(term) ||
        contact.toLowerCase().includes(term)
      );
    });
  }, [items, q]);

  return (
    <SubscriptionGate supportEmail="contact@lidmeo.com">
      <div className="min-h-screen w-full px-6 pt-20 pb-32">
        <div className="mx-auto w-full max-w-6xl">
          {/* HEADER */}
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-10">
            <div>
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-cyan-300 to-indigo-400 bg-clip-text text-transparent">
                Tableau de bord
              </h1>
              <p className="text-slate-400 text-base md:text-lg mt-2">
                Vue d’ensemble de votre activité Lidmeo : leads, emails et relances.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard/prospection"
                className="rounded-xl bg-sky-500 px-4 py-2 text-xs md:text-sm font-medium text-slate-950 hover:bg-sky-400 transition shadow-lg shadow-sky-500/25"
              >
                Ouvrir Prospection
              </Link>
              <Link
                href="/dashboard/followups"
                className="rounded-xl border border-slate-700 bg-slate-900/40 px-4 py-2 text-xs md:text-sm font-medium text-slate-200 hover:bg-slate-900 transition"
              >
                Ouvrir Relances
              </Link>
            </div>
          </div>

          {/* STATS ERROR / LOADING */}
          {statsError ? (
            <div className="mb-8 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {statsError}
            </div>
          ) : null}

          {/* KPI SECTIONS */}
          <div className="space-y-10">
            {/* Acquisition */}
            <SectionHeader
              title="Acquisition"
              subtitle="Leads générés et traitement"
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <KPI
                label="Leads aujourd’hui"
                value={stats.leadsToday}
                color="from-blue-500 to-cyan-400"
                onClick={() => loadDrilldown("leads_today")}
                active={active === "leads_today"}
                loading={loadingStats}
              />
              <KPI
                label="Leads cette semaine"
                value={stats.leadsWeek}
                color="from-emerald-500 to-green-400"
                onClick={() => loadDrilldown("leads_week")}
                active={active === "leads_week"}
                loading={loadingStats}
              />
              <KPI
                label="Taux de traitement"
                value={`${stats.traitementRate}%`}
                color="from-purple-500 to-fuchsia-400"
                onClick={() => loadDrilldown("treated")}
                active={active === "treated"}
                loading={loadingStats}
              />
            </div>

            {/* Emails */}
            <SectionHeader title="Emails" subtitle="Tri et charge allégée" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <KPI
                label="Emails triés aujourd’hui"
                value={stats.emailsSortedToday}
                color="from-indigo-500 to-blue-400"
                clickable={false}
                loading={loadingStats}
              />
              <KPI
                label="Emails triés au total"
                value={stats.emailsSortedTotal}
                color="from-sky-500 to-blue-300"
                clickable={false}
                loading={loadingStats}
              />
            </div>

            {/* Relances */}
            <SectionHeader title="Relances" subtitle="À venir et en retard" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <KPI
                label="Relances à venir"
                value={stats.relancesCount}
                color="from-yellow-500 to-orange-400"
                onClick={() => loadDrilldown("followups_upcoming")}
                active={active === "followups_upcoming"}
                loading={loadingStats}
              />
              <KPI
                label="Relances en retard"
                value={stats.relancesLate}
                color="from-red-500 to-rose-500"
                onClick={() => loadDrilldown("followups_late")}
                active={active === "followups_late"}
                loading={loadingStats}
              />
            </div>
          </div>

          {/* ✅ DRILLDOWN LIST */}
          {active && (
            <div className="mt-10 rounded-2xl border border-slate-800 bg-slate-950/90 shadow-xl overflow-hidden">
              {/* sticky header */}
              <div className="px-6 py-4 border-b border-slate-800 flex flex-col gap-3 md:flex-row md:items-center md:justify-between bg-slate-950/80">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-slate-100 text-sm font-semibold">
                      {activeLabel}
                    </h2>
                    <span className="text-[11px] px-2 py-0.5 rounded-full border border-slate-700 bg-slate-900/60 text-slate-200">
                      {loadingItems ? "…" : `${filteredItems.length}`}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Astuce : re-cliquez sur le KPI pour fermer. Cliquez sur une ligne pour ouvrir le détail.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Rechercher (nom, société, email…)"
                      className="w-[260px] max-w-full rounded-xl bg-slate-900/60 border border-slate-700 px-3 py-2 text-[12px] text-slate-200 placeholder:text-slate-500 outline-none focus:border-sky-500/60"
                    />
                  </div>

                  <button
                    onClick={() => {
                      setActive(null);
                      setItems([]);
                      setItemsError(null);
                      setQ("");
                    }}
                    className="text-[12px] px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 transition text-slate-200"
                  >
                    Fermer
                  </button>
                </div>
              </div>

              {loadingItems ? (
                <div className="px-6 py-10 text-sm text-slate-400">
                  Chargement…
                </div>
              ) : itemsError ? (
                <div className="px-6 py-10 text-sm text-red-300">
                  {itemsError}
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="px-6 py-10 text-sm text-slate-500">
                  Aucun élément.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  {!isFollowupsView ? (
                    <table className="w-full text-sm border-separate border-spacing-0">
                      <thead>
                        <tr className="bg-slate-900 text-slate-300 text-[11px] uppercase tracking-wide">
                          <th className="py-3 px-4 border-b border-slate-800 text-left">
                            Source
                          </th>
                          <th className="py-3 px-4 border-b border-slate-800 text-left">
                            Nom
                          </th>
                          <th className="py-3 px-4 border-b border-slate-800 text-left">
                            Contact
                          </th>
                          <th className="py-3 px-4 border-b border-slate-800 text-center">
                            Traité
                          </th>
                          <th className="py-3 px-4 border-b border-slate-800 text-center">
                            Date
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

                          const contact =
                            src === "maps"
                              ? it?.email || it?.phoneNumber || it?.website || "—"
                              : it?.Company || it?.location || "—";

                          return (
                            <tr
                              key={`${it?.source ?? "x"}-${it?.id}`}
                              onClick={() => openFromRow(it)}
                              className="border-b border-slate-900 hover:bg-slate-900/60 transition cursor-pointer"
                            >
                              <td className="py-3 px-4 text-slate-300">
                                <SourceBadge value={sourceLabel} variant={src} />
                              </td>
                              <td className="py-3 px-4 text-slate-50">
                                {name}
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  Ouvrir →
                                </div>
                              </td>
                              <td className="py-3 px-4 text-slate-300">
                                {contact}
                              </td>
                              <td className="py-3 px-4 text-center text-slate-300">
                                {it?.traite ? "Oui" : "Non"}
                              </td>
                              <td className="py-3 px-4 text-center text-slate-400">
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
                    <table className="w-full text-sm border-separate border-spacing-0">
                      <thead>
                        <tr className="bg-slate-900 text-slate-300 text-[11px] uppercase tracking-wide">
                          <th className="py-3 px-4 border-b border-slate-800 text-left">
                            Source
                          </th>
                          <th className="py-3 px-4 border-b border-slate-800 text-left">
                            Nom
                          </th>
                          <th className="py-3 px-4 border-b border-slate-800 text-left">
                            Contact
                          </th>
                          <th className="py-3 px-4 border-b border-slate-800 text-center">
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

                          const contact =
                            src === "maps"
                              ? it?.email || it?.phoneNumber || it?.website || "—"
                              : it?.Company || it?.location || "—";

                          return (
                            <tr
                              key={`${it?.source ?? "x"}-${it?.id}`}
                              onClick={() => openFromRow(it)}
                              className="border-b border-slate-900 hover:bg-slate-900/60 transition cursor-pointer"
                            >
                              <td className="py-3 px-4 text-slate-300">
                                <SourceBadge value={sourceLabel} variant={src} />
                              </td>
                              <td className="py-3 px-4 text-slate-50">
                                {name}
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  Ouvrir →
                                </div>
                              </td>
                              <td className="py-3 px-4 text-slate-300">
                                {contact}
                              </td>
                              <td className="py-3 px-4 text-center text-slate-400">
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
              )}
            </div>
          )}
        </div>
      </div>
    </SubscriptionGate>
  );
}

/* ------------------------- */
/* UI building blocks        */
/* ------------------------- */

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
        <p className="text-slate-100 font-semibold">{title}</p>
        <p className="text-[12px] text-slate-500 mt-0.5">{subtitle}</p>
      </div>
      <div className="h-px flex-1 bg-slate-800/70" />
    </div>
  );
}

/* ------------------------- */
/* KPI component             */
/* ------------------------- */

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
  value: any;
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
        "rounded-2xl border p-6 shadow-xl shadow-black/40 relative overflow-hidden transition-all duration-200",
        "bg-[#0B0E13] border-slate-800",
        clickable ? "cursor-pointer hover:border-slate-700 hover:bg-slate-950/40" : "opacity-80 cursor-default",
        active ? "ring-2 ring-indigo-500/35 border-indigo-500/30" : "",
      ].join(" ")}
    >
      <div className={`absolute inset-0 opacity-20 bg-gradient-to-br ${color}`} />
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div className="text-slate-300 text-sm">{label}</div>
          {clickable ? (
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-slate-700 bg-slate-900/60 text-slate-200">
              {active ? "Ouvert" : "Détails"}
            </span>
          ) : (
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-slate-800 bg-slate-900/40 text-slate-400">
              Info
            </span>
          )}
        </div>

        <div className="mt-3 text-4xl font-extrabold text-white">
          {loading ? <span className="opacity-50">—</span> : value}
        </div>

        {clickable ? (
          <div className="mt-3 text-[12px] text-slate-400">
            Cliquez pour afficher la liste.
          </div>
        ) : (
          <div className="mt-3 text-[12px] text-slate-500">
            Statistique informative.
          </div>
        )}
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
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : "border-sky-500/30 bg-sky-500/10 text-sky-200";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] ${cls}`}>
      {value}
    </span>
  );
}