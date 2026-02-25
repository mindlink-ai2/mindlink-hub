"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import {
  flushAnalyticsQueue,
  resetAnalyticsSession,
  setAnalyticsRuntimeEnabled,
  trackApiError,
  trackClick,
  trackFeatureUsed,
  trackFormSubmit,
  trackPageView,
  trackSessionEnd,
  trackSessionStart,
  trackTimeOnPage,
  trackUiError,
} from "@/lib/analytics/client";

type AnalyticsBootstrapProps = {
  enabled: boolean;
};

type RouteState = {
  path: string;
  enteredAt: number;
};

function truncate(value: string, max = 320): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function toTrackedPath(urlLike: string): string {
  try {
    const parsed = new URL(urlLike, window.location.origin);
    return parsed.pathname;
  } catch {
    return urlLike.split("?")[0] ?? urlLike;
  }
}

export default function AnalyticsBootstrap({ enabled }: AnalyticsBootstrapProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn } = useAuth();

  const routeStateRef = useRef<RouteState | null>(null);
  const sessionStartedRef = useRef(false);
  const lastSessionEndAtRef = useRef(0);
  const fetchPatchedRef = useRef(false);

  const routePath = useMemo(() => {
    const query = searchParams?.toString() ?? "";
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  const trackingEnabled = enabled && isLoaded && isSignedIn;

  useEffect(() => {
    setAnalyticsRuntimeEnabled(Boolean(trackingEnabled));
    if (!isLoaded || isSignedIn) return;
    resetAnalyticsSession();
  }, [isLoaded, isSignedIn, trackingEnabled]);

  useEffect(() => {
    if (!trackingEnabled) return;
    if (!pathname) return;

    const now = Date.now();
    const previous = routeStateRef.current;

    if (!sessionStartedRef.current) {
      trackSessionStart(pathname);
      sessionStartedRef.current = true;
    }

    if (previous && previous.path !== pathname) {
      trackTimeOnPage(previous.path, now - previous.enteredAt);
    }

    trackPageView(pathname);

    if (pathname.startsWith("/dashboard/inbox")) {
      trackFeatureUsed("open_inbox", { source: "route_change" });
    }

    routeStateRef.current = { path: pathname, enteredAt: now };
  }, [pathname, routePath, trackingEnabled]);

  useEffect(() => {
    if (!trackingEnabled) return;

    const finalizeSession = () => {
      const now = Date.now();
      if (now - lastSessionEndAtRef.current < 1200) return;
      lastSessionEndAtRef.current = now;

      const routeState = routeStateRef.current;
      if (routeState) {
        trackTimeOnPage(routeState.path, now - routeState.enteredAt);
        routeStateRef.current = { path: routeState.path, enteredAt: now };
      }

      trackSessionEnd(routeState?.path);
      void flushAnalyticsQueue({ useBeacon: true });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        finalizeSession();
      }
      if (document.visibilityState === "visible" && routeStateRef.current) {
        routeStateRef.current.enteredAt = Date.now();
      }
    };

    window.addEventListener("beforeunload", finalizeSession);
    window.addEventListener("pagehide", finalizeSession);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", finalizeSession);
      window.removeEventListener("pagehide", finalizeSession);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [trackingEnabled]);

  useEffect(() => {
    if (!trackingEnabled) return;

    const onWindowError = (event: ErrorEvent) => {
      trackUiError(event.message || "window_error", {
        source: "window.onerror",
        filename: event.filename ? truncate(event.filename, 180) : null,
        lineno: event.lineno ?? null,
        colno: event.colno ?? null,
        stack:
          event.error && typeof event.error.stack === "string"
            ? truncate(event.error.stack, 600)
            : null,
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason =
        typeof event.reason === "string"
          ? event.reason
          : event.reason instanceof Error
          ? event.reason.message
          : "unhandled_rejection";

      trackUiError(reason, {
        source: "window.unhandledrejection",
        stack:
          event.reason instanceof Error && typeof event.reason.stack === "string"
            ? truncate(event.reason.stack, 600)
            : null,
      });
    };

    const onSubmit = (event: Event) => {
      const target = event.target as HTMLFormElement | null;
      if (!target) return;
      const formId =
        target.getAttribute("data-analytics-form") ||
        target.id ||
        target.getAttribute("name") ||
        target.getAttribute("action") ||
        "form";

      trackFormSubmit(formId, "submitted", {
        source: "dom_submit_capture",
        page: pathname || null,
      });
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const clickable = target.closest("button, a, [role='button'], input[type='submit']");
      if (!clickable) return;

      const type = clickable.tagName.toLowerCase();
      const analyticsId = clickable.getAttribute("data-analytics-id") || clickable.id || undefined;
      const analyticsLabel =
        clickable.getAttribute("data-analytics-label") ||
        clickable.getAttribute("aria-label") ||
        undefined;
      const href =
        clickable instanceof HTMLAnchorElement
          ? clickable.getAttribute("href") || undefined
          : clickable.getAttribute("href") || undefined;

      trackClick(
        {
          type,
          id: analyticsId,
          text: analyticsLabel,
          href: href ? toTrackedPath(href) : undefined,
        },
        {
          source: "dom_click_capture",
          page: pathname || null,
        }
      );

      const feature = clickable.getAttribute("data-analytics-feature");
      if (feature) {
        trackFeatureUsed(feature, {
          source: "click_feature_capture",
          page: pathname || null,
        });
      }
    };

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("click", onClick, true);

    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [pathname, trackingEnabled]);

  useEffect(() => {
    if (!trackingEnabled) return;
    if (fetchPatchedRef.current) return;
    if (typeof window === "undefined") return;

    const originalFetch = window.fetch.bind(window);
    fetchPatchedRef.current = true;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.toString()
          : input.url;
      const trackedPath = toTrackedPath(url);

      try {
        const response = await originalFetch(input, init);
        if (trackedPath.startsWith("/api/") && response.status >= 500) {
          trackApiError(trackedPath, response.status, {
            source: "fetch_patch",
            method,
          });
        }
        return response;
      } catch (error) {
        if (trackedPath.startsWith("/api/")) {
          trackApiError(trackedPath, undefined, {
            source: "fetch_patch",
            method,
            message: error instanceof Error ? truncate(error.message, 200) : "network_error",
          });
        }
        throw error;
      }
    };

    return () => {
      window.fetch = originalFetch;
      fetchPatchedRef.current = false;
    };
  }, [trackingEnabled]);

  return null;
}
