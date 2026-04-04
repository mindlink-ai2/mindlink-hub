import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

// Colonnes retournées pour chaque lead
const LEAD_SELECT =
  "id, FirstName, LastName, Company, LinkedInURL, next_followup_at, relance_sent_at, relance_linkedin, responded, message_sent, message_sent_at, custom_followup_delay_days";

type LeadRow = {
  id: number | string;
  FirstName?: string | null;
  LastName?: string | null;
  Company?: string | null;
  LinkedInURL?: string | null;
  next_followup_at?: string | null;
  relance_sent_at?: string | null;
  relance_linkedin?: string | null;
  responded?: boolean | null;
  message_sent?: boolean | null;
  message_sent_at?: string | null;
  custom_followup_delay_days?: number | null;
};

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

function getTodayBoundsUtc(timezone: string): { startIso: string; endIso: string } {
  const now = new Date();
  const nowParts = getTimePartsInZone(now, timezone);

  const start = zonedToUtc(
    { year: nowParts.year, month: nowParts.month, day: nowParts.day, hour: 0, minute: 0, second: 0 },
    timezone
  );

  const tomorrowUtc = new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day + 1));
  const tomorrowParts = getTimePartsInZone(tomorrowUtc, timezone);
  const end = zonedToUtc(
    {
      year: tomorrowParts.year,
      month: tomorrowParts.month,
      day: tomorrowParts.day,
      hour: 0,
      minute: 0,
      second: 0,
    },
    timezone
  );

  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Résoudre le client + vérifier plan='full'
  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("id, plan, subscription_status")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (clientErr || !client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const plan = String(client.plan ?? "").trim().toLowerCase();
  const subscriptionStatus = String(client.subscription_status ?? "").trim().toLowerCase();
  if (plan !== "full" || subscriptionStatus !== "active") {
    return NextResponse.json({ error: "Forbidden: full plan only" }, { status: 403 });
  }

  const clientId: number = client.id as number;

  const { startIso: todayStart, endIso: tomorrowStart } = getTodayBoundsUtc("Europe/Paris");

  // 2. Leads "En retard" : date dépassée, relance pas encore envoyée
  const overdueQuery = supabase
    .from("leads")
    .select(LEAD_SELECT)
    .eq("client_id", clientId)
    .eq("message_sent", true)
    .is("relance_sent_at", null)
    .lt("next_followup_at", todayStart)
    .order("next_followup_at", { ascending: true })
    .or("responded.is.null,responded.eq.false");

  const { data: overdueRows, error: overdueErr } = await overdueQuery;

  // 3. Leads "Aujourd'hui" : next_followup_at aujourd'hui, relance pas encore envoyée
  const todayQuery = supabase
    .from("leads")
    .select(LEAD_SELECT)
    .eq("client_id", clientId)
    .eq("message_sent", true)
    .is("relance_sent_at", null)
    .gte("next_followup_at", todayStart)
    .lt("next_followup_at", tomorrowStart)
    .order("next_followup_at", { ascending: true })
    .or("responded.is.null,responded.eq.false");

  const { data: todayRows, error: todayErr } = await todayQuery;

  // 4. Leads "À venir" : next_followup_at > aujourd'hui, relance pas encore envoyée
  const upcomingQuery = supabase
    .from("leads")
    .select(LEAD_SELECT)
    .eq("client_id", clientId)
    .eq("message_sent", true)
    .is("relance_sent_at", null)
    .gte("next_followup_at", tomorrowStart)
    .order("next_followup_at", { ascending: true })
    .or("responded.is.null,responded.eq.false");

  const { data: upcomingRows, error: upcomingErr } = await upcomingQuery;

  // 5. Leads "Relance envoyée" : relance_sent_at renseigné, pas encore répondu
  const relanceSentQuery = supabase
    .from("leads")
    .select(LEAD_SELECT)
    .eq("client_id", clientId)
    .not("relance_sent_at", "is", null)
    .order("relance_sent_at", { ascending: false })
    .or("responded.is.null,responded.eq.false");

  const { data: relanceSentRows, error: relanceSentErr } = await relanceSentQuery;

  // 6. Leads "Répondu" : responded=true
  const { data: respondedRows, error: respondedErr } = await supabase
    .from("leads")
    .select(LEAD_SELECT)
    .eq("client_id", clientId)
    .eq("responded", true)
    .order("relance_sent_at", { ascending: false });

  const errors = [overdueErr, todayErr, upcomingErr, relanceSentErr, respondedErr].filter(Boolean);
  if (errors.length > 0) {
    console.error("FOLLOWUPS_FULL_PLAN_QUERY_ERROR:", errors);
    return NextResponse.json({ error: "Query error" }, { status: 500 });
  }

  return NextResponse.json({
    overdue: (overdueRows ?? []) as LeadRow[],
    upcoming: (upcomingRows ?? []) as LeadRow[],
    today: (todayRows ?? []) as LeadRow[],
    relance_sent: (relanceSentRows ?? []) as LeadRow[],
    responded: (respondedRows ?? []) as LeadRow[],
    client_id: clientId,
  });
}
