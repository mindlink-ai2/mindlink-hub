"use client";

import { useEffect, useMemo, useRef, useState, ReactNode } from "react";
import DeleteLeadButton from "./DeleteLeadButton";
import SubscriptionGate from "@/components/SubscriptionGate";
import ProspectionFilterBar, {
  type ProspectionDatePreset,
  type ProspectionDesktopFilters,
  type ProspectionInvitationKey,
  type ProspectionSegmentKey,
  type ProspectionStatusKey,
} from "@/components/prospection/ProspectionFilterBar";
import { Button } from "@/components/ui/button";
import { HubButton } from "@/components/ui/hub-button";
import { AlertTriangle, Building2, Linkedin, Mail, MapPin, MoveRight, Phone, UserCircle2, X } from "lucide-react";

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
  linkedin_invitation_status?: "sent" | "accepted" | null;
  linkedin_invitation_sent?: boolean | null;
  [key: string]: unknown;
};

type SidebarToast = {
  id: number;
  tone: "success" | "error";
  message: string;
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

function filterLeads(leads: Lead[], term: string) {
  const v = term.trim().toLowerCase();
  if (!v) return leads;

  return leads.filter((l) => {
    const name = `${l.FirstName ?? ""} ${l.LastName ?? ""}`.toLowerCase();
    return (
      name.includes(v) ||
      (l.Company ?? "").toLowerCase().includes(v) ||
      (l.location ?? "").toLowerCase().includes(v) ||
      (l.linkedinJobTitle ?? "").toLowerCase().includes(v) ||
      (l.email ?? "").toLowerCase().includes(v) ||
      (l.phone ?? "").toLowerCase().includes(v)
    );
  });
}

function getLeadInvitationFilterStatus(lead: Lead): ProspectionInvitationKey {
  if (lead.linkedin_invitation_status === "accepted") return "accepted";
  if (lead.linkedin_invitation_status === "sent" || lead.linkedin_invitation_sent) return "sent";
  return "none";
}

function getLeadPipelineStatus(lead: Lead): ProspectionStatusKey {
  if (lead.message_sent) return "sent";
  if (getLeadInvitationFilterStatus(lead) === "accepted") return "connected";
  if (lead.traite) return "pending";
  return "todo";
}

function matchesDatePreset(
  createdAt: string | null | undefined,
  preset: ProspectionDatePreset,
  customDate: string | null | undefined
): boolean {
  if (preset === "all") return true;
  if (!createdAt) return false;

  const createdDate = new Date(createdAt);
  if (Number.isNaN(createdDate.getTime())) return false;

  if (preset === "custom") {
    if (!customDate) return true;
    const endDate = new Date(`${customDate}T23:59:59.999`);
    if (Number.isNaN(endDate.getTime())) return true;
    return createdDate <= endDate;
  }

  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - days);

  return createdDate >= threshold;
}

function applyDesktopFilters(leads: Lead[], filters: ProspectionDesktopFilters): Lead[] {
  return leads.filter((lead) => {
    const status = getLeadPipelineStatus(lead);
    const invitationStatus = getLeadInvitationFilterStatus(lead);

    if (filters.segment !== "all" && status !== filters.segment) return false;

    if (filters.statuses.length > 0 && !filters.statuses.includes(status)) return false;

    if (filters.invitations.length > 0 && !filters.invitations.includes(invitationStatus)) {
      return false;
    }

    if (filters.contacts.length > 0) {
      const hasEmail = Boolean((lead.email ?? "").trim());
      const hasPhone = Boolean((lead.phone ?? "").trim());
      const matchesEmail = filters.contacts.includes("email") && hasEmail;
      const matchesPhone = filters.contacts.includes("phone") && hasPhone;
      if (!matchesEmail && !matchesPhone) return false;
    }

    if (!matchesDatePreset(lead.created_at, filters.datePreset, filters.customDate)) return false;

    return true;
  });
}

function countActiveDesktopFilters(filters: ProspectionDesktopFilters): number {
  let count = 0;
  if (filters.segment !== "all") count += 1;
  if (filters.statuses.length > 0) count += 1;
  if (filters.invitations.length > 0) count += 1;
  if (filters.contacts.length > 0) count += 1;
  if (filters.datePreset !== "all") count += 1;
  return count;
}

function getSegmentCounts(leads: Lead[]): Record<ProspectionSegmentKey, number> {
  const counts: Record<ProspectionSegmentKey, number> = {
    all: leads.length,
    todo: 0,
    pending: 0,
    connected: 0,
    sent: 0,
  };

  leads.forEach((lead) => {
    const key = getLeadPipelineStatus(lead);
    counts[key] += 1;
  });

  return counts;
}

export default function LeadsPage() {
  const defaultDesktopFilters = (): ProspectionDesktopFilters => ({
    segment: "all",
    statuses: [],
    invitations: [],
    contacts: [],
    datePreset: "all",
    customDate: null,
  });

  const [safeLeads, setSafeLeads] = useState<Lead[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [desktopFilters, setDesktopFilters] = useState<ProspectionDesktopFilters>(defaultDesktopFilters);
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [clientLoaded, setClientLoaded] = useState(false);

  // ✅ client options (email / phone enrichment)
  // ➜ Tous les clients ont accès email + téléphone désormais
  const [emailOption, setEmailOption] = useState<boolean>(true);
  const [phoneOption, setPhoneOption] = useState<boolean>(true);

  // ✅ plan (on garde la logique existante côté API, mais plus de premium gating)
  const [plan, setPlan] = useState<string>("essential");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportingSelected, setExportingSelected] = useState(false);
  const [updatingStatusIds, setUpdatingStatusIds] = useState<Set<string>>(new Set());
  const [invitingLeadIds, setInvitingLeadIds] = useState<Set<string>>(new Set());
  const [inviteErrors, setInviteErrors] = useState<Record<string, string>>({});
  const [sendingLinkedInMessageLeadIds, setSendingLinkedInMessageLeadIds] = useState<Set<string>>(new Set());
  const [linkedInMessageSendErrors, setLinkedInMessageSendErrors] = useState<Record<string, string>>({});
  const [sidebarToast, setSidebarToast] = useState<SidebarToast | null>(null);
  const sidebarToastTimeoutRef = useRef<number | null>(null);
  const selectedCount = selectedIds.size;

  // ✅ open lead from query param (?open=ID)
  const [openFromQuery, setOpenFromQuery] = useState<string | null>(null);

  // ✅ DERIVED filtered list (no state = no desync)
  const searchedLeads = useMemo(() => {
    return filterLeads(safeLeads, searchTerm);
  }, [safeLeads, searchTerm]);

  const filteredLeads = useMemo(() => {
    return applyDesktopFilters(searchedLeads, desktopFilters);
  }, [searchedLeads, desktopFilters]);

  const segmentScopeLeads = useMemo(() => {
    return applyDesktopFilters(searchedLeads, { ...desktopFilters, segment: "all" });
  }, [searchedLeads, desktopFilters]);

  const desktopActiveFiltersCount = useMemo(() => {
    return countActiveDesktopFilters(desktopFilters);
  }, [desktopFilters]);

  const segmentCounts = useMemo(() => {
    return getSegmentCounts(segmentScopeLeads);
  }, [segmentScopeLeads]);

  // ✅ Column count for empty state colSpan
  const colCount = 8;

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

  // Load leads + options + plan
  useEffect(() => {
    (async () => {
      const res = await fetch("/api/get-leads");
      const data = await res.json();

      const leads = data.leads ?? [];
      setSafeLeads(leads);

      // ✅ client from API (on garde le parsing, mais email/phone sont forcés ON)
      const client = data.client ?? data.options ?? null;

      // ✅ plan (fallback essential)
      setPlan(String(client?.plan ?? "essential").toLowerCase());

      // ✅ Tout le monde a email + phone
      setEmailOption(true);
      setPhoneOption(true);

      setClientLoaded(true);
    })();
  }, []);

  // ✅ After leads loaded, open sidebar if query exists
  useEffect(() => {
    if (!clientLoaded) return;
    if (!openFromQuery) return;

    const target = safeLeads.find((l) => String(l.id) === String(openFromQuery));
    if (!target) return;

    setOpenLead(target);

    // ✅ clean URL (remove ?open=)
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("open");
      window.history.replaceState({}, "", url.pathname + url.search);
    } catch (e) {
      console.error(e);
    }

    setOpenFromQuery(null);
  }, [clientLoaded, openFromQuery, safeLeads]);

  // ✅ cleanup selection when list changes (ex: deleted)
  useEffect(() => {
    const existing = new Set(safeLeads.map((l) => String(l.id)));
    setSelectedIds((prev: Set<string>) => {
      const next = new Set<string>();
      prev.forEach((id) => {
        if (existing.has(id)) next.add(id);
      });
      return next;
    });
  }, [safeLeads]);

  // SEARCH FUNCTION
  const handleSearch = (value: string) => {
    setSearchTerm(value);
  };

  const resetDesktopFilters = () => {
    setDesktopFilters(defaultDesktopFilters());
  };

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
    };

    window.addEventListener("mindlink:lead-treated", onTreated as EventListener);
    window.addEventListener("mindlink:lead-deleted", onDeleted as EventListener);

    return () => {
      window.removeEventListener("mindlink:lead-treated", onTreated as EventListener);
      window.removeEventListener("mindlink:lead-deleted", onDeleted as EventListener);
    };
  }, []);

  // Auto-save internal message (LinkedIn)
  useEffect(() => {
    if (!openLead) return;

    const delay = setTimeout(async () => {
      await fetch("/api/update-internal-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: openLead.id,
          message: openLead.internal_message ?? "",
        }),
      });

      setSafeLeads((prev: Lead[]) =>
        prev.map((l) =>
          l.id === openLead.id ? { ...l, internal_message: openLead.internal_message } : l
        )
      );
    }, 300);

    return () => clearTimeout(delay);
  }, [openLead?.internal_message]);

  // ✅ Auto-save mail message (Email) — now for everyone (no premium gating)
  useEffect(() => {
    if (!openLead) return;

    const delay = setTimeout(async () => {
      await fetch("/api/update-mail-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: openLead.id,
          message: openLead.message_mail ?? "",
        }),
      });

      setSafeLeads((prev: Lead[]) =>
        prev.map((l) =>
          l.id === openLead.id ? { ...l, message_mail: openLead.message_mail } : l
        )
      );
    }, 300);

    return () => clearTimeout(delay);
  }, [openLead?.message_mail]);

  const handleSendLinkedInMessage = async () => {
    if (!openLead) return;
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

    const content = String(openLead.internal_message ?? "").trim();
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
        body: JSON.stringify({
          leadId,
          content,
        }),
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
      showSidebarToast("success", "Message envoyé");
      void fetch("/api/inbox/threads", { cache: "no-store" }).catch(() => undefined);
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
    const body = (openLead.message_mail ?? "").trim();

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
    const body = (openLead.message_mail ?? "").trim();

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
    const body = (openLead.message_mail ?? "").trim();

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
            <div className="mt-3 text-xs text-[#4B5563]">Chargement des leads…</div>
          </div>
        </div>
      </div>
    );
  }

  const total = safeLeads.length;
  const treatedCount = safeLeads.filter((l) => l.traite === true).length;
  const pendingCount = safeLeads.filter(
    (l) => Boolean(l.traite) && !Boolean(l.message_sent)
  ).length;
  const remainingToTreat = total - treatedCount;

  const allFilteredSelected =
    filteredLeads.length > 0 && filteredLeads.every((l) => selectedIds.has(String(l.id)));

  const segmentOptions: Array<{ key: ProspectionSegmentKey; label: string; count: number }> = [
    { key: "all", label: "Tous", count: segmentCounts.all },
    { key: "todo", label: "À faire", count: segmentCounts.todo },
    { key: "pending", label: "En attente", count: segmentCounts.pending },
    { key: "connected", label: "Connecté", count: segmentCounts.connected },
    { key: "sent", label: "Envoyé", count: segmentCounts.sent },
  ];

  return (
    <SubscriptionGate supportEmail="contact@lidmeo.com">
      <>
        <div className="relative h-full min-h-0 w-full px-4 pb-24 pt-4 sm:px-6 sm:pt-5">
          <div className="mx-auto flex h-full min-h-0 w-full max-w-[1680px] flex-col space-y-5">
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
                    {filteredLeads.length} affichés
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
                    {filteredLeads.length} résultat(s) • {pendingCount} en attente • {selectedCount} sélectionné(s)
                  </div>
                </div>
              </div>
            </section>

            <ProspectionFilterBar
              searchValue={searchTerm}
              onSearchChange={handleSearch}
              resultsCount={filteredLeads.length}
              activeFiltersCount={desktopActiveFiltersCount}
              currentFilters={desktopFilters}
              onChange={setDesktopFilters}
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

              <div className="min-h-0 flex-1 w-full overflow-auto px-2 pb-2 pt-1">
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
                      filteredLeads.map((lead, idx) => {
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
                        const invitationStatus =
                          lead.linkedin_invitation_status === "accepted"
                            ? "accepted"
                            : lead.linkedin_invitation_status === "sent"
                              ? "sent"
                              : lead.linkedin_invitation_sent
                                ? "sent"
                                : null;
                        const isInviteAccepted = invitationStatus === "accepted";
                        const isInviteSent = invitationStatus === "sent";
                        const inviteError = inviteErrors[idStr];
                        const isSent = Boolean(lead.message_sent);
                        const isPending = !isSent && Boolean(lead.traite);
                        const isTodo = !isSent && !isPending;
                        const isConnectedLeft = !isSent && isInviteAccepted;
                        const statusLabel = isSent
                          ? "Envoyé"
                          : isConnectedLeft
                            ? "Connecté"
                            : isPending
                              ? "En attente"
                              : "À faire";
                        const initials =
                          (
                            `${lead.FirstName?.[0] ?? ""}${lead.LastName?.[0] ?? ""}`.toUpperCase() ||
                            fullName.slice(0, 2).toUpperCase()
                          ) || "—";
                        const statusDotClass = isSent || isConnectedLeft
                          ? "bg-emerald-500"
                          : isPending
                            ? "bg-amber-500"
                            : "bg-[#6f85a6]";
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
                                disabled={isSent || isConnectedLeft || isStatusUpdating}
                                className={[
                                  "inline-flex h-8 items-center justify-center rounded-full border px-3 text-[11px] font-medium transition focus:outline-none focus:ring-2",
                                  isSent
                                    ? "cursor-default border-emerald-200 bg-emerald-50 text-emerald-700 focus:ring-emerald-200"
                                    : isConnectedLeft
                                      ? "cursor-default border-emerald-200 bg-emerald-50 text-emerald-700 focus:ring-emerald-200"
                                    : isPending
                                      ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 focus:ring-amber-200"
                                      : "border-[#9cc0ff] bg-[#f2f7ff] text-[#1f4f96] hover:border-[#77a6f4] hover:bg-[#e9f1ff] focus:ring-[#dce8ff]",
                                  isStatusUpdating ? "cursor-wait opacity-70" : "",
                                ].join(" ")}
                                title={
                                  isSent
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
                                onClick={() => setOpenLead(lead)}
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

                                <button
                                  type="button"
                                  onClick={() => handleLinkedInInvite(lead)}
                                  disabled={
                                    !lead.LinkedInURL ||
                                    isInviteAccepted ||
                                    isInviteSent ||
                                    isInviteLoading
                                  }
                                  className={[
                                    "inline-flex h-8 items-center justify-center rounded-lg border px-3 text-[11px] font-medium transition focus:outline-none focus:ring-2",
                                    isInviteAccepted
                                      ? "cursor-default border-emerald-200 bg-emerald-50 text-emerald-700 focus:ring-emerald-200"
                                      : isInviteSent
                                      ? "cursor-default border-amber-200 bg-amber-50 text-amber-700 focus:ring-amber-200"
                                      : inviteError
                                        ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 focus:ring-red-200"
                                        : "border-[#9cc0ff] bg-[#f2f7ff] text-[#1f4f96] hover:border-[#77a6f4] hover:bg-[#e9f1ff] focus:ring-[#dce8ff]",
                                    !lead.LinkedInURL ? "cursor-not-allowed opacity-60" : "",
                                    isInviteLoading ? "cursor-wait opacity-70" : "",
                                  ].join(" ")}
                                >
                                  {isInviteAccepted
                                    ? "Connecté"
                                    : isInviteSent
                                    ? "Connexion envoyée"
                                    : isInviteLoading
                                      ? "Envoi..."
                                      : "Se connecter"}
                                </button>

                                {inviteError ? (
                                  <span className="text-[10px] text-red-600">
                                    {inviteError}
                                  </span>
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
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#d7e3f4] bg-[#f8fbff] px-6 py-3 text-[11px] text-[#51627b]">
                <div>Passez “À faire” en “En attente”, puis “Voir” pour traiter le lead.</div>
                <div className="tabular-nums">
                  {treatedCount} traité(s) • {remainingToTreat} à traiter
                </div>
              </div>
            </section>
          </div>

          {openLead && (
            <>
              <div
                className="pointer-events-none fixed inset-0 z-[80] bg-[#0F172A]/38 backdrop-blur-[3px]"
                aria-hidden="true"
              />

              <div className="animate-slideLeft fixed inset-y-0 right-0 z-[90] flex h-screen max-h-screen min-h-0 w-full touch-pan-y flex-col overflow-hidden border-l border-[#dbe5f3] bg-white shadow-[0_18px_42px_-22px_rgba(15,23,42,0.38)] sm:w-[520px]">
                <div className="z-10 border-b border-[#e2e8f0] bg-white/95 p-6 pb-4 backdrop-blur-xl">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <HubButton type="button" variant="ghost" size="sm" onClick={() => setOpenLead(null)}>
                        Fermer
                      </HubButton>
                      <button
                        type="button"
                        onClick={() => setOpenLead(null)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#dbe5f3] bg-white text-[#4B5563] transition hover:bg-[#f8fbff] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]"
                        aria-label="Fermer le panneau"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <span className="rounded-full border border-[#dbe5f3] bg-white px-3 py-1 text-[11px] text-[#4B5563] whitespace-nowrap">
                      {plan || "essential"}
                    </span>
                  </div>

                  <div className="mt-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-2xl font-semibold leading-tight text-[#0F172A]">
                        {(openLead.FirstName ?? "")} {(openLead.LastName ?? "")}
                      </h2>
                      <p className="mt-1 truncate text-[12px] text-[#4B5563]">
                        {openLead.Company || "—"} • {openLead.location || "—"}
                      </p>
                    </div>

                    <div className="shrink-0">
                      {openLead.message_sent ? (
                        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] text-emerald-700 whitespace-nowrap">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Envoyé
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2 rounded-full border border-[#dbe5f3] bg-white px-3 py-1 text-[11px] text-[#4B5563] whitespace-nowrap">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#94a3b8]" />
                          À faire
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain touch-pan-y p-6 [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch]">
                  <div className="hub-card-soft p-4">
                    <div className="text-[11px] uppercase tracking-wide text-[#4B5563]">Informations</div>
                    <div className="mt-3 grid grid-cols-1 gap-3">
                      <InfoBlock title="LinkedIn">
                        {openLead.LinkedInURL ? (
                          <button
                            type="button"
                            onClick={openLinkedInProfile}
                            className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-[#dbe5f3] bg-white px-3 py-2 text-[#334155] transition hover:border-[#bfdbfe] hover:bg-[#f8fbff] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]"
                          >
                            Ouvrir le profil <span className="opacity-80">↗</span>
                          </button>
                        ) : (
                          <span className="text-[#64748b]">—</span>
                        )}
                      </InfoBlock>

                      <InfoBlock title="Poste">
                        <span className="text-[#0F172A]">
                          {openLeadTranslatedJobTitle || "—"}
                        </span>
                      </InfoBlock>

                      {emailOption && (
                        <InfoBlock title="Email">
                          <span className="text-[#0F172A]">{openLead.email || "—"}</span>
                        </InfoBlock>
                      )}

                      {phoneOption && (
                        <InfoBlock title="Téléphone">
                          <span className="text-[#0F172A]">{openLead.phone || "—"}</span>
                        </InfoBlock>
                      )}

                      <InfoBlock title="Créé le">
                        <span className="text-[#0F172A]">
                          {openLead.created_at
                            ? new Date(openLead.created_at).toLocaleDateString("fr-FR")
                            : "—"}
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
                      value={openLead.internal_message ?? ""}
                      onChange={(e) => {
                        const newMsg = e.target.value;
                        setOpenLead({ ...openLead, internal_message: newMsg });
                        setSafeLeads((prev: Lead[]) =>
                          prev.map((l) =>
                            l.id === openLead.id ? { ...l, internal_message: newMsg } : l
                          )
                        );
                      }}
                      placeholder="Écrivez votre message LinkedIn…"
                      className="mt-3 min-h-[176px] w-full resize-y overflow-y-auto rounded-xl border border-[#dbe5f3] bg-white p-4 text-sm text-[#0F172A] placeholder-[#94a3b8] transition focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]"
                    />

                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={handleSendLinkedInMessage}
                        disabled={Boolean(openLead.message_sent) || isSendingOpenLeadLinkedInMessage}
                        className={[
                          "w-full rounded-xl px-4 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2",
                          openLead.message_sent
                            ? "cursor-default bg-emerald-600 text-white focus:ring-emerald-200"
                            : openLeadLinkedInMessageError
                              ? "bg-red-600 text-white hover:bg-red-700 focus:ring-red-200"
                              : isSendingOpenLeadLinkedInMessage
                                ? "cursor-wait bg-[#2563EB]/80 text-white focus:ring-[#bfdbfe]"
                            : "bg-[#2563EB] text-white hover:bg-[#1d4ed8] focus:ring-[#bfdbfe]",
                        ].join(" ")}
                      >
                        {openLead.message_sent
                          ? "Envoyé ✅"
                          : isSendingOpenLeadLinkedInMessage
                            ? "Envoi…"
                            : openLeadLinkedInMessageError
                              ? "Erreur — réessayer"
                              : "Envoyer un message"}
                      </button>
                    </div>

                    {openLeadLinkedInMessageError ? (
                      <p className="mt-2 text-xs text-red-600">{openLeadLinkedInMessageError}</p>
                    ) : null}

                    {openLead.next_followup_at && (
                      <p className="mt-2 text-xs text-[#4B5563]">
                        Prochaine relance :{" "}
                        <span className="font-medium text-[#0F172A]">
                          {new Date(openLead.next_followup_at).toLocaleDateString("fr-FR")}
                        </span>
                      </p>
                    )}
                  </div>

                  <div className="hub-card-soft p-4">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-xs font-medium text-[#0F172A]">Message email</label>
                      <span className="text-[11px] text-[#4B5563] whitespace-nowrap">Autosave</span>
                    </div>

                    <textarea
                      value={openLead.message_mail ?? ""}
                      onChange={(e) => {
                        const newMsg = e.target.value;
                        setOpenLead({ ...openLead, message_mail: newMsg });
                        setSafeLeads((prev: Lead[]) =>
                          prev.map((l) => (l.id === openLead.id ? { ...l, message_mail: newMsg } : l))
                        );
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

function InfoBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[#d7e3f4] bg-white p-4">
      <div className="whitespace-nowrap text-[10px] uppercase tracking-wide text-[#51627b]">
        {title}
      </div>
      <div className="mt-2 text-sm text-[#0b1c33]">{children}</div>
    </div>
  );
}
