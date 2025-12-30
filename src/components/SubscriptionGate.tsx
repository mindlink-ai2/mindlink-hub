"use client";

import React, { useEffect, useState } from "react";

type Props = {
  children: React.ReactNode;
  supportEmail: string;
};

export default function SubscriptionGate({ children, supportEmail }: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch("/api/subscription-status", { cache: "no-store" });
        const data = await res.json();
        setStatus(data?.subscription_status ?? null);
      } catch (e) {
        setStatus(null);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const isPending = (status || "").toLowerCase() === "attente";

  // Pendant le chargement : on laisse la page normale (ou tu peux loader si tu veux)
  if (loading) return <>{children}</>;

  if (!isPending) return <>{children}</>;

  return (
    <div className="relative">
      {/* Contenu flouté + bloqué */}
      <div className="pointer-events-none select-none blur-sm opacity-60">
        {children}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-black/70 p-6 shadow-xl backdrop-blur">
          <div className="text-lg font-semibold">Paiement en attente</div>

          <p className="mt-2 text-sm text-white/80">
            Ton paiement est actuellement en <b>attente</b>. L’accès au Hub est temporairement désactivé.
            Pour récupérer l’accès (dashboard, prospection, relances…), merci de régulariser le paiement.
          </p>

          <div className="mt-4 rounded-xl bg-white/5 p-4 text-sm text-white/80">
            Contacte-nous :{" "}
            <a
              className="underline underline-offset-4 hover:text-white"
              href={`mailto:${supportEmail}?subject=Mindlink%20-%20Paiement%20en%20attente`}
            >
              {supportEmail}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}