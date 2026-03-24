import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  extractLinkedInProfileSlug,
  normalizeUnipileBase,
  requireEnv,
  resolveUnipileProviderId,
  sendUnipileInvitation,
} from "../_shared/unipile.ts";

type ClientRow = { id: number | string; quota: string | number | null };
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

const RUNNER_NAME = "linkedin-cron-runner";
const DEFAULT_START_MINUTES = 8 * 60;
const DEFAULT_END_MINUTES = 18 * 60;
const LEAD_SCAN_PAGE_SIZE = 200;
const MAX_LEAD_SCAN_PAGES = 15;

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
  const row = payload as Record<string, unknown>;

  const direct =
    typeof row.invitation_id === "string" && row.invitation_id.trim()
      ? row.invitation_id.trim()
      : typeof row.invitationId === "string" && row.invitationId.trim()
        ? row.invitationId.trim()
        : null;
  if (direct) return direct;

  const nested = row.invite_response;
  if (!nested || typeof nested !== "object" || Array.isArray(nested)) return null;
  const nestedRow = nested as Record<string, unknown>;
  if (typeof nestedRow.invitation_id === "string" && nestedRow.invitation_id.trim()) {
    return nestedRow.invitation_id.trim();
  }
  if (typeof nestedRow.invitationId === "string" && nestedRow.invitationId.trim()) {
    return nestedRow.invitationId.trim();
  }
  return null;
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

function getTodayBoundsUtc(timezone: string): { startIso: string; endIso: string; nowParts: TimeParts } {
  const now = new Date();
  const nowParts = getTimePartsInZone(now, timezone);

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

  const tomorrowUtc = new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day + 1, 0, 0, 0));
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

function isWeekdayInZone(date: Date, timezone: string): boolean {
  const parts = getTimePartsInZone(date, timezone);
  // Reconstruct as UTC midnight using local date parts to get correct day of week
  const localMidnight = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const dow = localMidnight.getUTCDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  return dow >= 1 && dow <= 5;
}

function normalizeClientQuota(rawQuota: unknown): number {
  const parsed = Number(rawQuota);
  if (!Number.isFinite(parsed)) return 10;
  const intQuota = Math.trunc(parsed);
  if (intQuota < 1) return 10;
  if (intQuota > 200) return 200;
  return intQuota;
}

function isExistingInvitationBlockingRetry(row: ExistingInvitationRow): boolean {
  const status = String(row.status ?? "").trim().toLowerCase();
  const sentAt = String(row.sent_at ?? "").trim();
  const acceptedAt = String(row.accepted_at ?? "").trim();
  const dmSentAt = String(row.dm_sent_at ?? "").trim();
  const lastError = String(row.last_error ?? "").trim();
  const raw =
    row.raw && typeof row.raw === "object" && !Array.isArray(row.raw)
      ? (row.raw as Record<string, unknown>)
      : null;
  const rawError = String(raw?.error ?? "").trim();

  if (acceptedAt || dmSentAt || sentAt) return true;
  if (status === "accepted" || status === "connected" || status === "pending" || status === "sent") {
    return true;
  }

  // When a lead already failed during a previous pass, skip it so the runner
  // can continue with the remaining leads selected for today.
  if (status === "queued") {
    return Boolean(lastError || rawError);
  }

  return false;
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
  const { supabase, clientId, action, status, leadId = null, unipileAccountId = null, details = {} } =
    params;

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
    .eq("provider", "linkedin")
    .order("connected_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  return account?.unipile_account_id ? String(account.unipile_account_id) : null;
}

async function findNextEligibleLead(params: {
  supabase: ReturnType<typeof createClient>;
  clientId: string;
  unipileAccountId: string;
  startIso: string;
  endIso: string;
}): Promise<
  | { ok: true; lead: LeadRow }
  | { ok: false; reason: "no_eligible_leads" | "all_leads_already_invited" }
  | { ok: false; reason: "eligible_leads_fetch_failed"; error: unknown }
  | { ok: false; reason: "existing_invites_fetch_failed"; error: unknown }
> {
  const { supabase, clientId, unipileAccountId, startIso, endIso } = params;
  let sawEligibleLead = false;

  for (let pageIndex = 0; pageIndex < MAX_LEAD_SCAN_PAGES; pageIndex += 1) {
    const from = pageIndex * LEAD_SCAN_PAGE_SIZE;
    const to = from + LEAD_SCAN_PAGE_SIZE - 1;

    const { data: leadsRows, error: leadsErr } = await supabase
      .from("leads")
      .select("id, LinkedInURL, traite, responded, message_sent, internal_message")
      .eq("client_id", clientId)
      .not("LinkedInURL", "is", null)
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);

    if (leadsErr) {
      return { ok: false, reason: "eligible_leads_fetch_failed", error: leadsErr };
    }

    const batch = (leadsRows ?? []) as LeadRow[];
    if (batch.length === 0) break;

    const eligibleBase = batch.filter((lead) => {
      const linkedinUrl = String(lead.LinkedInURL ?? "").trim();
      if (!linkedinUrl) return false;
      if (lead.responded === true) return false;
      if (lead.message_sent === true) return false;
      return true;
    });

    if (eligibleBase.length === 0) {
      if (batch.length < LEAD_SCAN_PAGE_SIZE) break;
      continue;
    }

    sawEligibleLead = true;

    const leadIds = eligibleBase.map((lead) => String(lead.id));
    const { data: existingInvites, error: existingErr } = await supabase
      .from("linkedin_invitations")
      .select("lead_id, status, sent_at, accepted_at, dm_sent_at, last_error, raw")
      .eq("client_id", clientId)
      .eq("unipile_account_id", unipileAccountId)
      .in("lead_id", leadIds);

    if (existingErr) {
      return { ok: false, reason: "existing_invites_fetch_failed", error: existingErr };
    }

    const blockedLeadIds = new Set(
      ((existingInvites ?? []) as ExistingInvitationRow[])
        .filter((row) => isExistingInvitationBlockingRetry(row))
        .map((row) => String(row.lead_id ?? "").trim())
        .filter((value) => value.length > 0)
    );

    const chosenLead = eligibleBase.find((lead) => !blockedLeadIds.has(String(lead.id)));
    if (chosenLead) {
      return { ok: true, lead: chosenLead };
    }

    if (batch.length < LEAD_SCAN_PAGE_SIZE) break;
  }

  return {
    ok: false,
    reason: sawEligibleLead ? "all_leads_already_invited" : "no_eligible_leads",
  };
}

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

    const { data: lockAcquired, error: lockErr } = await supabase.rpc("try_acquire_linkedin_cron_lock");
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
      const { data: clients, error: clientsErr } = await supabase
        .from("clients")
        .select("id, quota")
        .eq("plan", "full")
        .eq("subscription_status", "active");

      if (clientsErr) {
        return new Response(JSON.stringify({ ok: false, error: "clients_fetch_failed", details: clientsErr }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      const clientIds = (clients ?? []).map((client) => String((client as ClientRow).id));
      if (clientIds.length === 0) {
        return new Response(JSON.stringify({ ok: true, processed }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const { data: settingsRows, error: settingsErr } = await supabase
        .from("client_linkedin_settings")
        .select("client_id, timezone, start_time, end_time, unipile_account_id")
        .in("client_id", clientIds);

      if (settingsErr) {
        return new Response(JSON.stringify({ ok: false, error: "settings_fetch_failed", details: settingsErr }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      const settingsByClientId = new Map<string, SettingsRow>();
      for (const row of settingsRows ?? []) {
        const settings = row as SettingsRow;
        settingsByClientId.set(String(settings.client_id), settings);
      }

      for (const rawClient of clients ?? []) {
        const client = rawClient as ClientRow;
        const clientId = String(client.id);
        const settings = settingsByClientId.get(clientId) ?? null;
        const timezone = String(settings?.timezone ?? "Europe/Paris") || "Europe/Paris";

        const { startIso, endIso, nowParts } = getTodayBoundsUtc(timezone);

        if (!isWeekdayInZone(new Date(), timezone)) {
          processed.push({ client_id: clientId, skipped: "weekend" });
          continue;
        }

        const nowMinutes = nowParts.hour * 60 + nowParts.minute;
        const startMinutes = parseTimeToMinutes(settings?.start_time, DEFAULT_START_MINUTES);
        const endMinutes = parseTimeToMinutes(settings?.end_time, DEFAULT_END_MINUTES);
        if (!isWithinWindow(nowMinutes, startMinutes, endMinutes)) {
          processed.push({ client_id: clientId, skipped: "outside_window" });
          continue;
        }

        const dailyQuota = normalizeClientQuota(client.quota);
        const unipileAccountId = await resolveAccountId({
          supabase,
          clientId,
          settingsAccountId: settings?.unipile_account_id ?? null,
        });

        if (!unipileAccountId) {
          await logAutomation({
            supabase,
            clientId,
            action: "invitation_send",
            status: "skipped",
            details: { reason: "missing_unipile_account_id" },
          });
          processed.push({ client_id: clientId, skipped: "missing_account" });
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
          await logAutomation({
            supabase,
            clientId,
            action: "invitation_send",
            status: "error",
            unipileAccountId,
            details: { reason: "sent_count_failed", error: sentCountErr },
          });
          processed.push({ client_id: clientId, error: "sent_count_failed" });
          continue;
        }

        const sentToday = Number(sentTodayCount ?? 0);
        if (sentToday >= dailyQuota) {
          processed.push({ client_id: clientId, skipped: "quota_reached", sent_today: sentToday });
          continue;
        }

        const nextLeadResult = await findNextEligibleLead({
          supabase,
          clientId,
          unipileAccountId,
          startIso,
          endIso,
        });

        if (!nextLeadResult.ok && nextLeadResult.reason === "eligible_leads_fetch_failed") {
          await logAutomation({
            supabase,
            clientId,
            action: "invitation_send",
            status: "error",
            unipileAccountId,
            details: { reason: "eligible_leads_fetch_failed", error: nextLeadResult.error },
          });
          processed.push({ client_id: clientId, error: "eligible_leads_fetch_failed" });
          continue;
        }

        if (!nextLeadResult.ok && nextLeadResult.reason === "existing_invites_fetch_failed") {
          await logAutomation({
            supabase,
            clientId,
            action: "invitation_send",
            status: "error",
            unipileAccountId,
            details: { reason: "existing_invites_fetch_failed", error: nextLeadResult.error },
          });
          processed.push({ client_id: clientId, error: "existing_invites_fetch_failed" });
          continue;
        }

        if (!nextLeadResult.ok && nextLeadResult.reason === "no_eligible_leads") {
          processed.push({ client_id: clientId, skipped: "no_eligible_leads" });
          continue;
        }

        if (!nextLeadResult.ok && nextLeadResult.reason === "all_leads_already_invited") {
          processed.push({ client_id: clientId, skipped: "all_leads_already_invited" });
          continue;
        }

        const chosenLead = nextLeadResult.lead;
        const chosenLeadId = String(chosenLead.id);
        const linkedinUrl = String(chosenLead.LinkedInURL ?? "").trim();
        const draftText = String(chosenLead.internal_message ?? "").trim();
        const profileSlug = extractLinkedInProfileSlug(linkedinUrl);

        if (!profileSlug) {
          await supabase
            .from("linkedin_invitations")
            .upsert(
              {
                client_id: clientId,
                lead_id: chosenLeadId,
                unipile_account_id: unipileAccountId,
                status: "queued",
                last_error: "invalid_linkedin_url",
                raw: {
                  runner: RUNNER_NAME,
                  error: "invalid_linkedin_url",
                  linkedin_url: linkedinUrl,
                },
              },
              { onConflict: "client_id,lead_id,unipile_account_id" }
            );

          await logAutomation({
            supabase,
            clientId,
            action: "invitation_send",
            status: "skipped",
            leadId: chosenLeadId,
            unipileAccountId,
            details: { reason: "invalid_linkedin_url", linkedin_url: linkedinUrl },
          });
          processed.push({ client_id: clientId, skipped: "invalid_linkedin_url", lead_id: chosenLeadId });
          continue;
        }

        const providerIdResult = await resolveUnipileProviderId({
          baseUrl: unipileBase,
          apiKey: unipileApiKey,
          accountId: unipileAccountId,
          profileSlug,
        });

        if (!providerIdResult.ok) {
          await supabase
            .from("linkedin_invitations")
            .upsert(
              {
                client_id: clientId,
                lead_id: chosenLeadId,
                unipile_account_id: unipileAccountId,
                status: "queued",
                last_error: providerIdResult.error,
                raw: {
                  runner: RUNNER_NAME,
                  error: providerIdResult.error,
                  details: providerIdResult.details ?? null,
                },
              },
              { onConflict: "client_id,lead_id,unipile_account_id" }
            );

          await logAutomation({
            supabase,
            clientId,
            action: "invitation_send",
            status: "error",
            leadId: chosenLeadId,
            unipileAccountId,
            details: {
              reason: providerIdResult.error,
              provider_lookup_details: providerIdResult.details ?? null,
            },
          });

          processed.push({ client_id: clientId, error: providerIdResult.error, lead_id: chosenLeadId });
          continue;
        }

        const inviteResult = await sendUnipileInvitation({
          baseUrl: unipileBase,
          apiKey: unipileApiKey,
          accountId: unipileAccountId,
          providerId: providerIdResult.providerId,
        });

        if (!inviteResult.ok) {
          await supabase
            .from("linkedin_invitations")
            .upsert(
              {
                client_id: clientId,
                lead_id: chosenLeadId,
                unipile_account_id: unipileAccountId,
                status: "queued",
                last_error: inviteResult.error,
                raw: {
                  runner: RUNNER_NAME,
                  error: inviteResult.error,
                  details: inviteResult.details ?? null,
                },
              },
              { onConflict: "client_id,lead_id,unipile_account_id" }
            );

          await logAutomation({
            supabase,
            clientId,
            action: "invitation_send",
            status: "error",
            leadId: chosenLeadId,
            unipileAccountId,
            details: {
              reason: inviteResult.error,
              invite_details: inviteResult.details ?? null,
            },
          });

          processed.push({ client_id: clientId, error: inviteResult.error, lead_id: chosenLeadId });
          continue;
        }

        const nowIso = new Date().toISOString();
        const normalizedLinkedInUrl = normalizeLinkedInTargetUrl(linkedinUrl);
        const invitationId = extractInvitationId(inviteResult.payload);
        await supabase.from("linkedin_invitations").upsert(
          {
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
              profile_slug: profileSlug,
              normalized_linkedin_url: normalizedLinkedInUrl,
              provider_id: providerIdResult.providerId,
              unipile_invitation_id: invitationId,
              invite_response: inviteResult.payload,
            },
          },
          { onConflict: "client_id,lead_id,unipile_account_id" }
        );

        await supabase
          .from("leads")
          .update({ traite: true })
          .eq("id", chosenLeadId)
          .eq("client_id", clientId);

        await logAutomation({
          supabase,
          clientId,
          action: "invitation_send",
          status: "success",
          leadId: chosenLeadId,
          unipileAccountId,
          details: {
            sent_today: sentToday + 1,
            daily_quota: dailyQuota,
            timezone,
            invitation_id: invitationId,
            target_provider_id: providerIdResult.providerId,
            target_profile_slug: profileSlug,
            target_linkedin_url_normalized: normalizedLinkedInUrl,
          },
        });

        processed.push({
          client_id: clientId,
          sent: true,
          lead_id: chosenLeadId,
          unipile_account_id: unipileAccountId,
        });
      }

      return new Response(JSON.stringify({ ok: true, processed }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } finally {
      await supabase.rpc("release_linkedin_cron_lock");
    }
  } catch (error) {
    console.error("LINKEDIN_CRON_RUNNER_ERROR", error);
    return new Response(
      JSON.stringify({ ok: false, error: "server_error", details: String(error) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
