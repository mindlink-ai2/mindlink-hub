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
  Play,
  RefreshCw,
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
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  plan: string | null;
  quota: string | null;
  subscription_status: StripeStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  created_at: string | null;
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

// ─── Modal ICP ────────────────────────────────────────────────────────────────

function IcpModal({
  client,
  onClose,
}: {
  client: ClientRow;
  onClose: () => void;
}) {
  const filters = client.icp.filters ?? {};
  const renderList = (arr: unknown) =>
    Array.isArray(arr) && arr.length > 0
      ? (arr as string[]).join(", ")
      : "—";

  const rr = filters.revenue_range as { min: number | null; max: number | null } | null;
  const revenueLabel =
    rr && (rr.min !== null || rr.max !== null)
      ? `${rr.min !== null ? `${(rr.min / 1_000_000).toFixed(0)}M€` : ""} → ${rr.max !== null ? `${(rr.max / 1_000_000).toFixed(0)}M€` : "∞"}`
      : "—";

  const filterItems = [
    { label: "Titres de poste", value: renderList(filters.person_titles) },
    { label: "Titres exclus", value: renderList(filters.person_not_titles) },
    { label: "Séniorité", value: renderList(filters.person_seniorities) },
    { label: "Département", value: renderList(filters.person_departments) },
    { label: "Localisation personne", value: renderList(filters.person_locations) },
    { label: "Mots-clés", value: (filters.q_keywords as string) || "—" },
    { label: "Secteur", value: renderList(filters.organization_industry_tag_ids) },
    { label: "Taille entreprise", value: renderList(filters.organization_num_employees_ranges) },
    { label: "Localisation entreprise", value: renderList(filters.organization_locations) },
    { label: "Localisations exclues", value: renderList(filters.organization_not_locations) },
    { label: "Technologies", value: renderList(filters.currently_using_any_of_technology_uids) },
    { label: "Chiffre d'affaires", value: revenueLabel },
  ];

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
              Config ICP — {client.first_name ?? client.email}
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
      </div>
    </div>
  );
}

// ─── Modal Extraction ─────────────────────────────────────────────────────────

function ExtractModal({
  client,
  onClose,
  onSuccess,
}: {
  client: ClientRow;
  onClose: () => void;
  onSuccess: (url: string, count: number) => void;
}) {
  const [quota, setQuota] = useState(500);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExtract = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: client.id, quota }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erreur lors de l'extraction.");
        return;
      }
      onSuccess(data.google_sheet_url, data.leads_count);
    } catch {
      setError("Impossible de lancer l'extraction. Réessayez.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-[#0b1c33]">
            Lancer l'extraction — {client.first_name ?? client.email}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#f0f4fb] text-[#7a9abf]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mb-4">
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
        </div>

        {error && (
          <div className="rounded-xl border border-[#fecdd3] bg-[#fff5f5] px-4 py-3 flex items-start gap-2 text-sm text-[#b91c1c] mb-4">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <HubButton variant="ghost" onClick={onClose} disabled={loading}>
            Annuler
          </HubButton>
          <HubButton
            variant="primary"
            onClick={handleExtract}
            disabled={loading || quota < 1}
            className="flex-1 gap-2"
          >
            {loading ? (
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
      </div>
    </div>
  );
}

// ─── Ligne client ─────────────────────────────────────────────────────────────

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
  const isIcpOk = client.icp.status !== "none" && client.icp.status !== "draft";
  const canExtract = isStripeOk && isIcpOk;

  const displayName =
    [client.first_name, client.last_name].filter(Boolean).join(" ") ||
    client.email ||
    `Client #${client.id}`;

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
                  ? "ICP non validé"
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
          <td colSpan={6} className="px-6 py-4">
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
      (c.first_name ?? "").toLowerCase().includes(q) ||
      (c.last_name ?? "").toLowerCase().includes(q) ||
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
        [c?.first_name, c?.last_name].filter(Boolean).join(" ") || c?.email || "Client",
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
