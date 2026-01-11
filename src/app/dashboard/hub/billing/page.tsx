"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Crown, ShieldCheck, ArrowRight, Loader2 } from "lucide-react";

type BillingStatus = {
  plan: string | null; // "essential" | "premium" | ...
  subscription_status: string | null; // "active" | "trialing" | ...
  current_period_end: string | null;
};

function normalizePlan(p?: string | null) {
  return (p ?? "").toLowerCase();
}
function prettyPlan(p?: string | null) {
  const n = normalizePlan(p);
  if (n === "premium") return "Premium";
  if (n === "essential") return "Essential";
  return p ? p : "—";
}
function prettyStatus(s?: string | null) {
  const n = (s ?? "").toLowerCase();
  if (n === "active") return "Actif";
  if (n === "trialing") return "Essai";
  if (n === "canceled") return "Annulé";
  if (n === "past_due") return "Paiement en attente";
  return s ? s : "—";
}

export default function BillingPage() {
  const [loading, setLoading] = useState<"premium" | "portal" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [billing, setBilling] = useState<BillingStatus>({
    plan: null,
    subscription_status: null,
    current_period_end: null,
  });

  const currentPlan = normalizePlan(billing.plan);
  const isPremium = currentPlan === "premium";

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

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/billing/status", { method: "GET" });
        const data = await res.json();
        if (!mounted) return;

        if (res.ok) {
          setBilling({
            plan: data.plan ?? null,
            subscription_status: data.subscription_status ?? null,
            current_period_end: data.current_period_end ?? null,
          });
        } else {
          // pas bloquant : on affiche la page quand même
          setBilling({ plan: null, subscription_status: null, current_period_end: null });
        }
      } finally {
        if (mounted) setStatusLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const upgradeToPremium = async () => {
    setError(null);
    setLoading("premium");

    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "premium" }),
    });

    const data = await res.json();
    if (data.url) window.location.href = data.url;

    setError(data.error || "Une erreur est survenue lors du paiement.");
    setLoading(null);
  };

  const openPortal = async () => {
    setError(null);
    setLoading("portal");

    const res = await fetch("/api/stripe/portal", { method: "POST" });
    const data = await res.json();
    if (data.url) window.location.href = data.url;

    setError(data.error || "Impossible d’ouvrir le portail de facturation.");
    setLoading(null);
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-14">
      {/* HERO */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0b1220] via-[#070b14] to-[#060813] p-10 shadow-2xl">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -left-28 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />

        <div className="relative flex flex-col gap-6">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-3xl sm:text-4xl font-semibold text-white tracking-tight">
                Facturation & abonnement
              </h1>
              <p className="mt-2 max-w-2xl text-gray-400">
                Choisissez l’offre adaptée à votre rythme. Upgrade, downgrade ou annulation à tout moment.
              </p>
            </div>

            {/* Current plan pill */}
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
              </div>
            </div>
          </div>

          {/* Error banner */}
          {error && (
            <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Plans */}
          <div className="mt-2 grid gap-6 lg:grid-cols-2">
            {/* ESSENTIAL */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-7">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-white text-lg font-semibold">Essential</div>
                  <div className="mt-1 text-gray-400 text-sm">
                    Pour démarrer proprement sur LinkedIn.
                  </div>
                </div>

                {currentPlan === "essential" && !statusLoading && (
                  <span className="rounded-full bg-indigo-500/15 text-indigo-200 border border-indigo-500/20 px-3 py-1 text-xs">
                    Plan actuel
                  </span>
                )}
              </div>

              <div className="mt-6 flex items-end gap-2">
                <div className="text-4xl font-semibold text-white">49€</div>
                <div className="pb-1 text-gray-400">/ mois</div>
              </div>

              <ul className="mt-6 space-y-3 text-sm text-gray-300">
                {[
                  "Prospection LinkedIn",
                  "10 prospects/jour",
                  "Tableau de bord centralisé",
                  "Relances & suivi",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 text-indigo-300" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-7 text-xs text-gray-500">
                Idéal si vous voulez une base simple et efficace.
              </div>
            </div>

            {/* PREMIUM */}
            <div className="relative rounded-2xl border border-indigo-500/25 bg-gradient-to-br from-indigo-500/10 to-white/5 p-7 shadow-xl">
              {/* Premium tag */}
              <div className="absolute -top-3 right-6 rounded-full border border-indigo-500/25 bg-[#0b1220] px-3 py-1 text-xs text-indigo-200 flex items-center gap-1">
                <Crown className="h-3.5 w-3.5" />
                Recommandé
              </div>

              <div className="flex items-start justify-between">
                <div>
                  <div className="text-white text-lg font-semibold">Premium</div>
                  <div className="mt-1 text-gray-300/80 text-sm">
                    Pour accélérer avec Google Maps + flexibilité totale.
                  </div>
                </div>

                {isPremium && !statusLoading && (
                  <span className="rounded-full bg-emerald-500/15 text-emerald-200 border border-emerald-500/20 px-3 py-1 text-xs">
                    Actif
                  </span>
                )}
              </div>

              <div className="mt-6 flex items-end gap-2">
                <div className="text-4xl font-semibold text-white">79€</div>
                <div className="pb-1 text-gray-300/70">/ mois</div>
              </div>

              <ul className="mt-6 space-y-3 text-sm text-gray-200">
                {[
                  "Tout Essential",
                  "Prospection LinkedIn (15 prospects/jour)",
                  "Prospection Google Maps incluse (10/jour)",
                  "Changement de cibles illimité",
                  "Assistant commercial plus avancé",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 text-indigo-200" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-7 flex flex-col gap-3">
                <button
                  onClick={upgradeToPremium}
                  disabled={loading !== null || isPremium}
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading === "premium" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Redirection…
                    </>
                  ) : isPremium ? (
                    "Vous êtes déjà Premium"
                  ) : (
                    <>
                      Passer à Premium
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>

                <button
                  onClick={openPortal}
                  disabled={loading !== null}
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
          </div>

          {/* Mobile current plan */}
          <div className="sm:hidden rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-gray-300">
            <span className="text-gray-400">Plan actuel :</span>{" "}
            {statusLoading ? "Chargement…" : `${prettyPlan(billing.plan)} · ${prettyStatus(billing.subscription_status)}`}
            {renewalLabel ? <div className="text-gray-500 mt-1">{renewalLabel}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}