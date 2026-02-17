"use client";

import { useEffect } from "react";
import { Clock3, Sparkles, Target, X } from "lucide-react";

type OnboardingIntroModalProps = {
  open: boolean;
  onPrimaryAction: () => void;
  onClose: () => void;
};

export default function OnboardingIntroModal({
  open,
  onPrimaryAction,
  onClose,
}: OnboardingIntroModalProps) {
  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center p-4 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Fermer la fenêtre"
        onClick={onClose}
        className="absolute inset-0 bg-[#0c1932]/40 backdrop-blur-[4px] animate-in fade-in duration-200"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-intro-title"
        className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-[#dbe7ff] bg-white shadow-2xl shadow-[#3563b7]/20 animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-300"
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-1/2 h-[420px] w-[640px] -translate-x-1/2 rounded-full bg-gradient-to-r from-[#d3e4ff]/80 via-[#eaf3ff]/60 to-[#d0e1ff]/80 blur-3xl" />
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute right-4 top-4 rounded-full border border-[#d2e0fb] bg-white p-1.5 text-[#647ea8] transition hover:bg-[#f2f7ff] hover:text-[#244878]"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative p-6 sm:p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#c9dbfe] bg-[#edf3ff] px-3 py-1 text-xs text-[#355686]">
            <Sparkles className="h-3.5 w-3.5" />
            Démarrage de votre prospection
          </div>

          <h2
            id="onboarding-intro-title"
            className="mt-4 text-2xl font-semibold tracking-tight text-[#102a50] sm:text-3xl"
          >
            Quelques infos et on lance votre machine à leads
          </h2>

          <p className="mt-3 text-sm leading-relaxed text-[#5f779e]">
            Remplissez ce questionnaire pour démarrer la prospection. Plus vos
            réponses sont précises, plus les leads livrés seront qualifiés.
          </p>

          <div className="mt-5 space-y-3">
            <Feature
              icon={<Target className="h-4 w-4" />}
              text="Vous définissez un ciblage clair pour éviter les prospects hors périmètre."
            />
            <Feature
              icon={<Clock3 className="h-4 w-4" />}
              text="Une fois validé, on configure votre système et vous recevez vos premiers leads dès demain matin selon l’offre choisie."
            />
          </div>

          <button
            type="button"
            onClick={onPrimaryAction}
            className="mt-7 inline-flex w-full items-center justify-center rounded-2xl bg-[#316ded] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#245dd9]"
          >
            Je remplis mon formulaire
          </button>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="rounded-2xl border border-[#d7e4fd] bg-[#f8fbff] p-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-[#3868a5]">{icon}</span>
        <p className="text-sm text-[#5f779e]">{text}</p>
      </div>
    </div>
  );
}
