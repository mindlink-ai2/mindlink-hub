import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  extractLinkedInProfileSlug,
  normalizeUnipileBase,
  requireEnv,
  resolveUnipileProviderId,
  sendUnipileInvitation,
} from "../_shared/unipile.ts";

type JsonObject = Record<string, unknown>;

type ClientRow = {
  id: number | string;
  plan?: string | null;
  quota: string | number | null;
  subscription_status?: string | null;
};

type SettingsRow = {
  client_id: number | string;
  timezone: string | null;
  start_time: string | null;
  end_time: string | null;
  unipile_account_id: string | null;
};

type LeadRow = {
  id: number | string;
  LinkedInURL: string | null;
  traite: boolean | null;
  responded: boolean | null;
  message_sent: boolean | null;
  internal_message: string | null;
  created_at?: string | null;
};

type ExistingInvitationRow = {
  lead_id: number | string | null;
  status: string | null;
  sent_at?: string | null;
  accepted_at?: string | null;
  dm_sent_at?: string | null;
  last_error?: string | null;
  raw?: unknown;
};

type TimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

type LeadCandidate = LeadRow & {
  linkedin_url_resolved: string;
};

type LeadSelectionStats = {
  scanned_total: number;
  missing_linkedin_url: number;
  responded_skipped: number;
  message_sent_skipped: number;
  base_eligible: number;
  blocked_existing_invitation: number;
  blocked_existing_by_status: number;
  blocked_existing_by_prior_error: number;
  candidate_count: number;
};

type LeadSelectionResult =
  | {
      ok: true;
      candidates: LeadCandidate[];
      stats: LeadSelectionStats;
    }
  | {
      ok: false;
      reason:
        | "no_eligible_leads"
        | "all_leads_already_invited"
        | "all_leads_blocked"
        | "eligible_leads_fetch_failed"
        | "existing_invites_fetch_failed";
      error?: unknown;
      stats: LeadSelectionStats;
    };

type RunSummary = {
  clients_scanned: number;
  clients_eligible: number;
  leads_eligible: number;
  attempts: number;
  successes: number;
  failures: number;
  skipped: number;
  skip_reasons: Record<string, number>;
};

const RUNNER_NAME = "linkedin-cron-runner";
const DEFAULT_TIMEZONE = "Europe/Paris";
const DEFAULT_START_MINUTES = 8 * 60;
const DEFAULT_END_MINUTES = 18 * 60;
const LEAD_SCAN_PAGE_SIZE = 200;
const MAX_LEAD_SCAN_PAGES = 15;
const MAX_LEAD_CANDIDATES = 50;

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }

  if (error && typeof error === "object") {
    try {
      return JSON.parse(JSON.stringify(error)) as JsonObject;
    } catch {
      return String(error);
    }
  }

  return error ?? null;
}

function logStructuredEvent(event: string, payload: Record<string, unknown>) {
  console.info(
    "LINKEDIN_CRON_RUNNER",
    JSON.stringify({
      timestamp_utc: new Date().toISOString(),
      event,
      ...payload,
    })
  );
}

function incrementCount(target: Record<string, number>, key: string, amount = 1) {
  target[key] = (target[key] ?? 0) + amount;
}

function registerSkip(summary: RunSummary, reason: string, amount = 1) {
  summary.skipped += amount;
  incrementCount(summary.skip_reasons, reason, amount);
}

function buildEmptyLeadSelectionStats(): LeadSelectionStats {
  return {
    scanned_total: 0,
    missing_linkedin_url: 0,
    responded_skipped: 0,
    message_sent_skipped: 0,
    base_eligible: 0,
    blocked_existing_invitation: 0,
    blocked_existing_by_status: 0,
    blocked_existing_by_prior_error: 0,
    candidate_count: 0,
  };
}

function buildEmptyRunSummary(): RunSummary {
  return {
    clients_scanned: 0,
    clients_eligible: 0,
    leads_eligible: 0,
    attempts: 0,
    successes: 0,
    failures: 0,
    skipped: 0,
    skip_reasons: {},
  };
}

function normalizeClientPlan(value: unknown): string {
  return String(value ?? "").trim().toLowerCase() || "essential";
}

function normalizeSubscriptionStatus(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function getLeadLinkedInUrl(lead: LeadRow): string | null {
  const upper = String(lead.LinkedInURL ?? "").trim();
  if (upper) return upper;
  return null;
}

function normalizeLinkedInTargetUrl(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (!host.includes("linkedin.com")) return null;

    let path = parsed.pathname.trim();
    if (!path.startsWith("/")) path = `/${path}`;
    path = path.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
    if (!path) path = "/";

    return `https://${host}${path}`.toLowerCase();
  } catch {
    return null;
  }
}

function extractInvitationId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const row = payload as JsonObject;

  const direct =
    typeof row.invitation_id === "string" && row.invitation_id.trim()
      ? row.invitation_id.trim()
      : typeof row.invitationId === "string" && row.invitationId.trim()
        ? row.invitationId.trim()
        : null;
  if (direct) return direct;

  const nested = row.invite_response;
  if (!nested || typeof nested !== "object" || Array.isArray(nested)) return null;
  const nestedRow = nested as JsonObject;

  if (typeof nestedRow.invitation_id === "string" && nestedRow.invitation_id.trim()) {
    return nestedRow.invitation_id.trim();
  }
  if (typeof nestedRow.invitationId === "string" && nestedRow.invitationId.trim()) {
    return nestedRow.invitationId.trim();
  }

  return null;
}

function formatTimeParts(parts: TimeParts): string {
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

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
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  return asUtc - date.getTime();
}

function zonedToUtc(parts: TimeParts, timezone: string): Date {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  const offset = getOffsetMs(new Date(utcGuess), timezone);

  return new Date(utcGuess - offset);
}

function getTodayBoundsUtc(referenceDate: Date, timezone: string): {
  startIso: string;
  endIso: string;
  nowParts: TimeParts;
} {
  const nowParts = getTimePartsInZone(referenceDate, timezone);

  const start = zonedToUtc(
    {
      year: nowParts.year,
      month: nowParts.month,
      day: nowParts.day,
      hour: 0,
      minute: 0,
      second: 0,
    },
    timezone
  );

  const tomorrowUtc = new Date(
    Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day + 1, 0, 0, 0)
  );
  const end = zonedToUtc(
    {
      year: tomorrowUtc.getUTCFullYear(),
      month: tomorrowUtc.getUTCMonth() + 1,
      day: tomorrowUtc.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
    },
    timezone
  );

  return { startIso: start.toISOString(), endIso: end.toISOString(), nowParts };
}

function isWithinWindow(nowMinutes: number, startMinutes: number, endMinutes: number): boolean {
  if (endMinutes <= startMinutes) return false;
  return nowMinutes >= startMinutes && nowMinutes < endMinutes;
}

function parseTimeToMinutes(raw: string | null | undefined, fallback: number): number {
  const normalized = String(raw ?? "").trim();
  const match = normalized.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return fallback;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return fallback;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return fallback;

  return hours * 60 + minutes;
}

function formatMinutesAsTime(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function isWeekdayInZone(date: Date, timezone: string): boolean {
  const parts = getTimePartsInZone(date, timezone);
  const localMidnight = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const dow = localMidnight.getUTCDay();
  return dow >= 1 && dow <= 5;
}

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function resolveExecutionTimezone(rawTimezone: string | null | undefined): {
  configuredTimezone: string | null;
  timezone: string;
  fallbackReason: string | null;
} {
  const configuredTimezone = String(rawTimezone ?? "").trim() || null;
  if (!configuredTimezone) {
    return {
      configuredTimezone: null,
      timezone: DEFAULT_TIMEZONE,
      fallbackReason: "missing_timezone",
    };
  }

  if (!isValidTimezone(configuredTimezone)) {
    return {
      configuredTimezone,
      timezone: DEFAULT_TIMEZONE,
      fallbackReason: "invalid_timezone",
    };
  }

  return {
    configuredTimezone,
    timezone: configuredTimezone,
    fallbackReason: null,
  };
}

function normalizeClientQuota(rawQuota: unknown): number {
  const parsed = Number(rawQuota);
  if (!Number.isFinite(parsed)) return 10;

  const intQuota = Math.trunc(parsed);
  if (intQuota < 1) return 10;
  if (intQuota > 200) return 200;

  return intQuota;
}

function classifyBlockingInvitation(row: ExistingInvitationRow): {
  blocked: boolean;
  reason: "existing_invitation" | "previous_error" | null;
  status: string | null;
  lastError: string | null;
} {
  const status = String(row.status ?? "").trim().toLowerCase() || null;
  const sentAt = String(row.sent_at ?? "").trim();
  const acceptedAt = String(row.accepted_at ?? "").trim();
  const dmSentAt = String(row.dm_sent_at ?? "").trim();
  const lastError = String(row.last_error ?? "").trim() || null;
  const raw = asObject(row.raw);
  const rawError = String(raw.error ?? "").trim() || null;

  if (acceptedAt || dmSentAt || sentAt) {
    return { blocked: true, reason: "existing_invitation", status, lastError };
  }

  if (status === "accepted" || status === "connected" || status === "pending" || status === "sent") {
    return { blocked: true, reason: "existing_invitation", status, lastError };
  }

  if (status === "queued" && (lastError || rawError)) {
    return {
      blocked: true,
      reason: "previous_error",
      status,
      lastError: lastError ?? rawError,
    };
  }

  return {
    blocked: false,
    reason: null,
    status,
    lastError,
  };
}

function stringifySearchable(value: unknown): string {
  if (typeof value === "string") return value.toLowerCase();

  try {
    return JSON.stringify(value).toLowerCase();
  } catch {
    return String(value ?? "").toLowerCase();
  }
}

function isLeadLevelProviderLookupFailure(error: string, details: unknown): boolean {
  if (error === "unipile_provider_id_missing") return true;
  if (error !== "unipile_profile_lookup_failed") return false;

  const haystack = stringifySearchable(details);
  return (
    haystack.includes("404") ||
    haystack.includes("not found") ||
    haystack.includes("does not exist") ||
    haystack.includes("no user")
  );
}

function isLeadLevelInviteFailure(error: string, details: unknown): boolean {
  if (error !== "unipile_invite_failed") return false;

  const haystack = stringifySearchable(details);
  return (
    haystack.includes("already invited") ||
    haystack.includes("already connected") ||
    haystack.includes("duplicate") ||
    haystack.includes("already exists")
  );
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
  const {
    supabase,
    clientId,
    action,
    status,
    leadId = null,
    unipileAccountId = null,
    details = {},
  } = params;

  const { error } = await supabase.from("automation_logs").insert({
    client_id: clientId,
    runner: RUNNER_NAME,
    action,
    status,
    lead_id: leadId,
    unipile_account_id: unipileAccountId,
    details,
  });

  if (error) {
    logStructuredEvent("automation_log_insert_failed", {
      client_id: clientId,
      action,
      status,
      lead_id: leadId,
      unipile_account_id: unipileAccountId,
      error: serializeError(error),
    });
  }
}

async function resolveAccountId(params: {
  supabase: ReturnType<typeof createClient>;
  clientId: string;
  settingsAccountId: string | null;
}): Promise<string | null> {
  const { supabase, clientId, settingsAccountId } = params;
  const normalized = String(settingsAccountId ?? "").trim();
  if (normalized) return normalized;

  const { data: account } = await supabase
    .from("unipile_accounts")
    .select("unipile_account_id")
    .eq("client_id", clientId)
    .ilike("provider", "linkedin")
    .order("connected_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  return account?.unipile_account_id ? String(account.unipile_account_id) : null;
}

async function upsertInvitationRecord(params: {
  supabase: ReturnType<typeof createClient>;
  row: JsonObject;
  runId: string;
  stage: string;
}) {
  const { supabase, row, runId, stage } = params;

  const { error } = await supabase
    .from("linkedin_invitations")
    .upsert(row, { onConflict: "client_id,lead_id,unipile_account_id" });

  if (error) {
    logStructuredEvent("linkedin_invitation_upsert_failed", {
      run_id: runId,
      stage,
      client_id: String(row.client_id ?? ""),
      lead_id: String(row.lead_id ?? ""),
      unipile_account_id: String(row.unipile_account_id ?? ""),
      error: serializeError(error),
    });
  }
}

async function markLeadProcessed(params: {
  supabase: ReturnType<typeof createClient>;
  clientId: string;
  leadId: string;
  runId: string;
}) {
  const { supabase, clientId, leadId, runId } = params;

  const { error } = await supabase
    .from("leads")
    .update({ traite: true })
    .eq("id", leadId)
    .eq("client_id", clientId);

  if (error) {
    logStructuredEvent("lead_status_update_failed", {
      run_id: runId,
      client_id: clientId,
      lead_id: leadId,
      error: serializeError(error),
    });
  }
}

async function findEligibleLeadCandidates(params: {
  supabase: ReturnType<typeof createClient>;
  clientId: string;
  unipileAccountId: string;
  startIso: string;
  endIso: string;
}): Promise<LeadSelectionResult> {
  const { supabase, clientId, unipileAccountId, startIso, endIso } = params;
  const stats = buildEmptyLeadSelectionStats();
  const candidates: LeadCandidate[] = [];

  for (let pageIndex = 0; pageIndex < MAX_LEAD_SCAN_PAGES; pageIndex += 1) {
    const from = pageIndex * LEAD_SCAN_PAGE_SIZE;
    const to = from + LEAD_SCAN_PAGE_SIZE - 1;

    const { data: leadsRows, error: leadsErr } = await supabase
      .from("leads")
      .select("id, LinkedInURL, traite, responded, message_sent, internal_message, created_at")
      .eq("client_id", clientId)
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .order("created_at", { ascending: true, nullsFirst: true })
      .order("id", { ascending: true })
      .range(from, to);

    if (leadsErr) {
      return {
        ok: false,
        reason: "eligible_leads_fetch_failed",
        error: leadsErr,
        stats,
      };
    }

    const batch = (leadsRows ?? []) as LeadRow[];
    if (batch.length === 0) break;

    stats.scanned_total += batch.length;

    const eligibleBase: LeadCandidate[] = [];

    for (const lead of batch) {
      const linkedinUrl = getLeadLinkedInUrl(lead);
      if (!linkedinUrl) {
        stats.missing_linkedin_url += 1;
        continue;
      }
      if (lead.responded === true) {
        stats.responded_skipped += 1;
        continue;
      }
      if (lead.message_sent === true) {
        stats.message_sent_skipped += 1;
        continue;
      }

      stats.base_eligible += 1;
      eligibleBase.push({
        ...lead,
        linkedin_url_resolved: linkedinUrl,
      });
    }

    if (eligibleBase.length === 0) {
      if (batch.length < LEAD_SCAN_PAGE_SIZE) break;
      continue;
    }

    const leadIds = eligibleBase.map((lead) => String(lead.id));
    const { data: existingInvites, error: existingErr } = await supabase
      .from("linkedin_invitations")
      .select("lead_id, status, sent_at, accepted_at, dm_sent_at, last_error, raw")
      .eq("client_id", clientId)
      .eq("unipile_account_id", unipileAccountId)
      .in("lead_id", leadIds);

    if (existingErr) {
      return {
        ok: false,
        reason: "existing_invites_fetch_failed",
        error: existingErr,
        stats,
      };
    }

    const blockedLeadIds = new Set<string>();

    for (const row of (existingInvites ?? []) as ExistingInvitationRow[]) {
      const leadId = String(row.lead_id ?? "").trim();
      if (!leadId) continue;

      const classification = classifyBlockingInvitation(row);
      if (!classification.blocked) continue;
      if (blockedLeadIds.has(leadId)) continue;

      blockedLeadIds.add(leadId);
      stats.blocked_existing_invitation += 1;

      if (classification.reason === "previous_error") {
        stats.blocked_existing_by_prior_error += 1;
      } else {
        stats.blocked_existing_by_status += 1;
      }
    }

    for (const lead of eligibleBase) {
      if (blockedLeadIds.has(String(lead.id))) continue;

      candidates.push(lead);
      if (candidates.length >= MAX_LEAD_CANDIDATES) break;
    }

    if (candidates.length >= MAX_LEAD_CANDIDATES || batch.length < LEAD_SCAN_PAGE_SIZE) {
      break;
    }
  }

  stats.candidate_count = candidates.length;

  if (candidates.length > 0) {
    return { ok: true, candidates, stats };
  }

  return {
    ok: false,
    reason:
      stats.base_eligible === 0
        ? "no_eligible_leads"
        : stats.blocked_existing_by_prior_error > 0
          ? "all_leads_blocked"
          : "all_leads_already_invited",
    stats,
  };
}

Deno.serve(async (req) => {
  const runId = crypto.randomUUID();
  const runStartedAt = new Date();
  const runParisTime = formatTimeParts(getTimePartsInZone(runStartedAt, DEFAULT_TIMEZONE));

  try {
    const cronSecret = requireEnv("LINKEDIN_CRON_SECRET");
    const providedSecret =
      req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret");
    const body = asObject(await req.json().catch(() => ({})));
    const source = String(body.source ?? "unknown").trim() || "unknown";

    if (providedSecret !== cronSecret) {
      logStructuredEvent("run_rejected", {
        run_id: runId,
        reason: "unauthorized",
        source,
      });

      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    logStructuredEvent("run_started", {
      run_id: runId,
      source,
      started_at_utc: runStartedAt.toISOString(),
      local_time_paris: runParisTime,
    });

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY")
    );

    const { data: lockAcquired, error: lockErr } = await supabase.rpc(
      "try_acquire_linkedin_cron_lock"
    );
    if (lockErr) {
      logStructuredEvent("run_aborted", {
        run_id: runId,
        reason: "lock_failed",
        error: serializeError(lockErr),
      });

      return new Response(
        JSON.stringify({ ok: false, error: "lock_failed", details: lockErr }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (lockAcquired !== true) {
      logStructuredEvent("run_skipped", {
        run_id: runId,
        reason: "lock_not_acquired",
      });

      return new Response(JSON.stringify({ ok: true, skipped: "lock_not_acquired" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const unipileBase = normalizeUnipileBase(requireEnv("UNIPILE_DSN"));
    const unipileApiKey = requireEnv("UNIPILE_API_KEY");
    const processed: Array<Record<string, unknown>> = [];
    const summary = buildEmptyRunSummary();

    try {
      const { data: clients, error: clientsErr } = await supabase
        .from("clients")
        .select("id, plan, subscription_status, quota");

      if (clientsErr) {
        logStructuredEvent("run_aborted", {
          run_id: runId,
          reason: "clients_fetch_failed",
          error: serializeError(clientsErr),
        });

        return new Response(
          JSON.stringify({ ok: false, error: "clients_fetch_failed", details: clientsErr }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      const allClients = (clients ?? []) as ClientRow[];
      const clientIds = allClients.map((client) => String(client.id));
      if (clientIds.length === 0) {
        const responsePayload = {
          ok: true,
          run_id: runId,
          local_time_paris: runParisTime,
          processed,
          summary,
        };

        logStructuredEvent("run_completed", responsePayload);

        return new Response(JSON.stringify(responsePayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const { data: settingsRows, error: settingsErr } = await supabase
        .from("client_linkedin_settings")
        .select("client_id, timezone, start_time, end_time, unipile_account_id")
        .in("client_id", clientIds);

      if (settingsErr) {
        logStructuredEvent("run_aborted", {
          run_id: runId,
          reason: "settings_fetch_failed",
          error: serializeError(settingsErr),
        });

        return new Response(
          JSON.stringify({ ok: false, error: "settings_fetch_failed", details: settingsErr }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      const settingsByClientId = new Map<string, SettingsRow>();
      for (const row of settingsRows ?? []) {
        const settings = row as SettingsRow;
        settingsByClientId.set(String(settings.client_id), settings);
      }

      for (const rawClient of allClients) {
        const client = rawClient as ClientRow;
        const clientId = String(client.id);
        const normalizedPlan = normalizeClientPlan(client.plan);
        const subscriptionStatus = normalizeSubscriptionStatus(client.subscription_status);
        let unipileAccountId: string | null = null;

        summary.clients_scanned += 1;

        try {
          const settings = settingsByClientId.get(clientId) ?? null;
          const timezoneResolution = resolveExecutionTimezone(settings?.timezone);
          const timezone = timezoneResolution.timezone;
          const { startIso, endIso, nowParts } = getTodayBoundsUtc(runStartedAt, timezone);
          const nowMinutes = nowParts.hour * 60 + nowParts.minute;
          const startMinutes = parseTimeToMinutes(settings?.start_time, DEFAULT_START_MINUTES);
          const endMinutes = parseTimeToMinutes(settings?.end_time, DEFAULT_END_MINUTES);
          const dailyQuota = normalizeClientQuota(client.quota);

          logStructuredEvent("client_inspected", {
            run_id: runId,
            client_id: clientId,
            plan: normalizedPlan,
            subscription_status: subscriptionStatus || null,
            local_time_paris: runParisTime,
            configured_timezone: timezoneResolution.configuredTimezone,
            timezone,
            timezone_fallback_reason: timezoneResolution.fallbackReason,
            client_local_time: formatTimeParts(nowParts),
            start_time: formatMinutesAsTime(startMinutes),
            end_time: formatMinutesAsTime(endMinutes),
            daily_quota: dailyQuota,
          });

          if (normalizedPlan !== "full") {
            registerSkip(summary, "plan_non_full");
            processed.push({ client_id: clientId, skipped: "plan_non_full" });

            logStructuredEvent("client_skipped", {
              run_id: runId,
              client_id: clientId,
              reason: "plan_non_full",
              plan: normalizedPlan,
            });
            continue;
          }

          if (subscriptionStatus !== "active") {
            registerSkip(summary, "subscription_inactive");
            processed.push({
              client_id: clientId,
              skipped: "subscription_inactive",
              subscription_status: subscriptionStatus || null,
            });

            logStructuredEvent("client_skipped", {
              run_id: runId,
              client_id: clientId,
              reason: "subscription_inactive",
              subscription_status: subscriptionStatus || null,
            });
            continue;
          }

          if (!isWeekdayInZone(runStartedAt, timezone)) {
            registerSkip(summary, "weekend");
            processed.push({ client_id: clientId, skipped: "weekend" });

            await logAutomation({
              supabase,
              clientId,
              action: "invitation_send",
              status: "skipped",
              details: {
                run_id: runId,
                reason: "weekend",
                timezone,
                local_time_paris: runParisTime,
                client_local_time: formatTimeParts(nowParts),
              },
            });

            logStructuredEvent("client_skipped", {
              run_id: runId,
              client_id: clientId,
              reason: "weekend",
              timezone,
            });
            continue;
          }

          if (!isWithinWindow(nowMinutes, startMinutes, endMinutes)) {
            registerSkip(summary, "outside_window");
            processed.push({ client_id: clientId, skipped: "outside_window" });

            await logAutomation({
              supabase,
              clientId,
              action: "invitation_send",
              status: "skipped",
              details: {
                run_id: runId,
                reason: "outside_window",
                timezone,
                local_time_paris: runParisTime,
                client_local_time: formatTimeParts(nowParts),
                start_time: formatMinutesAsTime(startMinutes),
                end_time: formatMinutesAsTime(endMinutes),
              },
            });

            logStructuredEvent("client_skipped", {
              run_id: runId,
              client_id: clientId,
              reason: "outside_window",
              timezone,
              client_local_time: formatTimeParts(nowParts),
              start_time: formatMinutesAsTime(startMinutes),
              end_time: formatMinutesAsTime(endMinutes),
            });
            continue;
          }

          unipileAccountId = await resolveAccountId({
            supabase,
            clientId,
            settingsAccountId: settings?.unipile_account_id ?? null,
          });

          if (!unipileAccountId) {
            registerSkip(summary, "missing_unipile_account_id");
            processed.push({ client_id: clientId, skipped: "missing_unipile_account_id" });

            await logAutomation({
              supabase,
              clientId,
              action: "invitation_send",
              status: "skipped",
              details: {
                run_id: runId,
                reason: "missing_unipile_account_id",
                timezone,
              },
            });

            logStructuredEvent("client_skipped", {
              run_id: runId,
              client_id: clientId,
              reason: "missing_unipile_account_id",
            });
            continue;
          }

          const { count: sentTodayCount, error: sentCountErr } = await supabase
            .from("linkedin_invitations")
            .select("id", { count: "exact", head: true })
            .eq("client_id", clientId)
            .eq("unipile_account_id", unipileAccountId)
            .gte("sent_at", startIso)
            .lt("sent_at", endIso)
            .in("status", ["queued", "sent", "accepted"]);

          if (sentCountErr) {
            summary.failures += 1;
            processed.push({ client_id: clientId, error: "sent_count_failed" });

            await logAutomation({
              supabase,
              clientId,
              action: "invitation_send",
              status: "error",
              unipileAccountId,
              details: {
                run_id: runId,
                reason: "sent_count_failed",
                error: serializeError(sentCountErr),
              },
            });

            logStructuredEvent("client_error", {
              run_id: runId,
              client_id: clientId,
              reason: "sent_count_failed",
              error: serializeError(sentCountErr),
            });
            continue;
          }

          const sentToday = Number(sentTodayCount ?? 0);
          if (sentToday >= dailyQuota) {
            registerSkip(summary, "quota_reached");
            processed.push({
              client_id: clientId,
              skipped: "quota_reached",
              sent_today: sentToday,
            });

            await logAutomation({
              supabase,
              clientId,
              action: "invitation_send",
              status: "skipped",
              unipileAccountId,
              details: {
                run_id: runId,
                reason: "quota_reached",
                sent_today: sentToday,
                daily_quota: dailyQuota,
                timezone,
              },
            });

            logStructuredEvent("client_skipped", {
              run_id: runId,
              client_id: clientId,
              reason: "quota_reached",
              sent_today: sentToday,
              daily_quota: dailyQuota,
            });
            continue;
          }

          summary.clients_eligible += 1;

          const nextLeadResult = await findEligibleLeadCandidates({
            supabase,
            clientId,
            unipileAccountId,
            startIso,
            endIso,
          });

          if (!nextLeadResult.ok) {
            if (
              nextLeadResult.reason === "eligible_leads_fetch_failed" ||
              nextLeadResult.reason === "existing_invites_fetch_failed"
            ) {
              summary.failures += 1;
              processed.push({ client_id: clientId, error: nextLeadResult.reason });

              await logAutomation({
                supabase,
                clientId,
                action: "invitation_send",
                status: "error",
                unipileAccountId,
                details: {
                  run_id: runId,
                  reason: nextLeadResult.reason,
                  error: serializeError(nextLeadResult.error),
                  selection_stats: nextLeadResult.stats,
                },
              });

              logStructuredEvent("client_error", {
                run_id: runId,
                client_id: clientId,
                reason: nextLeadResult.reason,
                error: serializeError(nextLeadResult.error),
                selection_stats: nextLeadResult.stats,
              });
              continue;
            }

            registerSkip(summary, nextLeadResult.reason);
            processed.push({
              client_id: clientId,
              skipped: nextLeadResult.reason,
              selection_stats: nextLeadResult.stats,
            });

            await logAutomation({
              supabase,
              clientId,
              action: "invitation_send",
              status: "skipped",
              unipileAccountId,
              details: {
                run_id: runId,
                reason: nextLeadResult.reason,
                selection_stats: nextLeadResult.stats,
              },
            });

            logStructuredEvent("client_skipped", {
              run_id: runId,
              client_id: clientId,
              reason: nextLeadResult.reason,
              selection_stats: nextLeadResult.stats,
            });
            continue;
          }

          const selectionStats = nextLeadResult.stats;
          const leadCandidates = nextLeadResult.candidates;
          const leadSkipReasons: Record<string, number> = {};
          let fatalClientError:
            | {
                reason: string;
                leadId: string | null;
                details: Record<string, unknown>;
              }
            | null = null;
          let invitationSent = false;

          summary.leads_eligible += selectionStats.candidate_count;

          logStructuredEvent("lead_candidates_ready", {
            run_id: runId,
            client_id: clientId,
            unipile_account_id: unipileAccountId,
            selection_stats: selectionStats,
          });

          for (let index = 0; index < leadCandidates.length; index += 1) {
            const chosenLead = leadCandidates[index];
            const chosenLeadId = String(chosenLead.id);
            const linkedinUrl = chosenLead.linkedin_url_resolved;
            const draftText = String(chosenLead.internal_message ?? "").trim();

            await logAutomation({
              supabase,
              clientId,
              action: "invitation_send",
              status: "info",
              leadId: chosenLeadId,
              unipileAccountId,
              details: {
                run_id: runId,
                stage: "lead_selected",
                candidate_index: index + 1,
                candidate_count: leadCandidates.length,
                linkedin_url: linkedinUrl,
                lead_created_at: chosenLead.created_at ?? null,
              },
            });

            logStructuredEvent("lead_selected", {
              run_id: runId,
              client_id: clientId,
              lead_id: chosenLeadId,
              unipile_account_id: unipileAccountId,
              candidate_index: index + 1,
              candidate_count: leadCandidates.length,
              linkedin_url: linkedinUrl,
            });

            const profileSlug = extractLinkedInProfileSlug(linkedinUrl);
            if (!profileSlug) {
              incrementCount(leadSkipReasons, "invalid_linkedin_url");
              registerSkip(summary, "invalid_linkedin_url");

              await upsertInvitationRecord({
                supabase,
                runId,
                stage: "invalid_linkedin_url",
                row: {
                  client_id: clientId,
                  lead_id: chosenLeadId,
                  unipile_account_id: unipileAccountId,
                  status: "queued",
                  last_error: "invalid_linkedin_url",
                  raw: {
                    runner: RUNNER_NAME,
                    error: "invalid_linkedin_url",
                    linkedin_url: linkedinUrl,
                    run_id: runId,
                  },
                },
              });

              await logAutomation({
                supabase,
                clientId,
                action: "invitation_send",
                status: "skipped",
                leadId: chosenLeadId,
                unipileAccountId,
                details: {
                  run_id: runId,
                  reason: "invalid_linkedin_url",
                  stage: "validate_target_url",
                  candidate_index: index + 1,
                  candidate_count: leadCandidates.length,
                  linkedin_url: linkedinUrl,
                },
              });

              logStructuredEvent("lead_skipped", {
                run_id: runId,
                client_id: clientId,
                lead_id: chosenLeadId,
                reason: "invalid_linkedin_url",
                linkedin_url: linkedinUrl,
              });
              continue;
            }

            const providerIdResult = await resolveUnipileProviderId({
              baseUrl: unipileBase,
              apiKey: unipileApiKey,
              accountId: unipileAccountId,
              profileSlug,
            });

            if (!providerIdResult.ok) {
              await upsertInvitationRecord({
                supabase,
                runId,
                stage: "provider_lookup_failed",
                row: {
                  client_id: clientId,
                  lead_id: chosenLeadId,
                  unipile_account_id: unipileAccountId,
                  status: "queued",
                  last_error: providerIdResult.error,
                  raw: {
                    runner: RUNNER_NAME,
                    error: providerIdResult.error,
                    details: providerIdResult.details ?? null,
                    run_id: runId,
                  },
                },
              });

              if (
                isLeadLevelProviderLookupFailure(
                  providerIdResult.error,
                  providerIdResult.details ?? null
                )
              ) {
                incrementCount(leadSkipReasons, providerIdResult.error);
                registerSkip(summary, providerIdResult.error);

                await logAutomation({
                  supabase,
                  clientId,
                  action: "invitation_send",
                  status: "skipped",
                  leadId: chosenLeadId,
                  unipileAccountId,
                  details: {
                    run_id: runId,
                    reason: providerIdResult.error,
                    stage: "resolve_provider_id",
                    provider_lookup_details: providerIdResult.details ?? null,
                    profile_slug: profileSlug,
                    candidate_index: index + 1,
                    candidate_count: leadCandidates.length,
                  },
                });

                logStructuredEvent("lead_skipped", {
                  run_id: runId,
                  client_id: clientId,
                  lead_id: chosenLeadId,
                  reason: providerIdResult.error,
                  profile_slug: profileSlug,
                  provider_lookup_details: providerIdResult.details ?? null,
                });
                continue;
              }

              summary.failures += 1;
              fatalClientError = {
                reason: providerIdResult.error,
                leadId: chosenLeadId,
                details: {
                  stage: "resolve_provider_id",
                  provider_lookup_details: providerIdResult.details ?? null,
                  profile_slug: profileSlug,
                },
              };

              await logAutomation({
                supabase,
                clientId,
                action: "invitation_send",
                status: "error",
                leadId: chosenLeadId,
                unipileAccountId,
                details: {
                  run_id: runId,
                  reason: providerIdResult.error,
                  stage: "resolve_provider_id",
                  provider_lookup_details: providerIdResult.details ?? null,
                  profile_slug: profileSlug,
                },
              });

              logStructuredEvent("client_error", {
                run_id: runId,
                client_id: clientId,
                lead_id: chosenLeadId,
                reason: providerIdResult.error,
                stage: "resolve_provider_id",
                provider_lookup_details: providerIdResult.details ?? null,
              });
              break;
            }

            await logAutomation({
              supabase,
              clientId,
              action: "invitation_send",
              status: "attempt",
              leadId: chosenLeadId,
              unipileAccountId,
              details: {
                run_id: runId,
                stage: "send_invitation_attempt",
                candidate_index: index + 1,
                candidate_count: leadCandidates.length,
                profile_slug: profileSlug,
                target_provider_id: providerIdResult.providerId,
              },
            });

            logStructuredEvent("invitation_attempt", {
              run_id: runId,
              client_id: clientId,
              lead_id: chosenLeadId,
              unipile_account_id: unipileAccountId,
              profile_slug: profileSlug,
              target_provider_id: providerIdResult.providerId,
            });

            summary.attempts += 1;

            const inviteResult = await sendUnipileInvitation({
              baseUrl: unipileBase,
              apiKey: unipileApiKey,
              accountId: unipileAccountId,
              providerId: providerIdResult.providerId,
            });

            if (!inviteResult.ok) {
              await upsertInvitationRecord({
                supabase,
                runId,
                stage: "send_invitation_failed",
                row: {
                  client_id: clientId,
                  lead_id: chosenLeadId,
                  unipile_account_id: unipileAccountId,
                  status: "queued",
                  last_error: inviteResult.error,
                  raw: {
                    runner: RUNNER_NAME,
                    error: inviteResult.error,
                    details: inviteResult.details ?? null,
                    run_id: runId,
                  },
                },
              });

              if (isLeadLevelInviteFailure(inviteResult.error, inviteResult.details ?? null)) {
                incrementCount(leadSkipReasons, inviteResult.error);
                registerSkip(summary, inviteResult.error);

                await logAutomation({
                  supabase,
                  clientId,
                  action: "invitation_send",
                  status: "skipped",
                  leadId: chosenLeadId,
                  unipileAccountId,
                  details: {
                    run_id: runId,
                    reason: inviteResult.error,
                    stage: "send_invitation",
                    invite_details: inviteResult.details ?? null,
                    profile_slug: profileSlug,
                    target_provider_id: providerIdResult.providerId,
                  },
                });

                logStructuredEvent("lead_skipped", {
                  run_id: runId,
                  client_id: clientId,
                  lead_id: chosenLeadId,
                  reason: inviteResult.error,
                  invite_details: inviteResult.details ?? null,
                });
                continue;
              }

              summary.failures += 1;
              fatalClientError = {
                reason: inviteResult.error,
                leadId: chosenLeadId,
                details: {
                  stage: "send_invitation",
                  invite_details: inviteResult.details ?? null,
                  profile_slug: profileSlug,
                  target_provider_id: providerIdResult.providerId,
                },
              };

              await logAutomation({
                supabase,
                clientId,
                action: "invitation_send",
                status: "error",
                leadId: chosenLeadId,
                unipileAccountId,
                details: {
                  run_id: runId,
                  reason: inviteResult.error,
                  stage: "send_invitation",
                  invite_details: inviteResult.details ?? null,
                  profile_slug: profileSlug,
                  target_provider_id: providerIdResult.providerId,
                },
              });

              logStructuredEvent("client_error", {
                run_id: runId,
                client_id: clientId,
                lead_id: chosenLeadId,
                reason: inviteResult.error,
                stage: "send_invitation",
                invite_details: inviteResult.details ?? null,
              });
              break;
            }

            const nowIso = new Date().toISOString();
            const normalizedLinkedInUrl = normalizeLinkedInTargetUrl(linkedinUrl);
            const invitationId = extractInvitationId(inviteResult.payload);

            await upsertInvitationRecord({
              supabase,
              runId,
              stage: "send_invitation_success",
              row: {
                client_id: clientId,
                lead_id: chosenLeadId,
                unipile_account_id: unipileAccountId,
                status: "sent",
                sent_at: nowIso,
                dm_draft_text: draftText || null,
                dm_draft_status: draftText ? "draft" : "none",
                target_linkedin_provider_id: providerIdResult.providerId,
                target_profile_slug: profileSlug,
                target_linkedin_url_normalized: normalizedLinkedInUrl,
                unipile_invitation_id: invitationId,
                raw: {
                  runner: RUNNER_NAME,
                  run_id: runId,
                  profile_slug: profileSlug,
                  normalized_linkedin_url: normalizedLinkedInUrl,
                  provider_id: providerIdResult.providerId,
                  unipile_invitation_id: invitationId,
                  invite_response: inviteResult.payload,
                },
              },
            });

            await markLeadProcessed({
              supabase,
              clientId,
              leadId: chosenLeadId,
              runId,
            });

            summary.successes += 1;
            invitationSent = true;

            await logAutomation({
              supabase,
              clientId,
              action: "invitation_send",
              status: "success",
              leadId: chosenLeadId,
              unipileAccountId,
              details: {
                run_id: runId,
                sent_today: sentToday + 1,
                daily_quota: dailyQuota,
                timezone,
                invitation_id: invitationId,
                target_provider_id: providerIdResult.providerId,
                target_profile_slug: profileSlug,
                target_linkedin_url_normalized: normalizedLinkedInUrl,
                skipped_candidate_reasons_before_success: leadSkipReasons,
              },
            });

            logStructuredEvent("invitation_sent", {
              run_id: runId,
              client_id: clientId,
              lead_id: chosenLeadId,
              unipile_account_id: unipileAccountId,
              invitation_id: invitationId,
              target_provider_id: providerIdResult.providerId,
              target_profile_slug: profileSlug,
              target_linkedin_url_normalized: normalizedLinkedInUrl,
              skipped_candidate_reasons_before_success: leadSkipReasons,
            });

            processed.push({
              client_id: clientId,
              sent: true,
              lead_id: chosenLeadId,
              unipile_account_id: unipileAccountId,
              skipped_candidate_reasons_before_success: leadSkipReasons,
            });
            break;
          }

          if (invitationSent) continue;

          if (fatalClientError) {
            processed.push({
              client_id: clientId,
              error: fatalClientError.reason,
              lead_id: fatalClientError.leadId,
            });
            continue;
          }

          registerSkip(summary, "no_sendable_lead_found");
          processed.push({
            client_id: clientId,
            skipped: "no_sendable_lead_found",
            lead_skip_reasons: leadSkipReasons,
            selection_stats: selectionStats,
          });

          await logAutomation({
            supabase,
            clientId,
            action: "invitation_send",
            status: "skipped",
            unipileAccountId,
            details: {
              run_id: runId,
              reason: "no_sendable_lead_found",
              lead_skip_reasons: leadSkipReasons,
              selection_stats: selectionStats,
            },
          });

          logStructuredEvent("client_skipped", {
            run_id: runId,
            client_id: clientId,
            reason: "no_sendable_lead_found",
            lead_skip_reasons: leadSkipReasons,
            selection_stats: selectionStats,
          });
        } catch (clientError) {
          summary.failures += 1;
          processed.push({ client_id: clientId, error: "client_processing_failed" });

          if (normalizedPlan === "full" && subscriptionStatus === "active") {
            await logAutomation({
              supabase,
              clientId,
              action: "invitation_send",
              status: "error",
              unipileAccountId,
              details: {
                run_id: runId,
                reason: "client_processing_failed",
                error: serializeError(clientError),
              },
            });
          }

          logStructuredEvent("client_error", {
            run_id: runId,
            client_id: clientId,
            reason: "client_processing_failed",
            error: serializeError(clientError),
          });
        }
      }

      const responsePayload = {
        ok: true,
        run_id: runId,
        local_time_paris: runParisTime,
        processed,
        summary,
      };

      logStructuredEvent("run_completed", responsePayload);

      return new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } finally {
      const { error: releaseErr } = await supabase.rpc("release_linkedin_cron_lock");
      if (releaseErr) {
        logStructuredEvent("lock_release_failed", {
          run_id: runId,
          error: serializeError(releaseErr),
        });
      }
    }
  } catch (error) {
    logStructuredEvent("run_failed", {
      run_id: runId,
      error: serializeError(error),
    });

    return new Response(
      JSON.stringify({ ok: false, error: "server_error", details: String(error) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
