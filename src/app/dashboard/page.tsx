"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

  // ✅ scroll target for drilldown
  const drilldownRef = useRef<HTMLDivElement | null>(null);

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

  // ✅ UX: when drilldown opens, scroll to it
  useEffect(() => {
    if (!active) return;

    // Wait for the drilldown block to render
    const raf = requestAnimationFrame(() => {
      drilldownRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
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
      <div className="min-h-screen w-full px-4 sm:px-6 pt-10 pb-24">
        <div className="mx-auto w-full max-w-7xl">
          {/* HEADER */}
          <div className="mb-10 rounded-[28px] border border-[#e3e7ef] bg-white/95 p-6 shadow-sm backdrop-blur-sm md:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[#e3e7ef] bg-[#fbfcfe] px-3 py-1 text-[11px] font-medium text-[#667085]">
                  <span className="h-2 w-2 rounded-full bg-[#3b6ff6]" />
                  Hub de pilotage
                </div>

                <h1 className="mt-3 text-4xl md:text-5xl font-extrabold tracking-tight text-[#1f2a44]">
                  Tableau de bord
                </h1>
                <p className="mt-2 max-w-2xl text-base md:text-lg text-[#667085]">
                  Vue d’ensemble de votre activité Lidmeo : leads, emails et relances.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/dashboard/prospection"
                  className="rounded-full bg-[#3b6ff6] px-5 py-2.5 text-xs md:text-sm font-semibold text-white hover:bg-[#2f5de0] transition shadow-lg shadow-[#3a73e7]/25"
                >
                  Ouvrir Prospection
                </Link>
                <Link
                  href="/dashboard/followups"
                  className="rounded-full border border-[#e3e7ef] bg-white px-5 py-2.5 text-xs md:text-sm font-semibold text-[#1f2a44] hover:bg-[#fbfcfe] transition"
                >
                  Ouvrir Relances
                </Link>
              </div>
            </div>
          </div>

          {/* STATS ERROR / LOADING */}
          {statsError ? (
            <div className="mb-8 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
                color="from-[#4f72f3] to-[#8aa0f8]"
                onClick={() => loadDrilldown("leads_today")}
                active={active === "leads_today"}
                loading={loadingStats}
              />
              <KPI
                label="Leads cette semaine"
                value={stats.leadsWeek}
                color="from-[#7f8ca4] to-[#a9b4c7]"
                onClick={() => loadDrilldown("leads_week")}
                active={active === "leads_week"}
                loading={loadingStats}
              />
              <KPI
                label="Taux de traitement"
                value={`${stats.traitementRate}%`}
                color="from-[#5974ad] to-[#8ba0cb]"
                onClick={() => loadDrilldown("treated")}
                active={active === "treated"}
                loading={loadingStats}
              />
            </div>

            {/* ✅ Relances (swapped ABOVE Emails) */}
            <SectionHeader title="Relances" subtitle="À venir et en retard" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <KPI
                label="Relances à venir"
                value={stats.relancesCount}
                color="from-[#9d7f49] to-[#c5a468]"
                onClick={() => loadDrilldown("followups_upcoming")}
                active={active === "followups_upcoming"}
                loading={loadingStats}
              />
              <KPI
                label="Relances en retard"
                value={stats.relancesLate}
                color="from-[#a87359] to-[#c6947d]"
                onClick={() => loadDrilldown("followups_late")}
                active={active === "followups_late"}
                loading={loadingStats}
              />
            </div>

            {/* ✅ Emails (swapped BELOW Relances) */}
            <SectionHeader title="Emails" subtitle="Tri et charge allégée" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <KPI
                label="Emails triés aujourd’hui"
                value={stats.emailsSortedToday}
                color="from-[#5f7ec3] to-[#8eabde]"
                clickable={false}
                loading={loadingStats}
              />
              <KPI
                label="Emails triés au total"
                value={stats.emailsSortedTotal}
                color="from-[#7a96ce] to-[#a7bbdf]"
                clickable={false}
                loading={loadingStats}
              />
            </div>
          </div>

          {/* ✅ DRILLDOWN LIST */}
          {active && (
            <div
              ref={drilldownRef}
              className="mt-10 overflow-hidden rounded-[24px] border border-[#e3e7ef] bg-white/95 shadow-sm"
            >
              {/* sticky header */}
              <div className="border-b border-[#e3e7ef] bg-[#fbfcfe] px-6 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[#1f2a44] text-sm font-semibold">
                      {activeLabel}
                    </h2>
                    <span className="rounded-full border border-[#e3e7ef] bg-white px-2 py-0.5 text-[11px] text-[#667085]">
                      {loadingItems ? "…" : `${filteredItems.length}`}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-[#667085]">
                    Astuce : re-cliquez sur le KPI pour fermer. Cliquez sur une
                    ligne pour ouvrir le détail.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Rechercher (nom, société, email…)"
                      className="w-[260px] max-w-full rounded-xl border border-[#e3e7ef] bg-white px-3 py-2 text-[12px] text-[#1f2a44] placeholder:text-[#667085] outline-none focus:border-[#9bb5f8]"
                    />
                  </div>

                  <button
                    onClick={() => {
                      setActive(null);
                      setItems([]);
                      setItemsError(null);
                      setQ("");
                    }}
                    className="rounded-xl border border-[#e3e7ef] bg-white px-3 py-2 text-[12px] font-medium text-[#1f2a44] transition hover:bg-[#fbfcfe]"
                  >
                    Fermer
                  </button>
                </div>
              </div>

              {loadingItems ? (
                <div className="px-6 py-10 text-sm text-[#60759a]">
                  Chargement…
                </div>
              ) : itemsError ? (
                <div className="px-6 py-10 text-sm text-red-700">
                  {itemsError}
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="px-6 py-10 text-sm text-[#6e83a9]">
                  Aucun élément.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  {!isFollowupsView ? (
                    <table className="w-full text-sm border-separate border-spacing-0">
                      <thead>
                        <tr className="bg-[#fbfcfe] text-[#5a7096] text-[11px] uppercase tracking-wide">
                          <th className="py-3 px-4 border-b border-[#e3e7ef] text-left">
                            Source
                          </th>
                          <th className="py-3 px-4 border-b border-[#e3e7ef] text-left">
                            Nom
                          </th>
                          <th className="py-3 px-4 border-b border-[#e3e7ef] text-left">
                            Contact
                          </th>
                          <th className="py-3 px-4 border-b border-[#e3e7ef] text-center">
                            Traité
                          </th>
                          <th className="py-3 px-4 border-b border-[#e3e7ef] text-center">
                            Date
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredItems.map((it) => {
                          const src =
                            it?.source === "maps" ? "maps" : "linkedin";
                          const sourceLabel =
                            src === "maps" ? "Maps" : "LinkedIn";

                          const name =
                            src === "maps"
                              ? it?.title || "—"
                              : (
                                  `${it?.FirstName ?? ""} ${
                                    it?.LastName ?? ""
                                  }`.trim() ||
                                  it?.Name ||
                                  "—"
                                );

                          const contact =
                            src === "maps"
                              ? it?.email ||
                                it?.phoneNumber ||
                                it?.website ||
                                "—"
                              : it?.Company || it?.location || "—";

                          return (
                            <tr
                              key={`${it?.source ?? "x"}-${it?.id}`}
                              onClick={() => openFromRow(it)}
                              className="cursor-pointer border-b border-[#eef1f5] transition hover:bg-[#fbfcfe]"
                            >
                              <td className="py-3 px-4 text-[#667085]">
                                <SourceBadge
                                  value={sourceLabel}
                                  variant={src}
                                />
                              </td>
                              <td className="py-3 px-4 text-[#1f2a44]">
                                {name}
                                <div className="mt-0.5 text-[11px] text-[#667085]">
                                  Ouvrir →
                                </div>
                              </td>
                              <td className="py-3 px-4 text-[#667085]">
                                {contact}
                              </td>
                              <td className="py-3 px-4 text-center text-[#667085]">
                                {it?.traite ? "Oui" : "Non"}
                              </td>
                              <td className="py-3 px-4 text-center text-[#667085]">
                                {it?.created_at
                                  ? new Date(
                                      it.created_at
                                    ).toLocaleDateString("fr-FR")
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
                        <tr className="bg-[#fbfcfe] text-[#5a7096] text-[11px] uppercase tracking-wide">
                          <th className="py-3 px-4 border-b border-[#e3e7ef] text-left">
                            Source
                          </th>
                          <th className="py-3 px-4 border-b border-[#e3e7ef] text-left">
                            Nom
                          </th>
                          <th className="py-3 px-4 border-b border-[#e3e7ef] text-left">
                            Contact
                          </th>
                          <th className="py-3 px-4 border-b border-[#e3e7ef] text-center">
                            Prochaine relance
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredItems.map((it) => {
                          const src =
                            it?.source === "maps" ? "maps" : "linkedin";
                          const sourceLabel =
                            src === "maps" ? "Maps" : "LinkedIn";

                          const name =
                            src === "maps"
                              ? it?.title || "—"
                              : (
                                  `${it?.FirstName ?? ""} ${
                                    it?.LastName ?? ""
                                  }`.trim() ||
                                  it?.Name ||
                                  "—"
                                );

                          const contact =
                            src === "maps"
                              ? it?.email ||
                                it?.phoneNumber ||
                                it?.website ||
                                "—"
                              : it?.Company || it?.location || "—";

                          return (
                            <tr
                              key={`${it?.source ?? "x"}-${it?.id}`}
                              onClick={() => openFromRow(it)}
                              className="cursor-pointer border-b border-[#eef1f5] transition hover:bg-[#fbfcfe]"
                            >
                              <td className="py-3 px-4 text-[#667085]">
                                <SourceBadge
                                  value={sourceLabel}
                                  variant={src}
                                />
                              </td>
                              <td className="py-3 px-4 text-[#1f2a44]">
                                {name}
                                <div className="mt-0.5 text-[11px] text-[#667085]">
                                  Ouvrir →
                                </div>
                              </td>
                              <td className="py-3 px-4 text-[#667085]">
                                {contact}
                              </td>
                              <td className="py-3 px-4 text-center text-[#667085]">
                                {it?.next_followup_at
                                  ? new Date(
                                      it.next_followup_at
                                    ).toLocaleDateString("fr-FR")
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
        <p className="font-semibold text-[#1f2a44]">{title}</p>
        <p className="mt-0.5 text-[12px] text-[#667085]">{subtitle}</p>
      </div>
      <div className="h-px flex-1 bg-[#e3e7ef]" />
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
        "relative overflow-hidden rounded-2xl border p-6 transition-all duration-200",
        "border-[#e3e7ef] bg-white shadow-sm",
        clickable
          ? "cursor-pointer hover:-translate-y-0.5 hover:border-[#d2d8e2]"
          : "opacity-80 cursor-default",
        active ? "ring-2 ring-[#dbe1ec] border-[#c8cfdb]" : "",
      ].join(" ")}
    >
      <div className={`absolute inset-0 opacity-10 bg-gradient-to-br ${color}`} />
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm text-[#667085]">{label}</div>
          {clickable ? (
            <span className="rounded-full border border-[#e3e7ef] bg-[#fbfcfe] px-2 py-0.5 text-[11px] text-[#667085]">
              {active ? "Ouvert" : "Détails"}
            </span>
          ) : (
            <span className="rounded-full border border-[#e3e7ef] bg-[#fbfcfe] px-2 py-0.5 text-[11px] text-[#667085]">
              Info
            </span>
          )}
        </div>

        <div className="mt-3 text-4xl font-extrabold text-[#1f2a44]">
          {loading ? <span className="opacity-50">—</span> : value}
        </div>

        {clickable ? (
          <div className="mt-3 text-[12px] text-[#667085]">
            Cliquez pour afficher la liste.
          </div>
        ) : (
          <div className="mt-3 text-[12px] text-[#667085]">
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
      ? "border-emerald-300/60 bg-emerald-50 text-emerald-700"
      : "border-[#d5def0] bg-[#f5f8ff] text-[#4f6286]";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] ${cls}`}
    >
      {value}
    </span>
  );
}
