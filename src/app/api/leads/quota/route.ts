import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceSupabase } from "@/lib/inbox-server";
import { google } from "googleapis";

export const runtime = "nodejs";

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

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabase = createServiceSupabase();

  const { data: clientRow, error: clientErr } = await supabase
    .from("clients")
    .select("id, quota, email, company_name")
    .eq("clerk_user_id", userId)
    .single();

  if (clientErr || !clientRow) {
    return NextResponse.json({ error: "Client introuvable" }, { status: 404 });
  }

  const orgId: number = clientRow.id;
  const quotaPerDay = Number(clientRow.quota) || 10;
  const monthlyQuota = quotaPerDay * 22;
  const clientEmail = clientRow.email as string | null;

  // Count leads already in the client's Google Sheet tab
  let quotaUsed = 0;
  const MASTER_SHEET_ID = process.env.GOOGLE_MASTER_SHEET_ID;

  if (MASTER_SHEET_ID) {
    const auth = getGoogleAuth();
    if (auth) {
      try {
        const sheets = google.sheets({ version: "v4", auth });
        const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: MASTER_SHEET_ID });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sheetsList: any[] = spreadsheet.data.sheets ?? [];
        const existingTab = clientEmail
          ? sheetsList.find((s: any) => s.properties?.title?.includes(clientEmail))
          : null;

        if (existingTab?.properties?.title) {
          const readRes = await sheets.spreadsheets.values.get({
            spreadsheetId: MASTER_SHEET_ID,
            range: `'${existingTab.properties.title}'!A:A`,
          });
          const rows = readRes.data.values;
          if (rows && rows.length > 1) {
            quotaUsed = rows.length - 1; // minus header
          }
        }
      } catch {
        // Sheet not accessible — 0 used
      }
    }
  }

  const quotaRemaining = Math.max(0, monthlyQuota - quotaUsed);

  return NextResponse.json({
    quota_per_day: quotaPerDay,
    monthly_quota: monthlyQuota,
    quota_used: quotaUsed,
    quota_remaining: quotaRemaining,
  });
}
