import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createServiceSupabase } from "@/lib/inbox-server";
import { resolveClientContextForUser } from "@/lib/client-onboarding-state";
import { google } from "googleapis";

export const runtime = "nodejs";

function getPrimaryEmail(user: Awaited<ReturnType<typeof currentUser>>): string | null {
  return (
    user?.emailAddresses?.find((entry) => entry.id === user.primaryEmailAddressId)
      ?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null
  );
}

const TRIAL_DAYS = 7;
const MONTHLY_WORKDAYS = 22;

function getGoogleAuth() {
  const raw = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  const credentials = JSON.parse(raw) as Record<string, string>;
  credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function countWeekdaysBetween(start: Date, end: Date): number {
  const s = startOfDay(start);
  const e = startOfDay(end);
  if (e < s) return 0;
  let count = 0;
  const cur = new Date(s);
  while (cur.getTime() <= e.getTime()) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function workdaysRemainingInMonth(from: Date): number {
  const last = new Date(from.getFullYear(), from.getMonth() + 1, 0);
  return countWeekdaysBetween(from, last);
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabase = createServiceSupabase();
  const user = await currentUser();
  const primaryEmail = getPrimaryEmail(user);

  const clientContext = await resolveClientContextForUser(supabase, userId, primaryEmail);
  console.log("[quota] userId:", userId, "email:", primaryEmail, "resolved:", clientContext);

  if (!clientContext) {
    console.log("[quota] no client context — returning 404");
    return NextResponse.json({ error: "Client introuvable" }, { status: 404 });
  }

  const orgId: number = clientContext.clientId;

  const { data: clientRow, error: clientErr } = await supabase
    .from("clients")
    .select("id, quota, email, company_name, plan")
    .eq("id", orgId)
    .single();

  console.log("[quota] org_id:", orgId);
  console.log("[quota] client:", JSON.stringify(clientRow));

  if (clientErr || !clientRow) {
    console.log("[quota] client row fetch failed:", clientErr);
    return NextResponse.json({ error: "Client introuvable" }, { status: 404 });
  }

  const quotaPerDay = Number(clientRow.quota) || 10;
  console.log("[quota] quota_per_day:", quotaPerDay);
  const clientEmail = clientRow.email as string | null;
  const plan = String(clientRow.plan ?? "").trim().toLowerCase();
  const isEssential = plan === "essential";

  // ── Trial anchor date ──────────────────────────────────────────────
  // clients table has no created_at column. Use search_credits.created_at
  // (the row anchor) as the trial start date. If missing, skip trial
  // computation entirely.
  let anchorDate: Date | null = null;
  if (isEssential) {
    const { data: creditRow } = await supabase
      .from("search_credits")
      .select("created_at")
      .eq("org_id", orgId)
      .maybeSingle();
    if (creditRow?.created_at) {
      anchorDate = new Date(creditRow.created_at as string);
    }
  }

  // ── Trial computation (Essential only) ─────────────────────────────
  const now = new Date();
  let trialEndsAtIso: string | null = null;
  let isTrialActive = false;
  let trialQuota = 0;

  if (isEssential && anchorDate) {
    const trialEndsAt = new Date(anchorDate);
    trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);
    trialEndsAtIso = trialEndsAt.toISOString();
    isTrialActive = now.getTime() < trialEndsAt.getTime();

    const trialLastDay = new Date(anchorDate);
    trialLastDay.setDate(trialLastDay.getDate() + TRIAL_DAYS - 1);
    const trialBusinessDays = countWeekdaysBetween(anchorDate, trialLastDay);
    trialQuota = quotaPerDay * trialBusinessDays;
  }

  // ── Monthly cap shown to the client ────────────────────────────────
  // Full plan or any non-essential → unchanged behavior (22 workdays).
  // Essential during trial → trial_quota.
  // Essential after trial → prorated on remaining workdays in current month.
  let monthlyQuota: number;
  if (isEssential && isTrialActive) {
    monthlyQuota = trialQuota;
  } else if (isEssential) {
    monthlyQuota = quotaPerDay * workdaysRemainingInMonth(now);
  } else {
    monthlyQuota = quotaPerDay * MONTHLY_WORKDAYS;
  }

  // ── Count leads already in the client's Google Sheet tab ───────────
  let quotaUsed = 0;
  const MASTER_SHEET_ID = process.env.GOOGLE_MASTER_SHEET_ID;

  if (MASTER_SHEET_ID) {
    const googleAuth = getGoogleAuth();
    if (googleAuth) {
      try {
        const sheets = google.sheets({ version: "v4", auth: googleAuth });
        const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: MASTER_SHEET_ID });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sheetsList: any[] = spreadsheet.data.sheets ?? [];
        const existingTab = clientEmail
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? sheetsList.find((s: any) => s.properties?.title?.includes(clientEmail))
          : null;

        if (existingTab?.properties?.title) {
          const readRes = await sheets.spreadsheets.values.get({
            spreadsheetId: MASTER_SHEET_ID,
            range: `'${existingTab.properties.title}'!A:A`,
          });
          const rows = readRes.data.values;
          if (rows && rows.length > 1) {
            quotaUsed = rows.length - 1;
          }
        }
      } catch {
        // Sheet not accessible — 0 used
      }
    }
  }

  void orgId;

  const quotaRemaining = Math.max(0, monthlyQuota - quotaUsed);
  console.log("[quota] monthly_quota:", monthlyQuota, "quota_used:", quotaUsed, "quota_remaining:", quotaRemaining);

  return NextResponse.json({
    quota_per_day: quotaPerDay,
    monthly_quota: monthlyQuota,
    quota_used: quotaUsed,
    quota_remaining: quotaRemaining,
    is_essential: isEssential,
    trial_ends_at: trialEndsAtIso,
    is_trial_active: isTrialActive,
    trial_quota: trialQuota,
  });
}
