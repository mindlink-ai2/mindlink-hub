"use client";

import { useEffect } from "react";
import Link from "next/link";
import { SignedIn, SignedOut, useUser } from "@clerk/nextjs";

export default function HomePage() {
  const { user } = useUser();
  const firstName = user?.firstName || user?.username || "";

  useEffect(() => {
    if (!user) return;

    fetch("/api/link-clerk-user", {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  }, [user]);

  return (
    <div className="grid min-h-[78vh] items-start gap-8 md:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] md:items-center">
      {/* ======================= */}
      {/* COLONNE GAUCHE */}
      {/* ======================= */}
      <section className="space-y-7">
        {/* 🔓 VERSION NON CONNECTÉE */}
        <SignedOut>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#d4e1ff] bg-white px-4 py-1.5 text-xs font-medium text-[#3a5686] shadow-sm">
            <span className="h-2 w-2 rounded-full bg-[#3f79ff]" />
            Espace client sécurisé • Accès réservé
          </div>

          <div className="space-y-4">
            <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.06] tracking-tight text-[#0a1d3d] md:text-6xl">
              Pilotez votre
              <span className="block bg-gradient-to-r from-[#2f6df0] via-[#356ee5] to-[#5f89ef] bg-clip-text text-transparent">
                prospection Lidmeo
              </span>
            </h1>

            <p className="max-w-2xl text-base leading-relaxed text-[#4f648d]">
              Votre espace client pour retrouver au même endroit votre prospection,
              vos relances et l’accès à vos écrans de suivi. Un Hub simple, clair,
              pensé pour piloter ce que Lidmeo automatise pour vous.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              href="/sign-in"
              className="rounded-full bg-[#2f6df0] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#235fdc] shadow-lg shadow-[#2f6df0]/25"
            >
              Se connecter
            </Link>

            <Link
              href="/sign-up"
              className="rounded-full border border-[#cfdcf8] bg-white px-6 py-3 text-sm font-semibold text-[#1d3a67] transition hover:border-[#adc4f4] hover:bg-[#f4f8ff]"
            >
              Créer un compte
            </Link>

            <a
              href="https://lidmeo.com"
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-[#d4def2] bg-white/70 px-6 py-3 text-sm font-semibold text-[#415b85] transition hover:bg-white"
            >
              Découvrir Lidmeo
            </a>
          </div>

          <p className="text-[12px] text-[#6a7fa3]">
            Déjà client Lidmeo ? Créez votre compte avec votre email pro ou contactez
            votre référent si vous n’avez pas reçu vos accès.
          </p>
        </SignedOut>

        {/* 🔒 VERSION CONNECTÉE */}
        <SignedIn>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-500/10 px-4 py-1.5 text-xs font-medium text-emerald-800">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Connecté • Lidmeo Hub actif
          </div>

          {firstName && (
            <p className="text-sm text-[#4f648d]">
              Bonjour <span className="font-semibold text-[#112e57]">{firstName}</span> 👋
            </p>
          )}

          <div className="space-y-4">
            <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.06] tracking-tight text-[#0a1d3d] md:text-6xl">
              Votre espace
              <span className="block bg-gradient-to-r from-[#2f6df0] via-[#356ee5] to-[#5f89ef] bg-clip-text text-transparent">
                Lidmeo Hub
              </span>
            </h1>

            <p className="max-w-2xl text-base leading-relaxed text-[#4f648d]">
              Ici, vous retrouvez tout ce qui compte pour piloter votre activité avec Lidmeo :
              prospection, relances, et accès rapide à vos écrans de suivi. Simple, sans bruit.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              href="/dashboard"
              className="rounded-full bg-[#2f6df0] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#235fdc] shadow-lg shadow-[#2f6df0]/25"
            >
              Accéder au dashboard
            </Link>

            <Link
              href="/dashboard/prospection"
              className="rounded-full border border-[#cfdcf8] bg-white px-6 py-3 text-sm font-semibold text-[#1d3a67] transition hover:border-[#adc4f4] hover:bg-[#f4f8ff]"
            >
              Prospection
            </Link>

            <Link
              href="/dashboard/followups"
              className="rounded-full border border-[#cfdcf8] bg-white px-6 py-3 text-sm font-semibold text-[#1d3a67] transition hover:border-[#adc4f4] hover:bg-[#f4f8ff]"
            >
              Relances
            </Link>
          </div>

          <p className="text-[13px] text-[#667da4]">
            Astuce : commencez par <span className="text-[#14325f] font-semibold">Prospection</span> si vous
            souhaitez lancer votre acquisition, ou par{" "}
            <span className="text-[#14325f] font-semibold">Relances</span> si vous souhaitez gérer votre suivi.
          </p>
        </SignedIn>
      </section>

      {/* =============================== */}
      {/* COLONNE DROITE : CARTE EXPLICATIVE */}
      {/* =============================== */}
      <aside className="rounded-[28px] border border-[#d7e4ff] bg-white/85 p-5 md:p-6 shadow-[0_24px_50px_-34px_rgba(60,105,210,0.55)] backdrop-blur-sm">
        <p className="text-xs uppercase tracking-[0.12em] text-[#6f86ad]">À quoi sert le Hub ?</p>
        <p className="mt-2 text-sm font-semibold text-[#0f2750]">
          Un seul endroit pour piloter Lidmeo
        </p>

        <div className="mt-4 space-y-3">
          <FeatureRow
            title="Prospection"
            desc="Accéder à vos écrans de prospection : ciblage, messages et suivi des actions."
          />
          <FeatureRow
            title="Relances"
            desc="Retrouver vos relances à traiter et garder un suivi simple de vos actions."
          />
          <FeatureRow
            title="Dashboard"
            desc="Avoir une vue d’ensemble et naviguer rapidement vers les sections utiles."
          />
        </div>

        <div className="mt-5 rounded-2xl border border-[#dfe8fb] bg-[#f7faff] p-3.5">
          <p className="text-[11px] uppercase tracking-[0.08em] text-[#7188ae]">Comment ça marche</p>
          <ol className="mt-2 space-y-2 text-[13px] text-[#4f648d]">
            <li className="flex gap-2">
              <span className="text-[#7a8fb2]">1.</span>
              <span>Vous configurez votre prospection et vos préférences.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-[#7a8fb2]">2.</span>
              <span>Vous accédez à vos leads et à vos relances depuis le Hub.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-[#7a8fb2]">3.</span>
              <span>Vous gardez une vision claire, sans multiplier les outils.</span>
            </li>
          </ol>
        </div>

        <div className="mt-4 border-t border-[#e3ebfc] pt-3">
          <p className="text-[11px] text-[#738ab0]">
            Les fonctionnalités visibles dans votre Hub dépendent des modules activés sur votre compte.
          </p>
        </div>
      </aside>
    </div>
  );
}

function FeatureRow({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-[#dfe8fb] bg-white p-3.5 shadow-sm">
      <p className="text-sm font-semibold text-[#102749]">{title}</p>
      <p className="mt-1 text-[13px] text-[#5c7198]">{desc}</p>
    </div>
  );
}
