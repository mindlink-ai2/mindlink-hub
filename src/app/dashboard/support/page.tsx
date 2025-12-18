"use client";

import { useMemo, useState } from "react";

type Category = "support" | "cibles" | "mails" | "bug" | "autre";

type FormState = {
  subject: string;
  category: Category;
  message: string;
};

const CATEGORY_UI: {
  key: Category;
  label: string;
  hint: string;
  subjectPlaceholder: string;
  messagePlaceholder: string;
}[] = [
  {
    key: "support",
    label: "Support",
    hint: "Question, aide, configuration, accès.",
    subjectPlaceholder: "Ex: Besoin d'aide sur la prospection",
    messagePlaceholder: "Explique ton besoin, ce que tu vois à l'écran, et ce que tu attends.",
  },
  {
    key: "cibles",
    label: "Changement de cibles",
    hint: "Zone, secteurs, taille, exclusions, exemples.",
    subjectPlaceholder: "Ex: Modifier mes cibles (PME < 50, Bordeaux)",
    messagePlaceholder:
      "Indique la zone, secteurs, taille, intitulés, exclusions et 3 exemples d'entreprises à cibler.",
  },
  {
    key: "mails",
    label: "Libellés / règles mails",
    hint: "Libellés, règles, critères, cas limites.",
    subjectPlaceholder: "Ex: Ajouter un libellé Devis",
    messagePlaceholder:
      "Ex: Ajouter un libellé “Devis” si l'objet contient “devis / proposition” ou si pièce jointe PDF.",
  },
  {
    key: "bug",
    label: "Bug",
    hint: "Décris le contexte, étapes, résultat attendu.",
    subjectPlaceholder: "Ex: Bug sur la page Google Maps",
    messagePlaceholder:
      "Étapes pour reproduire, ce que tu observes, capture si possible, et résultat attendu.",
  },
  {
    key: "autre",
    label: "Autre",
    hint: "Suggestion, amélioration, demande spécifique.",
    subjectPlaceholder: "Ex: Suggestion d'amélioration",
    messagePlaceholder: "Décris l'idée et ce que ça changerait pour toi.",
  },
];

export default function SupportPage() {
  const [form, setForm] = useState<FormState>({
    subject: "",
    category: "support",
    message: "",
  });

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<null | "ok" | "error">(null);

  const active = useMemo(() => {
    return CATEGORY_UI.find((c) => c.key === form.category) ?? CATEGORY_UI[0];
  }, [form.category]);

  const onChange = (key: keyof FormState, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSent(null);
  };

  const setCategory = (category: Category) => {
    setForm((prev) => ({ ...prev, category }));
    setSent(null);
  };

  const canSend = form.subject.trim().length > 0 && form.message.trim().length > 0;

  const handlePrefill = () => {
    // Petit pré-remplissage premium (optionnel)
    const preset =
      form.category === "cibles"
        ? {
            subject: "Modification de mes cibles",
            message:
              "Zone:\nSecteurs:\nTaille:\nIntitulés:\nExclusions:\n\n3 exemples d'entreprises:\n1.\n2.\n3.\n",
          }
        : form.category === "mails"
        ? {
            subject: "Ajout d'une règle mail",
            message:
              "Objectif:\nRègle:\nCritères:\nExceptions:\n\nExemples d'emails concernés:\n1.\n2.\n3.\n",
          }
        : form.category === "bug"
        ? {
            subject: "Bug à signaler",
            message:
              "Contexte:\nÉtapes pour reproduire:\nRésultat actuel:\nRésultat attendu:\n\nInfos utiles:\nNavigateur:\n",
          }
        : {
            subject: "Question",
            message: "Bonjour,\n\n",
          };

    setForm((prev) => ({
      ...prev,
      subject: prev.subject.trim() ? prev.subject : preset.subject,
      message: prev.message.trim() ? prev.message : preset.message,
    }));
    setSent(null);
  };

  const handleSend = async () => {
    if (!canSend) {
      setSent("error");
      return;
    }

    setSending(true);
    setSent(null);

    try {
      const res = await fetch("/api/support/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt);
      }

      setSent("ok");
      setForm({ subject: "", category: form.category, message: "" });
    } catch (e) {
      console.error(e);
      setSent("error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen w-full px-6 pt-16 pb-24">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* HEADER */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-50">
              Support / Ticketing
            </h1>
            <p className="text-slate-400 mt-2">
              Une question, un changement de cibles ou une règle mail à ajouter ?
              Envoie-nous un ticket et notre équipe s’en occupe rapidement.
            </p>
          </div>

          <button
            type="button"
            onClick={handlePrefill}
            className="
              hidden sm:inline-flex items-center gap-2
              px-4 py-2 rounded-full text-[12px]
              bg-slate-900/60 border border-slate-700
              hover:bg-slate-800/70 hover:border-slate-600
              text-slate-200 transition
            "
          >
            ✨ Pré-remplir
          </button>
        </div>

        {/* CARD */}
        <div
          className="
            rounded-3xl border border-slate-800
            bg-gradient-to-b from-slate-950/90 to-slate-950/60
            shadow-[0_20px_80px_-40px_rgba(79,70,229,0.65)]
            overflow-hidden
          "
        >
          {/* TOP GRADIENT BAR */}
          <div className="relative">
            <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_20%_0%,rgba(99,102,241,0.25),transparent_60%),radial-gradient(50%_60%_at_80%_0%,rgba(56,189,248,0.18),transparent_55%)]" />
            <div className="relative px-6 py-5 border-b border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-[12px] text-slate-400">
                    Choisis un type de demande
                  </div>
                  <div className="text-sm text-slate-200">{active.hint}</div>
                </div>

                <button
                  type="button"
                  onClick={handlePrefill}
                  className="
                    sm:hidden inline-flex items-center justify-center gap-2
                    px-4 py-2 rounded-full text-[12px]
                    bg-slate-900/60 border border-slate-700
                    hover:bg-slate-800/70 hover:border-slate-600
                    text-slate-200 transition
                  "
                >
                  ✨ Pré-remplir
                </button>
              </div>

              {/* CATEGORY PILLS */}
              <div className="mt-4 flex flex-wrap gap-2">
                {CATEGORY_UI.map((c) => {
                  const activePill = c.key === form.category;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setCategory(c.key)}
                      className={`
                        px-4 py-2 rounded-full text-[12px] transition
                        border
                        ${
                          activePill
                            ? "bg-indigo-600/20 border-indigo-500/40 text-indigo-100 shadow-[0_0_0_1px_rgba(99,102,241,0.15)]"
                            : "bg-slate-900/40 border-slate-700 text-slate-200 hover:bg-slate-800/60 hover:border-slate-600"
                        }
                      `}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* FORM */}
          <div className="px-6 py-6 space-y-5">
            {/* Sujet */}
            <div className="space-y-2">
              <label className="text-[11px] text-slate-400 uppercase tracking-wide">
                Sujet
              </label>
              <input
                value={form.subject}
                onChange={(e) => onChange("subject", e.target.value)}
                placeholder={active.subjectPlaceholder}
                className="
                  w-full rounded-2xl
                  bg-slate-900/50 border border-slate-700
                  px-4 py-3 text-sm text-slate-200 placeholder-slate-500
                  focus:outline-none focus:ring-2 focus:ring-indigo-500/50
                  transition
                "
              />
            </div>

            {/* Message */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-slate-400 uppercase tracking-wide">
                  Message
                </label>
                <span className="text-[11px] text-slate-500">
                  {form.message.length} caractères
                </span>
              </div>

              <textarea
                value={form.message}
                onChange={(e) => onChange("message", e.target.value)}
                placeholder={active.messagePlaceholder}
                className="
                  w-full h-56 rounded-2xl
                  bg-slate-900/50 border border-slate-700
                  px-4 py-3 text-sm text-slate-200 placeholder-slate-500
                  focus:outline-none focus:ring-2 focus:ring-indigo-500/50
                  transition
                  resize-none
                "
              />
            </div>

            {/* FOOTER */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2">
              <div className="text-xs">
                {sent === "ok" && (
                  <span className="text-emerald-400">✅ Message envoyé.</span>
                )}
                {sent === "error" && (
                  <span className="text-red-400">
                    ❌ Erreur. Vérifie le sujet et le message, puis réessaie.
                  </span>
                )}
                {sent === null && (
                  <span className="text-slate-500">
                    Astuce : pour les cibles, indique zone, secteurs, taille, exclusions et 3 exemples.
                  </span>
                )}
              </div>

              <button
                onClick={handleSend}
                disabled={sending || !canSend}
                className={`
                  w-full sm:w-auto
                  px-6 py-3 rounded-2xl text-sm font-medium transition
                  ${
                    sending
                      ? "bg-slate-800 text-slate-400 cursor-not-allowed"
                      : !canSend
                      ? "bg-slate-900/60 text-slate-500 border border-slate-800 cursor-not-allowed"
                      : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_10px_30px_-14px_rgba(99,102,241,0.75)]"
                  }
                `}
              >
                {sending ? "Envoi..." : "Envoyer"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}