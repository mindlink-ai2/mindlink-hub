"use client";

import { useState } from "react";

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
    <div className="max-w-3xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-semibold text-white">
          Facturation & abonnement
        </h1>
        <p className="text-sm text-gray-400 mt-2">
          Gérez votre abonnement Mindlink en toute simplicité.
        </p>
      </div>

      {/* Card */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#0b1220] to-[#0a0f1a] p-8 shadow-lg">
        <div className="flex flex-col gap-6">
          {/* Plan info */}
          <div>
            <h2 className="text-lg font-medium text-white">
              Passer à l’offre Premium
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              Débloquez Google Maps, plus de flexibilité sur les cibles et un
              assistant commercial plus avancé.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-4">
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

          {/* Footer */}
          <div className="text-xs text-gray-500 pt-2">
            Paiement sécurisé via Stripe · Sans engagement · Annulable à tout
            moment
          </div>
        </div>
      </div>
    </div>
  );
}