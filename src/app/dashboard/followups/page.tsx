"use client";

import { useEffect, useState } from "react";
import SubscriptionGate from "@/components/SubscriptionGate";

export default function FollowupsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openLead, setOpenLead] = useState<any>(null);

  // UI state (UX only)
  const [tab, setTab] = useState<"overdue" | "today" | "upcoming">("overdue");

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

  const activeData =
    tab === "overdue" ? overdue : tab === "today" ? todayList : upcoming;

  const activeTitle =
    tab === "overdue"
      ? "En retard"
      : tab === "today"
      ? "Aujourd’hui"
      : "À venir";

  const activeSubtitle =
    tab === "overdue"
      ? "À traiter en priorité pour éviter de perdre le fil."
      : tab === "today"
      ? "Relances prévues pour la journée."
      : "Relances planifiées pour les prochains jours.";

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
    // ✅ no red (overdue uses amber)
    const toneRing =
      tone === "overdue"
        ? "hover:border-amber-300/70 hover:shadow-amber-200/60"
        : tone === "today"
        ? "hover:border-[#9dbaf2] hover:shadow-[#d9e5ff]"
        : "hover:border-emerald-300/70 hover:shadow-emerald-200/70";

    const badge =
      tone === "overdue" ? "Retard" : tone === "today" ? "Aujourd’hui" : "À venir";

    const badgeStyle =
      tone === "overdue"
        ? "border-amber-300/70 bg-amber-50 text-amber-700"
        : tone === "today"
        ? "border-[#e3e7ef] bg-[#fbfcfe] text-[#4e5f80]"
        : "border-emerald-300/70 bg-emerald-50 text-emerald-700";

    return (
      <button
        type="button"
        onClick={() => setOpenLead(lead)}
        className={[
          "group w-full text-left",
          "rounded-2xl border border-[#e3e7ef] bg-white",
          "px-4 py-3.5",
          "transition",
          "shadow-sm hover:shadow-md",
          "focus:outline-none focus:ring-2 focus:ring-[#9bb5f8] focus:ring-offset-0",
          toneRing,
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-semibold text-[#1f2a44]">
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
              <p className="text-[#667085]">
                Prochaine relance :{" "}
                <span className="font-semibold text-[#1f2a44]">
                  {formatDateFR(lead.next_followup_at)}
                </span>
              </p>

              {lead.Company && (
                <p className="max-w-[28ch] truncate text-[#667085]">
                  {lead.Company}
                </p>
              )}
            </div>
          </div>

          <div className="shrink-0 text-[#94a0b5] transition group-hover:text-[#667085]">
            <span className="text-xs">Ouvrir</span> <span aria-hidden>→</span>
          </div>
        </div>
      </button>
    );
  };

  const Section = ({ title, subtitle, data, tone }: any) => (
    <section className="rounded-3xl border border-[#e3e7ef] bg-white/95 shadow-sm">
      <div className="border-b border-[#e3e7ef] px-5 py-4 bg-[#fbfcfe]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-[#1f2a44]">{title}</h2>
            <p className="mt-1 text-xs text-[#667085]">{subtitle}</p>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <span className="text-xs text-[#667085]">Total</span>
            <span className="rounded-lg border border-[#e3e7ef] bg-white px-2 py-1 text-xs font-semibold text-[#1f2a44]">
              {data.length}
            </span>
          </div>
        </div>
      </div>

      <div className="p-5">
        {data.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#e3e7ef] bg-[#fbfcfe] px-4 py-6">
            <p className="text-sm text-[#334155]">Aucune relance ici.</p>
            <p className="mt-1 text-xs text-[#667085]">
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
    // ✅ no red (overdue uses amber)
    const styles =
      variant === "overdue"
        ? "border-amber-300/70 bg-amber-50 text-amber-700"
        : variant === "today"
        ? "border-[#e3e7ef] bg-[#fbfcfe] text-[#475467]"
        : "border-emerald-300/70 bg-emerald-50 text-emerald-700";

    const isActive =
      (variant === "overdue" && tab === "overdue") ||
      (variant === "today" && tab === "today") ||
      (variant === "upcoming" && tab === "upcoming");

    return (
      <button
        type="button"
        onClick={() =>
          setTab(
            variant === "overdue"
              ? "overdue"
              : variant === "today"
              ? "today"
              : "upcoming"
          )
        }
        className={[
          "rounded-2xl border px-4 py-3 transition text-left w-full",
          "bg-white border-[#e3e7ef] hover:border-[#cdd3de]",
          "focus:outline-none focus:ring-2 focus:ring-[#9bb5f8]",
          isActive ? "ring-1 ring-[#dbe1ec] border-[#c7cedb]" : "",
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-[#667085]">{label}</p>
          <span
            className={[
              "text-xs px-2 py-0.5 rounded-full border",
              styles,
            ].join(" ")}
          >
            {value}
          </span>
        </div>
        <p className="mt-2 text-[11px] text-[#667085]">
          {variant === "overdue"
            ? "Prioritaire"
            : variant === "today"
            ? "À faire aujourd’hui"
            : "Planifié"}
        </p>
      </button>
    );
  };

  const Skeleton = () => (
    <div className="space-y-4">
      <div className="h-8 w-56 rounded-xl bg-[#e6eaf1] animate-pulse" />
      <div className="h-4 w-80 rounded-lg bg-[#eef2f7] animate-pulse" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-6">
        <div className="h-20 rounded-2xl bg-[#fbfcfe] border border-[#e3e7ef] animate-pulse" />
        <div className="h-20 rounded-2xl bg-[#fbfcfe] border border-[#e3e7ef] animate-pulse" />
        <div className="h-20 rounded-2xl bg-[#fbfcfe] border border-[#e3e7ef] animate-pulse" />
      </div>

      <div className="space-y-3 mt-8">
        <div className="h-28 rounded-3xl bg-[#fbfcfe] border border-[#e3e7ef] animate-pulse" />
        <div className="h-28 rounded-3xl bg-[#fbfcfe] border border-[#e3e7ef] animate-pulse" />
        <div className="h-28 rounded-3xl bg-[#fbfcfe] border border-[#e3e7ef] animate-pulse" />
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
                <div className="flex flex-col gap-4 rounded-[28px] border border-[#e3e7ef] bg-white/95 p-5 shadow-sm sm:p-6">
                  <div className="flex items-start justify-between gap-6">
                    <div>
                      <h1 className="text-2xl sm:text-3xl font-semibold text-[#1f2a44] tracking-tight">
                        Relances clients
                      </h1>
                      <p className="mt-1 text-sm text-[#667085]">
                        Clique sur un bloc pour afficher la liste{" "}
                        <span className="text-[#1f2a44]">En retard</span>,{" "}
                        <span className="text-[#1f2a44]">Aujourd’hui</span> ou{" "}
                        <span className="text-[#1f2a44]">À venir</span>.
                      </p>
                    </div>

                    {/* Small contextual hint (visual only) */}
                    <div className="hidden text-xs text-[#667085] md:flex items-center gap-2">
                      <span className="inline-flex items-center gap-2 rounded-xl border border-[#e3e7ef] bg-white px-3 py-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        Cliquez sur une relance pour ouvrir le détail
                      </span>
                    </div>
                  </div>

                  {/* Clickable tabs */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <HeaderStat
                      label="En retard"
                      value={overdue.length}
                      variant="overdue"
                    />
                    <HeaderStat
                      label="Aujourd’hui"
                      value={todayList.length}
                      variant="today"
                    />
                    <HeaderStat
                      label="À venir"
                      value={upcoming.length}
                      variant="upcoming"
                    />
                  </div>
                </div>

                {/* Active content only */}
                <div className="grid grid-cols-1 gap-4">
                  <Section
                    title={activeTitle}
                    subtitle={activeSubtitle}
                    data={activeData}
                    tone={tab}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Overlay (visual/UX only) */}
          {openLead && (
            <div
              onClick={() => setOpenLead(null)}
              className="fixed inset-0 z-40 bg-[#111827]/30 backdrop-blur-[2px]"
            />
          )}

          {/* SIDEBAR */}
          {openLead && (
            <div
              className="
                fixed right-0 top-0 h-full w-full sm:w-[420px]
                bg-white/95 backdrop-blur-xl
                border-l border-[#e3e7ef] z-50
                shadow-[0_0_40px_-10px_rgba(17,24,39,0.2)]
                animate-slideLeft
              "
              role="dialog"
              aria-modal="true"
            >
              <div className="h-full flex flex-col">
                {/* Top bar */}
                <div className="border-b border-[#e3e7ef] p-5 bg-[#fbfcfe]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-[#667085]">
                        Détail de la relance
                      </p>
                      <h2 className="mt-1 truncate text-xl font-semibold text-[#1f2a44]">
                        {openLead.FirstName || openLead.title}{" "}
                        {openLead.LastName || ""}
                      </h2>
                      <p className="mt-1 text-sm text-[#667085]">
                        Prochaine relance :{" "}
                        <span className="font-medium text-[#1f2a44]">
                          {formatDateFR(openLead.next_followup_at)}
                        </span>
                      </p>
                    </div>

                    <button
                      onClick={() => setOpenLead(null)}
                      className="
                        shrink-0 rounded-xl px-3 py-2 text-xs
                        border border-[#e3e7ef] bg-white
                        text-[#667085] hover:text-[#1f2a44]
                        hover:border-[#cfd5df] transition
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

                  <p className="mt-2 text-[11px] text-[#667085]">
                    Astuce : appuyez sur{" "}
                    <span className="text-[#2d4f80]">Échap</span> pour fermer.
                  </p>
                </div>

                {/* Content */}
                <div className="p-5 overflow-y-auto">
                  <div className="rounded-2xl border border-[#e3e7ef] bg-[#fbfcfe] p-4">
                    <div className="space-y-3 text-sm text-[#1f2a44]">
                      {openLead.Company && (
                        <p className="text-[#1f2a44]">
                          <span className="text-[#667085]">Entreprise</span>
                          <br />
                          <strong className="font-semibold text-[#1f2a44]">
                            {openLead.Company}
                          </strong>
                        </p>
                      )}

                      {openLead.email && (
                        <p>
                          <span className="text-[#667085]">Email</span>
                          <br />
                          <span className="text-[#1f2a44]">{openLead.email}</span>
                        </p>
                      )}

                      {openLead.phoneNumber && (
                        <p>
                          <span className="text-[#667085]">Téléphone</span>
                          <br />
                          <span className="text-[#1f2a44]">
                            {openLead.phoneNumber}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3">
                    {openLead.LinkedInURL && (
                      <a
                        href={openLead.LinkedInURL}
                        className="
                          group rounded-2xl border border-[#e3e7ef]
                          bg-white px-4 py-3
                          hover:border-[#d1d6e0] hover:bg-[#fbfcfe]
                          transition
                        "
                        target="_blank"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-[#667085]">Lien</p>
                            <p className="text-sm font-semibold text-[#1f2a44]">
                              LinkedIn
                            </p>
                          </div>
                          <span className="text-[#667085] transition group-hover:text-[#334155]">
                            Voir →
                          </span>
                        </div>
                      </a>
                    )}

                    {openLead.placeUrl && (
                      <a
                        href={openLead.placeUrl}
                        className="
                          group rounded-2xl border border-[#e3e7ef]
                          bg-white px-4 py-3
                          hover:border-[#d1d6e0] hover:bg-[#fbfcfe]
                          transition
                        "
                        target="_blank"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-[#667085]">Lien</p>
                            <p className="text-sm font-semibold text-[#1f2a44]">
                              Google Maps
                            </p>
                          </div>
                          <span className="text-[#667085] transition group-hover:text-[#334155]">
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
