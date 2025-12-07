"use client";

import Link from "next/link";
import { SignedIn, SignedOut, useUser } from "@clerk/nextjs";

export default function HomePage() {
  const { user } = useUser();
  const firstName = user?.firstName || user?.username || "";

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start">

      {/* ======================= */}
      {/* COLONNE GAUCHE */}
      {/* ======================= */}
      <section className="space-y-6">

        {/* 🔓 VERSION NON CONNECTÉE */}
        <SignedOut>
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs text-sky-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Espace client sécurisé • Accès réservé
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl md:text-4xl font-semibold leading-tight">
              Bienvenue sur{" "}
              <span className="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">
                Mindlink Hub
              </span>
              .
            </h1>
            <p className="text-sm md:text-base text-slate-300 max-w-xl">
              Centralisez vos automatisations, vos intégrations et vos performances.
              Un seul espace pour suivre ce que Mindlink fait tourner pour votre entreprise,
              en arrière-plan.
            </p>
          </div>

          <div className="grid gap-3 text-xs md:text-sm">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-5 w-5 rounded-full border border-sky-500/40 flex items-center justify-center text-[10px] text-sky-300">
                1
              </div>
              <div>
                <p className="font-medium text-slate-100">Connectez-vous à votre espace sécurisé</p>
                <p className="text-slate-400">
                  L’accès se fait via un compte personnel (email), avec authentification moderne et sécurisée.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-5 w-5 rounded-full border border-sky-500/40 flex items-center justify-center text-[10px] text-sky-300">
                2
              </div>
              <div>
                <p className="font-medium text-slate-100">Visualisez votre dashboard en temps réel</p>
                <p className="text-slate-400">
                  Votre dashboard intégré vous affiche automatiquement vos chiffres, vos leads,
                  vos tâches, et tout ce qui compte pour piloter votre activité.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-5 w-5 rounded-full border border-sky-500/40 flex items-center justify-center text-[10px] text-sky-300">
                3
              </div>
              <div>
                <p className="font-medium text-slate-100">Accédez à toutes vos données en un clic</p>
                <p className="text-slate-400">
                  Retrouvez instantanément tous vos leads, vos automatisations et votre profil.
                </p>
              </div>
            </div>
          </div>

          {/* Boutons déconnecté */}
          <div className="flex flex-wrap gap-3 pt-2">
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
              href="https://mind-link.fr"
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs md:text-sm text-slate-200 hover:bg-slate-800 transition"
            >
              Découvrir Mindlink
            </a>
          </div>

          <p className="text-[11px] text-slate-500">
            Vous êtes client Mindlink et vous n’avez pas encore reçu vos accès ?{" "}
            <span className="text-sky-400">Contactez votre référent Mindlink.</span>
          </p>
        </SignedOut>


        {/* 🔒 VERSION CONNECTÉE */}
        <SignedIn>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Vous êtes connecté à Mindlink Hub
          </div>

          {firstName && (
            <p className="text-xs text-slate-400">
              Bonjour <span className="font-medium text-slate-100">{firstName}</span> 👋
            </p>
          )}

          <h1 className="text-3xl md:text-4xl font-semibold leading-tight">
            Bienvenue sur votre espace{" "}
            <span className="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">
              Mindlink Hub
            </span>{" "}
            ⚡️
          </h1>

          <div className="space-y-4 text-sm md:text-base text-slate-300 max-w-xl">
            <p>Vous êtes ici chez vous. Cet espace vous offre une vision claire et instantanée de tout ce que Mindlink automatise pour vous.</p>

            <p>Chaque jour, vos automatisations vous font gagner du temps sur :</p>

            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Votre prospection</li>
              <li>Votre gestion d’emails</li>
            </ul>

            <p>Suivez vos résultats, vos connexions et vos automatisations en un endroit unique.</p>

            <div className="space-y-1 pt-2">
              <p className="text-slate-200">Avancez plus vite.</p>
              <p className="text-slate-200">Restez concentré sur l’essentiel.</p>
              <p className="text-slate-200"><span className="font-semibold">Mindlink</span> s’occupe du reste.</p>
            </div>
          </div>

          {/* Boutons connecté — AJOUT bouton Relances */}
          <div className="flex flex-wrap gap-3 pt-4">
            <Link
              href="/dashboard"
              className="rounded-xl bg-sky-500 px-4 py-2 text-xs md:text-sm font-medium text-slate-950 hover:bg-sky-400 transition shadow-lg shadow-sky-500/30"
            >
              Accéder à votre dashboard
            </Link>

            <Link
              href="/dashboard/prospection"
              className="rounded-xl border border-[#0033FF] px-4 py-2 text-xs md:text-sm font-medium text-[#6FA3FF] hover:border-[#4D7DFF] hover:text-white transition shadow-[0_0_0px_0px_rgba(0,51,255,0)] hover:shadow-[0_0_8px_2px_rgba(0,51,255,0.4)] active:shadow-[0_0_10px_3px_rgba(0,51,255,0.5)]"
            >
              Accéder à la prospection
            </Link>

            {/* ⭐ AJOUT : Bouton Relances */}
            <Link
              href="/dashboard/followups"
              className="rounded-xl border border-emerald-500/40 px-4 py-2 text-xs md:text-sm font-medium text-emerald-300 hover:border-emerald-400 hover:text-white transition shadow-[0_0_0px_0px_rgba(16,185,129,0)] hover:shadow-[0_0_8px_2px_rgba(16,185,129,0.4)] active:shadow-[0_0_10px_3px_rgba(16,185,129,0.5)]"
            >
              Voir les relances
            </Link>
          </div>
        </SignedIn>
      </section>

      {/* =============================== */}
      {/* COLONNE DROITE */}
      {/* =============================== */}

      <SignedOut>
        <ExampleCard />
      </SignedOut>

      <SignedIn>
        <ExampleCard />
      </SignedIn>

    </div>
  );
}


/* COMPONENT : BLOCK D’EXEMPLE */
function ExampleCard() {
  return (
    <aside className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 md:p-5 shadow-[0_0_40px_rgba(15,23,42,0.9)]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-slate-400">Aperçu du compte</p>
          <p className="text-sm font-medium text-slate-100">
            Agence démo · Bêta
          </p>
        </div>
        <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] text-emerald-300 border border-emerald-500/30">
          10h / semaine gagnées
        </span>
      </div>

      <div className="space-y-3 text-xs">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <p className="text-[11px] text-slate-400">Prospection</p>
            <p className="text-lg font-semibold text-slate-50">+37</p>
            <p className="text-[11px] text-emerald-400 mt-1">leads cette semaine</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <p className="text-[11px] text-slate-400">Emails traités</p>
            <p className="text-lg font-semibold text-slate-50">124</p>
            <p className="text-[11px] text-emerald-400 mt-1">boîte allégée</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <p className="text-[11px] text-slate-400">Contenus créés</p>
            <p className="text-lg font-semibold text-slate-50">9</p>
            <p className="text-[11px] text-emerald-400 mt-1">posts programmés</p>
          </div>
        </div>

        <div className="mt-1 space-y-2">
          <p className="text-[11px] text-slate-400">Intégrations prévues</p>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-900/70 border border-slate-700 px-3 py-1 text-[11px]">
              HubSpot · CRM
            </span>
            <span className="rounded-full bg-slate-900/70 border border-slate-700 px-3 py-1 text-[11px]">
              Gmail · Emails clients
            </span>
            <span className="rounded-full bg-slate-900/70 border border-slate-700 px-3 py-1 text-[11px]">
              Notion · Suivi interne
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-slate-800 pt-3 flex items-center justify-between">
        <p className="text-[11px] text-slate-500 max-w-[70%]">
          Cet aperçu est un exemple. À terme, vos chiffres seront automatiquement remontés.
        </p>
        <span className="text-[11px] text-slate-400">v0.1 · Pré-Hub</span>
      </div>
    </aside>
  );
}