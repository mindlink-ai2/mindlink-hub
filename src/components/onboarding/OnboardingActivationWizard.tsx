"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight, Linkedin, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type WizardStatus = {
  state: "created" | "linkedin_connected" | "completed" | null;
  linkedinConnected: boolean;
  completed: boolean;
};

type OnboardingActivationWizardProps = {
  initialStatus: WizardStatus;
};

export default function OnboardingActivationWizard({
  initialStatus,
}: OnboardingActivationWizardProps) {
  const router = useRouter();
  const [status, setStatus] = useState<WizardStatus>(initialStatus);
  const [step, setStep] = useState<1 | 2>(
    initialStatus.linkedinConnected || initialStatus.state === "linkedin_connected" ? 2 : 1
  );
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLinkedinConnected = useMemo(
    () =>
      status.linkedinConnected ||
      status.state === "linkedin_connected" ||
      status.state === "completed",
    [status]
  );

  const refreshStatus = useCallback(
    async (silent = false) => {
      if (!silent) setLoadingStatus(true);
      try {
        const res = await fetch("/api/onboarding/status", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error ?? "Impossible de vérifier le statut onboarding.");
        }

        const nextStatus: WizardStatus = {
          state:
            data?.state === "created" ||
            data?.state === "linkedin_connected" ||
            data?.state === "completed"
              ? data.state
              : null,
          linkedinConnected: Boolean(data?.linkedinConnected),
          completed: Boolean(data?.completed),
        };
        setStatus(nextStatus);

        if (!nextStatus.state || nextStatus.completed || nextStatus.state === "completed") {
          router.replace("/dashboard");
          return;
        }

        if (nextStatus.linkedinConnected || nextStatus.state === "linkedin_connected") {
          setStep(2);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur de chargement.");
      } finally {
        if (!silent) setLoadingStatus(false);
      }
    },
    [router]
  );

  const refreshLinkedinStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/onboarding/linkedin-status", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      if (data?.connected === true) {
        setStatus((prev) => ({
          ...prev,
          state: prev.state === "completed" ? "completed" : "linkedin_connected",
          linkedinConnected: true,
        }));
        setStep(2);
      }
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    void refreshStatus(true);
  }, [refreshStatus]);

  useEffect(() => {
    if (isLinkedinConnected) return;
    const intervalId = window.setInterval(() => {
      void refreshLinkedinStatus();
    }, 2500);

    return () => window.clearInterval(intervalId);
  }, [isLinkedinConnected, refreshLinkedinStatus]);

  const handleConnectLinkedin = async () => {
    setConnecting(true);
    setError(null);
    try {
      const res = await fetch("/api/unipile/connect?returnTo=/onboarding", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        throw new Error(data?.error ?? "Impossible de lancer la connexion LinkedIn.");
      }
      window.location.href = String(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de connexion LinkedIn.");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <section className="relative overflow-hidden rounded-3xl border border-[#dbe7ff] bg-white p-6 shadow-[0_26px_62px_-38px_rgba(54,101,196,0.55)] sm:p-8">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-32 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-[#d9e7ff]/70 via-[#edf4ff]/45 to-[#dbe8ff]/70 blur-3xl" />
          </div>

          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d2e1fb] bg-[#f5f9ff] px-3 py-1 text-[11px] text-[#3d5d8c]">
              <Sparkles className="h-3.5 w-3.5" />
              Activation du compte
            </div>

            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-[#102a50] sm:text-3xl">
              Finalisons votre démarrage en 2 étapes
            </h1>
            <p className="mt-2 text-sm text-[#5f779e]">
              Connectez LinkedIn, puis complétez votre questionnaire onboarding.
            </p>

            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between text-xs text-[#5f779e]">
                <span>Progression</span>
                <span>{step}/2</span>
              </div>
              <div className="h-2 w-full rounded-full bg-[#e6efff]">
                <div
                  className="h-2 rounded-full bg-[#316ded] transition-all"
                  style={{ width: `${step === 1 ? 50 : 100}%` }}
                />
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <section className="space-y-4 rounded-3xl border border-[#dbe7ff] bg-white p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[#5f779e]">Étape 1</p>
              <h2 className="mt-1 text-lg font-semibold text-[#102a50]">Connexion LinkedIn</h2>
              <p className="mt-1 text-sm text-[#5f779e]">
                Autorisez votre compte LinkedIn pour activer l’expérience Hub.
              </p>
            </div>
            {isLinkedinConnected ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Connexion réussie
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                En attente
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleConnectLinkedin()}
              disabled={connecting}
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl border border-[#1f5eff] bg-[#316ded] px-4 py-2.5 text-sm font-semibold text-white transition",
                "hover:bg-[#245dd9]",
                connecting && "cursor-not-allowed opacity-70"
              )}
            >
              {connecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Linkedin className="h-4 w-4" />
              )}
              Connecter LinkedIn
            </button>

            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!isLinkedinConnected}
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition",
                isLinkedinConnected
                  ? "border-[#9cc0ff] bg-[#edf4ff] text-[#1f4f96] hover:bg-[#e4efff]"
                  : "cursor-not-allowed border-[#d7e3f4] bg-[#f8fbff] text-[#8ba0bf]"
              )}
            >
              Étape suivante
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {!isLinkedinConnected ? (
            <p className="text-xs text-[#6f84a6]">
              Nous vérifions automatiquement la connexion dès votre retour sur cette page.
            </p>
          ) : null}
        </section>

        <section
          className={cn(
            "space-y-4 rounded-3xl border p-5 sm:p-6",
            step === 2
              ? "border-[#dbe7ff] bg-white"
              : "border-[#e4ebf7] bg-[#f8fbff]"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[#5f779e]">Étape 2</p>
              <h2 className="mt-1 text-lg font-semibold text-[#102a50]">
                Questionnaire onboarding
              </h2>
              <p className="mt-1 text-sm text-[#5f779e]">
                Complétez le formulaire existant pour finaliser votre activation.
              </p>
            </div>
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
                step === 2
                  ? "border-[#9cc0ff] bg-[#edf4ff] text-[#1f4f96]"
                  : "border-[#d7e3f4] bg-white text-[#6f84a6]"
              )}
            >
              {step === 2 ? "Active" : "Verrouillée"}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/onboarding/form")}
              disabled={!isLinkedinConnected || loadingStatus}
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition",
                isLinkedinConnected
                  ? "border-[#1f5eff] bg-[#316ded] text-white hover:bg-[#245dd9]"
                  : "cursor-not-allowed border-[#d7e3f4] bg-white text-[#8ba0bf]"
              )}
            >
              {loadingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Aller au questionnaire
            </button>

            <button
              type="button"
              onClick={() => void refreshStatus()}
              className="rounded-2xl border border-[#d7e3f4] bg-white px-4 py-2.5 text-sm font-medium text-[#51627b] transition hover:bg-[#f3f8ff]"
            >
              Rafraîchir le statut
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
