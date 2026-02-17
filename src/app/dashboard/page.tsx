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
          <div className="mb-10 rounded-[28px] border border-[#dbe6ff] bg-white/85 p-6 shadow-[0_24px_55px_-36px_rgba(55,102,210,0.55)] backdrop-blur-sm md:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[#d6e3ff] bg-[#f4f8ff] px-3 py-1 text-[11px] font-medium text-[#3a5788]">
                  <span className="h-2 w-2 rounded-full bg-[#3b73ec]" />
                  Hub de pilotage
                </div>

                <h1 className="mt-3 text-4xl md:text-5xl font-extrabold tracking-tight text-[#0f2446]">
                  Tableau de bord
                </h1>
                <p className="mt-2 max-w-2xl text-base md:text-lg text-[#5a7096]">
                  Vue d’ensemble de votre activité Lidmeo : leads, emails et relances.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/dashboard/prospection"
                  className="rounded-full bg-[#2f6df0] px-5 py-2.5 text-xs md:text-sm font-semibold text-white hover:bg-[#245fdc] transition shadow-lg shadow-[#3a73e7]/25"
                >
                  Ouvrir Prospection
                </Link>
                <Link
                  href="/dashboard/followups"
                  className="rounded-full border border-[#d3e0f8] bg-white px-5 py-2.5 text-xs md:text-sm font-semibold text-[#1f3c67] hover:bg-[#f4f8ff] transition"
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

            {/* ✅ Relances (swapped ABOVE Emails) */}
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

            {/* ✅ Emails (swapped BELOW Relances) */}
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
          </div>

          {/* ✅ DRILLDOWN LIST */}
          {active && (
            <div
              ref={drilldownRef}
              className="mt-10 overflow-hidden rounded-[24px] border border-[#d9e5fd] bg-white/90 shadow-[0_28px_60px_-42px_rgba(44,95,195,0.55)]"
            >
              {/* sticky header */}
              <div className="border-b border-[#e0e9fb] bg-[#f6f9ff] px-6 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[#132b51] text-sm font-semibold">
                      {activeLabel}
                    </h2>
                    <span className="rounded-full border border-[#d2ddf8] bg-white px-2 py-0.5 text-[11px] text-[#36558a]">
                      {loadingItems ? "…" : `${filteredItems.length}`}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#6c83aa] mt-1">
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
                      className="w-[260px] max-w-full rounded-xl border border-[#d5e1f8] bg-white px-3 py-2 text-[12px] text-[#193762] placeholder:text-[#7c91b5] outline-none focus:border-[#7ba1f3]"
                    />
                  </div>

                  <button
                    onClick={() => {
                      setActive(null);
                      setItems([]);
                      setItemsError(null);
                      setQ("");
                    }}
                    className="rounded-xl border border-[#d2def7] bg-white px-3 py-2 text-[12px] font-medium text-[#21426f] transition hover:bg-[#f4f8ff]"
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
                        <tr className="bg-[#f6f9ff] text-[#5a7096] text-[11px] uppercase tracking-wide">
                          <th className="py-3 px-4 border-b border-[#dce6fa] text-left">
                            Source
                          </th>
                          <th className="py-3 px-4 border-b border-[#dce6fa] text-left">
                            Nom
                          </th>
                          <th className="py-3 px-4 border-b border-[#dce6fa] text-left">
                            Contact
                          </th>
                          <th className="py-3 px-4 border-b border-[#dce6fa] text-center">
                            Traité
                          </th>
                          <th className="py-3 px-4 border-b border-[#dce6fa] text-center">
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
                              className="cursor-pointer border-b border-[#edf2fb] transition hover:bg-[#f5f8ff]"
                            >
                              <td className="py-3 px-4 text-[#3f5885]">
                                <SourceBadge
                                  value={sourceLabel}
                                  variant={src}
                                />
                              </td>
                              <td className="py-3 px-4 text-[#0f2446]">
                                {name}
                                <div className="mt-0.5 text-[11px] text-[#7086aa]">
                                  Ouvrir →
                                </div>
                              </td>
                              <td className="py-3 px-4 text-[#4d638c]">
                                {contact}
                              </td>
                              <td className="py-3 px-4 text-center text-[#3f5885]">
                                {it?.traite ? "Oui" : "Non"}
                              </td>
                              <td className="py-3 px-4 text-center text-[#6f84a8]">
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
                        <tr className="bg-[#f6f9ff] text-[#5a7096] text-[11px] uppercase tracking-wide">
                          <th className="py-3 px-4 border-b border-[#dce6fa] text-left">
                            Source
                          </th>
                          <th className="py-3 px-4 border-b border-[#dce6fa] text-left">
                            Nom
                          </th>
                          <th className="py-3 px-4 border-b border-[#dce6fa] text-left">
                            Contact
                          </th>
                          <th className="py-3 px-4 border-b border-[#dce6fa] text-center">
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
                              className="cursor-pointer border-b border-[#edf2fb] transition hover:bg-[#f5f8ff]"
                            >
                              <td className="py-3 px-4 text-[#3f5885]">
                                <SourceBadge
                                  value={sourceLabel}
                                  variant={src}
                                />
                              </td>
                              <td className="py-3 px-4 text-[#0f2446]">
                                {name}
                                <div className="mt-0.5 text-[11px] text-[#7086aa]">
                                  Ouvrir →
                                </div>
                              </td>
                              <td className="py-3 px-4 text-[#4d638c]">
                                {contact}
                              </td>
                              <td className="py-3 px-4 text-center text-[#6f84a8]">
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
        <p className="font-semibold text-[#122c55]">{title}</p>
        <p className="mt-0.5 text-[12px] text-[#6d84ab]">{subtitle}</p>
      </div>
      <div className="h-px flex-1 bg-[#dce7fd]" />
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
        "border-[#dbe5fb] bg-white shadow-[0_24px_45px_-34px_rgba(55,98,196,0.5)]",
        clickable
          ? "cursor-pointer hover:-translate-y-0.5 hover:border-[#bed0f4]"
          : "opacity-80 cursor-default",
        active ? "ring-2 ring-[#8fb0f7] border-[#9ab7f3]" : "",
      ].join(" ")}
    >
      <div className={`absolute inset-0 opacity-10 bg-gradient-to-br ${color}`} />
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm text-[#4d638c]">{label}</div>
          {clickable ? (
            <span className="rounded-full border border-[#d7e2f8] bg-[#f6f9ff] px-2 py-0.5 text-[11px] text-[#3e5988]">
              {active ? "Ouvert" : "Détails"}
            </span>
          ) : (
            <span className="rounded-full border border-[#dfe8fb] bg-[#f7faff] px-2 py-0.5 text-[11px] text-[#7085ac]">
              Info
            </span>
          )}
        </div>

        <div className="mt-3 text-4xl font-extrabold text-[#10284d]">
          {loading ? <span className="opacity-50">—</span> : value}
        </div>

        {clickable ? (
          <div className="mt-3 text-[12px] text-[#60779f]">
            Cliquez pour afficher la liste.
          </div>
        ) : (
          <div className="mt-3 text-[12px] text-[#7489ad]">
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
      : "border-sky-300/60 bg-sky-50 text-sky-700";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] ${cls}`}
    >
      {value}
    </span>
  );
}
