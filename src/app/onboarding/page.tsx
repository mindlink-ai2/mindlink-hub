"use client";

import { useMemo, useState } from "react";
import { useUser, SignedIn, SignedOut, RedirectToSignIn } from "@clerk/nextjs";

const COMPANY_SIZE_OPTIONS = [
  "1-10",
  "11-20",
  "21-50",
  "51-100",
  "101-200",
  "201-500",
  "501-1000",
  "1001-2000",
  "2001-5000",
  "5001-10000",
  "10001+",
] as const;

type CompanySize = (typeof COMPANY_SIZE_OPTIONS)[number];

type FormState = {
  submitted_at: string;
  full_name: string;
  email: string; // forcé depuis Clerk
  phone: string;
  company: string;
  target_company_type: string;
  target_industry: string;
  target_geo_france: string;
  target_company_size: CompanySize[]; // ✅ checkboxes
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
    target_company_size: [],
    target_personas_titles: "",
    ideal_targets: "",
    value_promise: "",
  });

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<null | { ok: boolean; msg: string }>(null);

  const progress = useMemo(() => {
    const total = 10;
    let done = 0;

    if (form.phone) done++;
    if (form.company) done++;
    if (form.target_company_type) done++;
    if (form.target_industry) done++;
    if (form.target_geo_france) done++;
    if (form.target_company_size.length) done++;
    if (form.target_personas_titles) done++;
    if (form.ideal_targets) done++;
    if (form.value_promise) done++;
    if (form.full_name) done++;

    const requiredFilled =
      !!form.full_name &&
      !!clerkEmail &&
      !!form.phone &&
      !!form.company &&
      !!form.target_company_type &&
      !!form.target_industry &&
      !!form.target_geo_france &&
      form.target_company_size.length > 0 &&
      !!form.target_personas_titles &&
      !!form.ideal_targets &&
      !!form.value_promise;

    return { done, total, requiredFilled };
  }, [form, clerkEmail]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  function toggleCompanySize(v: CompanySize) {
    setForm((p) => {
      const exists = p.target_company_size.includes(v);
      return {
        ...p,
        target_company_size: exists
          ? p.target_company_size.filter((x) => x !== v)
          : [...p.target_company_size, v],
      };
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);

    try {
      const payload = {
        ...form,
        submitted_at: new Date().toISOString(),
        email: clerkEmail, // 🔒 forcé
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

      setStatus({
        ok: true,
        msg: "Merci, c’est bien reçu ✅ Notre équipe va pouvoir lancer la configuration sur des bases claires.",
      });
    } catch {
      setStatus({ ok: false, msg: "Erreur réseau. Réessaie dans 30 secondes." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#070A12]">
      {/* HERO */}
      <div className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 opacity-60">
          <div className="absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-gradient-to-r from-[#2b6cff]/30 via-[#00d4ff]/10 to-[#2b6cff]/30 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-5xl px-4 py-10">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Espace client — onboarding
              </p>

              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">
                Paramétrage de votre prospection
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-white/70">
                Ces informations nous permettent de configurer votre ciblage et d’assurer une mise en place propre dès le départ.
              </p>
            </div>

            <div className="hidden min-w-[220px] rounded-2xl border border-white/10 bg-white/5 p-4 sm:block">
              <p className="text-xs text-white/60">Progress</p>
              <p className="mt-1 text-2xl font-semibold text-white">
                {progress.done}/{progress.total}
              </p>
              <div className="mt-3 h-2 w-full rounded-full bg-white/10">
                <div
                  className="h-2 rounded-full bg-white"
                  style={{
                    width: `${Math.min(100, Math.round((progress.done / progress.total) * 100))}%`,
                  }}
                />
              </div>
              <p className="mt-2 text-xs text-white/60">
                Plus le ciblage est précis, plus les leads sont qualifiés.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* FORM */}
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 px-4 py-10 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <form
            onSubmit={onSubmit}
            className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
          >
            <SectionTitle
              title="Informations du compte"
              subtitle="Ces éléments nous permettent d’identifier votre abonnement et d’assurer un suivi fiable."
            />

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Nom et prénom"
                required
                value={form.full_name}
                onChange={(v) => update("full_name", v)}
                placeholder="Ex: Marie Dupont"
              />
              <Input
                label="E-mail (utilisé lors du paiement)"
                required
                value={clerkEmail}
                readOnly
                helper="Cet e-mail est verrouillé car il correspond à votre compte."
              />
              <Input
                label="Téléphone"
                required
                value={form.phone}
                onChange={(v) => update("phone", v)}
                placeholder="+33..."
              />
              <Input
                label="Entreprise"
                required
                value={form.company}
                onChange={(v) => update("company", v)}
                placeholder="Nom de votre entreprise"
              />
            </div>

            <Divider />

            <SectionTitle
              title="Ciblage"
              subtitle="Définissez précisément qui vous souhaitez contacter. C’est la base de la qualité des prospects."
            />

            <div className="mt-5 grid grid-cols-1 gap-4">
              <Input
                label="Type d’entreprise ciblée"
                required
                value={form.target_company_type}
                onChange={(v) => update("target_company_type", v)}
                placeholder="Ex: PME, grands groupes, indépendants..."
              />

              <Input
                label="Secteur d’activité"
                required
                value={form.target_industry}
                onChange={(v) => update("target_industry", v)}
                placeholder="Ex: formation, immobilier, industrie..."
              />

              <Input
                label="Zones géographiques ciblées (France)"
                required
                value={form.target_geo_france}
                onChange={(v) => update("target_geo_france", v)}
                placeholder="Ex : 75, 92-95, 13, 69"
                helper="Indique des départements ou des plages. Exemple : 75, 92-95. Plus c’est précis, plus c’est qualifié."
              />
            </div>

            {/* ✅ Checkboxes sizes */}
            <div className="mt-5">
              <Label required>Taille d’entreprise recherchée</Label>
              <p className="mt-1 text-xs text-white/55">
                Sélectionnez une ou plusieurs tailles. Cela nous aide à éviter les sociétés hors périmètre.
              </p>

              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {COMPANY_SIZE_OPTIONS.map((opt) => {
                  const active = form.target_company_size.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggleCompanySize(opt)}
                      className={[
                        "group flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition",
                        active
                          ? "border-white/30 bg-white/10 text-white"
                          : "border-white/10 bg-white/5 text-white/80 hover:border-white/20 hover:bg-white/7",
                      ].join(" ")}
                    >
                      <span className="text-sm font-medium">{opt}</span>
                      <span
                        className={[
                          "flex h-5 w-5 items-center justify-center rounded-md border transition",
                          active ? "border-white bg-white text-black" : "border-white/20 text-transparent",
                        ].join(" ")}
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <Divider />

            <SectionTitle
              title="Personas & message"
              subtitle="Ces réponses servent à calibrer le bon profil de contact et le bon angle de prise de contact."
            />

            <div className="mt-5 grid grid-cols-1 gap-4">
              <Input
                label="Fonctions / postes à contacter"
                required
                value={form.target_personas_titles}
                onChange={(v) => update("target_personas_titles", v)}
                placeholder="Ex: DRH, Responsable formation, CEO"
              />

              <Textarea
                label="Vos cibles idéales"
                required
                value={form.ideal_targets}
                onChange={(v) => update("ideal_targets", v)}
                placeholder="Décrivez votre cible idéale : typologie, signaux, contexte, objections fréquentes…"
                rows={4}
              />

              <Textarea
                label="Votre promesse (pourquoi vous choisir)"
                required
                value={form.value_promise}
                onChange={(v) => update("value_promise", v)}
                placeholder="Bénéfice concret, différenciation, preuves (résultats, méthode, références)…"
                rows={4}
              />
            </div>

            <div className="mt-6 flex flex-col gap-3">
              <button
                disabled={loading}
                className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-60"
              >
                {loading ? "Envoi..." : "Envoyer"}
              </button>

              {status && (
                <div
                  className={[
                    "rounded-2xl border p-3 text-sm",
                    status.ok
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                      : "border-red-500/30 bg-red-500/10 text-red-200",
                  ].join(" ")}
                >
                  {status.msg}
                </div>
              )}
            </div>
          </form>
        </div>

        {/* RIGHT SIDE */}
        <div className="lg:col-span-4">
          <div className="sticky top-6 space-y-4">
            <Card>
              <h3 className="text-base font-semibold text-white">Ce que Lidmeo fait ensuite</h3>
              <ul className="mt-3 space-y-2 text-sm text-white/70">
                <li>• Vérification de la cohérence du ciblage</li>
                <li>• Paramétrage de votre configuration dans l’outil</li>
                <li>• Lancement de la prospection selon votre rythme</li>
              </ul>
              <p className="mt-3 text-xs text-white/50">
                Vos informations restent confidentielles et ne sont utilisées que pour configurer votre compte.
              </p>
            </Card>

            <Card>
              <h3 className="text-base font-semibold text-white">Conseil</h3>
              <p className="mt-2 text-sm text-white/70">
                La qualité des leads dépend d’abord de la précision du ciblage : secteur, taille, zone et postes. Prenez 2 minutes pour être spécifique.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- UI atoms (sans dépendance) ---------- */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      {children}
    </div>
  );
}

function Divider() {
  return <div className="my-7 h-px w-full bg-white/10" />;
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mt-1 text-sm text-white/60">{subtitle}</p>
    </div>
  );
}

function Label({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="text-sm font-medium text-white">
      {children} {required ? <span className="text-red-400">*</span> : null}
    </div>
  );
}

function Input({
  label,
  required,
  value,
  onChange,
  placeholder,
  readOnly,
  helper,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  helper?: string;
}) {
  return (
    <div>
      <Label required={required}>{label}</Label>
      <input
        className={[
          "mt-2 w-full rounded-2xl border px-4 py-3 text-sm text-white outline-none transition",
          readOnly
            ? "border-white/10 bg-white/5 text-white/60"
            : "border-white/10 bg-white/5 focus:border-white/30 focus:bg-white/7",
        ].join(" ")}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
      />
      {helper ? <p className="mt-1 text-xs text-white/50">{helper}</p> : null}
    </div>
  );
}

function Textarea({
  label,
  required,
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div>
      <Label required={required}>{label}</Label>
      <textarea
        className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-white/30 focus:bg-white/7"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
      />
    </div>
  );
}