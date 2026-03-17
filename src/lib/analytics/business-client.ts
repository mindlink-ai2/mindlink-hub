"use client";

export type BusinessEventCategory =
  | "auth"
  | "prospects"
  | "messaging"
  | "navigation"
  | "crm";

export type BusinessEventType =
  | "login"
  | "logout"
  | "session_start"
  | "session_end"
  | "prospects_received"
  | "prospects_list_viewed"
  | "prospect_detail_viewed"
  | "prospects_exported"
  | "prospects_filtered"
  | "message_sent"
  | "connection_request_sent"
  | "reply_received"
  | "message_template_viewed"
  | "message_template_edited"
  | "page_viewed"
  | "dashboard_viewed"
  | "settings_viewed"
  | "lead_status_changed"
  | "note_added"
  | "lead_archived";

type QueuedEvent = {
  event_type: BusinessEventType;
  event_category: BusinessEventCategory;
  metadata?: Record<string, unknown>;
  session_id: string;
};

const SESSION_KEY = "lidmeo_biz_session_id";
const FLUSH_INTERVAL_MS = 5000;

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let id = window.localStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `biz_${Math.random().toString(36).slice(2)}_${Date.now()}`;
      window.localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `biz_${Date.now()}`;
  }
}

async function dispatchQueue(events: QueuedEvent[]): Promise<void> {
  try {
    await fetch("/api/analytics/business-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      keepalive: true,
      body: JSON.stringify({ events }),
    });
  } catch {
    // silent
  }
}

export async function flushBusinessQueue(): Promise<void> {
  if (flushing || queue.length === 0) return;
  flushing = true;
  const batch = queue.splice(0, queue.length);
  flushing = false;
  await dispatchQueue(batch);
}

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushBusinessQueue();
  }, FLUSH_INTERVAL_MS);
}

function setupBeforeUnload(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeunload", () => {
    if (queue.length === 0) return;
    const batch = queue.splice(0, queue.length);
    try {
      const blob = new Blob([JSON.stringify({ events: batch })], {
        type: "application/json",
      });
      navigator.sendBeacon("/api/analytics/business-events", blob);
    } catch {
      // silent
    }
  });
}

if (typeof window !== "undefined") {
  setupBeforeUnload();
}

export function trackBusinessEvent(
  eventType: BusinessEventType,
  category: BusinessEventCategory,
  metadata?: Record<string, unknown>
): void {
  if (typeof window === "undefined") return;
  try {
    queue.push({
      event_type: eventType,
      event_category: category,
      metadata: metadata ?? {},
      session_id: getSessionId(),
    });
    scheduleFlush();
  } catch {
    // silent
  }
}
