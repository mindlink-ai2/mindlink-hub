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
      setServerMsg("Message envoyé, nous te recontactons dès que possible.");
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
    <div className="min-h-[calc(100vh-120px)] w-full">
      <div className="mx-auto w-full max-w-5xl">
        <section className="relative overflow-hidden rounded-[30px] border border-[#dbe7ff] bg-white/90 px-6 py-7 shadow-[0_28px_62px_-42px_rgba(54,102,203,0.5)] sm:px-8 sm:py-8">
          <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-[#e5eeff] blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-[#edf4ff] blur-3xl" />

          <div className="relative">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#d6e3fc] bg-[#f6f9ff] px-3 py-1 text-[11px] font-medium text-[#3f5f8e]">
                <span className="h-2 w-2 rounded-full bg-[#3771ed]" />
                Centre support
              </div>
              <h1 className="hub-page-title">
                Support
              </h1>
              <p className="max-w-2xl text-sm text-[#5d759c]">
                Envoie-nous un ticket: question, bug, changement de cibles ou
                règle mail.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {CATEGORIES.map((c) => {
                const isActive = c.id === form.category;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setField("category", c.id)}
                    className={[
                      "rounded-full border px-4 py-2 text-[12px] transition",
                      isActive
                        ? "border-[#b8cdf6] bg-[#edf4ff] text-[#224676]"
                        : "border-[#d8e4fb] bg-white text-[#60789f] hover:border-[#c1d4f7] hover:bg-[#f7faff] hover:text-[#264a79]",
                    ].join(" ")}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 text-[12px] text-[#6f87ad]">{active.hint}</div>

            <div className="mt-6 rounded-[24px] border border-[#d8e4fb] bg-white p-5 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-[12.5px]">
                  {sent === "ok" && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
                      {serverMsg ?? "Message envoyé."}
                    </div>
                  )}
                  {sent === "error" && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
                      {serverMsg ?? "Une erreur est survenue. Réessaie."}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handlePrefill}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[#d4e1fb] bg-[#f7faff] px-4 py-2 text-[12px] text-[#365786] transition hover:border-[#c0d3f8] hover:bg-[#edf4ff]"
                >
                  <span className="text-[13px]">✨</span>
                  Pré-remplir
                </button>
              </div>

              <div className="mt-5 space-y-2">
                <label className="text-[11px] uppercase tracking-wider text-[#6f88ae]">
                  Sujet
                </label>
                <input
                  value={form.subject}
                  onChange={(e) => setField("subject", e.target.value)}
                  placeholder={active.subjectPH}
                  className="w-full rounded-2xl border border-[#d5e2fb] bg-[#f9fbff] px-4 py-3.5 text-sm text-[#15345f] placeholder-[#8097bc] transition focus:border-[#b3caf4] focus:outline-none focus:ring-2 focus:ring-[#8eaef4]/35"
                />
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] uppercase tracking-wider text-[#6f88ae]">
                    Message
                  </label>
                  <div className="text-[11px] text-[#7d95ba]">
                    {messageCount} caractère{messageCount > 1 ? "s" : ""}
                  </div>
                </div>

                <textarea
                  value={form.message}
                  onChange={(e) => setField("message", e.target.value)}
                  placeholder={active.messagePH}
                  className="min-h-[220px] w-full resize-none rounded-2xl border border-[#d5e2fb] bg-[#f9fbff] px-4 py-4 text-sm text-[#15345f] placeholder-[#8097bc] transition focus:border-[#b3caf4] focus:outline-none focus:ring-2 focus:ring-[#8eaef4]/35"
                />
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-[11.5px] text-[#728ab0]">
                  Si c’est un bug, ajoute les étapes + (si possible) une capture.
                </div>

                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending}
                  className={[
                    "inline-flex items-center justify-center rounded-2xl px-6 py-3 text-sm font-medium transition",
                    sending
                      ? "cursor-not-allowed bg-[#dbe5fa] text-[#7e95b9]"
                      : "bg-[#316ded] text-white shadow-lg shadow-[#3b73eb]/25 hover:bg-[#255dd8]",
                  ].join(" ")}
                >
                  {sending ? "Envoi en cours…" : "Envoyer"}
                </button>
              </div>
            </div>

            <div className="mt-5 text-[11.5px] text-[#728ab0]">
              Tip cibles: zone + secteurs + taille + exclusions + 2 exemples.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
