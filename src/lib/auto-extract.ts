import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { google } from "googleapis";

type ApolloPersonRaw = Record<string, unknown>;

export type AutoExtractSource =
  | "auto_renewal"
  | "auto_completion"
  | "auto_daily"
  | "admin"
  | "client_selection";

export interface AutoExtractResult {
  leadsCount: number;
  googleSheetUrl: string | null;
  googleSheetId: string | null;
  tabName: string | null;
  extractionLogId: string | null;
  error?: string;
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

const COL_LINKEDIN_URL = 14;
const COL_APOLLO_ID = 26;

function arr(v: unknown): v is unknown[] {
  return Array.isArray(v) && v.length > 0;
}
function str(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function buildApolloPayload(
  rawFilters: Record<string, unknown>,
  page: number
): Record<string, unknown> {
  const filters =
    rawFilters.apollo_filters &&
    typeof rawFilters.apollo_filters === "object" &&
    !Array.isArray(rawFilters.apollo_filters)
      ? (rawFilters.apollo_filters as Record<string, unknown>)
      : rawFilters;

  const payload: Record<string, unknown> = { page, per_page: 100 };

  if (arr(filters.person_titles)) payload.person_titles = filters.person_titles;
  payload.include_similar_titles = true;
  if (str(filters.q_keywords)) payload.q_keywords = (filters.q_keywords as string).trim();

  if (arr(filters.organization_num_employees_ranges))
    payload.organization_num_employees_ranges = filters.organization_num_employees_ranges;
  if (arr(filters.organization_locations))
    payload.organization_locations = filters.organization_locations;
  if (arr(filters.currently_using_any_of_technology_uids))
    payload.currently_using_any_of_technology_uids =
      filters.currently_using_any_of_technology_uids;

  if (filters.revenue_range && typeof filters.revenue_range === "object") {
    const rr = filters.revenue_range as Record<string, unknown>;
    const hasMin = rr.min !== null && rr.min !== undefined;
    const hasMax = rr.max !== null && rr.max !== undefined;
    if (hasMin || hasMax) {
      payload.revenue_range = {
        ...(hasMin ? { min: rr.min } : {}),
        ...(hasMax ? { max: rr.max } : {}),
      };
    }
  }

  return payload;
}

async function apolloFetchPage(
  filters: Record<string, unknown>,
  page: number,
  apiKey: string
): Promise<{ people: ApolloPersonRaw[]; total: number }> {
  const res = await fetch("https://api.apollo.io/api/v1/mixed_people/api_search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
    body: JSON.stringify(buildApolloPayload(filters, page)),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Apollo HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const people = Array.isArray(data.matches)
    ? (data.matches as ApolloPersonRaw[])
    : Array.isArray(data.people)
    ? (data.people as ApolloPersonRaw[])
    : [];
  const total: number =
    typeof data.unique_enriched_records === "number"
      ? data.unique_enriched_records
      : typeof data.pagination?.total_entries === "number"
      ? data.pagination.total_entries
      : people.length;

  return { people, total };
}

async function apolloBulkMatch(
  ids: string[],
  apiKey: string
): Promise<ApolloPersonRaw[]> {
  const res = await fetch("https://api.apollo.io/api/v1/people/bulk_match", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
    body: JSON.stringify({
      details: ids.map((id) => ({ id })),
      reveal_personal_emails: true,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Apollo bulk_match HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const matches = Array.isArray(data.matches)
    ? data.matches
    : Array.isArray(data.people)
    ? data.people
    : [];
  return (matches as (ApolloPersonRaw | null)[]).filter(Boolean) as ApolloPersonRaw[];
}

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
        typeof t === "string" ? t : getStr((t as Record<string, unknown>)?.name ?? t)
      )
    : [];

  return [
    getStr(p.first_name), getStr(p.last_name), getStr(p.title),
    getStr(org.name), getStr(p.email), getStr(p.email_status),
    getStr(p.seniority), joinArr(p.departments),
    getStr(p.work_direct_phone) || getPhone("work_direct_phone"),
    getStr(p.mobile_phone) || getPhone("mobile"),
    getPhone("corporate") || getStr(org.phone),
    getStr(org.estimated_num_employees), getStr(org.industry),
    joinArr(p.keywords), getStr(p.linkedin_url),
    getStr(org.website_url ?? org.primary_domain),
    getStr(org.linkedin_url),
    getStr(p.city), getStr(p.state), getStr(p.country),
    getStr(org.city), getStr(org.state), getStr(org.country),
    getStr(org.phone), techs.join(", "),
    getStr(org.annual_revenue),
    getStr(p.id),
    getStr(p.account_id ?? (org as Record<string, unknown>).id),
  ];
}

function deriveTabName(companyName: string | null, email: string | null, orgId: number): string {
  const name = companyName ?? `Client ${orgId}`;
  const suffix = email ? ` — ${email}` : "";
  return `${name}${suffix}`
    .replace(/[\\/?*[\]:]/g, "-")
    .slice(0, 100);
}

async function loadExistingLeadIds(
  sheets: ReturnType<typeof google.sheets>,
  masterSheetId: string,
  tabName: string
): Promise<Set<string>> {
  const ids = new Set<string>();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: masterSheetId,
      range: `'${tabName}'`,
    });
    const rows = res.data.values;
    if (!rows || rows.length < 2) return ids;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const apolloId = (row[COL_APOLLO_ID] ?? "").toString().trim();
      const linkedinUrl = (row[COL_LINKEDIN_URL] ?? "").toString().trim().toLowerCase();
      if (apolloId) ids.add(apolloId);
      if (linkedinUrl) ids.add(linkedinUrl);
    }
  } catch {
    // Tab doesn't exist yet
  }
  return ids;
}

function isDuplicate(person: ApolloPersonRaw, existingIds: Set<string>): boolean {
  const apolloId = typeof person.id === "string" ? person.id.trim() : "";
  if (apolloId && existingIds.has(apolloId)) return true;
  const linkedinUrl = typeof person.linkedin_url === "string" ? person.linkedin_url.trim().toLowerCase() : "";
  if (linkedinUrl && existingIds.has(linkedinUrl)) return true;
  return false;
}

/**
 * Shared Apollo extraction + Google Sheet write pipeline.
 * Used by the admin extract route, the daily cron, and internal automation.
 */
export async function autoExtractLeads(
  supabase: SupabaseClient,
  orgId: number,
  quota: number,
  source: AutoExtractSource
): Promise<AutoExtractResult> {
  if (!orgId || !quota || quota < 1) {
    return {
      leadsCount: 0,
      googleSheetUrl: null,
      googleSheetId: null,
      tabName: null,
      extractionLogId: null,
      error: "org_id et quota requis",
    };
  }

  const { data: clientRow } = await supabase
    .from("clients")
    .select("id, email, company_name")
    .eq("id", orgId)
    .single();

  if (!clientRow) {
    return {
      leadsCount: 0,
      googleSheetUrl: null,
      googleSheetId: null,
      tabName: null,
      extractionLogId: null,
      error: "Client introuvable",
    };
  }

  const { data: icpConfig } = await supabase
    .from("icp_configs")
    .select("id, filters, status")
    .eq("org_id", orgId)
    .in("status", ["draft", "submitted", "reviewed", "active"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!icpConfig) {
    return {
      leadsCount: 0,
      googleSheetUrl: null,
      googleSheetId: null,
      tabName: null,
      extractionLogId: null,
      error: "Aucun ICP trouvé",
    };
  }

  const apolloKey = process.env.APOLLO_API_KEY;
  const MASTER_SHEET_ID = process.env.GOOGLE_MASTER_SHEET_ID;
  if (!apolloKey || !MASTER_SHEET_ID) {
    return {
      leadsCount: 0,
      googleSheetUrl: null,
      googleSheetId: null,
      tabName: null,
      extractionLogId: null,
      error: "Apollo ou Google Sheets non configurés",
    };
  }

  const company = (clientRow as Record<string, unknown>).company_name as string | null;
  const clientEmail = clientRow.email as string | null;
  const tabName = deriveTabName(company, clientEmail, orgId);

  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: "v4", auth });

  let existingTabTitle: string | null = null;
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: MASTER_SHEET_ID });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sheetsList: any[] = meta.data.sheets ?? [];
    const foundTab = clientEmail
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? sheetsList.find((s: any) => s.properties?.title?.includes(clientEmail))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : sheetsList.find((s: any) => s.properties?.title === tabName);
    existingTabTitle = foundTab?.properties?.title ?? null;
  } catch {
    // no access
  }

  const dedupTabName = existingTabTitle ?? tabName;
  const existingIds = await loadExistingLeadIds(sheets, MASTER_SHEET_ID, dedupTabName);

  const { data: extractionLog } = await supabase
    .from("extraction_logs")
    .insert({
      org_id: orgId,
      icp_config_id: icpConfig.id,
      status: "running",
      leads_count: 0,
      source,
    })
    .select("id")
    .single();

  const logId: string | null = extractionLog?.id ?? null;
  const filters = (icpConfig.filters ?? {}) as Record<string, unknown>;

  const newPeople: ApolloPersonRaw[] = [];
  let page = 1;
  const MAX_PAGES = 20;

  try {
    while (newPeople.length < quota && page <= MAX_PAGES) {
      const { people, total } = await apolloFetchPage(filters, page, apolloKey);
      if (people.length === 0) break;

      for (const person of people) {
        if (isDuplicate(person, existingIds)) continue;
        const pid = typeof person.id === "string" ? person.id.trim() : "";
        if (pid) existingIds.add(pid);
        const purl = typeof person.linkedin_url === "string" ? person.linkedin_url.trim().toLowerCase() : "";
        if (purl) existingIds.add(purl);
        newPeople.push(person);
        if (newPeople.length >= quota) break;
      }
      if (page * 100 >= total) break;
      page++;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (logId) {
      await supabase
        .from("extraction_logs")
        .update({ status: "failed", error_message: msg, completed_at: new Date().toISOString() })
        .eq("id", logId);
    }
    return {
      leadsCount: 0,
      googleSheetUrl: null,
      googleSheetId: MASTER_SHEET_ID,
      tabName: null,
      extractionLogId: logId,
      error: `Apollo: ${msg}`,
    };
  }

  // Enrichment
  const BATCH_SIZE = 10;
  const enrichedPeople: ApolloPersonRaw[] = [];
  for (let i = 0; i < newPeople.length; i += BATCH_SIZE) {
    const batch = newPeople.slice(i, i + BATCH_SIZE);
    const batchIds = batch.map((p) => p.id as string).filter(Boolean);
    if (batchIds.length === 0) {
      enrichedPeople.push(...batch);
      continue;
    }
    try {
      const enriched = await apolloBulkMatch(batchIds, apolloKey);
      enrichedPeople.push(...enriched);
    } catch {
      enrichedPeople.push(...batch);
    }
  }

  let sheetUrl: string | null = null;
  let actualTabName = tabName;

  try {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: MASTER_SHEET_ID });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sheetsList: any[] = spreadsheet.data.sheets ?? [];
    const existingTab = clientEmail
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? sheetsList.find((s: any) => s.properties?.title?.includes(clientEmail))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : sheetsList.find((s: any) => s.properties?.title === tabName);

    const dataRows = enrichedPeople.map(formatPersonRow);

    if (!existingTab) {
      const batchRes = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: MASTER_SHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: tabName } } }],
        },
      });
      const newSheetId = batchRes.data.replies![0].addSheet!.properties!.sheetId!;
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
      actualTabName = existingTab.properties!.title!;
      await sheets.spreadsheets.values.append({
        spreadsheetId: MASTER_SHEET_ID,
        range: `'${actualTabName}'!A:A`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: dataRows },
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (logId) {
      await supabase
        .from("extraction_logs")
        .update({ status: "failed", error_message: msg, completed_at: new Date().toISOString() })
        .eq("id", logId);
    }
    return {
      leadsCount: 0,
      googleSheetUrl: null,
      googleSheetId: MASTER_SHEET_ID,
      tabName: null,
      extractionLogId: logId,
      error: `Google Sheets: ${msg}`,
    };
  }

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

  return {
    leadsCount: enrichedPeople.length,
    googleSheetUrl: sheetUrl,
    googleSheetId: MASTER_SHEET_ID,
    tabName: actualTabName,
    extractionLogId: logId,
  };
}
