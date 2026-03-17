import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  normalizeUnipileBase,
  requireEnv,
  sendUnipileMessage,
} from "../_shared/unipile.ts";

const RUNNER_NAME = "followup-cron-runner";

// ── Timezone helpers (same pattern as linkedin-cron-runner) ───────────────────

type TimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getTimePartsInZone(date: Date, timezone: string): TimeParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map = new Map<string, string>();
  for (const part of parts) map.set(part.type, part.value);

  return {
    year: Number(map.get("year") ?? "0"),
    month: Number(map.get("month") ?? "1"),
    day: Number(map.get("day") ?? "1"),
    hour: Number(map.get("hour") ?? "0"),
    minute: Number(map.get("minute") ?? "0"),
    second: Number(map.get("second") ?? "0"),
  };
}

function getOffsetMs(date: Date, timezone: string): number {
  const parts = getTimePartsInZone(date, timezone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

function zonedToUtc(parts: TimeParts, timezone: string): Date {
  const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const offset = getOffsetMs(new Date(utcGuess), timezone);
  return new Date(utcGuess - offset);
}

/**
 * Returns the UTC bounds for "today" in a given timezone, plus the current time parts.
 */
function getTodayBoundsUtc(timezone: string): { startIso: string; endIso: string; nowParts: TimeParts } {
  const now = new Date();
  const nowParts = getTimePartsInZone(now, timezone);

  const start = zonedToUtc(
    { year: nowParts.year, month: nowParts.month, day: nowParts.day, hour: 0, minute: 0, second: 0 },
    timezone
  );

  const tomorrowUtc = new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day + 1));
  const tomorrowParts = getTimePartsInZone(tomorrowUtc, timezone);
  const end = zonedToUtc(
    { year: tomorrowParts.year, month: tomorrowParts.month, day: tomorrowParts.day, hour: 0, minute: 0, second: 0 },
    timezone
  );

  return { startIso: start.toISOString(), endIso: end.toISOString(), nowParts };
}

function isWithinWindow(nowMinutes: number, startMinutes: number, endMinutes: number): boolean {
  if (endMinutes <= startMinutes) return false;
  return nowMinutes >= startMinutes && nowMinutes < endMinutes;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function firstString(obj: JsonObject, paths: string[][]): string | null {
  for (const path of paths) {
    let current: unknown = obj;
    for (const key of path) {
      if (!current || typeof current !== "object" || Array.isArray(current)) { current = null; break; }
      current = (current as JsonObject)[key];
    }
    if (typeof current === "string" && current.trim()) return current.trim();
  }
  return null;
}

function truncatePreview(text: string | null | undefined, maxLength = 160): string | null {
  const value = String(text ?? "").trim();
  if (!value) return null;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

async function logAutomation(params: {
  supabase: ReturnType<typeof createClient>;
  clientId: string;
  action: string;
  status: string;
  leadId?: string | null;
  unipileAccountId?: string | null;
  details?: Record<string, unknown>;
}) {
  const { supabase, clientId, action, status, leadId = null, unipileAccountId = null, details = {} } = params;
  await supabase.from("automation_logs").insert({
    client_id: clientId,
    runner: RUNNER_NAME,
    action,
    status,
    lead_id: leadId,
    unipile_account_id: unipileAccountId,
    details,
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const cronSecret = requireEnv("LINKEDIN_CRON_SECRET");
    const providedSecret = req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret");

    if (providedSecret !== cronSecret) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));

    const { data: lockAcquired, error: lockErr } = await supabase.rpc("try_acquire_followup_cron_lock");
    if (lockErr) {
      return new Response(JSON.stringify({ ok: false, error: "lock_failed", details: lockErr }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (lockAcquired !== true) {
      return new Response(JSON.stringify({ ok: true, skipped: "lock_not_acquired" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const unipileBase = normalizeUnipileBase(requireEnv("UNIPILE_DSN"));
    const unipileApiKey = requireEnv("UNIPILE_API_KEY");

    const processed: Array<Record<string, unknown>> = [];

    try {
      // Full plan only — essential clients manage follow-ups manually
      const { data: clients, error: clientsErr } = await supabase
        .from("clients")
        .select("id")
        .eq("plan", "full")
        .eq("subscription_status", "active");

      if (clientsErr) {
        return new Response(JSON.stringify({ ok: false, error: "clients_fetch_failed", details: clientsErr }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      const clientIds = (clients ?? []).map((c) => String((c as { id: number | string }).id));
      if (clientIds.length === 0) {
        return new Response(JSON.stringify({ ok: true, processed }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const { data: settingsRows } = await supabase
        .from("client_linkedin_settings")
        .select("client_id, timezone")
        .in("client_id", clientIds);

      const timezoneByClientId = new Map<string, string>();
      for (const row of settingsRows ?? []) {
        const r = row as { client_id: number | string; timezone: string | null };
        timezoneByClientId.set(String(r.client_id), String(r.timezone ?? "Europe/Paris") || "Europe/Paris");
      }

      for (const rawClient of clients ?? []) {
        const clientId = String((rawClient as { id: number | string }).id);
        const timezone = timezoneByClientId.get(clientId) ?? "Europe/Paris";
        const { startIso, endIso, nowParts } = getTodayBoundsUtc(timezone);

        // Enforce 9h–18h window in client's timezone
        const nowMinutes = nowParts.hour * 60 + nowParts.minute;
        if (!isWithinWindow(nowMinutes, 9 * 60, 18 * 60)) {
          processed.push({ client_id: clientId, skipped: "outside_window" });
          continue;
        }

        // Find leads due for follow-up today with a pending relance_linkedin
        const { data: leadsRows, error: leadsErr } = await supabase
          .from("leads")
          .select("id, relance_linkedin")
          .eq("client_id", clientId)
          .eq("message_sent", true)
          .not("relance_linkedin", "is", null)
          .is("relance_sent_at", null)
          .gte("next_followup_at", startIso)
          .lt("next_followup_at", endIso)
          .order("next_followup_at", { ascending: true })
          .limit(50);

        if (leadsErr) {
          await logAutomation({
            supabase, clientId, action: "followup_send", status: "error",
            details: { reason: "leads_fetch_failed", error: leadsErr },
          });
          processed.push({ client_id: clientId, error: "leads_fetch_failed" });
          continue;
        }

        const leads = (leadsRows ?? []) as Array<{ id: number | string; relance_linkedin: string }>;

        if (leads.length === 0) {
          processed.push({ client_id: clientId, skipped: "no_leads_due_today" });
          continue;
        }

        let sent = 0;
        let failed = 0;

        for (const lead of leads) {
          const leadId = String(lead.id);
          const relanceText = String(lead.relance_linkedin ?? "").trim();

          if (!relanceText) {
            processed.push({ client_id: clientId, lead_id: leadId, skipped: "empty_relance_text" });
            continue;
          }

          // Find the most recent inbox thread for this lead
          const { data: thread, error: threadErr } = await supabase
            .from("inbox_threads")
            .select("id, unipile_thread_id, unipile_account_id")
            .eq("client_id", clientId)
            .eq("lead_id", leadId)
            .order("last_message_at", { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle();

          if (threadErr || !thread?.id || !thread.unipile_thread_id) {
            await logAutomation({
              supabase, clientId, action: "followup_send", status: "error", leadId,
              details: { reason: "thread_not_found" },
            });
            processed.push({ client_id: clientId, lead_id: leadId, error: "thread_not_found" });
            failed++;
            continue;
          }

          const unipileAccountId = String(thread.unipile_account_id ?? "").trim();
          const unipileThreadId = String(thread.unipile_thread_id).trim();

          const sendResult = await sendUnipileMessage({
            baseUrl: unipileBase,
            apiKey: unipileApiKey,
            accountId: unipileAccountId,
            threadId: unipileThreadId,
            text: relanceText,
          });

          if (!sendResult.ok) {
            await logAutomation({
              supabase, clientId, action: "followup_send", status: "error", leadId, unipileAccountId,
              details: { reason: sendResult.error, details: sendResult.details ?? null },
            });
            processed.push({ client_id: clientId, lead_id: leadId, error: sendResult.error });
            failed++;
            continue;
          }

          const nowIso = new Date().toISOString();
          const payload = asObject(sendResult.payload);
          const sentAt =
            firstString(payload, [["sent_at"], ["timestamp"], ["created_at"], ["data", "sent_at"]]) ?? nowIso;
          const messageId =
            firstString(payload, [["message_id"], ["id"], ["provider_id"], ["data", "message_id"]]) ??
            `followup-${Date.now()}`;

          // Insert message in inbox
          const { data: existingMessage } = await supabase
            .from("inbox_messages")
            .select("id")
            .eq("client_id", clientId)
            .eq("unipile_account_id", unipileAccountId)
            .eq("unipile_message_id", messageId)
            .limit(1)
            .maybeSingle();

          if (!existingMessage?.id) {
            await supabase.from("inbox_messages").insert({
              client_id: clientId,
              provider: "linkedin",
              thread_db_id: String(thread.id),
              unipile_account_id: unipileAccountId,
              unipile_thread_id: unipileThreadId,
              unipile_message_id: messageId,
              direction: "outbound",
              sender_name: null,
              sender_linkedin_url: null,
              text: relanceText,
              sent_at: sentAt,
              raw: sendResult.payload,
            });
          }

          // Update thread preview
          await supabase
            .from("inbox_threads")
            .update({
              last_message_at: sentAt,
              last_message_preview: truncatePreview(relanceText),
              updated_at: nowIso,
            })
            .eq("id", thread.id)
            .eq("client_id", clientId);

          // Mark relance as sent on the lead
          await supabase
            .from("leads")
            .update({ relance_sent_at: nowIso })
            .eq("id", leadId)
            .eq("client_id", clientId);

          await logAutomation({
            supabase, clientId, action: "followup_send", status: "success", leadId, unipileAccountId,
            details: { message_id: messageId, thread_id: String(thread.id) },
          });

          processed.push({ client_id: clientId, lead_id: leadId, sent: true });
          sent++;

          // Small delay between sends to avoid rate limits
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }

        processed.push({ client_id: clientId, summary: { sent, failed, total: leads.length } });
      }

      return new Response(JSON.stringify({ ok: true, processed }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } finally {
      await supabase.rpc("release_followup_cron_lock");
    }
  } catch (error) {
    console.error("FOLLOWUP_CRON_RUNNER_ERROR", error);
    return new Response(
      JSON.stringify({ ok: false, error: "server_error", details: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
