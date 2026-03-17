"use client";

import { useCallback } from "react";
import {
  trackBusinessEvent,
  type BusinessEventCategory,
  type BusinessEventType,
} from "@/lib/analytics/business-client";

export function useTracking() {
  const trackEvent = useCallback(
    (
      eventType: BusinessEventType,
      category: BusinessEventCategory,
      metadata?: Record<string, unknown>
    ) => {
      trackBusinessEvent(eventType, category, metadata);
    },
    []
  );

  return { trackEvent };
}
