"use client";

import { useEffect, useMemo, useState } from "react";
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

  // ✅ NEW: drilldown state
  const [active, setActive] = useState<DrilldownType | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await fetch("/api/dashboard/stats", {
          method: "GET",
          credentials: "include",
        });

        if (!res.ok) {
          console.error("Erreur API stats:", await res.text());
          return;
        }

        const data = await res.json();
        setStats(data);
      } catch (err) {
        console.error("❌ Erreur fetch stats:", err);
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
      return;
    }

    setActive(type);
    setLoadingItems(true);
    setItems([]);
    setItemsError(null);

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
      ✅ NEW: open row -> open correct page + sidebar
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

  return (
    <SubscriptionGate supportEmail="contact@lidmeo.com">
      <div className="min-h-screen w-full px-6 pt-20 pb-32">
        <h1 className="text-5xl font-extrabold tracking-tight mb-3 bg-gradient-to-r from-blue-400 via-cyan-300 to-indigo-400 bg-clip-text text-transparent">
          Tableau de bord Lidmeo
        </h1>

        <p className="text-slate-400 text-lg mb-12">
          Votre activité commerciale. Simplifiée, automatisée, amplifiée.
        </p>

        {/* KPIs ligne 1 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <KPI
            label="Leads aujourd’hui"
            value={stats.leadsToday}
            color="from-blue-500 to-cyan-400"
            onClick={() => loadDrilldown("leads_today")}
            active={active === "leads_today"}
          />
          <KPI
            label="Leads cette semaine"
            value={stats.leadsWeek}
            color="from-green-500 to-emerald-400"
            onClick={() => loadDrilldown("leads_week")}
            active={active === "leads_week"}
          />
          <KPI
            label="Taux de traitement"
            value={`${stats.traitementRate}%`}
            color="from-purple-500 to-fuchsia-400"
            onClick={() => loadDrilldown("treated")}
            active={active === "treated"}
          />
        </div>

        {/* KPIs ligne 2 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <KPI
            label="Emails triés aujourd’hui"
            value={stats.emailsSortedToday}
            color="from-indigo-500 to-blue-400"
            clickable={false}
          />
          <KPI
            label="Emails triés au total"
            value={stats.emailsSortedTotal}
            color="from-sky-500 to-blue-300"
            clickable={false}
          />
          <KPI
            label="Relances à venir"
            value={stats.relancesCount}
            color="from-yellow-500 to-orange-400"
            onClick={() => loadDrilldown("followups_upcoming")}
            active={active === "followups_upcoming"}
          />
          <KPI
            label="Relances en retard"
            value={stats.relancesLate}
            color="from-red-500 to-rose-500"
            onClick={() => loadDrilldown("followups_late")}
            active={active === "followups_late"}
          />
        </div>

        {/* ✅ DRILLDOWN LIST (appears under KPIs) */}
        {active && (
          <div className="mt-10 rounded-2xl border border-slate-800 bg-slate-950/90 shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-slate-100 text-sm font-medium">
                  {activeLabel}
                </h2>
                <p className="text-[11px] text-slate-500">
                  Cliquez sur le KPI pour ouvrir/fermer cette liste
                </p>
              </div>

              <button
                onClick={() => {
                  setActive(null);
                  setItems([]);
                  setItemsError(null);
                }}
                className="text-[11px] px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 transition text-slate-200"
              >
                Fermer
              </button>
            </div>

            {loadingItems ? (
              <div className="px-6 py-10 text-sm text-slate-400">
                Chargement…
              </div>
            ) : itemsError ? (
              <div className="px-6 py-10 text-sm text-red-300">
                {itemsError}
              </div>
            ) : items.length === 0 ? (
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
                      {items.map((it) => {
                        const source = it.source === "maps" ? "Maps" : "LinkedIn";

                        const name =
                          it.source === "maps"
                            ? it.title || "—"
                            : (
                                `${it.FirstName ?? ""} ${it.LastName ?? ""}`.trim() ||
                                it.Name ||
                                "—"
                              );

                        const contact =
                          it.source === "maps"
                            ? it.email || it.phoneNumber || it.website || "—"
                            : it.Company || it.location || "—";

                        return (
                          <tr
                            key={`${it.source ?? "x"}-${it.id}`}
                            onClick={() => openFromRow(it)}
                            className="border-b border-slate-900 hover:bg-slate-900/60 transition cursor-pointer"
                          >
                            <td className="py-3 px-4 text-slate-300">{source}</td>
                            <td className="py-3 px-4 text-slate-50">{name}</td>
                            <td className="py-3 px-4 text-slate-300">
                              {contact}
                            </td>
                            <td className="py-3 px-4 text-center text-slate-300">
                              {it.traite ? "Oui" : "Non"}
                            </td>
                            <td className="py-3 px-4 text-center text-slate-400">
                              {it.created_at
                                ? new Date(it.created_at).toLocaleDateString(
                                    "fr-FR"
                                  )
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
                      {items.map((it) => {
                        const source = it.source === "maps" ? "Maps" : "LinkedIn";

                        const name =
                          it.source === "maps"
                            ? it.title || "—"
                            : (
                                `${it.FirstName ?? ""} ${it.LastName ?? ""}`.trim() ||
                                it.Name ||
                                "—"
                              );

                        const contact =
                          it.source === "maps"
                            ? it.email || it.phoneNumber || it.website || "—"
                            : it.Company || it.location || "—";

                        return (
                          <tr
                            key={`${it.source ?? "x"}-${it.id}`}
                            onClick={() => openFromRow(it)}
                            className="border-b border-slate-900 hover:bg-slate-900/60 transition cursor-pointer"
                          >
                            <td className="py-3 px-4 text-slate-300">{source}</td>
                            <td className="py-3 px-4 text-slate-50">{name}</td>
                            <td className="py-3 px-4 text-slate-300">
                              {contact}
                            </td>
                            <td className="py-3 px-4 text-center text-slate-400">
                              {it.next_followup_at
                                ? new Date(it.next_followup_at).toLocaleDateString(
                                    "fr-FR"
                                  )
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
    </SubscriptionGate>
  );
}

/* ------------------------- */
/* Composant KPI             */
/* ------------------------- */

function KPI({
  label,
  value,
  color,
  onClick,
  clickable = true,
  active = false,
}: {
  label: string;
  value: any;
  color: string;
  onClick?: () => void;
  clickable?: boolean;
  active?: boolean;
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
        `
        rounded-2xl bg-[#0B0E13] border border-slate-800 p-6 shadow-xl shadow-black/40
        relative overflow-hidden transition-all duration-300 ease-out
        hover:-translate-y-1 hover:scale-[1.03] hover:shadow-indigo-500/30
      `,
        clickable ? "cursor-pointer" : "opacity-70 cursor-default",
        active ? "ring-2 ring-indigo-500/40" : "",
      ].join(" ")}
    >
      <div className={`absolute inset-0 opacity-20 bg-gradient-to-br ${color}`} />
      <div className="text-slate-400 text-sm relative z-10">{label}</div>
      <div className="text-4xl font-bold mt-2 text-white relative z-10">
        {value}
      </div>
    </div>
  );
}