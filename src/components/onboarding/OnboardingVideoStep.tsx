"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  videoUrl: string;
  thumbnailUrl: string;
};

export default function OnboardingVideoStep({ videoUrl, thumbnailUrl }: Props) {
  const router = useRouter();
  const [videoStarted, setVideoStarted] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handlePlay() {
    setVideoStarted(true);
  }

  async function handleComplete() {
    setError(null);
    setCompleting(true);
    try {
      const res = await fetch("/api/onboarding/complete-video", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Erreur lors de la finalisation.");
      }
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau. Réessaie dans 30 secondes.");
      setCompleting(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        {/* Header card */}
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
              Découvrez comment Lidmeo va travailler pour vous
            </h1>
            <p className="mt-2 text-sm text-[#5f779e]">
              Regardez cette vidéo pour comprendre le fonctionnement de votre prospection automatisée.
            </p>

            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between text-xs text-[#5f779e]">
                <span>Progression</span>
                <span>3/3</span>
              </div>
              <div className="h-2 w-full rounded-full bg-[#e6efff]">
                <div className="h-2 rounded-full bg-[#316ded] transition-all" style={{ width: "100%" }} />
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {/* Step indicator */}
        <section className="rounded-3xl border border-[#dbe7ff] bg-white p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[#5f779e]">Étape 3</p>
              <h2 className="mt-1 text-lg font-semibold text-[#102a50]">Présentation</h2>
              <p className="mt-1 text-sm text-[#5f779e]">
                Une courte vidéo pour comprendre comment votre compte va fonctionner dès maintenant.
              </p>
            </div>
            <span className="ml-auto inline-flex shrink-0 items-center rounded-full border border-[#9cc0ff] bg-[#edf4ff] px-2.5 py-1 text-xs font-medium text-[#1f4f96]">
              Active
            </span>
          </div>
        </section>

        {/* Video player */}
        <section className="rounded-3xl border border-[#dbe7ff] bg-white p-5 sm:p-6">
          <div
            className="relative mx-auto w-full overflow-hidden rounded-2xl bg-black"
            style={{ aspectRatio: "16 / 9", maxWidth: "100%" }}
          >
            {videoStarted ? (
              <video
                src={videoUrl}
                className="h-full w-full"
                autoPlay
                controls
                preload="auto"
              />
            ) : (
              <>
                {/* Thumbnail */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbnailUrl}
                  alt="Aperçu de la vidéo"
                  className="h-full w-full object-cover"
                />
                {/* Overlay + play button */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <button
                    type="button"
                    onClick={handlePlay}
                    aria-label="Lancer la vidéo"
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-white/80 shadow-[0_8px_32px_rgba(0,0,0,0.28)] backdrop-blur-sm transition hover:scale-105 hover:bg-white/95 sm:h-20 sm:w-20"
                  >
                    {/* Play triangle */}
                    <svg
                      className="h-7 w-7 translate-x-0.5 text-[#316ded] sm:h-9 sm:w-9"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        {/* CTA + Finish */}
        <section className="rounded-3xl border border-[#dbe7ff] bg-white p-5 sm:p-6">
          <div className="flex flex-col gap-4">
            {/* CTA booking */}
            <a
              href="https://zcal.co/lidmeo/30min"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[#1f5eff] bg-[#316ded] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#245dd9]"
            >
              Réserver mon onboarding avec un expert
            </a>

            {/* Finish button */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={() => void handleComplete()}
                disabled={!videoStarted || completing}
                className={cn(
                  "inline-flex w-full items-center justify-center gap-2 rounded-2xl border px-5 py-3 text-sm font-semibold transition",
                  videoStarted
                    ? "border-[#9cc0ff] bg-[#edf4ff] text-[#1f4f96] hover:bg-[#e4efff]"
                    : "cursor-not-allowed border-[#d7e3f4] bg-[#f8fbff] text-[#8ba0bf]",
                  completing && "opacity-70"
                )}
              >
                {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Accéder au hub
              </button>
              {!videoStarted ? (
                <p className="text-xs text-[#8ba0bf]">Regardez la vidéo pour continuer</p>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
