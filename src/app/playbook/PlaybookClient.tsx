"use client";

import { useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Section =
  | "intro" | "produit" | "icp" | "scripts"
  | "iacoach" | "objections" | "closing"
  | "pricing" | "reporting" | "faq";

type ScenarioKey = "curious" | "how" | "price" | "no";

interface Reply {
  label: string;
  tone: string;
  text: string;
}

// ─── Nav config ──────────────────────────────────────────────────────────────

const NAV = [
  {
    group: "Démarrer",
    items: [
      { key: "intro" as Section, label: "Bienvenue", emoji: "🏠" },
      { key: "produit" as Section, label: "Le produit", emoji: "📦" },
      { key: "icp" as Section, label: "Notre ICP", emoji: "🎯" },
    ],
  },
  {
    group: "Vendre",
    items: [
      { key: "scripts" as Section, label: "Scripts", emoji: "💬" },
      { key: "iacoach" as Section, label: "IA Coach", emoji: "🤖" },
      { key: "objections" as Section, label: "Objections", emoji: "🛡️" },
      { key: "closing" as Section, label: "Quand ça dit oui", emoji: "✅" },
    ],
  },
  {
    group: "Infos",
    items: [
      { key: "pricing" as Section, label: "Prix & commissions", emoji: "💰" },
      { key: "reporting" as Section, label: "Reporting", emoji: "📊" },
      { key: "faq" as Section, label: "FAQ interne", emoji: "❓" },
    ],
  },
];

// ─── Shared micro-components ─────────────────────────────────────────────────

function CopyBtn({ text, variant = "default" }: { text: string; variant?: "default" | "ghost" }) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const t = document.createElement("textarea");
      t.value = text;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy"); // fallback for older browsers
      document.body.removeChild(t);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  if (variant === "ghost")
    return (
      <button
        onClick={handle}
        className={`shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all ${
          copied
            ? "border-emerald-200 bg-emerald-50 text-emerald-600"
            : "border-[#bfdbfe] bg-white/90 text-[#2563eb] hover:bg-white"
        }`}
      >
        {copied ? "✓ Copié !" : "Copier"}
      </button>
    );
  return (
    <button
      onClick={handle}
      className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11.5px] font-semibold transition-all ${
        copied
          ? "border-emerald-200 bg-emerald-50 text-emerald-600"
          : "border-[#bfdbfe] bg-[#eff6ff] text-[#2563eb] hover:bg-[#dbeafe]"
      }`}
    >
      {copied ? "✓ Copié !" : "Copier"}
    </button>
  );
}

function MsgCard({ text, label }: { text: string; label?: string }) {
  return (
    <div className="relative rounded-xl border border-[#bfdbfe] bg-[#eff6ff]">
      {label && (
        <div className="flex items-center justify-between border-b border-[#bfdbfe] px-4 py-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#2563eb]">{label}</span>
          <CopyBtn text={text} variant="ghost" />
        </div>
      )}
      <div className="relative p-4">
        <p className={`text-[13.5px] leading-[1.85] text-[#1e3a8a] whitespace-pre-wrap ${label ? "" : "pr-20"}`}>
          {text}
        </p>
        {!label && (
          <div className="absolute right-3 top-3">
            <CopyBtn text={text} variant="ghost" />
          </div>
        )}
      </div>
    </div>
  );
}

function Callout({
  type,
  icon,
  title,
  children,
}: {
  type: "blue" | "green" | "amber" | "red";
  icon?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const cls = {
    blue: "bg-[#eff6ff] border-[#bfdbfe] text-[#1e40af]",
    green: "bg-emerald-50 border-emerald-200 text-emerald-800",
    amber: "bg-amber-50 border-amber-200 text-amber-900",
    red: "bg-red-50 border-red-200 text-red-800",
  }[type];
  return (
    <div className={`flex gap-3 rounded-xl border p-4 text-[13px] leading-relaxed ${cls}`}>
      {icon && <span className="mt-0.5 shrink-0 text-base">{icon}</span>}
      <div>
        {title && <div className="mb-1 text-[11.5px] font-bold uppercase tracking-wide opacity-70">{title}</div>}
        {children}
      </div>
    </div>
  );
}

function SectionHead({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-xl font-bold tracking-tight text-[#0b1c33]">{title}</h2>
      {desc && <p className="mt-1 text-[13.5px] leading-relaxed text-[#51627b]">{desc}</p>}
    </div>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 mt-7 text-[10.5px] font-bold uppercase tracking-widest text-[#94a3b8]">
      {children}
    </h3>
  );
}

function Tag({ children, color = "default" }: { children: React.ReactNode; color?: "default" | "blue" | "green" | "red" }) {
  const cls = {
    default: "border-[#e2e8f0] bg-white text-[#51627b]",
    blue: "border-[#bfdbfe] bg-[#eff6ff] text-[#2563eb]",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    red: "border-red-200 bg-red-50 text-red-600",
  }[color];
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-medium ${cls}`}>
      {children}
    </span>
  );
}


function Accordion({
  items,
}: {
  items: { q: string; context?: string; a: string }[];
}) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <div
          key={i}
          className={`overflow-hidden rounded-xl border transition-all ${
            open === i ? "border-[#bfdbfe]" : "border-[#e2e8f0]"
          } bg-white`}
        >
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-[#f7faff]"
          >
            <span className={`text-[13.5px] font-semibold ${open === i ? "text-[#2563eb]" : "text-[#0b1c33]"}`}>
              {item.q}
            </span>
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] transition-transform ${
                open === i
                  ? "rotate-180 border-[#2563eb] bg-[#2563eb] text-white"
                  : "border-[#e2e8f0] text-[#94a3b8]"
              }`}
            >
              ▾
            </span>
          </button>
          {open === i && (
            <div className="border-t border-[#e2e8f0] px-4 pb-4 pt-3">
              {item.context && (
                <p className="mb-3 text-[12px] italic text-[#94a3b8]">{item.context}</p>
              )}
              <div className="rounded-xl border-l-[3px] border-[#2563eb] bg-[#f7faff] px-4 py-3 text-[13.5px] leading-[1.85] whitespace-pre-wrap text-[#0b1c33]">
                {item.a}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Section: Bienvenue ──────────────────────────────────────────────────────

function SIntro({ go }: { go: (s: Section) => void }) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#1f5eff] via-[#2563eb] to-[#1254ec] p-8 text-white shadow-[0_20px_40px_-20px_rgba(31,94,255,0.5)]">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white/90">
          Lidmeo · Sales Playbook
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Bienvenue 👋</h1>
        <p className="mt-2 max-w-md text-[14px] leading-relaxed text-white/75">
          Ce doc est là pour t&apos;aider à avoir de bonnes conversations avec les prospects. Garde-le ouvert et navigue selon ce dont tu as besoin.
        </p>
      </div>

      <div className="flex gap-4 rounded-2xl border border-[#e2e8f0] bg-white p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eff6ff]">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M10 2L18 6.5V13.5L10 18L2 13.5V6.5L10 2Z" stroke="#2563EB" strokeWidth="1.6" />
            <circle cx="10" cy="10" r="3" fill="#2563EB" opacity=".7" />
          </svg>
        </div>
        <div>
          <p className="mb-1 text-[13px] font-bold text-[#0b1c33]">C&apos;est quoi Lidmeo ?</p>
          <p className="text-[13px] leading-relaxed text-[#51627b]">
            Lidmeo automatise la prospection LinkedIn pour les fondateurs d&apos;agences. Chaque matin, des messages personnalisés sont envoyés à des prospects qualifiés en leur nom. Le fondateur ne gère que les réponses.
          </p>
        </div>
      </div>

      <div>
        <p className="mb-3 text-[13px] font-bold text-[#0b1c33]">Comment ça marche de ton côté</p>
        <div className="flex flex-col gap-2">
          {[
            { n: "1", title: "Lidmeo envoie le 1er message", desc: "Un message automatique est envoyé à un prospect LinkedIn ciblé. Tu n'as rien à faire à cette étape.", hi: false, success: false },
            { n: "2", title: "Le prospect répond", desc: "La conversation t'est attribuée. C'est là que tu entres en jeu.", hi: false, success: false },
            { n: "3", title: "Tu prends la conversation → ton rôle", desc: "Tu contactes le prospect par message ou appel, tu lui expliques Lidmeo et tu le closes sur l'essai gratuit de 7 jours.", hi: true, success: false },
            { n: "4", title: "Il s'inscrit via ton lien", desc: "L'équipe Lidmeo configure tout à sa place et gère l'onboarding.", hi: false, success: false },
            { n: "5", title: "Ta commission tombe 💰", desc: "Comptabilisée automatiquement dès son inscription, et chaque mois qu'il reste client.", hi: false, success: true },
          ].map((s, i) => (
            <div key={i} className={`flex gap-3 rounded-xl border p-3.5 ${s.hi ? "border-[#bfdbfe] bg-[#eff6ff]" : s.success ? "border-emerald-200 bg-emerald-50" : "border-[#e2e8f0] bg-white"}`}>
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${s.hi ? "border-[#2563eb] bg-[#2563eb] text-white" : s.success ? "border-emerald-400 bg-emerald-500 text-white" : "border-[#e2e8f0] bg-[#f1f5f9] text-[#94a3b8]"}`}>
                {s.n}
              </div>
              <div>
                <p className={`text-[13px] font-semibold ${s.hi ? "text-[#1e3a8a]" : s.success ? "text-emerald-800" : "text-[#0b1c33]"}`}>{s.title}</p>
                <p className={`mt-0.5 text-[12.5px] leading-relaxed ${s.hi ? "text-[#1e40af]" : s.success ? "text-emerald-700" : "text-[#51627b]"}`}>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-[#e2e8f0] bg-white p-4">
          <p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#0b1c33]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#1f5eff]" />Tu fais
          </p>
          <div className="space-y-2">
            {["Contacter le prospect, par message ou appel", "Comprendre sa situation et expliquer Lidmeo", "Le closer sur l'essai gratuit", "Lui envoyer ton lien affilié"].map(t => (
              <div key={t} className="flex gap-2 text-[12.5px] text-[#51627b]">
                <span className="mt-0.5 font-bold text-[#1f5eff]">✓</span>{t}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-[#e2e8f0] bg-white p-4">
          <p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#0b1c33]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#94a3b8]" />Pas ton rôle
          </p>
          <div className="space-y-2">
            {["Envoyer le 1er message", "Choisir les prospects", "Onboarder le client", "Gérer le support technique"].map(t => (
              <div key={t} className="flex gap-2 text-[12.5px] text-[#94a3b8]">
                <span className="mt-0.5">✕</span>{t}
              </div>
            ))}
          </div>
        </div>
      </div>

      <Callout type="blue">
        Pas besoin de convaincre à tout prix. L&apos;essai est gratuit et sans engagement. La plupart des gens qui hésitent ont juste besoin de comprendre, pas d&apos;être poussés.
      </Callout>

      <H3>Dans ce playbook</H3>
      <div className="grid grid-cols-2 gap-3">
        {([
          ["scripts", "💬", "Scripts", "Messages prêts selon la réponse du prospect."],
          ["iacoach", "🤖", "IA Coach", "L'IA génère une réponse sur mesure en 10 secondes."],
          ["objections", "🛡️", "Objections", "Réponses aux hésitations fréquentes."],
          ["pricing", "💰", "Prix & commissions", "Tarifs et commissions récurrentes."],
        ] as const).map(([key, emoji, title, desc]) => (
          <button
            key={key}
            onClick={() => go(key as Section)}
            className="flex gap-3 rounded-xl border border-[#e2e8f0] bg-white p-4 text-left transition hover:border-[#bfdbfe] hover:shadow-sm"
          >
            <span className="text-xl">{emoji}</span>
            <div>
              <p className="text-[13px] font-bold text-[#0b1c33]">{title}</p>
              <p className="mt-0.5 text-[12.5px] text-[#51627b]">{desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Section: Le Produit ─────────────────────────────────────────────────────

function SProduit() {
  return (
    <div className="space-y-4">
      <SectionHead title="Le produit Lidmeo" desc="Lidmeo automatise toute la prospection LinkedIn. Chaque matin du lundi au vendredi, de nouveaux prospects qualifiés reçoivent un message personnalisé au nom du client. Le client ne gère que les réponses." />

      <Callout type="blue" icon="⚡" title="À retenir par cœur">
        Les clients Lidmeo gagnent en moyenne <strong>10h par semaine</strong> et maintiennent un flux régulier de conversations qualifiées, même quand ils sont à 100% sur un projet client.
      </Callout>

      <H3>Les deux offres</H3>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-[#e2e8f0] bg-white p-5">
          <p className="text-[15px] font-bold text-[#0b1c33]">Essential</p>
          <p className="mb-4 mt-0.5 text-[12px] text-[#94a3b8]">Vous envoyez les messages</p>
          <div className="space-y-2 border-t border-[#f1f5f9] pt-3">
            {[["10 prospects/jour", "49€/mois"], ["20 prospects/jour", "69€/mois"], ["30 prospects/jour", "89€/mois"]].map(([v, p]) => (
              <div key={v} className="flex items-center justify-between text-[12.5px]">
                <span className="text-[#51627b]">{v} · lun–ven</span>
                <span className="font-bold text-[#0b1c33]">{p}</span>
              </div>
            ))}
          </div>
          <ul className="mt-4 space-y-1.5">
            {["Profil LinkedIn complet", "Email professionnel vérifié", "Téléphone si disponible", "Dashboard de suivi"].map(f => (
              <li key={f} className="flex items-center gap-2 text-[12.5px] text-[#51627b]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#2563eb]" />{f}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative rounded-2xl border-2 border-[#2563eb] bg-white p-5">
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#2563eb] px-4 py-1 text-[11px] font-bold text-white whitespace-nowrap">⭐ Le plus populaire</span>
          <p className="text-[15px] font-bold text-[#0b1c33]">Full Automatisé</p>
          <p className="mt-0.5 text-[12px] text-[#94a3b8]">On s&apos;occupe de tout</p>
          <p className="mt-3 text-[28px] font-bold tracking-tight text-[#0b1c33]">199€ <span className="text-[14px] font-normal text-[#94a3b8]">/mois</span></p>
          <ul className="mt-4 space-y-1.5">
            {[
              "100% automatisé, vous ne faites rien",
              "Jusqu'à 330 prospects/mois",
              "Demandes de connexion auto",
              "Premier message personnalisé auto",
              "Relances automatiques",
              "Gain estimé : 10h/semaine",
            ].map(f => (
              <li key={f} className="flex items-center gap-2 text-[12.5px] text-[#51627b]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#2563eb]" />{f}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <H3>Ce qu&apos;ils reçoivent concrètement</H3>
      <div className="grid grid-cols-2 gap-3">
        {[
          ["🎯", "Leads qualifiés chaque matin", "Des prospects ciblés selon le secteur d'activité choisi, livrés tous les jours du lundi au vendredi."],
          ["🤝", "Fiche complète de chaque prospect", "Profil LinkedIn, email professionnel vérifié et numéro de téléphone si disponible."],
          ["✍️", "Message prêt à envoyer", "Pour chaque prospect, un message personnalisé est déjà rédigé. Il envoie en un clic."],
          ["💬", "Conversations LinkedIn intégrées", "Les échanges LinkedIn sont directement intégrés dans la plateforme Lidmeo."],
        ].map(([emoji, title, desc]) => (
          <div key={title} className="rounded-xl border border-[#e2e8f0] bg-white p-4">
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#eff6ff] text-base">{emoji}</div>
              <p className="text-[12.5px] font-bold text-[#0b1c33]">{title}</p>
            </div>
            <p className="text-[12px] leading-relaxed text-[#51627b]">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Section: ICP ────────────────────────────────────────────────────────────

function SICP() {
  return (
    <div className="space-y-4">
      <SectionHead title="Notre client idéal (ICP)" />
      <H3>Profil cible</H3>
      <div className="overflow-hidden rounded-xl border border-[#e2e8f0] bg-white">
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-[#f1f5f9] bg-[#f8fafc]">
            <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-[#94a3b8]">Critère</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-[#94a3b8]">Détail</th>
          </tr></thead>
          <tbody>
            {[
              ["Qui", "Fondateur(trice) d'agence digitale B2B"],
              ["Taille", "3 à 12 personnes"],
              ["Type d'agence", "Communication, marketing, dev, SEO, conseil"],
              ["Modèle", "B2B, vend à des entreprises"],
              ["Commercial dédié", "Aucun, c'est le fondateur qui prospecte"],
              ["Niveau LinkedIn", "Actif ou voudrait l'être"],
            ].map(([k, v]) => (
              <tr key={k} className="border-b border-[#f1f5f9] last:border-0 transition hover:bg-[#f7faff]">
                <td className="px-4 py-2.5 text-[#94a3b8]">{k}</td>
                <td className="px-4 py-2.5 font-semibold text-[#0b1c33]">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H3>Leurs douleurs</H3>
      <div className="space-y-2">
        {[
          "Passe des heures chaque semaine à chercher des prospects manuellement sur LinkedIn",
          "Prospection irrégulière : quand il a des clients, il arrête et se retrouve sans pipeline 3 mois plus tard",
          "Pas de scalabilité : impossible de prospecter plus sans embaucher quelqu'un",
          "Messages trop génériques qui ne convertissent pas",
        ].map(p => (
          <div key={p} className="flex gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">!</span>
            <p className="text-[13px] leading-relaxed text-red-800">{p}</p>
          </div>
        ))}
      </div>

      <H3>Ce qui les convainc de tester</H3>
      <div className="space-y-2">
        {[
          ["Gain de temps immédiat", "10h/semaine récupérées"],
          ["Pipeline prévisible", "Des prospects arrivent chaque jour ouvré même pendant les projets"],
          ["Aucun engagement", "Ils testent sans risque"],
          ["Zéro effort technique", "On configure tout à leur place"],
        ].map(([title, desc]) => (
          <div key={title} className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">+</span>
            <p className="text-[13px] leading-relaxed text-emerald-800">
              <strong>{title}</strong> — {desc}
            </p>
          </div>
        ))}
      </div>

      <hr className="border-[#e2e8f0]" />
      <H3>Signaux qu&apos;un prospect est chaud</H3>
      <div className="flex flex-wrap gap-2">
        {["Répond rapidement", "Pose des questions précises", "Dit « j'ai exactement ce problème »", "Compare les deux offres", "Demande le prix", "Parle au présent", "Dit « je vais en parler à mon associé »"].map(t => (
          <Tag key={t} color="blue">{t}</Tag>
        ))}
      </div>
    </div>
  );
}

// ─── Section: Scripts ────────────────────────────────────────────────────────

const SCENARIOS: Record<ScenarioKey, {
  tab: string; emoji: string; sub: string; ctxIcon: string; ctx: string;
  thread: { prospect: string; steps: { label: string; pill: string; pillColor: string; msg: string; goal: string; goalType: string }[]; branches?: { left: { prospect: string; label: string; pill: string; msg: string; goal: string }; right: { prospect: string; label: string; pill: string; msg: string; goal: string } }; close?: string }
}> = {
  curious: {
    tab: '"C\'est quoi exactement ?"', emoji: "💬", sub: "Curieux, veut comprendre",
    ctxIcon: "💡", ctx: "Il n'a pas bien saisi le 1er message. C'est une ouverture, ne pas pitcher tout de suite. Répondre court et retourner une question de qualification.",
    thread: {
      prospect: '"C\'est quoi exactement ?"',
      steps: [{ label: "Tu réponds", pill: "Étape 1", pillColor: "blue", msg: "On s'occupe de ta prospection LinkedIn à ta place. Tu continues de bosser sur tes projets, on envoie des messages à des prospects qui correspondent à ta cible, et toi tu gères uniquement ceux qui répondent.\n\nTu prospectes comment en ce moment ?", goal: "Qualifier avant de pitcher", goalType: "qualify" }],
      branches: {
        left: { prospect: "Il prospecte manuellement", label: "Tu réponds", pill: "Étape 2a", msg: "C'est exactement ce qu'on règle. Au lieu que ce soit toi qui cherches et envoies les messages, on le fait en ton nom tous les matins.\n\nLes agences avec qui on travaille récupèrent facilement 10h par semaine. On a un essai gratuit de 7 jours si tu veux voir ce que ça donne.", goal: "Proposer l'essai" },
        right: { prospect: "Il ne prospecte pas encore", label: "Tu réponds", pill: "Étape 2b", msg: "C'est le bon moment pour démarrer sans avoir à y passer du temps toi-même. On configure tout, tu vois les résultats sur 7 jours, et tu décides après.", goal: "Proposer l'essai" },
      },
      close: "Super, voici ton lien pour démarrer l'essai gratuit de 7 jours : [TON LIEN AFFILIÉ]\n\nOn s'occupe de la configuration de ton côté dès que tu es inscrit.",
    },
  },
  how: {
    tab: '"Comment ça marche ?"', emoji: "⚙️", sub: "Intéressé, veut des détails",
    ctxIcon: "💡", ctx: "Il est intéressé et curieux du fonctionnement. Ne pas tout détailler, répondre en 3 lignes puis qualifier sa cible.",
    thread: {
      prospect: '"Comment ça marche ?"',
      steps: [{ label: "Tu réponds", pill: "Étape 1", pillColor: "blue", msg: "On identifie chaque jour des profils LinkedIn qui correspondent à ta cible, on envoie un message personnalisé en ton nom, et on relance si pas de réponse. Toi tu vois arriver uniquement les gens qui ont répondu.\n\nC'est quoi ta cible en ce moment ? Le type de clients que tu cherches à développer ?", goal: "Qualifier la cible", goalType: "qualify" }],
      branches: {
        left: { prospect: "Il décrit sa cible", label: "Tu réponds", pill: "Étape 2a", msg: "C'est exactement ce qu'on sait cibler. On te configure ça et on lance un essai de 7 jours, tu vois concrètement les profils qu'on t'amène et tu juges par toi-même. Ça te dit ?", goal: "Proposer l'essai" },
        right: { prospect: "Il pose des questions techniques", label: "Tu réponds", pill: "Étape 2b", msg: "Ça passe par ton compte LinkedIn, les messages sont écrits dans ton style donc rien ne ressemble à quelque chose d'automatisé. Le mieux c'est de voir en pratique, un essai de 7 jours et tu vois exactement ce que reçoivent tes prospects.", goal: "Proposer l'essai" },
      },
      close: "Super, voici ton lien pour démarrer l'essai gratuit de 7 jours : [TON LIEN AFFILIÉ]\n\nOn s'occupe de la configuration de ton côté dès que tu es inscrit.",
    },
  },
  price: {
    tab: '"C\'est combien ?"', emoji: "💰", sub: "Signal d'intérêt fort",
    ctxIcon: "🔥", ctx: "Signal d'intérêt fort, il pense déjà à acheter. Donner les prix clairement et proposer l'essai dans le même message.",
    thread: {
      prospect: '"C\'est combien ?"',
      steps: [{ label: "Tu réponds", pill: "Message direct", pillColor: "amber", msg: "Deux formules.\n\nEssential à 49€/mois, on te livre chaque matin des profils qualifiés et c'est toi qui envoies les messages.\n\nFull Automatisé à 199€/mois, on gère tout de bout en bout et tu reçois uniquement les réponses des gens intéressés.\n\nDans les deux cas il y a un essai gratuit de 7 jours. Tu veux qu'on démarre ?", goal: "Closer direct", goalType: "close" }],
      branches: {
        left: { prospect: "Il hésite ou dit « c'est cher »", label: "Tu réponds", pill: "Étape 2a", msg: "C'est pour ça que l'essai existe. Tu vois d'abord ce que ça t'apporte concrètement, et tu décides après. Aucun engagement.", goal: "Lever la friction prix" },
        right: { prospect: "Il ne sait pas quelle formule choisir", label: "Tu réponds", pill: "Étape 2b", msg: "Si tu veux garder la main sur les messages toi-même, prends l'Essential. Si tu veux que tout tourne sans y toucher, le Full Automatisé est fait pour toi.", goal: "Orienter vers la bonne offre" },
      },
      close: "Super, voici ton lien pour démarrer l'essai gratuit de 7 jours : [TON LIEN AFFILIÉ]\n\nOn s'occupe de la configuration de ton côté dès que tu es inscrit.",
    },
  },
  no: {
    tab: '"Pas intéressé"', emoji: "🚫", sub: "Refus ou on gère déjà",
    ctxIcon: "🎯", ctx: "Ne pas lâcher sans poser une question. « On gère déjà » = souvent le fondateur prospecte lui-même.",
    thread: {
      prospect: '"Pas intéressé" / "On gère déjà"',
      steps: [{ label: "Tu réponds", pill: "Étape 1", pillColor: "blue", msg: "Pas de souci. Juste par curiosité, vous faites comment pour développer de nouveaux clients en ce moment ? C'est toi qui t'en occupes ?", goal: "Comprendre avant de lâcher", goalType: "qualify" }],
      branches: {
        left: { prospect: "Il prospecte lui-même", label: "Tu réponds", pill: "Étape 2a", msg: "C'est exactement ce qu'on peut t'enlever. Tu gardes le contrôle sur qui tu cibles mais tu arrêtes d'y passer du temps. Ça vaut le coup de tester 7 jours, on configure tout de notre côté.", goal: "Retourner l'objection" },
        right: { prospect: "Ça marche bien / il a quelqu'un", label: "Tu réponds", pill: "Étape 2b", msg: "Très bien, bonne continuation. Si jamais ça devient un sujet à un moment n'hésite pas à revenir.", goal: "Porte ouverte" },
      },
    },
  },
};

function SScripts() {
  const [scenario, setScenario] = useState<ScenarioKey>("curious");
  const sc = SCENARIOS[scenario];
  const pillCls = { blue: "bg-[#eff6ff] text-[#1d4ed8]", amber: "bg-amber-50 text-amber-700", green: "bg-emerald-50 text-emerald-700" };

  return (
    <div className="space-y-5">
      <SectionHead title="Scripts & arbre de décision" desc="Sélectionne la réponse du prospect pour voir exactement quoi écrire." />

      <div>
        <H3>Message automatique envoyé</H3>
        <MsgCard
          label="Envoyé automatiquement par Lidmeo"
          text={"Bonjour {prénom},\n\nJ'ai vu que tu dirigeais {nom_agence}, du coup je me permets de te contacter directement.\n\nOn travaille avec des fondateurs d'agences digitales pour automatiser leur prospection LinkedIn. Concrètement, pendant qu'ils sont à fond sur leurs projets clients, on s'occupe de trouver de nouveaux prospects en leur nom, d'envoyer les messages et de faire les relances. Ils n'ont plus qu'à gérer les conversations avec les gens qui répondent.\n\nTu serais partant pour en discuter 10 minutes ?"}
        />
      </div>

      <H3>Le prospect répond — clique sur sa réponse</H3>
      <div className="grid grid-cols-2 gap-2">
        {(Object.entries(SCENARIOS) as [ScenarioKey, typeof sc][]).map(([key, s]) => (
          <button
            key={key}
            onClick={() => setScenario(key)}
            className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition ${scenario === key ? "border-[#2563eb] bg-[#eff6ff]" : "border-[#e2e8f0] bg-white hover:border-[#bfdbfe]"}`}
          >
            <span className="text-lg">{s.emoji}</span>
            <div>
              <p className={`text-[13px] font-bold ${scenario === key ? "text-[#1d4ed8]" : "text-[#0b1c33]"}`}>{s.tab}</p>
              <p className="mt-0.5 text-[11px] text-[#94a3b8]">{s.sub}</p>
            </div>
          </button>
        ))}
      </div>

      <Callout type="amber" icon={sc.ctxIcon}>
        <strong>Contexte : </strong>{sc.ctx}
      </Callout>

      <div className="space-y-4 rounded-2xl border border-[#e2e8f0] bg-white p-5">
        <div className="inline-block rounded-xl border border-[#f1f5f9] bg-[#f8fafc] px-4 py-2.5 text-[13.5px] italic text-[#51627b]">
          {sc.thread.prospect}
        </div>

        {sc.thread.steps.map((step, i) => (
          <div key={i} className="space-y-2">
            <div className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-wider text-[#94a3b8]">
              {step.label}
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${pillCls[step.pillColor as keyof typeof pillCls] || pillCls.blue}`}>{step.pill}</span>
            </div>
            <MsgCard text={step.msg} />
            <div className="flex items-center gap-2 text-[12px] font-medium text-[#94a3b8]">
              <span className={`h-2 w-2 rounded-full ${step.goalType === "qualify" ? "bg-[#2563eb]" : step.goalType === "close" ? "bg-amber-400" : "bg-emerald-500"}`} />
              Objectif : {step.goal}
            </div>
          </div>
        ))}

        {sc.thread.branches && (
          <>
            <div className="border-y border-dashed border-[#e2e8f0] py-2 text-center text-[12px] font-semibold text-[#94a3b8]">
              Selon sa réponse →
            </div>
            <div className="grid grid-cols-2 gap-3">
              {([["left", sc.thread.branches.left], ["right", sc.thread.branches.right]] as const).map(([side, b]) => (
                <div key={side} className="space-y-2 rounded-xl bg-[#f8fafc] p-3">
                  <p className="rounded-lg border-l-2 border-[#e2e8f0] bg-white p-2.5 text-[12px] italic text-[#51627b]">{b.prospect}</p>
                  <div className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-wider text-[#94a3b8]">
                    {b.label}
                    <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">{b.pill}</span>
                  </div>
                  <MsgCard text={b.msg} />
                  <div className="flex items-center gap-2 text-[12px] font-medium text-[#94a3b8]">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    {b.goal}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {sc.thread.close && (
          <>
            <div className="border-y border-dashed border-[#e2e8f0] py-2 text-center text-[12px] font-semibold text-[#94a3b8]">
              Il dit oui →
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-wider text-[#94a3b8]">
                Tu envoies <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">Clôture</span>
              </div>
              <MsgCard text={sc.thread.close} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Section: IA Coach ───────────────────────────────────────────────────────

function SIACoach() {
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (!msg.trim()) return;
    setLoading(true);
    setReplies([]);
    setError(null);
    try {
      const res = await fetch("/api/playbook/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg.trim() }),
      });
      if (!res.ok) throw new Error(`Erreur serveur ${res.status}`);
      const data = await res.json();
      setReplies(data.replies || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => { setMsg(""); setReplies([]); setError(null); };

  const replyStyles = [
    { bg: "bg-[#eff6ff]", border: "border-[#bfdbfe]", text: "text-[#1e3a8a]", badge: "bg-[#2563eb]" },
    { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-900", badge: "bg-emerald-600" },
    { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-900", badge: "bg-amber-500" },
  ];

  return (
    <div className="space-y-5">
      <SectionHead title="IA Coach" desc="Colle le message du prospect ici. L'IA génère 3 réponses adaptées au contexte Lidmeo, que tu peux copier-coller directement." />

      <div className="overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white">
        <div className="flex items-center gap-2 border-b border-[#f1f5f9] bg-[#f8fafc] px-4 py-2.5">
          <span className="h-2 w-2 rounded-full bg-[#94a3b8]" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#94a3b8]">Message du prospect</span>
        </div>
        <textarea
          value={msg}
          onChange={e => setMsg(e.target.value)}
          placeholder="Ex : &quot;C'est quoi exactement ? On gère déjà notre prospection mais je suis curieux&quot;"
          className="min-h-[100px] w-full resize-y bg-transparent px-5 py-4 text-[13.5px] leading-relaxed text-[#0b1c33] placeholder:text-[#94a3b8] focus:outline-none"
        />
        <div className="flex items-center justify-between border-t border-[#f1f5f9] px-4 py-3">
          <span className="text-[12px] text-[#94a3b8]">L&apos;IA connaît Lidmeo, les prix et l&apos;objectif.</span>
          <button
            onClick={generate}
            disabled={loading || !msg.trim()}
            className="flex items-center gap-2 rounded-xl bg-[#1f5eff] px-4 py-2 text-[13px] font-bold text-white shadow-[0_6px_16px_-6px_rgba(31,94,255,0.6)] transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />Génération…</>
            ) : (
              <>✦ Générer les réponses</>
            )}
          </button>
        </div>
      </div>

      {error && (
        <Callout type="red" icon="⚠️" title="Erreur">{error}</Callout>
      )}

      {replies.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#94a3b8]">3 réponses suggérées</p>
          {replies.map((r, i) => {
            const s = replyStyles[i % 3];
            return (
              <div key={i} className={`overflow-hidden rounded-2xl border ${s.border} ${s.bg}`}>
                <div className={`flex items-center justify-between border-b ${s.border} px-4 py-2.5`}>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-3 py-0.5 text-[10px] font-bold text-white ${s.badge}`}>{r.label || `Option ${i + 1}`}</span>
                    <span className={`text-[11px] opacity-60 ${s.text}`}>{r.tone}</span>
                  </div>
                  <CopyBtn text={r.text} variant="ghost" />
                </div>
                <p className={`px-5 py-4 text-[13.5px] leading-[1.9] whitespace-pre-wrap ${s.text}`}>{r.text}</p>
              </div>
            );
          })}
          <button onClick={reset} className="mt-2 rounded-xl border border-[#e2e8f0] px-4 py-2 text-[12px] font-semibold text-[#51627b] transition hover:bg-white">
            ↩ Nouveau message
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Section: Objections ─────────────────────────────────────────────────────

function SObjections() {
  const items = [
    { q: '"C\'est quoi exactement Lidmeo ?"', context: "Il n'a pas bien saisi le premier message. Répondre simplement, sans jargon.", a: "On s'occupe de la prospection LinkedIn à ta place. Chaque matin on envoie des messages à des profils qui correspondent à ta cible, en ton nom. Toi tu gères uniquement les gens qui répondent. C'est tout." },
    { q: '"J\'ai pas le temps de gérer ça"', context: "Il pense que c'est un outil qu'il faut piloter lui-même.", a: "C'est justement fait pour ça. Tu n'as rien à configurer ni à gérer au quotidien, on s'occupe de tout. La seule chose que tu fais c'est répondre aux gens qui ont montré de l'intérêt, et ça prend 10 minutes par jour grand max." },
    { q: '"On fait déjà de la prospection"', context: "Creuse pour comprendre qui fait quoi. Souvent c'est le fondateur lui-même.", a: "C'est bien. C'est toi qui t'en occupes ou tu as quelqu'un dédié à ça ?\n\nSi c'est lui : on peut te libérer de ça complètement. Tu gardes le contrôle sur qui tu cibles mais tu arrêtes d'y passer du temps toi-même." },
    { q: '"C\'est combien ?"', context: "Signal d'intérêt fort. Donner les prix clairement et enchaîner sur l'essai.", a: "Deux formules.\n\nEssential à 49€/mois, on te livre chaque matin des profils qualifiés et c'est toi qui envoies les messages.\n\nFull Automatisé à 199€/mois, on gère tout de bout en bout et tu reçois uniquement les réponses des gens intéressés.\n\nDans les deux cas il y a un essai gratuit de 7 jours. Tu veux qu'on démarre ?" },
    { q: '"Je vais en parler à mon associé"', context: "Signal d'intérêt. Il a besoin d'un appui interne. Faciliter sans bloquer.", a: "Bien sûr, c'est normal. Je peux te préparer un résumé rapide que tu lui transmets directement si tu veux, ça t'évite de tout réexpliquer." },
    { q: '"Envoyez-moi plus d\'infos"', context: "Souvent une façon polie de temporiser. Qualifier avant d'envoyer quoi que ce soit.", a: "Bien sûr. Pour t'envoyer ce qui est vraiment utile pour toi, c'est quoi ton enjeu principal là ? Gagner du temps sur la prospection ou avoir plus de volume de prospects contactés ?" },
    { q: '"J\'ai essayé des outils comme ça, ça marchait pas"', context: "Il a été déçu par un outil self-service. Lidmeo c'est un service accompagné, pas un outil à piloter seul.", a: "Je comprends. La plupart des outils te donnent accès à une base de données et te laissent te débrouiller. Nous c'est différent, on configure tout à ta place, on choisit les profils, on rédige les messages. C'est plus proche d'un service que d'un logiciel.\n\nEt comme il y a un essai gratuit, tu peux juger par toi-même sans rien risquer." },
    { q: '"On cherche plutôt des clients entrants"', context: "Il pense que c'est l'un ou l'autre. Montrer que les deux se complètent.", a: "C'est une bonne stratégie sur le long terme. Lidmeo c'est ce qui te génère du business pendant que ton inbound se construit, ou qui prend le relais dans les périodes creuses. Les deux marchent bien ensemble." },
    { q: '"C\'est pas le bon moment"', context: "Il n'est pas contre, juste pas disponible. Garder la porte ouverte sans forcer.", a: "Pas de problème. C'est quoi qui fait que c'est pas le bon moment là ? Je me note de revenir vers toi si tu préfères." },
    { q: '"J\'ai peur que ça fasse trop de prospects à gérer"', context: "Il a peur d'être débordé. Rassurer sur le contrôle du volume.", a: "C'est une vraie question. Tu choisis ton volume toi-même, on peut commencer à 10 profils par jour et augmenter à ton rythme. Et pendant l'essai tu vois exactement le débit que ça génère avant de t'engager sur quoi que ce soit." },
  ];
  return (
    <div className="space-y-4">
      <SectionHead title="Réponses aux objections" desc="Clique sur une objection pour voir le contexte et la réponse suggérée." />
      <Accordion items={items} />
    </div>
  );
}

// ─── Section: Closing ────────────────────────────────────────────────────────

function SClosing() {
  return (
    <div className="space-y-4">
      <SectionHead title="Quand la personne dit oui" desc="La personne est partante pour démarrer l'essai gratuit. Voici exactement quoi faire." />

      <div className="overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white">
        {[
          { n: "1", title: "Tu lui envoies ton lien affilié", desc: "Envoie-lui simplement ton lien personnalisé. C'est lui qui lui donne accès à l'essai gratuit de 7 jours et qui t'attribue la commission automatiquement.", msg: "Super, voici le lien pour démarrer ton essai gratuit de 7 jours : [TON LIEN AFFILIÉ]\n\nOn s'occupe de tout configurer à ta place dès que tu es inscrit.", color: "bg-[#1f5eff]" },
          { n: "2", title: "Il s'inscrit via le lien", desc: "Il choisit sa formule et crée son compte. Ça prend 2 minutes de son côté.", color: "bg-[#e2e8f0] text-[#94a3b8]" },
          { n: "3", title: "L'équipe Lidmeo prend le relais", desc: "Lilian ou Dorian configurent tout à sa place dans les 24h ouvrées. Toi tu as terminé.", color: "bg-[#e2e8f0] text-[#94a3b8]" },
          { n: "4", title: "Ta commission tombe 💰", desc: "Dès son inscription via ton lien, ta commission est enregistrée. Tu la touches chaque mois tant qu'il reste client.", color: "bg-emerald-500" },
        ].map((step, i, arr) => (
          <div key={step.n} className={`flex gap-4 p-5 ${i < arr.length - 1 ? "border-b border-[#f1f5f9]" : ""}`}>
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white ${step.color}`}>
              {step.n}
            </div>
            <div className="space-y-2">
              <p className={`text-[13.5px] font-semibold ${i === 3 ? "text-emerald-800" : "text-[#0b1c33]"}`}>{step.title}</p>
              <p className={`text-[13px] leading-relaxed ${i === 3 ? "text-emerald-700" : "text-[#51627b]"}`}>{step.desc}</p>
              {step.msg && <MsgCard text={step.msg} />}
            </div>
          </div>
        ))}
      </div>

      <Callout type="blue" icon="🔗">
        Chaque commercial a son propre lien affilié. Ne partage jamais le lien d&apos;un autre, c&apos;est ce lien qui te permet de toucher ta commission.
      </Callout>
    </div>
  );
}

// ─── Section: Pricing ────────────────────────────────────────────────────────

function SPricing() {
  const [ess, setEss] = useState(0);
  const [full, setFull] = useState(0);
  const monthly = Math.round((ess * 20.7 + full * 59.7) * 100) / 100;

  const Counter = ({ val, setVal }: { val: number; setVal: (n: number) => void }) => (
    <div className="flex items-center gap-2">
      <button onClick={() => setVal(Math.max(0, val - 1))} className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-lg font-bold text-emerald-600 hover:bg-emerald-100">−</button>
      <span className="w-7 text-center text-[18px] font-bold text-emerald-800">{val}</span>
      <button onClick={() => setVal(val + 1)} className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-lg font-bold text-emerald-600 hover:bg-emerald-100">+</button>
    </div>
  );

  return (
    <div className="space-y-5">
      <SectionHead title="Offres, tarifs & commissions" />

      <H3>Essential</H3>
      <div className="overflow-hidden rounded-xl border border-[#e2e8f0] bg-white">
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-[#f1f5f9] bg-[#f8fafc]">
            {["Volume", "Prix barré", "Prix actuel", "Ta commission / mois"].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-[#94a3b8]">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {[
              ["10 prospects/jour · lun–ven", "69€", "49€/mois", "14,70€"],
              ["20 prospects/jour · lun–ven", "99€", "69€/mois", "20,70€"],
              ["30 prospects/jour · lun–ven", "129€", "89€/mois", "26,70€"],
            ].map(([v, old, price, com]) => (
              <tr key={v} className="border-b border-[#f1f5f9] last:border-0 transition hover:bg-[#f7faff]">
                <td className="px-4 py-3 text-[#51627b]">{v}</td>
                <td className="px-4 py-3"><s className="text-[#94a3b8]">{old}</s></td>
                <td className="px-4 py-3 font-semibold text-[#0b1c33]">{price}</td>
                <td className="px-4 py-3 font-bold text-emerald-600">{com}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H3>Full Automatisé</H3>
      <div className="overflow-hidden rounded-xl border border-[#e2e8f0] bg-white">
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-[#f1f5f9] bg-[#f8fafc]">
            {["Volume", "Prix", "Ta commission / mois"].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-[#94a3b8]">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            <tr className="transition hover:bg-[#f7faff]">
              <td className="px-4 py-3 text-[#51627b]">330 prospects/mois · 15/jour ouvré</td>
              <td className="px-4 py-3 font-semibold text-[#0b1c33]">199€/mois</td>
              <td className="px-4 py-3 text-lg font-bold text-emerald-600">59,70€</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <H3>💰 Tes commissions récurrentes</H3>
        <p className="mb-4 text-[13px] leading-relaxed text-emerald-800">
          Tu touches <strong>30% du montant mensuel</strong> payé par chaque client que tu closes, <strong>tant qu&apos;il reste abonné</strong>. Chaque nouveau client s&apos;ajoute aux précédents.
        </p>

        <div className="mb-4 overflow-hidden rounded-xl border border-emerald-200 bg-white">
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-emerald-100 bg-emerald-50">
              {["Offre", "Commission/mois", "6 mois", "12 mois"].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-emerald-700">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {[["Essential 49€", "14,70€", "88€", "176€"], ["Essential 69€", "20,70€", "124€", "248€"], ["Essential 89€", "26,70€", "160€", "320€"], ["Full Auto 199€", "59,70€", "358€", "716€"]].map(([o, m, s6, s12]) => (
                <tr key={o} className="border-b border-emerald-50 last:border-0">
                  <td className="px-4 py-2.5 text-emerald-900">{o}</td>
                  <td className="px-4 py-2.5 font-bold text-emerald-800">{m}</td>
                  <td className="px-4 py-2.5 text-emerald-700">{s6}</td>
                  <td className="px-4 py-2.5 font-bold text-emerald-600">{s12}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-white p-4">
          <p className="mb-4 text-[13px] font-bold text-emerald-800">Simulateur de revenus récurrents</p>
          <div className="mb-4 grid grid-cols-2 gap-4">
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-emerald-700">Clients Essential</p>
              <div className="flex items-center gap-3">
                <Counter val={ess} setVal={setEss} />
                <span className="text-[11px] text-emerald-600 opacity-70">× 20,70€ moy.</span>
              </div>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-emerald-700">Clients Full Auto</p>
              <div className="flex items-center gap-3">
                <Counter val={full} setVal={setFull} />
                <span className="text-[11px] text-emerald-600 opacity-70">× 59,70€</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 rounded-xl bg-emerald-50 p-4 text-center">
            {[
              ["Par mois", `${monthly.toFixed(2).replace(".", ",")}€`],
              ["Sur 6 mois", `${Math.round(monthly * 6)}€`],
              ["Sur 12 mois", `${Math.round(monthly * 12)}€`],
            ].map(([label, val], i) => (
              <div key={label} className={i === 1 ? "border-x border-emerald-200" : ""}>
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-600 opacity-70">{label}</p>
                <p className={`mt-1 font-bold text-emerald-700 ${i === 2 ? "text-[22px] text-emerald-600" : "text-[20px]"}`}>{val}</p>
              </div>
            ))}
          </div>
          {(ess + full) > 0 && (
            <p className="mt-3 text-center text-[12.5px] italic text-emerald-700">
              {ess + full <= 3 ? "Bon début. Chaque client s'ajoute au récurrent déjà en place." : ess + full <= 6 ? `${ess + full} clients actifs, ton récurrent tourne tout seul chaque mois.` : ess + full <= 10 ? `${ess + full} clients actifs, c'est un vrai revenu passif qui s'accumule.` : "Au-delà de 10 clients, le récurrent dépasse souvent un salaire partiel."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Section: Reporting ──────────────────────────────────────────────────────

function SReporting() {
  const groups = [
    { emoji: "📢", bg: "bg-[#eff6ff]", name: "Lidmeo Sales — Général", desc: "Toute l'équipe + Lilian + Dorian. C'est le groupe des annonces importantes : nouveau script validé, update produit, changement de tarif, célébration d'un close. On ne pollue pas ce groupe avec des questions opérationnelles.", tagColor: "text-[#2563eb]", tags: "Annonces d'équipe · Updates produit · Célébrations de closes · Nouvelles ressources" },
    { emoji: "🔥", bg: "bg-amber-50", name: "Lidmeo Sales — Cas chauds & objections", desc: "Le groupe le plus actif au quotidien. Tu reçois une réponse bizarre d'un prospect ? Tu bloques sur une objection ? Tu colles la conversation ici et l'équipe te répond en live.", tagColor: "text-amber-600", tags: "Conversations en cours · Objections difficiles · Formules qui convertissent · Demandes d'aide en live" },
    { emoji: "📈", bg: "bg-emerald-50", name: "Lidmeo Sales — Résultats du jour", desc: "Tu postes dans ce groupe quand il se passe quelque chose de concret : un prospect chaud qui montre un vrai intérêt, ou un close confirmé. Pas besoin de résumé quotidien si t'as rien à signaler.", tagColor: "text-emerald-600", tags: "Prospect chaud identifié · Essai gratuit closé · Close confirmé" },
  ];

  return (
    <div className="space-y-4">
      <SectionHead title="Suivi & reporting" desc="Trois groupes WhatsApp sont créés pour l'équipe. Chacun a un rôle précis — ne mélange pas les usages." />
      <H3>Les 3 groupes WhatsApp</H3>
      <div className="space-y-3">
        {groups.map(g => (
          <div key={g.name} className="flex gap-4 rounded-2xl border border-[#e2e8f0] bg-white p-4 transition hover:border-[#bfdbfe]">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl ${g.bg}`}>{g.emoji}</div>
            <div>
              <p className="text-[13.5px] font-bold text-[#0b1c33]">{g.name}</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[#51627b]">{g.desc}</p>
              <p className={`mt-2 text-[11px] font-bold uppercase tracking-wider ${g.tagColor}`}>{g.tags}</p>
            </div>
          </div>
        ))}
      </div>
      <H3>Tes statistiques</H3>
      <p className="text-[13.5px] leading-relaxed text-[#51627b]">Toutes tes stats sont disponibles directement sur le hub Lidmeo : conversions, clics sur ton lien affilié, essais démarrés, clients actifs. Pas besoin de tracker quoi que ce soit manuellement.</p>
      <Callout type="blue" icon="📊">
        Connecte-toi au hub pour voir tes résultats en temps réel. Si tu as une question sur tes chiffres, envoie un message dans le groupe &quot;Cas chauds&quot;.
      </Callout>
    </div>
  );
}

// ─── Section: FAQ ────────────────────────────────────────────────────────────

function SFAQ() {
  const items = [
    { q: "Je ne sais pas quoi répondre, que faire ?", a: "Poste la conversation dans le groupe WhatsApp \"Cas chauds & objections\". L'équipe t'aide en quelques minutes. Ne laisse jamais une conversation attendre plus d'une heure sans réponse." },
    { q: "Le prospect demande des références ou cas clients ?", a: "Explique que Lidmeo est jeune et que vous construisez vos premiers cas clients ensemble. L'essai gratuit est justement là pour ça, voir les résultats sans risque. C'est souvent plus convaincant qu'une référence." },
    { q: "Le prospect veut savoir qui envoie les messages à sa place ?", a: "C'est notre système qui envoie les messages via son compte LinkedIn (Full Auto) ou qui lui prépare des prospects à contacter lui-même (Essential). Dans les deux cas, les messages sont personnalisés et envoyés en son nom." },
    { q: "Un prospect demande si c'est risqué pour son compte LinkedIn ?", a: "On respecte les limites de LinkedIn pour éviter tout risque. C'est un point qu'on gère de notre côté, le client n'a pas à s'en préoccuper." },
    { q: "Le prospect ne sait pas quelle offre choisir ?", a: "Pose-lui cette question : \"Tu préfères contrôler toi-même l'envoi des messages, ou tu veux que ça tourne tout seul sans y toucher ?\" Sa réponse te guide directement vers Essential ou Full Auto." },
    { q: "Combien de temps entre le « oui » et le démarrage de l'essai ?", a: "L'équipe configure l'essai en général dans les 24h ouvrées suivant l'inscription. Préviens le prospect que c'est rapide et qu'on revient vers lui dès que c'est prêt." },
  ];
  return (
    <div className="space-y-4">
      <SectionHead title="FAQ interne" desc="Les questions que tu poseras forcément, avec les réponses rapides." />
      <Accordion items={items} />
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

const SECTION_COMPONENTS: Record<Section, React.FC<{ go: (s: Section) => void }>> = {
  intro: SIntro,
  produit: () => <SProduit />,
  icp: () => <SICP />,
  scripts: () => <SScripts />,
  iacoach: () => <SIACoach />,
  objections: () => <SObjections />,
  closing: () => <SClosing />,
  pricing: () => <SPricing />,
  reporting: () => <SReporting />,
  faq: () => <SFAQ />,
};

export default function PlaybookClient() {
  const [active, setActive] = useState<Section>("intro");
  const [mobileOpen, setMobileOpen] = useState(false);
  const ContentComponent = SECTION_COMPONENTS[active];

  return (
    <div className="flex h-full overflow-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-56 flex-col border-r border-[#e2e8f0] bg-white transition-transform md:static md:translate-x-0 md:z-auto ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ top: 0 }}
      >
        <div className="flex-1 overflow-y-auto px-3 py-4">
          {NAV.map(group => (
            <div key={group.group} className="mb-4">
              <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-[#94a3b8]">
                {group.group}
              </p>
              {group.items.map(item => (
                <button
                  key={item.key}
                  onClick={() => { setActive(item.key); setMobileOpen(false); }}
                  className={`relative mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all ${
                    active === item.key
                      ? "bg-[#eff6ff] font-semibold text-[#1d4ed8]"
                      : "text-[#51627b] hover:bg-[#f7faff] hover:text-[#0b1c33]"
                  }`}
                >
                  {active === item.key && (
                    <span className="absolute left-0 top-[20%] bottom-[20%] w-[3px] rounded-r bg-[#2563eb]" />
                  )}
                  <span className="text-[14px]">{item.emoji}</span>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="shrink-0 border-t border-[#f1f5f9] p-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold text-[#2563eb]">
            v1.0 · mars 2026
          </span>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#e2e8f0] bg-white px-5">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#e2e8f0] text-[#51627b] hover:bg-[#f7faff] md:hidden"
            >
              ☰
            </button>
            <span className="text-[12px] text-[#94a3b8]">
              Sales Playbook ·{" "}
              <span className="font-semibold text-[#0b1c33]">
                {NAV.flatMap(g => g.items).find(i => i.key === active)?.label}
              </span>
            </span>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto bg-[#f4f8ff]">
          <div className="px-8 py-8">
            <ContentComponent go={setActive} />
          </div>
        </div>
      </div>
    </div>
  );
}
