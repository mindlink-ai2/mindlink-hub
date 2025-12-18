"use client";

import { useMemo, useState } from "react";

type FormState = {
  subject: string;
  category: "support" | "cibles" | "mails" | "bug" | "autre";
  message: string;
};

const CATEGORIES: Array<{
  value: FormState["category"];
  label: string;
  hint: string;
}> = [
  {
    value: "support",
    label: "Support",
    hint: "Questions, aide, accompagnement",
  },
  {
    value: "cibles",
    label: "Cibles",
    hint: "Zone, secteurs, postes, exclusions",
  },
  {
    value: "mails",
    label: "Mails",
    hint: "Libellés, règles, automatisations",
  },
  {
    value: "bug",
    label: "Bug",
    hint: "Un comportement anormal à corriger",
  },
  {
    value: "autre",
    label: "Autre",
    hint: "Toute autre demande",
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

  const currentCategory = useMemo(
    () => CATEGORIES.find((c) => c.value === form.category),
    [form.category]
  );

  const onChange = (key: keyof FormState, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSent(null);
  };

  const handleSend = async () => {
    if (!form.subject.trim() || !form.message.trim()) {
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

      if (!res.ok) throw new Error(await res.text());

      setSent("ok");
      setForm({
        subject: "",
        category: "support",
        message: "",
      });
    } catch (e) {
      console.error(e);
      setSent("error");
    } finally {
      setSending(false);
    }
  };

  const subjectOk = form.subject.trim().length > 0;
  const messageOk = form.message.trim().length > 0;
  const canSend = subjectOk && messageOk && !sending;

  return (
    <div className="min-h-screen w-full px-6 pt-16 pb-24">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* HEADER */}
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-[11px] text-slate-300">
            <span className="h-2 w-2 rounded-full bg-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.65)]" />
            Support Mindlink
          </div>

          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-50">
            Envoyer une demande
          </h1>

          <p className="text-slate-400 text-sm sm:text-base leading-relaxed max-w-2xl">
            Besoin d’un ajustement sur tes cibles, d’une règle mail, ou d’un coup
            de main sur la plateforme ? Écris nous ici et on revient vers toi au
            plus vite.
          </p>
        </div>

        {/* GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* FORM CARD */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/80 shadow-xl overflow-hidden">
              {/* TOP */}
              <div className="px-6 py-5 border-b border-slate-800 bg-gradient-to-b from-slate-950/80 to-slate-950/40">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h2 className="text-slate-100 text-sm font-medium">
                      Formulaire de support
                    </h2>
                    <p className="text-[12px] text-slate-400">
                      Plus c’est précis, plus c’est rapide.
                    </p>
                  </div>

                  {sent === "ok" && (
                    <div className="text-[12px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 px-3 py-1.5 rounded-full">
                      Envoyé
                    </div>
                  )}
                  {sent === "error" && (
                    <div className="text-[12px] text-red-300 bg-red-500/10 border border-red-500/25 px-3 py-1.5 rounded-full">
                      Erreur
                    </div>
                  )}
                </div>
              </div>

              {/* BODY */}
              <div className="p-6 space-y-5">
                {/* SUBJECT */}
                <div className="space-y-2">
                  <label className="text-[11px] text-slate-400 uppercase tracking-wide">
                    Sujet
                  </label>
                  <input
                    value={form.subject}
                    onChange={(e) => onChange("subject", e.target.value)}
                    placeholder="Exemple : Ajuster mes cibles dans les Hauts de France"
                    className="
                      w-full rounded-xl bg-slate-900/50 border border-slate-700
                      px-4 py-3 text-sm text-slate-200 placeholder-slate-500
                      focus:outline-none focus:ring-2 focus:ring-indigo-500/50
                    "
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-slate-500">
                      Un titre clair aide à traiter plus vite.
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {form.subject.trim().length}/80
                    </p>
                  </div>
                </div>

                {/* CATEGORY */}
                <div className="space-y-2">
                  <label className="text-[11px] text-slate-400 uppercase tracking-wide">
                    Type de demande
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {CATEGORIES.map((c) => {
                      const active = form.category === c.value;
                      return (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => onChange("category", c.value)}
                          className={`
                            text-left rounded-xl border px-4 py-3 transition
                            ${
                              active
                                ? "border-indigo-500/60 bg-indigo-500/10"
                                : "border-slate-800 bg-slate-950/40 hover:bg-slate-900/40"
                            }
                          `}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-sm font-medium ${
                                active ? "text-slate-100" : "text-slate-200"
                              }`}
                            >
                              {c.label}
                            </span>
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${
                                active
                                  ? "bg-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.65)]"
                                  : "bg-slate-700"
                              }`}
                            />
                          </div>
                          <p className="text-[12px] text-slate-400 mt-1">
                            {c.hint}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {currentCategory?.value === "cibles" && (
                    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                      <p className="text-[12px] text-slate-300 font-medium">
                        Pour une demande de cibles, pense à préciser
                      </p>
                      <div className="mt-2 text-[12px] text-slate-400 leading-relaxed">
                        Zone géographique, secteurs, postes, mots clés, exclusions
                        et exemples de profils.
                      </div>
                    </div>
                  )}
                </div>

                {/* MESSAGE */}
                <div className="space-y-2">
                  <label className="text-[11px] text-slate-400 uppercase tracking-wide">
                    Détails
                  </label>
                  <textarea
                    value={form.message}
                    onChange={(e) => onChange("message", e.target.value)}
                    placeholder="Décris ce que tu veux. Tu peux donner des exemples, des contraintes, ou un résultat attendu."
                    className="
                      w-full h-44 rounded-xl bg-slate-900/50 border border-slate-700
                      px-4 py-3 text-sm text-slate-200 placeholder-slate-500
                      focus:outline-none focus:ring-2 focus:ring-indigo-500/50
                      resize-none
                    "
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-slate-500">
                      Tu peux copier coller des exemples.
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {form.message.trim().length}/2000
                    </p>
                  </div>
                </div>

                {/* ACTIONS */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
                  <div className="text-[12px] text-slate-400">
                    {sent === "error" ? (
                      <span className="text-red-300">
                        Vérifie le sujet et le message puis réessaie.
                      </span>
                    ) : sent === "ok" ? (
                      <span className="text-emerald-300">
                        Merci, ta demande a bien été envoyée.
                      </span>
                    ) : (
                      <span>
                        Réponse directement par email dès que c’est traité.
                      </span>
                    )}
                  </div>

                  <button
                    onClick={handleSend}
                    disabled={!canSend}
                    className={`
                      inline-flex items-center justify-center gap-2
                      px-5 py-2.5 rounded-xl text-sm font-medium transition
                      ${
                        canSend
                          ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                          : "bg-slate-900 text-slate-500 border border-slate-800 cursor-not-allowed"
                      }
                    `}
                  >
                    {sending ? (
                      <>
                        <span className="h-4 w-4 rounded-full border-2 border-slate-300/40 border-t-slate-100 animate-spin" />
                        Envoi en cours
                      </>
                    ) : (
                      "Envoyer"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* SIDE PANEL */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 shadow-xl p-6">
              <h3 className="text-sm font-medium text-slate-100">
                Ce qu’on traite ici
              </h3>

              <ul className="mt-4 space-y-3 text-[12px] text-slate-400 leading-relaxed">
                <li className="flex gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-sky-400" />
                  Ajustements de cibles LinkedIn et Google Maps.
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-indigo-400" />
                  Règles et libellés emails, tri, relances, automatisations.
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />
                  Bugs, améliorations, idées de fonctionnalités.
                </li>
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-950/70 to-slate-950/40 shadow-xl p-6">
              <h3 className="text-sm font-medium text-slate-100">
                Pour gagner du temps
              </h3>
              <p className="mt-3 text-[12px] text-slate-400 leading-relaxed">
                Ajoute un exemple précis, une capture si possible, et le résultat
                attendu. On pourra avancer beaucoup plus vite.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}