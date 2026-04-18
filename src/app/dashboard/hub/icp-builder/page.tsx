"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageCircleQuestion,
  Pencil,
  Search,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { HubButton } from "@/components/ui/hub-button";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type QuestionnaireAnswers = {
  q1_titles: string;
  q2_exclusions: string;
  q3_sector: string;
  q4_company_sizes: string[];
  q5_locations: string;
  q6_commercial_promise: string;
};

type ApolloFilters = Record<string, unknown>;

type ApolloProfile = {
  id: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  linkedin_url: string | null;
  organization: {
    name: string | null;
    industry: string | null;
    estimated_num_employees: number | null;
    primary_domain: string | null;
  } | null;
  city: string | null;
  state: string | null;
  country: string | null;
};

type BrowseProfile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  organization: {
    name: string | null;
    industry: string | null;
    estimated_num_employees: number | null;
  } | null;
  city: string | null;
  state: string | null;
  country: string | null;
  location_available?: boolean;
};

type IcpStatus = "none" | "draft" | "submitted";
type Screen =
  | "questionnaire"
  | "summary"
  | "mode-select"
  | "results"
  | "browse"
  | "submitted";

// ─── Constantes ───────────────────────────────────────────────────────────────

const EMPLOYEE_RANGE_OPTIONS = [
  { value: "1,10", label: "1–10" },
  { value: "11,20", label: "11–20" },
  { value: "21,50", label: "21–50" },
  { value: "51,100", label: "51–100" },
  { value: "101,200", label: "101–200" },
  { value: "201,500", label: "201–500" },
  { value: "501,1000", label: "501–1 000" },
  { value: "1001,2000", label: "1 001–2 000" },
  { value: "2001,5000", label: "2 001–5 000" },
  { value: "5001,10000", label: "5 001–10 000" },
];

type StepDef = {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  placeholder: string;
  type: "textarea" | "multiselect";
  key: keyof QuestionnaireAnswers;
  required: boolean;
};

const STEPS: StepDef[] = [
  {
    id: "q1",
    number: 1,
    title: "Quel est le poste exact des personnes que vous souhaitez contacter ?",
    subtitle:
      "Soyez le plus précis possible. Listez les intitulés exacts tels qu'ils apparaissent sur LinkedIn.",
    placeholder: "Ex : CEO, Directeur Commercial, Head of Marketing, Fondateur",
    type: "textarea",
    key: "q1_titles",
    required: true,
  },
  {
    id: "q2",
    number: 2,
    title: "Y a-t-il des postes que vous souhaitez absolument exclure ?",
    subtitle: "Si certains titres proches ne vous intéressent pas, listez-les ici.",
    placeholder: "Ex : Stagiaire, Assistant, Freelance",
    type: "textarea",
    key: "q2_exclusions",
    required: false,
  },
  {
    id: "q3",
    number: 3,
    title: "Dans quel secteur d'activité travaillent vos clients idéaux ?",
    subtitle:
      "Précisez le secteur, pas simplement « digital ». Plus c'est précis, meilleurs seront les résultats.",
    placeholder:
      "Ex : Agences de communication, SaaS B2B, E-commerce mode, Cabinets de conseil en stratégie",
    type: "textarea",
    key: "q3_sector",
    required: true,
  },
  {
    id: "q4",
    number: 4,
    title: "Quelle taille d'entreprise visez-vous ?",
    subtitle: "Indiquez une fourchette de nombre d'employés.",
    placeholder: "",
    type: "multiselect",
    key: "q4_company_sizes",
    required: true,
  },
  {
    id: "q5",
    number: 5,
    title: "Dans quels pays ou villes se trouvent vos cibles ?",
    subtitle: "Soyez précis : un pays entier ou des villes/régions spécifiques ?",
    placeholder: "Ex : France entière, ou Paris + Lyon + Bordeaux uniquement",
    type: "textarea",
    key: "q5_locations",
    required: true,
  },
  {
    id: "q6",
    number: 6,
    title:
      "Quelle est votre promesse commerciale ? Qu'est-ce que vous vendez et pourquoi vous choisir plutôt qu'un autre ?",
    subtitle:
      "Cette information nous aide à personnaliser les messages d'approche. Soyez concret sur votre valeur ajoutée.",
    placeholder:
      "Ex : Nous aidons les PME à doubler leur visibilité en ligne grâce à des campagnes publicitaires ciblées, avec un ROI garanti sous 90 jours.",
    type: "textarea",
    key: "q6_commercial_promise",
    required: true,
  },
];

const STEP_COUNT = STEPS.length;

const HELP_OPENING_MESSAGES: Record<string, string> = {
  q1_titles:
    "Qui souhaites-tu contacter ? Dis-moi ce que font tes clients au quotidien et je t'aide à trouver les bons titres de poste.",
  q2_exclusions:
    "Y a-t-il des personnes que tu ne souhaites pas contacter ? Si non, passe cette question, elle est optionnelle.",
  q3_sector:
    "Quelle est l'activité de tes clients ? Dis-moi en quelques mots et je t'aide à bien formuler.",
  q4_company_sizes:
    "Tes clients, ce sont plutôt des petites entreprises ou des grandes structures ? Dis-moi combien de personnes il y a en général.",
  q5_locations:
    "Travailles-tu avec des clients partout en France ou dans des villes précises ?",
  q6_commercial_promise:
    "Explique-moi simplement ce que tu fais pour tes clients. Qu'est-ce qui change pour eux après avoir travaillé avec toi ?",
};

type HelpMessage = { role: "user" | "assistant"; content: string };

function emptyAnswers(): QuestionnaireAnswers {
  return {
    q1_titles: "",
    q2_exclusions: "",
    q3_sector: "",
    q4_company_sizes: [],
    q5_locations: "",
    q6_commercial_promise: "",
  };
}

// ─── Composants ───────────────────────────────────────────────────────────────

function ProfileCard({ profile }: { profile: ApolloProfile }) {
  const name =
    [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "—";
  const location =
    [profile.city, profile.country].filter(Boolean).join(", ") || null;
  const employees = profile.organization?.estimated_num_employees;

  return (
    <div className="rounded-2xl border border-[#c8d6ea] bg-white p-4 flex flex-col gap-2 hover:border-[#a5bfe0] transition-colors">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#dde8f9] to-[#c4d9f7] flex items-center justify-center shrink-0">
          <span className="text-sm font-bold text-[#2563EB]">
            {(profile.first_name?.[0] ?? "?").toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#0b1c33] truncate">{name}</p>
          <p className="text-xs text-[#51627b] truncate">{profile.title ?? "—"}</p>
        </div>
      </div>
      {profile.organization && (
        <div className="flex items-center gap-1.5 text-xs text-[#51627b]">
          <Building2 className="w-3.5 h-3.5 shrink-0 text-[#7a9abf]" />
          <span className="truncate font-medium text-[#0b1c33]">
            {profile.organization.name ?? "—"}
          </span>
        </div>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#7a9abf]">
        {profile.organization?.industry && (
          <span className="truncate">{profile.organization.industry}</span>
        )}
        {employees && (
          <span>{employees.toLocaleString("fr-FR")} emp.</span>
        )}
        {location && <span>{location}</span>}
      </div>
      {profile.linkedin_url && (
        <a
          href={profile.linkedin_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[#2563EB] hover:underline"
        >
          Voir le profil LinkedIn →
        </a>
      )}
    </div>
  );
}

function SummaryItem({
  label,
  value,
  optional,
  onEdit,
}: {
  label: string;
  value: string | string[];
  optional?: boolean;
  onEdit: () => void;
}) {
  const isEmpty = Array.isArray(value) ? value.length === 0 : !value.trim();

  return (
    <div className="flex items-start gap-3 py-4 border-b border-[#eef1f8] last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-[#51627b] uppercase tracking-wide mb-1.5">
          {label}
        </p>
        {isEmpty ? (
          <p className="text-sm text-[#a0b0c0] italic">
            {optional ? "Non renseigné" : "—"}
          </p>
        ) : Array.isArray(value) ? (
          <div className="flex flex-wrap gap-1.5">
            {value.map((v) => {
              const opt = EMPLOYEE_RANGE_OPTIONS.find((o) => o.value === v);
              return (
                <span
                  key={v}
                  className="px-2.5 py-0.5 rounded-full bg-[#eef1f8] text-xs font-medium text-[#0b1c33]"
                >
                  {opt?.label ?? v}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-[#0b1c33] whitespace-pre-wrap">{value}</p>
        )}
      </div>
      <button
        onClick={onEdit}
        className="shrink-0 flex items-center gap-1 text-xs text-[#2563EB] hover:text-[#1d4ed8] font-medium mt-0.5 transition-colors"
      >
        <Pencil className="w-3 h-3" />
        Modifier
      </button>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function IcpBuilderPage() {
  const router = useRouter();

  const [answers, setAnswers] = useState<QuestionnaireAnswers>(emptyAnswers);
  const [currentStep, setCurrentStep] = useState(0);
  const [editingFromSummary, setEditingFromSummary] = useState(false);
  const [screen, setScreen] = useState<Screen>("questionnaire");

  const [generatedFilters, setGeneratedFilters] = useState<ApolloFilters | null>(null);
  const [profiles, setProfiles] = useState<ApolloProfile[]>([]);
  const [totalResults, setTotalResults] = useState<number | null>(null);
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);
  const [loadingCredits, setLoadingCredits] = useState(true);
  const [icpStatus, setIcpStatus] = useState<IcpStatus>("none");
  // true si le client arrive depuis le wizard d'onboarding (step 2 non complété)
  const [onboardingPending, setOnboardingPending] = useState(false);

  const [generatingFilters, setGeneratingFilters] = useState(false);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Browse mode state ──
  const [browseLeads, setBrowseLeads] = useState<BrowseProfile[]>([]);
  const [browsePage, setBrowsePage] = useState(1);
  const [browseTotalPages, setBrowseTotalPages] = useState(1);
  const [browseTotalEntries, setBrowseTotalEntries] = useState(0);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [selectedLeadsMap, setSelectedLeadsMap] = useState<Map<string, BrowseProfile>>(new Map());
  const [quotaTotal, setQuotaTotal] = useState(0);
  const [quotaUsed, setQuotaUsed] = useState(0);
  const [validatingSelection, setValidatingSelection] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [monthlyQuota, setMonthlyQuota] = useState(0);
  const [autoSelecting, setAutoSelecting] = useState(false);

  const quotaRemaining = Math.max(0, quotaTotal - quotaUsed);
  const selectedCount = selectedLeadIds.size;
  const canSelectMore = selectedCount < quotaRemaining;

  // ── Help chat state ──
  const [helpOpenFor, setHelpOpenFor] = useState<string | null>(null);
  const [helpMessages, setHelpMessages] = useState<HelpMessage[]>([]);
  const [helpInput, setHelpInput] = useState("");
  const [helpSending, setHelpSending] = useState(false);
  const helpEndRef = useRef<HTMLDivElement>(null);
  const helpInputRef = useRef<HTMLInputElement>(null);

  const openHelpChat = useCallback((questionKey: string) => {
    const opening = HELP_OPENING_MESSAGES[questionKey];
    if (!opening) return;
    setHelpOpenFor(questionKey);
    setHelpMessages([{ role: "assistant", content: opening }]);
    setHelpInput("");
    setHelpSending(false);
  }, []);

  const closeHelpChat = useCallback(() => {
    setHelpOpenFor(null);
    setHelpMessages([]);
    setHelpInput("");
    setHelpSending(false);
  }, []);

  const sendHelpMessage = useCallback(async () => {
    const text = helpInput.trim();
    if (!text || helpSending || !helpOpenFor) return;

    const userMsg: HelpMessage = { role: "user", content: text };
    const updatedMessages = [...helpMessages, userMsg];
    setHelpMessages(updatedMessages);
    setHelpInput("");
    setHelpSending(true);

    try {
      const res = await fetch("/api/chat/icp-helper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages,
          question_context: helpOpenFor,
        }),
      });
      const data = await res.json();
      if (res.ok && data.reply) {
        setHelpMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.reply },
        ]);
      } else {
        setHelpMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Désolé, une erreur est survenue. Réessaie.",
          },
        ]);
      }
    } catch {
      setHelpMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Impossible de contacter le serveur. Réessaie.",
        },
      ]);
    } finally {
      setHelpSending(false);
    }
  }, [helpInput, helpSending, helpOpenFor, helpMessages]);

  // Auto-scroll help chat
  useEffect(() => {
    helpEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [helpMessages]);

  // Auto-focus input when chat opens
  useEffect(() => {
    if (helpOpenFor) {
      setTimeout(() => helpInputRef.current?.focus(), 100);
    }
  }, [helpOpenFor]);

  // Close help chat when changing steps
  useEffect(() => {
    closeHelpChat();
  }, [currentStep, closeHelpChat]);

  // Charger la config existante + crédits + statut onboarding au montage
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [configRes, creditsRes, onboardingRes] = await Promise.all([
          fetch("/api/icp/config"),
          fetch("/api/icp/credits"),
          fetch("/api/onboarding/status", { cache: "no-store" }),
        ]);
        if (!mounted) return;

        if (configRes.ok) {
          const configData = await configRes.json();
          if (configData.filters?.questionnaire) {
            setAnswers({ ...emptyAnswers(), ...configData.filters.questionnaire });
          }
          if (configData.filters?.apollo_filters) {
            setGeneratedFilters(configData.filters.apollo_filters);
          }
          setIcpStatus(configData.status ?? "none");
          if (configData.status === "submitted") {
            setScreen("submitted");
          } else if (
            configData.status === "draft" &&
            configData.filters?.questionnaire
          ) {
            setScreen("summary");
          }
        }

        if (creditsRes.ok) {
          const creditsData = await creditsRes.json();
          setCreditsRemaining(creditsData.credits_remaining ?? null);
        }

        if (onboardingRes.ok) {
          const onboardingData = await onboardingRes.json();
          // Onboarding en cours si LinkedIn connecté mais pas encore complété
          const isPending =
            onboardingData.state === "linkedin_connected" &&
            onboardingData.completed !== true;
          if (mounted) setOnboardingPending(isPending);
        }
      } catch {
        // silencieux
      } finally {
        if (mounted) setLoadingCredits(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const refreshCredits = async () => {
    try {
      const res = await fetch("/api/icp/credits");
      if (res.ok) {
        const data = await res.json();
        setCreditsRemaining(data.credits_remaining ?? null);
      }
    } catch {
      // silencieux
    }
  };

  const currentStepDef = STEPS[currentStep];

  const isCurrentStepValid = () => {
    const step = STEPS[currentStep];
    if (!step.required) return true;
    const val = answers[step.key];
    if (Array.isArray(val)) return val.length > 0;
    return (val as string).trim().length > 0;
  };

  const handleNext = () => {
    if (editingFromSummary) {
      setEditingFromSummary(false);
      setScreen("summary");
      return;
    }
    if (currentStep < STEP_COUNT - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      setScreen("summary");
    }
  };

  const handlePrev = () => {
    if (editingFromSummary) {
      setEditingFromSummary(false);
      setScreen("summary");
    } else if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  };

  const handleEditFromSummary = (stepIndex: number) => {
    setCurrentStep(stepIndex);
    setEditingFromSummary(true);
    setScreen("questionnaire");
  };

  const handleGenerateAndSearch = async () => {
    setGeneratingFilters(true);
    setSearchError(null);
    setProfiles([]);
    setTotalResults(null);

    try {
      // Étape 1 : générer les filtres depuis les réponses
      const genRes = await fetch("/api/icp/generate-filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const genData = await genRes.json();
      if (!genRes.ok) {
        setSearchError(
          genData.error ?? "Impossible de générer les filtres. Veuillez réessayer."
        );
        setGeneratingFilters(false);
        return;
      }
      const filters: ApolloFilters = genData.filters ?? {};
      setGeneratedFilters(filters);
      setGeneratingFilters(false);

      // Auto-save brouillon
      await fetch("/api/icp/save-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filters: {
            questionnaire: answers,
            apollo_filters: filters,
            commercial_promise: answers.q6_commercial_promise,
          },
        }),
      });
      setIcpStatus("draft");

      // Étape 2 : lancer la recherche
      setSearching(true);
      const searchRes = await fetch("/api/apollo/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filters),
      });
      const searchData = await searchRes.json();
      if (!searchRes.ok) {
        setSearchError(
          searchData.error ?? "Une erreur est survenue lors de la recherche."
        );
        await refreshCredits();
      } else {
        setProfiles(searchData.profiles ?? []);
        setTotalResults(searchData.total_results ?? null);
        if (searchData.credits_remaining !== undefined) {
          setCreditsRemaining(searchData.credits_remaining);
        }
      }
      setScreen("results");
    } catch {
      setSearchError("Impossible de contacter le serveur. Veuillez réessayer.");
      await refreshCredits();
      setScreen("results");
    } finally {
      setGeneratingFilters(false);
      setSearching(false);
    }
  };

  const handleSearchAgain = async () => {
    if (!generatedFilters) return;
    setSearching(true);
    setSearchError(null);
    setProfiles([]);
    setTotalResults(null);
    try {
      const res = await fetch("/api/apollo/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(generatedFilters),
      });
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error ?? "Une erreur est survenue.");
        await refreshCredits();
        return;
      }
      setProfiles(data.profiles ?? []);
      setTotalResults(data.total_results ?? null);
      if (data.credits_remaining !== undefined) {
        setCreditsRemaining(data.credits_remaining);
      }
    } catch {
      setSearchError("Impossible de contacter le serveur. Veuillez réessayer.");
      await refreshCredits();
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/icp/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filters: {
            questionnaire: answers,
            apollo_filters: generatedFilters ?? {},
            commercial_promise: answers.q6_commercial_promise,
          },
          preview_profiles: profiles,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "Erreur lors de la validation.");
      } else {
        setIcpStatus("submitted");
        if (onboardingPending) {
          // Valider le step 2 et envoyer le client vers le step 3 (messages).
          await fetch("/api/onboarding/mark-icp-submitted", { method: "POST" }).catch(
            () => null
          );
          router.replace("/dashboard/hub/messages-setup");
        } else {
          setScreen("submitted");
        }
      }
    } catch {
      setSubmitError("Impossible de valider. Veuillez réessayer.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReopen = async () => {
    setReopening(true);
    try {
      const res = await fetch("/api/icp/reopen", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        console.error("[reopen]", data.error);
      } else {
        setIcpStatus("draft");
        setProfiles([]);
        setTotalResults(null);
        setSearchError(null);
        setSubmitError(null);
        setScreen("summary");
      }
    } catch {
      // silencieux
    } finally {
      setReopening(false);
    }
  };

  // ── Browse mode handlers ──

  const fetchQuota = useCallback(async () => {
    try {
      const res = await fetch("/api/leads/quota");
      if (res.ok) {
        const data = await res.json();
        setQuotaTotal(data.quota_remaining ?? 0);
        setQuotaUsed(0); // quota_remaining already accounts for used
        setMonthlyQuota(data.monthly_quota ?? 0);
      }
    } catch {
      // silencieux
    }
  }, []);

  const fetchBrowsePage = useCallback(async (page: number) => {
    setBrowseLoading(true);
    setBrowseError(null);
    try {
      const res = await fetch(`/api/apollo/browse?page=${page}`);
      const data = await res.json();
      if (!res.ok) {
        setBrowseError(data.error ?? "Erreur lors du chargement.");
        return;
      }
      setBrowseLeads(data.people ?? []);
      setBrowsePage(data.page ?? page);
      setBrowseTotalPages(data.total_pages ?? 1);
      setBrowseTotalEntries(data.total_entries ?? 0);
    } catch {
      setBrowseError("Impossible de contacter le serveur.");
    } finally {
      setBrowseLoading(false);
    }
  }, []);

  const handleEnterBrowseMode = useCallback(
    async (filtersOverride?: ApolloFilters) => {
      const filters = filtersOverride ?? generatedFilters;
      // Save draft first
      if (filters) {
        await fetch("/api/icp/save-draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filters: {
              questionnaire: answers,
              apollo_filters: filters,
              commercial_promise: answers.q6_commercial_promise,
            },
          }),
        });
        setIcpStatus("draft");
      }
      setScreen("browse");
      setSelectedLeadIds(new Set());
      setSelectedLeadsMap(new Map());
      await Promise.all([fetchQuota(), fetchBrowsePage(1)]);
    },
    [generatedFilters, answers, fetchQuota, fetchBrowsePage]
  );

  const toggleLeadSelection = useCallback(
    (lead: BrowseProfile) => {
      setSelectedLeadIds((prev) => {
        const next = new Set(prev);
        if (next.has(lead.id)) {
          next.delete(lead.id);
          setSelectedLeadsMap((m) => {
            const nm = new Map(m);
            nm.delete(lead.id);
            return nm;
          });
        } else {
          if (next.size >= quotaRemaining) return prev;
          next.add(lead.id);
          setSelectedLeadsMap((m) => new Map(m).set(lead.id, lead));
        }
        return next;
      });
    },
    [quotaRemaining]
  );

  const toggleSelectAll = useCallback(() => {
    if (selectedCount > 0) {
      // Deselect ALL (every page, not just current)
      setSelectedLeadIds(new Set());
      setSelectedLeadsMap(new Map());
    } else {
      // Select all on current page
      const newIds = new Set(selectedLeadIds);
      const newMap = new Map(selectedLeadsMap);
      for (const lead of browseLeads) {
        if (newIds.size >= quotaRemaining) break;
        if (!newIds.has(lead.id)) {
          newIds.add(lead.id);
          newMap.set(lead.id, lead);
        }
      }
      setSelectedLeadIds(newIds);
      setSelectedLeadsMap(newMap);
    }
  }, [browseLeads, selectedLeadIds, selectedLeadsMap, quotaRemaining, selectedCount]);

  const handleAutoSelect = useCallback(async () => {
    const target = Math.min(monthlyQuota, quotaRemaining);
    if (target <= 0) return;

    setAutoSelecting(true);
    const newIds = new Set(selectedLeadIds);
    const newMap = new Map(selectedLeadsMap);

    let page = 1;
    try {
      while (newIds.size < target) {
        const res = await fetch(`/api/apollo/browse?page=${page}`);
        const data = await res.json();
        if (!res.ok || !data.people?.length) break;

        for (const lead of data.people as BrowseProfile[]) {
          if (newIds.size >= target) break;
          if (!newIds.has(lead.id)) {
            newIds.add(lead.id);
            newMap.set(lead.id, lead);
          }
        }

        if (page >= (data.total_pages ?? 1)) break;
        page++;
      }
    } catch {
      // stop here
    }

    setSelectedLeadIds(newIds);
    setSelectedLeadsMap(newMap);
    setAutoSelecting(false);
  }, [monthlyQuota, quotaRemaining, selectedLeadIds, selectedLeadsMap]);

  const handleValidateSelection = useCallback(async () => {
    setValidatingSelection(true);
    setShowConfirmModal(false);
    try {
      const leadsToSend = Array.from(selectedLeadsMap.values()).map((l) => ({
        id: l.id,
        first_name: l.first_name,
        last_name: l.last_name,
        title: l.title,
        organization: l.organization,
        city: l.city,
        state: l.state,
        country: l.country,
      }));

      const res = await fetch("/api/leads/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads: leadsToSend,
          mark_submitted: onboardingPending,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "Erreur lors de la validation.");
        return;
      }

      setIcpStatus("submitted");
      if (onboardingPending) {
        await fetch("/api/onboarding/mark-icp-submitted", {
          method: "POST",
        }).catch(() => null);
        router.replace("/dashboard/hub/messages-setup");
      } else {
        setScreen("submitted");
      }
    } catch {
      setSubmitError("Impossible de valider la sélection.");
    } finally {
      setValidatingSelection(false);
    }
  }, [selectedLeadsMap, onboardingPending, router]);

  // ─── Rendu ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#eef1f8]">
      {/* Header */}
      <div className="bg-white border-b border-[#c8d6ea] px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-[#0b1c33]">Définir mon ciblage</h1>
            <p className="text-sm text-[#51627b] mt-0.5">
              Répondez aux questions pour configurer votre prospection.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[#51627b]">Crédits :</span>
            {loadingCredits ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#7a9abf]" />
            ) : (
              <span
                className={cn(
                  "font-semibold",
                  creditsRemaining === 0 ? "text-red-500" : "text-[#2563EB]"
                )}
              >
                {creditsRemaining ?? "—"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Écran : ciblage validé ── */}
      {screen === "submitted" && (
        <div className="max-w-2xl mx-auto px-4 py-16">
          <div className="bg-white rounded-2xl border border-[#c8d6ea] p-10 text-center">
            <CheckCircle2 className="w-14 h-14 text-[#22c55e] mx-auto mb-5" />
            <h2 className="text-xl font-bold text-[#0b1c33] mb-2">Ciblage validé !</h2>
            <p className="text-[#51627b] mb-8 max-w-sm mx-auto">
              Votre ciblage a été transmis à notre équipe. Nous vous contacterons très
              prochainement pour lancer votre prospection.
            </p>
            {creditsRemaining !== null && creditsRemaining > 0 ? (
              <HubButton
                variant="secondary"
                onClick={handleReopen}
                disabled={reopening}
                className="gap-2"
              >
                {reopening ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Pencil className="w-4 h-4" />
                )}
                {reopening ? "Réouverture…" : "Modifier mon ciblage"}
              </HubButton>
            ) : creditsRemaining === 0 ? (
              <p className="text-sm text-[#a0b0c0]">
                Plus de crédits de recherche disponibles.
              </p>
            ) : null}
          </div>
        </div>
      )}

      {/* ── Écran : questionnaire (étape par étape) ── */}
      {screen === "questionnaire" && (
        <div className="max-w-2xl mx-auto px-4 py-8">
          {/* Barre de progression */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-[#51627b]">
                Étape {currentStep + 1} sur {STEP_COUNT}
              </span>
              <span className="text-sm text-[#7a9abf]">
                {Math.round(((currentStep + 1) / STEP_COUNT) * 100)}%
              </span>
            </div>
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-all duration-300",
                    i <= currentStep ? "bg-[#2563EB]" : "bg-[#c8d6ea]"
                  )}
                />
              ))}
            </div>
          </div>

          {/* Carte question */}
          <div className="bg-white rounded-2xl border border-[#c8d6ea] p-8 mb-6">
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#2563EB] text-white text-xs font-bold shrink-0">
                  {currentStep + 1}
                </span>
                {!currentStepDef.required && (
                  <span className="text-xs text-[#7a9abf] bg-[#eef1f8] px-2 py-0.5 rounded-full">
                    Optionnel
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold text-[#0b1c33] leading-snug mb-2">
                {currentStepDef.title}
              </h2>
              <p className="text-sm text-[#51627b] leading-relaxed">
                {currentStepDef.subtitle}
              </p>
            </div>

            {currentStepDef.type === "textarea" && (
              <textarea
                className="w-full rounded-xl border border-[#c8d6ea] bg-[#f8fafc] px-4 py-3 text-sm text-[#0b1c33] placeholder:text-[#a0b0c0] resize-none focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-colors"
                rows={4}
                placeholder={currentStepDef.placeholder}
                value={answers[currentStepDef.key] as string}
                onChange={(e) =>
                  setAnswers((prev) => ({
                    ...prev,
                    [currentStepDef.key]: e.target.value,
                  }))
                }
              />
            )}

            {currentStepDef.type === "multiselect" && (
              <div className="flex flex-wrap gap-2">
                {EMPLOYEE_RANGE_OPTIONS.map((opt) => {
                  const selected = (answers.q4_company_sizes as string[]).includes(
                    opt.value
                  );
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setAnswers((prev) => ({
                          ...prev,
                          q4_company_sizes: selected
                            ? prev.q4_company_sizes.filter((v) => v !== opt.value)
                            : [...prev.q4_company_sizes, opt.value],
                        }))
                      }
                      className={cn(
                        "px-4 py-2 rounded-full border text-sm font-medium transition-all",
                        selected
                          ? "bg-[#2563EB] border-[#2563EB] text-white"
                          : "bg-white border-[#c8d6ea] text-[#51627b] hover:border-[#2563EB] hover:text-[#2563EB]"
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── Help chat ── */}
            {helpOpenFor !== currentStepDef.key ? (
              <button
                type="button"
                onClick={() => openHelpChat(currentStepDef.key)}
                className="mt-4 flex items-center gap-1.5 text-xs text-[#2563EB] hover:text-[#1d4ed8] font-medium transition-colors"
              >
                <MessageCircleQuestion className="w-3.5 h-3.5" />
                Besoin d&apos;aide pour répondre ?
              </button>
            ) : (
              <div className="mt-4 rounded-xl border border-[#c8d6ea] bg-[#f8fafc] overflow-hidden animate-in slide-in-from-top-2 duration-200">
                {/* Chat header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#c8d6ea] bg-white">
                  <span className="text-xs font-semibold text-[#0b1c33]">
                    Assistant Lidmeo
                  </span>
                  <button
                    type="button"
                    onClick={closeHelpChat}
                    className="text-[#7a9abf] hover:text-[#51627b] transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Messages */}
                <div className="max-h-60 overflow-y-auto px-4 py-3 space-y-3">
                  {helpMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex",
                        msg.role === "user" ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap",
                          msg.role === "user"
                            ? "bg-[#2563EB] text-white"
                            : "bg-white border border-[#c8d6ea] text-[#0b1c33]"
                        )}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {helpSending && (
                    <div className="flex justify-start">
                      <div className="bg-white border border-[#c8d6ea] rounded-xl px-3 py-2">
                        <Loader2 className="w-4 h-4 animate-spin text-[#7a9abf]" />
                      </div>
                    </div>
                  )}
                  <div ref={helpEndRef} />
                </div>

                {/* Input */}
                <div className="flex items-center gap-2 px-3 py-2.5 border-t border-[#c8d6ea] bg-white">
                  <input
                    ref={helpInputRef}
                    type="text"
                    value={helpInput}
                    onChange={(e) => setHelpInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendHelpMessage();
                      }
                    }}
                    placeholder="Écris ta question ici..."
                    className="flex-1 text-sm bg-transparent text-[#0b1c33] placeholder:text-[#a0b0c0] outline-none"
                    disabled={helpSending}
                  />
                  <button
                    type="button"
                    onClick={sendHelpMessage}
                    disabled={helpSending || !helpInput.trim()}
                    className="shrink-0 w-7 h-7 rounded-full bg-[#2563EB] text-white flex items-center justify-center disabled:opacity-40 hover:bg-[#1d4ed8] transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <HubButton
              variant="ghost"
              onClick={handlePrev}
              disabled={currentStep === 0 && !editingFromSummary}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              {editingFromSummary ? "Retour au récapitulatif" : "Précédent"}
            </HubButton>

            <HubButton onClick={handleNext} disabled={!isCurrentStepValid()} className="gap-2">
              {editingFromSummary
                ? "Enregistrer"
                : currentStep === STEP_COUNT - 1
                ? "Voir le récapitulatif"
                : "Suivant"}
              {!editingFromSummary && <ArrowRight className="w-4 h-4" />}
            </HubButton>
          </div>
        </div>
      )}

      {/* ── Écran : récapitulatif ── */}
      {screen === "summary" && (
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="bg-white rounded-2xl border border-[#c8d6ea] overflow-hidden mb-6">
            <div className="px-8 py-6 border-b border-[#eef1f8]">
              <h2 className="text-lg font-bold text-[#0b1c33]">
                Récapitulatif de votre ciblage
              </h2>
              <p className="text-sm text-[#51627b] mt-1">
                Vérifiez vos réponses avant de générer les exemples de profils.
              </p>
            </div>
            <div className="px-8">
              {STEPS.map((step, i) => (
                <SummaryItem
                  key={step.id}
                  label={`${step.number}. ${step.title}`}
                  value={answers[step.key] as string | string[]}
                  optional={!step.required}
                  onEdit={() => handleEditFromSummary(i)}
                />
              ))}
            </div>
          </div>

          {searchError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {searchError}
            </div>
          )}

          <div className="flex justify-center">
            <HubButton
              variant="primary"
              onClick={async () => {
                setGeneratingFilters(true);
                let newFilters: ApolloFilters | null = null;
                try {
                  const genRes = await fetch("/api/icp/generate-filters", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ answers }),
                  });
                  const genData = await genRes.json();
                  if (genRes.ok && genData.filters) {
                    newFilters = genData.filters as ApolloFilters;
                    setGeneratedFilters(newFilters);
                  }
                } catch {
                  // continue with existing filters if any
                } finally {
                  setGeneratingFilters(false);
                }
                handleEnterBrowseMode(newFilters ?? undefined);
              }}
              disabled={generatingFilters}
              className="gap-2"
            >
              {generatingFilters ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Préparation…
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Parcourir et sélectionner mes leads
                </>
              )}
            </HubButton>
          </div>
        </div>
      )}

      {/* ── Écran : résultats ── */}
      {screen === "results" && (
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
          {/* Crédits restants */}
          <div className="bg-white rounded-2xl border border-[#c8d6ea] px-6 py-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-[#51627b]">Crédits restants</p>
              <p
                className={cn(
                  "text-xl font-bold",
                  creditsRemaining === 0 ? "text-red-500" : "text-[#2563EB]"
                )}
              >
                {creditsRemaining ?? "—"}
              </p>
            </div>
          </div>

          {/* Erreur recherche */}
          {searchError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {searchError}
            </div>
          )}

          {/* Profils */}
          {profiles.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-[#51627b] mb-3">
                Exemples de profils trouvés
              </p>
              <div className="space-y-3">
                {profiles.map((p, i) => (
                  <ProfileCard key={p.id ?? i} profile={p} />
                ))}
              </div>
            </div>
          )}

          {/* Erreur validation */}
          {submitError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {submitError}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <HubButton
              variant="primary"
              onClick={handleSubmit}
              disabled={submitting}
              className="gap-2 justify-center"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Validation…
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Valider mon ciblage
                </>
              )}
            </HubButton>

            <div className="flex gap-3">
              <HubButton
                variant="secondary"
                onClick={() => {
                  setScreen("summary");
                  setSearchError(null);
                  setSubmitError(null);
                }}
                className="flex-1 gap-2 justify-center"
              >
                <Pencil className="w-4 h-4" />
                Ajuster mes réponses
              </HubButton>

              <HubButton
                variant="secondary"
                onClick={handleSearchAgain}
                disabled={searching || creditsRemaining === 0}
                className="flex-1 gap-2 justify-center"
              >
                {searching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                {searching ? "Recherche…" : "Relancer la recherche"}
              </HubButton>
            </div>
          </div>
        </div>
      )}

      {/* ── Écran : navigation et sélection de leads ── */}
      {screen === "browse" && (
        <div className="max-w-4xl mx-auto px-4 py-6 pb-28">
          {/* Bannière quota sticky */}
          <div className="sticky top-0 z-10 -mx-4 px-4 pb-4">
            <div className="bg-[#2563EB] rounded-2xl px-6 py-4 text-white">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">
                  Leads restants à sélectionner :{" "}
                  <span className="font-bold">
                    {Math.max(0, quotaRemaining - selectedCount)}
                  </span>{" "}
                  / {quotaRemaining}
                </p>
                <p className="text-sm">
                  <span className="font-bold">{selectedCount}</span>{" "}
                  sélectionné{selectedCount > 1 ? "s" : ""}
                </p>
              </div>
              <div className="h-2 w-full rounded-full bg-white/20">
                <div
                  className="h-2 rounded-full bg-white transition-all"
                  style={{
                    width: `${
                      quotaRemaining > 0
                        ? Math.min(100, (selectedCount / quotaRemaining) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
              <p className="text-xs text-white/80 mt-2">
                Validez votre sélection pour recevoir vos leads. Sans
                validation, aucun lead ne sera envoyé.
              </p>
            </div>
          </div>

          {/* Contrôles */}
          <div className="flex items-center justify-between mb-4">
            <HubButton
              variant="ghost"
              onClick={() => {
                setScreen("summary");
                setBrowseLeads([]);
              }}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Retour
            </HubButton>
            <HubButton
              variant="secondary"
              onClick={toggleSelectAll}
              disabled={(!canSelectMore && selectedCount === 0) || browseLoading}
              className="gap-2"
            >
              <Check className="w-4 h-4" />
              {selectedCount > 0 ? "Tout désélectionner" : "Tout sélectionner"}
            </HubButton>
          </div>

          {/* Auto-select */}
          {monthlyQuota > 0 && (
            <div className="flex justify-center mb-4">
              <HubButton
                variant="secondary"
                onClick={handleAutoSelect}
                disabled={autoSelecting || quotaRemaining === 0 || selectedCount >= Math.min(monthlyQuota, quotaRemaining)}
                className="gap-2"
              >
                {autoSelecting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sélection en cours…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Sélectionner{" "}
                    {Math.min(monthlyQuota, quotaRemaining).toLocaleString(
                      "fr-FR"
                    )}{" "}
                    leads automatiquement
                  </>
                )}
              </HubButton>
            </div>
          )}

          {/* Alerte leads insuffisants */}
          {!browseLoading && monthlyQuota > 0 && browseTotalEntries > 0 && browseTotalEntries < monthlyQuota && (
            <div className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 mb-4 text-sm text-orange-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-orange-500" />
              <div>
                <p className="font-medium">
                  Attention : seulement{" "}
                  {browseTotalEntries.toLocaleString("fr-FR")} leads
                  correspondent à vos critères, alors que votre quota mensuel est
                  de {monthlyQuota.toLocaleString("fr-FR")} leads.
                </p>
                <p className="mt-1 text-orange-700">
                  Une fois tous les leads sélectionnés, vous pourrez modifier
                  votre ciblage pour élargir votre recherche et trouver davantage
                  de profils.
                </p>
                {selectedCount > 0 && selectedCount >= browseTotalEntries && selectedCount < quotaRemaining && (
                  <HubButton
                    variant="secondary"
                    onClick={() => {
                      setScreen("summary");
                      setBrowseLeads([]);
                    }}
                    className="mt-3 gap-2 text-orange-800 border-orange-300 hover:bg-orange-100"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Modifier mon ciblage pour trouver plus de leads
                  </HubButton>
                )}
              </div>
            </div>
          )}

          {browseError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {browseError}
            </div>
          )}

          {submitError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {submitError}
            </div>
          )}

          {/* Grille de leads */}
          {browseLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-[#2563EB]" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
              {browseLeads.map((lead) => {
                const isSelected = selectedLeadIds.has(lead.id);
                const location = [lead.city, lead.country]
                  .filter(Boolean)
                  .join(", ");
                return (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => toggleLeadSelection(lead)}
                    disabled={!isSelected && !canSelectMore}
                    className={cn(
                      "relative rounded-2xl border p-4 text-left transition-all",
                      isSelected
                        ? "border-[#2563EB] bg-[#f0f5ff] shadow-sm"
                        : "border-[#c8d6ea] bg-white hover:border-[#a5bfe0]",
                      !isSelected &&
                        !canSelectMore &&
                        "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {/* Checkbox */}
                    <div
                      className={cn(
                        "absolute top-3 right-3 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                        isSelected
                          ? "bg-[#2563EB] border-[#2563EB]"
                          : "border-[#c8d6ea] bg-white"
                      )}
                    >
                      {isSelected && (
                        <Check className="w-3 h-3 text-white" />
                      )}
                    </div>

                    <div className="pr-8">
                      <p className="text-sm font-semibold text-[#0b1c33] truncate">
                        {lead.first_name ?? ""} {lead.last_name ?? ""}
                      </p>
                      <p className="text-xs text-[#51627b] truncate mt-0.5">
                        {lead.title ?? "—"}
                      </p>
                    </div>

                    {lead.organization && (
                      <div className="flex items-center gap-1.5 text-xs text-[#51627b] mt-2">
                        <Building2 className="w-3.5 h-3.5 shrink-0 text-[#7a9abf]" />
                        <span className="truncate font-medium text-[#0b1c33]">
                          {lead.organization.name ?? "—"}
                        </span>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#7a9abf] mt-1.5">
                      {lead.organization?.industry && (
                        <span className="truncate">
                          {lead.organization.industry}
                        </span>
                      )}
                      {lead.organization?.estimated_num_employees && (
                        <span>
                          {lead.organization.estimated_num_employees.toLocaleString(
                            "fr-FR"
                          )}{" "}
                          emp.
                        </span>
                      )}
                      {location ? (
                        <span>{location}</span>
                      ) : lead.location_available ? (
                        <span className="italic">Localisation disponible</span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {!browseLoading && browseTotalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mb-6">
              <button
                type="button"
                onClick={() => fetchBrowsePage(browsePage - 1)}
                disabled={browsePage <= 1}
                className="p-2 rounded-lg border border-[#c8d6ea] bg-white text-[#51627b] disabled:opacity-30 hover:bg-[#f8fafc] transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {Array.from({ length: Math.min(5, browseTotalPages) }, (_, i) => {
                let pageNum: number;
                if (browseTotalPages <= 5) {
                  pageNum = i + 1;
                } else if (browsePage <= 3) {
                  pageNum = i + 1;
                } else if (browsePage >= browseTotalPages - 2) {
                  pageNum = browseTotalPages - 4 + i;
                } else {
                  pageNum = browsePage - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => fetchBrowsePage(pageNum)}
                    className={cn(
                      "w-9 h-9 rounded-lg text-sm font-medium transition-colors",
                      pageNum === browsePage
                        ? "bg-[#2563EB] text-white"
                        : "border border-[#c8d6ea] bg-white text-[#51627b] hover:bg-[#f8fafc]"
                    )}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => fetchBrowsePage(browsePage + 1)}
                disabled={browsePage >= browseTotalPages}
                className="p-2 rounded-lg border border-[#c8d6ea] bg-white text-[#51627b] disabled:opacity-30 hover:bg-[#f8fafc] transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {!browseLoading && (
            <p className="text-center text-xs text-[#7a9abf] mb-6">
              Page {browsePage} sur {browseTotalPages} —{" "}
              {browseTotalEntries.toLocaleString("fr-FR")} leads disponibles
            </p>
          )}

          {/* Bouton de validation fixe */}
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#c8d6ea] px-4 py-4 z-20">
            <div className="max-w-4xl mx-auto flex items-center justify-between">
              <p className="text-sm text-[#51627b]">
                {selectedCount > 0
                  ? `${selectedCount} lead${selectedCount > 1 ? "s" : ""} sélectionné${selectedCount > 1 ? "s" : ""}`
                  : "Aucun lead sélectionné"}
              </p>
              <HubButton
                variant="primary"
                onClick={() => setShowConfirmModal(true)}
                disabled={selectedCount === 0 || validatingSelection}
                className="gap-2"
              >
                {validatingSelection ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Validation…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Valider ma sélection ({selectedCount})
                  </>
                )}
              </HubButton>
            </div>
          </div>

          {/* Modal de confirmation */}
          {showConfirmModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-2xl border border-[#c8d6ea] p-8 max-w-md mx-4 shadow-xl">
                <h3 className="text-lg font-bold text-[#0b1c33] mb-2">
                  Confirmer la sélection
                </h3>
                <p className="text-sm text-[#51627b] mb-6">
                  Vous avez sélectionné{" "}
                  <span className="font-semibold text-[#0b1c33]">
                    {selectedCount} lead{selectedCount > 1 ? "s" : ""}
                  </span>{" "}
                  sur un quota de{" "}
                  <span className="font-semibold text-[#0b1c33]">
                    {quotaRemaining}
                  </span>
                  . Souhaitez-vous valider ?
                </p>
                <div className="flex gap-3">
                  <HubButton
                    variant="secondary"
                    onClick={() => setShowConfirmModal(false)}
                    className="flex-1 justify-center"
                  >
                    Annuler
                  </HubButton>
                  <HubButton
                    variant="primary"
                    onClick={handleValidateSelection}
                    disabled={validatingSelection}
                    className="flex-1 gap-2 justify-center"
                  >
                    {validatingSelection ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    Confirmer
                  </HubButton>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
