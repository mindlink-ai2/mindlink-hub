import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceSupabase } from "@/lib/inbox-server";
import { google } from "googleapis";

export const runtime = "nodejs";
export const maxDuration = 300;

type ApolloPersonRaw = Record<string, unknown>;

type LeadInput = {
  id: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  organization?: { name?: string } | null;
};

// ── Google Sheets helpers ───────────────────────────────────────────────────

function getGoogleAuth() {
  const raw = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY non défini");
  const credentials = JSON.parse(raw) as Record<string, string>;
  credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function deriveTabName(
  companyName: string | null,
  email: string | null,
  orgId: number
): string {
  return (companyName ?? email ?? `Client ${orgId}`)
    .replace(/[\\/?*[\]:]/g, "-")
    .slice(0, 100);
}

const SHEET_HEADERS = [
  "First Name", "Last Name", "Title", "Company Name", "Email",
  "Email Status", "Seniority", "Departments", "Work Direct Phone",
  "Mobile Phone", "Corporate Phone", "# Employees", "Industry",
  "Keywords", "Person Linkedin Url", "Website", "Company Linkedin Url",
  "City", "State", "Country", "Company City", "Company State",
  "Company Country", "Company Phone", "Technologies", "Annual Revenue",
  "Apollo Contact Id", "Apollo Account Id",
];

function formatPersonRow(p: ApolloPersonRaw): string[] {
  const org = (p.organization as Record<string, unknown> | null) ?? {};
  const getStr = (v: unknown) =>
    typeof v === "string" ? v : v != null ? String(v) : "";
  const joinArr = (v: unknown) =>
    Array.isArray(v) ? (v as unknown[]).map(getStr).join(", ") : "";

  const phoneNumbers = Array.isArray(p.phone_numbers)
    ? (p.phone_numbers as Record<string, unknown>[])
    : [];
  const getPhone = (type: string) => {
    const found = phoneNumbers.find((ph) => ph.type === type);
    return found ? getStr(found.sanitized_number ?? found.raw_number) : "";
  };

  const techs = Array.isArray(p.technologies)
    ? (p.technologies as unknown[]).map((t) =>
        typeof t === "string"
          ? t
          : getStr((t as Record<string, unknown>)?.name ?? t)
      )
    : [];

  return [
    getStr(p.first_name),
    getStr(p.last_name),
    getStr(p.title),
    getStr(org.name),
    getStr(p.email),
    getStr(p.email_status),
    getStr(p.seniority),
    joinArr(p.departments),
    getStr(p.work_direct_phone) || getPhone("work_direct_phone"),
    getStr(p.mobile_phone) || getPhone("mobile"),
    getPhone("corporate") || getStr(org.phone),
    getStr(org.estimated_num_employees),
    getStr(org.industry),
    joinArr(p.keywords),
    getStr(p.linkedin_url),
    getStr(org.website_url ?? org.primary_domain),
    getStr(org.linkedin_url),
    getStr(p.city),
    getStr(p.state),
    getStr(p.country),
    getStr(org.city),
    getStr(org.state),
    getStr(org.country),
    getStr(org.phone),
    techs.join(", "),
    getStr(org.annual_revenue),
    getStr(p.id),
    getStr(p.account_id ?? (org as Record<string, unknown>).id),
  ];
}

// ── Apollo bulk_match ───────────────────────────────────────────────────────

async function apolloBulkMatch(
  ids: string[],
  apiKey: string
): Promise<ApolloPersonRaw[]> {
  const res = await fetch("https://api.apollo.io/api/v1/people/bulk_match", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify({
      details: ids.map((id) => ({ id })),
      reveal_personal_emails: true,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Apollo bulk_match HTTP ${res.status}: ${errText.slice(0, 200)}`
    );
  }

  const data = await res.json();
  const matches = Array.isArray(data.matches)
    ? data.matches
    : Array.isArray(data.people)
    ? data.people
    : [];
  return (matches as (ApolloPersonRaw | null)[]).filter(
    Boolean
  ) as ApolloPersonRaw[];
}

async function apolloSingleMatch(
  id: string,
  apiKey: string
): Promise<ApolloPersonRaw | null> {
  const res = await fetch("https://api.apollo.io/api/v1/people/match", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify({ id, reveal_personal_emails: true }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return (data.person ?? data.match ?? null) as ApolloPersonRaw | null;
}

// ── Handler ─────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabase = createServiceSupabase();

  const { data: clientRow, error: clientErr } = await supabase
    .from("clients")
    .select("id, email, company_name")
    .eq("clerk_user_id", userId)
    .single();

  if (clientErr || !clientRow) {
    return NextResponse.json({ error: "Client introuvable" }, { status: 404 });
  }
  const orgId: number = clientRow.id;

  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const rawLeads = body?.leads;
  if (!Array.isArray(rawLeads) || rawLeads.length === 0) {
    return NextResponse.json(
      { error: "Aucun lead sélectionné" },
      { status: 400 }
    );
  }

  const leads: LeadInput[] = rawLeads
    .filter(
      (l): l is Record<string, unknown> =>
        l != null && typeof l === "object" && typeof l.id === "string"
    )
    .slice(0, 500);

  if (leads.length === 0) {
    return NextResponse.json(
      { error: "Aucun lead valide" },
      { status: 400 }
    );
  }

  const apolloKey = process.env.APOLLO_API_KEY;
  if (!apolloKey) {
    return NextResponse.json(
      { error: "Service d'enrichissement non configuré." },
      { status: 500 }
    );
  }

  const MASTER_SHEET_ID = process.env.GOOGLE_MASTER_SHEET_ID;
  if (!MASTER_SHEET_ID) {
    return NextResponse.json(
      { error: "Google Sheets non configuré." },
      { status: 500 }
    );
  }

  // Fetch ICP config for log reference
  const { data: icpConfig } = await supabase
    .from("icp_configs")
    .select("id")
    .eq("org_id", orgId)
    .in("status", ["draft", "submitted", "reviewed", "active"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Create extraction log
  const { data: extractionLog } = await supabase
    .from("extraction_logs")
    .insert({
      org_id: orgId,
      icp_config_id: icpConfig?.id ?? null,
      status: "running",
      leads_count: 0,
      source: "client_selection",
    })
    .select("id")
    .single();
  const logId = extractionLog?.id ?? null;

  // ── Enrichment via bulk_match (batches of 10) ──
  const BATCH_SIZE = 10;
  const enrichedPeople: ApolloPersonRaw[] = [];
  const allIds = leads.map((l) => l.id);

  console.log(
    `[leads/select] org_id=${orgId} Starting enrichment: ${allIds.length} leads`
  );

  for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
    const batchIds = allIds.slice(i, i + BATCH_SIZE);
    try {
      const enriched = await apolloBulkMatch(batchIds, apolloKey);
      enrichedPeople.push(...enriched);
    } catch (err) {
      console.error(
        `[leads/select] bulk_match batch failed, trying single:`,
        err instanceof Error ? err.message : err
      );
      for (const id of batchIds) {
        try {
          const single = await apolloSingleMatch(id, apolloKey);
          if (single) enrichedPeople.push(single);
        } catch {
          // skip this lead
        }
      }
    }
  }

  console.log(
    `[leads/select] Enriched ${enrichedPeople.length}/${allIds.length} leads`
  );

  if (enrichedPeople.length === 0) {
    if (logId) {
      await supabase
        .from("extraction_logs")
        .update({
          status: "failed",
          error_message: "Aucun lead enrichi",
          completed_at: new Date().toISOString(),
        })
        .eq("id", logId);
    }
    return NextResponse.json(
      { error: "L'enrichissement a échoué. Veuillez réessayer." },
      { status: 502 }
    );
  }

  // ── Write to Google Sheet ──
  const company = clientRow.company_name as string | null;
  const clientEmail = clientRow.email as string | null;
  const tabName = deriveTabName(company, clientEmail, orgId);

  let sheetUrl = "";
  try {
    const authClient = getGoogleAuth();
    const sheets = google.sheets({ version: "v4", auth: authClient });
    const dataRows = enrichedPeople.map(formatPersonRow);

    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: MASTER_SHEET_ID,
    });
    const existingTab = (spreadsheet.data.sheets ?? []).find(
      (s) => s.properties?.title === tabName
    );

    if (!existingTab) {
      const batchRes = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: MASTER_SHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: tabName } } }],
        },
      });
      const newSheetId =
        batchRes.data.replies![0].addSheet!.properties!.sheetId!;
      sheetUrl = `https://docs.google.com/spreadsheets/d/${MASTER_SHEET_ID}/edit#gid=${newSheetId}`;

      await sheets.spreadsheets.values.update({
        spreadsheetId: MASTER_SHEET_ID,
        range: `'${tabName}'!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [SHEET_HEADERS, ...dataRows] },
      });
    } else {
      const gid = existingTab.properties!.sheetId!;
      sheetUrl = `https://docs.google.com/spreadsheets/d/${MASTER_SHEET_ID}/edit#gid=${gid}`;

      await sheets.spreadsheets.values.append({
        spreadsheetId: MASTER_SHEET_ID,
        range: `'${tabName}'!A:A`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: dataRows },
      });
    }

    console.log(
      `[leads/select] Wrote ${dataRows.length} leads to sheet tab "${tabName}"`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[leads/select] Google Sheets error:", msg);
    if (logId) {
      await supabase
        .from("extraction_logs")
        .update({
          status: "failed",
          error_message: msg,
          completed_at: new Date().toISOString(),
        })
        .eq("id", logId);
    }
    return NextResponse.json(
      { error: "Erreur lors de l'écriture des leads." },
      { status: 502 }
    );
  }

  // ── Update extraction log ──
  if (logId) {
    await supabase
      .from("extraction_logs")
      .update({
        status: "completed",
        leads_count: enrichedPeople.length,
        google_sheet_url: sheetUrl,
        google_sheet_id: MASTER_SHEET_ID,
        completed_at: new Date().toISOString(),
      })
      .eq("id", logId);
  }

  // Update ICP status if during onboarding
  if (body?.mark_submitted) {
    await supabase
      .from("icp_configs")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .in("status", ["draft"]);
  }

  return NextResponse.json({
    success: true,
    leads_written: enrichedPeople.length,
  });
}
