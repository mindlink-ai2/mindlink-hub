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
    .select("id, quota, email, company_name, plan, current_period_end")
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

  // ── Anchor date from search_credits.created_at ─────────────────────
  // Used as a period_end fallback when Stripe data is missing.
  let anchorDate: Date | null = null;
  {
    const { data: creditRow } = await supabase
      .from("search_credits")
      .select("created_at")
      .eq("org_id", orgId)
      .maybeSingle();
    if (creditRow?.created_at) {
      anchorDate = new Date(creditRow.created_at as string);
    }
  }

  const now = new Date();

  // ── Monthly cap shown to the client ────────────────────────────────
  // Prorate on business days remaining until period_end.
  // Period end resolution order:
  //   1. clients.current_period_end (written by Stripe webhook)
  //   2. anchor (search_credits.created_at) + 31 days
  //   3. end of current calendar month
  const periodEndRaw = (clientRow.current_period_end as string | null) ?? null;
  let periodEndDate: Date | null =
    periodEndRaw ? new Date(periodEndRaw) : null;
  if (!periodEndDate || Number.isNaN(periodEndDate.getTime())) {
    if (anchorDate) {
      periodEndDate = new Date(anchorDate);
      periodEndDate.setDate(periodEndDate.getDate() + 31);
    } else {
      periodEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }
  }

  const businessDaysRemaining = Math.max(
    1,
    countWeekdaysBetween(now, periodEndDate)
  );

  let monthlyQuota = quotaPerDay * businessDaysRemaining;
  if (!monthlyQuota || monthlyQuota <= 0) {
    monthlyQuota = quotaPerDay * MONTHLY_WORKDAYS;
  }

  console.log(
    "[quota] stripe_period_end:",
    periodEndRaw,
    "business_days_remaining:",
    businessDaysRemaining,
    "monthly_quota:",
    monthlyQuota
  );

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

  let quotaRemaining = Math.max(0, monthlyQuota - quotaUsed);

  // Test accounts — never blocked by quota
  const TEST_ORG_IDS = new Set<number>([16, 18]);
  if (TEST_ORG_IDS.has(orgId)) {
    monthlyQuota = 99999;
    quotaRemaining = 99999;
  }

  console.log("[quota] monthly_quota:", monthlyQuota, "quota_used:", quotaUsed, "quota_remaining:", quotaRemaining);

  return NextResponse.json({
    quota_per_day: quotaPerDay,
    monthly_quota: monthlyQuota,
    quota_used: quotaUsed,
    quota_remaining: quotaRemaining,
    is_essential: isEssential,
  });
}
