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
  const totalFollowups = leads.length;

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
    if (!(typeof d === "string" || typeof d === "number" || d instanceof Date)) {
      return "—";
    }

    const parsed = new Date(d);
    if (Number.isNaN(parsed.getTime())) return "—";
    return parsed.toLocaleDateString("fr-FR");
  };

  const leadDisplayName = (lead: FollowupLead) =>
    `${lead.FirstName || lead.title || "—"} ${lead.LastName || ""}`.trim();

  const renderLeadCard = (lead: FollowupLead, tone: TabKey) => {
    const toneRing =
      tone === "overdue"
        ? "hover:border-amber-300 hover:bg-amber-50/80"
        : tone === "today"
        ? "hover:border-[#9cc0ff] hover:bg-[#f3f8ff]"
        : "hover:border-emerald-300 hover:bg-emerald-50/80";

    const badge =
      tone === "overdue" ? "Retard" : tone === "today" ? "Aujourd’hui" : "À venir";

    const badgeStyle =
      tone === "overdue"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "today"
        ? "border-[#d7e3f4] bg-white text-[#51627b]"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";
    const markerStyle =
      tone === "overdue"
        ? "bg-amber-500"
        : tone === "today"
        ? "bg-[#1f5eff]"
        : "bg-emerald-500";

    return (
      <button
        type="button"
        onClick={() => setOpenLead(lead)}
        className={[
          "group w-full text-left relative",
          "rounded-xl border border-[#c8d6ea] bg-[#f7fbff]",
          "px-4 py-3.5",
          "transition duration-200",
          "shadow-[0_16px_28px_-26px_rgba(18,43,86,0.8)]",
          "focus:outline-none focus:ring-2 focus:ring-[#dce8ff] focus:ring-offset-0",
          toneRing,
        ].join(" ")}
      >
        <span className={["absolute left-0 top-0 h-full w-1 rounded-l-xl", markerStyle].join(" ")} />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-semibold text-[#0b1c33]">
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
              <p className="text-[#51627b]">
                Date :{" "}
                <span className="font-semibold text-[#0b1c33]">
                  {formatDateFR(lead.next_followup_at)}
                </span>
              </p>

              {lead.Company && (
                <p className="max-w-[28ch] truncate text-[#51627b]">
                  {lead.Company}
                </p>
              )}
            </div>
          </div>

          <div className="shrink-0 text-[#93a6c1] transition group-hover:text-[#51627b]">
            <span className="text-xs font-medium">Voir</span> <span aria-hidden>→</span>
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
    <section className="overflow-hidden rounded-2xl border border-[#d7e3f4] bg-[#ecf2fa]/75">
      <div className="border-b border-[#d7e3f4] bg-transparent px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-[#0b1c33]">{title}</h2>
            <p className="mt-1 text-xs text-[#51627b]">{subtitle}</p>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <span className="text-xs text-[#51627b]">Total</span>
            <span className="rounded-lg border border-[#d7e3f4] bg-white px-2 py-1 text-xs font-semibold tabular-nums text-[#0b1c33]">
              {data.length}
            </span>
          </div>
        </div>
      </div>

      <div className="p-5">
        {data.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#d7e3f4] bg-[#f8fbff] px-4 py-6">
            <p className="text-sm text-[#334155]">Aucune relance ici.</p>
            <p className="mt-1 text-xs text-[#51627b]">
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
    const chipStyles =
      variant === "overdue"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : variant === "today"
          ? "border-[#c8d6ea] bg-[#f7fbff] text-[#51627b]"
          : "border-emerald-200 bg-emerald-50 text-emerald-700";
    const dotStyles =
      variant === "overdue"
        ? "bg-amber-500"
        : variant === "today"
          ? "bg-[#1f5eff]"
          : "bg-emerald-500";

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
          "border-[#c8d6ea] bg-[#f7fbff] hover:border-[#9cc0ff]",
          "focus:outline-none focus:ring-2 focus:ring-[#dce8ff]",
          isActive ? "border-[#90b5ff] bg-white ring-1 ring-[#dce8ff]" : "",
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-[#51627b]">{label}</p>
          <span className={["h-2 w-2 rounded-full", dotStyles].join(" ")} />
        </div>
        <div className="mt-2 flex items-end justify-between">
          <p className="text-2xl font-semibold tabular-nums text-[#0b1c33]">{value}</p>
          <span
            className={[
              "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
              chipStyles,
            ].join(" ")}
          >
            {value}
          </span>
        </div>
        <p className="mt-1.5 text-[11px] text-[#51627b]">
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
      <div className="h-8 w-56 animate-pulse rounded-xl bg-[#e7f0ff]" />
      <div className="h-4 w-80 animate-pulse rounded-lg bg-[#edf4ff]" />

      <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="h-20 animate-pulse rounded-xl border border-[#d7e3f4] bg-[#f8fbff]" />
        <div className="h-20 animate-pulse rounded-xl border border-[#d7e3f4] bg-[#f8fbff]" />
        <div className="h-20 animate-pulse rounded-xl border border-[#d7e3f4] bg-[#f8fbff]" />
      </div>

      <div className="mt-8 space-y-3">
        <div className="h-28 animate-pulse rounded-xl border border-[#d7e3f4] bg-[#f8fbff]" />
        <div className="h-28 animate-pulse rounded-xl border border-[#d7e3f4] bg-[#f8fbff]" />
        <div className="h-28 animate-pulse rounded-xl border border-[#d7e3f4] bg-[#f8fbff]" />
      </div>
    </div>
  );

  return (
    <SubscriptionGate supportEmail="contact@lidmeo.com">
      <>
        <div className="relative min-h-screen">
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[320px] bg-[radial-gradient(circle_at_20%_0%,rgba(31,94,255,0.14),transparent_56%),radial-gradient(circle_at_80%_0%,rgba(35,196,245,0.12),transparent_48%)]" />

          <div className="mx-auto w-full max-w-[1680px] px-4 py-6 sm:px-6 sm:py-7">
            {!loaded ? (
              renderSkeleton()
            ) : (
              <div className="space-y-5">
                {/* Header */}
                <div className="relative flex flex-col gap-3.5 overflow-hidden rounded-2xl border border-[#d7e3f4] bg-[#ecf2fa]/75 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="hub-chip border-[#c8d6ea] bg-[#f7fbff] font-medium">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#1f5eff]" />
                      Relances Lidmeo
                    </span>
                    <span className="hub-chip border-[#c8d6ea] bg-[#f7fbff] tabular-nums">
                      {totalFollowups} relance(s)
                    </span>
                  </div>

                  <div className="flex items-start justify-between gap-6">
                    <div className="relative">
                      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#0b1c33] sm:text-4xl">
                        Relances clients
                      </h1>
                      <p className="mt-1.5 text-sm text-[#51627b]">
                        Organisez vos suivis en un coup d’œil et traitez en priorité les relances les plus urgentes.
                      </p>
                    </div>

                    <div className="hidden items-center gap-2 text-xs text-[#51627b] md:flex">
                      <span className="inline-flex items-center gap-2 rounded-xl border border-[#c8d6ea] bg-[#f7fbff] px-3 py-2">
                        <span className="h-2 w-2 rounded-full bg-[#1f5eff]" />
                        Cliquez sur une ligne pour ouvrir le détail
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
              className="fixed inset-0 z-40 bg-[#081123]/38 backdrop-blur-[2px]"
            />
          )}

          {/* SIDEBAR */}
          {openLead && (
            <div
              className="
                fixed right-0 top-0 h-full w-full sm:w-[420px]
                bg-white z-50
                border-l border-[#d7e3f4]
                shadow-[0_18px_42px_-22px_rgba(18,43,86,0.45)]
                animate-slideLeft
              "
              role="dialog"
              aria-modal="true"
            >
              <div className="h-full flex flex-col">
                {/* Top bar */}
                <div className="border-b border-[#d7e3f4] bg-[#f8fbff] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-[#51627b]">
                        Détail de la relance
                      </p>
                      <h2 className="mt-1 truncate text-xl font-semibold text-[#0b1c33]">
                        {openLead.FirstName || openLead.title}{" "}
                        {openLead.LastName || ""}
                      </h2>
                      <p className="mt-1 text-sm text-[#51627b]">
                        Prochaine relance :{" "}
                        <span className="font-medium text-[#0b1c33]">
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
                    className="mt-4 w-full"
                  >
                    Marquer comme répondu ✓
                  </HubButton>

                  <p className="mt-2 text-[11px] text-[#51627b]">
                    Astuce : appuyez sur{" "}
                    <span className="text-[#1f5eff]">Échap</span> pour fermer.
                  </p>
                </div>

                {/* Content */}
                <div className="p-5 overflow-y-auto">
                  <div className="hub-card-soft p-4">
                    <div className="space-y-3 text-sm text-[#0b1c33]">
                      {openLead.Company && (
                        <p className="text-[#0b1c33]">
                          <span className="text-[#51627b]">Entreprise</span>
                          <br />
                          <strong className="font-semibold text-[#0b1c33]">
                            {openLead.Company}
                          </strong>
                        </p>
                      )}

                      {openLead.email && (
                        <p>
                          <span className="text-[#51627b]">Email</span>
                          <br />
                          <span className="text-[#0b1c33]">{openLead.email}</span>
                        </p>
                      )}

                      {openLead.phoneNumber && (
                        <p>
                          <span className="text-[#51627b]">Téléphone</span>
                          <br />
                          <span className="text-[#0b1c33]">
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
                          group rounded-xl border border-[#c8d6ea]
                          bg-[#f7fbff] px-4 py-3
                          hover:border-[#9cc0ff] hover:bg-[#f3f8ff]
                          transition
                        "
                        target="_blank"
                        rel="noreferrer"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-[#51627b]">Lien</p>
                            <p className="text-sm font-semibold text-[#0b1c33]">
                              LinkedIn
                            </p>
                          </div>
                          <span className="text-[#6a7f9f] transition group-hover:text-[#36598a]">
                            Voir →
                          </span>
                        </div>
                      </a>
                    )}

                    {openLead.placeUrl && (
                      <a
                        href={openLead.placeUrl}
                        className="
                          group rounded-xl border border-[#c8d6ea]
                          bg-[#f7fbff] px-4 py-3
                          hover:border-[#9cc0ff] hover:bg-[#f3f8ff]
                          transition
                        "
                        target="_blank"
                        rel="noreferrer"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-[#51627b]">Lien</p>
                            <p className="text-sm font-semibold text-[#0b1c33]">
                              Google Maps
                            </p>
                          </div>
                          <span className="text-[#6a7f9f] transition group-hover:text-[#36598a]">
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
