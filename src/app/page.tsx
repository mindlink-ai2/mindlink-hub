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
    <div className="grid gap-8 md:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] items-start md:items-center min-h-[70vh]">
      {/* ======================= */}
      {/* COLONNE GAUCHE */}
      {/* ======================= */}
      <section className="space-y-6">
        {/* 🔓 VERSION NON CONNECTÉE */}
        <SignedOut>
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs text-sky-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Espace client sécurisé • Accès réservé
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl md:text-4xl font-semibold leading-tight">
              Bienvenue sur{" "}
              <span className="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">
                Lidmeo Hub
              </span>
              .
            </h1>

            <p className="text-sm md:text-base text-slate-300 max-w-xl">
              Votre espace client pour retrouver au même endroit votre prospection,
              vos relances et l’accès à vos écrans de suivi. Un Hub simple, clair,
              pensé pour piloter ce que Lidmeo automatise pour vous.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              href="/sign-in"
              className="rounded-xl bg-sky-500 px-4 py-2 text-xs md:text-sm font-medium text-slate-950 hover:bg-sky-400 transition shadow-lg shadow-sky-500/30"
            >
              Se connecter
            </Link>

            <Link
              href="/sign-up"
              className="rounded-xl border border-sky-500/60 px-4 py-2 text-xs md:text-sm text-sky-200 hover:bg-slate-900 transition"
            >
              Créer un compte
            </Link>

            <a
              href="https://lidmeo.com"
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs md:text-sm text-slate-200 hover:bg-slate-800 transition"
            >
              Découvrir Lidmeo
            </a>
          </div>

          <p className="text-[11px] text-slate-500">
            Déjà client Lidmeo ? Créez votre compte avec votre email pro ou contactez
            votre référent si vous n’avez pas reçu vos accès.
          </p>
        </SignedOut>

        {/* 🔒 VERSION CONNECTÉE */}
        <SignedIn>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Connecté • Lidmeo Hub actif
          </div>

          {firstName && (
            <p className="text-xs text-slate-400">
              Bonjour <span className="font-medium text-slate-100">{firstName}</span> 👋
            </p>
          )}

          <div className="space-y-3">
            <h1 className="text-3xl md:text-4xl font-semibold leading-tight">
              Votre espace{" "}
              <span className="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">
                Lidmeo Hub
              </span>
            </h1>

            <p className="text-sm md:text-base text-slate-300 max-w-xl">
              Ici, vous retrouvez tout ce qui compte pour piloter votre activité avec Lidmeo :
              prospection, relances, et accès rapide à vos écrans de suivi. Simple, sans bruit.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              href="/dashboard"
              className="rounded-xl bg-sky-500 px-4 py-2 text-xs md:text-sm font-medium text-slate-950 hover:bg-sky-400 transition shadow-lg shadow-sky-500/30"
            >
              Accéder au dashboard
            </Link>

            <Link
              href="/dashboard/prospection"
              className="rounded-xl border border-slate-700 bg-slate-900/40 px-4 py-2 text-xs md:text-sm font-medium text-slate-200 hover:bg-slate-900 transition"
            >
              Prospection
            </Link>

            <Link
              href="/dashboard/followups"
              className="rounded-xl border border-slate-700 bg-slate-900/40 px-4 py-2 text-xs md:text-sm font-medium text-slate-200 hover:bg-slate-900 transition"
            >
              Relances
            </Link>
          </div>

          <p className="text-[12px] text-slate-500">
            Astuce : commencez par <span className="text-slate-200 font-medium">Prospection</span> si vous
            souhaitez lancer votre acquisition, ou par{" "}
            <span className="text-slate-200 font-medium">Relances</span> si vous souhaitez gérer votre suivi.
          </p>
        </SignedIn>
      </section>

      {/* =============================== */}
      {/* COLONNE DROITE : CARTE EXPLICATIVE */}
      {/* =============================== */}
      <aside className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 md:p-5 shadow-[0_0_40px_rgba(15,23,42,0.9)]">
        <p className="text-xs text-slate-400">À quoi sert le Hub ?</p>
        <p className="mt-1 text-sm font-medium text-slate-100">
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

        <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/20 p-3">
          <p className="text-[11px] text-slate-400">Comment ça marche</p>
          <ol className="mt-2 space-y-2 text-[12px] text-slate-300">
            <li className="flex gap-2">
              <span className="text-slate-500">1.</span>
              <span>Vous configurez votre prospection et vos préférences.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-slate-500">2.</span>
              <span>Vous accédez à vos leads et à vos relances depuis le Hub.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-slate-500">3.</span>
              <span>Vous gardez une vision claire, sans multiplier les outils.</span>
            </li>
          </ol>
        </div>

        <div className="mt-4 border-t border-slate-800 pt-3">
          <p className="text-[11px] text-slate-500">
            Les fonctionnalités visibles dans votre Hub dépendent des modules activés sur votre compte.
          </p>
        </div>
      </aside>
    </div>
  );
}

function FeatureRow({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/20 p-3">
      <p className="text-xs font-medium text-slate-100">{title}</p>
      <p className="mt-1 text-[12px] text-slate-400">{desc}</p>
    </div>
  );
}