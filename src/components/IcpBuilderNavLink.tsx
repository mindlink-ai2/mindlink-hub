"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { hasAckedPostTrial, POST_TRIAL_ACK_EVENT } from "@/lib/trial-events";

export default function IcpBuilderNavLink() {
  const [showBadge, setShowBadge] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/leads/quota", { cache: "no-store" });
      if (!res.ok) {
        setShowBadge(false);
        return;
      }
      const data = await res.json().catch(() => ({}));
      const essential = Boolean(data?.is_essential);
      const trialActive = Boolean(data?.is_trial_active);
      const trialEnds = typeof data?.trial_ends_at === "string" ? data.trial_ends_at : null;
      setShowBadge(
        essential && !trialActive && !!trialEnds && !hasAckedPostTrial(trialEnds)
      );
    } catch {
      setShowBadge(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handler = () => {
      setShowBadge(false);
    };
    window.addEventListener(POST_TRIAL_ACK_EVENT, handler);
    return () => window.removeEventListener(POST_TRIAL_ACK_EVENT, handler);
  }, []);

  return (
    <Link
      href="/dashboard/hub/icp-builder"
      className="relative inline-flex items-center gap-1.5 rounded-full border border-transparent px-3 py-1.5 transition hover:border-[#d7e3f4] hover:bg-[#f3f8ff] hover:text-[#0b1c33]"
    >
      <span>Mon ciblage</span>
      {showBadge ? (
        <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white shadow-[0_4px_8px_-4px_rgba(239,68,68,0.7)]">
          1
        </span>
      ) : null}
    </Link>
  );
}
