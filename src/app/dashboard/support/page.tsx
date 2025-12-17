"use client";

import { useState } from "react";

type FormState = {
  subject: string;
  category: "support" | "cibles" | "mails" | "bug" | "autre";
  priority: "low" | "normal" | "high";
  message: string;
};

export default function SupportPage() {
  const [form, setForm] = useState<FormState>({
    subject: "",
    category: "support",
    priority: "normal",
    message: "",
  });

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<null | "ok" | "error">(null);

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
        priority: "normal",
        message: "",
      });
    } catch (e) {
      console.error(e);
      setSent("error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen w-full px-6 pt-20 pb-24">
      <div className="max-w-3xl space-y-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-50">
            Support / Ticketing
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Une demande ? Un changement de cibles ? Des libellés de mails à ajouter ? Écris-nous ici.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/90 shadow-xl p-6 space-y-5">
          {/* Sujet */}
          <div className="space-y-2">
            <label className="text-[11px] text-slate-400 uppercase tracking-wide">
              Sujet
            </label>
            <input
              value={form.subject}
              onChange={(e) => onChange("subject", e.target.value)}
              placeholder="Ex: Modifier mes cibles (PME < 50, Bordeaux)"
              className="
                w-full rounded-xl bg-slate-900/60 border border-slate-700
                px-4 py-3 text-sm text-slate-200 placeholder-slate-500
                focus:outline-none focus:ring-2 focus:ring-indigo-500/50
              "
            />
          </div>

          {/* Catégorie + Priorité */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[11px] text-slate-400 uppercase tracking-wide">
                Catégorie
              </label>
              <select
                value={form.category}
                onChange={(e) => onChange("category", e.target.value)}
                className="
                  w-full rounded-xl bg-slate-900/60 border border-slate-700
                  px-4 py-3 text-sm text-slate-200
                  focus:outline-none focus:ring-2 focus:ring-indigo-500/50
                "
              >
                <option value="support">Support</option>
                <option value="cibles">Changement de cibles</option>
                <option value="mails">Libellés / règles mails</option>
                <option value="bug">Bug</option>
                <option value="autre">Autre</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] text-slate-400 uppercase tracking-wide">
                Priorité
              </label>
              <select
                value={form.priority}
                onChange={(e) => onChange("priority", e.target.value)}
                className="
                  w-full rounded-xl bg-slate-900/60 border border-slate-700
                  px-4 py-3 text-sm text-slate-200
                  focus:outline-none focus:ring-2 focus:ring-indigo-500/50
                "
              >
                <option value="low">Faible</option>
                <option value="normal">Normale</option>
                <option value="high">Haute</option>
              </select>
            </div>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <label className="text-[11px] text-slate-400 uppercase tracking-wide">
              Message
            </label>
            <textarea
              value={form.message}
              onChange={(e) => onChange("message", e.target.value)}
              placeholder="Décris précisément ce que tu veux changer + exemple si possible."
              className="
                w-full h-44 rounded-xl bg-slate-900/60 border border-slate-700
                px-4 py-3 text-sm text-slate-200 placeholder-slate-500
                focus:outline-none focus:ring-2 focus:ring-indigo-500/50
              "
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-4 pt-2">
            <div className="text-xs">
              {sent === "ok" && (
                <span className="text-emerald-400">✅ Message envoyé.</span>
              )}
              {sent === "error" && (
                <span className="text-red-400">
                  ❌ Erreur. Vérifie le sujet / message, ou réessaie.
                </span>
              )}
            </div>

            <button
              onClick={handleSend}
              disabled={sending}
              className={`
                px-5 py-2.5 rounded-xl text-sm font-medium transition
                ${
                  sending
                    ? "bg-slate-800 text-slate-400 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white"
                }
              `}
            >
              {sending ? "Envoi…" : "Envoyer"}
            </button>
          </div>
        </div>

        <div className="text-[11px] text-slate-500">
          Astuce : si tu demandes un changement de cibles, indique : zone, secteurs, taille, intitulés de postes, exclusions.
        </div>
      </div>
    </div>
  );
}