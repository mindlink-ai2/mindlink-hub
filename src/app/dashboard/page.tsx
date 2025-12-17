"use client";

import { useEffect, useState } from "react";

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

  return (
    <div className="min-h-screen w-full px-6 pt-20 pb-32 bg-[#090c12]">
      <h1 className="text-5xl font-extrabold tracking-tight mb-3 bg-gradient-to-r from-blue-400 via-cyan-300 to-indigo-400 bg-clip-text text-transparent">
        Tableau de bord Mindlink
      </h1>

      <p className="text-slate-400 text-lg mb-12">
        Votre activité commerciale. Simplifiée, automatisée, amplifiée.
      </p>

      {/* KPIs ligne 1 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <KPI label="Leads aujourd’hui" value={stats.leadsToday} color="from-blue-500 to-cyan-400" />
        <KPI label="Leads cette semaine" value={stats.leadsWeek} color="from-green-500 to-emerald-400" />
        <KPI label="Taux de traitement" value={`${stats.traitementRate}%`} color="from-purple-500 to-fuchsia-400" />
      </div>

      {/* KPIs ligne 2 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <KPI label="Emails triés aujourd’hui" value={stats.emailsSortedToday} color="from-indigo-500 to-blue-400" />
        <KPI label="Emails triés au total" value={stats.emailsSortedTotal} color="from-sky-500 to-blue-300" />
        <KPI label="Relances à venir" value={stats.relancesCount} color="from-yellow-500 to-orange-400" />
        <KPI label="Relances en retard" value={stats.relancesLate} color="from-red-500 to-rose-500" />
      </div>
    </div>
  );
}

/* ------------------------- */
/* Composant KPI             */
/* ------------------------- */

function KPI({
  label,
  value,
  color,
}: {
  label: string;
  value: any;
  color: string;
}) {
  return (
    <div
      className="
        rounded-2xl bg-[#0B0E13] border border-slate-800 p-6 shadow-xl shadow-black/40
        relative overflow-hidden transition-all duration-300 ease-out
        hover:-translate-y-1 hover:scale-[1.03] hover:shadow-indigo-500/30
      "
    >
      <div className={`absolute inset-0 opacity-20 bg-gradient-to-br ${color}`} />
      <div className="text-slate-400 text-sm relative z-10">{label}</div>
      <div className="text-4xl font-bold mt-2 text-white relative z-10">
        {value}
      </div>
    </div>
  );
}