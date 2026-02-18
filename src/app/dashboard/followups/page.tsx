"use client";

import { useEffect, useState } from "react";
import SubscriptionGate from "@/components/SubscriptionGate";
import { HubButton } from "@/components/ui/hub-button";

type TabKey = "overdue" | "today" | "upcoming";

type FollowupLead = {
  id: string | number;
  next_followup_at?: string | null;
  placeUrl?: string | null;
  FirstName?: string | null;
  LastName?: string | null;
  title?: string | null;
  Company?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  LinkedInURL?: string | null;
  [key: string]: unknown;
};

export default function FollowupsPage() {
  const [leads, setLeads] = useState<FollowupLead[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openLead, setOpenLead] = useState<FollowupLead | null>(null);

  // UI state (UX only)
  const [tab, setTab] = useState<TabKey>("overdue");

  // Fetch all leads with followups
  useEffect(() => {
    (async () => {
      const res1 = await fetch("/api/get-leads");
      const res2 = await fetch("/api/get-map-leads");

      const data1 = await res1.json();
      const data2 = await res2.json();

      const merged = [...(data1.leads ?? []), ...(data2.leads ?? [])] as FollowupLead[];

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
  const cleanDate = (d: unknown) => {
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
  const markAsResponded = async (leadId: string | number) => {
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

  const formatDateFR = (d: unknown) => {
    try {
      return new Date(d).toLocaleDateString("fr-FR");
    } catch {
      return "—";
    }
  };

  const leadDisplayName = (lead: FollowupLead) =>
    `${lead.FirstName || lead.title || "—"} ${lead.LastName || ""}`.trim();

  const renderLeadCard = (lead: FollowupLead, tone: TabKey) => {
    // ✅ no red (overdue uses amber)
    const toneRing =
      tone === "overdue"
        ? "hover:border-amber-200 hover:bg-amber-50/60"
        : tone === "today"
        ? "hover:border-[#bfdbfe] hover:bg-[#f8fbff]"
        : "hover:border-emerald-200 hover:bg-emerald-50/60";

    const badge =
      tone === "overdue" ? "Retard" : tone === "today" ? "Aujourd’hui" : "À venir";

    const badgeStyle =
      tone === "overdue"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : tone === "today"
        ? "border-[#dbe5f3] bg-white text-[#475569]"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";

    return (
      <button
        type="button"
        onClick={() => setOpenLead(lead)}
        className={[
          "group w-full text-left",
          "rounded-xl border border-[#dbe5f3] bg-white",
          "px-4 py-4",
          "transition",
          "shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
          "focus:outline-none focus:ring-2 focus:ring-[#bfdbfe] focus:ring-offset-0",
          toneRing,
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-semibold text-[#0F172A]">
                {leadDisplayName(lead)}
              </h3>
              <span
                className={[
                  "shrink-0 rounded-full border px-2 py-0.5 text-[11px]",
                  badgeStyle,
                ].join(" ")}
              >
                {badge}
              </span>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <p className="text-[#4B5563]">
                Prochaine relance :{" "}
                <span className="font-semibold text-[#0F172A]">
                  {formatDateFR(lead.next_followup_at)}
                </span>
              </p>

              {lead.Company && (
                <p className="max-w-[28ch] truncate text-[#4B5563]">
                  {lead.Company}
                </p>
              )}
            </div>
          </div>

          <div className="shrink-0 text-[#94a3b8] transition group-hover:text-[#4B5563]">
            <span className="text-xs">Ouvrir</span> <span aria-hidden>→</span>
          </div>
        </div>
      </button>
    );
  };

  const renderSection = ({
    title,
    subtitle,
    data,
    tone,
  }: {
    title: string;
    subtitle: string;
    data: FollowupLead[];
    tone: TabKey;
  }) => (
    <section className="hub-card overflow-hidden">
      <div className="border-b border-[#e2e8f0] bg-[#f8fbff] px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-[#0F172A]">{title}</h2>
            <p className="mt-1 text-xs text-[#4B5563]">{subtitle}</p>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <span className="text-xs text-[#4B5563]">Total</span>
            <span className="rounded-lg border border-[#dbe5f3] bg-white px-2 py-1 text-xs font-semibold text-[#0F172A]">
              {data.length}
            </span>
          </div>
        </div>
      </div>

      <div className="p-5">
        {data.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#dbe5f3] bg-[#f8fbff] px-4 py-6">
            <p className="text-sm text-[#334155]">Aucune relance ici.</p>
            <p className="mt-1 text-xs text-[#4B5563]">
              Quand une prochaine relance est planifiée, elle apparaîtra dans
              cette section.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {data.map((lead) => (
              <div key={lead.id}>{renderLeadCard(lead, tone)}</div>
            ))}
          </div>
        )}
      </div>
    </section>
  );

  const renderHeaderStat = ({
    label,
    value,
    variant,
  }: {
    label: string;
    value: number;
    variant: TabKey;
  }) => {
    // ✅ no red (overdue uses amber)
    const styles =
      variant === "overdue"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : variant === "today"
        ? "border-[#dbe5f3] bg-white text-[#475569]"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";

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
          "w-full rounded-xl border px-4 py-3 text-left transition",
          "bg-white border-[#dbe5f3] hover:border-[#bfdbfe]",
          "focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]",
          isActive ? "ring-1 ring-[#dbeafe] border-[#93c5fd]" : "",
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-[#4B5563]">{label}</p>
          <span
            className={[
              "rounded-full border px-2 py-0.5 text-xs",
              styles,
            ].join(" ")}
          >
            {value}
          </span>
        </div>
        <p className="mt-2 text-[11px] text-[#4B5563]">
          {variant === "overdue"
            ? "Prioritaire"
            : variant === "today"
            ? "À faire aujourd’hui"
            : "Planifié"}
        </p>
      </button>
    );
  };

  const renderSkeleton = () => (
    <div className="space-y-4">
      <div className="h-8 w-56 rounded-xl bg-[#e5edf8] animate-pulse" />
      <div className="h-4 w-80 rounded-lg bg-[#edf3fb] animate-pulse" />

      <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="h-20 rounded-xl border border-[#dbe5f3] bg-[#f8fbff] animate-pulse" />
        <div className="h-20 rounded-xl border border-[#dbe5f3] bg-[#f8fbff] animate-pulse" />
        <div className="h-20 rounded-xl border border-[#dbe5f3] bg-[#f8fbff] animate-pulse" />
      </div>

      <div className="mt-8 space-y-3">
        <div className="h-28 rounded-xl border border-[#dbe5f3] bg-[#f8fbff] animate-pulse" />
        <div className="h-28 rounded-xl border border-[#dbe5f3] bg-[#f8fbff] animate-pulse" />
        <div className="h-28 rounded-xl border border-[#dbe5f3] bg-[#f8fbff] animate-pulse" />
      </div>
    </div>
  );

  return (
    <SubscriptionGate supportEmail="contact@mindlink.fr">
      <>
        <div className="relative min-h-screen">
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[320px] bg-[radial-gradient(circle_at_20%_0%,rgba(37,99,235,0.12),transparent_56%),radial-gradient(circle_at_80%_0%,rgba(14,165,233,0.12),transparent_48%)]" />

          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            {!loaded ? (
              renderSkeleton()
            ) : (
              <div className="space-y-6">
                {/* Header */}
                <div className="hub-card-hero flex flex-col gap-4 p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-6">
                    <div>
                      <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A] sm:text-3xl">
                        Relances clients
                      </h1>
                      <p className="mt-1 text-sm text-[#4B5563]">
                        Clique sur un bloc pour afficher la liste{" "}
                        <span className="text-[#0F172A]">En retard</span>,{" "}
                        <span className="text-[#0F172A]">Aujourd’hui</span> ou{" "}
                        <span className="text-[#0F172A]">À venir</span>.
                      </p>
                    </div>

                    {/* Small contextual hint (visual only) */}
                    <div className="hidden items-center gap-2 text-xs text-[#4B5563] md:flex">
                      <span className="inline-flex items-center gap-2 rounded-xl border border-[#dbe5f3] bg-white px-3 py-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        Cliquez sur une relance pour ouvrir le détail
                      </span>
                    </div>
                  </div>

                  {/* Clickable tabs */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {renderHeaderStat({
                      label: "En retard",
                      value: overdue.length,
                      variant: "overdue",
                    })}
                    {renderHeaderStat({
                      label: "Aujourd’hui",
                      value: todayList.length,
                      variant: "today",
                    })}
                    {renderHeaderStat({
                      label: "À venir",
                      value: upcoming.length,
                      variant: "upcoming",
                    })}
                  </div>
                </div>

                {/* Active content only */}
                <div className="grid grid-cols-1 gap-4">
                  {renderSection({
                    title: activeTitle,
                    subtitle: activeSubtitle,
                    data: activeData,
                    tone: tab,
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Overlay (visual/UX only) */}
          {openLead && (
            <div
              onClick={() => setOpenLead(null)}
              className="fixed inset-0 z-40 bg-[#0F172A]/38 backdrop-blur-[2px]"
            />
          )}

          {/* SIDEBAR */}
          {openLead && (
            <div
              className="
                fixed right-0 top-0 h-full w-full sm:w-[420px]
                bg-white z-50
                border-l border-[#dbe5f3]
                shadow-[0_18px_42px_-22px_rgba(15,23,42,0.38)]
                animate-slideLeft
              "
              role="dialog"
              aria-modal="true"
            >
              <div className="h-full flex flex-col">
                {/* Top bar */}
                <div className="border-b border-[#e2e8f0] bg-[#f8fbff] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-[#4B5563]">
                        Détail de la relance
                      </p>
                      <h2 className="mt-1 truncate text-xl font-semibold text-[#0F172A]">
                        {openLead.FirstName || openLead.title}{" "}
                        {openLead.LastName || ""}
                      </h2>
                      <p className="mt-1 text-sm text-[#4B5563]">
                        Prochaine relance :{" "}
                        <span className="font-medium text-[#0F172A]">
                          {formatDateFR(openLead.next_followup_at)}
                        </span>
                      </p>
                    </div>

                    <HubButton variant="ghost" size="sm" onClick={() => setOpenLead(null)}>
                      Fermer
                    </HubButton>
                  </div>

                  {/* Primary CTA */}
                  <HubButton
                    onClick={() => markAsResponded(openLead.id)}
                    variant="primary"
                    size="lg"
                    className="mt-4 w-full border-emerald-600 bg-emerald-600 hover:border-emerald-500 hover:bg-emerald-500"
                  >
                    Marquer comme répondu ✓
                  </HubButton>

                  <p className="mt-2 text-[11px] text-[#4B5563]">
                    Astuce : appuyez sur{" "}
                    <span className="text-[#2563EB]">Échap</span> pour fermer.
                  </p>
                </div>

                {/* Content */}
                <div className="p-5 overflow-y-auto">
                  <div className="hub-card-soft p-4">
                    <div className="space-y-3 text-sm text-[#0F172A]">
                      {openLead.Company && (
                        <p className="text-[#0F172A]">
                          <span className="text-[#4B5563]">Entreprise</span>
                          <br />
                          <strong className="font-semibold text-[#0F172A]">
                            {openLead.Company}
                          </strong>
                        </p>
                      )}

                      {openLead.email && (
                        <p>
                          <span className="text-[#4B5563]">Email</span>
                          <br />
                          <span className="text-[#0F172A]">{openLead.email}</span>
                        </p>
                      )}

                      {openLead.phoneNumber && (
                        <p>
                          <span className="text-[#4B5563]">Téléphone</span>
                          <br />
                          <span className="text-[#0F172A]">
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
                          group rounded-xl border border-[#dbe5f3]
                          bg-white px-4 py-3
                          hover:border-[#bfdbfe] hover:bg-[#f8fbff]
                          transition
                        "
                        target="_blank"
                        rel="noreferrer"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-[#4B5563]">Lien</p>
                            <p className="text-sm font-semibold text-[#0F172A]">
                              LinkedIn
                            </p>
                          </div>
                          <span className="text-[#64748b] transition group-hover:text-[#334155]">
                            Voir →
                          </span>
                        </div>
                      </a>
                    )}

                    {openLead.placeUrl && (
                      <a
                        href={openLead.placeUrl}
                        className="
                          group rounded-xl border border-[#dbe5f3]
                          bg-white px-4 py-3
                          hover:border-[#bfdbfe] hover:bg-[#f8fbff]
                          transition
                        "
                        target="_blank"
                        rel="noreferrer"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-[#4B5563]">Lien</p>
                            <p className="text-sm font-semibold text-[#0F172A]">
                              Google Maps
                            </p>
                          </div>
                          <span className="text-[#64748b] transition group-hover:text-[#334155]">
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

        <style jsx global>{`
          @keyframes slideLeft {
            from {
              transform: translateX(24px);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
          .animate-slideLeft {
            animation: slideLeft 180ms ease-out;
          }
        `}</style>
      </>
    </SubscriptionGate>
  );
}
