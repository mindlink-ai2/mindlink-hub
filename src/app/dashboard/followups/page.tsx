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

  // UX only: close on Escape + lock scroll when panel open (no business logic)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenLead(null);
    };
    window.addEventListener("keydown", onKeyDown);

    if (openLead) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [openLead]);

  const formatDateFR = (d: any) => {
    try {
      return new Date(d).toLocaleDateString("fr-FR");
    } catch {
      return "—";
    }
  };

  const leadDisplayName = (lead: any) =>
    `${lead.FirstName || lead.title || "—"} ${lead.LastName || ""}`.trim();

  const LeadCard = ({ lead, tone }: any) => {
    // tone is purely visual
    const toneRing =
      tone === "overdue"
        ? "hover:border-rose-500/50 hover:shadow-rose-500/10"
        : tone === "today"
        ? "hover:border-indigo-500/55 hover:shadow-indigo-500/10"
        : "hover:border-emerald-500/45 hover:shadow-emerald-500/10";

    const badge =
      tone === "overdue"
        ? "Retard"
        : tone === "today"
        ? "Aujourd’hui"
        : "À venir";

    const badgeStyle =
      tone === "overdue"
        ? "bg-rose-500/10 text-rose-300 border-rose-500/20"
        : tone === "today"
        ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/20"
        : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";

    return (
      <button
        type="button"
        onClick={() => setOpenLead(lead)}
        className={[
          "group w-full text-left",
          "rounded-2xl border border-slate-800/80 bg-slate-900/60",
          "px-4 py-3.5",
          "transition",
          "shadow-sm hover:shadow-lg",
          "focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:ring-offset-0",
          toneRing,
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-slate-50 font-medium truncate">
                {leadDisplayName(lead)}
              </h3>
              <span
                className={[
                  "shrink-0 text-[11px] px-2 py-0.5 rounded-full border",
                  badgeStyle,
                ].join(" ")}
              >
                {badge}
              </span>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <p className="text-slate-400">
                Prochaine relance :{" "}
                <span className="text-slate-200 font-semibold">
                  {formatDateFR(lead.next_followup_at)}
                </span>
              </p>

              {lead.Company && (
                <p className="text-slate-500 truncate max-w-[28ch]">
                  {lead.Company}
                </p>
              )}
            </div>
          </div>

          <div className="shrink-0 text-slate-600 group-hover:text-slate-300 transition">
            <span className="text-xs">Ouvrir</span> <span aria-hidden>→</span>
          </div>
        </div>
      </button>
    );
  };

  const Section = ({ title, subtitle, data, tone }: any) => (
    <section className="rounded-3xl border border-slate-800/70 bg-slate-950/30">
      <div className="px-5 py-4 border-b border-slate-800/60">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">{title}</h2>
            <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <span className="text-xs text-slate-400">Total</span>
            <span className="text-xs font-semibold text-slate-100 px-2 py-1 rounded-lg border border-slate-800 bg-slate-900/60">
              {data.length}
            </span>
          </div>
        </div>
      </div>

      <div className="p-5">
        {data.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800/70 bg-slate-900/30 px-4 py-6">
            <p className="text-sm text-slate-300">Aucune relance ici.</p>
            <p className="text-xs text-slate-500 mt-1">
              Quand une prochaine relance est planifiée, elle apparaîtra dans
              cette section.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {data.map((lead: any) => (
              <LeadCard key={lead.id} lead={lead} tone={tone} />
            ))}
          </div>
        )}
      </div>
    </section>
  );

  const HeaderStat = ({ label, value, variant }: any) => {
    const styles =
      variant === "overdue"
        ? "border-rose-500/20 bg-rose-500/5 text-rose-200"
        : variant === "today"
        ? "border-indigo-500/20 bg-indigo-500/5 text-indigo-200"
        : "border-emerald-500/20 bg-emerald-500/5 text-emerald-200";

    return (
      <div className="rounded-2xl border px-4 py-3 bg-slate-900/40 border-slate-800/70">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400">{label}</p>
          <span className={["text-xs px-2 py-0.5 rounded-full border", styles].join(" ")}>
            {value}
          </span>
        </div>
      </div>
    );
  };

  const Skeleton = () => (
    <div className="space-y-4">
      <div className="h-8 w-56 rounded-xl bg-slate-800/60 animate-pulse" />
      <div className="h-4 w-80 rounded-lg bg-slate-800/50 animate-pulse" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-6">
        <div className="h-16 rounded-2xl bg-slate-900/50 border border-slate-800/70 animate-pulse" />
        <div className="h-16 rounded-2xl bg-slate-900/50 border border-slate-800/70 animate-pulse" />
        <div className="h-16 rounded-2xl bg-slate-900/50 border border-slate-800/70 animate-pulse" />
      </div>

      <div className="space-y-3 mt-8">
        <div className="h-28 rounded-3xl bg-slate-900/40 border border-slate-800/60 animate-pulse" />
        <div className="h-28 rounded-3xl bg-slate-900/40 border border-slate-800/60 animate-pulse" />
        <div className="h-28 rounded-3xl bg-slate-900/40 border border-slate-800/60 animate-pulse" />
      </div>
    </div>
  );

  return (
    <SubscriptionGate supportEmail="contact@mindlink.fr">
      <>
        <div className="relative">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
            {!loaded ? (
              <Skeleton />
            ) : (
              <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-6">
                    <div>
                      <h1 className="text-2xl sm:text-3xl font-semibold text-slate-50 tracking-tight">
                        Relances clients
                      </h1>
                      <p className="text-sm text-slate-400 mt-1">
                        Suivi des relances <span className="text-slate-300">en retard</span>,{" "}
                        <span className="text-slate-300">du jour</span> et{" "}
                        <span className="text-slate-300">à venir</span>.
                      </p>
                    </div>

                    {/* Small contextual hint (visual only) */}
                    <div className="hidden md:flex items-center gap-2 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-800 bg-slate-900/40">
                        <span className="w-2 h-2 rounded-full bg-emerald-400/80" />
                        Cliquez sur une relance pour ouvrir le détail
                      </span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <HeaderStat label="🔥 En retard" value={overdue.length} variant="overdue" />
                    <HeaderStat label="📅 Aujourd’hui" value={todayList.length} variant="today" />
                    <HeaderStat label="⏳ À venir" value={upcoming.length} variant="upcoming" />
                  </div>
                </div>

                {/* Content */}
                <div className="grid grid-cols-1 gap-4">
                  <Section
                    title="🔥 En retard"
                    subtitle="À traiter en priorité pour éviter de perdre le fil."
                    data={overdue}
                    tone="overdue"
                  />
                  <Section
                    title="📅 Aujourd’hui"
                    subtitle="Relances prévues pour la journée."
                    data={todayList}
                    tone="today"
                  />
                  <Section
                    title="⏳ À venir"
                    subtitle="Relances planifiées pour les prochains jours."
                    data={upcoming}
                    tone="upcoming"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Overlay (visual/UX only) */}
          {openLead && (
            <div
              onClick={() => setOpenLead(null)}
              className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-40"
            />
          )}

          {/* SIDEBAR */}
          {openLead && (
            <div
              className="
                fixed right-0 top-0 h-full w-full sm:w-[420px]
                bg-slate-900/95 backdrop-blur-xl
                border-l border-slate-800 z-50
                shadow-[0_0_40px_-10px_rgba(99,102,241,0.35)]
                animate-slideLeft
              "
              role="dialog"
              aria-modal="true"
            >
              <div className="h-full flex flex-col">
                {/* Top bar */}
                <div className="p-5 border-b border-slate-800/70">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500">Détail de la relance</p>
                      <h2 className="text-xl font-semibold text-slate-50 truncate mt-1">
                        {openLead.FirstName || openLead.title} {openLead.LastName || ""}
                      </h2>
                      <p className="text-slate-400 text-sm mt-1">
                        Prochaine relance :{" "}
                        <span className="text-indigo-300 font-medium">
                          {formatDateFR(openLead.next_followup_at)}
                        </span>
                      </p>
                    </div>

                    <button
                      onClick={() => setOpenLead(null)}
                      className="
                        shrink-0 rounded-xl px-3 py-2 text-xs
                        border border-slate-800 bg-slate-900/40
                        text-slate-300 hover:text-slate-100
                        hover:border-slate-700 transition
                      "
                    >
                      ✕ Fermer
                    </button>
                  </div>

                  {/* Primary CTA */}
                  <button
                    onClick={() => markAsResponded(openLead.id)}
                    className="
                      w-full mt-4 rounded-2xl
                      bg-emerald-600 hover:bg-emerald-500
                      text-sm font-semibold text-white
                      py-2.5 transition
                      shadow-sm hover:shadow-emerald-500/10
                      focus:outline-none focus:ring-2 focus:ring-emerald-400/40
                    "
                  >
                    Marquer comme répondu ✓
                  </button>

                  <p className="text-[11px] text-slate-500 mt-2">
                    Astuce : appuyez sur <span className="text-slate-300">Échap</span> pour fermer.
                  </p>
                </div>

                {/* Content */}
                <div className="p-5 overflow-y-auto">
                  <div className="rounded-2xl border border-slate-800/70 bg-slate-950/20 p-4">
                    <div className="space-y-3 text-sm text-slate-200">
                      {openLead.Company && (
                        <p className="text-slate-200">
                          <span className="text-slate-400">Entreprise</span>
                          <br />
                          <strong className="font-semibold text-slate-100">
                            {openLead.Company}
                          </strong>
                        </p>
                      )}

                      {openLead.email && (
                        <p>
                          <span className="text-slate-400">Email</span>
                          <br />
                          <span className="text-slate-100">{openLead.email}</span>
                        </p>
                      )}

                      {openLead.phoneNumber && (
                        <p>
                          <span className="text-slate-400">Téléphone</span>
                          <br />
                          <span className="text-slate-100">{openLead.phoneNumber}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3">
                    {openLead.LinkedInURL && (
                      <a
                        href={openLead.LinkedInURL}
                        className="
                          group rounded-2xl border border-slate-800/70
                          bg-slate-900/40 px-4 py-3
                          hover:border-sky-500/40 hover:bg-slate-900/60
                          transition
                        "
                        target="_blank"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-slate-500">Lien</p>
                            <p className="text-sm font-semibold text-slate-100">
                              LinkedIn
                            </p>
                          </div>
                          <span className="text-sky-400 group-hover:text-sky-300 transition">
                            Voir →
                          </span>
                        </div>
                      </a>
                    )}

                    {openLead.placeUrl && (
                      <a
                        href={openLead.placeUrl}
                        className="
                          group rounded-2xl border border-slate-800/70
                          bg-slate-900/40 px-4 py-3
                          hover:border-emerald-500/35 hover:bg-slate-900/60
                          transition
                        "
                        target="_blank"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-slate-500">Lien</p>
                            <p className="text-sm font-semibold text-slate-100">
                              Google Maps
                            </p>
                          </div>
                          <span className="text-emerald-400 group-hover:text-emerald-300 transition">
                            Ouvrir →
                          </span>
                        </div>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </>
    </SubscriptionGate>
  );
}