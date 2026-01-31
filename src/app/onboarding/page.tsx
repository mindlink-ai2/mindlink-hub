"use client";

import { useState } from "react";
import { useUser, SignedIn, SignedOut, RedirectToSignIn } from "@clerk/nextjs";

type FormState = {
  submitted_at: string; // auto
  full_name: string;
  email: string; // forced from Clerk
  phone: string;
  company: string;
  target_company_type: string;
  target_industry: string;
  target_geo_france: string;
  target_company_size: string;
  target_personas_titles: string;
  ideal_targets: string;
  value_promise: string;
};

export default function OnboardingPage() {
  return (
    <>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>

      <SignedIn>
        <OnboardingForm />
      </SignedIn>
    </>
  );
}

function OnboardingForm() {
  const { user } = useUser();

  const clerkEmail = user?.primaryEmailAddress?.emailAddress || "";
  const clerkName =
    (user?.fullName ||
      [user?.firstName, user?.lastName].filter(Boolean).join(" "))?.trim() || "";

  const [form, setForm] = useState<FormState>({
    submitted_at: new Date().toISOString(),
    full_name: clerkName,
    email: clerkEmail,
    phone: "",
    company: "",
    target_company_type: "",
    target_industry: "",
    target_geo_france: "",
    target_company_size: "",
    target_personas_titles: "",
    ideal_targets: "",
    value_promise: "",
  });

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<null | { ok: boolean; msg: string }>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);

    try {
      // Reforce côté front : email = email Clerk
      const payload = {
        ...form,
        submitted_at: new Date().toISOString(),
        email: clerkEmail,
        full_name: form.full_name || clerkName,
      };

      const res = await fetch("/api/onboarding/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setStatus({ ok: false, msg: data?.error || "Erreur lors de l’envoi." });
        return;
      }

      setStatus({ ok: true, msg: "Parfait ✅ On a bien reçu tes infos." });
    } catch {
      setStatus({ ok: false, msg: "Erreur réseau. Réessaie." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-semibold">Questionnaire d’onboarding</h1>
        <p className="mt-2 text-sm text-gray-600">
          Ces infos déclenchent nos automatisations (n8n) et accélèrent la mise en place.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <Field label="Nom prénom" required>
            <input
              className="w-full rounded-xl border px-3 py-2"
              value={form.full_name}
              onChange={(e) => update("full_name", e.target.value)}
              required
            />
          </Field>

          <Field label="E-mail (doit être le même que celui avec lequel vous avez payé)" required>
            <input
              className="w-full rounded-xl border px-3 py-2 bg-gray-50"
              value={clerkEmail}
              readOnly
            />
            <p className="mt-1 text-xs text-gray-500">
              Cet email est verrouillé car lié à ton compte.
            </p>
          </Field>

          <Field label="Téléphone" required>
            <input
              className="w-full rounded-xl border px-3 py-2"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              required
              placeholder="+33..."
            />
          </Field>

          <Field label="Entreprise" required>
            <input
              className="w-full rounded-xl border px-3 py-2"
              value={form.company}
              onChange={(e) => update("company", e.target.value)}
              required
            />
          </Field>

          <Field label="Quel type d’entreprise souhaitez-vous cibler ?" required>
            <input
              className="w-full rounded-xl border px-3 py-2"
              value={form.target_company_type}
              onChange={(e) => update("target_company_type", e.target.value)}
              required
              placeholder="PME, grands groupes, indépendants..."
            />
          </Field>

          <Field label="Secteur d’activité visé" required>
            <input
              className="w-full rounded-xl border px-3 py-2"
              value={form.target_industry}
              onChange={(e) => update("target_industry", e.target.value)}
              required
              placeholder="Ex: formation, retail, SaaS..."
            />
          </Field>

          <Field label="Dans quelle zone géographique souhaitez-vous cibler vos prospects en France ?" required>
            <input
              className="w-full rounded-xl border px-3 py-2"
              value={form.target_geo_france}
              onChange={(e) => update("target_geo_france", e.target.value)}
              required
              placeholder="Ex: Île-de-France, Lyon + 50km..."
            />
          </Field>

          <Field label="Taille d’entreprise recherchée" required>
            <input
              className="w-full rounded-xl border px-3 py-2"
              value={form.target_company_size}
              onChange={(e) => update("target_company_size", e.target.value)}
              required
              placeholder="Ex: 1-10, 11-50, 51-200, 200+..."
            />
          </Field>

          <Field label="Quelles personnes souhaitez-vous contacter ? (poste)" required>
            <input
              className="w-full rounded-xl border px-3 py-2"
              value={form.target_personas_titles}
              onChange={(e) => update("target_personas_titles", e.target.value)}
              required
              placeholder="Ex: DRH, Responsable formation, CEO"
            />
          </Field>

          <Field label="Vos cibles idéales" required>
            <textarea
              className="w-full rounded-xl border px-3 py-2"
              value={form.ideal_targets}
              onChange={(e) => update("ideal_targets", e.target.value)}
              required
              rows={4}
              placeholder="Décris les entreprises / cas d’usage / signaux..."
            />
          </Field>

          <Field label="Quelle promesse faites-vous à vos clients, pourquoi travailleraient-ils avec vous ?" required>
            <textarea
              className="w-full rounded-xl border px-3 py-2"
              value={form.value_promise}
              onChange={(e) => update("value_promise", e.target.value)}
              required
              rows={4}
              placeholder="Promesse, bénéfices, différenciation..."
            />
          </Field>

          <button
            disabled={loading}
            className="w-full rounded-xl bg-black px-4 py-2 text-white disabled:opacity-60"
          >
            {loading ? "Envoi..." : "Envoyer"}
          </button>

          {status && (
            <div className={`rounded-xl p-3 text-sm ${status.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {status.msg}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-sm font-medium">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </div>
      {children}
    </label>
  );
}