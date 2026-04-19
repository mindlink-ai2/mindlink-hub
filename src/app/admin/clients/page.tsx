"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  Loader2,
  MessageSquare,
  Play,
  RefreshCw,
  Save,
  X,
} from "lucide-react";
import { HubButton } from "@/components/ui/hub-button";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type IcpStatus = "none" | "draft" | "submitted" | "reviewed" | "active";
type StripeStatus = string | null;

type ClientRow = {
  id: number;
  email: string | null;
  name: string | null;
  company_name: string | null;
  plan: string | null;
  quota: string | null;
  subscription_status: StripeStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  created_at: string | null;
  n8n_workflow_id: string | null;
  n8n_folder_id: string | null;
  icp: {
    status: IcpStatus;
    filters: Record<string, unknown>;
    submitted_at: string | null;
    updated_at: string | null;
  };
  last_extraction: {
    leads_count: number;
    google_sheet_url: string | null;
    date: string | null;
    status: string;
  } | null;
  extractions_count: number;
  credits: { total: number; used: number; remaining: number };
  extraction_history: Array<{
    date: string | null;
    leads_count: number;
    google_sheet_url: string;
  }>;
};

type StripeSub = {
  subscription_id: string;
  customer_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  status: string;
  plan_name: string | null;
  amount: number | null;
  currency: string | null;
  period_end: string | null;
  cancel_at_period_end: boolean;
};

// ─── Badges ───────────────────────────────────────────────────────────────────

function StripeBadge({ status }: { status: StripeStatus }) {
  const s = (status ?? "").toLowerCase();
  if (s === "active")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f5e9] text-[#2e7d32] text-xs font-semibold px-2.5 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-[#2e7d32]" />
        Actif
      </span>
    );
  if (s === "trialing")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#e3f2fd] text-[#1565c0] text-xs font-semibold px-2.5 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-[#1565c0]" />
        Trial
      </span>
    );
  if (s === "past_due" || s === "unpaid")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#fff3e0] text-[#e65100] text-xs font-semibold px-2.5 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-[#e65100]" />
        Impayé
      </span>
    );
  if (s === "canceled" || s === "cancelled")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#ffebee] text-[#c62828] text-xs font-semibold px-2.5 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-[#c62828]" />
        Annulé
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#f5f5f5] text-[#616161] text-xs font-semibold px-2.5 py-1">
      {status ?? "—"}
    </span>
  );
}

function IcpBadge({ status }: { status: IcpStatus }) {
  if (status === "none")
    return (
      <span className="inline-flex items-center rounded-full bg-[#f5f5f5] text-[#9e9e9e] text-xs font-medium px-2.5 py-1">
        Non commencé
      </span>
    );
  if (status === "draft")
    return (
      <span className="inline-flex items-center rounded-full bg-[#fffde7] text-[#f9a825] text-xs font-semibold px-2.5 py-1">
        Brouillon
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f5e9] text-[#2e7d32] text-xs font-semibold px-2.5 py-1">
      <CheckCircle2 className="w-3 h-3" />
      Validé
    </span>
  );
}

// ─── Activity timeline ────────────────────────────────────────────────────────

type ActivityEvent = {
  id: number;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

function actionLabel(action: string, details: Record<string, unknown> | null): string {
  const d = details ?? {};
  switch (action) {
    case "sheet_created":
      return "Onglet Google Sheet créé";
    case "leads_extracted": {
      const count = typeof d.count === "number" ? d.count : "?";
      const source = typeof d.source === "string" ? d.source : "?";
      return `Extraction : ${count} leads (source : ${source})`;
    }
    case "messages_validated":
      return "Messages validés";
    case "messages_updated":
      return "Messages modifiés";
    case "workflow_created": {
      const wf = typeof d.workflow_id === "string" ? d.workflow_id : "?";
      const trigger = typeof d.trigger === "string" ? ` (trigger : ${d.trigger})` : "";
      return `Workflow n8n créé (ID : ${wf})${trigger}`;
    }
    case "workflow_updated": {
      const reason = typeof d.reason === "string" ? ` (raison : ${d.reason})` : "";
      return `Workflow n8n mis à jour${reason}`;
    }
    case "icp_submitted":
      return "Ciblage ICP validé";
    case "icp_modified":
      return "Ciblage ICP modifié";
    case "credits_consumed":
      return "Crédit de recherche consommé";
    default:
      return action;
  }
}

function ActivityTab({ orgId }: { orgId: number }) {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/client-activity?org_id=${orgId}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setError("Impossible de charger l'activité.");
          return;
        }
        const data = (await res.json()) as { events: ActivityEvent[] };
        if (!cancelled) setEvents(data.events ?? []);
      } catch {
        if (!cancelled) setError("Impossible de charger l'activité.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }
  if (events === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-[#7a9abf]">
        <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
      </div>
    );
  }
  if (events.length === 0) {
    return <p className="text-sm text-[#7a9abf]">Aucun événement pour ce client.</p>;
  }

  return (
    <ol className="space-y-2">
      {events.map((ev) => (
        <li
          key={ev.id}
          className="flex items-start gap-3 rounded-lg border border-[#eef1f8] bg-[#fafbfe] px-3 py-2"
        >
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#1f5eff]" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-[#0b1c33]">{actionLabel(ev.action, ev.details)}</p>
            <p className="text-xs text-[#9ab0c8]">
              {new Date(ev.created_at).toLocaleString("fr-FR", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ─── Modal ICP ────────────────────────────────────────────────────────────────

function IcpModal({
  client,
  onClose,
}: {
  client: ClientRow;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"icp" | "activity">("icp");
  const filters = client.icp.filters ?? {};
  // Nouveau format : { questionnaire: {...}, apollo_filters: {...}, commercial_promise: "..." }
  // Ancien format : filtres Apollo directement à la racine
  const questionnaire = (filters.questionnaire ?? {}) as Record<string, unknown>;
  const hasQuestionnaire = Object.keys(questionnaire).length > 0;

  const renderValue = (v: unknown) => {
    if (Array.isArray(v) && v.length > 0) return (v as string[]).join(", ");
    if (typeof v === "string" && v.trim()) return v;
    return "—";
  };

  const filterItems = hasQuestionnaire
    ? [
        { label: "Postes ciblés", value: renderValue(questionnaire.q1_titles) },
        { label: "Postes exclus", value: renderValue(questionnaire.q2_exclusions) },
        { label: "Secteur d'activité", value: renderValue(questionnaire.q3_sector) },
        { label: "Taille entreprise", value: renderValue(questionnaire.q4_company_sizes) },
        { label: "Zone géographique", value: renderValue(questionnaire.q5_locations) },
      ]
    : [
        // Ancien format : filtres Apollo à la racine
        { label: "Titres de poste", value: renderValue(filters.person_titles) },
        { label: "Séniorité", value: renderValue(filters.person_seniorities) },
        { label: "Localisation", value: renderValue(filters.person_locations) },
        { label: "Secteur", value: renderValue(filters.organization_industry_tag_ids) },
        { label: "Taille entreprise", value: renderValue(filters.organization_num_employees_ranges) },
        { label: "Localisation entreprise", value: renderValue(filters.organization_locations) },
      ];

  const commercialPromise =
    (hasQuestionnaire
      ? (questionnaire.q6_commercial_promise as string | null) ?? (filters.commercial_promise as string | null)
      : (filters.commercial_promise as string | null)) || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-[#eef1f8] sticky top-0 bg-white rounded-t-2xl">
          <div>
            <h2 className="font-bold text-[#0b1c33]">
              Config ICP — {client.name ?? client.email}
            </h2>
            <IcpBadge status={client.icp.status} />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#f0f4fb] text-[#7a9abf] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-[#eef1f8] px-5">
          <button
            type="button"
            onClick={() => setTab("icp")}
            className={cn(
              "px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors",
              tab === "icp"
                ? "border-[#1f5eff] text-[#0b1c33]"
                : "border-transparent text-[#7a9abf] hover:text-[#0b1c33]"
            )}
          >
            Ciblage
          </button>
          <button
            type="button"
            onClick={() => setTab("activity")}
            className={cn(
              "px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors",
              tab === "activity"
                ? "border-[#1f5eff] text-[#0b1c33]"
                : "border-transparent text-[#7a9abf] hover:text-[#0b1c33]"
            )}
          >
            Activité
          </button>
        </div>

        {tab === "icp" ? (
          <>
            <div className="p-5 space-y-3">
              {filterItems.map((item) => (
                <div key={item.label} className="flex gap-3">
                  <span className="text-xs font-semibold text-[#7a9abf] w-36 shrink-0 pt-0.5">
                    {item.label}
                  </span>
                  <span className="text-sm text-[#0b1c33]">{item.value}</span>
                </div>
              ))}
            </div>

            {commercialPromise && (
              <div className="mx-5 mb-5 rounded-xl border border-[#e8f0fe] bg-[#f4f8ff] p-4">
                <p className="text-xs font-semibold text-[#1f5eff] mb-1.5">Promesse commerciale</p>
                <p className="text-sm text-[#0b1c33] whitespace-pre-wrap">{commercialPromise}</p>
              </div>
            )}

            {client.icp.submitted_at && (
              <p className="px-5 pb-5 text-xs text-[#9ab0c8]">
                Soumis le{" "}
                {new Date(client.icp.submitted_at).toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            )}
          </>
        ) : (
          <div className="p-5">
            <ActivityTab orgId={client.id} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Modal Extraction (3 phases) ─────────────────────────────────────────────

type ExtractionData = {
  sheetUrl: string;
  sheetId: string;
  tabName: string;
  leadsCount: number;
  logId: string;
};

type WorkflowResult = {
  workflowId: string;
  workflowUrl: string;
};

function ExtractModal({
  client,
  onClose,
  onSuccess,
}: {
  client: ClientRow;
  onClose: () => void;
  onSuccess: (url: string, count: number) => void;
}) {
  // ── Phase 1 — Filtres Apollo éditables ──────────────────────────────────
  const rawFilters = client.icp.filters ?? {};
  const apolloSrc = (
    (rawFilters as Record<string, unknown>).apollo_filters &&
    typeof (rawFilters as Record<string, unknown>).apollo_filters === "object"
      ? (rawFilters as Record<string, unknown>).apollo_filters
      : rawFilters
  ) as Record<string, unknown>;

  const [fPersonTitles, setFPersonTitles] = useState(
    Array.isArray(apolloSrc.person_titles) ? (apolloSrc.person_titles as string[]).join("\n") : ""
  );
  const [fOrgLocations, setFOrgLocations] = useState(
    Array.isArray(apolloSrc.organization_locations) ? (apolloSrc.organization_locations as string[]).join("\n") : ""
  );
  const [fOrgSizes, setFOrgSizes] = useState(
    Array.isArray(apolloSrc.organization_num_employees_ranges) ? (apolloSrc.organization_num_employees_ranges as string[]).join("\n") : ""
  );
  const [fQKeywords, setFQKeywords] = useState(
    typeof apolloSrc.q_keywords === "string" ? (apolloSrc.q_keywords as string) : ""
  );
  const [fIncludeSimilar, setFIncludeSimilar] = useState(
    apolloSrc.include_similar_titles !== false
  );
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  /** Build the current apollo_filters object from state */
  const buildCurrentFilters = useCallback((): Record<string, unknown> => {
    const f: Record<string, unknown> = {};
    const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
    const titles = lines(fPersonTitles);
    if (titles.length) f.person_titles = titles;
    f.include_similar_titles = fIncludeSimilar;
    const oLocs = lines(fOrgLocations);
    if (oLocs.length) f.organization_locations = oLocs;
    const sizes = lines(fOrgSizes);
    if (sizes.length) f.organization_num_employees_ranges = sizes;
    if (fQKeywords.trim()) f.q_keywords = fQKeywords.trim();
    return f;
  }, [fPersonTitles, fOrgLocations, fOrgSizes, fQKeywords, fIncludeSimilar]);

  // ── Phase 1 — Stats pré-extraction ──────────────────────────────────────
  const [stats, setStats] = useState<{
    total_available: number;
    already_extracted: number;
    remaining: number;
    recommended_quota: number;
    quota_per_day: number;
    business_days_remaining: number;
    period_end: string;
  } | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const fetchStats = useCallback(async (filtersObj: Record<string, unknown>) => {
    setStatsLoading(true);
    try {
      const qs = new URLSearchParams({
        org_id: String(client.id),
        filters_override: JSON.stringify(filtersObj),
      });
      const res = await fetch(`/api/admin/extract-stats?${qs}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
        // Pré-remplir le quota avec la recommandation
        if (typeof data.recommended_quota === "number" && data.recommended_quota > 0) {
          setQuota(data.recommended_quota);
        }
      }
    } catch {
      // Non-blocking
    } finally {
      setStatsLoading(false);
    }
  }, [client.id]);

  // Charger les stats au montage
  useEffect(() => {
    void fetchStats(buildCurrentFilters());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Phase 1 — Extraction ────────────────────────────────────────────────
  const [quota, setQuota] = useState(500);
  const [extractLoading, setExtractLoading] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  // ── Phase tracking ──────────────────────────────────────────────────────
  // "new"          → première extraction, flow complet (prompt + création workflow)
  // "renewal"      → workflow existant, on met juste à jour le sheet
  // "renewal-new"  → workflow supprimé dans n8n (404), revenir au flow complet
  type FlowMode = "new" | "renewal" | "renewal-new";
  const [phase, setPhase] = useState<1 | 2 | 3>(1);
  const [flowMode, setFlowMode] = useState<FlowMode>("new");
  const [extractionData, setExtractionData] = useState<ExtractionData | null>(null);

  // ── Phase 2 — Renouvellement (workflow existant) ─────────────────────────
  const [renewalResult, setRenewalResult] = useState<WorkflowResult | null>(null);
  const [renewalLoading, setRenewalLoading] = useState(false);
  const [renewalError, setRenewalError] = useState<string | null>(null);

  // ── Phase 2 — Prompt client (chargé depuis client_messages) ─────────────
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [promptLoaded, setPromptLoaded] = useState(false);

  // ── Phase 3 — Création du workflow ──────────────────────────────────────
  const [workflowResult, setWorkflowResult] = useState<WorkflowResult | null>(null);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);

  // Fermer proprement : si extraction déjà faite, déclencher onSuccess
  const handleClose = () => {
    if (extractionData) {
      onSuccess(extractionData.sheetUrl, extractionData.leadsCount);
    } else {
      onClose();
    }
  };

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleExtract = async () => {
    setExtractLoading(true);
    setExtractError(null);
    try {
      const res = await fetch("/api/admin/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: client.id, quota, filters_override: buildCurrentFilters() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setExtractError(data.error ?? "Erreur lors de l'extraction.");
        return;
      }
      setExtractionData({
        sheetUrl: data.google_sheet_url ?? "",
        sheetId: data.google_sheet_id ?? "",
        tabName: data.tab_name ?? "",
        leadsCount: data.leads_count ?? 0,
        logId: data.extraction_log_id ?? "",
      });
      // Détecter si c'est un renouvellement (workflow existant) ou une première création
      setFlowMode(client.n8n_workflow_id ? "renewal" : "new");
      setPhase(2);
    } catch {
      setExtractError("Impossible de lancer l'extraction. Réessayez.");
    } finally {
      setExtractLoading(false);
    }
  };

  const handleUpdateWorkflow = async () => {
    if (!extractionData) return;
    setRenewalLoading(true);
    setRenewalError(null);
    try {
      const res = await fetch("/api/admin/create-workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: client.id,
          google_sheet_id: extractionData.sheetId,
          tab_name: extractionData.tabName,
          extraction_log_id: extractionData.logId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRenewalError(data.error ?? "Erreur lors de la mise à jour du workflow.");
        return;
      }
      setRenewalResult({
        workflowId: data.workflow_id,
        workflowUrl: data.workflow_url,
      });
    } catch {
      setRenewalError("Impossible de mettre à jour le workflow. Réessayez.");
    } finally {
      setRenewalLoading(false);
    }
  };

  // Charge le prompt système que le client a validé via le chat.
  // Si absent, fallback sur la génération serveur classique (legacy).
  const loadClientPrompt = useCallback(async () => {
    setPromptLoading(true);
    setPromptError(null);
    try {
      const res = await fetch(`/api/admin/messages/${client.id}`);
      const data = await res.json();
      if (res.ok && data?.messages?.system_prompt) {
        setGeneratedPrompt(data.messages.system_prompt);
        setPromptLoaded(true);
        return;
      }
      // Fallback : aucun prompt stocké → on le génère à la volée.
      const genRes = await fetch("/api/admin/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: client.id }),
      });
      const genData = await genRes.json();
      if (!genRes.ok) {
        setPromptError(
          genData.error ??
            "Le client n'a pas encore validé ses messages et la génération automatique a échoué."
        );
        return;
      }
      setGeneratedPrompt(genData.prompt ?? "");
      setPromptLoaded(true);
    } catch {
      setPromptError("Impossible de charger le prompt. Réessayez.");
    } finally {
      setPromptLoading(false);
    }
  }, [client.id]);

  // Auto-charge le prompt dès qu'on entre en phase 2 en mode création.
  useEffect(() => {
    if (phase !== 2) return;
    if (flowMode === "renewal") return;
    if (promptLoaded || promptLoading) return;
    void loadClientPrompt();
  }, [phase, flowMode, promptLoaded, promptLoading, loadClientPrompt]);

  const handleCreateWorkflow = async () => {
    if (!extractionData) return;
    setWorkflowLoading(true);
    setWorkflowError(null);
    setPhase(3);
    try {
      const res = await fetch("/api/admin/create-workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: client.id,
          prompt_systeme: generatedPrompt,
          google_sheet_id: extractionData.sheetId,
          tab_name: extractionData.tabName,
          extraction_log_id: extractionData.logId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWorkflowError(data.error ?? "Erreur lors de la création du workflow.");
        return;
      }
      setWorkflowResult({
        workflowId: data.workflow_id,
        workflowUrl: data.workflow_url,
      });
    } catch {
      setWorkflowError("Impossible de créer le workflow. Réessayez.");
    } finally {
      setWorkflowLoading(false);
    }
  };

  // ── Phase labels ─────────────────────────────────────────────────────────
  const isRenewal = flowMode === "renewal";
  const phaseLabel =
    phase === 1
      ? "Étape 1 — Extraction"
      : phase === 2
      ? isRenewal
        ? "Étape 2 — Mise à jour du workflow"
        : "Étape 2 — Prompt IA"
      : "Étape 3 — Workflow n8n";
  // Renouvellement = 2 étapes seulement, création = 3 étapes
  const totalPhases = isRenewal ? 2 : 3;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#eef1f8]">
          <div>
            <h2 className="font-bold text-[#0b1c33] text-sm">
              {phaseLabel} — {client.name ?? client.email}
            </h2>
            <div className="flex gap-1.5 mt-2">
              {Array.from({ length: totalPhases }, (_, i) => i + 1).map((p) => (
                <div
                  key={p}
                  className={`h-1 w-10 rounded-full transition-colors ${
                    phase > p
                      ? "bg-[#22c55e]"
                      : phase === p
                      ? "bg-[#1f5eff]"
                      : "bg-[#e2e8f0]"
                  }`}
                />
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-[#f0f4fb] text-[#7a9abf]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* ── Phase 1 ── */}
          {phase === 1 && (
            <>
              <div>
                <label className="text-sm font-semibold text-[#0b1c33] block mb-1.5">
                  Quota de leads à extraire
                </label>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  className="w-full rounded-xl border border-[#c8d6ea] px-3.5 py-2.5 text-sm focus:border-[#1f5eff] focus:outline-none"
                  value={quota}
                  onChange={(e) => setQuota(Number(e.target.value))}
                />
                {stats && stats.recommended_quota > 0 && (
                  <div className="mt-1.5 text-xs text-[#51627b] space-y-0.5">
                    <p>Quota journalier : <span className="font-semibold">{stats.quota_per_day} leads/jour</span></p>
                    <p>Jours ouvrés restants : <span className="font-semibold">{stats.business_days_remaining} jours</span> (jusqu&apos;au {stats.period_end})</p>
                    <p>Total recommandé : <span className="font-semibold">{stats.quota_per_day} × {stats.business_days_remaining} = {stats.recommended_quota} leads</span></p>
                  </div>
                )}
              </div>

              {/* Filtres Apollo éditables */}
              <div className="rounded-xl border border-[#c8d6ea] bg-white">
                <button
                  type="button"
                  onClick={() => setFiltersExpanded((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-[#0b1c33] hover:bg-[#f8fafc] rounded-xl transition-colors"
                >
                  Filtres Apollo
                  {filtersExpanded ? <ChevronUp className="w-4 h-4 text-[#7a9abf]" /> : <ChevronDown className="w-4 h-4 text-[#7a9abf]" />}
                </button>
                {filtersExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-[#eef1f8]">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#51627b] mb-1 mt-3">
                        person_titles <span className="text-[#9ab0c8] font-normal">(un par ligne)</span>
                      </label>
                      <textarea
                        value={fPersonTitles}
                        onChange={(e) => setFPersonTitles(e.target.value)}
                        rows={4}
                        className="w-full rounded-lg border border-[#d7e3f4] bg-white px-3 py-2 text-xs text-[#0b1c33] focus:border-[#1f5eff] focus:outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#51627b] mb-1">
                        organization_locations <span className="text-[#9ab0c8] font-normal">(une par ligne)</span>
                      </label>
                      <textarea
                        value={fOrgLocations}
                        onChange={(e) => setFOrgLocations(e.target.value)}
                        rows={2}
                        className="w-full rounded-lg border border-[#d7e3f4] bg-white px-3 py-2 text-xs text-[#0b1c33] focus:border-[#1f5eff] focus:outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#51627b] mb-1">
                        organization_num_employees_ranges <span className="text-[#9ab0c8] font-normal">(un par ligne, ex: 1,10)</span>
                      </label>
                      <textarea
                        value={fOrgSizes}
                        onChange={(e) => setFOrgSizes(e.target.value)}
                        rows={2}
                        className="w-full rounded-lg border border-[#d7e3f4] bg-white px-3 py-2 text-xs text-[#0b1c33] focus:border-[#1f5eff] focus:outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#51627b] mb-1">
                        q_keywords
                      </label>
                      <input
                        type="text"
                        value={fQKeywords}
                        onChange={(e) => setFQKeywords(e.target.value)}
                        className="w-full rounded-lg border border-[#d7e3f4] bg-white px-3 py-2 text-xs text-[#0b1c33] focus:border-[#1f5eff] focus:outline-none font-mono"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="include-similar"
                        checked={fIncludeSimilar}
                        onChange={(e) => setFIncludeSimilar(e.target.checked)}
                        className="rounded border-[#d7e3f4]"
                      />
                      <label htmlFor="include-similar" className="text-[11px] font-semibold text-[#51627b]">
                        include_similar_titles
                      </label>
                    </div>
                    <HubButton
                      variant="secondary"
                      size="sm"
                      onClick={() => void fetchStats(buildCurrentFilters())}
                      disabled={statsLoading}
                      className="gap-1.5"
                    >
                      <RefreshCw className={cn("w-3.5 h-3.5", statsLoading && "animate-spin")} />
                      Recalculer les stats
                    </HubButton>
                  </div>
                )}
              </div>

              {/* Stats pré-extraction */}
              <div className="rounded-xl border border-[#e8f0fe] bg-[#f4f8ff] px-4 py-3 text-sm space-y-1.5">
                {statsLoading ? (
                  <div className="flex items-center gap-2 text-[#51627b]">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Chargement des stats…
                  </div>
                ) : stats ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-[#51627b]">Leads disponibles (Apollo)</span>
                      <span className="font-semibold text-[#0b1c33]">{stats.total_available.toLocaleString("fr-FR")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#51627b]">Leads déjà extraits</span>
                      <span className="font-semibold text-[#0b1c33]">{stats.already_extracted.toLocaleString("fr-FR")}</span>
                    </div>
                    <div className="flex justify-between border-t border-[#d4e0f4] pt-1.5">
                      <span className="text-[#51627b] font-medium">Restants à extraire</span>
                      <span className="font-bold text-[#1f5eff]">{stats.remaining.toLocaleString("fr-FR")}</span>
                    </div>
                  </>
                ) : (
                  <span className="text-[#9ab0c8]">Stats indisponibles</span>
                )}
              </div>

              {extractError && (
                <div className="rounded-xl border border-[#fecdd3] bg-[#fff5f5] px-4 py-3 flex items-start gap-2 text-sm text-[#b91c1c]">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  {extractError}
                </div>
              )}

              <div className="flex gap-3">
                <HubButton variant="ghost" onClick={onClose} disabled={extractLoading}>
                  Annuler
                </HubButton>
                <HubButton
                  variant="primary"
                  onClick={handleExtract}
                  disabled={extractLoading || quota < 1}
                  className="flex-1 gap-2"
                >
                  {extractLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Extraction en cours…
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Lancer l'extraction ({quota} leads)
                    </>
                  )}
                </HubButton>
              </div>
            </>
          )}

          {/* ── Phase 2 ── */}
          {phase === 2 && extractionData && (
            <>
              {/* Résumé extraction — toujours affiché */}
              <div className="rounded-xl border border-[#e8f5e9] bg-[#f0fdf4] px-4 py-3 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#22c55e] mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold text-[#15803d]">
                    {extractionData.leadsCount.toLocaleString("fr-FR")} leads extraits
                  </p>
                  {extractionData.sheetUrl && (
                    <a
                      href={extractionData.sheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#15803d] underline flex items-center gap-1 mt-0.5"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Voir le Google Sheet
                    </a>
                  )}
                </div>
              </div>

              {/* ── Renouvellement : workflow existant ── */}
              {isRenewal && !renewalResult && (
                <>
                  <div className="rounded-xl border border-[#e8f0fe] bg-[#f4f8ff] px-4 py-3 text-sm text-[#0b1c33]">
                    <p className="font-semibold text-[#1f5eff] mb-1">
                      Workflow n8n existant détecté
                    </p>
                    <p className="text-[#51627b]">
                      Le Google Sheet va être mis à jour automatiquement dans le workflow existant.
                      La date de départ sera réinitialisée à demain.
                    </p>
                    {client.n8n_workflow_id && (
                      <a
                        href={`${process.env.NEXT_PUBLIC_N8N_BASE_URL ?? "https://mindlink2.app.n8n.cloud"}/workflow/${client.n8n_workflow_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[#1f5eff] hover:underline mt-1.5 text-xs"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Voir le workflow actuel
                      </a>
                    )}
                  </div>

                  {renewalError && (
                    <div className="rounded-xl border border-[#fecdd3] bg-[#fff5f5] px-4 py-3 flex items-start gap-2 text-sm text-[#b91c1c]">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      {renewalError}
                    </div>
                  )}

                  <HubButton
                    variant="primary"
                    onClick={handleUpdateWorkflow}
                    disabled={renewalLoading}
                    className="w-full gap-2"
                  >
                    {renewalLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Mise à jour en cours…
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        Mettre à jour le workflow
                      </>
                    )}
                  </HubButton>
                </>
              )}

              {/* ── Renouvellement : succès ── */}
              {isRenewal && renewalResult && (
                <>
                  <div className="rounded-xl border border-[#e8f5e9] bg-[#f0fdf4] px-4 py-3 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#22c55e] shrink-0" />
                      <p className="font-semibold text-[#15803d] text-sm">
                        Workflow mis à jour avec succès
                      </p>
                    </div>
                    <a
                      href={renewalResult.workflowUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-sm text-[#1f5eff] hover:underline font-medium"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Ouvrir dans n8n
                    </a>
                  </div>
                  <HubButton variant="primary" onClick={handleClose} className="w-full">
                    Fermer
                  </HubButton>
                </>
              )}

              {/* ── Nouveau workflow ou workflow supprimé → flow complet ── */}
              {!isRenewal && (
                <>
                  {flowMode === "renewal-new" && (
                    <div className="rounded-xl border border-[#fff3e0] bg-[#fffbf2] px-4 py-3 flex items-start gap-2 text-sm text-[#92400e]">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      Le workflow n8n n&apos;existe plus. Un nouveau workflow va être créé.
                    </div>
                  )}

                  {/* Chargement du prompt pré-validé par le client */}
                  {promptLoading && !generatedPrompt && (
                    <div className="flex items-center gap-2 rounded-xl border border-[#e8f0fe] bg-[#f4f8ff] px-4 py-3 text-sm text-[#1f5eff]">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Chargement du prompt validé par le client…
                    </div>
                  )}

                  {!promptLoading && !generatedPrompt && promptError && (
                    <>
                      <div className="rounded-xl border border-[#fecdd3] bg-[#fff5f5] px-4 py-3 flex items-start gap-2 text-sm text-[#b91c1c]">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                        {promptError}
                      </div>
                      <HubButton
                        variant="primary"
                        onClick={loadClientPrompt}
                        disabled={promptLoading}
                        className="w-full gap-2"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Réessayer
                      </HubButton>
                    </>
                  )}

                  {/* Textarea éditable (prompt chargé ou régénéré) */}
                  {generatedPrompt && (
                    <>
                      <div>
                        <label className="text-xs font-semibold text-[#7a9abf] uppercase tracking-wide block mb-1.5">
                          Prompt système (validé par le client) — relisez et modifiez si besoin
                        </label>
                        <textarea
                          className="w-full rounded-xl border border-[#c8d6ea] px-3.5 py-2.5 text-sm focus:border-[#1f5eff] focus:outline-none resize-none font-mono"
                          rows={12}
                          value={generatedPrompt}
                          onChange={(e) => setGeneratedPrompt(e.target.value)}
                        />
                      </div>

                      {promptError && (
                        <div className="rounded-xl border border-[#fecdd3] bg-[#fff5f5] px-4 py-3 flex items-start gap-2 text-sm text-[#b91c1c]">
                          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                          {promptError}
                        </div>
                      )}

                      <div className="flex gap-3">
                        <HubButton
                          variant="primary"
                          onClick={handleCreateWorkflow}
                          disabled={!generatedPrompt.trim()}
                          className="flex-1 gap-2"
                        >
                          <Play className="w-4 h-4" />
                          Confirmer et créer le workflow
                        </HubButton>
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}

          {/* ── Phase 3 ── */}
          {phase === 3 && (
            <>
              {workflowLoading && (
                <div className="flex flex-col items-center justify-center py-8 gap-3 text-[#51627b]">
                  <Loader2 className="w-8 h-8 animate-spin text-[#1f5eff]" />
                  <p className="text-sm font-medium">Création du workflow n8n en cours…</p>
                  <p className="text-xs text-[#9ab0c8]">Dossier + workflow + activation</p>
                </div>
              )}

              {!workflowLoading && workflowError && (
                <>
                  <div className="rounded-xl border border-[#fecdd3] bg-[#fff5f5] px-4 py-3 flex items-start gap-2 text-sm text-[#b91c1c]">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    {workflowError}
                  </div>
                  <div className="flex gap-3">
                    <HubButton variant="ghost" onClick={() => setPhase(2)}>
                      Retour
                    </HubButton>
                    <HubButton
                      variant="primary"
                      onClick={handleCreateWorkflow}
                      className="flex-1 gap-2"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Réessayer
                    </HubButton>
                  </div>
                </>
              )}

              {!workflowLoading && workflowResult && (
                <>
                  <div className="rounded-xl border border-[#e8f5e9] bg-[#f0fdf4] px-4 py-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-[#22c55e] shrink-0" />
                      <p className="font-semibold text-[#15803d] text-sm">
                        Workflow créé et activé avec succès
                      </p>
                    </div>
                    <a
                      href={workflowResult.workflowUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-sm text-[#1f5eff] hover:underline font-medium"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Ouvrir dans n8n
                    </a>
                    <p className="text-xs text-[#9ab0c8] font-mono">{workflowResult.workflowId}</p>
                  </div>

                  {extractionData?.sheetUrl && (
                    <div className="rounded-xl border border-[#e8f0fe] bg-[#f4f8ff] px-4 py-3">
                      <a
                        href={extractionData.sheetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-sm text-[#1f5eff] hover:underline font-medium"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Google Sheet —{" "}
                        {extractionData.leadsCount.toLocaleString("fr-FR")} leads
                      </a>
                    </div>
                  )}

                  <HubButton
                    variant="primary"
                    onClick={handleClose}
                    className="w-full"
                  >
                    Fermer
                  </HubButton>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Ligne client ─────────────────────────────────────────────────────────────

type ClientMessagesData = {
  id: number;
  org_id: number;
  message_linkedin: string | null;
  relance_linkedin: string | null;
  message_email: string | null;
  system_prompt: string | null;
  status: string | null;
  updated_at: string | null;
  created_at?: string | null;
};

function ClientMessagesSection({ clientId }: { clientId: number }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ClientMessagesData | null>(null);

  const [messageLinkedin, setMessageLinkedin] = useState("");
  const [relanceLinkedin, setRelanceLinkedin] = useState("");
  const [messageEmail, setMessageEmail] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/messages/${clientId}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error ?? "Erreur de chargement.");
      }
      const row = (payload?.messages ?? null) as ClientMessagesData | null;
      setData(row);
      setMessageLinkedin(row?.message_linkedin ?? "");
      setRelanceLinkedin(row?.relance_linkedin ?? "");
      setMessageEmail(row?.message_email ?? "");
      setSystemPrompt(row?.system_prompt ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const res = await fetch(`/api/admin/messages/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message_linkedin: messageLinkedin,
          relance_linkedin: relanceLinkedin,
          message_email: messageEmail,
          system_prompt: systemPrompt,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error ?? "Erreur de sauvegarde.");
      }
      setData((payload?.messages ?? null) as ClientMessagesData | null);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-t border-[#eef1f8] pt-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-[#9ab0c8] uppercase tracking-wide flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5" />
          Messages de prospection
        </p>
        {data?.status ? (
          <span className="inline-flex items-center rounded-full bg-[#eef3ff] text-[#2c466d] text-[10px] font-semibold px-2 py-0.5 uppercase tracking-wide">
            {data.status}
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-[#7a9abf]">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Chargement…
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-xs text-red-600">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
          <button
            type="button"
            onClick={() => void load()}
            className="ml-2 text-[#1f5eff] hover:underline"
          >
            Réessayer
          </button>
        </div>
      ) : !data ? (
        <p className="text-xs text-[#9ab0c8]">
          Aucun message créé pour ce client.
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-[#51627b] mb-1">
              Message LinkedIn (opener)
              <span className="ml-1 text-[#9ab0c8]">{messageLinkedin.length}/250</span>
            </label>
            <textarea
              value={messageLinkedin}
              onChange={(e) => setMessageLinkedin(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-[#d7e3f4] bg-white px-3 py-2 text-xs text-[#0b1c33] focus:border-[#1f5eff] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#51627b] mb-1">
              Relance LinkedIn
              <span className="ml-1 text-[#9ab0c8]">{relanceLinkedin.length}/150</span>
            </label>
            <textarea
              value={relanceLinkedin}
              onChange={(e) => setRelanceLinkedin(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[#d7e3f4] bg-white px-3 py-2 text-xs text-[#0b1c33] focus:border-[#1f5eff] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#51627b] mb-1">
              Email
              <span className="ml-1 text-[#9ab0c8]">{messageEmail.length}</span>
            </label>
            <textarea
              value={messageEmail}
              onChange={(e) => setMessageEmail(e.target.value)}
              rows={5}
              className="w-full rounded-lg border border-[#d7e3f4] bg-white px-3 py-2 text-xs text-[#0b1c33] focus:border-[#1f5eff] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#51627b] mb-1">
              Prompt technique (système)
              <span className="ml-1 text-[#9ab0c8]">{systemPrompt.length}</span>
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={10}
              className="w-full rounded-lg border border-[#d7e3f4] bg-white px-3 py-2 text-xs font-mono text-[#0b1c33] focus:border-[#1f5eff] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <HubButton
              variant="primary"
              size="sm"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Sauvegarder les modifications
            </HubButton>

            {saveSuccess ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Sauvegardé
              </span>
            ) : null}
            {saveError ? (
              <span className="inline-flex items-center gap-1 text-xs text-red-600">
                <AlertCircle className="w-3.5 h-3.5" />
                {saveError}
              </span>
            ) : null}
          </div>

          {data.updated_at ? (
            <p className="text-[10px] text-[#9ab0c8]">
              Dernière mise à jour :{" "}
              {new Date(data.updated_at).toLocaleString("fr-FR")}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ClientTableRow({
  client,
  stripeSub,
  onViewIcp,
  onExtract,
}: {
  client: ClientRow;
  stripeSub: StripeSub | null;
  onViewIcp: (c: ClientRow) => void;
  onExtract: (c: ClientRow) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const effectiveStripeStatus = stripeSub?.status ?? client.subscription_status;
  const isStripeOk =
    effectiveStripeStatus === "active" || effectiveStripeStatus === "trialing";
  const hasApolloFilters =
    client.icp.status !== "none" &&
    client.icp.filters?.apollo_filters != null &&
    typeof client.icp.filters.apollo_filters === "object" &&
    Object.keys(client.icp.filters.apollo_filters as Record<string, unknown>).length > 0;
  const isIcpOk = hasApolloFilters;
  const canExtract = isStripeOk && isIcpOk;

  const displayName = client.name || client.email || `Client #${client.id}`;

  const lastExtrDate = client.last_extraction?.date
    ? new Date(client.last_extraction.date).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      })
    : "—";

  const periodEnd = client.current_period_end
    ? new Date(client.current_period_end).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      })
    : null;

  return (
    <>
      <tr className="border-b border-[#eef1f8] hover:bg-[#f8fafc] transition-colors">
        {/* Client */}
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-left flex items-start gap-1"
          >
            <div>
              <p className="text-sm font-semibold text-[#0b1c33]">{displayName}</p>
              {client.company_name && (
                <p className="text-xs text-[#7a9abf]">{client.company_name}</p>
              )}
              {!client.company_name && client.email && (
                <p className="text-xs text-[#9ab0c8]">{client.email}</p>
              )}
            </div>
            {expanded ? (
              <ChevronUp className="w-3.5 h-3.5 mt-1 text-[#9ab0c8]" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 mt-1 text-[#9ab0c8]" />
            )}
          </button>
        </td>

        {/* Plan */}
        <td className="px-4 py-3 text-sm text-[#51627b] capitalize">{client.plan ?? "—"}</td>

        {/* Stripe */}
        <td className="px-4 py-3">
          <StripeBadge status={effectiveStripeStatus} />
          {periodEnd && (
            <p className="text-xs text-[#9ab0c8] mt-0.5">jusqu'au {periodEnd}</p>
          )}
        </td>

        {/* ICP */}
        <td className="px-4 py-3">
          <IcpBadge status={client.icp.status} />
        </td>

        {/* Dernière extraction */}
        <td className="px-4 py-3">
          {client.last_extraction ? (
            <div>
              <p className="text-sm text-[#0b1c33]">{lastExtrDate}</p>
              <p className="text-xs text-[#7a9abf]">
                {client.last_extraction.leads_count.toLocaleString("fr-FR")} leads
              </p>
              {client.last_extraction.google_sheet_url && (
                <a
                  href={client.last_extraction.google_sheet_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#1f5eff] hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  Voir le sheet
                </a>
              )}
            </div>
          ) : (
            <span className="text-sm text-[#c8d6ea]">Aucune</span>
          )}
        </td>

        {/* Actions */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <HubButton
              variant="ghost"
              size="sm"
              onClick={() => onViewIcp(client)}
              title="Voir la config ICP"
              disabled={client.icp.status === "none"}
            >
              <Eye className="w-3.5 h-3.5" />
            </HubButton>

            <div
              title={
                !isIcpOk
                  ? "Aucun filtre Apollo configuré"
                  : !isStripeOk
                  ? "Paiement inactif"
                  : "Lancer l'extraction"
              }
            >
              <HubButton
                variant={canExtract ? "primary" : "secondary"}
                size="sm"
                onClick={() => canExtract && onExtract(client)}
                disabled={!canExtract}
                className="gap-1.5"
              >
                <Play className="w-3.5 h-3.5" />
                Extraire
              </HubButton>
            </div>
          </div>
        </td>
      </tr>

      {/* Ligne détail */}
      {expanded && (
        <tr className="bg-[#f8fafc] border-b border-[#eef1f8]">
          <td colSpan={6} className="px-6 py-4 space-y-4">
            {/* Infos générales */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs font-semibold text-[#9ab0c8] mb-1">Email</p>
                <p className="text-[#0b1c33]">{client.email ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-[#9ab0c8] mb-1">Crédits restants</p>
                <p className="text-[#0b1c33] font-semibold">
                  {client.credits.remaining}/{client.credits.total}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-[#9ab0c8] mb-1">Extractions réalisées</p>
                <p className="text-[#0b1c33]">{client.extractions_count}</p>
              </div>
              {stripeSub && (
                <div>
                  <p className="text-xs font-semibold text-[#9ab0c8] mb-1">Abonnement Stripe</p>
                  <p className="text-[#0b1c33] font-mono text-xs">{stripeSub.subscription_id}</p>
                </div>
              )}
            </div>

            {/* Workflow n8n */}
            <div className="border-t border-[#eef1f8] pt-3">
              <p className="text-xs font-semibold text-[#9ab0c8] mb-2 uppercase tracking-wide">
                Workflow n8n
              </p>
              {client.n8n_workflow_id ? (
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f5e9] text-[#2e7d32] text-xs font-semibold px-2.5 py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#2e7d32]" />
                    Workflow actif
                  </span>
                  <a
                    href={`https://mindlink2.app.n8n.cloud/workflow/${client.n8n_workflow_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-[#1f5eff] hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Ouvrir dans n8n
                  </a>
                  <span className="text-xs text-[#9ab0c8] font-mono">{client.n8n_workflow_id}</span>
                </div>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f5f5f5] text-[#9e9e9e] text-xs font-medium px-2.5 py-1">
                  Pas de workflow
                </span>
              )}
            </div>

            {/* Messages de prospection */}
            <ClientMessagesSection clientId={client.id} />

            {/* Historique des extractions */}
            {client.extraction_history.length > 0 && (
              <div className="border-t border-[#eef1f8] pt-3">
                <p className="text-xs font-semibold text-[#9ab0c8] mb-2 uppercase tracking-wide">
                  Historique Google Sheets
                </p>
                <div className="space-y-1.5">
                  {client.extraction_history.map((h, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs">
                      <span className="text-[#9ab0c8] w-20 shrink-0">
                        {h.date
                          ? new Date(h.date).toLocaleDateString("fr-FR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "2-digit",
                            })
                          : "—"}
                      </span>
                      <span className="text-[#51627b]">
                        {h.leads_count.toLocaleString("fr-FR")} leads
                      </span>
                      <a
                        href={h.google_sheet_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[#1f5eff] hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Ouvrir
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function AdminClientsPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [stripeIndex, setStripeIndex] = useState<Map<string, StripeSub>>(new Map());
  const [loading, setLoading] = useState(true);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [icpModalClient, setIcpModalClient] = useState<ClientRow | null>(null);
  const [extractModalClient, setExtractModalClient] = useState<ClientRow | null>(null);
  const [extractResult, setExtractResult] = useState<{
    url: string;
    count: number;
    clientName: string;
  } | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterIcp, setFilterIcp] = useState<"all" | "none" | "draft" | "submitted">("all");

  const loadClients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/clients");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erreur lors du chargement des clients.");
        return;
      }
      setClients(data.clients ?? []);
    } catch {
      setError("Impossible de charger les clients.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStripe = useCallback(async () => {
    setStripeLoading(true);
    try {
      const res = await fetch("/api/admin/stripe-status");
      const data = await res.json();
      if (res.ok && Array.isArray(data.subscriptions)) {
        const idx = new Map<string, StripeSub>();
        for (const sub of data.subscriptions as StripeSub[]) {
          if (sub.customer_email) {
            idx.set(sub.customer_email.toLowerCase(), sub);
          }
          if (sub.customer_id) {
            idx.set(sub.customer_id, sub);
          }
        }
        setStripeIndex(idx);
      }
    } catch {
      // non bloquant
    } finally {
      setStripeLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClients();
    loadStripe();
  }, [loadClients, loadStripe]);

  const getStripeSub = (client: ClientRow): StripeSub | null => {
    if (client.stripe_customer_id && stripeIndex.has(client.stripe_customer_id)) {
      return stripeIndex.get(client.stripe_customer_id)!;
    }
    if (client.email && stripeIndex.has(client.email.toLowerCase())) {
      return stripeIndex.get(client.email.toLowerCase())!;
    }
    return null;
  };

  const filteredClients = clients.filter((c) => {
    const q = searchQuery.toLowerCase();
    const matchesQuery =
      !q ||
      (c.email ?? "").toLowerCase().includes(q) ||
      (c.name ?? "").toLowerCase().includes(q) ||
      (c.company_name ?? "").toLowerCase().includes(q);

    const matchesIcp =
      filterIcp === "all" ||
      (filterIcp === "submitted"
        ? c.icp.status !== "none" && c.icp.status !== "draft"
        : c.icp.status === filterIcp);

    return matchesQuery && matchesIcp;
  });

  const handleExtractSuccess = (url: string, count: number) => {
    const c = extractModalClient;
    setExtractModalClient(null);
    setExtractResult({
      url,
      count,
      clientName:
        c?.name || c?.email || "Client",
    });
    loadClients();
  };

  return (
    <div className="min-h-screen bg-[#eef1f8]">
      {/* Header */}
      <div className="bg-white border-b border-[#c8d6ea] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-[#0b1c33]">Panel Admin — Clients</h1>
            <p className="text-sm text-[#51627b] mt-0.5">
              {clients.length} client{clients.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <HubButton
              variant="secondary"
              size="sm"
              onClick={() => { loadClients(); loadStripe(); }}
              className="gap-1.5"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", (loading || stripeLoading) && "animate-spin")} />
              Actualiser
            </HubButton>
          </div>
        </div>
      </div>

      {/* Notification extraction */}
      {extractResult && (
        <div className="bg-[#e8f5e9] border-b border-[#a5d6a7] px-6 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[#2e7d32] text-sm font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Extraction terminée pour {extractResult.clientName} —{" "}
              {extractResult.count.toLocaleString("fr-FR")} leads extraits.
              {extractResult.url && (
                <a
                  href={extractResult.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline flex items-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Ouvrir le Google Sheet
                </a>
              )}
            </div>
            <button
              type="button"
              onClick={() => setExtractResult(null)}
              className="text-[#388e3c] hover:text-[#1b5e20]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Filtres */}
        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <input
            type="text"
            placeholder="Rechercher par nom, email, entreprise…"
            className="rounded-xl border border-[#c8d6ea] bg-white px-3.5 py-2 text-sm focus:border-[#1f5eff] focus:outline-none w-72"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <div className="flex gap-2">
            {(["all", "none", "draft", "submitted"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setFilterIcp(v)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                  filterIcp === v
                    ? "bg-[#1f5eff] border-[#1f5eff] text-white"
                    : "bg-white border-[#c8d6ea] text-[#3f5470] hover:border-[#1f5eff]"
                )}
              >
                {v === "all"
                  ? "Tous"
                  : v === "none"
                  ? "ICP non commencé"
                  : v === "draft"
                  ? "ICP brouillon"
                  : "ICP validé"}
              </button>
            ))}
          </div>
        </div>

        {/* Erreur */}
        {error && (
          <div className="rounded-xl border border-[#fecdd3] bg-[#fff5f5] px-4 py-3 flex items-center gap-2 text-sm text-[#b91c1c] mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Tableau */}
        <div className="bg-white rounded-2xl border border-[#c8d6ea] overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-[#7a9abf]">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              Chargement des clients…
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="text-center py-16 text-[#9ab0c8] text-sm">
              Aucun client trouvé.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#eef1f8] bg-[#f8fafc]">
                    <th className="px-4 py-3 text-xs font-semibold text-[#7a9abf] uppercase tracking-wide">
                      Client
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-[#7a9abf] uppercase tracking-wide">
                      Plan
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-[#7a9abf] uppercase tracking-wide">
                      Stripe
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-[#7a9abf] uppercase tracking-wide">
                      ICP
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-[#7a9abf] uppercase tracking-wide">
                      Dernière extraction
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-[#7a9abf] uppercase tracking-wide">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map((client) => (
                    <ClientTableRow
                      key={client.id}
                      client={client}
                      stripeSub={getStripeSub(client)}
                      onViewIcp={setIcpModalClient}
                      onExtract={setExtractModalClient}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {icpModalClient && (
        <IcpModal client={icpModalClient} onClose={() => setIcpModalClient(null)} />
      )}
      {extractModalClient && (
        <ExtractModal
          client={extractModalClient}
          onClose={() => setExtractModalClient(null)}
          onSuccess={handleExtractSuccess}
        />
      )}
    </div>
  );
}
