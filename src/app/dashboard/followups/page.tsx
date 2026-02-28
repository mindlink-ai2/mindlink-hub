"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronRight } from "lucide-react";
import SubscriptionGate from "@/components/SubscriptionGate";
import { HubButton } from "@/components/ui/hub-button";
import MobileLayout from "@/components/mobile/MobileLayout";
import MobilePageHeader from "@/components/mobile/MobilePageHeader";
import MobileChipsFilters from "@/components/mobile/MobileChipsFilters";
import MobileSheet from "@/components/mobile/MobileSheet";
import MobileSheetHeader from "@/components/mobile/MobileSheetHeader";
import MobileEmptyState from "@/components/mobile/MobileEmptyState";
import MobileSkeleton from "@/components/mobile/MobileSkeleton";

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
  const [mobileDateFilterSheetOpen, setMobileDateFilterSheetOpen] = useState(false);
  const [mobileDateFilter, setMobileDateFilter] = useState("");
  const [reprogramDate, setReprogramDate] = useState("");
  const [reprogramming, setReprogramming] = useState(false);
  const [reprogramError, setReprogramError] = useState<string | null>(null);

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

  const mobileFilterOptions = useMemo(
    () => [
      { key: "overdue" as const, label: "En retard", count: overdue.length },
      { key: "today" as const, label: "Aujourd'hui", count: todayList.length },
      { key: "upcoming" as const, label: "À venir", count: upcoming.length },
    ],
    [overdue.length, todayList.length, upcoming.length]
  );

  const mobileActiveData = useMemo(() => {
    if (!mobileDateFilter) return activeData;
    const selectedDate = cleanDate(`${mobileDateFilter}T00:00:00.000Z`).getTime();
    return activeData.filter(
      (lead) => cleanDate(lead.next_followup_at).getTime() === selectedDate
    );
  }, [activeData, mobileDateFilter]);

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

  const handleReprogramFollowup = async () => {
    if (!openLead || !reprogramDate || reprogramming) return;

    setReprogramming(true);
    setReprogramError(null);

    try {
      const res = await fetch("/api/followups/reprogram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: openLead.id,
          source: openLead.placeUrl ? "maps" : "linkedin",
          nextFollowupDate: reprogramDate,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error ?? "Impossible de reprogrammer la relance.");
      }

      const nextIso = typeof data?.next_followup_at === "string"
        ? data.next_followup_at
        : `${reprogramDate}T08:00:00.000Z`;

      setLeads((prev) =>
        prev.map((lead) =>
          String(lead.id) === String(openLead.id)
            ? { ...lead, next_followup_at: nextIso }
            : lead
        )
      );

      setOpenLead((prev) => (prev ? { ...prev, next_followup_at: nextIso } : prev));
      setReprogramDate("");
    } catch (error: unknown) {
      setReprogramError(
        error instanceof Error ? error.message : "Impossible de reprogrammer la relance."
      );
    } finally {
      setReprogramming(false);
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

  useEffect(() => {
    if (!openLead?.next_followup_at) {
      setReprogramDate("");
      return;
    }

    const parsed = new Date(openLead.next_followup_at);
    if (Number.isNaN(parsed.getTime())) {
      setReprogramDate("");
      return;
    }

    const yyyy = parsed.getFullYear();
    const mm = `${parsed.getMonth() + 1}`.padStart(2, "0");
    const dd = `${parsed.getDate()}`.padStart(2, "0");
    setReprogramDate(`${yyyy}-${mm}-${dd}`);
  }, [openLead?.id, openLead?.next_followup_at]);

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

  const formatFollowupRecency = (d: unknown) => {
    if (!(typeof d === "string" || typeof d === "number" || d instanceof Date)) return null;

    const target = new Date(d);
    if (Number.isNaN(target.getTime())) return null;

    const todayStart = cleanDate(today.toISOString());
    const targetStart = cleanDate(target.toISOString());
    const diffDays = Math.floor(
      (targetStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) return "Aujourd'hui";
    if (diffDays === 1) return "Demain";
    if (diffDays > 1) return `Dans ${diffDays}j`;
    if (diffDays === -1) return "Hier";
    return `Il y a ${Math.abs(diffDays)}j`;
  };

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
    <section>
      <div className="px-1 py-1">
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

      <div className="pt-3">
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
      <div className="relative h-full min-h-0">
        <MobileLayout>
          {loaded ? (
            <>
              <MobilePageHeader
                title="Relances"
                subtitle={`${totalFollowups} relance(s) à suivre`}
                actions={
                  <button
                    type="button"
                    onClick={() => setMobileDateFilterSheetOpen(true)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#d7e3f4] bg-white px-2.5 text-[11px] font-medium text-[#4b647f] transition hover:bg-[#f7fbff] focus:outline-none focus:ring-2 focus:ring-[#dce8ff]"
                    aria-label="Filtrer par date"
                  >
                    <CalendarDays className="h-3.5 w-3.5" />
                    Date
                  </button>
                }
              />

              <MobileChipsFilters
                options={mobileFilterOptions}
                activeKey={tab}
                onChange={(key) => setTab(key)}
                ariaLabel="Filtres relances"
              />

              <div className="rounded-xl border border-[#d7e3f4] bg-[#f8fbff] px-3 py-2 text-[12px] text-[#5f7693]">
                {activeTitle} · {mobileActiveData.length} résultat(s)
                {mobileDateFilter ? (
                  <span className="ml-1">
                    · {new Date(`${mobileDateFilter}T00:00:00`).toLocaleDateString("fr-FR")}
                  </span>
                ) : null}
              </div>

              <div className="space-y-2">
                {mobileActiveData.length === 0 ? (
                  <MobileEmptyState
                    title="Aucune relance"
                    description="Ajustez vos filtres ou changez de période."
                    action={
                      mobileDateFilter ? (
                        <button
                          type="button"
                          onClick={() => setMobileDateFilter("")}
                          className="inline-flex items-center justify-center rounded-xl border border-[#d7e3f4] bg-[#f8fbff] px-3 py-2 text-[12px] font-medium text-[#35547a] transition hover:bg-[#eef4fd] focus:outline-none focus:ring-2 focus:ring-[#dce8ff]"
                        >
                          Effacer la date
                        </button>
                      ) : null
                    }
                  />
                ) : (
                  mobileActiveData.map((lead) => {
                    const followupDate = formatDateFR(lead.next_followup_at);
                    const recency = formatFollowupRecency(lead.next_followup_at);

                    return (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => setOpenLead(lead)}
                        className="flex w-full items-center justify-between gap-2 rounded-xl border border-[#d7e3f4] bg-white px-3 py-2 text-left shadow-[0_10px_18px_-18px_rgba(18,43,86,0.68)] transition hover:bg-[#f9fbff] focus:outline-none focus:ring-2 focus:ring-[#dce8ff]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-[14px] font-medium leading-tight text-[#0b1c33]">
                              {leadDisplayName(lead)}
                            </p>
                            <span className="rounded-full border border-[#d7e3f4] bg-[#f5f9ff] px-2 py-0.5 text-[10px] text-[#4b647f]">
                              {followupDate}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-[12px] text-[#5f7693]">
                            {(lead.Company ?? "").trim() || "Entreprise non renseignée"}
                          </p>
                          {recency ? (
                            <p className="mt-0.5 text-[11px] text-[#7a8fa9]">{recency}</p>
                          ) : null}
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-[#9bb0c8]" />
                      </button>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <>
              <MobilePageHeader title="Relances" subtitle="Chargement des relances..." />
              <MobileSkeleton rows={8} />
            </>
          )}
        </MobileLayout>

        <div className="hidden md:block">
          <div className="mx-auto h-full min-h-0 w-full max-w-[1680px] px-4 py-6 sm:px-6 sm:py-7">
            {!loaded ? (
              renderSkeleton()
            ) : (
              <div className="space-y-5">
                {/* Header */}
                <div className="relative flex flex-col gap-3.5 p-0">
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
                      <h1 className="hub-page-title mt-1">
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
        </div>

        {/* Overlay (visual/UX only) */}
        {openLead && (
          <div
            onClick={() => setOpenLead(null)}
            className="fixed inset-0 z-40 hidden bg-[#081123]/38 backdrop-blur-[2px] md:block"
          />
        )}

        {/* Desktop sidebar */}
        {openLead && (
          <div
            className="
              fixed right-0 top-0 z-50 hidden h-full w-full
              border-l border-[#d7e3f4] bg-white shadow-[0_18px_42px_-22px_rgba(18,43,86,0.45)]
              animate-slideLeft md:block sm:w-[420px]
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
              <div className="overflow-y-auto p-5">
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

        <MobileSheet open={Boolean(openLead)} onClose={() => setOpenLead(null)}>
          {openLead ? (
            <>
              <MobileSheetHeader
                title={leadDisplayName(openLead)}
                subtitle="Fiche prospect"
                onClose={() => setOpenLead(null)}
              />
              <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
                <div className="rounded-xl border border-[#d7e3f4] bg-[#f8fbff] px-3 py-3">
                  <p className="text-[12px] text-[#607894]">Prochaine relance</p>
                  <p className="mt-1 text-[14px] font-medium text-[#0b1c33]">
                    {formatDateFR(openLead.next_followup_at)}
                  </p>
                  <p className="mt-1 text-[11px] text-[#7a8fa9]">
                    {formatFollowupRecency(openLead.next_followup_at) ?? "Date à confirmer"}
                  </p>
                </div>

                <div className="space-y-2 rounded-xl border border-[#d7e3f4] bg-white px-3 py-3">
                  <p className="text-[12px] text-[#607894]">Coordonnées</p>
                  <p className="text-[13px] text-[#0b1c33]">
                    {(openLead.Company ?? "").trim() || "Entreprise non renseignée"}
                  </p>
                  {openLead.email ? (
                    <a className="block truncate text-[13px] text-[#1f5eff]" href={`mailto:${openLead.email}`}>
                      {openLead.email}
                    </a>
                  ) : null}
                  {openLead.phoneNumber ? (
                    <a className="block text-[13px] text-[#1f5eff]" href={`tel:${openLead.phoneNumber}`}>
                      {openLead.phoneNumber}
                    </a>
                  ) : null}
                  {openLead.LinkedInURL ? (
                    <a
                      href={openLead.LinkedInURL}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex text-[12px] font-medium text-[#1f5eff]"
                    >
                      Ouvrir LinkedIn
                    </a>
                  ) : null}
                </div>

                <div className="space-y-2 rounded-xl border border-[#d7e3f4] bg-white px-3 py-3">
                  <p className="text-[12px] text-[#607894]">Reprogrammer</p>
                  <input
                    type="date"
                    value={reprogramDate}
                    onChange={(event) => setReprogramDate(event.target.value)}
                    className="h-10 w-full rounded-xl border border-[#d7e3f4] bg-[#f8fbff] px-3 text-[13px] text-[#0b1c33] outline-none transition focus:border-[#9ec0ff] focus:ring-2 focus:ring-[#dce8ff]"
                  />
                  {reprogramError ? (
                    <p className="text-[11px] text-red-600">{reprogramError}</p>
                  ) : null}
                </div>
              </div>

              <div className="sticky bottom-0 border-t border-[#d7e3f4] bg-white px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)]">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleReprogramFollowup}
                    disabled={!reprogramDate || reprogramming}
                    className="inline-flex h-10 flex-1 items-center justify-center rounded-xl border border-[#d7e3f4] bg-[#f8fbff] px-3 text-[13px] font-medium text-[#34527a] transition hover:bg-[#eef4fd] focus:outline-none focus:ring-2 focus:ring-[#dce8ff] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {reprogramming ? "Reprogrammation..." : "Reprogrammer"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void markAsResponded(openLead.id)}
                    className="inline-flex h-10 flex-1 items-center justify-center gap-1 rounded-xl border border-[#1f5eff] bg-[#1f5eff] px-3 text-[13px] font-medium text-white transition hover:bg-[#174dd4] focus:outline-none focus:ring-2 focus:ring-[#dce8ff]"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Marquer fait
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </MobileSheet>

        <MobileSheet
          open={mobileDateFilterSheetOpen}
          onClose={() => setMobileDateFilterSheetOpen(false)}
          panelClassName="top-[40svh]"
        >
          <MobileSheetHeader
            title="Filtrer par date"
            subtitle="Affinez la liste des relances"
            onClose={() => setMobileDateFilterSheetOpen(false)}
          />
          <div className="flex-1 space-y-3 px-4 py-4">
            <input
              type="date"
              value={mobileDateFilter}
              onChange={(event) => setMobileDateFilter(event.target.value)}
              className="h-10 w-full rounded-xl border border-[#d7e3f4] bg-[#f8fbff] px-3 text-[13px] text-[#0b1c33] outline-none transition focus:border-[#9ec0ff] focus:ring-2 focus:ring-[#dce8ff]"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileDateFilter("")}
                className="inline-flex h-9 flex-1 items-center justify-center rounded-xl border border-[#d7e3f4] bg-white text-[12px] font-medium text-[#4b647f] transition hover:bg-[#f7fbff] focus:outline-none focus:ring-2 focus:ring-[#dce8ff]"
              >
                Réinitialiser
              </button>
              <button
                type="button"
                onClick={() => setMobileDateFilterSheetOpen(false)}
                className="inline-flex h-9 flex-1 items-center justify-center rounded-xl border border-[#1f5eff] bg-[#1f5eff] text-[12px] font-medium text-white transition hover:bg-[#174dd4] focus:outline-none focus:ring-2 focus:ring-[#dce8ff]"
              >
                Appliquer
              </button>
            </div>
          </div>
        </MobileSheet>
      </div>
    </SubscriptionGate>
  );
}
