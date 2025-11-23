"use client";

import { useEffect, useState } from "react";

export default function DashboardPage() {
  const [stats, setStats] = useState({
    leadsToday: 0,
    leadsWeek: 0,
    traitementRate: 0,
    emailsSortedToday: 0,
    relancesCount: 0,
    mindlinkScore: 0,
  });

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await fetch("/api/dashboard/stats", {
          method: "GET",
          credentials: "include", // 🔥 cookies Clerk envoyés automatiquement !
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
    <div className="min-h-screen w-full px-6 pt-20 pb-32">
      <h1 className="text-5xl font-extrabold tracking-tight mb-3">
        Tableau de bord Mindlink
      </h1>
      <p className="text-slate-400 text-lg mb-12">
        Votre activité commerciale. Simplifiée, automatisée, amplifiée.
      </p>

      {/* KPIs ligne 1 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <KPI label="Leads aujourd’hui" value={stats.leadsToday} />
        <KPI label="Leads cette semaine" value={stats.leadsWeek} />
        <KPI label="Taux de traitement" value={`${stats.traitementRate}%`} />
      </div>

      {/* KPIs ligne 2 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-14">
        <KPI label="Emails triés aujourd’hui" value={stats.emailsSortedToday} />
        <KPI label="Relances à venir" value={stats.relancesCount} />
        <KPI label="Mindlink Score™" value={stats.mindlinkScore} />
      </div>

      {/* Sections */}
      <Section title="Évolution de votre activité" height="350px">
        Graphique d’activité
      </Section>

      <Section title="Analyse IA & Recommandations" height="220px">
        Analyse générée par l’IA…
      </Section>

      <Section title="Mindlink Map – Vue globale" height="380px">
        Carte mentale de prospection
      </Section>

      <Section title="Vos leads" height="400px">
        Tableau interactif
      </Section>
    </div>
  );
}

function KPI({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-2xl bg-[#0B0E13] border border-slate-800 p-6">
      <div className="text-slate-400 text-sm">{label}</div>
      <div className="text-4xl font-bold mt-2">{value}</div>
    </div>
  );
}

function Section({
  title,
  height,
  children,
}: {
  title: string;
  height: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <h2 className="text-2xl font-bold mb-4">{title}</h2>
      <div
        className="rounded-2xl bg-[#0B0E13] border border-slate-800 p-10 flex items-center justify-center mb-16"
        style={{ height }}
      >
        <span className="text-slate-500 italic">({children})</span>
      </div>
    </>
  );
}
