"use client";

import { useMemo, useState } from "react";

type Category = "support" | "cibles" | "mails" | "bug" | "autre";

type FormState = {
  subject: string;
  category: Category;
  message: string;
};

const CATEGORY_LABEL: Record<Category, string> = {
  support: "Support",
  cibles: "Changement de cibles",
  mails: "Libellés / règles mails",
  bug: "Bug",
  autre: "Autre",
};

const CATEGORY_HINT: Record<Category, string> = {
  support: "Question, demande, clarification.",
  cibles: "Zone, secteurs, taille, exclusions, exemples.",
  mails: "Libellés, règles, critères, cas limites.",
  bug: "Décris le bug + étapes + capture si possible.",
  autre: "Tout le reste.",
};

export default function SupportPage() {
  const [form, setForm] = useState<FormState>({
    subject: "",
    category: "support",
    message: "",
  });

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<null | "ok" | "error">(null);

  const subjectOk = form.subject.trim().length >= 3;
  const messageOk = form.message.trim().length >= 10;

  const canSend = subjectOk && messageOk && !sending;

  const helperExample = useMemo(() => {
    switch (form.category) {
      case "cibles":
        return "Ex: PME < 50, Bordeaux + 30km, agences marketing, exclure ESN, décideur: CEO/Dir. marketing.";
      case "mails":
        return "Ex: Ajouter un libellé “Devis” si objet contient “devis / proposition” OU pièce jointe PDF.";
      case "bug":
        return "Ex: Sur /dashboard/maps, la recherche ne filtre pas “phoneNumber” — steps: ...";
      default:
        return "Ex: Je veux modifier X / ajouter Y / comprendre Z.";
    }
  }, [form.category]);

  const onChange = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSent(null);
  };

  const quickFill = () => {
    onChange("subject", form.category === "cibles" ? "Modifier mes cibles" : "Demande support");
    onChange(
      "message",
      form.category === "cibles"
        ? `Bonjour,\n\nJe souhaite modifier mes cibles :\n- Zone : \n- Taille : \n- Secteurs : \n- Exclusions : \n- Exemples de cibles : \n\nMerci !`
        : `Bonjour,\n\nVoici ma demande :\n\n- Contexte :\n- Ce que je veux :\n- Exemple :\n\nMerci !`
    );
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
        body: JSON.stringify({
          subject: form.subject.trim(),
          category: form.category,
          message: form.message.trim(),
        }),
      });

      if (!res.ok) throw new Error(await res.text());

      setSent("ok");
      setForm({ subject: "", category: "support", message: "" });
    } catch (e) {
      console.error(e);
      setSent("error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="w-full">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/60 p-8 md:p-10 shadow-2xl">
        <div className="pointer-events-none absolute inset-0 opacity-70">
          <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-indigo-600/20 blur-3xl" />
          <div className="absolute -bottom-28 -right-24 h-72 w-72 rounded-full bg-sky-500/15 blur-3xl" />
        </div>

        <div className="relative">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-slate-50">
                Support / Ticketing
              </h1>
              <p className="text-slate-300/80 text-sm mt-2 max-w-2xl">
                Une demande ? Un changement de cibles ? Des libellés de mails à ajouter ?
                Envoie-nous un ticket — on reçoit tout sur <span className="text-slate-100">contact@mind-link.fr</span>.
              </p>
            </div>

            <button
              onClick={quickFill}
              className="hidden md:inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/50 px-4 py-2 text-xs text-slate-200 hover:bg-slate-900 transition"
            >
              ✨ Pré-remplir
            </button>
          </div>

          {/* Card */}
          <div className="mt-8 rounded-3xl border border-slate-800 bg-slate-950/70 p-6 md:p-7 shadow-xl">
            {/* Categories (chips) */}
            <div className="flex flex-wrap gap-2">
              {(
                ["support", "cibles", "mails", "bug", "autre"] as Category[]
              ).map((c) => {
                const active = form.category === c;
                return (
                  <button
                    key={c}
                    onClick={() => onChange("category", c)}
                    className={[
                      "px-3.5 py-2 rounded-2xl text-xs transition border",
                      active
                        ? "bg-indigo-600/20 border-indigo-500/40 text-slate-100"
                        : "bg-slate-900/40 border-slate-800 text-slate-300 hover:bg-slate-900/60",
                    ].join(" ")}
                  >
                    {CATEGORY_LABEL[c]}
                  </button>
                );
              })}
            </div>

            <p className="mt-3 text-[12px] text-slate-400">
              {CATEGORY_HINT[form.category]}
            </p>

            {/* Form */}
            <div className="mt-6 grid grid-cols-1 gap-5">
              {/* Subject */}
              <div className="space-y-2">
                <label className="text-[11px] text-slate-400 uppercase tracking-wide">
                  Sujet
                </label>
                <input
                  value={form.subject}
                  onChange={(e) => onChange("subject", e.target.value)}
                  placeholder={
                    form.category === "cibles"
                      ? "Ex: Modifier mes cibles (PME < 50, Bordeaux)"
                      : "Ex: Besoin d’aide / question / demande"
                  }
                  className="
                    w-full rounded-2xl bg-slate-900/50 border border-slate-800
                    px-4 py-3 text-sm text-slate-100 placeholder-slate-500
                    focus:outline-none focus:ring-2 focus:ring-indigo-500/50
                    transition
                  "
                />
                {!subjectOk && form.subject.length > 0 && (
                  <p className="text-[11px] text-red-400">Min. 3 caractères.</p>
                )}
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
                  placeholder={helperExample}
                  className="
                    w-full min-h-[220px] rounded-2xl bg-slate-900/50 border border-slate-800
                    px-4 py-3 text-sm text-slate-100 placeholder-slate-500
                    focus:outline-none focus:ring-2 focus:ring-indigo-500/50
                    transition resize-y
                  "
                />

                {!messageOk && form.message.length > 0 && (
                  <p className="text-[11px] text-red-400">Min. 10 caractères.</p>
                )}
              </div>

              {/* Footer */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pt-1">
                <div className="text-xs">
                  {sent === "ok" && (
                    <span className="text-emerald-400">✅ Message envoyé.</span>
                  )}
                  {sent === "error" && (
                    <span className="text-red-400">
                      ❌ Vérifie le sujet / message, ou réessaie.
                    </span>
                  )}
                  {sent === null && (
                    <span className="text-slate-500">
                      Envoi depuis Mindlink (Reply-to = ton email).
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={quickFill}
                    className="md:hidden inline-flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-2 text-xs text-slate-200 hover:bg-slate-900/60 transition"
                  >
                    ✨ Pré-remplir
                  </button>

                  <button
                    onClick={handleSend}
                    disabled={!canSend}
                    className={[
                      "px-5 py-3 rounded-2xl text-sm font-medium transition shadow-lg",
                      canSend
                        ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20"
                        : "bg-slate-800 text-slate-500 cursor-not-allowed shadow-transparent",
                    ].join(" ")}
                  >
                    {sending ? "Envoi…" : "Envoyer"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Tip */}
          <div className="mt-5 text-[11px] text-slate-500">
            Astuce : pour les cibles, indique <span className="text-slate-300">zone</span>,{" "}
            <span className="text-slate-300">secteurs</span>,{" "}
            <span className="text-slate-300">taille</span>,{" "}
            <span className="text-slate-300">exclusions</span> + 3 exemples.
          </div>
        </div>
      </div>
    </div>
  );
}