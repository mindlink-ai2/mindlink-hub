"use client";

import { useUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { INBOX_GLOBAL_SYNC_EVENT, INBOX_SYNC_INTERVAL_MS } from "@/lib/inbox-events";

function shouldRunGlobalInboxSync(pathname: string | null): boolean {
  if (!pathname) return false;
  if (!pathname.startsWith("/dashboard")) return false;
  if (pathname.startsWith("/dashboard/inbox")) return false;
  return true;
}

export default function InboxBackgroundSync() {
  const pathname = usePathname();
  const { isLoaded, isSignedIn } = useUser();
  const syncInFlightRef = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (!shouldRunGlobalInboxSync(pathname)) return;

    const runSyncIfVisible = async () => {
      if (document.visibilityState !== "visible") return;
      if (syncInFlightRef.current) return;
      syncInFlightRef.current = true;

      try {
        const res = await fetch("/api/inbox/sync", { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false) return;
        window.dispatchEvent(new CustomEvent(INBOX_GLOBAL_SYNC_EVENT));
      } catch {
        // no-op
      } finally {
        syncInFlightRef.current = false;
      }
    };

    void runSyncIfVisible();

    const intervalId = window.setInterval(() => {
      void runSyncIfVisible();
    }, INBOX_SYNC_INTERVAL_MS);

    const handleVisibilityChange = () => {
      void runSyncIfVisible();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isLoaded, isSignedIn, pathname]);

  return null;
}
