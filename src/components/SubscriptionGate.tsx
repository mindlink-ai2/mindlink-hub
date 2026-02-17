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
    (async () => {
      try {
        const res = await fetch("/api/subscription-status", { cache: "no-store" });
        const data = await res.json();
        setStatus(data?.subscription_status ?? null);
      } catch {
        setStatus(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const normalized = (status || "").toLowerCase();
  const isBlocked =
    normalized === "attente" ||
    normalized === "past_due" ||
    normalized === "canceled";

  if (loading) return <>{children}</>;
  if (!isBlocked) return <>{children}</>;

  return (
    <div className="relative">
      <div className="pointer-events-none select-none blur-sm opacity-60">
        {children}
      </div>

      <div className="fixed inset-0 flex items-center justify-center p-6">
        <div className="w-full max-w-xl rounded-3xl border border-[#d9e6ff] bg-white/95 p-6 shadow-2xl shadow-[#3f73df]/20 backdrop-blur">
          <div className="text-lg font-semibold text-[#10284d]">Paiement en attente</div>

          <p className="mt-2 text-sm text-[#52698f]">
            Ton paiement est actuellement en <b>attente</b>. L’accès au Hub est temporairement
            désactivé. Pour récupérer l’accès (dashboard, prospection, relances…), merci de
            régulariser le paiement.
          </p>

          <div className="mt-4 rounded-2xl border border-[#dce7ff] bg-[#f6f9ff] p-4 text-sm text-[#52698f]">
            Contacte-nous :{" "}
            <a
              className="font-semibold text-[#265fcf] underline underline-offset-4 hover:text-[#1c4eae]"
              href={`mailto:${supportEmail}?subject=Lidmeo%20-%20Paiement%20en%20attente`}
            >
              {supportEmail}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
