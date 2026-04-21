import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createServiceSupabase } from "@/lib/inbox-server";
import { resolveClientContextForUser } from "@/lib/client-onboarding-state";
import { deriveSheetTabName } from "@/lib/sheet-tab-name";
import { normalizeLinkedInUrlForMatching } from "@/lib/linkedin-url";
import { google } from "googleapis";

export const runtime = "nodejs";

// Sheet column indices (0-based), matching SHEET_HEADERS in /api/leads/select
const COL_FIRST_NAME = 0;
const COL_LAST_NAME = 1;
const COL_TITLE = 2;
const COL_COMPANY = 3;
const COL_EMAIL = 4;
const COL_LINKEDIN = 14; // "Person Linkedin Url"
// COL_EMAIL kept for Supabase matching only; not returned to client

const FR_DAY_NAMES = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

function getPrimaryEmail(user: Awaited<ReturnType<typeof currentUser>>): string | null {
  return (
    user?.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null
  );
}

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

function maskLastName(raw: string): string {
  const s = raw.trim();
  if (!s) return "***";
  return s.charAt(0).toUpperCase() + "***";
}

function maskLinkedIn(url: string): string {
  const s = url.trim();
  if (!s) return "Non disponible";
  const match = s.match(/linkedin\.com\/in\/([^/?#\s]+)/i);
  if (!match?.[1]) return "Non disponible";
  return `linkedin.com/in/${match[1].charAt(0).toLowerCase()}***`;
}

function nextWorkingDays(from: Date, count: number): Date[] {
  const days: Date[] = [];
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  while (days.length < count) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function emptyResponse() {
  return NextResponse.json({
    total_in_queue: 0,
    next_send: null,
    next_send_timestamp: null,
    days: [],
  });
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const supabase = createServiceSupabase();
  const user = await currentUser();
  const primaryEmail = getPrimaryEmail(user);

  const clientContext = await resolveClientContextForUser(supabase, userId, primaryEmail);
  if (!clientContext) return NextResponse.json({ error: "Client introuvable" }, { status: 404 });

  const orgId = clientContext.clientId;

  const { data: clientRow, error: clientErr } = await supabase
    .from("clients")
    .select("id, quota, email, company_name")
    .eq("id", orgId)
    .single();

  if (clientErr || !clientRow) {
    return NextResponse.json({ error: "Client introuvable" }, { status: 404 });
  }

  const quota = Math.max(1, Number(clientRow.quota) || 10);
  const clientEmail = clientRow.email as string | null;
  const companyName = clientRow.company_name as string | null;

  const MASTER_SHEET_ID = process.env.GOOGLE_MASTER_SHEET_ID;
  if (!MASTER_SHEET_ID) return emptyResponse();

  const googleAuth = getGoogleAuth();
  if (!googleAuth) return emptyResponse();

  // ── Fetch sheet rows ─────────────────────────────────────────────────────────
  let sheetRows: string[][] = [];
  try {
    const sheets = google.sheets({ version: "v4", auth: googleAuth });
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: MASTER_SHEET_ID });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sheetsList: any[] = spreadsheet.data.sheets ?? [];

    const tabName = deriveSheetTabName(companyName, clientEmail, orgId);
    const tab = clientEmail
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? sheetsList.find((s: any) => s.properties?.title?.includes(clientEmail))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : sheetsList.find((s: any) => s.properties?.title === tabName);

    if (!tab?.properties?.title) return emptyResponse();

    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId: MASTER_SHEET_ID,
      range: `'${tab.properties.title}'!A:O`, // columns A–O covers up to col 14 (LinkedIn)
    });

    const rows = readRes.data.values as string[][] | null;
    if (!rows || rows.length < 2) return emptyResponse();

    sheetRows = rows.slice(1); // drop header row
  } catch (err) {
    console.error("[leads/queue] Google Sheets error:", err);
    return emptyResponse();
  }

  // ── Determine queue start position ───────────────────────────────────────────
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  // Fetch yesterday's leads
  const { data: yesterdayLeads } = await supabase
    .from("leads")
    .select("LinkedInURL, linkedin_url_normalized, email")
    .eq("client_id", orgId)
    .gte("created_at", yesterdayStart.toISOString())
    .lt("created_at", todayStart.toISOString());

  let startIndex = 0;

  if (yesterdayLeads && yesterdayLeads.length > 0) {
    // Build a set of normalized LinkedIn URLs and emails from yesterday's leads
    const linkedInSet = new Set<string>();
    const emailSet = new Set<string>();

    for (const lead of yesterdayLeads) {
      const norm =
        String(lead.linkedin_url_normalized ?? "").trim() ||
        (normalizeLinkedInUrlForMatching(lead.LinkedInURL) ?? "");
      if (norm) linkedInSet.add(norm.toLowerCase());
      const em = String(lead.email ?? "").trim().toLowerCase();
      if (em) emailSet.add(em);
    }

    let lastMatchedIndex = -1;
    for (let i = 0; i < sheetRows.length; i++) {
      const row = sheetRows[i];
      const rowLinkedIn = normalizeLinkedInUrlForMatching(row[COL_LINKEDIN] ?? "") ?? "";
      const rowEmail = String(row[COL_EMAIL] ?? "").trim().toLowerCase();
      if (
        (rowLinkedIn && linkedInSet.has(rowLinkedIn.toLowerCase())) ||
        (rowEmail && emailSet.has(rowEmail))
      ) {
        lastMatchedIndex = i;
      }
    }
    startIndex = lastMatchedIndex + 1;
  } else {
    // Fallback: find the first sheet row not yet in Supabase
    const { data: allLeads } = await supabase
      .from("leads")
      .select("LinkedInURL, linkedin_url_normalized, email")
      .eq("client_id", orgId);

    const linkedInSet = new Set<string>();
    const emailSet = new Set<string>();

    for (const lead of allLeads ?? []) {
      const norm =
        String(lead.linkedin_url_normalized ?? "").trim() ||
        (normalizeLinkedInUrlForMatching(lead.LinkedInURL) ?? "");
      if (norm) linkedInSet.add(norm.toLowerCase());
      const em = String(lead.email ?? "").trim().toLowerCase();
      if (em) emailSet.add(em);
    }

    for (let i = 0; i < sheetRows.length; i++) {
      const row = sheetRows[i];
      const rowLinkedIn = normalizeLinkedInUrlForMatching(row[COL_LINKEDIN] ?? "") ?? "";
      const rowEmail = String(row[COL_EMAIL] ?? "").trim().toLowerCase();
      const isProcessed =
        (rowLinkedIn && linkedInSet.has(rowLinkedIn.toLowerCase())) ||
        (rowEmail && emailSet.has(rowEmail));
      if (isProcessed) {
        startIndex = i + 1;
      } else {
        break; // first unprocessed row found
      }
    }
  }

  const queueRows = sheetRows.slice(startIndex, startIndex + quota * 5);
  if (queueRows.length === 0) return emptyResponse();

  // ── Compute next send time ───────────────────────────────────────────────────
  const hour = now.getHours();
  const dow = now.getDay(); // 0=Sun, 1=Mon … 6=Sat
  const isWeekday = dow >= 1 && dow <= 5;

  let firstSendDay: Date;
  let firstSendLabel: string;

  if (isWeekday && hour < 7) {
    firstSendDay = new Date(todayStart);
    firstSendLabel = "Ce matin";
  } else if (dow === 5 && hour >= 7) {
    // Friday after 7h → Monday
    firstSendDay = new Date(todayStart);
    firstSendDay.setDate(firstSendDay.getDate() + 3);
    firstSendLabel = "Lundi";
  } else if (dow === 6) {
    // Saturday → Monday
    firstSendDay = new Date(todayStart);
    firstSendDay.setDate(firstSendDay.getDate() + 2);
    firstSendLabel = "Lundi";
  } else if (dow === 0) {
    // Sunday → Monday
    firstSendDay = new Date(todayStart);
    firstSendDay.setDate(firstSendDay.getDate() + 1);
    firstSendLabel = "Lundi";
  } else {
    // Weekday after 7h → tomorrow (skip weekend)
    firstSendDay = new Date(todayStart);
    firstSendDay.setDate(firstSendDay.getDate() + 1);
    const nextDow = firstSendDay.getDay();
    if (nextDow === 6) firstSendDay.setDate(firstSendDay.getDate() + 2);
    else if (nextDow === 0) firstSendDay.setDate(firstSendDay.getDate() + 1);
    firstSendLabel = "Demain";
  }

  const sendTimestamp = new Date(firstSendDay);
  sendTimestamp.setHours(7, 0, 0, 0);

  // ── Build day buckets ────────────────────────────────────────────────────────
  const workingDays = nextWorkingDays(firstSendDay, 5);

  const days = workingDays
    .map((day, i) => {
      const dayLeads = queueRows.slice(i * quota, (i + 1) * quota);
      if (dayLeads.length === 0) return null;

      const label = i === 0 ? firstSendLabel : FR_DAY_NAMES[day.getDay()];

      return {
        label,
        date: day.toISOString().slice(0, 10),
        leads: dayLeads.map((row) => ({
          first_name: String(row[COL_FIRST_NAME] ?? "").trim(),
          last_name_masked: maskLastName(String(row[COL_LAST_NAME] ?? "")),
          title: String(row[COL_TITLE] ?? "").trim(),
          company: String(row[COL_COMPANY] ?? "").trim(),
          linkedin_masked: maskLinkedIn(String(row[COL_LINKEDIN] ?? "")),
        })),
      };
    })
    .filter(Boolean);

  return NextResponse.json({
    total_in_queue: queueRows.length,
    next_send: `${firstSendLabel} 07h00`,
    next_send_timestamp: sendTimestamp.toISOString(),
    days,
  });
}
