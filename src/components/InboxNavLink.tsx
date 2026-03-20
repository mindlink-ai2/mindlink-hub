"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { INBOX_GLOBAL_SYNC_EVENT, INBOX_SYNC_INTERVAL_MS } from "@/lib/inbox-events";
import { queryKeys } from "@/lib/query-keys";
import { supabase } from "@/lib/supabase";

function formatUnreadTotal(total: number): string {
  if (total > 99) return "99+";
  return String(total);
}

export default function InboxNavLink() {
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState<string | null>(null);
  const [totalUnread, setTotalUnread] = useState(0);

  const loadUnreadCount = useCallback(async () => {
    try {
      const data = await queryClient.fetchQuery({
        queryKey: queryKeys.inboxUnreadCount(),
        queryFn: async () => {
          const res = await fetch("/api/inbox/unread-count");
          if (!res.ok) return { total: 0 };
          return res.json();
        },
        staleTime: 10 * 1000,
      });

      const nextTotal = Number(data?.total ?? 0);
      setTotalUnread(Number.isFinite(nextTotal) && nextTotal > 0 ? nextTotal : 0);
    } catch {
      setTotalUnread(0);
    }
  }, [queryClient]);

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
        const data = await queryClient.fetchQuery({
          queryKey: queryKeys.inboxClientId(),
          queryFn: async () => {
            const res = await fetch("/api/inbox/client");
            if (!res.ok) return null;
            return res.json();
          },
          staleTime: 30 * 60 * 1000,
        });
        if (!data?.clientId) return;
        setClientId(String(data.clientId));
      } catch {
        // no-op
      }
    })();
  }, [queryClient]);

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

  useEffect(() => {
    if (!clientId) return;

    const handleGlobalInboxSync = () => {
      void loadUnreadCount();
    };

    window.addEventListener(INBOX_GLOBAL_SYNC_EVENT, handleGlobalInboxSync);

    return () => {
      window.removeEventListener(INBOX_GLOBAL_SYNC_EVENT, handleGlobalInboxSync);
    };
  }, [clientId, loadUnreadCount]);

  useEffect(() => {
    if (!clientId) return;

    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      void loadUnreadCount();
    };

    refreshIfVisible();

    const intervalId = window.setInterval(refreshIfVisible, INBOX_SYNC_INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [clientId, loadUnreadCount]);

  return (
    <Link
      href="/dashboard/inbox"
      className="inline-flex items-center gap-1.5 rounded-full border border-transparent px-3 py-1.5 transition hover:border-[#d7e3f4] hover:bg-[#f3f8ff] hover:text-[#0b1c33]"
    >
      <span>Messagerie</span>
      {totalUnread > 0 ? (
        <span className="rounded-full border border-[#9cc0ff] bg-white px-1.5 py-0.5 text-[10px] font-semibold leading-none text-[#1f5eff]">
          {formatUnreadTotal(totalUnread)}
        </span>
      ) : null}
    </Link>
  );
}
