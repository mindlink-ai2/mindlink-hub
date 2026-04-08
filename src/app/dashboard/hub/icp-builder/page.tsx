"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Loader2,
  Save,
  Search,
  User,
  Building2,
} from "lucide-react";
import { HubButton } from "@/components/ui/hub-button";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type IcpFilters = {
  // Personne
  person_titles: string[];
  person_not_titles: string[];
  person_seniorities: string[];
  person_departments: string[];
  person_locations: string[];
  q_keywords: string;
  // Entreprise
  organization_industry_tag_ids: string[];
  organization_num_employees_ranges: string[];
  organization_locations: string[];
  organization_not_locations: string[];
  currently_using_any_of_technology_uids: string[];
  revenue_range: { min: number | null; max: number | null };
};

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

type IcpStatus = "none" | "draft" | "submitted";

// ─── Constantes ───────────────────────────────────────────────────────────────

const SENIORITY_OPTIONS = [
  { value: "owner", label: "Owner" },
  { value: "founder", label: "Founder" },
  { value: "c_suite", label: "C-Suite" },
  { value: "vp", label: "VP" },
  { value: "director", label: "Directeur" },
  { value: "manager", label: "Manager" },
  { value: "senior", label: "Senior" },
  { value: "entry", label: "Junior / Entry" },
];

const DEPARTMENT_OPTIONS = [
  { value: "engineering", label: "Ingénierie" },
  { value: "sales", label: "Commercial" },
  { value: "marketing", label: "Marketing" },
  { value: "finance", label: "Finance" },
  { value: "human_resources", label: "RH" },
  { value: "operations", label: "Opérations" },
  { value: "information_technology", label: "IT" },
  { value: "executive", label: "Direction" },
  { value: "legal", label: "Juridique" },
  { value: "product_management", label: "Produit" },
  { value: "customer_success", label: "Succès client" },
  { value: "consulting", label: "Conseil" },
];

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
  { value: "10001,null", label: "10 001+" },
];

const REVENUE_OPTIONS: Array<{ label: string; min: number | null; max: number | null }> = [
  { label: "Moins de 1 M€", min: null, max: 1_000_000 },
  { label: "1 M€ – 10 M€", min: 1_000_000, max: 10_000_000 },
  { label: "10 M€ – 50 M€", min: 10_000_000, max: 50_000_000 },
  { label: "50 M€ – 100 M€", min: 50_000_000, max: 100_000_000 },
  { label: "100 M€ – 500 M€", min: 100_000_000, max: 500_000_000 },
  { label: "500 M€ – 1 Md€", min: 500_000_000, max: 1_000_000_000 },
  { label: "Plus de 1 Md€", min: 1_000_000_000, max: null },
];

const emptyFilters = (): IcpFilters => ({
  person_titles: [],
  person_not_titles: [],
  person_seniorities: [],
  person_departments: [],
  person_locations: [],
  q_keywords: "",
  organization_industry_tag_ids: [],
  organization_num_employees_ranges: [],
  organization_locations: [],
  organization_not_locations: [],
  currently_using_any_of_technology_uids: [],
  revenue_range: { min: null, max: null },
});

// ─── Composants helpers ───────────────────────────────────────────────────────

function Tooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="relative inline-flex ml-1">
      <button
        type="button"
        className="text-[#7a9abf] hover:text-[#1f5eff] transition-colors"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        aria-label="Aide"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {visible && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 w-56 rounded-lg bg-[#0b1c33] px-3 py-2 text-xs text-white shadow-lg">
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#0b1c33]" />
        </span>
      )}
    </span>
  );
}

function FieldLabel({ label, tooltip }: { label: string; tooltip?: string }) {
  return (
    <label className="flex items-center text-sm font-semibold text-[#0b1c33] mb-1.5">
      {label}
      {tooltip && <Tooltip text={tooltip} />}
    </label>
  );
}

function TagInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  const addTag = () => {
    const trimmed = input.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInput("");
  };

  const removeTag = (tag: string) => onChange(values.filter((v) => v !== tag));

  return (
    <div className="rounded-xl border border-[#c8d6ea] bg-white min-h-[42px] p-1.5 flex flex-wrap gap-1.5 focus-within:border-[#1f5eff] transition-colors">
      {values.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#e8f0fe] text-[#1f5eff] text-xs font-medium"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="hover:text-[#d32f2f] transition-colors leading-none"
          >
            ×
          </button>
        </span>
      ))}
      <input
        className="flex-1 min-w-[120px] text-sm text-[#0b1c33] placeholder:text-[#9ab0c8] bg-transparent outline-none px-1"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addTag();
          }
        }}
        onBlur={addTag}
        placeholder={values.length === 0 ? placeholder : "Ajouter…"}
      />
    </div>
  );
}

function MultiSelect({
  options,
  selected,
  onChange,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => toggle(opt.value)}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
            selected.includes(opt.value)
              ? "bg-[#1f5eff] border-[#1f5eff] text-white"
              : "bg-white border-[#c8d6ea] text-[#3f5470] hover:border-[#1f5eff] hover:text-[#1f5eff]"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── Carte profil ─────────────────────────────────────────────────────────────

function ProfileCard({ profile }: { profile: ApolloProfile }) {
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "—";
  const location = [profile.city, profile.country].filter(Boolean).join(", ") || null;
  const employees = profile.organization?.estimated_num_employees;
  const employeeLabel = employees ? `${employees.toLocaleString("fr-FR")} emp.` : null;

  return (
    <div className="rounded-2xl border border-[#c8d6ea] bg-white p-4 flex flex-col gap-2 hover:border-[#a5bfe0] transition-colors">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#dde8f9] to-[#c4d9f7] flex items-center justify-center shrink-0">
          <span className="text-sm font-bold text-[#1f5eff]">
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
          <span className="truncate">
            {profile.organization.industry}
          </span>
        )}
        {employeeLabel && <span>{employeeLabel}</span>}
        {location && <span>{location}</span>}
      </div>

      {profile.linkedin_url && (
        <a
          href={profile.linkedin_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[#1f5eff] hover:underline truncate"
        >
          Voir le profil LinkedIn →
        </a>
      )}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function IcpBuilderPage() {
  const [filters, setFilters] = useState<IcpFilters>(emptyFilters);
  const [profiles, setProfiles] = useState<ApolloProfile[]>([]);
  const [totalResults, setTotalResults] = useState<number | null>(null);
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);
  const [icpStatus, setIcpStatus] = useState<IcpStatus>("none");
  const [loadingCredits, setLoadingCredits] = useState(true);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitDone, setSubmitDone] = useState(false);

  // Section expand/collapse
  const [personOpen, setPersonOpen] = useState(true);
  const [companyOpen, setCompanyOpen] = useState(true);

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Charger la config existante + crédits au montage
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [configRes, creditsRes] = await Promise.all([
          fetch("/api/icp/config"),
          fetch("/api/icp/credits"),
        ]);

        if (!mounted) return;

        if (configRes.ok) {
          const configData = await configRes.json();
          if (configData.filters) {
            setFilters({ ...emptyFilters(), ...configData.filters });
          }
          setIcpStatus(configData.status ?? "none");
          if (configData.status === "submitted") {
            setSubmitDone(true);
          }
        }

        if (creditsRes.ok) {
          const creditsData = await creditsRes.json();
          setCreditsRemaining(creditsData.credits_remaining ?? null);
        }
      } catch {
        // silencieux
      } finally {
        if (mounted) setLoadingCredits(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const updateFilter = useCallback(
    <K extends keyof IcpFilters>(key: K, value: IcpFilters[K]) => {
      setFilters((prev) => {
        const next = { ...prev, [key]: value };
        // Auto-save brouillon après 2s d'inactivité
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = setTimeout(() => {
          autoSaveDraft(next);
        }, 2000);
        return next;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const autoSaveDraft = async (currentFilters: IcpFilters) => {
    if (icpStatus === "submitted") return;
    try {
      await fetch("/api/icp/save-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters: currentFilters }),
      });
      setIcpStatus("draft");
    } catch {
      // silencieux
    }
  };

  const handleSearch = async () => {
    setSearching(true);
    setSearchError(null);
    setProfiles([]);
    setTotalResults(null);

    try {
      const res = await fetch("/api/apollo/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filters),
      });

      const data = await res.json();

      if (!res.ok) {
        setSearchError(data.error ?? "Une erreur est survenue.");
        if (data.credits_remaining !== undefined) {
          setCreditsRemaining(data.credits_remaining);
        }
        return;
      }

      setProfiles(data.profiles ?? []);
      setTotalResults(data.total_results ?? null);
      if (data.credits_remaining !== undefined) {
        setCreditsRemaining(data.credits_remaining);
      }
    } catch {
      setSearchError("Impossible de contacter le serveur. Veuillez réessayer.");
    } finally {
      setSearching(false);
    }
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/icp/save-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "Erreur lors de la sauvegarde.");
      } else {
        setIcpStatus("draft");
      }
    } catch {
      setSaveError("Impossible de sauvegarder. Veuillez réessayer.");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/icp/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters, preview_profiles: profiles }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "Erreur lors de la validation.");
      } else {
        setIcpStatus("submitted");
        setSubmitDone(true);
      }
    } catch {
      setSaveError("Impossible de valider. Veuillez réessayer.");
    } finally {
      setSubmitting(false);
    }
  };

  const isLocked = icpStatus === "submitted";

  return (
    <div className="min-h-screen bg-[#eef1f8]">
      {/* Header */}
      <div className="bg-white border-b border-[#c8d6ea] px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-[#0b1c33]">Constructeur de ciblage ICP</h1>
            <p className="text-sm text-[#51627b] mt-0.5">
              Définissez votre profil client idéal pour que nous puissions extraire les bonnes
              personnes.
            </p>
          </div>

          {/* Crédits */}
          <div className="flex items-center gap-2 rounded-xl border border-[#c8d6ea] bg-[#f4f8ff] px-4 py-2 text-sm">
            <Search className="w-4 h-4 text-[#1f5eff]" />
            <span className="text-[#51627b]">Crédits de recherche :</span>
            {loadingCredits ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#7a9abf]" />
            ) : (
              <span
                className={cn(
                  "font-bold",
                  creditsRemaining === 0
                    ? "text-[#d32f2f]"
                    : creditsRemaining !== null && creditsRemaining <= 3
                    ? "text-[#e65100]"
                    : "text-[#1f5eff]"
                )}
              >
                {creditsRemaining ?? "—"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Bannière statut */}
      {submitDone && (
        <div className="bg-[#e8f5e9] border-b border-[#a5d6a7] px-6 py-3">
          <div className="max-w-4xl mx-auto flex items-center gap-2 text-[#2e7d32] text-sm font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Votre ciblage a été validé et transmis à notre équipe. Nous vous contacterons très
            prochainement.
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* ── Section Personne ── */}
        <div className="bg-white rounded-2xl border border-[#c8d6ea] overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-[#f8fafc] transition-colors"
            onClick={() => setPersonOpen((v) => !v)}
          >
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-[#1f5eff]" />
              <span className="text-base font-bold text-[#0b1c33]">Ciblage personne</span>
            </div>
            {personOpen ? (
              <ChevronUp className="w-4 h-4 text-[#7a9abf]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[#7a9abf]" />
            )}
          </button>

          {personOpen && (
            <div className="px-6 pb-6 space-y-5 border-t border-[#eef1f8]">
              <div className="pt-4">
                <FieldLabel
                  label="Titres de poste"
                  tooltip='Ex : "CEO", "Directeur Commercial", "Head of Sales". Appuyez sur Entrée pour ajouter.'
                />
                <TagInput
                  values={filters.person_titles}
                  onChange={(v) => updateFilter("person_titles", v)}
                  placeholder="CEO, Directeur Commercial…"
                />
              </div>

              <div>
                <FieldLabel
                  label="Titres à exclure"
                  tooltip="Les personnes ayant ces titres seront exclues des résultats."
                />
                <TagInput
                  values={filters.person_not_titles}
                  onChange={(v) => updateFilter("person_not_titles", v)}
                  placeholder="Stagiaire, Assistant…"
                />
              </div>

              <div>
                <FieldLabel
                  label="Niveau de séniorité"
                  tooltip="Filtrez par niveau hiérarchique dans l'entreprise."
                />
                <MultiSelect
                  options={SENIORITY_OPTIONS}
                  selected={filters.person_seniorities}
                  onChange={(v) => updateFilter("person_seniorities", v)}
                />
              </div>

              <div>
                <FieldLabel
                  label="Département"
                  tooltip="Le département de la personne dans son entreprise."
                />
                <MultiSelect
                  options={DEPARTMENT_OPTIONS}
                  selected={filters.person_departments}
                  onChange={(v) => updateFilter("person_departments", v)}
                />
              </div>

              <div>
                <FieldLabel
                  label="Localisation de la personne"
                  tooltip='Pays, ville ou région où se trouve la personne. Ex : "France", "Paris", "Île-de-France".'
                />
                <TagInput
                  values={filters.person_locations}
                  onChange={(v) => updateFilter("person_locations", v)}
                  placeholder="France, Paris, Belgique…"
                />
              </div>

              <div>
                <FieldLabel
                  label="Mots-clés"
                  tooltip="Mots-clés présents dans le profil LinkedIn de la personne."
                />
                <input
                  type="text"
                  className="w-full rounded-xl border border-[#c8d6ea] bg-white px-3.5 py-2.5 text-sm text-[#0b1c33] placeholder:text-[#9ab0c8] focus:border-[#1f5eff] focus:outline-none transition-colors"
                  value={filters.q_keywords}
                  onChange={(e) => updateFilter("q_keywords", e.target.value)}
                  placeholder="SaaS, B2B, scale-up…"
                  disabled={isLocked}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Section Entreprise ── */}
        <div className="bg-white rounded-2xl border border-[#c8d6ea] overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-[#f8fafc] transition-colors"
            onClick={() => setCompanyOpen((v) => !v)}
          >
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#1f5eff]" />
              <span className="text-base font-bold text-[#0b1c33]">Ciblage entreprise</span>
            </div>
            {companyOpen ? (
              <ChevronUp className="w-4 h-4 text-[#7a9abf]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[#7a9abf]" />
            )}
          </button>

          {companyOpen && (
            <div className="px-6 pb-6 space-y-5 border-t border-[#eef1f8]">
              <div className="pt-4">
                <FieldLabel
                  label="Secteur d'activité"
                  tooltip="Saisissez le nom du secteur ou l'identifiant Apollo de l'industrie."
                />
                <TagInput
                  values={filters.organization_industry_tag_ids}
                  onChange={(v) => updateFilter("organization_industry_tag_ids", v)}
                  placeholder="SaaS, Fintech, E-commerce, Immobilier…"
                />
              </div>

              <div>
                <FieldLabel
                  label="Taille de l'entreprise"
                  tooltip="Nombre d'employés de l'entreprise cible."
                />
                <MultiSelect
                  options={EMPLOYEE_RANGE_OPTIONS}
                  selected={filters.organization_num_employees_ranges}
                  onChange={(v) => updateFilter("organization_num_employees_ranges", v)}
                />
              </div>

              <div>
                <FieldLabel
                  label="Localisation de l'entreprise"
                  tooltip={"Pays ou ville où se trouve le siège de l'entreprise. Ex : France, Paris."}
                />
                <TagInput
                  values={filters.organization_locations}
                  onChange={(v) => updateFilter("organization_locations", v)}
                  placeholder="France, Belgique, Paris…"
                />
              </div>

              <div>
                <FieldLabel
                  label="Localisations à exclure"
                  tooltip="Les entreprises situées dans ces zones seront exclues."
                />
                <TagInput
                  values={filters.organization_not_locations}
                  onChange={(v) => updateFilter("organization_not_locations", v)}
                  placeholder="DOM-TOM, Maroc…"
                />
              </div>

              <div>
                <FieldLabel
                  label="Chiffre d'affaires"
                  tooltip="Estimatif du CA annuel de l'entreprise cible."
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => updateFilter("revenue_range", { min: null, max: null })}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                      filters.revenue_range.min === null && filters.revenue_range.max === null
                        ? "bg-[#1f5eff] border-[#1f5eff] text-white"
                        : "bg-white border-[#c8d6ea] text-[#3f5470] hover:border-[#1f5eff]"
                    )}
                  >
                    Tous
                  </button>
                  {REVENUE_OPTIONS.map((opt) => {
                    const isSelected =
                      filters.revenue_range.min === opt.min &&
                      filters.revenue_range.max === opt.max;
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() =>
                          updateFilter("revenue_range", { min: opt.min, max: opt.max })
                        }
                        className={cn(
                          "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                          isSelected
                            ? "bg-[#1f5eff] border-[#1f5eff] text-white"
                            : "bg-white border-[#c8d6ea] text-[#3f5470] hover:border-[#1f5eff]"
                        )}
                        disabled={isLocked}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <FieldLabel
                  label="Technologies utilisées"
                  tooltip='Identifiants Apollo de technologies. Ex : "salesforce", "hubspot", "stripe".'
                />
                <TagInput
                  values={filters.currently_using_any_of_technology_uids}
                  onChange={(v) =>
                    updateFilter("currently_using_any_of_technology_uids", v)
                  }
                  placeholder="salesforce, hubspot, intercom…"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Actions ── */}
        {!isLocked && (
          <div className="flex flex-wrap gap-3 items-center">
            <HubButton
              variant="primary"
              size="lg"
              onClick={handleSearch}
              disabled={searching || creditsRemaining === 0}
              className="gap-2"
            >
              {searching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              {searching ? "Recherche en cours…" : "Voir des exemples"}
            </HubButton>

            <HubButton
              variant="secondary"
              size="lg"
              onClick={handleSaveDraft}
              disabled={saving}
              className="gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Sauvegarde…" : "Sauvegarder le brouillon"}
            </HubButton>

            {creditsRemaining === 0 && (
              <p className="text-sm text-[#e65100] flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                Plus de crédits. Contactez-nous pour en obtenir davantage.
              </p>
            )}
          </div>
        )}

        {/* Erreur recherche */}
        {searchError && (
          <div className="rounded-xl border border-[#fecdd3] bg-[#fff5f5] px-4 py-3 flex items-start gap-2 text-sm text-[#b91c1c]">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {searchError}
          </div>
        )}

        {/* ── Prévisualisation ── */}
        {profiles.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-[#0b1c33]">
                Exemples de profils
              </h2>
              {totalResults !== null && (
                <span className="text-xs text-[#51627b] bg-[#f4f8ff] border border-[#c8d6ea] rounded-full px-3 py-1">
                  ~{totalResults.toLocaleString("fr-FR")} profils correspondent à vos critères
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {profiles.map((p, i) => (
                <ProfileCard key={p.id ?? i} profile={p} />
              ))}
            </div>
          </div>
        )}

        {/* ── Validation ICP ── */}
        {!isLocked && (
          <div className="bg-white rounded-2xl border border-[#c8d6ea] p-6">
            <h2 className="text-base font-bold text-[#0b1c33] mb-1">
              Valider mon ciblage
            </h2>
            <p className="text-sm text-[#51627b] mb-4">
              Une fois validé, notre équipe sera notifiée et préparera votre extraction. Vous ne
              pourrez plus modifier les filtres.
            </p>

            {saveError && (
              <div className="rounded-xl border border-[#fecdd3] bg-[#fff5f5] px-4 py-3 flex items-start gap-2 text-sm text-[#b91c1c] mb-4">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                {saveError}
              </div>
            )}

            <HubButton
              variant="primary"
              size="lg"
              onClick={handleSubmit}
              disabled={submitting}
              className="gap-2"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              {submitting ? "Validation en cours…" : "Valider mon ciblage"}
            </HubButton>
          </div>
        )}

        {/* Statut brouillon */}
        {icpStatus === "draft" && !isLocked && (
          <p className="text-xs text-[#7a9abf] text-center">
            Brouillon sauvegardé automatiquement.
          </p>
        )}
      </div>
    </div>
  );
}
