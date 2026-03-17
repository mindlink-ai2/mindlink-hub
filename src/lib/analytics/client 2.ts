"use client";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

type AnalyticsEnvelopeEvent = {
  session_id: string;
  event_name: string;
  event_category?: string;
  page_path?: string;
  referrer?: string;
  element?: Record<string, JsonValue>;
  metadata?: Record<string, JsonValue>;
  duration_ms?: number;
  occurred_at?: string;
  device?: {
    platform?: string;
    isMobile?: boolean;
  };
};

export type AnalyticsElementInput = {
  type?: string;
  id?: string;
  text?: string;
  href?: string;
};

export type AnalyticsTrackInput = {
  eventName: string;
  eventCategory?: string;
  pagePath?: string;
  referrer?: string;
  element?: AnalyticsElementInput;
  metadata?: Record<string, unknown>;
  durationMs?: number;
  occurredAt?: string;
};

const SESSION_ID_KEY = "lidmeo_session_id";
const SESSION_TS_KEY = "lidmeo_session_started_at";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const CLICK_THROTTLE_MS = 300;
const FLUSH_INTERVAL_MS = 5000;
const BATCH_SIZE = 10;

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /\+?\d[\d\s().-]{7,}\d/g;
const SENSITIVE_KEY_PATTERN = /(email|phone|message|body|content|password|token|authorization)/i;

const CLICK_SAMPLE_RATE = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_ANALYTICS_CLICK_SAMPLE_RATE ?? "0.5");
  if (!Number.isFinite(raw)) return 0.5;
  return Math.min(1, Math.max(0, raw));
})();

let runtimeEnabled = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === "true";
let flushTimer: number | null = null;
let lastClickAt = 0;
let queue: AnalyticsEnvelopeEvent[] = [];

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeString(value: string, max = 240): string {
  const withoutEmails = value.replace(EMAIL_PATTERN, "[redacted-email]");
  const withoutPhones = withoutEmails.replace(PHONE_PATTERN, "[redacted-phone]");
  if (withoutPhones.length <= max) return withoutPhones;
  return `${withoutPhones.slice(0, max - 1)}…`;
}

function sanitizeUnknown(value: unknown, depth = 0): JsonValue {
  if (value === null) return null;
  if (depth > 4) return "[truncated]";

  if (typeof value === "string") return sanitizeString(value, 320);
  if (typeof value === "boolean" || typeof value === "number") return value;

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeUnknown(item, depth + 1));
  }

  if (typeof value === "object") {
    const clean: Record<string, JsonValue> = {};
    Object.entries(value as Record<string, unknown>)
      .slice(0, 30)
      .forEach(([key, inner]) => {
        if (SENSITIVE_KEY_PATTERN.test(key)) return;
        clean[key] = sanitizeUnknown(inner, depth + 1);
      });
    return clean;
  }

  return sanitizeString(String(value), 120);
}

function sanitizePath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const noHash = trimmed.split("#")[0] ?? "";
  const noQuery = noHash.split("?")[0] ?? "";
  if (!noQuery) return undefined;
  return sanitizeString(noQuery, 420);
}

function isEnabled(): boolean {
  return runtimeEnabled && typeof window !== "undefined";
}

function createSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `sess_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

function getSessionId(): string {
  if (typeof window === "undefined") return createSessionId();

  try {
    const existingId = window.localStorage.getItem(SESSION_ID_KEY);
    const createdAt = Number(window.localStorage.getItem(SESSION_TS_KEY) ?? "0");
    const expired = !Number.isFinite(createdAt) || Date.now() - createdAt > SESSION_TTL_MS;

    if (existingId && !expired) {
      return existingId;
    }

    const nextId = createSessionId();
    window.localStorage.setItem(SESSION_ID_KEY, nextId);
    window.localStorage.setItem(SESSION_TS_KEY, String(Date.now()));
    return nextId;
  } catch {
    return createSessionId();
  }
}

function getDevicePayload(): { platform?: string; isMobile?: boolean } {
  if (typeof navigator === "undefined") return {};
  return {
    platform: sanitizeString(navigator.platform || "unknown", 80),
    isMobile: /mobile|android|iphone|ipad/i.test(navigator.userAgent),
  };
}

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushAnalyticsQueue();
  }, FLUSH_INTERVAL_MS);
}

async function dispatchEvents(
  events: AnalyticsEnvelopeEvent[],
  options?: { useBeacon?: boolean }
): Promise<boolean> {
  const payload = JSON.stringify({ events });
  const useBeacon = options?.useBeacon === true;

  if (useBeacon && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      const blob = new Blob([payload], { type: "application/json" });
      const ok = navigator.sendBeacon("/api/analytics/track", blob);
      if (ok) return true;
    } catch {
      // ignore, fallback to fetch
    }
  }

  try {
    const response = await fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      keepalive: useBeacon,
      body: payload,
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function flushAnalyticsQueue(options?: { useBeacon?: boolean }): Promise<void> {
  if (!isEnabled()) return;
  if (queue.length === 0) return;

  const pending = queue;
  queue = [];

  for (let idx = 0; idx < pending.length; idx += BATCH_SIZE) {
    const batch = pending.slice(idx, idx + BATCH_SIZE);
    const ok = await dispatchEvents(batch, options);
    if (!ok) {
      queue = [...batch, ...pending.slice(idx + BATCH_SIZE), ...queue];
      break;
    }
  }
}

function enqueue(event: AnalyticsEnvelopeEvent): void {
  queue.push(event);
  if (queue.length >= BATCH_SIZE) {
    void flushAnalyticsQueue();
    return;
  }
  scheduleFlush();
}

export function setAnalyticsRuntimeEnabled(enabled: boolean): void {
  runtimeEnabled = enabled;
  if (!runtimeEnabled) {
    queue = [];
    if (flushTimer !== null) {
      window.clearTimeout(flushTimer);
      flushTimer = null;
    }
  }
}

export function resetAnalyticsSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SESSION_ID_KEY);
    window.localStorage.removeItem(SESSION_TS_KEY);
  } catch {
    // ignore
  }
}

export function track(event: AnalyticsTrackInput): void {
  if (!isEnabled()) return;
  if (!event.eventName) return;

  try {
    const metadata = sanitizeUnknown(event.metadata ?? {});
    const finalMetadata =
      metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? (metadata as Record<string, JsonValue>)
        : undefined;

    const element = sanitizeUnknown(event.element ?? {});
    const finalElement =
      element && typeof element === "object" && !Array.isArray(element)
        ? (element as Record<string, JsonValue>)
        : undefined;

    const payload: AnalyticsEnvelopeEvent = {
      session_id: getSessionId(),
      event_name: sanitizeString(event.eventName, 80),
      event_category: event.eventCategory ? sanitizeString(event.eventCategory, 80) : undefined,
      page_path: sanitizePath(event.pagePath ?? window.location.pathname),
      referrer: sanitizePath(event.referrer),
      element: finalElement,
      metadata: finalMetadata,
      duration_ms:
        typeof event.durationMs === "number" && Number.isFinite(event.durationMs)
          ? Math.max(0, Math.round(event.durationMs))
          : undefined,
      occurred_at: event.occurredAt ?? nowIso(),
      device: getDevicePayload(),
    };

    const metadataSize = payload.metadata
      ? new Blob([JSON.stringify(payload.metadata)]).size
      : 0;
    if (metadataSize > 5 * 1024) {
      payload.metadata = { truncated: true };
    }

    enqueue(payload);
  } catch {
    // silent fallback
  }
}

export function trackPageView(pagePath?: string): void {
  track({
    eventName: "page_view",
    eventCategory: "navigation",
    pagePath: pagePath ?? (typeof window !== "undefined" ? window.location.pathname : undefined),
    referrer: typeof document !== "undefined" ? document.referrer : undefined,
  });
}

export function trackTimeOnPage(pagePath: string, durationMs: number): void {
  track({
    eventName: "time_on_page",
    eventCategory: "engagement",
    pagePath,
    durationMs,
  });
}

export function trackSessionStart(pagePath?: string): void {
  track({
    eventName: "session_start",
    eventCategory: "engagement",
    pagePath,
  });
}

export function trackSessionEnd(pagePath?: string): void {
  track({
    eventName: "session_end",
    eventCategory: "engagement",
    pagePath,
  });
}

export function trackFeatureUsed(feature: string, metadata?: Record<string, unknown>): void {
  track({
    eventName: "feature_used",
    eventCategory: "feature",
    metadata: {
      feature: sanitizeString(feature, 120),
      ...(metadata ?? {}),
    },
  });
}

export function trackFormSubmit(
  formId: string,
  status: "submitted" | "success" | "error",
  metadata?: Record<string, unknown>
): void {
  track({
    eventName: "form_submit",
    eventCategory: "engagement",
    metadata: {
      form: sanitizeString(formId, 120),
      status,
      ...(metadata ?? {}),
    },
  });
}

export function trackApiError(endpoint: string, status?: number, metadata?: Record<string, unknown>): void {
  track({
    eventName: "api_error",
    eventCategory: "error",
    pagePath: sanitizePath(endpoint),
    metadata: {
      endpoint: sanitizePath(endpoint),
      status: status ?? null,
      ...(metadata ?? {}),
    },
  });
}

export function trackUiError(message: string, metadata?: Record<string, unknown>): void {
  track({
    eventName: "ui_error",
    eventCategory: "error",
    metadata: {
      message: sanitizeString(message, 240),
      ...(metadata ?? {}),
    },
  });
}

export function trackClick(element: AnalyticsElementInput, metadata?: Record<string, unknown>): void {
  if (!isEnabled()) return;

  const now = Date.now();
  if (now - lastClickAt < CLICK_THROTTLE_MS) return;
  lastClickAt = now;

  if (Math.random() > CLICK_SAMPLE_RATE) return;

  track({
    eventName: "click",
    eventCategory: "engagement",
    element,
    metadata,
  });
}
