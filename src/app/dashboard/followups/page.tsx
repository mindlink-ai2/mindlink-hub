"use client";

import { useEffect, useState } from "react";
import SubscriptionGate from "@/components/SubscriptionGate";

export default function FollowupsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openLead, setOpenLead] = useState<any>(null);

  // Fetch all leads with followups
  useEffect(() => {
    (async () => {
      const res1 = await fetch("/api/get-leads");
      const res2 = await fetch("/api/get-map-leads");

      const data1 = await res1.json();
      const data2 = await res2.json();

      const merged = [...(data1.leads ?? []), ...(data2.leads ?? [])];

      // Only leads with next_followup_at
      const filtered = merged.filter((l) => l.next_followup_at != null);

      setLeads(filtered);
      setLoaded(true);
    })();
  }, []);

  // Paris timezone date
  const today = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" })
  );

  // 🔧 FIX 1 : éviter crash si la date n’est pas une string
  const cleanDate = (d: any) => {
    if (!d || typeof d !== "string") return new Date("2100-01-01");
    return new Date(d.split("T")[0] + "T00:00:00");
  };

  const overdue = leads.filter(
    (l) => cleanDate(l.next_followup_at) < cleanDate(today.toISOString())
  );
  const todayList = leads.filter(
    (l) =>
      cleanDate(l.next_followup_at).getTime() ===
      cleanDate(today.toISOString()).getTime()
  );
  const upcoming = leads.filter(
    (l) => cleanDate(l.next_followup_at) > cleanDate(today.toISOString())
  );

  // 🔵 Fonction : marquer comme répondu (LinkedIn OU Maps)
  const markAsResponded = async (leadId: string) => {
    // 🔧 FIX 2 : éviter crash si openLead est null
    const isMapLead = !!openLead?.placeUrl;

    const endpoint = isMapLead
      ? "/api/map-leads/responded"
      : "/api/leads/responded";

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId }),
    });

    if (res.ok) {
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
      setOpenLead(null);
    }
  };

  const LeadCard = ({ lead, tone }: any) => {
    const name = `${lead.FirstName || lead.title || "—"} ${lead.LastName || ""}`.trim();
    const dateLabel = new Date(lead.next_followup_at).toLocaleDateString("fr-FR");
    const sourceLabel = lead.placeUrl ? "Google Maps" : "LinkedIn";
    const company = lead.Company;

    const toneStyles =
      tone === "overdue"
        ? "border-rose-500/30 hover:border-rose-400/60 shadow-rose-500/10"
        : tone === "today"
        ? "border-amber-500/30 hover:border-amber-400/60 shadow-amber-500/10"
        : "border-slate-800 hover:border-indigo-500/50 shadow-indigo-500/10";

    const badgeStyles =
      tone === "overdue"
        ? "bg-rose-500/10 text-rose-300 border-rose-500/20"
        : tone === "today"
        ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
        : "bg-slate-700/30 text-slate-200 border-slate-600/30";

    return (
      <button
        type="button"
        onClick={() => setOpenLead(lead)}
        className={`
          group w-full text-left
          rounded-2xl border ${toneStyles}
          bg-slate-900/60 hover:bg-slate-900
          transition shadow-sm hover:shadow-lg
          p-5 md:p-6
          focus:outline-none focus:ring-2 focus:ring-indigo-500/60
        `}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-slate-50 font-semibold truncate">{name}</h3>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={`
                  inline-flex items-center gap-1.5
                  px-2.5 py-1 rounded-full text-[11px]
                  border ${badgeStyles}
                `}
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                {sourceLabel}
              </span>

              {company && (
                <span className="text-slate-400 text-xs truncate max-w-[260px]">
                  {company}
                </span>
              )}
            </div>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-[11px] text-slate-400">Relance</p>
            <p className="text-sm font-semibold text-slate-100">{dateLabel}</p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Cliquez pour ouvrir le détail
          </p>
          <span className="text-xs text-slate-300 opacity-0 group-hover:opacity-100 transition">
            Ouvrir →
          </span>
        </div>
      </button>
    );
  };

  const Section = ({ title, subtitle, data, tone }: any) => (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg md:text-xl font-semibold text-slate-50">
            {title}
          </h2>
          {subtitle && (
            <p className="text-slate-400 text-sm mt-1">{subtitle}</p>
          )}
        </div>

        <div className="text-sm text-slate-400">
          <span className="px-2 py-1 rounded-full bg-slate-900/60 border border-slate-800">
            {data.length} {data.length > 1 ? "relances" : "relance"}
          </span>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
          <p className="text-slate-400 text-sm">Aucune relance ici ✅</p>
          <p className="text-slate-600 text-xs mt-1">
            Quand une prochaine date de relance est définie, elle apparaîtra automatiquement.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {data.map((lead: any) => (
            <LeadCard key={lead.id} lead={lead} tone={tone} />
          ))}
        </div>
      )}
    </div>
  );

  // Loading state (UX premium)
  if (!loaded) {
    return (
      <SubscriptionGate supportEmail="contact@mindlink.fr">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-10">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-6 md:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="h-7 w-56 bg-slate-800/60 rounded-lg animate-pulse" />
                <div className="mt-3 h-4 w-80 bg-slate-800/50 rounded-md animate-pulse" />
              </div>
              <div className="h-9 w-28 bg-slate-800/50 rounded-xl animate-pulse" />
            </div>

            <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6"
                >
                  <div className="h-5 w-52 bg-slate-800/60 rounded-md animate-pulse" />
                  <div className="mt-3 h-4 w-40 bg-slate-800/50 rounded-md animate-pulse" />
                  <div className="mt-6 h-4 w-24 bg-slate-800/40 rounded-md animate-pulse" />
                </div>
              ))}
            </div>

            <p className="text-slate-500 text-sm mt-6">Chargement des relances…</p>
          </div>
        </div>
      </SubscriptionGate>
    );
  }

  return (
    <SubscriptionGate supportEmail="contact@mindlink.fr">
      <>
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-10">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div className="space-y-2">
              <h1 className="text-2xl md:text-3xl font-semibold text-slate-50 tracking-tight">
                Relances
              </h1>
              <p className="text-slate-400 text-sm md:text-base">
                Gérez vos relances en priorité : <span className="text-slate-200">en retard</span>,{" "}
                <span className="text-slate-200">aujourd’hui</span>, et{" "}
                <span className="text-slate-200">à venir</span>.
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-2">
                <span className="px-3 py-1 rounded-full text-xs bg-slate-900/60 border border-slate-800 text-slate-300">
                  Aujourd’hui :{" "}
                  <span className="text-slate-100 font-semibold">
                    {today.toLocaleDateString("fr-FR")}
                  </span>
                </span>

                <span className="px-3 py-1 rounded-full text-xs bg-slate-900/60 border border-slate-800 text-slate-300">
                  Total :{" "}
                  <span className="text-slate-100 font-semibold">
                    {leads.length}
                  </span>
                </span>
              </div>
            </div>

            {/* Right summary */}
            <div className="grid grid-cols-3 gap-2 w-full md:w-auto">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                <p className="text-[11px] text-slate-400">En retard</p>
                <p className="text-xl font-semibold text-slate-50 mt-1">
                  {overdue.length}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                <p className="text-[11px] text-slate-400">Aujourd’hui</p>
                <p className="text-xl font-semibold text-slate-50 mt-1">
                  {todayList.length}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                <p className="text-[11px] text-slate-400">À venir</p>
                <p className="text-xl font-semibold text-slate-50 mt-1">
                  {upcoming.length}
                </p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="mt-10 space-y-10">
            <Section
              title="🔥 En retard"
              subtitle="À traiter en priorité pour ne rien laisser filer."
              data={overdue}
              tone="overdue"
            />
            <Section
              title="📅 Aujourd’hui"
              subtitle="Les relances du jour : rapide à exécuter."
              data={todayList}
              tone="today"
            />
            <Section
              title="⏳ À venir"
              subtitle="Gardez une vue claire sur les prochaines actions."
              data={upcoming}
              tone="upcoming"
            />
          </div>

          {/* Hint */}
          <div className="mt-10 rounded-3xl border border-slate-800 bg-slate-900/30 p-6">
            <p className="text-slate-300 text-sm">
              Astuce : cliquez sur une relance pour ouvrir le détail et{" "}
              <span className="text-slate-100 font-semibold">marquer comme répondu</span>.
            </p>
            <p className="text-slate-500 text-xs mt-1">
              Les relances marquées comme répondu disparaissent automatiquement de la liste.
            </p>
          </div>
        </div>

        {/* Sidebar (garde EXACTEMENT la logique : openLead, close, markAsResponded) */}
        {openLead && (
          <>
            {/* Overlay */}
            <button
              type="button"
              onClick={() => setOpenLead(null)}
              className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40 cursor-default"
              aria-label="Fermer"
            />

            <div
              className="
                fixed right-0 top-0 h-full w-full sm:w-[460px]
                bg-slate-950/80 backdrop-blur-xl
                border-l border-slate-800 z-50
                shadow-[0_0_60px_-15px_rgba(99,102,241,0.45)]
              "
            >
              <div className="h-full flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-slate-800">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-400">Détail de la relance</p>
                      <h2 className="text-xl md:text-2xl font-semibold text-slate-50 truncate mt-1">
                        {openLead.FirstName || openLead.title} {openLead.LastName || ""}
                      </h2>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="px-3 py-1 rounded-full text-xs bg-slate-900/70 border border-slate-800 text-slate-300">
                          Prochaine relance :{" "}
                          <span className="text-indigo-300 font-semibold">
                            {new Date(openLead.next_followup_at).toLocaleDateString("fr-FR")}
                          </span>
                        </span>

                        <span className="px-3 py-1 rounded-full text-xs bg-slate-900/70 border border-slate-800 text-slate-300">
                          Source :{" "}
                          <span className="text-slate-100 font-semibold">
                            {openLead.placeUrl ? "Google Maps" : "LinkedIn"}
                          </span>
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => setOpenLead(null)}
                      className="
                        shrink-0 rounded-xl px-3 py-2 text-xs
                        border border-slate-800 bg-slate-900/40
                        text-slate-300 hover:text-slate-100 hover:bg-slate-900/70
                        transition
                      "
                    >
                      ✕ Fermer
                    </button>
                  </div>

                  {/* CTA */}
                  <button
                    onClick={() => markAsResponded(openLead.id)}
                    className="
                      w-full mt-5
                      rounded-2xl py-3
                      bg-emerald-600 hover:bg-emerald-500
                      text-sm font-semibold text-white
                      transition
                      shadow-lg shadow-emerald-600/15
                    "
                  >
                    Marquer comme répondu ✓
                  </button>

                  <p className="text-slate-500 text-xs mt-2">
                    Une fois marqué comme répondu, le lead est retiré des relances.
                  </p>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto space-y-4">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5">
                    <p className="text-xs text-slate-500">Informations</p>

                    <div className="mt-4 space-y-3 text-sm text-slate-200">
                      {openLead.Company && (
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-slate-400">Entreprise</p>
                          <p className="text-right font-medium text-slate-100">
                            {openLead.Company}
                          </p>
                        </div>
                      )}

                      {openLead.email && (
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-slate-400">Email</p>
                          <p className="text-right font-medium text-slate-100">
                            {openLead.email}
                          </p>
                        </div>
                      )}

                      {openLead.phoneNumber && (
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-slate-400">Téléphone</p>
                          <p className="text-right font-medium text-slate-100">
                            {openLead.phoneNumber}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Links */}
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5">
                    <p className="text-xs text-slate-500">Liens</p>

                    <div className="mt-4 space-y-2">
                      {openLead.LinkedInURL && (
                        <a
                          href={openLead.LinkedInURL}
                          className="
                            block w-full rounded-xl px-4 py-3
                            border border-slate-800 bg-slate-900/50
                            text-slate-200 hover:text-white hover:bg-slate-900
                            transition
                          "
                          target="_blank"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Ouvrir LinkedIn</span>
                            <span className="text-xs text-slate-400">→</span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1 truncate">
                            {openLead.LinkedInURL}
                          </p>
                        </a>
                      )}

                      {openLead.placeUrl && (
                        <a
                          href={openLead.placeUrl}
                          className="
                            block w-full rounded-xl px-4 py-3
                            border border-slate-800 bg-slate-900/50
                            text-slate-200 hover:text-white hover:bg-slate-900
                            transition
                          "
                          target="_blank"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Ouvrir Google Maps</span>
                            <span className="text-xs text-slate-400">→</span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1 truncate">
                            {openLead.placeUrl}
                          </p>
                        </a>
                      )}

                      {!openLead.LinkedInURL && !openLead.placeUrl && (
                        <p className="text-slate-500 text-sm">
                          Aucun lien disponible pour ce lead.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Footer helper */}
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/20 p-5">
                    <p className="text-slate-300 text-sm">
                      Besoin d’aller vite ? Ouvre le lien, répond, puis reviens ici pour marquer comme répondu.
                    </p>
                    <p className="text-slate-500 text-xs mt-2">
                      Lidmeo garde ton suivi clean et actionnable.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </>
    </SubscriptionGate>
  );
}