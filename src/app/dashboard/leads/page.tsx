"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import LeadsSkeleton from "./loading";
import { useVirtualizer } from "@tanstack/react-virtual";
import { queryKeys } from "@/lib/query-keys";
import { useDebounce } from "@/hooks/useDebounce";
import { supabase } from "@/lib/supabase";
import { trackBusinessEvent } from "@/lib/analytics/business-client";
import {
  getProspectionInvitationState,
  getProspectionStatusClasses,
  getProspectionStatusDotClass,
  getProspectionStatusKey,
  getProspectionStatusLabel,
  mergeLeadWithInvitationUpdate,
} from "@/lib/prospection-status";
import DeleteLeadButton from "./DeleteLeadButton";
import SubscriptionGate from "@/components/SubscriptionGate";
import dynamic from "next/dynamic";
import LeadsCards, { type MobileLeadsViewMode } from "@/components/leads/LeadsCards";
import LeadsMobileFilters, {
  type MobileLeadFilterKey,
} from "@/components/leads/LeadsMobileFilters";
import type {
  ProspectionDatePreset,
  ProspectionContactKey,
  ProspectionDesktopFilters,
  ProspectionSegmentKey,
  ProspectionStatusKey,
} from "@/components/prospection/ProspectionFilterBar";

const ProspectionFilterBar = dynamic(
  () => import("@/components/prospection/ProspectionFilterBar"),
  { ssr: false }
);
import { Button } from "@/components/ui/button";
import { HubButton } from "@/components/ui/hub-button";
import {
  AlertTriangle,
  Briefcase,
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Globe,
  LayoutGrid,
  Linkedin,
  List,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  MoveRight,
  Phone,
  UserCircle2,
  X,
} from "lucide-react";

type Lead = {
  id: number | string;
  Name?: string | null;
  FirstName?: string | null;
  LastName?: string | null;
  Company?: string | null;
  location?: string | null;
  email?: string | null;
  phone?: string | null;
  created_at?: string | null;
  traite?: boolean | null;
  message_sent?: boolean | null;
  message_sent_at?: string | null;
  next_followup_at?: string | null;
  internal_message?: string | null;
  message_mail?: string | null;
  linkedinJobTitle?: string | null;
  LinkedInURL?: string | null;
  website?: string | null;
  linkedin_invitation_status?: "sent" | "accepted" | null;
  linkedin_invitation_sent?: boolean | null;
  relance_linkedin?: string | null;
  [key: string]: unknown;
};

type SidebarToast = {
  id: number;
  tone: "success" | "error";
  message: string;
};

type ConvMessage = {
  id: string;
  direction: string;
  sender_name: string | null;
  text: string | null;
  sent_at: string | null;
  raw: unknown;
};

type ProspectionCounts = Record<ProspectionSegmentKey, number>;

type ProspectionSummaryStats = {
  total: number;
  treated: number;
  pending: number;
  connected: number;
  sent: number;
  remainingToTreat: number;
};

type ProspectionPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type LeadClientPayload = {
  id: string | number;
  plan: "full" | "essential";
  subscription_status: string;
  is_full: boolean;
  is_full_active: boolean;
  is_premium: boolean;
  email_option: boolean;
  phone_option: boolean;
};

type PaginatedLeadsResponse = {
  leads: Lead[];
  counts: ProspectionCounts;
  pagination: ProspectionPagination;
  client: LeadClientPayload;
};

type LeadsSummaryResponse = {
  stats: ProspectionSummaryStats;
  client: LeadClientPayload;
};

type LeadDetailsResponse = {
  lead: Lead;
  client: LeadClientPayload;
};

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
const DEFAULT_COUNTS: ProspectionCounts = {
  all: 0,
  todo: 0,
  pending: 0,
  connected: 0,
  sent: 0,
};
const DEFAULT_SUMMARY_STATS: ProspectionSummaryStats = {
  total: 0,
  treated: 0,
  pending: 0,
  connected: 0,
  sent: 0,
  remainingToTreat: 0,
};
const DEFAULT_PAGINATION: ProspectionPagination = {
  page: 1,
  pageSize: 25,
  total: 0,
  totalPages: 1,
};

const JOB_TITLE_EXACT_TRANSLATIONS: Record<string, string> = {
  ceo: "Président-directeur général",
  coo: "Directeur des opérations",
  cto: "Directeur technique",
  cmo: "Directeur marketing",
  cfo: "Directeur financier",
  founder: "Fondateur",
  "co-founder": "Co-fondateur",
  "owner / founder": "Propriétaire / Fondateur",
  owner: "Propriétaire",
  freelancer: "Freelance",
  "business owner": "Dirigeant d'entreprise",
  "software engineer": "Ingénieur logiciel",
  "product manager": "Chef de produit",
  "project manager": "Chef de projet",
  "sales manager": "Responsable commercial",
  "marketing manager": "Responsable marketing",
  "account manager": "Responsable de compte",
  "customer success manager": "Responsable succès client",
  recruiter: "Recruteur",
  "talent acquisition specialist": "Spécialiste acquisition de talents",
  "human resources manager": "Responsable ressources humaines",
  consultant: "Consultant",
  "business development manager": "Responsable développement commercial",
};

const JOB_TITLE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bchief executive officer\b/g, "président-directeur général"],
  [/\bchief operating officer\b/g, "directeur des opérations"],
  [/\bchief technology officer\b/g, "directeur technique"],
  [/\bchief marketing officer\b/g, "directeur marketing"],
  [/\bchief financial officer\b/g, "directeur financier"],
  [/\bvice president\b/g, "vice-président"],
  [/\bhead of\b/g, "responsable"],
  [/\bmanaging director\b/g, "directeur général"],
  [/\bdirector\b/g, "directeur"],
  [/\bmanager\b/g, "responsable"],
  [/\blead\b/g, "référent"],
  [/\bowner\b/g, "propriétaire"],
  [/\bfounder\b/g, "fondateur"],
  [/\bco-founder\b/g, "co-fondateur"],
  [/\bentrepreneur\b/g, "entrepreneur"],
  [/\bengineer\b/g, "ingénieur"],
  [/\bdeveloper\b/g, "développeur"],
  [/\bproduct\b/g, "produit"],
  [/\bproject\b/g, "projet"],
  [/\bsales\b/g, "commercial"],
  [/\bmarketing\b/g, "marketing"],
  [/\bgrowth\b/g, "croissance"],
  [/\boperations\b/g, "opérations"],
  [/\bfinance\b/g, "finance"],
  [/\baccounting\b/g, "comptabilité"],
  [/\bhuman resources\b/g, "ressources humaines"],
  [/\bhr\b/g, "rh"],
  [/\brecruiter\b/g, "recruteur"],
  [/\bconsultant\b/g, "consultant"],
  [/\banalyst\b/g, "analyste"],
  [/\bspecialist\b/g, "spécialiste"],
  [/\bassistant\b/g, "assistant"],
  [/\bexecutive\b/g, "cadre"],
];

function translateLinkedInJobTitle(rawValue: string | null | undefined): string | null {
  const raw = (rawValue ?? "").trim();
  if (!raw) return null;

  const key = raw.toLowerCase();
  const exact = JOB_TITLE_EXACT_TRANSLATIONS[key];
  if (exact) return exact;

  let translated = key;
  JOB_TITLE_REPLACEMENTS.forEach(([pattern, replacement]) => {
    translated = translated.replace(pattern, replacement);
  });

  translated = translated.replace(/\s+/g, " ").trim();
  if (!translated) return raw;
  if (translated === key) return raw;

  return translated.charAt(0).toUpperCase() + translated.slice(1);
}

function countActiveDesktopFilters(filters: ProspectionDesktopFilters): number {
  let count = 0;
  if (filters.segment !== "all") count += 1;
  if (filters.contacts.length > 0) count += 1;
  if (filters.datePreset !== "all") count += 1;
  return count;
}

function serializeContacts(contacts: ProspectionContactKey[]): string {
  return contacts.join(",");
}

function buildPaginatedLeadsUrl(params: {
  search: string;
  segment: "all" | ProspectionStatusKey;
  contacts: ProspectionContactKey[];
  datePreset: ProspectionDatePreset;
  customDate: string | null;
  page: number;
  pageSize: number;
}) {
  const searchParams = new URLSearchParams({
    mode: "paginated",
    page: String(params.page),
    pageSize: String(params.pageSize),
    segment: params.segment,
    datePreset: params.datePreset,
  });

  if (params.search.trim()) searchParams.set("search", params.search.trim());
  if (params.contacts.length > 0) {
    searchParams.set("contacts", serializeContacts(params.contacts));
  }
  if (params.customDate) searchParams.set("customDate", params.customDate);

  return `/api/get-leads?${searchParams.toString()}`;
}

async function fetchPaginatedLeads(params: {
  search: string;
  segment: "all" | ProspectionStatusKey;
  contacts: ProspectionContactKey[];
  datePreset: ProspectionDatePreset;
  customDate: string | null;
  page: number;
  pageSize: number;
}): Promise<PaginatedLeadsResponse> {
  const response = await fetch(buildPaginatedLeadsUrl(params), {
    credentials: "include",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchLeadsSummary(): Promise<LeadsSummaryResponse> {
  const response = await fetch("/api/get-leads?mode=summary", {
    credentials: "include",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchLeadDetails(leadId: string | number): Promise<LeadDetailsResponse> {
  const searchParams = new URLSearchParams({
    mode: "lead",
    leadId: String(leadId),
  });
  const response = await fetch(`/api/get-leads?${searchParams.toString()}`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export default function LeadsPage() {
  const defaultDesktopFilters = (): ProspectionDesktopFilters => ({
    segment: "all",
    contacts: [],
    datePreset: "all",
    customDate: null,
  });

  const [safeLeads, setSafeLeads] = useState<Lead[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [mobileStatusFilter, setMobileStatusFilter] = useState<MobileLeadFilterKey>("all");
  const [mobileViewMode, setMobileViewMode] = useState<MobileLeadsViewMode>("compact");
  const [desktopFilters, setDesktopFilters] = useState<ProspectionDesktopFilters>(
    defaultDesktopFilters
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(25);
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 767px)").matches;
  });
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [showRelanceLinkedin, setShowRelanceLinkedin] = useState(false);
  const [isLeadDetailsLoading, setIsLeadDetailsLoading] = useState(false);
  const [linkedInDraft, setLinkedInDraft] = useState("");
  const [mailDraft, setMailDraft] = useState("");
  const [clientLoaded, setClientLoaded] = useState(false);

  // ✅ client options (email / phone enrichment)
  // ➜ Tous les clients ont accès email + téléphone désormais
  const [emailOption, setEmailOption] = useState<boolean>(true);
  const [phoneOption, setPhoneOption] = useState<boolean>(true);

  // ✅ plan (on garde la logique existante côté API, mais plus de premium gating)
  const [plan, setPlan] = useState<string>("essential");
  const [clientId, setClientId] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportingSelected, setExportingSelected] = useState(false);
  const [updatingStatusIds, setUpdatingStatusIds] = useState<Set<string>>(new Set());
  const [invitingLeadIds, setInvitingLeadIds] = useState<Set<string>>(new Set());
  const [inviteErrors, setInviteErrors] = useState<Record<string, string>>({});
  const [sendingLinkedInMessageLeadIds, setSendingLinkedInMessageLeadIds] = useState<Set<string>>(new Set());
  const [linkedInMessageSendErrors, setLinkedInMessageSendErrors] = useState<Record<string, string>>({});
  const [openLeadThreadDbId, setOpenLeadThreadDbId] = useState<string | null>(null);
  const [convModalOpen, setConvModalOpen] = useState(false);
  const [convModalLead, setConvModalLead] = useState<Lead | null>(null);
  const [convMessages, setConvMessages] = useState<ConvMessage[]>([]);
  const [convLoading, setConvLoading] = useState(false);
  const [convDraft, setConvDraft] = useState("");
  const [convSending, setConvSending] = useState(false);
  const [convError, setConvError] = useState<string | null>(null);
  const convMessagesEndRef = useRef<HTMLDivElement>(null);
  const [sidebarToast, setSidebarToast] = useState<SidebarToast | null>(null);
  const sidebarToastTimeoutRef = useRef<number | null>(null);
  const linkedInDraftDirtyRef = useRef(false);
  const mailDraftDirtyRef = useRef(false);
  const selectedCount = selectedIds.size;

  // ✅ open lead from query param (?open=ID)
  const queryClient = useQueryClient();
  const [openFromQuery, setOpenFromQuery] = useState<string | null>(null);
  const isAutomationManaged = plan === "full";
  const debouncedSearch = useDebounce(searchTerm, 300);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const colCount = 8;

  // Tracking
  useEffect(() => {
    trackBusinessEvent("prospects_list_viewed", "prospects");
  }, []);

  useEffect(() => {
    const currentOpenLeadId = openLead?.id;
    if (currentOpenLeadId) {
      trackBusinessEvent("prospect_detail_viewed", "prospects", {
        lead_id: currentOpenLeadId,
      });
      setShowRelanceLinkedin(false);
    }
  }, [openLead?.id]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const applyViewport = () => setIsMobileViewport(mediaQuery.matches);

    applyViewport();
    mediaQuery.addEventListener("change", applyViewport);
    return () => mediaQuery.removeEventListener("change", applyViewport);
  }, []);

  const activeSegment = isMobileViewport ? mobileStatusFilter : desktopFilters.segment;
  const activeContacts = useMemo(
    () => (isMobileViewport ? [] : desktopFilters.contacts),
    [desktopFilters.contacts, isMobileViewport]
  );
  const activeDatePreset = isMobileViewport ? "all" : desktopFilters.datePreset;
  const activeCustomDate = isMobileViewport ? null : desktopFilters.customDate;

  const paginatedQueryParams = useMemo(
    () => ({
      search: debouncedSearch,
      segment: activeSegment,
      contacts: activeContacts,
      datePreset: activeDatePreset,
      customDate: activeCustomDate,
      page,
      pageSize,
    }),
    [
      activeContacts,
      activeCustomDate,
      activeDatePreset,
      activeSegment,
      debouncedSearch,
      page,
      pageSize,
    ]
  );

  const paginatedQueryKey = useMemo(
    () =>
      queryKeys.prospectionLeads({
        ...paginatedQueryParams,
        contacts: serializeContacts(paginatedQueryParams.contacts),
      }),
    [paginatedQueryParams]
  );

  const paginatedLeadsQuery = useQuery({
    queryKey: paginatedQueryKey,
    queryFn: () => fetchPaginatedLeads(paginatedQueryParams),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const summaryQuery = useQuery({
    queryKey: queryKeys.leadsSummary(),
    queryFn: fetchLeadsSummary,
    staleTime: 60_000,
  });

  const pagination = paginatedLeadsQuery.data?.pagination ?? DEFAULT_PAGINATION;
  const filteredLeads = safeLeads;
  const filteredCount = pagination.total;
  const segmentCounts = paginatedLeadsQuery.data?.counts ?? DEFAULT_COUNTS;
  const summaryStats = summaryQuery.data?.stats ?? DEFAULT_SUMMARY_STATS;
  const desktopActiveFiltersCount = useMemo(
    () => countActiveDesktopFilters(desktopFilters),
    [desktopFilters]
  );

  const rowVirtualizer = useVirtualizer({
    count: filteredLeads.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => 52,
    overscan: 8,
  });

  const mobileFilterOptions = useMemo(() => {
    return [
      { key: "all", label: "Tous", count: segmentCounts.all },
      { key: "todo", label: "A faire", count: segmentCounts.todo },
      { key: "pending", label: "En attente", count: segmentCounts.pending },
      { key: "connected", label: "Connecte", count: segmentCounts.connected },
      { key: "sent", label: "Envoye", count: segmentCounts.sent },
    ] satisfies Array<{ key: MobileLeadFilterKey; label: string; count: number }>;
  }, [segmentCounts]);

  const mobileFilteredLeads = filteredLeads;

  // ✅ Read query param once on mount
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const openId = url.searchParams.get("open");
      if (openId) setOpenFromQuery(openId);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const showSidebarToast = (tone: "success" | "error", message: string) => {
    if (sidebarToastTimeoutRef.current) {
      window.clearTimeout(sidebarToastTimeoutRef.current);
      sidebarToastTimeoutRef.current = null;
    }

    const nextToast: SidebarToast = {
      id: Date.now(),
      tone,
      message,
    };
    setSidebarToast(nextToast);

    sidebarToastTimeoutRef.current = window.setTimeout(() => {
      setSidebarToast((current) => (current?.id === nextToast.id ? null : current));
      sidebarToastTimeoutRef.current = null;
    }, 3200);
  };

  useEffect(() => {
    return () => {
      if (sidebarToastTimeoutRef.current) {
        window.clearTimeout(sidebarToastTimeoutRef.current);
        sidebarToastTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const data = paginatedLeadsQuery.data;
    if (!data) return;

    setSafeLeads(data.leads ?? []);

    const client = data.client ?? null;
    setPlan(String(client?.plan ?? "essential").toLowerCase());
    setClientId(client?.id ? String(client.id) : null);
    setEmailOption(true);
    setPhoneOption(true);
    setClientLoaded(true);
  }, [paginatedLeadsQuery.data]);

  useEffect(() => {
    if (!paginatedLeadsQuery.data) return;
    if (page <= pagination.totalPages) return;
    setPage(pagination.totalPages);
  }, [page, paginatedLeadsQuery.data, pagination.totalPages]);

  useEffect(() => {
    if (!paginatedLeadsQuery.data) return;
    if (pagination.page >= pagination.totalPages) return;

    const nextParams = {
      ...paginatedQueryParams,
      page: pagination.page + 1,
    };

    void queryClient.prefetchQuery({
      queryKey: queryKeys.prospectionLeads({
        ...nextParams,
        contacts: serializeContacts(nextParams.contacts),
      }),
      queryFn: () => fetchPaginatedLeads(nextParams),
      staleTime: 60_000,
    });
  }, [paginatedLeadsQuery.data, paginatedQueryParams, pagination.page, pagination.totalPages, queryClient]);

  useEffect(() => {
    if (!clientLoaded || !openFromQuery) return;

    let cancelled = false;
    setIsLeadDetailsLoading(true);

    void queryClient
      .fetchQuery({
        queryKey: queryKeys.leadDetails(openFromQuery),
        queryFn: () => fetchLeadDetails(openFromQuery),
        staleTime: 5 * 60 * 1000,
      })
      .then((data) => {
        if (cancelled || !data?.lead) return;
        setOpenLead(data.lead);
        linkedInDraftDirtyRef.current = false;
        mailDraftDirtyRef.current = false;
        setLinkedInDraft(String(data.lead.internal_message ?? ""));
        setMailDraft(String(data.lead.message_mail ?? ""));
      })
      .catch((error) => {
        if (!cancelled) console.error(error);
      })
      .finally(() => {
        if (!cancelled) setIsLeadDetailsLoading(false);
      });

    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("open");
      window.history.replaceState({}, "", url.pathname + url.search);
    } catch (error) {
      console.error(error);
    }

    setOpenFromQuery(null);

    return () => {
      cancelled = true;
    };
  }, [clientLoaded, openFromQuery, queryClient]);

  // Realtime: auto-update linkedin_invitations state in leads
  useEffect(() => {
    if (!clientId) return;

    const channel = supabase
      .channel(`leads-invitations-${clientId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "linkedin_invitations",
          filter: `client_id=eq.${clientId}`,
        },
        (payload) => {
          const row = payload.new as {
            lead_id?: string | number | null;
            status?: string | null;
            sent_at?: string | null;
            accepted_at?: string | null;
            dm_sent_at?: string | null;
            dm_draft_status?: string | null;
          } | null;
          if (!row?.lead_id) return;

          const leadIdStr = String(row.lead_id);
          if (plan === "full") {
            setSafeLeads((prev) =>
              prev.map((lead) =>
                String(lead.id) === leadIdStr
                  ? mergeLeadWithInvitationUpdate(lead, row)
                  : lead
              )
            );

            setOpenLead((prev) =>
              prev && String(prev.id) === leadIdStr
                ? mergeLeadWithInvitationUpdate(prev, row)
                : prev
            );
            void queryClient.invalidateQueries({
              queryKey: queryKeys.prospectionLeadsBase(),
            });
            void queryClient.invalidateQueries({
              queryKey: queryKeys.leadsSummary(),
            });
            void queryClient.invalidateQueries({
              queryKey: queryKeys.leadDetailsBase(),
            });
            return;
          }

          const status = String(row.status ?? "").toLowerCase();
          const dmStatus = String(row.dm_draft_status ?? "").toLowerCase();

          setSafeLeads((prev) =>
            prev.map((lead) => {
              if (String(lead.id) !== leadIdStr) return lead;
              return {
                ...lead,
                linkedin_invitation_status:
                  status === "accepted" || status === "connected"
                    ? "accepted"
                    : status === "sent" || status === "queued"
                      ? "sent"
                      : lead.linkedin_invitation_status,
                linkedin_invitation_sent:
                  status === "sent" || status === "queued" || status === "accepted" || status === "connected"
                    ? true
                    : lead.linkedin_invitation_sent,
                message_sent: dmStatus === "sent" ? true : lead.message_sent,
              };
            })
          );

          void queryClient.invalidateQueries({
            queryKey: queryKeys.prospectionLeadsBase(),
          });
          void queryClient.invalidateQueries({
            queryKey: queryKeys.leadsSummary(),
          });
          void queryClient.invalidateQueries({
            queryKey: queryKeys.leadDetailsBase(),
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [clientId, plan, queryClient]);

  useEffect(() => {
    const openLeadId = openLead?.id;
    if (!openLeadId) {
      setIsLeadDetailsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLeadDetailsLoading(true);

    void queryClient
      .fetchQuery({
        queryKey: queryKeys.leadDetails(openLeadId),
        queryFn: () => fetchLeadDetails(openLeadId),
        staleTime: 5 * 60 * 1000,
      })
      .then((data) => {
        if (cancelled || !data?.lead) return;

        setOpenLead((current) =>
          current && String(current.id) === String(openLeadId)
            ? { ...current, ...data.lead }
            : current
        );

        if (!linkedInDraftDirtyRef.current) {
          setLinkedInDraft(String(data.lead.internal_message ?? ""));
        }
        if (!mailDraftDirtyRef.current) {
          setMailDraft(String(data.lead.message_mail ?? ""));
        }
      })
      .catch((error) => {
        if (!cancelled) console.error(error);
      })
      .finally(() => {
        if (!cancelled) setIsLeadDetailsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [openLead?.id, queryClient]);

  const refreshProspectionQueries = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.prospectionLeadsBase(),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.leadsSummary(),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.leadDetailsBase(),
    });
  }, [queryClient]);

  const handleSearch = useCallback((value: string) => {
    setSearchTerm(value);
    setPage(1);
  }, []);

  const handleDesktopFiltersChange = useCallback((next: ProspectionDesktopFilters) => {
    setDesktopFilters(next);
    setMobileStatusFilter(next.segment);
    setPage(1);
  }, []);

  const resetDesktopFilters = useCallback(() => {
    setDesktopFilters(defaultDesktopFilters());
    setMobileStatusFilter("all");
    setPage(1);
  }, []);

  const handleMobileStatusFilterChange = useCallback((value: MobileLeadFilterKey) => {
    setMobileStatusFilter(value);
    setDesktopFilters((current) => ({ ...current, segment: value }));
    setPage(1);
  }, []);

  const handlePageSizeChange = useCallback(
    (value: (typeof PAGE_SIZE_OPTIONS)[number]) => {
      setPageSize(value);
      setPage(1);
    },
    []
  );

  const handleOpenLead = useCallback((lead: Lead) => {
    linkedInDraftDirtyRef.current = false;
    mailDraftDirtyRef.current = false;
    setShowRelanceLinkedin(false);
    setLinkedInDraft(String(lead.internal_message ?? ""));
    setMailDraft(String(lead.message_mail ?? ""));
    setOpenLead(lead);
  }, []);

  const toggleSelected = (leadId: string) => {
    setSelectedIds((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    const filteredIds = filteredLeads.map((l) => String(l.id));
    const allSelected = filteredIds.every((id) => selectedIds.has(id));

    setSelectedIds((prev: Set<string>) => {
      const next = new Set(prev);

      if (allSelected) filteredIds.forEach((id) => next.delete(id));
      else filteredIds.forEach((id) => next.add(id));

      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    const ok = confirm(`Voulez-vous vraiment supprimer ${selectedIds.size} lead(s) ?`);
    if (!ok) return;

    const ids = Array.from(selectedIds)
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n));

    try {
      const res = await fetch("/dashboard/leads/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data?.error || "Impossible de supprimer ces leads. Réessayez.");
        return;
      }

      // ✅ instant UI update
      setSafeLeads((prev: Lead[]) => prev.filter((l) => !selectedIds.has(String(l.id))));
      setSelectedIds(new Set());
      setOpenLead((prev: Lead | null) =>
        prev && selectedIds.has(String(prev.id)) ? null : prev
      );
      refreshProspectionQueries();
    } catch (e) {
      console.error(e);
      alert("Erreur réseau pendant la suppression.");
    }
  };

  const handleExportSelected = async () => {
    if (selectedIds.size === 0 || exportingSelected) return;

    const ids = Array.from(selectedIds)
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n));

    if (ids.length === 0) {
      alert("Aucun lead valide à exporter.");
      return;
    }

    try {
      setExportingSelected(true);

      const res = await fetch("/dashboard/leads/export/selected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data?.error || "Impossible d'exporter ces leads. Réessayez.");
        return;
      }

      const blob = await res.blob();
      const contentDisposition = res.headers.get("content-disposition") ?? "";
      const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
      const filename = filenameMatch?.[1] ?? "leads-selection-mindlink.csv";

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Erreur réseau pendant l'export.");
    } finally {
      setExportingSelected(false);
    }
  };

  const handleStatusBadgeClick = async (lead: Lead) => {
    if (plan === "full") return;

    const idStr = String(lead.id);
    if (lead.message_sent || updatingStatusIds.has(idStr)) return;

    const previousTraite = Boolean(lead.traite);
    const nextTraite = !previousTraite;

    setUpdatingStatusIds((prev: Set<string>) => {
      const next = new Set(prev);
      next.add(idStr);
      return next;
    });

    // ✅ optimistic UI update
    setSafeLeads((prev: Lead[]) =>
      prev.map((l) =>
        String(l.id) === idStr
          ? {
              ...l,
              traite: nextTraite,
            }
          : l
      )
    );

    setOpenLead((prev: Lead | null) =>
      prev && String(prev.id) === idStr
        ? {
            ...prev,
            traite: nextTraite,
          }
        : prev
    );

    try {
      const res = await fetch("/api/leads/update-traite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: lead.id,
          traite: nextTraite,
        }),
      });

      if (!res.ok) throw new Error("Erreur mise à jour traite");
      refreshProspectionQueries();
    } catch (e) {
      console.error(e);
      alert("Impossible de mettre à jour le statut.");

      // rollback si erreur
      setSafeLeads((prev: Lead[]) =>
        prev.map((l) =>
          String(l.id) === idStr
            ? {
                ...l,
                traite: previousTraite,
              }
            : l
        )
      );

      setOpenLead((prev: Lead | null) =>
        prev && String(prev.id) === idStr
          ? {
              ...prev,
              traite: previousTraite,
            }
          : prev
      );
    } finally {
      setUpdatingStatusIds((prev: Set<string>) => {
        if (!prev.has(idStr)) return prev;
        const next = new Set(prev);
        next.delete(idStr);
        return next;
      });
    }
  };

  const handleLinkedInInvite = async (lead: Lead) => {
    if (plan === "full") return;

    const idStr = String(lead.id);

    if (invitingLeadIds.has(idStr) || lead.linkedin_invitation_sent) return;

    if (!lead.LinkedInURL) {
      setInviteErrors((prev) => ({
        ...prev,
        [idStr]: "URL LinkedIn manquante.",
      }));
      return;
    }

    const numericLeadId = Number(lead.id);
    if (!Number.isFinite(numericLeadId)) {
      setInviteErrors((prev) => ({
        ...prev,
        [idStr]: "Identifiant de lead invalide.",
      }));
      return;
    }

    setInvitingLeadIds((prev: Set<string>) => {
      const next = new Set(prev);
      next.add(idStr);
      return next;
    });

    setInviteErrors((prev) => {
      if (!prev[idStr]) return prev;
      const next = { ...prev };
      delete next[idStr];
      return next;
    });

    try {
      const res = await fetch("/api/linkedin/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: numericLeadId }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Impossible d'envoyer l'invitation."
        );
      }

      const invitationStatus =
        data?.invitationStatus === "accepted" ? "accepted" : "sent";

      setSafeLeads((prev: Lead[]) =>
        prev.map((l) =>
          String(l.id) === idStr
            ? {
                ...l,
                linkedin_invitation_status: invitationStatus,
                linkedin_invitation_sent: true,
                traite: true,
              }
            : l
        )
      );

      setOpenLead((prev: Lead | null) =>
        prev && String(prev.id) === idStr
          ? {
              ...prev,
              linkedin_invitation_status: invitationStatus,
              linkedin_invitation_sent: true,
              traite: true,
            }
          : prev
      );
      refreshProspectionQueries();
    } catch (e: unknown) {
      const errorMessage =
        e instanceof Error ? e.message : "Impossible d'envoyer l'invitation.";
      setInviteErrors((prev) => ({
        ...prev,
        [idStr]: errorMessage,
      }));
    } finally {
      setInvitingLeadIds((prev: Set<string>) => {
        if (!prev.has(idStr)) return prev;
        const next = new Set(prev);
        next.delete(idStr);
        return next;
      });
    }
  };

  // ✅ LIVE UI UPDATE via events from child components
  useEffect(() => {
    const onTreated = (e: Event) => {
      const detail = (e as CustomEvent).detail as { leadId: number; traite: boolean };
      if (!detail?.leadId) return;

      setSafeLeads((prev: Lead[]) =>
        prev.map((l) => (l.id === detail.leadId ? { ...l, traite: detail.traite } : l))
      );

      setOpenLead((prev: Lead | null) =>
        prev?.id === detail.leadId ? { ...prev, traite: detail.traite } : prev
      );
      refreshProspectionQueries();
    };

    const onDeleted = (e: Event) => {
      const detail = (e as CustomEvent).detail as { leadId: string };
      if (!detail?.leadId) return;

      setSafeLeads((prev: Lead[]) => prev.filter((l) => String(l.id) !== detail.leadId));
      setOpenLead((prev: Lead | null) =>
        prev && String(prev.id) === detail.leadId ? null : prev
      );

      // ✅ remove from selection if needed
      setSelectedIds((prev: Set<string>) => {
        if (!prev.has(detail.leadId)) return prev;
        const next = new Set(prev);
        next.delete(detail.leadId);
        return next;
      });
      refreshProspectionQueries();
    };

    window.addEventListener("mindlink:lead-treated", onTreated as EventListener);
    window.addEventListener("mindlink:lead-deleted", onDeleted as EventListener);

    return () => {
      window.removeEventListener("mindlink:lead-treated", onTreated as EventListener);
      window.removeEventListener("mindlink:lead-deleted", onDeleted as EventListener);
    };
  }, [refreshProspectionQueries]);

  // Auto-save internal message (LinkedIn)
  useEffect(() => {
    const currentLeadId = openLead?.id;
    if (!currentLeadId) return;

    const delay = setTimeout(async () => {
      try {
        await fetch("/api/update-internal-message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId: currentLeadId,
            message: linkedInDraft,
          }),
        });

        setOpenLead((prev: Lead | null) =>
          prev && prev.id === currentLeadId
            ? { ...prev, internal_message: linkedInDraft }
            : prev
        );

        setSafeLeads((prev: Lead[]) =>
          prev.map((lead) =>
            lead.id === currentLeadId
              ? { ...lead, internal_message: linkedInDraft }
              : lead
          )
        );
        queryClient.setQueryData(
          queryKeys.leadDetails(currentLeadId),
          (current: LeadDetailsResponse | undefined) =>
            current
              ? {
                  ...current,
                  lead: {
                    ...current.lead,
                    internal_message: linkedInDraft,
                  },
                }
              : current
        );
      } catch (error) {
        console.error(error);
      }
    }, 300);

    return () => clearTimeout(delay);
  }, [linkedInDraft, openLead?.id, queryClient]);

  // ✅ Auto-save mail message (Email) — now for everyone (no premium gating)
  useEffect(() => {
    const currentLeadId = openLead?.id;
    if (!currentLeadId) return;

    const delay = setTimeout(async () => {
      try {
        await fetch("/api/update-mail-message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId: currentLeadId,
            message: mailDraft,
          }),
        });

        setOpenLead((prev: Lead | null) =>
          prev && prev.id === currentLeadId
            ? { ...prev, message_mail: mailDraft }
            : prev
        );

        setSafeLeads((prev: Lead[]) =>
          prev.map((lead) =>
            lead.id === currentLeadId ? { ...lead, message_mail: mailDraft } : lead
          )
        );
        queryClient.setQueryData(
          queryKeys.leadDetails(currentLeadId),
          (current: LeadDetailsResponse | undefined) =>
            current
              ? {
                  ...current,
                  lead: {
                    ...current.lead,
                    message_mail: mailDraft,
                  },
                }
              : current
        );
      } catch (error) {
        console.error(error);
      }
    }, 300);

    return () => clearTimeout(delay);
  }, [mailDraft, openLead?.id, queryClient]);

  const handleSendLinkedInMessage = async () => {
    if (!openLead) return;
    if (plan === "full") return;
    if (openLead.linkedin_invitation_status !== "accepted") return;

    const leadId = Number(openLead.id);
    const idStr = String(openLead.id);
    if (!Number.isFinite(leadId)) {
      setLinkedInMessageSendErrors((prev) => ({
        ...prev,
        [idStr]: "Identifiant de prospect invalide.",
      }));
      return;
    }

    if (openLead.message_sent || sendingLinkedInMessageLeadIds.has(idStr)) return;

    const content = linkedInDraft.trim();
    if (!content) {
      setLinkedInMessageSendErrors((prev) => ({
        ...prev,
        [idStr]: "Le message LinkedIn est vide.",
      }));
      return;
    }

    setSendingLinkedInMessageLeadIds((prev: Set<string>) => {
      const next = new Set(prev);
      next.add(idStr);
      return next;
    });

    setLinkedInMessageSendErrors((prev) => {
      if (!prev[idStr]) return prev;
      const next = { ...prev };
      delete next[idStr];
      return next;
    });

    try {
      const res = await fetch("/api/prospection/send-linkedin-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, content }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false || data?.success === false) {
        const backendErrorCandidates = [data?.error_message, data?.error, data?.message];
        const backendError = backendErrorCandidates.find(
          (candidate): candidate is string =>
            typeof candidate === "string" && candidate.trim().length > 0
        );
        throw new Error(
          backendError?.trim() ?? "Erreur pendant l’envoi du message LinkedIn."
        );
      }

      const threadId = data?.thread?.id ? String(data.thread.id) : null;
      if (threadId) setOpenLeadThreadDbId(threadId);

      setOpenLead((prev: Lead | null) =>
        prev
          ? {
              ...prev,
              message_sent: true,
              message_sent_at: data?.lead?.message_sent_at ?? new Date().toISOString(),
              next_followup_at: data?.lead?.next_followup_at ?? prev.next_followup_at ?? null,
            }
          : prev
      );

      setSafeLeads((prev: Lead[]) =>
        prev.map((l) =>
          l.id === openLead.id
            ? {
                ...l,
                message_sent: true,
                message_sent_at: data?.lead?.message_sent_at ?? new Date().toISOString(),
                next_followup_at: data?.lead?.next_followup_at ?? l.next_followup_at ?? null,
              }
            : l
        )
      );
      refreshProspectionQueries();
      showSidebarToast("success", "Message LinkedIn envoyé ✅");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Erreur pendant l’envoi du message LinkedIn.";
      setLinkedInMessageSendErrors((prev) => ({
        ...prev,
        [idStr]: errorMessage,
      }));
      showSidebarToast("error", errorMessage);
    } finally {
      setSendingLinkedInMessageLeadIds((prev: Set<string>) => {
        if (!prev.has(idStr)) return prev;
        const next = new Set(prev);
        next.delete(idStr);
        return next;
      });
    }
  };

  const handleSendLinkedInMessageForLead = async (lead: Lead) => {
    if (plan === "full") return;
    if (lead.linkedin_invitation_status !== "accepted") return;
    const leadId = Number(lead.id);
    const idStr = String(lead.id);
    if (!Number.isFinite(leadId)) return;
    if (lead.message_sent || sendingLinkedInMessageLeadIds.has(idStr)) return;
    const content = (lead.internal_message ?? "").trim();
    if (!content) {
      setLinkedInMessageSendErrors((prev) => ({ ...prev, [idStr]: "Le message LinkedIn est vide." }));
      return;
    }
    setSendingLinkedInMessageLeadIds((prev: Set<string>) => { const next = new Set(prev); next.add(idStr); return next; });
    setLinkedInMessageSendErrors((prev) => { if (!prev[idStr]) return prev; const next = { ...prev }; delete next[idStr]; return next; });
    try {
      const res = await fetch("/api/prospection/send-linkedin-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false || data?.success === false) {
        const backendError = [data?.error_message, data?.error, data?.message].find(
          (c): c is string => typeof c === "string" && c.trim().length > 0
        );
        throw new Error(backendError?.trim() ?? "Erreur pendant l'envoi du message LinkedIn.");
      }
      setSafeLeads((prev: Lead[]) =>
        prev.map((l) =>
          l.id === lead.id
            ? { ...l, message_sent: true, message_sent_at: data?.lead?.message_sent_at ?? new Date().toISOString() }
            : l
        )
      );
      refreshProspectionQueries();
      showSidebarToast("success", "Message LinkedIn envoyé ✅");
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Erreur pendant l'envoi du message LinkedIn.";
      setLinkedInMessageSendErrors((prev) => ({ ...prev, [idStr]: errorMessage }));
      showSidebarToast("error", errorMessage);
    } finally {
      setSendingLinkedInMessageLeadIds((prev: Set<string>) => {
        if (!prev.has(idStr)) return prev;
        const next = new Set(prev);
        next.delete(idStr);
        return next;
      });
    }
  };

  const handleOpenConvModalForLead = async (lead: Lead) => {
    setConvModalLead(lead);
    setConvMessages([]);
    setConvError(null);
    setConvDraft("");
    setConvModalOpen(true);
    setConvLoading(true);
    let threadId: string | null = null;
    try {
      const res = await fetch(`/api/inbox/thread-by-lead?leadId=${lead.id}`);
      const data = await res.json().catch(() => ({}));
      threadId = data?.thread?.id ? String(data.thread.id) : null;
    } catch {
      setConvError("Impossible de trouver la conversation.");
      setConvLoading(false);
      return;
    }
    if (!threadId) {
      setConvError("Aucune conversation trouvée pour ce prospect.");
      setConvLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/inbox/messages?threadDbId=${threadId}`);
      const data = await res.json().catch(() => ({}));
      const msgs: ConvMessage[] = Array.isArray(data?.messages) ? data.messages : [];
      setConvMessages(msgs.slice().reverse());
    } catch {
      setConvError("Impossible de charger les messages.");
    } finally {
      setConvLoading(false);
    }
  };

  // Reset thread state when the selected lead changes
  useEffect(() => {
    setOpenLeadThreadDbId(null);
    setConvMessages([]);
    setConvError(null);
    setConvDraft("");
    setConvModalOpen(false);
  }, [openLead?.id]);

  const handleOpenConvModal = async () => {
    if (!openLead) return;
    setConvModalLead(openLead);
    setConvMessages([]);
    setConvError(null);
    setConvDraft("");
    setConvModalOpen(true);
    setConvLoading(true);

    let threadId = openLeadThreadDbId;

    if (!threadId) {
      try {
        const res = await fetch(`/api/inbox/thread-by-lead?leadId=${openLead.id}`);
        const data = await res.json().catch(() => ({}));
        threadId = data?.thread?.id ? String(data.thread.id) : null;
        if (threadId) setOpenLeadThreadDbId(threadId);
      } catch {
        setConvError("Impossible de trouver la conversation.");
        setConvLoading(false);
        return;
      }
    }

    if (!threadId) {
      setConvError("Aucune conversation trouvée pour ce prospect.");
      setConvLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/inbox/messages?threadDbId=${threadId}`);
      const data = await res.json().catch(() => ({}));
      const msgs: ConvMessage[] = Array.isArray(data?.messages) ? data.messages : [];
      setConvMessages(msgs.slice().reverse());
    } catch {
      setConvError("Impossible de charger les messages.");
    } finally {
      setConvLoading(false);
    }
  };

  const handleConvSend = async () => {
    if (!openLeadThreadDbId || !convDraft.trim() || convSending) return;

    setConvSending(true);
    const text = convDraft.trim();
    setConvDraft("");

    const optimisticId = `optimistic-${Date.now()}`;
    const optimistic: ConvMessage = {
      id: optimisticId,
      direction: "outbound",
      sender_name: "Vous",
      text,
      sent_at: new Date().toISOString(),
      raw: {},
    };
    setConvMessages((prev) => [...prev, optimistic]);

    try {
      const res = await fetch("/api/inbox/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadDbId: openLeadThreadDbId, text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || data?.error || "Erreur d'envoi.");
      }
      setConvMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticId
            ? {
                ...m,
                id: data?.message?.unipile_message_id ?? m.id,
                sent_at: data?.message?.sent_at ?? m.sent_at,
              }
            : m
        )
      );
    } catch (e: unknown) {
      setConvMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setConvError(e instanceof Error ? e.message : "Erreur d'envoi.");
      setConvDraft(text);
    } finally {
      setConvSending(false);
    }
  };

  const openLeadId = openLead ? String(openLead.id) : null;
  const isSendingOpenLeadLinkedInMessage = openLeadId
    ? sendingLinkedInMessageLeadIds.has(openLeadId)
    : false;
  const openLeadLinkedInMessageError = openLeadId
    ? linkedInMessageSendErrors[openLeadId]
    : null;

  // ✅ Email actions — now for everyone (no premium gating)
  const openPrefilledEmail = () => {
    if (!openLead) return;

    const to = (openLead.email ?? "").trim();
    if (!to) {
      alert("Aucun email disponible pour ce prospect.");
      return;
    }

    const subject = `Lidmeo — ${openLead.FirstName ?? ""} ${openLead.LastName ?? ""}`.trim();
    const body = mailDraft.trim();

    const mailto = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    const popup = window.open(mailto, "_self");
    if (!popup) {
      window.location.assign(mailto);
    }
  };

  const openLinkedInProfile = () => {
    if (!openLead) return;

    const rawUrl = (openLead.LinkedInURL ?? "").trim();
    if (!rawUrl) {
      alert("Aucun profil LinkedIn disponible pour ce prospect.");
      return;
    }

    const safeUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    window.open(safeUrl, "_blank", "noopener,noreferrer");
  };

  const openGmailWeb = () => {
    if (!openLead) return;

    const to = (openLead.email ?? "").trim();
    if (!to) {
      alert("Aucun email disponible pour ce prospect.");
      return;
    }

    const subject = `Lidmeo — ${openLead.FirstName ?? ""} ${openLead.LastName ?? ""}`.trim();
    const body = mailDraft.trim();

    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
      to
    )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openOutlookWeb = () => {
    if (!openLead) return;

    const to = (openLead.email ?? "").trim();
    if (!to) {
      alert("Aucun email disponible pour ce prospect.");
      return;
    }

    const subject = `Lidmeo — ${openLead.FirstName ?? ""} ${openLead.LastName ?? ""}`.trim();
    const body = mailDraft.trim();

    const url = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(
      to
    )}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openLeadRawJobTitle = (openLead?.linkedinJobTitle ?? "").trim();
  const openLeadTranslatedJobTitle = translateLinkedInJobTitle(openLeadRawJobTitle);

  const isSidebarOpen = Boolean(openLead);

  // UX-only: Escape close + lock page scroll when sidebar is open
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenLead(null);
    };
    window.addEventListener("keydown", onKeyDown);

    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyPaddingRight = body.style.paddingRight;

    if (isSidebarOpen) {
      const scrollbarWidth = window.innerWidth - html.clientWidth;
      html.style.overflow = "hidden";
      body.style.overflow = "hidden";
      body.dataset.leadsSidebarOpen = "1";
      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`;
      }
    } else {
      html.style.overflow = "";
      body.style.overflow = "";
      body.style.paddingRight = "";
      delete body.dataset.leadsSidebarOpen;
    }

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.paddingRight = prevBodyPaddingRight;
      delete body.dataset.leadsSidebarOpen;
    };
  }, [isSidebarOpen]);

  if (!clientLoaded) {
    if (paginatedLeadsQuery.isError) {
      return (
        <SubscriptionGate supportEmail="contact@lidmeo.com">
          <div className="h-full min-h-0 w-full px-4 pb-24 pt-10 sm:px-6">
            <div className="mx-auto max-w-[860px] rounded-3xl border border-red-200 bg-white p-6 text-sm text-red-700 shadow-[0_18px_36px_-28px_rgba(15,23,42,0.4)]">
              Impossible de charger la prospection pour le moment. Rechargez la page ou réessayez dans quelques instants.
            </div>
          </div>
        </SubscriptionGate>
      );
    }

    return (
      <div className="h-full min-h-0 w-full px-4 pb-24 pt-10 sm:px-6">
        <div className="mx-auto w-full max-w-[1680px]">
          <div className="hub-card-hero p-6 sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="h-6 w-44 animate-pulse rounded-xl bg-[#e5edf8]" />
                <div className="mt-3 h-4 w-80 animate-pulse rounded-lg bg-[#edf3fb]" />
              </div>
              <div className="h-10 w-28 animate-pulse rounded-xl bg-[#edf3fb]" />
            </div>

            <div className="mt-6 h-12 animate-pulse rounded-xl border border-[#dbe5f3] bg-[#f8fbff]" />
            <div className="mt-4 h-72 animate-pulse rounded-xl border border-[#dbe5f3] bg-[#f8fbff]" />
          </div>
        </div>
      </div>
    );
  }

  const total = summaryStats.total;
  const treatedCount = summaryStats.treated;
  const pendingCount = summaryStats.pending;
  const remainingToTreat = summaryStats.remainingToTreat;
  const openLeadStatus = openLead ? getProspectionStatusKey(openLead) : null;
  const openLeadStatusLabel = openLeadStatus ? getProspectionStatusLabel(openLeadStatus) : null;

  const allFilteredSelected =
    filteredLeads.length > 0 && filteredLeads.every((l) => selectedIds.has(String(l.id)));

  const segmentOptions: Array<{ key: ProspectionSegmentKey; label: string; count: number }> = [
    { key: "all", label: "Tous", count: segmentCounts.all },
    { key: "todo", label: "À faire", count: segmentCounts.todo },
    { key: "pending", label: "En attente", count: segmentCounts.pending },
    { key: "connected", label: "Connecté", count: segmentCounts.connected },
    { key: "sent", label: "Envoyé", count: segmentCounts.sent },
  ];

  const isInitialLoading =
    (paginatedLeadsQuery.isPending && !paginatedLeadsQuery.data) ||
    (summaryQuery.isPending && !summaryQuery.data);

  if (isInitialLoading) {
    return <LeadsSkeleton />;
  }

  return (
    <SubscriptionGate supportEmail="contact@lidmeo.com">
      <>
        <div className="relative h-full min-h-0 w-full px-4 pb-24 pt-4 sm:px-6 sm:pt-5">
          <div className="mx-auto flex h-full min-h-0 w-full max-w-[1680px] flex-col space-y-5">
            <div className="block md:hidden">
              <div className="flex min-h-0 flex-1 flex-col gap-3 pb-3">
                <section className="hub-card-hero relative overflow-hidden p-4">
                  <div className="pointer-events-none absolute inset-0">
                    <div className="absolute -left-14 top-[-120px] h-56 w-56 rounded-full bg-[#dce8ff]/70 blur-3xl" />
                    <div className="absolute -right-16 top-[-120px] h-56 w-56 rounded-full bg-[#d8f4ff]/65 blur-3xl" />
                  </div>

                  <div className="relative">
                    <div className="flex items-center justify-between gap-2">
                      <span className="hub-chip border-[#c8d6ea] bg-[#f7fbff] font-medium">Prospects</span>
                      <div className="flex items-center gap-1.5">
                        <span className="rounded-full border border-[#c8d6ea] bg-[#f7fbff] px-3 py-1 text-[11px] tabular-nums text-[#4f6784]">
                          {mobileFilteredLeads.length}/{filteredCount}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setMobileViewMode((prev) => (prev === "compact" ? "comfort" : "compact"))
                          }
                          className="inline-flex h-8 items-center gap-1 rounded-full border border-[#d7e3f4] bg-white px-2.5 text-[11px] font-medium text-[#4f6784] transition hover:bg-[#f7fbff] focus:outline-none focus:ring-2 focus:ring-[#dce8ff]"
                          aria-label={
                            mobileViewMode === "compact"
                              ? "Passer en affichage confort"
                              : "Passer en affichage compact"
                          }
                          title={mobileViewMode === "compact" ? "Mode compact actif" : "Mode confort actif"}
                        >
                          {mobileViewMode === "compact" ? (
                            <List className="h-3.5 w-3.5" />
                          ) : (
                            <LayoutGrid className="h-3.5 w-3.5" />
                          )}
                          {mobileViewMode === "compact" ? "Compact" : "Confort"}
                        </button>
                      </div>
                    </div>

                    <h1 className="mt-2 text-[22px] font-semibold leading-tight text-[#0b1c33]">
                      Pilotage mobile
                    </h1>
                    <p className="mt-1 text-[12px] text-[#5f7693]">
                      Parcourez vos leads, filtrez vite et ouvrez chaque fiche en un tap.
                    </p>

                    <div className="mt-3 group flex items-center gap-2 rounded-xl border border-[#c8d6ea] bg-[#f5f9ff] px-3 py-2.5 transition focus-within:border-[#90b5ff] focus-within:ring-2 focus-within:ring-[#dce8ff]">
                      <svg
                        className="h-4 w-4 text-[#6a7f9f] transition group-focus-within:text-[#1f5eff]"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1010.5 18a7.5 7.5 0 006.15-3.35z"
                        />
                      </svg>
                      <input
                        value={searchTerm}
                        onChange={(e) => handleSearch(e.target.value)}
                        placeholder="Rechercher un lead..."
                        className="w-full bg-transparent text-sm text-[#0b1c33] placeholder-[#93a6c1] focus:outline-none"
                        aria-label="Rechercher un lead"
                      />
                    </div>
                  </div>
                </section>

                <LeadsMobileFilters
                  options={mobileFilterOptions}
                  activeKey={mobileStatusFilter}
                  onChange={handleMobileStatusFilterChange}
                />

                <div className="min-h-0 flex-1 overflow-y-auto pb-1">
                  <LeadsCards
                    leads={mobileFilteredLeads}
                    hasActiveFilters={Boolean(searchTerm.trim()) || mobileStatusFilter !== "all"}
                    viewMode={mobileViewMode}
                    onOpenLead={(lead) => handleOpenLead(lead as Lead)}
                    onToggleStatus={(lead) => handleStatusBadgeClick(lead as Lead)}
                    onInviteLinkedIn={(lead) => handleLinkedInInvite(lead as Lead)}
                    updatingStatusIds={updatingStatusIds}
                    invitingLeadIds={invitingLeadIds}
                    inviteErrors={inviteErrors}
                    isAutomationManaged={isAutomationManaged}
                    onResetFilters={() => {
                      handleSearch("");
                      handleMobileStatusFilterChange("all");
                    }}
                  />

                  <ProspectionPaginationControls
                    page={pagination.page}
                    totalPages={pagination.totalPages}
                    pageSize={pageSize}
                    total={filteredCount}
                    isFetching={paginatedLeadsQuery.isFetching}
                    onPageChange={setPage}
                    onPageSizeChange={handlePageSizeChange}
                    className="mt-3"
                  />
                </div>
              </div>
            </div>

            <div className="hidden md:flex md:min-h-0 md:flex-1 md:flex-col md:space-y-5">
            <section className="hub-card-hero relative overflow-hidden p-4 sm:p-5">
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute -left-16 top-[-120px] h-64 w-64 rounded-full bg-[#dce8ff]/70 blur-3xl" />
                <div className="absolute -right-20 top-[-140px] h-72 w-72 rounded-full bg-[#d8f4ff]/65 blur-3xl" />
              </div>

              <div className="relative min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="hub-chip border-[#c8d6ea] bg-[#f7fbff] font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#1f5eff]" />
                    Espace client Lidmeo
                  </span>

                  <span className="hub-chip border-[#c8d6ea] bg-[#f7fbff] tabular-nums">
                    {filteredLeads.length}/{filteredCount} affichés
                  </span>

                  <span className="hub-chip border-[#c8d6ea] bg-[#f7fbff] whitespace-nowrap">
                    {plan || "essential"}
                  </span>
                </div>

                <h1 className="hub-page-title mt-2">
                  Pilotage de la prospection
                </h1>
                <p className="mt-2 max-w-3xl text-xs text-[#51627b] sm:text-sm">
                  Centralisez vos leads, priorisez vos actions et suivez votre pipeline
                  de manière structurée, avec une vue opérationnelle compacte.
                </p>
                <div className="mt-3 inline-flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-[11px] text-amber-800 sm:text-xs">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Rappel sécurité: évitez les connexions trop rapides et ne dépassez pas 30
                    invitations LinkedIn par jour.
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                  <Metric title="Total leads" value={total} tone="default" />
                  <Metric title="Traités" value={treatedCount} tone="success" />
                  <Metric title="En attente" value={pendingCount} tone="info" />
                  <Metric title="À traiter" value={remainingToTreat} tone="warning" />
                </div>

                <div className="mt-3 md:hidden">
                  <div className="group flex items-center gap-2.5 rounded-xl border border-[#c8d6ea] bg-[#f5f9ff] px-3 py-2.5 shadow-[0_16px_28px_-26px_rgba(18,43,86,0.8)] transition focus-within:border-[#90b5ff] focus-within:ring-2 focus-within:ring-[#dce8ff]">
                    <svg
                      className="h-4 w-4 text-[#6a7f9f] transition group-focus-within:text-[#1f5eff]"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1010.5 18a7.5 7.5 0 006.15-3.35z"
                      />
                    </svg>
                    <input
                      value={searchTerm}
                      onChange={(e) => handleSearch(e.target.value)}
                      placeholder="Rechercher (nom, entreprise, poste, ville, email, téléphone)…"
                      className="w-full bg-transparent text-sm text-[#0b1c33] placeholder-[#93a6c1] focus:outline-none"
                      aria-label="Rechercher un lead"
                    />
                  </div>

                  <div className="mt-1.5 text-[11px] text-[#51627b]">
                    {filteredCount} résultat(s) • {pendingCount} en attente • {selectedCount} sélectionné(s)
                  </div>
                </div>
              </div>
            </section>

            <ProspectionFilterBar
              searchValue={searchTerm}
              onSearchChange={handleSearch}
              resultsCount={filteredCount}
              activeFiltersCount={desktopActiveFiltersCount}
              currentFilters={desktopFilters}
              onChange={handleDesktopFiltersChange}
              onReset={resetDesktopFilters}
              segmentOptions={segmentOptions}
              actions={
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={toggleSelectAllFiltered}
                    className="h-8 rounded-full border-[#c8d6ea] bg-white px-3 text-xs text-[#3f587a] hover:bg-[#f3f8ff]"
                  >
                    {allFilteredSelected ? "Tout désélectionner" : "Tout sélectionner"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full border-[#c8d6ea] bg-white px-3 text-xs text-[#3f587a] hover:bg-[#f3f8ff]"
                    asChild
                  >
                    <a href="/dashboard/leads/export">Tout exporter en CSV</a>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleExportSelected}
                    disabled={selectedCount === 0 || exportingSelected}
                    className="h-8 rounded-full px-3 text-xs"
                  >
                    {exportingSelected ? "Export..." : `Exporter (${selectedCount})`}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={handleBulkDelete}
                    disabled={selectedCount === 0}
                    className="h-8 rounded-full px-3 text-xs"
                  >
                    Supprimer ({selectedCount})
                  </Button>
                </>
              }
            />

            <section className="hub-card flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d7e3f4] bg-[#f8fbff] px-6 py-4">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-[#0b1c33]">Table des leads</h2>
                  <p className="text-[11px] text-[#51627b]">
                    Utilisez “Voir” pour ouvrir le panneau de traitement.
                  </p>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-[#51627b]">
                  {paginatedLeadsQuery.isFetching ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[#c8d6ea] bg-white px-3 py-1 text-[#4f6784]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Mise à jour
                    </span>
                  ) : null}
                  <span className="rounded-full border border-[#c8d6ea] bg-[#f7fbff] px-3 py-1 tabular-nums">
                    {selectedCount} sélectionné(s)
                  </span>
                  <span className="rounded-full border border-[#c8d6ea] bg-[#f7fbff] px-3 py-1 tabular-nums">
                    {pendingCount} en attente
                  </span>
                  <span className="rounded-full border border-[#c8d6ea] bg-[#f7fbff] px-3 py-1 tabular-nums">
                    {treatedCount} traités
                  </span>
                </div>
              </div>

              <div ref={tableScrollRef} className="min-h-0 flex-1 w-full overflow-auto px-2 pb-2 pt-1">
                <table className="min-w-[1080px] w-full table-fixed border-separate [border-spacing:0_6px] text-[13px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="text-[11px] font-medium tracking-[0.02em] text-[#405770]">
                      <th className="w-[46px] px-2 py-1.5 text-center whitespace-nowrap">
                        Sel.
                      </th>
                      <th className="w-[132px] px-2 py-1.5 text-center whitespace-nowrap">
                        Statut
                      </th>
                      <th className="w-[280px] px-2 py-1.5 text-left whitespace-nowrap">
                        Prospect
                      </th>
                      <th className="w-[170px] px-2 py-1.5 text-left whitespace-nowrap">
                        Poste
                      </th>
                      <th className="w-[200px] px-2 py-1.5 text-left whitespace-nowrap">
                        Contact
                      </th>
                      <th className="w-[180px] px-2 py-1.5 text-left whitespace-nowrap">
                        LinkedIn
                      </th>
                      <th className="w-[92px] px-2 py-1.5 text-center whitespace-nowrap">
                        Date
                      </th>
                      <th className="w-[90px] px-2 py-1.5 text-center whitespace-nowrap">
                        Supprimer
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredLeads.length === 0 ? (
                      <tr>
                        <td colSpan={colCount} className="py-16 text-center">
                          <div className="mx-auto max-w-md px-6">
                            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-[#dbe5f3] bg-white text-[#4B5563]">
                              ⌕
                            </div>
                            <div className="font-medium text-[#0F172A]">Aucun résultat</div>
                            <div className="mt-1 text-sm text-[#4B5563]">
                              Essayez un autre nom, une entreprise ou une ville.
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <>
                        {rowVirtualizer.getVirtualItems()[0]?.start > 0 && (
                          <tr><td colSpan={colCount} style={{ height: rowVirtualizer.getVirtualItems()[0].start }} /></tr>
                        )}
                        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                        const lead = filteredLeads[virtualRow.index];
                        const idx = virtualRow.index;
                        const fullName =
                          `${lead.FirstName ?? ""} ${lead.LastName ?? ""}`.trim() ||
                          lead.Name ||
                          "—";
                        const rawJobTitle = (lead.linkedinJobTitle ?? "").trim();
                        const translatedJobTitle = translateLinkedInJobTitle(rawJobTitle);
                        const idStr = String(lead.id);
                        const isSelected = selectedIds.has(idStr);
                        const isStatusUpdating = updatingStatusIds.has(idStr);
                        const isInviteLoading = invitingLeadIds.has(idStr);
                        const invitationStatus = getProspectionInvitationState(lead);
                        const statusKey = getProspectionStatusKey(lead);
                        const isInviteAccepted = invitationStatus === "accepted";
                        const isInviteSent = invitationStatus === "sent";
                        const inviteError = inviteErrors[idStr];
                        const isSent = statusKey === "sent";
                        const isPending = statusKey === "pending";
                        const isTodo = statusKey === "todo";
                        const isConnectedLeft = statusKey === "connected";
                        const statusLabel = statusKey === "sent"
                          ? "Envoyé"
                          : statusKey === "connected"
                            ? "Connecté"
                            : statusKey === "pending"
                              ? "En attente"
                              : "À faire";
                        const initials =
                          (
                            `${lead.FirstName?.[0] ?? ""}${lead.LastName?.[0] ?? ""}`.toUpperCase() ||
                            fullName.slice(0, 2).toUpperCase()
                          ) || "—";
                        const statusDotClass = getProspectionStatusDotClass(statusKey);
                        const baseCellClass = "border-y border-[#d7e3f4] px-2.5 py-2 align-middle";

                        return (
                          <tr
                            key={lead.id}
                            className={[
                              "hub-table-row group",
                              idx % 2 === 0 ? "bg-[#f4f8ff]" : "bg-[#f0f5fd]",
                              isSelected ? "ring-2 ring-[#dce8ff]" : "",
                            ].join(" ")}
                          >
                            <td className={`${baseCellClass} rounded-l-2xl border-l border-[#d7e3f4] text-center`}>
                              <div className="flex items-center justify-center gap-2">
                                <span className={`h-2 w-2 rounded-full ${statusDotClass}`} />
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelected(idStr)}
                                  className="h-4 w-4 cursor-pointer rounded border-[#c7d5e7] text-[#1f5eff] focus:ring-[#dce8ff]"
                                  aria-label={`Sélectionner le lead ${fullName}`}
                                />
                              </div>
                            </td>

                            <td className={`${baseCellClass} text-center`}>
                              <button
                                type="button"
                                onClick={() => handleStatusBadgeClick(lead)}
                                disabled={isAutomationManaged || isSent || isConnectedLeft || isStatusUpdating}
                                className={[
                                  "inline-flex h-8 items-center justify-center rounded-full border px-3 text-[11px] font-medium transition focus:outline-none focus:ring-2",
                                  getProspectionStatusClasses(statusKey, "table"),
                                  isSent
                                    ? "cursor-default focus:ring-violet-200"
                                    : isConnectedLeft
                                      ? "cursor-default focus:ring-emerald-200"
                                      : isAutomationManaged
                                        ? "cursor-default focus:ring-[#dce8ff]"
                                        : isPending
                                          ? "hover:bg-amber-100 focus:ring-amber-200"
                                          : "hover:border-[#77a6f4] hover:bg-[#e9f1ff] focus:ring-[#dce8ff]",
                                  isStatusUpdating ? "cursor-wait opacity-70" : "",
                                ].join(" ")}
                                title={
                                  isAutomationManaged
                                    ? "Statut pilote automatiquement"
                                    : isSent
                                    ? "Message déjà envoyé"
                                    : isConnectedLeft
                                      ? "Connexion LinkedIn acceptée"
                                    : isPending
                                      ? "Repasser à À faire"
                                      : "Marquer en attente d'envoi"
                                }
                                aria-label={`Statut du lead ${fullName} : ${statusLabel}`}
                              >
                                {isStatusUpdating ? (
                                  "Mise à jour..."
                                ) : isTodo && !isConnectedLeft ? (
                                  <span className="inline-flex items-center gap-1.5">
                                    <span>À faire</span>
                                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[#c6dbff] bg-white text-[#1f5eff]">
                                      <MoveRight className="h-2.5 w-2.5" />
                                    </span>
                                  </span>
                                ) : (
                                  statusLabel
                                )}
                              </button>
                            </td>

                            <td className={`${baseCellClass} relative pr-14 text-[#0b1c33]`}>
                              <div className="flex min-w-0 items-start gap-3">
                                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#c8d6ea] bg-[#e9f1ff] text-[10px] font-semibold text-[#35598b]">
                                  {initials}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-[#0f213c]">{fullName}</p>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[#58708f]">
                                    {lead.Company ? (
                                      <span className="inline-flex min-w-0 items-center gap-1">
                                        <Building2 className="h-3.5 w-3.5 shrink-0" />
                                        <span className="truncate">{lead.Company}</span>
                                      </span>
                                    ) : null}
                                    {lead.location ? (
                                      <span className="inline-flex min-w-0 items-center gap-1">
                                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                                        <span className="truncate">{lead.location}</span>
                                      </span>
                                    ) : null}
                                    {!lead.Company && !lead.location ? (
                                      <span className="inline-flex items-center gap-1">
                                        <UserCircle2 className="h-3.5 w-3.5 shrink-0" />
                                        Aucune info complémentaire
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              </div>

                              <HubButton
                                type="button"
                                variant="primary"
                                size="sm"
                                onClick={() => handleOpenLead(lead)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 hover:-translate-y-1/2 hover:scale-[1.02] hover:shadow-[0_10px_18px_-16px_rgba(31,94,255,0.75)]"
                              >
                                Voir
                              </HubButton>
                            </td>

                            <td className={`${baseCellClass} text-[#405770]`}>
                              <div className="space-y-1">
                                <p className="line-clamp-2 text-[12px] font-medium text-[#0f213c]">
                                  {translatedJobTitle || "Poste non renseigné"}
                                </p>
                              </div>
                            </td>

                            <td className={`${baseCellClass} text-[#405770]`}>
                              <div className="space-y-1">
                                {lead.email ? (
                                  <a
                                    href={`mailto:${lead.email}`}
                                    className="group inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[#c8d6ea] bg-[#f7fbff] px-2 py-1 text-[11px] text-[#36506e] transition hover:border-[#afc7eb] hover:bg-[#edf4fd]"
                                  >
                                    <Mail className="h-3.5 w-3.5 shrink-0 text-[#58708f]" />
                                    <span className="truncate">{lead.email}</span>
                                  </a>
                                ) : (
                                  <p className="inline-flex items-center gap-1.5 text-[11px] text-[#8093ad]">
                                    <Mail className="h-3.5 w-3.5" />
                                    Aucun email
                                  </p>
                                )}

                                {lead.phone ? (
                                  <a
                                    href={`tel:${lead.phone}`}
                                    className="group inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[#c8d6ea] bg-[#f7fbff] px-2 py-1 text-[11px] text-[#36506e] transition hover:border-[#afc7eb] hover:bg-[#edf4fd]"
                                  >
                                    <Phone className="h-3.5 w-3.5 shrink-0 text-[#58708f]" />
                                    <span className="truncate">{lead.phone}</span>
                                  </a>
                                ) : (
                                  <p className="inline-flex items-center gap-1.5 text-[11px] text-[#8093ad]">
                                    <Phone className="h-3.5 w-3.5" />
                                    Aucun téléphone
                                  </p>
                                )}
                              </div>
                            </td>

                            <td className={baseCellClass}>
                              <div className="flex flex-col items-start gap-1">
                                {lead.LinkedInURL ? (
                                  <a
                                    href={lead.LinkedInURL}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-[#d7e3f4] bg-white px-3 text-[12px] font-medium text-[#334155] transition hover:border-[#9cc0ff] hover:bg-[#f3f8ff] focus:outline-none focus:ring-2 focus:ring-[#dce8ff]"
                                  >
                                    <Linkedin className="h-3.5 w-3.5" />
                                    Profil
                                  </a>
                                ) : (
                                  <span className="text-[11px] text-[#64748b]">
                                    Profil indisponible
                                  </span>
                                )}

                                {isSent ? (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenConvModalForLead(lead)}
                                    className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-3 text-[11px] font-medium text-violet-700 transition hover:border-violet-300 hover:bg-violet-100 focus:outline-none focus:ring-2 focus:ring-violet-200"
                                  >
                                    <MessageSquare className="h-3 w-3" />
                                    Conversation
                                  </button>
                                ) : plan === "full" ? null : isInviteAccepted ? (
                                  <button
                                    type="button"
                                    onClick={() => handleSendLinkedInMessageForLead(lead)}
                                    disabled={sendingLinkedInMessageLeadIds.has(idStr)}
                                    className={[
                                      "inline-flex h-8 items-center justify-center rounded-lg border px-3 text-[11px] font-medium transition focus:outline-none focus:ring-2",
                                      linkedInMessageSendErrors[idStr]
                                        ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 focus:ring-red-200"
                                        : "border-[#1e40af] bg-[#1e3a8a] text-white hover:bg-[#1e40af] focus:ring-[#3b82f6]",
                                      sendingLinkedInMessageLeadIds.has(idStr) ? "cursor-wait opacity-70" : "",
                                    ].join(" ")}
                                  >
                                    {sendingLinkedInMessageLeadIds.has(idStr) ? "Envoi..." : "Envoyer"}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleLinkedInInvite(lead)}
                                    disabled={!lead.LinkedInURL || isInviteSent || isInviteLoading}
                                    className={[
                                      "inline-flex h-8 items-center justify-center rounded-lg border px-3 text-[11px] font-medium transition focus:outline-none focus:ring-2",
                                      isInviteSent
                                        ? "cursor-default border-amber-200 bg-amber-50 text-amber-700 focus:ring-amber-200"
                                        : inviteError
                                          ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 focus:ring-red-200"
                                          : "border-[#9cc0ff] bg-[#f2f7ff] text-[#1f4f96] hover:border-[#77a6f4] hover:bg-[#e9f1ff] focus:ring-[#dce8ff]",
                                      !lead.LinkedInURL ? "cursor-not-allowed opacity-60" : "",
                                      isInviteLoading ? "cursor-wait opacity-70" : "",
                                    ].join(" ")}
                                  >
                                    {isInviteSent ? "Connexion envoyée" : isInviteLoading ? "Envoi..." : "Se connecter"}
                                  </button>
                                )}

                                {inviteError ? (
                                  <span className="text-[10px] text-red-600">{inviteError}</span>
                                ) : linkedInMessageSendErrors[idStr] ? (
                                  <span className="text-[10px] text-red-600">{linkedInMessageSendErrors[idStr]}</span>
                                ) : null}
                              </div>
                            </td>
                            <td className={`${baseCellClass} whitespace-nowrap text-center tabular-nums text-[#64748b]`}>
                              {lead.created_at ? new Date(lead.created_at).toLocaleDateString("fr-FR") : "—"}
                            </td>
                            <td className={`${baseCellClass} rounded-r-2xl border-r border-[#d7e3f4] text-center`}>
                              <DeleteLeadButton leadId={lead.id} />
                            </td>
                          </tr>
                        );
                        })}
                        {(() => {
                          const items = rowVirtualizer.getVirtualItems();
                          const paddingBottom = items.length > 0 ? rowVirtualizer.getTotalSize() - items[items.length - 1].end : 0;
                          return paddingBottom > 0 ? <tr><td colSpan={colCount} style={{ height: paddingBottom }} /></tr> : null;
                        })()}
                      </>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#d7e3f4] bg-[#f8fbff] px-6 py-3 text-[11px] text-[#51627b]">
                <div>
                  {isAutomationManaged
                    ? "Les statuts LinkedIn se mettent a jour automatiquement depuis l'automatisation."
                    : "Passez “À faire” en “En attente”, puis “Voir” pour traiter le lead."}
                </div>
                <div className="tabular-nums">
                  {treatedCount} traité(s) • {remainingToTreat} à traiter
                </div>
              </div>

              <ProspectionPaginationControls
                page={pagination.page}
                totalPages={pagination.totalPages}
                pageSize={pageSize}
                total={filteredCount}
                isFetching={paginatedLeadsQuery.isFetching}
                onPageChange={setPage}
                onPageSizeChange={handlePageSizeChange}
                className="border-t border-[#d7e3f4] bg-white px-6 py-3"
              />
            </section>
          </div>

          {openLead && (
            <>
              <button
                type="button"
                onClick={() => setOpenLead(null)}
                className="fixed inset-0 z-[200] bg-[#0F172A]/42 backdrop-blur-[4px]"
                aria-label="Fermer le panneau lead"
              />

              <div className="animate-slideLeft fixed inset-y-0 right-0 z-[210] flex h-screen max-h-screen min-h-0 w-full touch-pan-y flex-col overflow-hidden border-l border-[#dbe5f3] bg-white shadow-[0_18px_42px_-22px_rgba(15,23,42,0.38)] sm:w-[520px]">
                <div className="z-10 border-b border-[#e2e8f0] bg-white/95 px-5 pt-4 pb-5 backdrop-blur-xl">
                  {/* Barre de navigation */}
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setOpenLead(null)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] text-[#64748b] transition hover:bg-[#f1f5f9] hover:text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]"
                      aria-label="Fermer le panneau"
                    >
                      <X className="h-3.5 w-3.5" />
                      Fermer
                    </button>
                    <div className="flex items-center gap-2">
                      {isLeadDetailsLoading ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#dbe5f3] bg-white px-3 py-1 text-[11px] text-[#64748b] whitespace-nowrap">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Chargement
                        </span>
                      ) : null}
                      <span className="rounded-full border border-[#dbe5f3] bg-[#f8fbff] px-3 py-1 text-[11px] text-[#64748b] whitespace-nowrap">
                        {plan || "essential"}
                      </span>
                    </div>
                  </div>

                  {/* Identité prospect */}
                  <div className="mt-4 flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3b82f6] to-[#1d4ed8] text-sm font-semibold text-white shadow-sm">
                      {((openLead.FirstName?.[0] ?? "") + (openLead.LastName?.[0] ?? "")).toUpperCase() || "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-[17px] font-semibold leading-tight text-[#0F172A]">
                        {(openLead.FirstName ?? "")} {(openLead.LastName ?? "")}
                      </h2>
                      <p className="mt-0.5 truncate text-[12px] text-[#64748b]">
                        {[openLead.Company, openLead.location].filter(Boolean).join(" • ") || "—"}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {openLeadStatus && openLeadStatusLabel ? (
                        <span
                          className={[
                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium whitespace-nowrap",
                            getProspectionStatusClasses(openLeadStatus, "sidebar"),
                          ].join(" ")}
                        >
                          <span
                            className={[
                              "h-1.5 w-1.5 rounded-full",
                              openLeadStatus === "sent"
                                ? "bg-violet-500"
                                : openLeadStatus === "connected"
                                  ? "bg-emerald-500"
                                  : openLeadStatus === "pending"
                                    ? "bg-amber-500"
                                    : "bg-[#94a3b8]",
                            ].join(" ")}
                          />
                          {openLeadStatus === "sent"
                            ? "Envoyé"
                            : openLeadStatus === "connected"
                              ? "Connecté"
                              : openLeadStatus === "pending"
                                ? "En attente"
                                : "À faire"}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain touch-pan-y p-6 [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch]">
                  <div className="hub-card-soft px-4 py-3">
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-[#94a3b8]">Informations</div>
                    <div className="divide-y divide-[#f1f5f9]">
                      <InfoBlock title="LinkedIn" icon={<Linkedin className="h-3.5 w-3.5" />}>
                        {openLead.LinkedInURL ? (
                          <button
                            type="button"
                            onClick={openLinkedInProfile}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#dbe5f3] bg-white px-2.5 py-1.5 text-xs text-[#334155] transition hover:border-[#bfdbfe] hover:bg-[#f0f6ff] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]"
                          >
                            <Linkedin className="h-3 w-3 text-[#0A66C2]" />
                            Voir le profil
                          </button>
                        ) : (
                          <span className="text-[#94a3b8]">—</span>
                        )}
                      </InfoBlock>

                      <InfoBlock title="Poste" icon={<Briefcase className="h-3.5 w-3.5" />}>
                        <span>{openLeadTranslatedJobTitle || <span className="text-[#94a3b8]">—</span>}</span>
                      </InfoBlock>

                      {emailOption && (
                        <InfoBlock title="Email" icon={<Mail className="h-3.5 w-3.5" />}>
                          {openLead.email ? (
                            <a
                              href={`mailto:${openLead.email}`}
                              className="truncate text-[#2563EB] hover:underline"
                            >
                              {openLead.email}
                            </a>
                          ) : (
                            <span className="text-[#94a3b8]">—</span>
                          )}
                        </InfoBlock>
                      )}

                      {phoneOption && (
                        <InfoBlock title="Téléphone" icon={<Phone className="h-3.5 w-3.5" />}>
                          {openLead.phone ? (
                            <a
                              href={`tel:${openLead.phone}`}
                              className="text-[#2563EB] hover:underline"
                            >
                              {openLead.phone}
                            </a>
                          ) : (
                            <span className="text-[#94a3b8]">—</span>
                          )}
                        </InfoBlock>
                      )}

                      {openLead.website && (
                        <InfoBlock title="Site web" icon={<Globe className="h-3.5 w-3.5" />}>
                          <a
                            href={openLead.website.startsWith("http") ? openLead.website : `https://${openLead.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#dbe5f3] bg-white px-2.5 py-1.5 text-xs text-[#334155] transition hover:border-[#bfdbfe] hover:bg-[#f0f6ff] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]"
                          >
                            <Globe className="h-3 w-3 text-[#64748b]" />
                            Ouvrir le site
                          </a>
                        </InfoBlock>
                      )}

                      <InfoBlock title="Créé le" icon={<Calendar className="h-3.5 w-3.5" />}>
                        <span>
                          {openLead.created_at
                            ? new Date(openLead.created_at).toLocaleDateString("fr-FR")
                            : <span className="text-[#94a3b8]">—</span>}
                        </span>
                      </InfoBlock>
                    </div>
                  </div>

                  <div className="hub-card-soft p-4">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-xs font-medium text-[#0F172A]">Message LinkedIn</label>
                      <span className="text-[11px] text-[#4B5563] whitespace-nowrap">Autosave</span>
                    </div>

                    <textarea
                      value={linkedInDraft}
                      onChange={(e) => {
                        linkedInDraftDirtyRef.current = true;
                        setLinkedInDraft(e.target.value);
                      }}
                      placeholder="Écrivez votre message LinkedIn…"
                      className="mt-3 min-h-[176px] w-full resize-y overflow-y-auto rounded-xl border border-[#dbe5f3] bg-white p-4 text-sm text-[#0F172A] placeholder-[#94a3b8] transition focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]"
                    />

                    <div className="mt-3 space-y-2">
                      {openLeadStatus === "todo" && (
                        <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#dbe5f3] bg-[#f8fbff] px-4 py-3 text-sm text-[#64748b]">
                          <Linkedin className="h-4 w-4 text-[#0A66C2]" />
                          A faire
                        </div>
                      )}

                      {openLeadStatus === "pending" && (
                        <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#dbe5f3] bg-[#f8fbff] px-4 py-3 text-sm text-[#64748b]">
                          <Linkedin className="h-4 w-4 text-[#0A66C2]" />
                          En attente d&apos;acceptation
                        </div>
                      )}

                      {/* Bouton envoyer — invitation acceptée, pas encore envoyé, plan essential uniquement */}
                      {openLeadStatus === "connected" && plan !== "full" && (
                        <button
                          type="button"
                          onClick={handleSendLinkedInMessage}
                          disabled={isSendingOpenLeadLinkedInMessage}
                          className={[
                            "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2",
                            openLeadLinkedInMessageError
                              ? "bg-red-600 text-white hover:bg-red-700 focus:ring-red-200"
                              : isSendingOpenLeadLinkedInMessage
                                ? "cursor-wait bg-[#2563EB]/80 text-white focus:ring-[#bfdbfe]"
                                : "bg-[#2563EB] text-white hover:bg-[#1d4ed8] focus:ring-[#bfdbfe]",
                          ].join(" ")}
                        >
                          <Linkedin className="h-4 w-4" />
                          {isSendingOpenLeadLinkedInMessage
                            ? "Envoi en cours…"
                            : openLeadLinkedInMessageError
                              ? "Erreur — réessayer"
                              : "Envoyer le message LinkedIn"}
                        </button>
                      )}

                      {openLeadStatus === "connected" && plan === "full" && (
                        <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                          Connexion acceptee
                        </div>
                      )}

                      {/* Message envoyé + voir la conversation */}
                      {openLeadStatus === "sent" && (
                        <>
                          <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-medium text-violet-700">
                            Message envoye ✅
                          </div>
                          <button
                            type="button"
                            onClick={handleOpenConvModal}
                            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#dbe5f3] bg-white px-4 py-3 text-sm font-medium text-[#2563EB] transition hover:bg-[#f0f6ff] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]"
                          >
                            <MessageSquare className="h-4 w-4" />
                            Voir la conversation
                          </button>
                        </>
                      )}
                    </div>

                    {openLeadLinkedInMessageError ? (
                      <p className="mt-2 text-xs text-red-600">{openLeadLinkedInMessageError}</p>
                    ) : null}

                    {openLead.next_followup_at && (
                      <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                        <span className="text-amber-500 text-sm">⏰</span>
                        <p className="text-xs text-amber-800">
                          Relance programmée le{" "}
                          <span className="font-semibold">
                            {new Date(openLead.next_followup_at).toLocaleDateString("fr-FR")}
                          </span>
                        </p>
                      </div>
                    )}

                    {openLead.relance_linkedin && (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => setShowRelanceLinkedin((v) => !v)}
                          className="flex w-full items-center justify-between gap-2 rounded-xl border border-[#dbe5f3] bg-white px-4 py-3 text-sm font-medium text-[#2563EB] transition hover:bg-[#f0f6ff] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]"
                        >
                          <span className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" />
                            Voir le message de relance
                          </span>
                          <span className="text-[#94a3b8] text-xs">{showRelanceLinkedin ? "▲" : "▼"}</span>
                        </button>

                        {showRelanceLinkedin && (
                          <div className="mt-2 rounded-xl border border-[#dbe5f3] bg-[#f8fbff] p-4 text-sm text-[#0F172A] whitespace-pre-wrap">
                            {openLead.relance_linkedin}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="hub-card-soft p-4">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-xs font-medium text-[#0F172A]">Message email</label>
                      <span className="text-[11px] text-[#4B5563] whitespace-nowrap">Autosave</span>
                    </div>

                    <textarea
                      value={mailDraft}
                      onChange={(e) => {
                        mailDraftDirtyRef.current = true;
                        setMailDraft(e.target.value);
                      }}
                      placeholder="Écrivez votre message email…"
                      className="mt-3 min-h-[176px] w-full resize-y overflow-y-auto rounded-xl border border-[#dbe5f3] bg-white p-4 text-sm text-[#0F172A] placeholder-[#94a3b8] transition focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]"
                    />

                    {(() => {
                      const hasEmail = Boolean((openLead.email ?? "").trim());
                      const dimIfNoEmail = hasEmail ? "" : "opacity-50";

                      return (
                        <>
                          <div className="mt-4">
                            <HubButton
                              type="button"
                              variant="secondary"
                              className={["w-full", dimIfNoEmail].join(" ")}
                              onClick={openPrefilledEmail}
                            >
                              Ouvrir l’email pré-rempli
                            </HubButton>
                          </div>

                          <div className="mt-2 flex gap-2">
                            <HubButton
                              type="button"
                              variant="secondary"
                              className={["flex-1", dimIfNoEmail].join(" ")}
                              onClick={openGmailWeb}
                            >
                              Gmail
                            </HubButton>
                            <HubButton
                              type="button"
                              variant="secondary"
                              className={["flex-1", dimIfNoEmail].join(" ")}
                              onClick={openOutlookWeb}
                            >
                              Outlook
                            </HubButton>
                          </div>

                          {!hasEmail && (
                            <p className="mt-2 text-[11px] text-[#4B5563]">
                              Aucun email détecté pour ce lead.
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Modal conversation LinkedIn */}
          {convModalOpen && (
            <div
              className="fixed inset-0 z-[220] flex items-center justify-center bg-[#0f172a]/50 p-4"
              onClick={(e) => { if (e.target === e.currentTarget) setConvModalOpen(false); }}
            >
              <div className="relative flex h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#d7e3f4] bg-white shadow-2xl">
                {/* Header */}
                <div className="flex shrink-0 items-center justify-between border-b border-[#d7e3f4] px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-[#0b1c33]">
                      {[convModalLead?.FirstName, convModalLead?.LastName].filter(Boolean).join(" ") || convModalLead?.Name || "Conversation"}
                    </p>
                    <p className="text-xs text-[#51627b]">Conversation LinkedIn</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConvModalOpen(false)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#dbe5f3] text-[#51627b] transition hover:bg-[#f5f9ff] focus:outline-none focus:ring-2 focus:ring-[#bfd8ff]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Messages */}
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                  {convLoading ? (
                    <div className="flex h-full items-center justify-center text-sm text-[#51627b]">
                      Chargement…
                    </div>
                  ) : convError ? (
                    <div className="flex h-full items-center justify-center text-sm text-red-600">
                      {convError}
                    </div>
                  ) : convMessages.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-[#64748b]">
                      Aucun message pour l&apos;instant.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {convMessages.map((msg) => {
                        const raw = msg.raw && typeof msg.raw === "object" ? msg.raw as Record<string, unknown> : {};
                        const isDeleted = raw.deleted === true;
                        const outbound = String(msg.direction ?? "").toLowerCase() === "outbound";
                        return (
                          <div
                            key={msg.id}
                            className={[
                              "max-w-[88%] rounded-2xl border px-3 py-2 text-sm",
                              outbound
                                ? "ml-auto border-[#9cc0ff] bg-[#edf5ff] text-[#14345e]"
                                : "mr-auto border-[#d7e3f4] bg-[#f7fbff] text-[#1e3551]",
                            ].join(" ")}
                          >
                            <div className="mb-1 text-[11px] text-[#6a7f9f]">
                              {msg.sender_name || (outbound ? "Vous" : "Prospect")}
                            </div>
                            <div className="whitespace-pre-wrap">
                              {isDeleted ? "Message supprimé" : msg.text || "—"}
                            </div>
                            <div className="mt-1 text-[10px] text-[#7a8ea9]">
                              {msg.sent_at ? new Date(msg.sent_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                            </div>
                          </div>
                        );
                      })}
                      <div ref={convMessagesEndRef} />
                    </div>
                  )}
                </div>

                {/* Composer */}
                <div className="shrink-0 border-t border-[#d7e3f4] px-4 py-3">
                  {convError && convMessages.length > 0 && (
                    <p className="mb-2 text-xs text-red-600">{convError}</p>
                  )}
                  <div className="flex items-end gap-2">
                    <textarea
                      value={convDraft}
                      onChange={(e) => setConvDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleConvSend();
                      }}
                      placeholder="Écrire un message…"
                      rows={3}
                      className="min-h-[72px] flex-1 resize-none rounded-xl border border-[#c8d6ea] bg-[#f8fbff] px-3 py-2 text-sm text-[#0b1c33] placeholder-[#93a6c1] focus:border-[#9cc0ff] focus:outline-none focus:ring-2 focus:ring-[#dce8ff]"
                    />
                    <HubButton
                      type="button"
                      variant="primary"
                      onClick={handleConvSend}
                      disabled={convSending || !convDraft.trim()}
                      className="shrink-0"
                    >
                      {convSending ? "…" : "Envoyer"}
                    </HubButton>
                  </div>
                </div>
              </div>
            </div>
          )}

          {sidebarToast ? (
            <div
              className={[
                "fixed bottom-5 right-5 z-[120] max-w-[min(90vw,360px)] rounded-xl border px-4 py-3 text-sm shadow-[0_20px_45px_-25px_rgba(2,6,23,0.55)]",
                sidebarToast.tone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-red-200 bg-red-50 text-red-800",
              ].join(" ")}
              role="status"
              aria-live="polite"
            >
              {sidebarToast.message}
            </div>
          ) : null}
        </div>
        </div>

      </>
    </SubscriptionGate>
  );
}

function Metric({
  title,
  value,
  tone,
}: {
  title: string;
  value: ReactNode;
  tone: "default" | "success" | "warning" | "info";
}) {
  const valueColor =
    tone === "success"
      ? "text-emerald-700"
      : tone === "warning"
        ? "text-amber-700"
        : tone === "info"
          ? "text-[#1f5eff]"
          : "text-[#0b1c33]";

  const chipColor =
    tone === "success"
      ? "bg-emerald-500"
      : tone === "warning"
        ? "bg-amber-500"
        : tone === "info"
          ? "bg-[#1f5eff]"
          : "bg-[#8aa2c2]";

  return (
    <div className="overflow-hidden rounded-xl border border-[#d7e3f4] bg-white px-4 py-3 shadow-[0_16px_26px_-24px_rgba(18,43,86,0.75)]">
      <div className="flex items-center gap-2 whitespace-nowrap text-[10px] uppercase tracking-wide text-[#51627b]">
        <span className={["h-1.5 w-1.5 rounded-full", chipColor].join(" ")} />
        {title}
      </div>
      <div className={["hub-kpi-number mt-1 truncate whitespace-nowrap text-4xl leading-none tabular-nums", valueColor].join(" ")}>
        {value}
      </div>
    </div>
  );
}

function ProspectionPaginationControls({
  page,
  totalPages,
  pageSize,
  total,
  isFetching,
  onPageChange,
  onPageSizeChange,
  className = "",
}: {
  page: number;
  totalPages: number;
  pageSize: (typeof PAGE_SIZE_OPTIONS)[number];
  total: number;
  isFetching: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: (typeof PAGE_SIZE_OPTIONS)[number]) => void;
  className?: string;
}) {
  return (
    <div className={["flex flex-wrap items-center justify-between gap-3 text-[11px] text-[#51627b]", className].join(" ")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="whitespace-nowrap">Par page</span>
        <div className="flex items-center gap-1">
          {PAGE_SIZE_OPTIONS.map((option) => {
            const active = pageSize === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => onPageSizeChange(option)}
                className={[
                  "inline-flex h-8 items-center justify-center rounded-full border px-3 text-xs transition",
                  active
                    ? "border-[#1f5eff] bg-[#1f5eff] text-white"
                    : "border-[#c8d6ea] bg-white text-[#3f587a] hover:bg-[#f3f8ff]",
                ].join(" ")}
              >
                {option}
              </button>
            );
          })}
        </div>
        <span className="rounded-full border border-[#dbe5f3] bg-[#f8fbff] px-3 py-1 tabular-nums">
          {total} résultat(s)
        </span>
        {isFetching ? (
          <span className="inline-flex items-center gap-1 text-[#64748b]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Chargement
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#c8d6ea] bg-white text-[#3f587a] transition hover:bg-[#f3f8ff] disabled:cursor-not-allowed disabled:opacity-45"
          aria-label="Page précédente"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="rounded-full border border-[#dbe5f3] bg-[#f8fbff] px-3 py-1 tabular-nums">
          Page {page}/{Math.max(totalPages, 1)}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#c8d6ea] bg-white text-[#3f587a] transition hover:bg-[#f3f8ff] disabled:cursor-not-allowed disabled:opacity-45"
          aria-label="Page suivante"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function InfoBlock({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-3 first:pt-1 last:pb-1">
      <div className="flex w-28 shrink-0 items-center gap-1.5 text-[#94a3b8]">
        {icon}
        <span className="text-[10px] uppercase tracking-wide whitespace-nowrap">{title}</span>
      </div>
      <div className="min-w-0 flex-1 text-sm text-[#1e293b]">{children}</div>
    </div>
  );
}
