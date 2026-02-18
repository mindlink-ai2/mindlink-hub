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
      <div className="min-h-screen w-full px-4 pb-24 pt-10 sm:px-6">
        <div className="mx-auto w-full max-w-7xl">
          {/* HEADER */}
          <div className="hub-card-hero relative mb-10 overflow-hidden p-6 md:p-8">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute -left-24 top-[-130px] h-72 w-72 rounded-full bg-[#dce8ff]/80 blur-3xl" />
              <div className="absolute -right-24 top-[-130px] h-72 w-72 rounded-full bg-[#d8f4ff]/80 blur-3xl" />
            </div>
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="relative">
                <div className="hub-chip border-[#c8d6ea] bg-[#f7fbff]">
                  <span className="h-2 w-2 rounded-full bg-[#1f5eff]" />
                  Hub de pilotage
                </div>

                <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-[#0b1c33] md:text-5xl">
                  Tableau de bord
                </h1>
                <p className="mt-2 max-w-2xl text-base text-[#51627b] md:text-lg">
                  Vue d’ensemble de votre activité Lidmeo : leads, emails et relances.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/dashboard/prospection"
                  className="inline-flex items-center justify-center rounded-full border border-[#1f5eff] bg-gradient-to-r from-[#1f5eff] to-[#1254ec] px-5 py-2.5 text-xs font-semibold text-white shadow-[0_14px_26px_-16px_rgba(31,94,255,0.85)] transition hover:-translate-y-[1px] md:text-sm"
                >
                  Ouvrir Prospection
                </Link>
                <Link
                  href="/dashboard/followups"
                  className="rounded-full border border-[#c8d6ea] bg-[#f5f9ff] px-5 py-2.5 text-xs font-semibold text-[#0b1c33] transition hover:-translate-y-[1px] hover:border-[#afc7eb] hover:bg-[#edf4fd] md:text-sm"
                >
                  Ouvrir Relances
                </Link>
              </div>
            </div>
          </div>

          {/* STATS ERROR / LOADING */}
          {statsError ? (
            <div className="mb-8 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-[0_12px_20px_-18px_rgba(185,28,28,0.75)]">
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
                color="from-[#1f5eff] to-[#74a1ff]"
                onClick={() => loadDrilldown("leads_today")}
                active={active === "leads_today"}
                loading={loadingStats}
              />
              <KPI
                label="Leads cette semaine"
                value={stats.leadsWeek}
                color="from-[#4f6e9a] to-[#94abcf]"
                onClick={() => loadDrilldown("leads_week")}
                active={active === "leads_week"}
                loading={loadingStats}
              />
              <KPI
                label="Taux de traitement"
                value={`${stats.traitementRate}%`}
                color="from-[#355fbe] to-[#7f9de0]"
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

            {/* ✅ Emails (swapped BELOW Relances) */}
            <SectionHeader title="Emails" subtitle="Tri et charge allégée" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <KPI
                label="Emails triés aujourd’hui"
                value={stats.emailsSortedToday}
                color="from-[#3572d4] to-[#7ca9e8]"
                clickable={false}
                loading={loadingStats}
              />
              <KPI
                label="Emails triés au total"
                value={stats.emailsSortedTotal}
                color="from-[#5f84c8] to-[#97b3e1]"
                clickable={false}
                loading={loadingStats}
              />
            </div>
          </div>

          {/* ✅ DRILLDOWN LIST */}
          {active && (
            <div
              ref={drilldownRef}
              className="hub-card mt-10 overflow-hidden"
            >
              {/* sticky header */}
              <div className="flex flex-col gap-3 border-b border-[#d7e3f4] bg-[#f8fbff] px-6 py-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-[#0b1c33]">
                      {activeLabel}
                    </h2>
                    <span className="rounded-full border border-[#c8d6ea] bg-[#f7fbff] px-2 py-0.5 text-[11px] text-[#51627b]">
                      {loadingItems ? "…" : `${filteredItems.length}`}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-[#51627b]">
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
                      className="w-[260px] max-w-full rounded-xl border border-[#c8d6ea] bg-[#f5f9ff] px-3 py-2 text-[12px] text-[#0b1c33] placeholder:text-[#51627b] outline-none transition focus:border-[#90b5ff] focus:ring-2 focus:ring-[#dce8ff]"
                    />
                  </div>

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
                <div className="px-6 py-10 text-sm text-[#51627b]">
                  Chargement…
                </div>
              ) : itemsError ? (
                <div className="px-6 py-10 text-sm text-red-700">
                  {itemsError}
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="px-6 py-10 text-sm text-[#51627b]">
                  Aucun élément.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  {!isFollowupsView ? (
                    <table className="w-full text-sm border-separate border-spacing-0">
                      <thead>
                        <tr className="bg-[#f8fbff] text-[11px] uppercase tracking-wide text-[#51627b]">
                          <th className="border-b border-[#d7e3f4] px-4 py-3 text-left">
                            Source
                          </th>
                          <th className="border-b border-[#d7e3f4] px-4 py-3 text-left">
                            Nom
                          </th>
                          <th className="border-b border-[#d7e3f4] px-4 py-3 text-left">
                            Contact
                          </th>
                          <th className="border-b border-[#d7e3f4] px-4 py-3 text-center">
                            Traité
                          </th>
                          <th className="border-b border-[#d7e3f4] px-4 py-3 text-center">
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
                              className="cursor-pointer border-b border-[#e4edf8] transition hover:bg-[#f8fbff]"
                            >
                              <td className="px-4 py-3 text-[#51627b]">
                                <SourceBadge
                                  value={sourceLabel}
                                  variant={src}
                                />
                              </td>
                              <td className="px-4 py-3 text-[#0b1c33]">
                                {name}
                                <div className="mt-0.5 text-[11px] text-[#51627b]">
                                  Ouvrir →
                                </div>
                              </td>
                              <td className="px-4 py-3 text-[#51627b]">
                                {contact}
                              </td>
                              <td className="px-4 py-3 text-center text-[#51627b]">
                                {it?.traite ? "Oui" : "Non"}
                              </td>
                              <td className="px-4 py-3 text-center text-[#51627b]">
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
                        <tr className="bg-[#f8fbff] text-[11px] uppercase tracking-wide text-[#51627b]">
                          <th className="border-b border-[#d7e3f4] px-4 py-3 text-left">
                            Source
                          </th>
                          <th className="border-b border-[#d7e3f4] px-4 py-3 text-left">
                            Nom
                          </th>
                          <th className="border-b border-[#d7e3f4] px-4 py-3 text-left">
                            Contact
                          </th>
                          <th className="border-b border-[#d7e3f4] px-4 py-3 text-center">
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
                              className="cursor-pointer border-b border-[#e4edf8] transition hover:bg-[#f8fbff]"
                            >
                              <td className="px-4 py-3 text-[#51627b]">
                                <SourceBadge
                                  value={sourceLabel}
                                  variant={src}
                                />
                              </td>
                              <td className="px-4 py-3 text-[#0b1c33]">
                                {name}
                                <div className="mt-0.5 text-[11px] text-[#51627b]">
                                  Ouvrir →
                                </div>
                              </td>
                              <td className="px-4 py-3 text-[#51627b]">
                                {contact}
                              </td>
                              <td className="px-4 py-3 text-center text-[#51627b]">
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
        <p className="font-semibold text-[#0b1c33]">{title}</p>
        <p className="mt-0.5 text-[12px] text-[#51627b]">{subtitle}</p>
      </div>
      <div className="h-px flex-1 bg-[#d7e3f4]" />
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
        "border-[#d7e3f4] bg-white shadow-[0_16px_32px_-28px_rgba(14,45,96,0.68)]",
        clickable
          ? "cursor-pointer hover:-translate-y-0.5 hover:border-[#bcd1f1]"
          : "opacity-80 cursor-default",
        active ? "border-[#90b5ff] ring-2 ring-[#dce8ff]" : "",
      ].join(" ")}
    >
      <div className={`absolute inset-0 opacity-[0.16] bg-gradient-to-br ${color}`} />
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm text-[#51627b]">{label}</div>
          {clickable ? (
            <span className="rounded-full border border-[#d7e3f4] bg-[#f8fbff] px-2 py-0.5 text-[11px] text-[#51627b]">
              {active ? "Ouvert" : "Détails"}
            </span>
          ) : (
            <span className="rounded-full border border-[#d7e3f4] bg-[#f8fbff] px-2 py-0.5 text-[11px] text-[#51627b]">
              Info
            </span>
          )}
        </div>

        <div className="mt-3 text-4xl font-extrabold text-[#0b1c33]">
          {loading ? <span className="opacity-50">—</span> : value}
        </div>

        {clickable ? (
          <div className="mt-3 text-[12px] text-[#51627b]">
            Cliquez pour afficher la liste.
          </div>
        ) : (
          <div className="mt-3 text-[12px] text-[#51627b]">
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
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-[#d7e3f4] bg-[#ecf3ff] text-[#36598a]";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] ${cls}`}
    >
      {value}
    </span>
  );
}
