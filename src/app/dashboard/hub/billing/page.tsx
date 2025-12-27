"use client";

import { useState } from "react";
import { Check } from "lucide-react";

export default function BillingPage() {
  const [loading, setLoading] = useState<"premium" | "portal" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upgradeToPremium = async () => {
    setError(null);
    setLoading("premium");

    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "premium" }),
    });

    const data = await res.json();

    if (data.url) {
      window.location.href = data.url;
    } else {
      setError(data.error || "Une erreur est survenue lors du paiement.");
      setLoading(null);
    }
  };

  const openPortal = async () => {
    setError(null);
    setLoading("portal");

    const res = await fetch("/api/stripe/portal", { method: "POST" });
    const data = await res.json();

    if (data.url) {
      window.location.href = data.url;
    } else {
      setError(data.error || "Impossible d’ouvrir le portail de facturation.");
      setLoading(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-14">
      {/* Header */}
      <div className="mb-12">
        <h1 className="text-3xl font-semibold text-white">
          Facturation & abonnement
        </h1>
        <p className="text-gray-400 mt-2 max-w-xl">
          Gérez votre abonnement Mindlink, changez d’offre ou mettez à jour vos
          informations de paiement.
        </p>
      </div>

      {/* Main Card */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#0b1220] to-[#070b14] p-10 shadow-xl">
        {/* Glow */}
        <div className="absolute inset-0 bg-indigo-500/5 blur-3xl pointer-events-none" />

        <div className="relative flex flex-col gap-10">
          {/* Premium pitch */}
          <div>
            <h2 className="text-xl font-medium text-white">
              Passer à l’offre Premium
            </h2>
            <p className="text-gray-400 mt-2 max-w-2xl">
              Accédez à une prospection plus puissante et plus flexible pour
              générer davantage d’opportunités sans effort supplémentaire.
            </p>
          </div>

          {/* Benefits */}
          <ul className="grid sm:grid-cols-2 gap-4 text-sm text-gray-300">
            {[
              "Prospection Google Maps incluse",
              "Changement de cibles en illimité",
              "Assistant commercial plus avancé",
              "Meilleure priorisation des prospects",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check className="w-4 h-4 text-indigo-400 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-4 pt-2">
            <button
              onClick={upgradeToPremium}
              disabled={loading !== null}
              className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed px-6 py-3 text-sm font-medium text-white transition"
            >
              {loading === "premium"
                ? "Redirection vers le paiement…"
                : "Passer à Premium"}
            </button>

            <button
              onClick={openPortal}
              disabled={loading !== null}
              className="rounded-xl border border-white/15 hover:border-white/25 px-6 py-3 text-sm font-medium text-gray-200 transition"
            >
              {loading === "portal"
                ? "Ouverture du portail…"
                : "Gérer mon abonnement"}
            </button>
          </div>

          {/* Trust */}
          <div className="text-xs text-gray-500">
            Paiement sécurisé via Stripe · Sans engagement · Annulable à tout
            moment
          </div>
        </div>
      </div>
    </div>
  );
} 