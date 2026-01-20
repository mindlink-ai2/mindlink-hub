"use client";

import Link from "next/link";
import { SignedIn, SignedOut, useUser } from "@clerk/nextjs";

export default function HomePage() {
  const { user } = useUser();
  const firstName = user?.firstName || user?.username || "";

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] items-start">
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
              Votre cockpit{" "}
              <span className="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">
                Lidmeo Hub
              </span>
            </h1>

            <p className="text-sm md:text-base text-slate-300 max-w-xl">
              Suivez vos automatisations, vos résultats et vos intégrations au même endroit.
              Lidmeo travaille en arrière-plan — vous gardez juste le contrôle.
            </p>
          </div>

          {/* 3 bénéfices (scannable) */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
              <p className="text-xs text-slate-400">⚡ Prospection</p>
              <p className="mt-1 text-sm font-medium text-slate-100">
                Des leads générés sans effort
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Ciblage + extraction + suivi centralisé.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
              <p className="text-xs text-slate-400">📩 Emails</p>
              <p className="mt-1 text-sm font-medium text-slate-100">
                Boîte allégée, réponses plus rapides
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Tri, priorités, relances, suivi.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
              <p className="text-xs text-slate-400">🔁 Relances</p>
              <p className="mt-1 text-sm font-medium text-slate-100">
                Aucun lead oublié
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Relances prêtes et calendrier clair.
              </p>
            </div>
          </div>

          {/* CTA */}
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
              href="https://lidmeo.com"
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs md:text-sm text-slate-200 hover:bg-slate-800 transition"
            >
              Découvrir Lidmeo
            </a>
          </div>

          <p className="text-[11px] text-slate-500">
            Vous êtes déjà client et vous n’avez pas vos accès ?{" "}
            <span className="text-sky-400">
              Créez votre compte avec votre email pro ou contactez votre référent Lidmeo.
            </span>
          </p>
        </SignedOut>

        {/* 🔒 VERSION CONNECTÉE */}
        <SignedIn>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Connecté • Lidmeo Hub actif
          </div>

          <div className="space-y-2">
            {firstName && (
              <p className="text-xs text-slate-400">
                Bonjour <span className="font-medium text-slate-100">{firstName}</span> 👋
              </p>
            )}

            <h1 className="text-3xl md:text-4xl font-semibold leading-tight">
              Votre espace{" "}
              <span className="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">
                Lidmeo Hub
              </span>
            </h1>

            <p className="text-sm md:text-base text-slate-300 max-w-xl">
              Un endroit unique pour piloter ce que Lidmeo automatise pour vous.
              Objectif : moins d’opérations, plus d’opportunités.
            </p>
          </div>

          {/* NEXT BEST ACTION */}
          <NextBestAction />

          {/* Checklist onboarding */}
          <OnboardingChecklist />

          {/* CTAs (1 primaire + 2 secondaires) */}
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/dashboard"
              className="rounded-xl bg-sky-500 px-4 py-2 text-xs md:text-sm font-medium text-slate-950 hover:bg-sky-400 transition shadow-lg shadow-sky-500/30"
            >
              Voir mes résultats
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

          {/* Signature value */}
          <p className="text-[12px] text-slate-400 pt-2">
            <span className="text-slate-200 font-medium">
              Pendant que vous lisez ceci, Lidmeo prospecte pour vous.
            </span>
          </p>
        </SignedIn>
      </section>

      {/* =============================== */}
      {/* COLONNE DROITE */}
      {/* =============================== */}
      <SignedOut>
        <ExampleCard mode="signedOut" />
      </SignedOut>

      <SignedIn>
        <ExampleCard mode="signedIn" />
      </SignedIn>
    </div>
  );
}

/* ========================= */
/* COMPONENTS */
/* ========================= */

function NextBestAction() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 md:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-slate-400">Action recommandée aujourd’hui</p>
          <p className="mt-1 text-sm md:text-base font-semibold text-slate-100">
            Lancez (ou vérifiez) votre prospection automatique
          </p>
          <p className="mt-1 text-xs md:text-sm text-slate-400 max-w-xl">
            2 minutes : cible, message et volume. Ensuite Lidmeo tourne en arrière-plan.
          </p>
        </div>

        <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] text-emerald-200">
          Impact immédiat
        </span>
      </div>

      <div className="flex flex-wrap gap-3 pt-4">
        <Link
          href="/dashboard/prospection"
          className="rounded-xl bg-emerald-500 px-4 py-2 text-xs md:text-sm font-medium text-slate-950 hover:bg-emerald-400 transition shadow-lg shadow-emerald-500/20"
        >
          Configurer / Lancer la prospection
        </Link>

        <Link
          href="/dashboard"
          className="rounded-xl border border-slate-700 bg-slate-900/40 px-4 py-2 text-xs md:text-sm font-medium text-slate-200 hover:bg-slate-900 transition"
        >
          Voir le dashboard
        </Link>
      </div>
    </div>
  );
}

function OnboardingChecklist() {
  // Version statique (sans backend). Quand vous brancherez les vraies datas,
  // il suffira de remplacer "done" par vos flags réels.
  const items = [
    { label: "Définir votre cible", hint: "Secteur, zone, mots-clés", done: true },
    { label: "Valider votre message", hint: "Accroche + CTA", done: false },
    { label: "Lancer la première séquence", hint: "Volume + rythme", done: false },
    { label: "Suivre les réponses", hint: "Relances & pipeline", done: false },
  ];

  const doneCount = items.filter((i) => i.done).length;
  const percent = Math.round((doneCount / items.length) * 100);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 md:p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-slate-400">Mise en route</p>
          <p className="mt-1 text-sm font-semibold text-slate-100">
            Checklist d’activation
          </p>
        </div>

        <span className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-[11px] text-slate-200">
          {percent}% complété
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {items.map((it, idx) => (
          <div
            key={idx}
            className="flex items-start justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950/20 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-xs text-slate-200">
                {it.done ? "✅" : "⬜️"} <span className="font-medium">{it.label}</span>
              </p>
              <p className="text-[11px] text-slate-400">{it.hint}</p>
            </div>

            {!it.done && (
              <Link
                href="/dashboard/prospection"
                className="shrink-0 text-[11px] text-sky-300 hover:text-sky-200 transition"
              >
                Ouvrir →
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* COMPONENT : CARTE DROITE */
function ExampleCard({ mode }: { mode: "signedOut" | "signedIn" }) {
  const title =
    mode === "signedIn" ? "Aperçu de votre compte" : "Aperçu (exemple)";

  const subtitle =
    mode === "signedIn" ? "Compte actif · Version bêta" : "Agence démo · Bêta";

  return (
    <aside className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 md:p-5 shadow-[0_0_40px_rgba(15,23,42,0.9)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-xs text-slate-400">{title}</p>
          <p className="text-sm font-medium text-slate-100">{subtitle}</p>

          <p className="mt-1 text-[11px] text-slate-500">
            {mode === "signedIn"
              ? "Vos données remonteront automatiquement au fur et à mesure."
              : "Exemple : vos chiffres seront automatiquement remontés."}
          </p>
        </div>

        <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] text-emerald-200 border border-emerald-500/30">
          10h / semaine gagnées
        </span>
      </div>

      {/* Stats (actionnables) */}
      <div className="grid grid-cols-3 gap-3 text-xs">
        <StatCard
          label="Prospection"
          value="+37"
          sub="leads cette semaine"
          href="/dashboard/prospection"
        />
        <StatCard
          label="Emails traités"
          value="124"
          sub="boîte allégée"
          href="/dashboard"
        />
        <StatCard
          label="Contenus créés"
          value="9"
          sub="posts programmés"
          href="/dashboard"
        />
      </div>

      {/* Feed valeur */}
      <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/20 p-3">
        <p className="text-[11px] text-slate-400">🤖 Lidmeo a fait pour vous</p>
        <ul className="mt-2 space-y-1 text-[12px] text-slate-200">
          <li className="flex items-center justify-between gap-3">
            <span className="text-slate-300">12 nouveaux leads détectés</span>
            <span className="text-[11px] text-slate-500">aujourd’hui</span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span className="text-slate-300">4 relances prêtes à envoyer</span>
            <span className="text-[11px] text-slate-500">aujourd’hui</span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span className="text-slate-300">2 réponses positives repérées</span>
            <span className="text-[11px] text-slate-500">cette semaine</span>
          </li>
        </ul>

        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/dashboard/prospection"
            className="rounded-xl bg-slate-900/60 border border-slate-700 px-3 py-1 text-[11px] text-slate-200 hover:bg-slate-900 transition"
          >
            Voir les leads →
          </Link>
          <Link
            href="/dashboard/followups"
            className="rounded-xl bg-slate-900/60 border border-slate-700 px-3 py-1 text-[11px] text-slate-200 hover:bg-slate-900 transition"
          >
            Ouvrir les relances →
          </Link>
        </div>
      </div>

      {/* Integrations */}
      <div className="mt-4 space-y-2">
        <p className="text-[11px] text-slate-400">Intégrations prévues</p>
        <div className="flex flex-wrap gap-2">
          <Pill>HubSpot · CRM</Pill>
          <Pill>Gmail · Emails clients</Pill>
          <Pill>Notion · Suivi interne</Pill>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 border-t border-slate-800 pt-3 flex items-center justify-between">
        <p className="text-[11px] text-slate-500 max-w-[70%]">
          {mode === "signedIn"
            ? "Astuce : cliquez sur une statistique pour accéder directement à la section."
            : "Astuce : une fois connecté, vous accédez à vos stats et vos actions."}
        </p>
        <span className="text-[11px] text-slate-400">v0.2 · Hub UX</span>
      </div>
    </aside>
  );
}

function StatCard({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: string;
  sub: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-slate-800 bg-slate-900/60 p-3 hover:bg-slate-900 transition"
    >
      <p className="text-[11px] text-slate-400 group-hover:text-slate-300 transition">
        {label}
      </p>
      <p className="text-lg font-semibold text-slate-50">{value}</p>
      <p className="text-[11px] text-emerald-400 mt-1">{sub}</p>
      <p className="mt-2 text-[11px] text-sky-300 opacity-0 group-hover:opacity-100 transition">
        Ouvrir →
      </p>
    </Link>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-slate-900/70 border border-slate-700 px-3 py-1 text-[11px] text-slate-200">
      {children}
    </span>
  );
}