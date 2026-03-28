"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  MessageSquare,
  Send,
  Settings,
} from "lucide-react";
import { trackBusinessEvent } from "@/lib/analytics/business-client";
import SubscriptionGate from "@/components/SubscriptionGate";
import { HubButton } from "@/components/ui/hub-button";
import MobileLayout from "@/components/mobile/MobileLayout";
import MobilePageHeader from "@/components/mobile/MobilePageHeader";
import MobileChipsFilters from "@/components/mobile/MobileChipsFilters";
import MobileSheet from "@/components/mobile/MobileSheet";
import MobileSheetHeader from "@/components/mobile/MobileSheetHeader";
import MobileEmptyState from "@/components/mobile/MobileEmptyState";
import MobileSkeleton from "@/components/mobile/MobileSkeleton";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Tabs pour le plan essential (inchangé)
type TabKey = "overdue" | "today" | "upcoming";

// Tabs pour le plan full (pas de "En retard")
type FullTabKey = "today" | "upcoming" | "relance_sent" | "responded";

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
  relance_linkedin?: string | null;
  [key: string]: unknown;
};

// Lead retourné par /api/followups/full-plan
type FullPlanLead = {
  id: number | string;
  FirstName?: string | null;
  LastName?: string | null;
  Company?: string | null;
  LinkedInURL?: string | null;
  next_followup_at?: string | null;
  relance_sent_at?: string | null;
  relance_linkedin?: string | null;
  responded?: boolean | null;
  message_sent?: boolean | null;
  message_sent_at?: string | null;
  custom_followup_delay_days?: number | null;
};

type FullPlanData = {
  upcoming: FullPlanLead[];
  today: FullPlanLead[];
  relance_sent: FullPlanLead[];
  responded: FullPlanLead[];
  client_id: number;
};

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default function FollowupsPage() {
  const queryClient = useQueryClient();

  // -------------------------------------------------------------------------
  // Détection du plan
  // -------------------------------------------------------------------------
  const [plan, setPlan] = useState<"essential" | "full" | null>(null);
  const [planLoaded, setPlanLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/billing/status")
      .then((r) => r.json())
      .then((data: { plan?: string | null; subscription_status?: string | null }) => {
        const p = String(data.plan ?? "").trim().toLowerCase();
        const status = String(data.subscription_status ?? "").trim().toLowerCase();
        // plan='full' uniquement si subscription active, sinon traité comme essential
        setPlan(p === "full" && status === "active" ? "full" : "essential");
      })
      .catch(() => setPlan("essential"))
      .finally(() => setPlanLoaded(true));
  }, []);

  useEffect(() => {
    trackBusinessEvent("page_viewed", "navigation", { page: "followups" });
  }, []);

  // -------------------------------------------------------------------------
  // État plan ESSENTIAL (logique inchangée)
  // -------------------------------------------------------------------------
  const [leads, setLeads] = useState<FollowupLead[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openLead, setOpenLead] = useState<FollowupLead | null>(null);
  const [showRelanceLinkedin, setShowRelanceLinkedin] = useState(false);
  const [tab, setTab] = useState<TabKey>("overdue");
  const [mobileDateFilterSheetOpen, setMobileDateFilterSheetOpen] = useState(false);
  const [mobileDateFilter, setMobileDateFilter] = useState("");
  const [reprogramDate, setReprogramDate] = useState("");
  const [reprogramming, setReprogramming] = useState(false);
  const [reprogramError, setReprogramError] = useState<string | null>(null);

  useEffect(() => {
    setShowRelanceLinkedin(false);
  }, [openLead?.id]);

  // Fetch des leads essential — actif uniquement quand plan='essential'
  useEffect(() => {
    if (!planLoaded || plan !== "essential") return;
    (async () => {
      const [data1, data2] = await Promise.all([
        queryClient.fetchQuery({
          queryKey: queryKeys.leads(),
          queryFn: async () => {
            const res = await fetch("/api/get-leads");
            return res.json();
          },
          staleTime: 5 * 60 * 1000,
        }),
        queryClient.fetchQuery({
          queryKey: queryKeys.mapLeads(),
          queryFn: async () => {
            const res = await fetch("/api/get-map-leads");
            return res.json();
          },
          staleTime: 10 * 60 * 1000,
        }),
      ]);

      const merged = [...(data1.leads ?? []), ...(data2.leads ?? [])] as FollowupLead[];
      const filtered = merged.filter((l) => l.next_followup_at != null);
      setLeads(filtered);
      setLoaded(true);
    })();
  }, [planLoaded, plan, queryClient]);

  // -------------------------------------------------------------------------
  // État plan FULL
  // -------------------------------------------------------------------------
  const [fullData, setFullData] = useState<FullPlanData>({
    upcoming: [],
    today: [],
    relance_sent: [],
    responded: [],
    client_id: 0,
  });
  const [fullLoaded, setFullLoaded] = useState(false);
  const [fullTab, setFullTab] = useState<FullTabKey>("today");
  const [openFullLead, setOpenFullLead] = useState<FullPlanLead | null>(null);
  const [showFullRelance, setShowFullRelance] = useState(false);

  // Settings sheet — délai global (plan full uniquement)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [globalDelay, setGlobalDelay] = useState(7);
  const [globalDelayInput, setGlobalDelayInput] = useState("7");
  const [savingGlobalDelay, setSavingGlobalDelay] = useState(false);
  const [globalDelayToast, setGlobalDelayToast] = useState<string | null>(null);

  // Délai par lead dans le sidebar
  const [leadDelayInput, setLeadDelayInput] = useState("");
  const [savingLeadDelay, setSavingLeadDelay] = useState(false);
  const [leadDelayToast, setLeadDelayToast] = useState<string | null>(null);

  useEffect(() => {
    setShowFullRelance(false);
    setLeadDelayToast(null);
    if (!openFullLead) { setLeadDelayInput(""); return; }
    setLeadDelayInput(
      openFullLead.custom_followup_delay_days != null
        ? String(openFullLead.custom_followup_delay_days)
        : ""
    );
  }, [openFullLead?.id]);

  const fetchFullData = () => {
    fetch("/api/followups/full-plan")
      .then((r) => r.json())
      .then((data: FullPlanData) => {
        setFullData(data);
        setFullLoaded(true);
      })
      .catch(() => setFullLoaded(true));
  };

  // Fetch initial pour plan full
  useEffect(() => {
    if (!planLoaded || plan !== "full") return;
    fetchFullData();
  }, [planLoaded, plan]);

  // Fetch du délai global au montage (plan full)
  useEffect(() => {
    if (!planLoaded || plan !== "full") return;
    fetch("/api/followups/settings")
      .then((r) => r.json())
      .then((data: { followup_delay_days?: number }) => {
        const d = typeof data.followup_delay_days === "number" ? data.followup_delay_days : 7;
        setGlobalDelay(d);
        setGlobalDelayInput(String(d));
      })
      .catch(() => {});
  }, [planLoaded, plan]);

  // Realtime : re-fetch quand un lead est modifié (responded, relance_sent_at, next_followup_at)
  useEffect(() => {
    if (plan !== "full" || !fullData.client_id) return;

    const channel = supabase
      .channel(`followups-leads-${fullData.client_id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "leads",
          filter: `client_id=eq.${fullData.client_id}`,
        },
        () => {
          // Re-fetch léger pour resynchroniser toutes les sections
          fetchFullData();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, fullData.client_id]);

  const saveGlobalDelay = async () => {
    const val = parseInt(globalDelayInput, 10);
    if (!Number.isFinite(val) || val < 1 || val > 365) {
      setGlobalDelayToast("Entrez un nombre entre 1 et 365.");
      return;
    }
    setSavingGlobalDelay(true);
    setGlobalDelayToast(null);
    try {
      const res = await fetch("/api/followups/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followup_delay_days: val }),
      });
      if (!res.ok) throw new Error("Erreur serveur");
      setGlobalDelay(val);
      setGlobalDelayToast("✓ Enregistré");
    } catch {
      setGlobalDelayToast("Impossible d'enregistrer.");
    } finally {
      setSavingGlobalDelay(false);
    }
  };

  const applyLeadDelay = async (newDelay: number | null) => {
    if (!openFullLead) return;
    setSavingLeadDelay(true);
    setLeadDelayToast(null);
    try {
      const res = await fetch(`/api/leads/${openFullLead.id}/followup-delay`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ custom_followup_delay_days: newDelay }),
      });
      const data = await res.json().catch(() => ({})) as { lead?: FullPlanLead; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erreur serveur");
      // Mettre à jour le lead ouvert + la liste en mémoire
      const updatedLead: FullPlanLead = {
        ...openFullLead,
        custom_followup_delay_days: newDelay,
        next_followup_at: data.lead?.next_followup_at ?? openFullLead.next_followup_at,
      };
      setOpenFullLead(updatedLead);
      setFullData((prev) => ({
        ...prev,
        upcoming: prev.upcoming.map((l) => String(l.id) === String(openFullLead.id) ? updatedLead : l),
        today: prev.today.map((l) => String(l.id) === String(openFullLead.id) ? updatedLead : l),
      }));
      setLeadDelayInput(newDelay !== null ? String(newDelay) : "");
      setLeadDelayToast("✓ Appliqué");
    } catch (err: unknown) {
      setLeadDelayToast(err instanceof Error ? err.message : "Impossible d'appliquer.");
    } finally {
      setSavingLeadDelay(false);
    }
  };

  // UX: fermer panel full plan sur Escape
  useEffect(() => {
    if (plan !== "full") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenFullLead(null);
        setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    if (openFullLead) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [plan, openFullLead]);

  // -------------------------------------------------------------------------
  // Helpers communs
  // -------------------------------------------------------------------------
  const today = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" })
  );

  const cleanDate = (d: unknown) => {
    if (!d || typeof d !== "string") return new Date("2100-01-01");
    return new Date(d.split("T")[0] + "T00:00:00");
  };

  const formatDateFR = (d: unknown) => {
    if (!(typeof d === "string" || typeof d === "number" || d instanceof Date)) return "—";
    const parsed = new Date(d);
    if (Number.isNaN(parsed.getTime())) return "—";
    return parsed.toLocaleDateString("fr-FR");
  };

  const leadDisplayName = (lead: FollowupLead | FullPlanLead) =>
    `${(lead as FollowupLead).FirstName || (lead as FollowupLead).title || "—"} ${(lead as FollowupLead).LastName || ""}`.trim();

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

  // -------------------------------------------------------------------------
  // Logique essential (inchangée)
  // -------------------------------------------------------------------------
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
      ? "Aujourd'hui"
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

  const markAsResponded = async (leadId: string | number) => {
    const isMapLead = !!openLead?.placeUrl;
    const endpoint = isMapLead ? "/api/map-leads/responded" : "/api/leads/responded";
    const snapshot = leads;
    setLeads((prev) => prev.filter((l) => l.id !== leadId));
    setOpenLead(null);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId }),
    });
    if (!res.ok) setLeads(snapshot);
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
      const nextIso =
        typeof data?.next_followup_at === "string"
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

  useEffect(() => {
    if (plan !== "essential") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenLead(null);
    };
    window.addEventListener("keydown", onKeyDown);
    if (openLead) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [plan, openLead]);

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

  // -------------------------------------------------------------------------
  // Renders communs (essential)
  // -------------------------------------------------------------------------
  const renderLeadCard = (lead: FollowupLead, tone: TabKey) => {
    const toneRing =
      tone === "overdue"
        ? "hover:border-amber-300 hover:bg-amber-50/80"
        : tone === "today"
        ? "hover:border-[#9cc0ff] hover:bg-[#f3f8ff]"
        : "hover:border-emerald-300 hover:bg-emerald-50/80";

    const badge =
      tone === "overdue" ? "Retard" : tone === "today" ? "Aujourd'hui" : "À venir";

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
                <p className="max-w-[28ch] truncate text-[#51627b]">{lead.Company}</p>
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
              Quand une prochaine relance est planifiée, elle apparaîtra dans cette section.
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
            variant === "overdue" ? "overdue" : variant === "today" ? "today" : "upcoming"
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
            ? "À faire aujourd'hui"
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

  // =========================================================================
  // PLAN FULL — helpers de rendu
  // =========================================================================

  const fullMobileOptions = useMemo(
    () => [
      { key: "today" as const, label: "Aujourd'hui", count: fullData.today.length },
      { key: "upcoming" as const, label: "À venir", count: fullData.upcoming.length },
      { key: "relance_sent" as const, label: "Relance envoyée", count: fullData.relance_sent.length },
      { key: "responded" as const, label: "Répondu", count: fullData.responded.length },
    ],
    [fullData.today.length, fullData.upcoming.length, fullData.relance_sent.length, fullData.responded.length]
  );

  const fullActiveData: FullPlanLead[] =
    fullTab === "today"
      ? fullData.today
      : fullTab === "upcoming"
      ? fullData.upcoming
      : fullTab === "relance_sent"
      ? fullData.relance_sent
      : fullData.responded;

  const fullActiveTitle =
    fullTab === "today"
      ? "Aujourd'hui"
      : fullTab === "upcoming"
      ? "À venir"
      : fullTab === "relance_sent"
      ? "Relance envoyée"
      : "Répondu";

  // Carte de lead plan full (mobile)
  const renderFullLeadCardMobile = (lead: FullPlanLead) => {
    const dateLabel =
      fullTab === "relance_sent"
        ? formatDateFR(lead.relance_sent_at)
        : fullTab === "responded"
        ? "—"
        : formatDateFR(lead.next_followup_at);

    return (
      <button
        key={lead.id}
        type="button"
        onClick={() => setOpenFullLead(lead)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-[#d7e3f4] bg-white px-3 py-2 text-left shadow-[0_10px_18px_-18px_rgba(18,43,86,0.68)] transition hover:bg-[#f9fbff] focus:outline-none focus:ring-2 focus:ring-[#dce8ff]"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[14px] font-medium leading-tight text-[#0b1c33]">
              {leadDisplayName(lead)}
            </p>
            <span className="rounded-full border border-[#d7e3f4] bg-[#f5f9ff] px-2 py-0.5 text-[10px] text-[#4b647f]">
              {dateLabel}
            </span>
          </div>
          <p className="mt-1 truncate text-[12px] text-[#5f7693]">
            {(lead.Company ?? "").trim() || "Entreprise non renseignée"}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-[#9bb0c8]" />
      </button>
    );
  };

  // Card stat plan full (desktop)
  const renderFullStat = ({
    label,
    value,
    tabKey,
    dotColor,
    chipClass,
    subLabel,
  }: {
    label: string;
    value: number;
    tabKey: FullTabKey;
    dotColor: string;
    chipClass: string;
    subLabel: string;
  }) => {
    const isActive = fullTab === tabKey;
    return (
      <button
        type="button"
        onClick={() => setFullTab(tabKey)}
        className={[
          "w-full rounded-xl border px-4 py-3 text-left transition",
          "border-[#c8d6ea] bg-[#f7fbff] hover:border-[#9cc0ff]",
          "focus:outline-none focus:ring-2 focus:ring-[#dce8ff]",
          isActive ? "border-[#90b5ff] bg-white ring-1 ring-[#dce8ff]" : "",
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-[#51627b]">{label}</p>
          <span className={["h-2 w-2 rounded-full", dotColor].join(" ")} />
        </div>
        <div className="mt-2 flex items-end justify-between">
          <p className="text-2xl font-semibold tabular-nums text-[#0b1c33]">{value}</p>
          <span className={["rounded-full border px-2 py-0.5 text-[11px] font-semibold", chipClass].join(" ")}>
            {value}
          </span>
        </div>
        <p className="mt-1.5 text-[11px] text-[#51627b]">{subLabel}</p>
      </button>
    );
  };

  // Section liste plan full (desktop)
  const renderFullSection = ({
    title,
    subtitle,
    data,
    tone,
  }: {
    title: string;
    subtitle: string;
    data: FullPlanLead[];
    tone: FullTabKey;
  }) => {
    const markerColor =
      tone === "today"
        ? "bg-[#1f5eff]"
        : tone === "upcoming"
        ? "bg-emerald-500"
        : tone === "relance_sent"
        ? "bg-violet-500"
        : "bg-teal-500";

    const badgeClass =
      tone === "today"
        ? "border-[#d7e3f4] bg-white text-[#51627b]"
        : tone === "upcoming"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : tone === "relance_sent"
        ? "border-violet-200 bg-violet-50 text-violet-700"
        : "border-teal-200 bg-teal-50 text-teal-700";

    const badgeLabel =
      tone === "today"
        ? "Aujourd'hui"
        : tone === "upcoming"
        ? "À venir"
        : tone === "relance_sent"
        ? "Envoyée"
        : "Répondu";

    const hoverClass =
      tone === "today"
        ? "hover:border-[#9cc0ff] hover:bg-[#f3f8ff]"
        : tone === "upcoming"
        ? "hover:border-emerald-300 hover:bg-emerald-50/80"
        : tone === "relance_sent"
        ? "hover:border-violet-300 hover:bg-violet-50/80"
        : "hover:border-teal-300 hover:bg-teal-50/80";

    return (
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
              <p className="text-sm text-[#334155]">Aucune entrée ici.</p>
              <p className="mt-1 text-xs text-[#51627b]">
                {tone === "today"
                  ? "Les relances planifiées pour aujourd'hui apparaîtront ici."
                  : tone === "upcoming"
                  ? "Les futures relances apparaîtront ici dès qu'un DM est envoyé (j+7)."
                  : tone === "relance_sent"
                  ? "Les relances envoyées automatiquement apparaîtront ici."
                  : "Les prospects ayant répondu apparaîtront ici."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {data.map((lead) => {
                const dateInfo =
                  tone === "relance_sent"
                    ? { label: "Envoyée le", value: formatDateFR(lead.relance_sent_at) }
                    : tone === "responded"
                    ? { label: "Relance le", value: lead.relance_sent_at ? formatDateFR(lead.relance_sent_at) : "—" }
                    : { label: "Date", value: formatDateFR(lead.next_followup_at) };

                return (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => setOpenFullLead(lead)}
                    className={[
                      "group w-full text-left relative",
                      "rounded-xl border border-[#c8d6ea] bg-[#f7fbff]",
                      "px-4 py-3.5 transition duration-200",
                      "shadow-[0_16px_28px_-26px_rgba(18,43,86,0.8)]",
                      "focus:outline-none focus:ring-2 focus:ring-[#dce8ff] focus:ring-offset-0",
                      hoverClass,
                    ].join(" ")}
                  >
                    <span className={["absolute left-0 top-0 h-full w-1 rounded-l-xl", markerColor].join(" ")} />
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate font-semibold text-[#0b1c33]">
                            {leadDisplayName(lead)}
                          </h3>
                          <span className={["shrink-0 rounded-full border px-2 py-0.5 text-[11px]", badgeClass].join(" ")}>
                            {badgeLabel}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <p className="text-[#51627b]">
                            {dateInfo.label} :{" "}
                            <span className="font-semibold text-[#0b1c33]">{dateInfo.value}</span>
                          </p>
                          {lead.Company && (
                            <p className="max-w-[28ch] truncate text-[#51627b]">{lead.Company}</p>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-[#93a6c1] transition group-hover:text-[#51627b]">
                        <span className="text-xs font-medium">Voir</span>{" "}
                        <span aria-hidden>→</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>
    );
  };

  // Panel latéral plan full (desktop)
  const renderFullSidebar = () => {
    if (!openFullLead) return null;

    const statusBadge = openFullLead.responded
      ? { label: "Répondu", cls: "border-teal-200 bg-teal-50 text-teal-700", dot: "bg-teal-500" }
      : openFullLead.relance_sent_at
      ? { label: "Relance envoyée", cls: "border-violet-200 bg-violet-50 text-violet-700", dot: "bg-violet-500" }
      : openFullLead.next_followup_at
      ? { label: "En attente de relance", cls: "border-[#c8d6ea] bg-[#f7fbff] text-[#51627b]", dot: "bg-[#1f5eff]" }
      : { label: "—", cls: "border-[#c8d6ea] bg-[#f7fbff] text-[#51627b]", dot: "bg-gray-400" };

    const isRelancePending = !openFullLead.relance_sent_at && !openFullLead.responded;

    return (
      <>
        <div
          onClick={() => setOpenFullLead(null)}
          className="fixed inset-0 z-40 hidden bg-[#081123]/38 backdrop-blur-[2px] md:block"
        />
        <div
          className="fixed right-0 top-0 z-50 hidden h-full w-full border-l border-[#d7e3f4] bg-white shadow-[0_18px_42px_-22px_rgba(18,43,86,0.45)] animate-slideLeft md:block sm:w-[420px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="h-full flex flex-col">
            {/* Top bar */}
            <div className="border-b border-[#d7e3f4] bg-[#f8fbff] p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-[#51627b]">Fiche prospect</p>
                  <h2 className="mt-1 truncate text-xl font-semibold text-[#0b1c33]">
                    {openFullLead.FirstName} {openFullLead.LastName}
                  </h2>
                  {/* Badge statut visuel */}
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className={["inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", statusBadge.cls].join(" ")}>
                      <span className={["h-1.5 w-1.5 rounded-full", statusBadge.dot].join(" ")} />
                      {statusBadge.label}
                    </span>
                  </div>
                </div>
                <HubButton variant="ghost" size="sm" onClick={() => setOpenFullLead(null)}>
                  Fermer
                </HubButton>
              </div>
            </div>

            {/* Content */}
            <div className="overflow-y-auto p-5 space-y-4">
              {/* Informations principales */}
              <div className="hub-card-soft p-4 space-y-3 text-sm text-[#0b1c33]">
                {openFullLead.Company && (
                  <p>
                    <span className="text-[#51627b]">Entreprise</span>
                    <br />
                    <strong className="font-semibold">{openFullLead.Company}</strong>
                  </p>
                )}
                {openFullLead.message_sent_at && (
                  <p>
                    <span className="text-[#51627b]">DM initial envoyé le</span>
                    <br />
                    <strong className="font-semibold">{formatDateFR(openFullLead.message_sent_at)}</strong>
                  </p>
                )}
                {openFullLead.relance_sent_at && (
                  <p>
                    <span className="text-[#51627b]">Relance envoyée le</span>
                    <br />
                    <strong className="font-semibold">{formatDateFR(openFullLead.relance_sent_at)}</strong>
                  </p>
                )}
                {openFullLead.next_followup_at && !openFullLead.relance_sent_at && (
                  <p>
                    <span className="text-[#51627b]">Relance prévue le</span>
                    <br />
                    <strong className="font-semibold">{formatDateFR(openFullLead.next_followup_at)}</strong>
                  </p>
                )}
              </div>

              {/* Lien LinkedIn */}
              {openFullLead.LinkedInURL && (
                <a
                  href={openFullLead.LinkedInURL}
                  className="group rounded-xl border border-[#c8d6ea] bg-[#f7fbff] px-4 py-3 hover:border-[#9cc0ff] hover:bg-[#f3f8ff] transition block"
                  target="_blank"
                  rel="noreferrer"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-[#51627b]">Lien</p>
                      <p className="text-sm font-semibold text-[#0b1c33]">LinkedIn</p>
                    </div>
                    <span className="text-[#6a7f9f] transition group-hover:text-[#36598a]">Voir →</span>
                  </div>
                </a>
              )}

              {/* Message de relance (lecture seule) */}
              {openFullLead.relance_linkedin && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowFullRelance((v) => !v)}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-[#dbe5f3] bg-white px-4 py-3 text-sm font-medium text-[#2563EB] transition hover:bg-[#f0f6ff] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]"
                  >
                    <span className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Voir le message de relance
                    </span>
                    <span className="text-[#94a3b8] text-xs">{showFullRelance ? "▲" : "▼"}</span>
                  </button>
                  {showFullRelance && (
                    <div className="mt-2 rounded-xl border border-[#dbe5f3] bg-[#f8fbff] p-4 text-sm text-[#0F172A] whitespace-pre-wrap">
                      {openFullLead.relance_linkedin}
                    </div>
                  )}
                </div>
              )}

              {/* Délai personnalisé (visible uniquement si la relance n'est pas encore envoyée) */}
              {isRelancePending && (
                <div className="rounded-xl border border-[#d7e3f4] bg-[#f8fbff] p-4 space-y-3">
                  <p className="text-xs font-semibold text-[#0b1c33]">Délai personnalisé</p>
                  <p className="text-[11px] text-[#51627b]">
                    Délai global : <span className="font-medium text-[#0b1c33]">{globalDelay}j</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={leadDelayInput}
                      onChange={(e) => setLeadDelayInput(e.target.value)}
                      placeholder={`${globalDelay} (global)`}
                      className="h-9 w-24 rounded-xl border border-[#d7e3f4] bg-white px-3 text-[13px] text-[#0b1c33] outline-none transition focus:border-[#9ec0ff] focus:ring-2 focus:ring-[#dce8ff]"
                    />
                    <span className="text-[12px] text-[#51627b]">jours</span>
                    <button
                      type="button"
                      disabled={savingLeadDelay}
                      onClick={() => {
                        const val = parseInt(leadDelayInput, 10);
                        void applyLeadDelay(Number.isFinite(val) && val >= 1 && val <= 365 ? val : null);
                      }}
                      className="inline-flex h-9 items-center rounded-xl border border-[#1f5eff] bg-[#1f5eff] px-3 text-[12px] font-medium text-white transition hover:bg-[#174dd4] disabled:opacity-60"
                    >
                      {savingLeadDelay ? "…" : "Appliquer"}
                    </button>
                  </div>
                  {openFullLead.custom_followup_delay_days != null && (
                    <button
                      type="button"
                      onClick={() => void applyLeadDelay(null)}
                      className="text-[11px] text-[#51627b] underline hover:text-[#0b1c33]"
                    >
                      Revenir au délai global
                    </button>
                  )}
                  {openFullLead.next_followup_at && (
                    <p className="text-[11px] text-[#51627b]">
                      La date de relance planifiée sera mise à jour automatiquement.
                    </p>
                  )}
                  {leadDelayToast && (
                    <p className={["text-[11px]", leadDelayToast.startsWith("✓") ? "text-emerald-600" : "text-red-600"].join(" ")}>
                      {leadDelayToast}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  };

  // =========================================================================
  // RENDER principal
  // =========================================================================

  return (
    <SubscriptionGate supportEmail="contact@lidmeo.com">
      <div className="relative h-full min-h-0">

        {/* ================================================================
            PLAN ESSENTIAL — UI inchangée
            ================================================================ */}
        {(!planLoaded || plan === "essential") && (
          <>
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
                          <h1 className="hub-page-title mt-1">Relances clients</h1>
                          <p className="mt-1.5 text-sm text-[#51627b]">
                            Organisez vos suivis en un coup d'œil et traitez en priorité les
                            relances les plus urgentes.
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
                        {renderHeaderStat({ label: "En retard", value: overdue.length, variant: "overdue" })}
                        {renderHeaderStat({ label: "Aujourd'hui", value: todayList.length, variant: "today" })}
                        {renderHeaderStat({ label: "À venir", value: upcoming.length, variant: "upcoming" })}
                      </div>
                    </div>

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

            {/* Overlay essential */}
            {openLead && (
              <div
                onClick={() => setOpenLead(null)}
                className="fixed inset-0 z-40 hidden bg-[#081123]/38 backdrop-blur-[2px] md:block"
              />
            )}

            {/* Desktop sidebar essential */}
            {openLead && (
              <div
                className="fixed right-0 top-0 z-50 hidden h-full w-full border-l border-[#d7e3f4] bg-white shadow-[0_18px_42px_-22px_rgba(18,43,86,0.45)] animate-slideLeft md:block sm:w-[420px]"
                role="dialog"
                aria-modal="true"
              >
                <div className="h-full flex flex-col">
                  <div className="border-b border-[#d7e3f4] bg-[#f8fbff] p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-[#51627b]">Détail de la relance</p>
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
                            <span className="text-[#0b1c33]">{openLead.phoneNumber}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3">
                      {openLead.LinkedInURL && (
                        <a
                          href={openLead.LinkedInURL}
                          className="group rounded-xl border border-[#c8d6ea] bg-[#f7fbff] px-4 py-3 hover:border-[#9cc0ff] hover:bg-[#f3f8ff] transition"
                          target="_blank"
                          rel="noreferrer"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs text-[#51627b]">Lien</p>
                              <p className="text-sm font-semibold text-[#0b1c33]">LinkedIn</p>
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
                          className="group rounded-xl border border-[#c8d6ea] bg-[#f7fbff] px-4 py-3 hover:border-[#9cc0ff] hover:bg-[#f3f8ff] transition"
                          target="_blank"
                          rel="noreferrer"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs text-[#51627b]">Lien</p>
                              <p className="text-sm font-semibold text-[#0b1c33]">Google Maps</p>
                            </div>
                            <span className="text-[#6a7f9f] transition group-hover:text-[#36598a]">
                              Ouvrir →
                            </span>
                          </div>
                        </a>
                      )}
                    </div>

                    {openLead.relance_linkedin && (
                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={() => setShowRelanceLinkedin((v) => !v)}
                          className="flex w-full items-center justify-between gap-2 rounded-xl border border-[#dbe5f3] bg-white px-4 py-3 text-sm font-medium text-[#2563EB] transition hover:bg-[#f0f6ff] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]"
                        >
                          <span className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" />
                            Voir le message de relance
                          </span>
                          <span className="text-[#94a3b8] text-xs">
                            {showRelanceLinkedin ? "▲" : "▼"}
                          </span>
                        </button>
                        {showRelanceLinkedin && (
                          <div className="mt-2 rounded-xl border border-[#dbe5f3] bg-[#f8fbff] p-4 text-sm text-[#0F172A] whitespace-pre-wrap">
                            {openLead.relance_linkedin}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Reprogrammation + reprogramDate (essential uniquement) */}
                  <div className="border-t border-[#d7e3f4] bg-white p-5">
                    <p className="text-xs font-medium text-[#51627b] mb-2">Reprogrammer</p>
                    <input
                      type="date"
                      value={reprogramDate}
                      onChange={(e) => setReprogramDate(e.target.value)}
                      className="h-10 w-full rounded-xl border border-[#d7e3f4] bg-[#f8fbff] px-3 text-[13px] text-[#0b1c33] outline-none transition focus:border-[#9ec0ff] focus:ring-2 focus:ring-[#dce8ff]"
                    />
                    {reprogramError && (
                      <p className="mt-1 text-[11px] text-red-600">{reprogramError}</p>
                    )}
                    <button
                      type="button"
                      onClick={handleReprogramFollowup}
                      disabled={!reprogramDate || reprogramming}
                      className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-xl border border-[#d7e3f4] bg-[#f8fbff] px-3 text-[13px] font-medium text-[#34527a] transition hover:bg-[#eef4fd] focus:outline-none focus:ring-2 focus:ring-[#dce8ff] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {reprogramming ? "Reprogrammation..." : "Reprogrammer"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Mobile sheet essential */}
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

                    {openLead.relance_linkedin && (
                      <div>
                        <button
                          type="button"
                          onClick={() => setShowRelanceLinkedin((v) => !v)}
                          className="flex w-full items-center justify-between gap-2 rounded-xl border border-[#d7e3f4] bg-white px-3 py-3 text-[13px] font-medium text-[#1f5eff] transition hover:bg-[#f0f6ff] focus:outline-none"
                        >
                          <span className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" />
                            Voir le message de relance
                          </span>
                          <span className="text-[#94a3b8] text-xs">
                            {showRelanceLinkedin ? "▲" : "▼"}
                          </span>
                        </button>
                        {showRelanceLinkedin && (
                          <div className="mt-2 rounded-xl border border-[#d7e3f4] bg-[#f8fbff] px-3 py-3 text-[13px] text-[#0b1c33] whitespace-pre-wrap">
                            {openLead.relance_linkedin}
                          </div>
                        )}
                      </div>
                    )}

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
          </>
        )}

        {/* ================================================================
            PLAN FULL — nouvelle UI
            ================================================================ */}
        {planLoaded && plan === "full" && (
          <>
            {/* Mobile full plan */}
            <MobileLayout>
              {fullLoaded ? (
                <>
                  <MobilePageHeader
                    title="Relances automatiques"
                    subtitle="Géré par Lidmeo"
                  />

                  <MobileChipsFilters
                    options={fullMobileOptions}
                    activeKey={fullTab}
                    onChange={(key) => setFullTab(key)}
                    ariaLabel="Sections relances"
                  />

                  <div className="rounded-xl border border-[#d7e3f4] bg-[#f8fbff] px-3 py-2 text-[12px] text-[#5f7693]">
                    {fullActiveTitle} · {fullActiveData.length} prospect(s)
                  </div>

                  <div className="space-y-2">
                    {fullActiveData.length === 0 ? (
                      <MobileEmptyState
                        title="Aucun prospect ici"
                        description={
                          fullTab === "responded"
                            ? "Les prospects ayant répondu apparaîtront ici."
                            : "Aucune entrée dans cette section pour le moment."
                        }
                      />
                    ) : (
                      fullActiveData.map((lead) => renderFullLeadCardMobile(lead))
                    )}
                  </div>
                </>
              ) : (
                <>
                  <MobilePageHeader title="Relances automatiques" subtitle="Chargement..." />
                  <MobileSkeleton rows={8} />
                </>
              )}
            </MobileLayout>

            {/* Desktop full plan */}
            <div className="hidden md:block">
              <div className="mx-auto h-full min-h-0 w-full max-w-[1680px] px-4 py-6 sm:px-6 sm:py-7">
                {!fullLoaded ? (
                  renderSkeleton()
                ) : (
                  <div className="space-y-5">
                    {/* Header */}
                    <div className="relative flex flex-col gap-3.5 p-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="hub-chip border-[#c8d6ea] bg-[#f7fbff] font-medium">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#1f5eff]" />
                          Relances Automatiques
                        </span>
                        {/* Indicateur temps réel */}
                        <span className="hub-chip border-emerald-200 bg-emerald-50 text-emerald-700 tabular-nums">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Temps réel
                        </span>
                      </div>

                      <div className="flex items-start justify-between gap-6">
                        <div className="relative">
                          <h1 className="hub-page-title mt-1">Relances clients</h1>
                          <p className="mt-1.5 text-sm text-[#51627b]">
                            Tout est géré automatiquement. Les relances sont envoyées par Lidmeo
                            et cette page se met à jour en temps réel.
                          </p>
                        </div>
                        <div className="hidden items-center gap-2 text-xs text-[#51627b] md:flex">
                          {/* Bouton réglage délai global — plan full uniquement */}
                          <button
                            type="button"
                            onClick={() => setSettingsOpen(true)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[#c8d6ea] bg-[#f7fbff] px-3 py-2 transition hover:border-[#9cc0ff] hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#dce8ff]"
                          >
                            <Settings className="h-3.5 w-3.5" />
                            Délai de relance
                          </button>
                          <span className="inline-flex items-center gap-2 rounded-xl border border-[#c8d6ea] bg-[#f7fbff] px-3 py-2">
                            <span className="h-2 w-2 rounded-full bg-[#1f5eff]" />
                            Cliquez sur une ligne pour ouvrir le détail
                          </span>
                        </div>
                      </div>

                      {/* Cards stats — 4 sections, pas de "En retard" */}
                      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        {/* Aujourd'hui */}
                        {renderFullStat({
                          label: "Aujourd'hui",
                          value: fullData.today.length,
                          tabKey: "today",
                          dotColor: "bg-[#1f5eff]",
                          chipClass: "border-[#c8d6ea] bg-[#f7fbff] text-[#51627b]",
                          subLabel: "En attente d'envoi",
                        })}
                        {/* À venir */}
                        {renderFullStat({
                          label: "À venir",
                          value: fullData.upcoming.length,
                          tabKey: "upcoming",
                          dotColor: "bg-emerald-500",
                          chipClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
                          subLabel: "Planifié (j+7)",
                        })}
                        {/* Relance envoyée */}
                        {renderFullStat({
                          label: "Relance envoyée",
                          value: fullData.relance_sent.length,
                          tabKey: "relance_sent",
                          dotColor: "bg-violet-500",
                          chipClass: "border-violet-200 bg-violet-50 text-violet-700",
                          subLabel: "En attente de réponse",
                        })}
                        {/* Répondu */}
                        {renderFullStat({
                          label: "Répondu",
                          value: fullData.responded.length,
                          tabKey: "responded",
                          dotColor: "bg-teal-500",
                          chipClass: "border-teal-200 bg-teal-50 text-teal-700",
                          subLabel: "Prospect a répondu",
                        })}
                      </div>
                    </div>

                    {/* Section active */}
                    <div className="grid grid-cols-1 gap-4">
                      {fullTab === "today" &&
                        renderFullSection({
                          title: "Aujourd'hui",
                          subtitle: "Relances prévues pour aujourd'hui — envoi automatique en cours.",
                          data: fullData.today,
                          tone: "today",
                        })}
                      {fullTab === "upcoming" &&
                        renderFullSection({
                          title: "À venir",
                          subtitle: "Leads dont le DM a été envoyé — relance prévue 7 jours après.",
                          data: fullData.upcoming,
                          tone: "upcoming",
                        })}
                      {fullTab === "relance_sent" &&
                        renderFullSection({
                          title: "Relance envoyée",
                          subtitle: "La relance a été envoyée automatiquement. En attente de réponse.",
                          data: fullData.relance_sent,
                          tone: "relance_sent",
                        })}
                      {fullTab === "responded" &&
                        renderFullSection({
                          title: "Répondu",
                          subtitle: "Ces prospects ont répondu à votre relance.",
                          data: fullData.responded,
                          tone: "responded",
                        })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar plan full */}
            {renderFullSidebar()}

            {/* Sheet réglage délai global — plan full uniquement */}
            {settingsOpen && (
              <div
                onClick={() => setSettingsOpen(false)}
                className="fixed inset-0 z-40 hidden bg-[#081123]/38 backdrop-blur-[2px] md:block"
              />
            )}
            {settingsOpen && (
              <div
                className="fixed right-0 top-0 z-50 hidden h-full w-full border-l border-[#d7e3f4] bg-white shadow-[0_18px_42px_-22px_rgba(18,43,86,0.45)] animate-slideLeft md:block sm:w-[400px]"
                role="dialog"
                aria-modal="true"
              >
                <div className="h-full flex flex-col">
                  <div className="border-b border-[#d7e3f4] bg-[#f8fbff] p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-[#51627b]">Configuration</p>
                        <h2 className="mt-1 text-xl font-semibold text-[#0b1c33]">
                          Délai de relance automatique
                        </h2>
                        <p className="mt-1 text-xs text-[#51627b]">
                          Ce délai s'applique à tous vos nouveaux messages envoyés. Vous pouvez
                          le personnaliser lead par lead depuis le détail.
                        </p>
                      </div>
                      <HubButton variant="ghost" size="sm" onClick={() => setSettingsOpen(false)}>
                        Fermer
                      </HubButton>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-[#0b1c33]" htmlFor="global-delay-input">
                        Délai global (jours)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id="global-delay-input"
                          type="number"
                          min={1}
                          max={365}
                          value={globalDelayInput}
                          onChange={(e) => setGlobalDelayInput(e.target.value)}
                          placeholder="7"
                          className="h-10 w-28 rounded-xl border border-[#d7e3f4] bg-[#f8fbff] px-3 text-[13px] text-[#0b1c33] outline-none transition focus:border-[#9ec0ff] focus:ring-2 focus:ring-[#dce8ff]"
                        />
                        <span className="text-sm text-[#51627b]">jours</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={savingGlobalDelay}
                      onClick={() => void saveGlobalDelay()}
                      className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-[#1f5eff] bg-[#1f5eff] text-[13px] font-medium text-white transition hover:bg-[#174dd4] disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#dce8ff]"
                    >
                      {savingGlobalDelay ? "Enregistrement..." : "Enregistrer"}
                    </button>

                    {globalDelayToast && (
                      <p className={["text-[12px]", globalDelayToast.startsWith("✓") ? "text-emerald-600" : "text-red-600"].join(" ")}>
                        {globalDelayToast}
                      </p>
                    )}

                    <div className="rounded-xl border border-[#d7e3f4] bg-[#fffbeb] px-4 py-3">
                      <p className="text-[11px] text-[#92400e]">
                        S'applique aux prochains messages uniquement — les relances déjà planifiées
                        ne sont pas modifiées.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Mobile sheet full plan */}
            <MobileSheet open={Boolean(openFullLead)} onClose={() => setOpenFullLead(null)}>
              {openFullLead ? (
                <>
                  <MobileSheetHeader
                    title={leadDisplayName(openFullLead)}
                    subtitle={
                      openFullLead.responded
                        ? "Répondu"
                        : openFullLead.relance_sent_at
                        ? "Relance envoyée"
                        : "En attente de relance"
                    }
                    onClose={() => setOpenFullLead(null)}
                  />
                  <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
                    <div className="rounded-xl border border-[#d7e3f4] bg-[#f8fbff] px-3 py-3 space-y-2">
                      {openFullLead.next_followup_at && !openFullLead.relance_sent_at && (
                        <>
                          <p className="text-[12px] text-[#607894]">Prochaine relance</p>
                          <p className="text-[14px] font-medium text-[#0b1c33]">
                            {formatDateFR(openFullLead.next_followup_at)}
                          </p>
                        </>
                      )}
                      {openFullLead.relance_sent_at && (
                        <>
                          <p className="text-[12px] text-[#607894]">Relance envoyée le</p>
                          <p className="text-[14px] font-medium text-[#0b1c33]">
                            {formatDateFR(openFullLead.relance_sent_at)}
                          </p>
                        </>
                      )}
                      <p className="text-[11px] text-[#7a8fa9]">Géré automatiquement par Lidmeo.</p>
                    </div>

                    <div className="space-y-2 rounded-xl border border-[#d7e3f4] bg-white px-3 py-3">
                      <p className="text-[12px] text-[#607894]">Entreprise</p>
                      <p className="text-[13px] text-[#0b1c33]">
                        {(openFullLead.Company ?? "").trim() || "Non renseignée"}
                      </p>
                      {openFullLead.LinkedInURL ? (
                        <a
                          href={openFullLead.LinkedInURL}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#1f5eff]"
                        >
                          <Send className="h-3 w-3" />
                          Ouvrir LinkedIn
                        </a>
                      ) : null}
                    </div>

                    {openFullLead.relance_linkedin && (
                      <div>
                        <button
                          type="button"
                          onClick={() => setShowFullRelance((v) => !v)}
                          className="flex w-full items-center justify-between gap-2 rounded-xl border border-[#d7e3f4] bg-white px-3 py-3 text-[13px] font-medium text-[#1f5eff] transition hover:bg-[#f0f6ff] focus:outline-none"
                        >
                          <span className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" />
                            Voir le message de relance
                          </span>
                          <span className="text-[#94a3b8] text-xs">
                            {showFullRelance ? "▲" : "▼"}
                          </span>
                        </button>
                        {showFullRelance && (
                          <div className="mt-2 rounded-xl border border-[#d7e3f4] bg-[#f8fbff] px-3 py-3 text-[13px] text-[#0b1c33] whitespace-pre-wrap">
                            {openFullLead.relance_linkedin}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </MobileSheet>
          </>
        )}

      </div>
    </SubscriptionGate>
  );
}
