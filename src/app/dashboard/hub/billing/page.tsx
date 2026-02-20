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

  // ✅ FIX PRIX ESSENTIAL selon quota
  const essentialPrice = useMemo(() => {
    if (selectedEssentialQuota === 10) return 49;
    if (selectedEssentialQuota === 20) return 69;
    return 89; // 30
  }, [selectedEssentialQuota]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <section className="relative overflow-hidden rounded-[32px] border border-[#dbe7ff] bg-white/90 p-6 shadow-[0_30px_70px_-44px_rgba(59,110,213,0.5)] backdrop-blur-sm sm:p-8">
        <div className="pointer-events-none absolute -top-40 right-[-120px] h-80 w-80 rounded-full bg-[#dbe8ff] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 left-[-100px] h-80 w-80 rounded-full bg-[#e9f2ff] blur-3xl" />

        <div className="relative flex flex-col gap-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#d5e2fb] bg-[#f5f9ff] px-3 py-1 text-[11px] font-medium text-[#395985]">
                <span className="h-2 w-2 rounded-full bg-[#3d74f0]" />
                Espace abonnements
              </div>

              <h1 className="hub-page-title mt-4">
                Facturation & abonnement
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-[#61789f] sm:text-base">
                Choisissez votre rythme de prospection. Upgrade, downgrade ou
                annulation à tout moment.
              </p>

              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-[#d4e2fc] bg-white px-3 py-1 text-[#49648e]">
                  <span className="text-[#6f87ae]">Statut :</span>{" "}
                  {statusLoading ? "Chargement…" : prettyStatus(billing.subscription_status)}
                  {(isActive || isTrial) && currentPaceLabel !== "—" ? (
                    <span className="text-[#6f87ae]"> · {currentPaceLabel}</span>
                  ) : null}
                </span>

                {renewalLabel ? (
                  <span className="rounded-full border border-[#d4e2fc] bg-white px-3 py-1 text-[#5f779f]">
                    {renewalLabel}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="hidden items-center gap-3 rounded-2xl border border-[#d8e5fd] bg-[#f8fbff] px-4 py-3 sm:flex">
              <ShieldCheck className="h-4 w-4 text-[#3866a2]" />
              <div className="text-xs">
                <div className="text-[#6c84aa]">Plan actuel</div>
                <div className="font-semibold text-[#173963]">
                  {statusLoading ? "Chargement…" : prettyPlan(billing.plan)}
                  <span className="font-normal text-[#7590b6]"> · </span>
                  <span className="font-normal text-[#5a739b]">
                    {statusLoading ? "…" : prettyStatus(billing.subscription_status)}
                  </span>
                </div>
                {!statusLoading && currentPaceLabel !== "—" ? (
                  <div className="mt-1 text-[#6f88ae]">{currentPaceLabel}</div>
                ) : null}
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <article className="rounded-[28px] border border-[#d9e6ff] bg-white p-6 shadow-[0_24px_44px_-36px_rgba(56,97,184,0.52)] sm:p-7">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-[#15355f]">Essential</h2>
                  <p className="mt-1 text-sm text-[#5e769c]">
                    Choisissez votre volume : 10, 20 ou 30 prospects par jour.
                  </p>
                </div>

                {isEssential && !statusLoading && (
                  <span className="shrink-0 rounded-full border border-[#b9cff7] bg-[#eef4ff] px-3 py-1 text-xs font-medium text-[#335382]">
                    Plan actuel
                    {currentQuota ? <span> · {currentQuota}/j</span> : null}
                  </span>
                )}
              </div>

              <div className="mt-6 flex items-end gap-2">
                <div className="hub-kpi-number text-4xl">
                  {essentialPrice}€
                </div>
                <div className="pb-1 text-[#6e87ad]">/ mois</div>
              </div>

              <div className="mt-6">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[#748cb2]">
                  Votre rythme
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {essentialQuotaOptions.map((opt) => {
                    const active = selectedEssentialQuota === opt.value;
                    const isCurrent =
                      isEssential && !statusLoading && currentQuota === opt.value;

                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSelectedEssentialQuota(opt.value)}
                        disabled={essentialCtasDisabled}
                        className={[
                          "rounded-2xl border px-3 py-3 text-left transition",
                          "disabled:cursor-not-allowed disabled:opacity-60",
                          active
                            ? "border-[#a6c1f4] bg-[#edf4ff]"
                            : "border-[#d8e5fc] bg-white hover:border-[#c0d4f8] hover:bg-[#f7faff]",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-[#163b67]">
                            {opt.label}
                          </div>
                          {isCurrent ? (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">
                              Actif
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-[#738cb3]">{opt.sub}</div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 text-xs text-[#6b83a9]">
                  {isEssential &&
                  currentQuota &&
                  currentQuota !== selectedEssentialQuota ? (
                    <span>
                      Votre plan actuel est à{" "}
                      <span className="font-medium text-[#264a79]">
                        {currentQuota}/jour
                      </span>
                      . Vous pouvez changer via le checkout ou via le portail
                      Stripe.
                    </span>
                  ) : (
                    <span>Vous pouvez modifier votre rythme à tout moment.</span>
                  )}
                </div>
              </div>

              <ul className="mt-6 space-y-3 text-sm text-[#496288]">
                {[
                  "Prospection LinkedIn",
                  "Tableau de bord centralisé",
                  "Relances & suivi",
                  "Support email",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 text-[#2f65d7]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-7 flex flex-col gap-3">
                <button
                  onClick={startEssentialCheckout}
                  disabled={essentialCtasDisabled}
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#316ded] px-6 py-3 text-sm font-medium text-white transition hover:bg-[#255dd8] disabled:cursor-not-allowed disabled:opacity-60"
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
                  className="inline-flex w-full items-center justify-center rounded-xl border border-[#cdddf8] bg-white px-6 py-3 text-sm font-medium text-[#274676] transition hover:bg-[#f4f8ff] disabled:cursor-not-allowed disabled:opacity-60"
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

                <div className="text-xs text-[#6f88ae]">
                  Paiement sécurisé via Stripe · Sans engagement · Annulable à
                  tout moment
                  {renewalLabel ? <span> · {renewalLabel}</span> : null}
                </div>
              </div>
            </article>

            <article className="relative rounded-[28px] border border-[#cfe0ff] bg-gradient-to-b from-[#f7faff] to-[#f2f7ff] p-6 shadow-[0_24px_44px_-36px_rgba(56,97,184,0.52)] sm:p-7">
              <div className="absolute right-5 top-5 rounded-full border border-[#c4d7fb] bg-white px-3 py-1 text-[11px] font-medium text-[#365787]">
                Offre premium
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="w-full">
                  <h2 className="text-xl font-semibold text-[#15355f]">
                    Full automatisé
                  </h2>

                  <div className="mt-3 rounded-2xl border border-[#d3e2fb] bg-white px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#d8e6ff] bg-[#f5f9ff]">
                        <span className="text-[#2f65d6]">⏱️</span>
                      </div>
                      <div>
                        <div className="font-semibold text-[#1b3f6d]">
                          Gagnez 10h par semaine
                        </div>
                        <div className="text-sm text-[#5f779f]">
                          On fait la prospection, vous récoltez les réponses
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-[#e3edff] pt-4">
                      <div className="text-sm text-[#5a729a]">
                        Prospects contactés
                      </div>
                      <div className="hub-kpi-number text-xl text-[#13335e]">
                        450/mois
                      </div>
                    </div>
                  </div>
                </div>

                {isAutomated && !statusLoading && (
                  <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
                    Actif · 15/j
                  </span>
                )}
              </div>

              <div className="mt-6 flex items-end gap-2">
                <div className="hub-kpi-number text-4xl">
                  199€
                </div>
                <div className="pb-1 text-[#6e87ad]">/ mois</div>
              </div>

              <ul className="mt-6 space-y-3 text-sm text-[#496288]">
                {[
                  "100% automatisé, vous ne faites rien",
                  "Jusqu'à 15 prospects contactés par jour",
                  "Demandes de connexion envoyées pour vous",
                  "Premier message personnalisé automatique",
                  "Relances automatiques si pas de réponse",
                  "Envois aux heures de bureau (comme vous)",
                  "Dashboard de suivi complet",
                  "Sécurisé et conforme LinkedIn",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 text-[#2f65d7]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                <button
                  onClick={openPortal}
                  disabled={portalDisabled}
                  className="inline-flex w-full items-center justify-center rounded-xl border border-[#cdddf8] bg-white px-6 py-3 text-sm font-medium text-[#274676] transition hover:bg-[#f4f8ff] disabled:cursor-not-allowed disabled:opacity-60"
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
            </article>
          </div>

          <div className="rounded-2xl border border-[#d7e5ff] bg-[#f6f9ff] px-4 py-3 text-xs text-[#4f678f] sm:hidden">
            <span className="text-[#6c86ad]">Plan actuel :</span>{" "}
            {statusLoading
              ? "Chargement…"
              : `${prettyPlan(billing.plan)} · ${prettyStatus(billing.subscription_status)}`}
            {currentPaceLabel !== "—" ? <span> · {currentPaceLabel}</span> : null}
            {renewalLabel ? <div className="mt-1 text-[#6982a9]">{renewalLabel}</div> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
