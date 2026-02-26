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
  timezone: "Europe/Paris",
  start_time: "08:00:00",
  end_time: "18:00:00",
};

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const pg = error as PostgrestErrorLike;
  return String(pg.code ?? "") === "42P01";
}

function normalizeClientQuota(rawQuota: unknown): number {
  const parsed = Number(rawQuota);
  if (!Number.isFinite(parsed)) return 10;

  const intQuota = Math.trunc(parsed);
  if (intQuota < 1) return 10;
  if (intQuota > 200) return 200;
  return intQuota;
}

function normalizeSettingsRow(params: {
  row: LinkedinSettingsRow | null | undefined;
  quota: unknown;
  isFullActive: boolean;
  defaultUnipileAccountId: string | null;
}) {
  const { row, quota, isFullActive, defaultUnipileAccountId } = params;

  return {
    enabled: isFullActive,
    daily_invite_quota: normalizeClientQuota(quota),
    timezone: (row?.timezone ?? SAFE_DEFAULTS.timezone).trim() || SAFE_DEFAULTS.timezone,
    start_time: SAFE_DEFAULTS.start_time,
    end_time: SAFE_DEFAULTS.end_time,
    unipile_account_id:
      (typeof row?.unipile_account_id === "string" ? row.unipile_account_id : null) ??
      defaultUnipileAccountId,
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
      .select("id, plan, subscription_status, quota")
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

    const defaultUnipileAccountId = await getLinkedinUnipileAccountId(supabase, clientId);

    if (!settingsRow && isFullActive) {
      const { data: inserted } = await supabase
        .from("client_linkedin_settings")
        .upsert(
          {
            client_id: clientId,
            enabled: true,
            daily_invite_quota: normalizeClientQuota(client.quota),
            timezone: SAFE_DEFAULTS.timezone,
            start_time: SAFE_DEFAULTS.start_time,
            end_time: SAFE_DEFAULTS.end_time,
            unipile_account_id: defaultUnipileAccountId,
          },
          { onConflict: "client_id" }
        )
        .select(
          "client_id, enabled, daily_invite_quota, timezone, start_time, end_time, unipile_account_id"
        )
        .limit(1)
        .maybeSingle();

      settingsRow = (inserted as LinkedinSettingsRow | null) ?? settingsRow;
    }

    const settings = normalizeSettingsRow({
      row: settingsRow,
      quota: client.quota,
      isFullActive,
      defaultUnipileAccountId,
    });

    const timezone = settings.timezone;
    const todayKey = getLocalDayKey(new Date(), timezone);
    const recentSince = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

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

    const sentToday = (sentRows ?? []).filter((row) =>
      isSameLocalDay((row as { sent_at?: string | null }).sent_at ?? null, timezone, todayKey)
    ).length;

    const acceptedToday = (acceptedRows ?? []).filter((row) =>
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

export async function POST() {
  return NextResponse.json({ error: "automation_managed_by_plan" }, { status: 405 });
}
