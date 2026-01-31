"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ShieldCheck, ArrowRight, Loader2 } from "lucide-react";

type BillingStatus = {
  plan: string | null; // "essential" | "premium" | "automated" | ...
  quota: string | number | null; // ✅ NEW (text en DB, parfois NULL/EMPTY)
  subscription_status: string | null; // "active" | "trialing" | ...
  current_period_end: string | null;
};

function normalizePlan(p?: string | null) {
  return (p ?? "").toLowerCase().trim();
}

function normalizeQuota(q?: string | number | null) {
  if (q === null || q === undefined) return null;
  const s = String(q).trim();
  if (!s || s.toLowerCase() === "empty") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function prettyPlan(p?: string | null) {
  const n = normalizePlan(p);
  if (n === "premium") return "Premium";
  if (n === "essential") return "Essential";
  if (n === "automated") return "Full automatisé";
  return p ? p : "—";
}

function prettyStatus(s?: string | null) {
  const n = (s ?? "").toLowerCase().trim();
  if (n === "active") return "Actif";
  if (n === "trialing") return "Essai";
  if (n === "canceled") return "Annulé";
  if (n === "past_due") return "Paiement en attente";
  if (n === "incomplete") return "Paiement incomplet";
  if (n === "incomplete_expired") return "Paiement expiré";
  return s ? s : "—";
}

export default function BillingPage() {
  const [loading, setLoading] = useState<"essential" | "portal" | null>(null);
  const [selectedEssentialQuota, setSelectedEssentialQuota] = useState<10 | 20 | 30>(10);
  const [error, setError] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const [billing, setBilling] = useState<BillingStatus>({
    plan: null,
    quota: null,
    subscription_status: null,
    current_period_end: null,
  });

  const currentPlan = normalizePlan(billing.plan);
  const currentQuota = normalizeQuota(billing.quota);

  const isEssential = currentPlan === "essential";
  const isAutomated = currentPlan === "automated";
  const isPremium = currentPlan === "premium";

  const isActive = (billing.subscription_status ?? "").toLowerCase().trim() === "active";
  const isTrial = (billing.subscription_status ?? "").toLowerCase().trim() === "trialing";

  const renewalLabel = useMemo(() => {
    if (!billing.current_period_end) return null;
    const d = new Date(billing.current_period_end);
    if (Number.isNaN(d.getTime())) return null;
    return `Renouvellement le ${d.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    })}`;
  }, [billing.current_period_end]);

  const currentPaceLabel = useMemo(() => {
    // ✅ Affiche la cadence lisible
    if (isAutomated) return "15 leads / jour";
    if (isEssential) {
      const q = currentQuota ?? 10;
      return `${q} prospects / jour`;
    }
    if (isPremium) return "—";
    return "—";
  }, [isAutomated, isEssential, isPremium, currentQuota]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const res = await fetch("/api/billing/status", { method: "GET" });
        const data = await res.json().catch(() => ({}));
        if (!mounted) return;

        if (res.ok) {
          const plan = data.plan ?? null;
          const quota = data.quota ?? null;

          setBilling({
            plan,
            quota,
            subscription_status: data.subscription_status ?? null,
            current_period_end: data.current_period_end ?? null,
          });

          // ✅ pré-sélection UI : si essential + quota valide, on le met dans le sélecteur
          const nPlan = normalizePlan(plan);
          const q = normalizeQuota(quota);
          if (nPlan === "essential" && (q === 10 || q === 20 || q === 30)) {
            setSelectedEssentialQuota(q);
          } else {
            setSelectedEssentialQuota(10);
          }
        } else {
          // pas bloquant : on affiche la page quand même
          setBilling({ plan: null, quota: null, subscription_status: null, current_period_end: null });
          setSelectedEssentialQuota(10);
        }
      } finally {
        if (mounted) setStatusLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const startEssentialCheckout = async () => {
    setError(null);
    setLoading("essential");

    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "essential", quota: selectedEssentialQuota }),
    });

    const data = await res.json().catch(() => ({}));
    if (data.url) window.location.href = data.url;

    setError(data.error || "Une erreur est survenue lors du paiement.");
    setLoading(null);
  };

  const openPortal = async () => {
    setError(null);
    setLoading("portal");

    const res = await fetch("/api/stripe/portal", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (data.url) window.location.href = data.url;

    setError(data.error || "Impossible d’ouvrir le portail de facturation.");
    setLoading(null);
  };

  const essentialCtasDisabled = loading !== null;
  const portalDisabled = loading !== null;

  const essentialQuotaOptions: Array<{ value: 10 | 20 | 30; label: string; sub: string }> = [
    { value: 10, label: "10 / jour", sub: "Rythme léger" },
    { value: 20, label: "20 / jour", sub: "Rythme régulier" },
    { value: 30, label: "30 / jour", sub: "Rythme intensif" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-14">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0b1220] via-[#070b14] to-[#060813] p-10 shadow-2xl">
        <div className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -left-28 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />

        <div className="relative flex flex-col gap-6">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-3xl sm:text-4xl font-semibold text-white tracking-tight">
                Facturation & abonnement
              </h1>
              <p className="mt-2 max-w-2xl text-gray-400">
                Choisissez votre rythme de prospection. Upgrade, downgrade ou annulation à tout moment.
              </p>

              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-gray-300">
                  <span className="text-gray-400">Statut :</span>{" "}
                  {statusLoading ? "Chargement…" : prettyStatus(billing.subscription_status)}
                  {(isActive || isTrial) && currentPaceLabel !== "—" ? (
                    <span className="text-gray-500"> · {currentPaceLabel}</span>
                  ) : null}
                </span>

                {renewalLabel ? (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-gray-400">
                    {renewalLabel}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <ShieldCheck className="h-4 w-4 text-indigo-300" />
              <div className="text-xs">
                <div className="text-gray-400">Plan actuel</div>
                <div className="text-white font-medium">
                  {statusLoading ? "Chargement…" : prettyPlan(billing.plan)}
                  <span className="text-gray-500 font-normal"> · </span>
                  <span className="text-gray-300 font-normal">
                    {statusLoading ? "…" : prettyStatus(billing.subscription_status)}
                  </span>
                </div>
                {!statusLoading && currentPaceLabel !== "—" ? (
                  <div className="mt-1 text-gray-400">{currentPaceLabel}</div>
                ) : null}
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="mt-2 grid gap-6 lg:grid-cols-2">
            {/* ESSENTIAL */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-white text-lg font-semibold">Essential</div>
                  <div className="mt-1 text-gray-400 text-sm">
                    Choisissez votre volume : 10, 20 ou 30 prospects par jour.
                  </div>
                </div>

                {isEssential && !statusLoading && (
                  <span className="shrink-0 rounded-full bg-indigo-500/15 text-indigo-200 border border-indigo-500/20 px-3 py-1 text-xs">
                    Plan actuel
                    {currentQuota ? <span className="text-indigo-100"> · {currentQuota}/j</span> : null}
                  </span>
                )}
              </div>

              <div className="mt-6 flex items-end gap-2">
                <div className="text-4xl font-semibold text-white">49€</div>
                <div className="pb-1 text-gray-400">/ mois</div>
              </div>

              {/* Quota selector */}
              <div className="mt-6">
                <div className="text-xs text-gray-400 mb-2">Votre rythme</div>
                <div className="grid grid-cols-3 gap-3">
                  {essentialQuotaOptions.map((opt) => {
                    const active = selectedEssentialQuota === opt.value;
                    const isCurrent = isEssential && !statusLoading && currentQuota === opt.value;

                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSelectedEssentialQuota(opt.value)}
                        disabled={essentialCtasDisabled}
                        className={[
                          "rounded-2xl border px-3 py-3 text-left transition",
                          "disabled:opacity-60 disabled:cursor-not-allowed",
                          active
                            ? "border-indigo-500/40 bg-indigo-500/10"
                            : "border-white/10 bg-white/5 hover:border-white/20",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-white">{opt.label}</div>
                          {isCurrent ? (
                            <span className="text-[10px] rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-emerald-200">
                              Actif
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-gray-400">{opt.sub}</div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 text-xs text-gray-500">
                  {isEssential && currentQuota && currentQuota !== selectedEssentialQuota ? (
                    <span>
                      Votre plan actuel est à <span className="text-gray-300">{currentQuota}/jour</span>. Vous
                      pouvez changer via le checkout ou via le portail Stripe.
                    </span>
                  ) : (
                    <span>Vous pouvez modifier votre rythme à tout moment.</span>
                  )}
                </div>
              </div>

              <ul className="mt-6 space-y-3 text-sm text-gray-300">
                {[
                  "Prospection LinkedIn",
                  "Tableau de bord centralisé",
                  "Relances & suivi",
                  "Support email",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 text-indigo-300" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-7 flex flex-col gap-3">
                <button
                  onClick={startEssentialCheckout}
                  disabled={essentialCtasDisabled}
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading === "essential" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Redirection…
                    </>
                  ) : (
                    <>
                      Choisir Essential {selectedEssentialQuota}/jour
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>

                <button
                  onClick={openPortal}
                  disabled={portalDisabled}
                  className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 px-6 py-3 text-sm font-medium text-gray-200 transition hover:border-white/25 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading === "portal" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Ouverture…
                    </>
                  ) : (
                    "Gérer mon abonnement"
                  )}
                </button>

                <div className="text-xs text-gray-400">
                  Paiement sécurisé via Stripe · Sans engagement · Annulable à tout moment
                  {renewalLabel ? <span className="text-gray-500"> · {renewalLabel}</span> : null}
                </div>
              </div>
            </div>

            {/* FULL AUTOMATISÉ (placeholder) */}
            <div className="relative rounded-2xl border border-white/10 bg-white/5 p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-white text-lg font-semibold">Full automatisé</div>
                  <div className="mt-1 text-gray-400 text-sm">
                    Nous gérons tout pour vous : extraction, ciblage, livraison, suivi.
                  </div>
                </div>

                {isAutomated && !statusLoading && (
                  <span className="shrink-0 rounded-full bg-emerald-500/15 text-emerald-200 border border-emerald-500/20 px-3 py-1 text-xs">
                    Actif · 15/j
                  </span>
                )}
              </div>

              <div className="mt-6 flex items-end gap-2">
                <div className="text-4xl font-semibold text-white">199€</div>
                <div className="pb-1 text-gray-400">/ mois</div>
              </div>

              <ul className="mt-6 space-y-3 text-sm text-gray-300">
                {[
                  "15 leads / jour (fixe)",
                  "Configuration et optimisation par nos équipes",
                  "Livraison continue + monitoring",
                  "Priorité support",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 text-indigo-300" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-7 text-xs text-gray-500">
                Pour l’instant, l’activation se fait via votre contact commercial. (Le checkout arrivera ensuite.)
              </div>

              <div className="mt-6">
                <button
                  onClick={openPortal}
                  disabled={portalDisabled}
                  className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 px-6 py-3 text-sm font-medium text-gray-200 transition hover:border-white/25 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading === "portal" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Ouverture…
                    </>
                  ) : (
                    "Gérer mon abonnement"
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="sm:hidden rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-gray-300">
            <span className="text-gray-400">Plan actuel :</span>{" "}
            {statusLoading
              ? "Chargement…"
              : `${prettyPlan(billing.plan)} · ${prettyStatus(billing.subscription_status)}`}
            {currentPaceLabel !== "—" ? <span className="text-gray-500"> · {currentPaceLabel}</span> : null}
            {renewalLabel ? <div className="text-gray-500 mt-1">{renewalLabel}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}