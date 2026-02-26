import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  createServiceSupabase,
  getClientIdFromClerkUser,
  getLinkedinUnipileAccountId,
} from "@/lib/inbox-server";
import { isFullActivePlan, normalizeClientPlan } from "@/lib/client-plan";

type PostgrestErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

type LinkedinSettingsRow = {
  client_id: number | string;
  enabled: boolean | null;
  daily_invite_quota: number | null;
  timezone: string | null;
  start_time: string | null;
  end_time: string | null;
  unipile_account_id: string | null;
};

const SAFE_DEFAULTS = {
  enabled: false,
  daily_invite_quota: 10,
  timezone: "Europe/Paris",
  start_time: "08:00:00",
  end_time: "18:00:00",
};

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const pg = error as PostgrestErrorLike;
  return String(pg.code ?? "") === "42P01";
}

function normalizeSettingsRow(row: LinkedinSettingsRow | null | undefined) {
  return {
    enabled: row?.enabled === true,
    daily_invite_quota:
      row?.daily_invite_quota === 20 || row?.daily_invite_quota === 30
        ? row.daily_invite_quota
        : 10,
    timezone: (row?.timezone ?? SAFE_DEFAULTS.timezone).trim() || SAFE_DEFAULTS.timezone,
    start_time: (row?.start_time ?? SAFE_DEFAULTS.start_time).trim() || SAFE_DEFAULTS.start_time,
    end_time: (row?.end_time ?? SAFE_DEFAULTS.end_time).trim() || SAFE_DEFAULTS.end_time,
    unipile_account_id: row?.unipile_account_id ?? null,
  };
}

function getLocalDayKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isSameLocalDay(timestamp: string | null | undefined, timezone: string, dayKey: string) {
  if (!timestamp) return false;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return false;
  return getLocalDayKey(date, timezone) === dayKey;
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const supabase = createServiceSupabase();
    const clientId = await getClientIdFromClerkUser(supabase, userId);
    if (!clientId) {
      return NextResponse.json({ error: "client_not_found" }, { status: 404 });
    }

    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id, plan, subscription_status")
      .eq("id", clientId)
      .limit(1)
      .maybeSingle();

    if (clientErr || !client?.id) {
      return NextResponse.json({ error: "client_not_found" }, { status: 404 });
    }

    const plan = normalizeClientPlan(client.plan);
    const subscriptionStatus = String(client.subscription_status ?? "")
      .trim()
      .toLowerCase();
    const isFullActive = isFullActivePlan({
      plan,
      subscriptionStatus,
    });

    let settingsRow: LinkedinSettingsRow | null = null;
    const { data: settingsData, error: settingsErr } = await supabase
      .from("client_linkedin_settings")
      .select(
        "client_id, enabled, daily_invite_quota, timezone, start_time, end_time, unipile_account_id"
      )
      .eq("client_id", clientId)
      .limit(1)
      .maybeSingle();

    if (settingsErr && !isMissingRelationError(settingsErr)) {
      return NextResponse.json({ error: "settings_fetch_failed" }, { status: 500 });
    }
    settingsRow = (settingsData as LinkedinSettingsRow | null) ?? null;

    if (!settingsRow && isFullActive) {
      const defaultUnipileAccountId = await getLinkedinUnipileAccountId(supabase, clientId);

      const { data: inserted, error: insertErr } = await supabase
        .from("client_linkedin_settings")
        .upsert(
          {
            client_id: clientId,
            enabled: false,
            daily_invite_quota: 10,
            timezone: "Europe/Paris",
            start_time: "08:00:00",
            end_time: "18:00:00",
            unipile_account_id: defaultUnipileAccountId,
          },
          { onConflict: "client_id" }
        )
        .select(
          "client_id, enabled, daily_invite_quota, timezone, start_time, end_time, unipile_account_id"
        )
        .limit(1)
        .maybeSingle();

      if (!insertErr) {
        settingsRow = (inserted as LinkedinSettingsRow | null) ?? settingsRow;
      }
    }

    const settings = normalizeSettingsRow(settingsRow);
    const timezone = settings.timezone;
    const todayKey = getLocalDayKey(new Date(), timezone);
    const recentSince = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

    let sentToday = 0;
    let acceptedToday = 0;

    const [{ data: sentRows }, { data: acceptedRows }] = await Promise.all([
      supabase
        .from("linkedin_invitations")
        .select("sent_at, status")
        .eq("client_id", clientId)
        .in("status", ["queued", "sent", "accepted"])
        .gte("sent_at", recentSince),
      supabase
        .from("linkedin_invitations")
        .select("accepted_at, status")
        .eq("client_id", clientId)
        .in("status", ["accepted", "connected"])
        .gte("accepted_at", recentSince),
    ]);

    sentToday = (sentRows ?? []).filter((row) =>
      isSameLocalDay(
        (row as { sent_at?: string | null }).sent_at ?? null,
        timezone,
        todayKey
      )
    ).length;
    acceptedToday = (acceptedRows ?? []).filter((row) =>
      isSameLocalDay(
        (row as { accepted_at?: string | null }).accepted_at ?? null,
        timezone,
        todayKey
      )
    ).length;

    return NextResponse.json({
      plan,
      subscription_status: subscriptionStatus,
      is_full_active: isFullActive,
      settings,
      stats: {
        sent_today: sentToday,
        accepted_today: acceptedToday,
      },
    });
  } catch (error: unknown) {
    console.error("LINKEDIN_SETTINGS_GET_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const supabase = createServiceSupabase();
    const clientId = await getClientIdFromClerkUser(supabase, userId);
    if (!clientId) {
      return NextResponse.json({ error: "client_not_found" }, { status: 404 });
    }

    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id, plan, subscription_status")
      .eq("id", clientId)
      .limit(1)
      .maybeSingle();

    if (clientErr || !client?.id) {
      return NextResponse.json({ error: "client_not_found" }, { status: 404 });
    }

    const plan = normalizeClientPlan(client.plan);
    const subscriptionStatus = String(client.subscription_status ?? "")
      .trim()
      .toLowerCase();

    if (!isFullActivePlan({ plan, subscriptionStatus })) {
      return NextResponse.json({ error: "full_active_required" }, { status: 403 });
    }

    const payload = await req.json().catch(() => ({}));
    const enabled = payload?.enabled === true;
    const quotaValue = Number(payload?.daily_invite_quota);
    const dailyInviteQuota = [10, 20, 30].includes(quotaValue) ? quotaValue : 10;

    const timezoneRaw = String(payload?.timezone ?? SAFE_DEFAULTS.timezone).trim();
    const timezone = timezoneRaw || SAFE_DEFAULTS.timezone;

    const startTimeRaw = String(payload?.start_time ?? SAFE_DEFAULTS.start_time).trim();
    const endTimeRaw = String(payload?.end_time ?? SAFE_DEFAULTS.end_time).trim();
    const startTime = /^\d{2}:\d{2}(:\d{2})?$/.test(startTimeRaw)
      ? (startTimeRaw.length === 5 ? `${startTimeRaw}:00` : startTimeRaw)
      : SAFE_DEFAULTS.start_time;
    const endTime = /^\d{2}:\d{2}(:\d{2})?$/.test(endTimeRaw)
      ? (endTimeRaw.length === 5 ? `${endTimeRaw}:00` : endTimeRaw)
      : SAFE_DEFAULTS.end_time;

    const unipileAccountIdRaw = String(payload?.unipile_account_id ?? "").trim();
    const defaultAccountId = await getLinkedinUnipileAccountId(supabase, clientId);
    const unipileAccountId =
      unipileAccountIdRaw || defaultAccountId || null;

    const { data: upserted, error: upsertErr } = await supabase
      .from("client_linkedin_settings")
      .upsert(
        {
          client_id: clientId,
          enabled,
          daily_invite_quota: dailyInviteQuota,
          timezone,
          start_time: startTime,
          end_time: endTime,
          unipile_account_id: unipileAccountId,
        },
        { onConflict: "client_id" }
      )
      .select(
        "client_id, enabled, daily_invite_quota, timezone, start_time, end_time, unipile_account_id"
      )
      .limit(1)
      .maybeSingle();

    if (upsertErr || !upserted) {
      return NextResponse.json({ error: "settings_upsert_failed" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      settings: normalizeSettingsRow(upserted as LinkedinSettingsRow),
    });
  } catch (error: unknown) {
    console.error("LINKEDIN_SETTINGS_POST_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
