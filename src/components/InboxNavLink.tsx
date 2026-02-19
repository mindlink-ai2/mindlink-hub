"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

function formatUnreadTotal(total: number): string {
  if (total > 99) return "99+";
  return String(total);
}

export default function InboxNavLink() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [totalUnread, setTotalUnread] = useState(0);

  const loadUnreadCount = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox/unread-count", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTotalUnread(0);
        return;
      }

      const nextTotal = Number(data?.total ?? 0);
      setTotalUnread(Number.isFinite(nextTotal) && nextTotal > 0 ? nextTotal : 0);
    } catch {
      setTotalUnread(0);
    }
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadUnreadCount();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [loadUnreadCount]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/inbox/client", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.clientId) return;
        setClientId(String(data.clientId));
      } catch {
        // no-op
      }
    })();
  }, []);

  useEffect(() => {
    if (!clientId) return;

    const channel = supabase
      .channel(`inbox-unread-nav-${clientId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inbox_threads",
          filter: `client_id=eq.${clientId}`,
        },
        () => {
          void loadUnreadCount();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [clientId, loadUnreadCount]);

  return (
    <Link
      href="/dashboard/inbox"
      className="inline-flex items-center gap-1.5 rounded-full border border-transparent px-3 py-1.5 transition hover:border-[#d7e3f4] hover:bg-[#f3f8ff] hover:text-[#0b1c33]"
    >
      <span>Inbox</span>
      {totalUnread > 0 ? (
        <span className="rounded-full border border-[#9cc0ff] bg-white px-1.5 py-0.5 text-[10px] font-semibold leading-none text-[#1f5eff]">
          {formatUnreadTotal(totalUnread)}
        </span>
      ) : null}
    </Link>
  );
}
