export default function DashboardPage() {
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-[#00033D] to-[#0600AB] text-white px-6 py-10">

      {/* =============================== */}
      {/* 🔵 TITRE */}
      {/* =============================== */}
      <div className="max-w-6xl mx-auto mb-12">
        <h1 className="text-5xl font-extrabold tracking-tight mb-3">
          Tableau de bord Mindlink
        </h1>
        <p className="text-slate-300 text-lg">
          Votre activité commerciale. Simplifiée, automatisée, amplifiée.
        </p>
      </div>

      {/* =============================== */}
      {/* 🔵 6 KPIs */}
      {/* =============================== */}
      <section className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
        <KPIBlock title="Leads aujourd’hui" />
        <KPIBlock title="Leads cette semaine" />
        <KPIBlock title="Taux de traitement" />
        <KPIBlock title="Emails triés aujourd’hui" />
        <KPIBlock title="Relances à venir" />
        <KPIBlock title="Mindlink Score™" />
      </section>

      {/* =============================== */}
      {/* 🔵 TIMELINE GRAPH */}
      {/* =============================== */}
      <section className="max-w-6xl mx-auto mb-16">
        <SectionTitle title="Évolution de votre activité" />
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 h-[350px]">
          {/* Graph Placeholder */}
          <div className="flex items-center justify-center h-full text-slate-400">
            (Graphique d’activité)
          </div>
        </div>
      </section>

      {/* =============================== */}
      {/* 🔵 ANALYSE IA */}
      {/* =============================== */}
      <section className="max-w-6xl mx-auto mb-16">
        <SectionTitle title="Analyse IA & Recommandations" />
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 min-h-[180px]">
          <p className="text-slate-400 italic">
            (Analyse générée par l’IA…)
          </p>
        </div>
      </section>

      {/* =============================== */}
      {/* 🔵 MINDLINK MAP VIEW */}
      {/* =============================== */}
      <section className="max-w-6xl mx-auto mb-16">
        <SectionTitle title="Mindlink Map – Vue globale" />
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 h-[300px]">
          <div className="flex items-center justify-center h-full text-slate-400">
            (Carte mentale de prospection)
          </div>
        </div>
      </section>

      {/* =============================== */}
      {/* 🔵 TABLEAU DES LEADS */}
      {/* =============================== */}
      <section className="max-w-6xl mx-auto mb-16">
        <SectionTitle title="Vos leads" />
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 min-h-[300px]">
          <p className="text-slate-400 italic">
            (Tableau interactif)
          </p>
        </div>
      </section>

    </div>
  );
}

/* ====================================================== */
/* 🔵 COMPOSANTS BÁSICOS POUR LE SQUELETTE */
/* ====================================================== */

function KPIBlock({ title }: { title: string }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 h-[110px] flex flex-col justify-center">
      <p className="text-slate-300 text-sm mb-1">{title}</p>
      <p className="text-3xl font-bold">—</p>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <h2 className="text-2xl font-bold mb-4 tracking-tight">
      {title}
    </h2>
  );
}
