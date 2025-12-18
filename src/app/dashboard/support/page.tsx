"use client";

import { useMemo, useState } from "react";

type Category = "support" | "cibles" | "mails" | "bug" | "autre";

type FormState = {
  category: Category;
  subject: string;
  message: string;
};

const CATEGORIES: Array<{
  id: Category;
  label: string;
  hint: string;
  subjectPH: string;
  messagePH: string;
  prefill: { subject: string; message: string };
}> = [
  {
    id: "support",
    label: "Support",
    hint: "Question, aide, configuration, utilisation.",
    subjectPH: "Ex : Je n’arrive pas à exporter mes leads",
    messagePH:
      "Décris ce que tu observes, ce que tu attendais, et si possible : navigateur + capture d’écran.",
    prefill: {
      subject: "Besoin d’aide sur…",
      message:
        "Bonjour,\n\nJ’ai besoin d’aide concernant : …\n\nCe que je fais : …\nCe que j’obtiens : …\nCe que j’attendais : …\n\nContexte (optionnel) : navigateur / capture / lien.\n\nMerci !",
    },
  },
  {
    id: "cibles",
    label: "Changement de cibles",
    hint: "Zone, secteurs, taille, exclusions.",
    subjectPH: "Ex : Ajuster mes cibles (PME < 50, Bordeaux)",
    messagePH:
      "Indique la zone, les secteurs, la taille, et ce que tu veux exclure (avec exemples).",
    prefill: {
      subject: "Changement de cibles",
      message:
        "Bonjour,\n\nJe souhaite mettre à jour mes cibles :\n\n• Zone : …\n• Secteurs : …\n• Taille : … (ex : < 50)\n• Exclusions : …\n• Exemples d’entreprises à viser : …\n• Exemples à éviter : …\n\nMerci !",
    },
  },
  {
    id: "mails",
    label: "Libellés / règles mails",
    hint: "Libellés, règles, critères, cas limites.",
    subjectPH: "Ex : Ajouter un libellé “Devis”",
    messagePH:
      "Décris la règle exactement (mots-clés, expéditeur, pièces jointes, exceptions).",
    prefill: {
      subject: "Nouvelle règle / libellé mails",
      message:
        "Bonjour,\n\nJe veux ajouter la règle suivante :\n\n• Libellé : “Devis”\n• Condition : si l’objet contient “devis” OU “proposition”\n• Condition 2 (option) : OU si pièce jointe PDF\n• Exceptions : …\n• Exemples (emails) : …\n\nMerci !",
    },
  },
  {
    id: "bug",
    label: "Bug",
    hint: "Un problème à corriger rapidement.",
    subjectPH: "Ex : Erreur sur la page Prospection",
    messagePH:
      "Donne les étapes pour reproduire + le message d’erreur (si tu l’as).",
    prefill: {
      subject: "Bug — …",
      message:
        "Bonjour,\n\nJ’ai rencontré un bug : …\n\nÉtapes pour reproduire :\n1) …\n2) …\n3) …\n\nRésultat actuel : …\nRésultat attendu : …\n\nInfos utiles : navigateur / capture / heure approximative.\n\nMerci !",
    },
  },
  {
    id: "autre",
    label: "Autre",
    hint: "Idée, demande spécifique, amélioration.",
    subjectPH: "Ex : Suggestion d’amélioration",
    messagePH:
      "Explique le besoin, pourquoi c’est important, et le résultat attendu.",
    prefill: {
      subject: "Suggestion / demande",
      message:
        "Bonjour,\n\nJ’aimerais proposer / demander : …\n\nObjectif : …\nPourquoi c’est important : …\nRésultat attendu : …\n\nMerci !",
    },
  },
];

export default function SupportPage() {
  const [form, setForm] = useState<FormState>({
    category: "support",
    subject: "",
    message: "",
  });

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<null | "ok" | "error">(null);
  const [serverMsg, setServerMsg] = useState<string | null>(null);

  const active = useMemo(
    () => CATEGORIES.find((c) => c.id === form.category)!,
    [form.category]
  );

  const messageCount = form.message.length;

  const setField = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSent(null);
    setServerMsg(null);
  };

  const handlePrefill = () => {
    setForm((prev) => ({
      ...prev,
      subject: active.prefill.subject,
      message: active.prefill.message,
    }));
    setSent(null);
    setServerMsg(null);
  };

  const handleSend = async () => {
    const subject = form.subject.trim();
    const message = form.message.trim();

    if (!subject || !message) {
      setSent("error");
      setServerMsg("Ajoute un sujet et un message, puis réessaie.");
      return;
    }

    setSending(true);
    setSent(null);
    setServerMsg(null);

    try {
      const res = await fetch("/api/support/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          message,
          category: form.category,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setSent("error");
        setServerMsg(
          data?.error || "Impossible d’envoyer le ticket pour le moment."
        );
        return;
      }

      setSent("ok");
      setServerMsg("Message envoyé, on revient vers toi au plus vite.");
      setForm({ category: form.category, subject: "", message: "" });
    } catch (e) {
      console.error(e);
      setSent("error");
      setServerMsg("Erreur réseau. Réessaie dans quelques secondes.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="w-full min-h-[calc(100vh-120px)]">
      {/* HERO */}
      <div className="relative overflow-hidden rounded-[28px] border border-slate-800/80 bg-slate-950/60 shadow-[0_20px_70px_-30px_rgba(79,70,229,0.45)]">
        {/* glow */}
        <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-indigo-600/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl" />

        <div className="px-7 py-8 sm:px-10 sm:py-10">
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-2">
              <h1 className="text-3xl sm:text-[34px] font-semibold tracking-tight text-slate-50">
                Support / Ticketing
              </h1>
              <p className="text-sm text-slate-300/80 max-w-2xl">
                Une question, un changement de cibles ou une règle mail à ajouter
                ? Envoie-nous un ticket et on te répond rapidement.
              </p>
            </div>

            <button
              type="button"
              onClick={handlePrefill}
              className="
                shrink-0 inline-flex items-center gap-2
                rounded-full border border-slate-700/70
                bg-slate-900/40 px-4 py-2 text-[12px] text-slate-200
                hover:bg-slate-900/70 hover:border-slate-600
                transition
              "
            >
              <span className="text-[13px]">✨</span>
              Pré-remplir
            </button>
          </div>

          {/* FORM CARD */}
          <div className="mt-8 rounded-[22px] border border-slate-800/70 bg-gradient-to-b from-slate-950/70 to-slate-950/40 p-6 sm:p-7 shadow-inner">
            {/* category tabs */}
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => {
                const activeChip = c.id === form.category;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setField("category", c.id)}
                    className={[
                      "px-4 py-2 rounded-full text-[12px] transition border",
                      activeChip
                        ? "bg-indigo-600/20 border-indigo-500/40 text-slate-50 shadow-[0_0_0_1px_rgba(99,102,241,0.15)]"
                        : "bg-slate-900/35 border-slate-800 text-slate-200/80 hover:text-slate-50 hover:bg-slate-900/55 hover:border-slate-700",
                    ].join(" ")}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 text-[12px] text-slate-400">{active.hint}</div>

            {/* subject */}
            <div className="mt-6 space-y-2">
              <label className="text-[11px] text-slate-400 uppercase tracking-wider">
                Sujet
              </label>
              <input
                value={form.subject}
                onChange={(e) => setField("subject", e.target.value)}
                placeholder={active.subjectPH}
                className="
                  w-full rounded-2xl bg-slate-900/35 border border-slate-800/80
                  px-4 py-3.5 text-sm text-slate-100 placeholder-slate-500
                  focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40
                  transition
                "
              />
            </div>

            {/* message */}
            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-slate-400 uppercase tracking-wider">
                  Message
                </label>
                <div className="text-[11px] text-slate-500">
                  {messageCount} caractère{messageCount > 1 ? "s" : ""}
                </div>
              </div>

              <textarea
                value={form.message}
                onChange={(e) => setField("message", e.target.value)}
                placeholder={active.messagePH}
                className="
                  w-full min-h-[220px] rounded-2xl bg-slate-900/35 border border-slate-800/80
                  px-4 py-4 text-sm text-slate-100 placeholder-slate-500
                  focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40
                  transition resize-none
                "
              />
            </div>

            {/* footer row */}
            <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="text-[12px]">
                {sent === "ok" && (
                  <div className="text-emerald-400">
                    ✅ {serverMsg ?? "Message envoyé."}
                  </div>
                )}
                {sent === "error" && (
                  <div className="text-red-400">
                    ❌ {serverMsg ?? "Une erreur est survenue. Réessaie."}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleSend}
                disabled={sending}
                className={[
                  "inline-flex items-center justify-center gap-2",
                  "px-6 py-3 rounded-2xl text-sm font-medium transition",
                  sending
                    ? "bg-slate-800/70 text-slate-400 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20",
                ].join(" ")}
              >
                {sending ? "Envoi en cours…" : "Envoyer"}
              </button>
            </div>
          </div>

          {/* helper */}
          <div className="mt-6 text-[11.5px] text-slate-500">
            Astuce : pour les cibles, indique{" "}
            <span className="text-slate-300/90">zone</span>,{" "}
            <span className="text-slate-300/90">secteurs</span>,{" "}
            <span className="text-slate-300/90">taille</span>,{" "}
            <span className="text-slate-300/90">exclusions</span> + 2 exemples.
          </div>
        </div>
      </div>
    </div>
  );
}