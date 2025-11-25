"use client";

import { useEffect, useState } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";

import { RECOMMENDATIONS } from "@/app/data/recommendations";

// ---------------------------------------------------------------------
// 🔥 Fonction pour choisir 3 recommandations aléatoires toutes les 8h
// ---------------------------------------------------------------------
function getRotatingRecommendations() {
  const now = new Date();

  const cycle = Math.floor(now.getHours() / 8);
  const seed = parseInt(
    `${now.getFullYear()}${now.getMonth()}${now.getDate()}${cycle}`
  );

  function random(seedValue: number) {
    const x = Math.sin(seedValue) * 10000;
    return x - Math.floor(x);
  }

  const shuffled = [...RECOMMENDATIONS].sort(
    (a, b) => random(seed + a.length) - random(seed + b.length)
  );

  return shuffled.slice(0, 3);
}

export default function DashboardPage() {
  const [stats, setStats] = useState({
    leadsToday: 0,
    leadsWeek: 0,
    traitementRate: 0,
    emailsSortedToday: 0,
    relancesCount: 0,
    mindlinkScore: 0,
  });

  const tips = getRotatingRecommendations();

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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-14">
        <KPI label="Emails triés aujourd’hui" value={stats.emailsSortedToday} color="from-indigo-500 to-blue-400" />
        <KPI label="Relances à venir" value={stats.relancesCount} color="from-yellow-500 to-orange-400" />
        <KPI label="Mindlink Score™" value={stats.mindlinkScore} color="from-pink-500 to-rose-400" />
      </div>

      {/* IA */}
      <Section title="Analyse IA & Recommandations" height="auto">
        <div className="w-full space-y-4">
          {tips.map((tip, i) => (
            <div
              key={i}
              className="p-4 rounded-xl bg-gradient-to-br from-blue-500/10 via-slate-800/30 to-indigo-500/10 
                         border border-indigo-500/20 text-slate-200 shadow-lg shadow-indigo-500/10 
                         transition-all duration-300 ease-out 
                         hover:shadow-indigo-500/40 hover:-translate-y-1 hover:scale-[1.02]"
            >
              {tip}
            </div>
          ))}
        </div>
      </Section>

      {/* ⭐️ MINDLINK MAP */}
      <MindlinkMap stats={stats} />

      {/* ❌ Leads retiré */}
    </div>
  );
}

/* ------------------------- */
/* Composants utilitaires    */
/* ------------------------- */

// ⭐️ NOUVELLE VERSION KPI AVEC HOVER PREMIUM
function KPI({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <div
      className={`
        rounded-2xl bg-[#0B0E13] border border-slate-800 p-6 shadow-xl shadow-black/40 
        relative overflow-hidden transition-all duration-300 ease-out
        hover:-translate-y-1 hover:scale-[1.03] hover:shadow-indigo-500/30
      `}
    >
      <div className={`absolute inset-0 opacity-20 bg-gradient-to-br ${color}`}></div>

      <div className="text-slate-400 text-sm relative z-10">{label}</div>
      <div className="text-4xl font-bold mt-2 text-white relative z-10">{value}</div>
    </div>
  );
}

function Section({
  title,
  height,
  children,
}: {
  title: string;
  height: string | number;
  children: React.ReactNode;
}) {
  return (
    <>
      <h2 className="text-2xl font-bold mb-4 text-indigo-300">{title}</h2>
      <div
        className="rounded-2xl bg-[#0F131A] border border-slate-800 p-10 mb-16 shadow-lg shadow-black/30"
        style={{ minHeight: height }}
      >
        {children}
      </div>
    </>
  );
}

/* ---------------------------- */
/* ⭐️ MINDLINK MAP (Radar Chart) */
/* ---------------------------- */

function MindlinkMap({ stats }: { stats: any }) {
  const data = [
    { subject: "LinkedIn", value: stats.leadsToday, fullMark: 100 },
    { subject: "Google Maps", value: stats.leadsWeek, fullMark: 100 },
    { subject: "Traitement", value: stats.traitementRate, fullMark: 100 },
    { subject: "Emails", value: stats.emailsSortedToday, fullMark: 100 },
    { subject: "Relances", value: stats.relancesCount, fullMark: 100 },
    { subject: "Score", value: stats.mindlinkScore, fullMark: 100 },
  ];

  return (
    <>
      <h2 className="text-2xl font-bold mb-4 text-indigo-300">
        Mindlink Map – Vue globale
      </h2>

      <div className="rounded-2xl bg-[#0F131A] border border-slate-800 p-10 h-[420px] mb-16 shadow-xl shadow-black/30">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
            <PolarGrid stroke="#334155" />
            <PolarAngleAxis
              dataKey="subject"
              tick={{ fill: "#c7d2fe", fontSize: 12 }}
            />
            <Radar
              name="Mindlink"
              dataKey="value"
              stroke="#4f46e5"
              fill="#6366f1"
              fillOpacity={0.35}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
