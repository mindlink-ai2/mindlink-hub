"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  trackBusinessEvent,
  flushBusinessQueue,
} from "@/lib/analytics/business-client";

export default function BusinessTracker() {
  const pathname = usePathname();
  const sessionStarted = useRef(false);

  // Fire session_start once on mount
  useEffect(() => {
    if (sessionStarted.current) return;
    sessionStarted.current = true;
    trackBusinessEvent("session_start", "auth");
  }, []);

  // Track page views on route change
  useEffect(() => {
    trackBusinessEvent("page_viewed", "navigation", { path: pathname });
  }, [pathname]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      void flushBusinessQueue();
    };
  }, []);

  return null;
}
