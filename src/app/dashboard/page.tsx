// ========================
// 🔵 FETCH SERVER-SIDE FIX
// ========================
async function getStats() {
  // 🔥 Base URL universelle (DEV + PROD)
  const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  const res = await fetch(`${base}/api/dashboard/stats`, {
    cache: "no-store",
  });

  if (!res.ok) {
    console.error("Erreur API stats:", await res.text());
    return {
      leadsToday: 0,
      leadsWeek: 0,
      traitementRate: 0,
      emailsSortedToday: 0,
      relancesCount: 0,
      mindlinkScore: 0,
    };
  }

  return res.json();
}

export default async function DashboardPage() {
  const stats = await getStats();

  return (
    <div className="relative min-h-screen w-full text-white px-6 py-10">
      
      {/* 🔵 TITRE */}
      <div className="relative max-w-6xl mx-auto mb-12">
        <h1 className="text-5xl font-extrabold tracking-tight mb-3">
          Tableau de bord Mindlink
        </h1>
        <p className="text-slate-300 text-lg">
          Votre activité commerciale. Simplifiée, automatisée, amplifiée.
        </p>
      </div>

      {/* 🔵 6 KPIs */}
      <section className="relative max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
        <KPIBlock title="Leads aujourd’hui" value={stats.leadsToday} />
        <KPIBlock title="Leads cette semaine" value={stats.leadsWeek} />
        <KPIBlock title="Taux de traitement" value={`${stats.traitementRate}%`} />
        <KPIBlock title="Emails triés aujourd’hui" value={stats.emailsSortedToday} />
        <KPIBlock title="Relances à venir" value={stats.relancesCount} />
        <KPIBlock title="Mindlink Score™" value={stats.mindlinkScore} />
      </section>

      {/* 🔵 TIMELINE */}
      <section className="relative max-w-6xl mx-auto mb-16">
        <SectionTitle title="Évolution de votre activité" />
        <div className="rounded-2xl p-6 border border-slate-800 bg-slate-900/40 h-[350px]">
          <div className="flex items-center justify-center h-full text-slate-400">
            (Graphique d’activité)
          </div>
        </div>
      </section>

      {/* 🔵 ANALYSE IA */}
      <section className="relative max-w-6xl mx-auto mb-16">
        <SectionTitle title="Analyse IA & Recommandations" />
        <div className="rounded-2xl p-6 border border-slate-800 bg-slate-900/40 min-h-[180px]">
          <p className="text-slate-400 italic">(Analyse générée par l’IA…)</p>
        </div>
      </section>

      {/* 🔵 MAP */}
      <section className="relative max-w-6xl mx-auto mb-16">
        <SectionTitle title="Mindlink Map – Vue globale" />
        <div className="rounded-2xl p-6 border border-slate-800 bg-slate-900/40 h-[300px]">
          <div className="flex items-center justify-center h-full text-slate-400">
            (Carte mentale de prospection)
          </div>
        </div>
      </section>

      {/* 🔵 LEADS */}
      <section className="relative max-w-6xl mx-auto mb-16">
        <SectionTitle title="Vos leads" />
        <div className="rounded-2xl p-6 border border-slate-800 bg-slate-900/40 min-h-[300px]">
          <p className="text-slate-400 italic">(Tableau interactif)</p>
        </div>
      </section>

    </div>
  );
}

/* ============================== */
/*  🔵 COMPOSANTS BASIQUES       */
/* ============================== */

function KPIBlock({ title, value }: { title: string; value: any }) {
  return (
    <div className="border border-slate-800 bg-slate-900/40 rounded-2xl p-6 h-[110px] flex flex-col justify-center">
      <p className="text-slate-300 text-sm mb-1">{title}</p>
      <p className="text-3xl font-bold">{value}</p>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <h2 className="text-2xl font-bold mb-4 tracking-tight">{title}</h2>;
}
