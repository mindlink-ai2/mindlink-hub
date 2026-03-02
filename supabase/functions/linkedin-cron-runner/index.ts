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
  unipile_account_id: string | null;
};
type LeadRow = {
  id: number | string;
  LinkedInURL: string | null;
  traite: boolean | null;
  responded: boolean | null;
  message_sent: boolean | null;
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

function normalizeClientQuota(rawQuota: unknown): number {
  const parsed = Number(rawQuota);
  if (!Number.isFinite(parsed)) return 10;
  const intQuota = Math.trunc(parsed);
  if (intQuota < 1) return 10;
  if (intQuota > 200) return 200;
  return intQuota;
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
        .select("client_id, timezone, unipile_account_id")
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

        const nowMinutes = nowParts.hour * 60 + nowParts.minute;
        const startMinutes = 8 * 60;
        const endMinutes = 18 * 60;
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

        const { data: leadsRows, error: leadsErr } = await supabase
          .from("leads")
          .select("id, LinkedInURL, traite, responded, message_sent")
          .eq("client_id", clientId)
          .gte("created_at", startIso)
          .lt("created_at", endIso)
          .not("LinkedInURL", "is", null)
          .order("created_at", { ascending: false })
          .limit(200);

        if (leadsErr) {
          await logAutomation({
            supabase,
            clientId,
            action: "invitation_send",
            status: "error",
            unipileAccountId,
            details: { reason: "eligible_leads_fetch_failed", error: leadsErr },
          });
          processed.push({ client_id: clientId, error: "eligible_leads_fetch_failed" });
          continue;
        }

        const eligibleBase = (leadsRows ?? []).filter((lead) => {
          const row = lead as LeadRow;
          const linkedinUrl = String(row.LinkedInURL ?? "").trim();
          if (!linkedinUrl) return false;
          if (row.traite === true) return false;
          if (row.responded === true) return false;
          if (row.message_sent === true) return false;
          return true;
        });

        if (eligibleBase.length === 0) {
          processed.push({ client_id: clientId, skipped: "no_eligible_leads" });
          continue;
        }

        const leadIds = eligibleBase.map((lead) => String((lead as LeadRow).id));
        const { data: existingInvites, error: existingErr } = await supabase
          .from("linkedin_invitations")
          .select("lead_id")
          .eq("client_id", clientId)
          .eq("unipile_account_id", unipileAccountId)
          .in("lead_id", leadIds);

        if (existingErr) {
          await logAutomation({
            supabase,
            clientId,
            action: "invitation_send",
            status: "error",
            unipileAccountId,
            details: { reason: "existing_invites_fetch_failed", error: existingErr },
          });
          processed.push({ client_id: clientId, error: "existing_invites_fetch_failed" });
          continue;
        }

        const alreadyInvitedLeadIds = new Set(
          (existingInvites ?? [])
            .map((row) => String((row as { lead_id?: number | string | null }).lead_id ?? ""))
            .filter((value) => value.length > 0)
        );

        const chosenLead = eligibleBase.find(
          (lead) => !alreadyInvitedLeadIds.has(String((lead as LeadRow).id))
        ) as LeadRow | undefined;

        if (!chosenLead?.id) {
          processed.push({ client_id: clientId, skipped: "all_leads_already_invited" });
          continue;
        }

        const chosenLeadId = String(chosenLead.id);
        const linkedinUrl = String(chosenLead.LinkedInURL ?? "").trim();
        const profileSlug = extractLinkedInProfileSlug(linkedinUrl);

        if (!profileSlug) {
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
        await supabase.from("linkedin_invitations").upsert(
          {
            client_id: clientId,
            lead_id: chosenLeadId,
            unipile_account_id: unipileAccountId,
            status: "sent",
            sent_at: nowIso,
            raw: {
              runner: RUNNER_NAME,
              profile_slug: profileSlug,
              provider_id: providerIdResult.providerId,
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
