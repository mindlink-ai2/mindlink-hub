import { NextResponse } from "next/server";
import { getSupportAdminContext } from "@/lib/support-admin-auth";
import { createServiceSupabase } from "@/lib/inbox-server";
import { google } from "googleapis";

export const runtime = "nodejs";
export const maxDuration = 300; // Vercel Pro: jusqu'à 300s pour les extractions longues

type ApolloPersonRaw = Record<string, unknown>;

interface ExtractRequestBody {
  org_id: number;
  quota: number;
  filters_override?: Record<string, unknown>;
}

// ── Helpers Apollo ────────────────────────────────────────────────────────────

/**
 * Whitelist stricte des paramètres acceptés par mixed_people/api_search.
 *
 * Gère les deux formats de filters dans icp_configs :
 *  - Nouveau format : { questionnaire: {...}, apollo_filters: {...}, commercial_promise: "..." }
 *  - Ancien format  : les filtres Apollo directement à la racine
 */
function buildApolloPayload(
  rawFilters: Record<string, unknown>,
  page: number
): Record<string, unknown> {
  // Détecter le nouveau format (questionnaire + apollo_filters)
  const filters =
    rawFilters.apollo_filters &&
    typeof rawFilters.apollo_filters === "object" &&
    !Array.isArray(rawFilters.apollo_filters)
      ? (rawFilters.apollo_filters as Record<string, unknown>)
      : rawFilters;

  const payload: Record<string, unknown> = { page, per_page: 100 };

  // ── Personne ──
  if (arr(filters.person_titles)) payload.person_titles = filters.person_titles;
  payload.include_similar_titles = true;
  if (str(filters.q_keywords)) payload.q_keywords = (filters.q_keywords as string).trim();

  // ── Entreprise ──
  if (arr(filters.organization_num_employees_ranges))
    payload.organization_num_employees_ranges = filters.organization_num_employees_ranges;
  if (arr(filters.organization_locations))
    payload.organization_locations = filters.organization_locations;
  if (arr(filters.currently_using_any_of_technology_uids))
    payload.currently_using_any_of_technology_uids =
      filters.currently_using_any_of_technology_uids;

  // Revenue range
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
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify(buildApolloPayload(filters, page)),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Apollo HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  // Nouveau endpoint : "matches", ancien : "people"
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
  apiKey: string,
  batchLabel: string = ""
): Promise<ApolloPersonRaw[]> {
  const url = "https://api.apollo.io/api/v1/people/bulk_match";
  const requestBody = {
    details: ids.map((id) => ({ id })),
    reveal_personal_emails: true,
  };
  console.log(`[extract][bulk_match]${batchLabel} URL: ${url}`);
  console.log(`[extract][bulk_match]${batchLabel} Request body:`, JSON.stringify(requestBody).slice(0, 500));

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify(requestBody),
  });

  console.log(`[extract][bulk_match]${batchLabel} Response status: ${res.status}`);

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`[extract][bulk_match]${batchLabel} Error body:`, errText.slice(0, 500));
    throw new Error(`Apollo bulk_match HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  console.log(`[extract][bulk_match]${batchLabel} Response keys:`, Object.keys(data));
  const matches = Array.isArray(data.matches)
    ? data.matches
    : Array.isArray(data.people)
    ? data.people
    : [];
  console.log(`[extract][bulk_match]${batchLabel} Raw matches count: ${matches.length}, non-null: ${(matches as (ApolloPersonRaw | null)[]).filter(Boolean).length}`);

  // Log first match sample to check enrichment fields
  const firstMatch = (matches as (ApolloPersonRaw | null)[])[0];
  if (firstMatch) {
    console.log(`[extract][bulk_match]${batchLabel} Sample enriched lead:`, JSON.stringify({
      name: firstMatch.first_name,
      email: firstMatch.email,
      email_status: firstMatch.email_status,
      seniority: firstMatch.seniority,
      departments: firstMatch.departments,
      phone_numbers: firstMatch.phone_numbers,
      work_direct_phone: firstMatch.work_direct_phone,
      mobile_phone: firstMatch.mobile_phone,
    }).slice(0, 500));
  }

  return (matches as (ApolloPersonRaw | null)[]).filter(Boolean) as ApolloPersonRaw[];
}

/**
 * Fallback: enrichissement un par un via people/match si bulk_match échoue.
 */
async function apolloSingleMatch(
  id: string,
  apiKey: string
): Promise<ApolloPersonRaw | null> {
  const url = "https://api.apollo.io/api/v1/people/match";
  const requestBody = {
    id,
    reveal_personal_emails: true,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`[extract][single_match] id=${id} HTTP ${res.status}:`, errText.slice(0, 200));
    return null;
  }

  const data = await res.json();
  return (data.person ?? data.match ?? null) as ApolloPersonRaw | null;
}

// ── Helpers Google Sheets (googleapis SDK) ───────────────────────────────────

function getGoogleAuth() {
  const raw = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY non défini");
  const credentials = JSON.parse(raw) as Record<string, string>;
  // Vercel encode les sauts de ligne en \\n — on les restaure
  credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  console.log("[extract] SA email:", credentials.client_email);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

// ── Formater un profil Apollo enrichi en ligne de sheet ───────────────────────

function formatPersonRow(p: ApolloPersonRaw): string[] {
  const org = (p.organization as Record<string, unknown> | null) ?? {};
  const getStr = (v: unknown) =>
    typeof v === "string" ? v : v != null ? String(v) : "";
  const joinArr = (v: unknown) =>
    Array.isArray(v) ? (v as unknown[]).map(getStr).join(", ") : "";

  // Phone numbers from enriched phone_numbers array
  const phoneNumbers = Array.isArray(p.phone_numbers)
    ? (p.phone_numbers as Record<string, unknown>[])
    : [];
  const getPhone = (type: string) => {
    const found = phoneNumbers.find((ph) => ph.type === type);
    return found ? getStr(found.sanitized_number ?? found.raw_number) : "";
  };

  // Technologies: can be array of strings or objects with .name
  const techs = Array.isArray(p.technologies)
    ? (p.technologies as unknown[]).map((t) =>
        typeof t === "string" ? t : getStr((t as Record<string, unknown>)?.name ?? t)
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

const SHEET_HEADERS = [
  "First Name", "Last Name", "Title", "Company Name", "Email",
  "Email Status", "Seniority", "Departments", "Work Direct Phone",
  "Mobile Phone", "Corporate Phone", "# Employees", "Industry",
  "Keywords", "Person Linkedin Url", "Website", "Company Linkedin Url",
  "City", "State", "Country", "Company City", "Company State",
  "Company Country", "Company Phone", "Technologies", "Annual Revenue",
  "Apollo Contact Id", "Apollo Account Id",
];

// ── Helpers pour déduplication ───────────────────────────────────────────────

/** Derive tab name from client data — must stay in sync with the sheet-write logic below. */
function deriveTabName(companyName: string | null, email: string | null, orgId: number): string {
  return (companyName ?? email ?? `Client ${orgId}`)
    .replace(/[\\/?*[\]:]/g, "-")
    .slice(0, 100);
}

const COL_LINKEDIN_URL = 14; // "Person Linkedin Url" — 0-based index in SHEET_HEADERS
const COL_APOLLO_ID = 26;    // "Apollo Contact Id"

/**
 * Read existing leads from the client's Google Sheet tab.
 * Returns a Set of known identifiers (Apollo ID or LinkedIn URL) for dedup.
 */
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
    // Tab doesn't exist yet — no existing leads
  }
  return ids;
}

/** Check if a person is already in the existing set (by Apollo ID or LinkedIn URL). */
function isDuplicate(person: ApolloPersonRaw, existingIds: Set<string>): boolean {
  const apolloId = typeof person.id === "string" ? person.id.trim() : "";
  if (apolloId && existingIds.has(apolloId)) return true;
  const linkedinUrl = typeof person.linkedin_url === "string" ? person.linkedin_url.trim().toLowerCase() : "";
  if (linkedinUrl && existingIds.has(linkedinUrl)) return true;
  return false;
}

// ── Handler principal ─────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const adminCtx = await getSupportAdminContext();
  if (!adminCtx) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  let body: ExtractRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const { org_id, quota, filters_override } = body;
  const orgId = Number(org_id);
  if (!orgId || !quota || quota < 1) {
    return NextResponse.json({ error: "org_id et quota requis" }, { status: 400 });
  }

  const supabase = createServiceSupabase();

  // Récupérer les infos client
  const { data: clientRow, error: clientErr } = await supabase
    .from("clients")
    .select("id, email, company_name")
    .eq("id", orgId)
    .single();

  if (clientErr || !clientRow) {
    console.error("[extract] client lookup failed — orgId:", orgId, "error:", clientErr?.code, clientErr?.message, clientErr?.details);
    return NextResponse.json(
      { error: "Client introuvable", debug: { orgId, code: clientErr?.code, detail: clientErr?.message } },
      { status: 404 }
    );
  }

  // Récupérer la config ICP (draft ou submitted, tant que les filtres existent)
  const { data: icpConfig, error: icpErr } = await supabase
    .from("icp_configs")
    .select("id, filters, status")
    .eq("org_id", orgId)
    .in("status", ["draft", "submitted", "reviewed", "active"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (icpErr || !icpConfig) {
    return NextResponse.json(
      { error: "Aucun ICP trouvé pour ce client." },
      { status: 404 }
    );
  }

  const apolloKey = process.env.APOLLO_API_KEY;
  if (!apolloKey) {
    return NextResponse.json({ error: "Clé Apollo non configurée" }, { status: 500 });
  }

  const MASTER_SHEET_ID = process.env.GOOGLE_MASTER_SHEET_ID;
  if (!MASTER_SHEET_ID) {
    return NextResponse.json({ error: "GOOGLE_MASTER_SHEET_ID non configurée" }, { status: 500 });
  }

  // ── Charger les leads existants pour déduplication ──────────────────────────
  const company = (clientRow as Record<string, unknown>).company_name as string | null;
  const clientEmail = clientRow.email as string | null;
  const tabName = deriveTabName(company, clientEmail, orgId);

  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const existingIds = await loadExistingLeadIds(sheets, MASTER_SHEET_ID, tabName);
  console.log(`[extract] Existing leads in sheet: ${existingIds.size / 2}`); // each lead adds ~2 entries (id + url)

  // Créer le log d'extraction avec statut "running"
  const { data: extractionLog, error: logErr } = await supabase
    .from("extraction_logs")
    .insert({
      org_id: orgId,
      icp_config_id: icpConfig.id,
      status: "running",
      leads_count: 0,
    })
    .select("id")
    .single();

  if (logErr || !extractionLog) {
    return NextResponse.json({ error: "Impossible de créer le log d'extraction" }, { status: 500 });
  }
  const logId: string = extractionLog.id;

  // Utiliser les filtres override si fournis, sinon ceux de la DB
  const filters = filters_override
    ? ({ apollo_filters: filters_override } as Record<string, unknown>)
    : ((icpConfig.filters ?? {}) as Record<string, unknown>);

  // ── Extraction Apollo par pages (avec déduplication) ───────────────────────
  const newPeople: ApolloPersonRaw[] = [];
  let page = 1;
  let totalDuplicates = 0;
  const MAX_PAGES = 20;

  try {
    while (newPeople.length < quota && page <= MAX_PAGES) {
      const { people, total } = await apolloFetchPage(filters, page, apolloKey);
      if (people.length === 0) break;

      let pageDuplicates = 0;
      for (const person of people) {
        if (isDuplicate(person, existingIds)) {
          pageDuplicates++;
          continue;
        }
        // Ajouter à existingIds pour éviter les doublons intra-extraction
        const pid = typeof person.id === "string" ? person.id.trim() : "";
        if (pid) existingIds.add(pid);
        const purl = typeof person.linkedin_url === "string" ? person.linkedin_url.trim().toLowerCase() : "";
        if (purl) existingIds.add(purl);

        newPeople.push(person);
        if (newPeople.length >= quota) break;
      }

      totalDuplicates += pageDuplicates;
      console.log(`[extract] Page ${page}: ${people.length} leads returned, ${people.length - pageDuplicates} new (${pageDuplicates} duplicates filtered)`);

      if (page * 100 >= total) break; // plus de résultats Apollo
      page++;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase
      .from("extraction_logs")
      .update({ status: "failed", error_message: msg, completed_at: new Date().toISOString() })
      .eq("id", logId);
    return NextResponse.json({ error: `Erreur Apollo: ${msg}` }, { status: 502 });
  }

  if (newPeople.length < quota) {
    console.warn(`[extract] Only ${newPeople.length} new leads found out of ${quota} requested — Apollo base exhausted for these filters`);
  }
  console.log(`[extract] Final: ${newPeople.length} new leads extracted (${totalDuplicates} duplicates skipped)`);

  const finalPeople = newPeople;

  // ── Phase 2 : Enrichissement via people/bulk_match ────────────────────────
  const BATCH_SIZE = 10;
  const enrichedPeople: ApolloPersonRaw[] = [];
  let totalEnriched = 0;
  let totalFallbackSingle = 0;
  let bulkMatchFailed = false;

  console.log(`[extract] Starting enrichment: ${finalPeople.length} leads, batch size ${BATCH_SIZE}`);
  console.log(`[extract] Sample raw lead before enrichment:`, JSON.stringify({
    id: finalPeople[0]?.id,
    email: finalPeople[0]?.email,
    seniority: finalPeople[0]?.seniority,
    departments: finalPeople[0]?.departments,
  }).slice(0, 300));

  for (let i = 0; i < finalPeople.length; i += BATCH_SIZE) {
    const batch = finalPeople.slice(i, i + BATCH_SIZE);
    const batchIds = batch.map((p) => p.id as string).filter(Boolean);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batchLabel = ` batch-${batchNum}`;

    if (batchIds.length === 0) {
      console.warn(`[extract]${batchLabel}: no valid IDs, keeping raw data`);
      enrichedPeople.push(...batch);
      continue;
    }

    // Essayer bulk_match d'abord (sauf si déjà échoué systématiquement)
    if (!bulkMatchFailed) {
      try {
        const enriched = await apolloBulkMatch(batchIds, apolloKey, batchLabel);
        enrichedPeople.push(...enriched);
        totalEnriched += enriched.length;
        console.log(`[extract]${batchLabel}: bulk_match OK — ${enriched.length}/${batchIds.length} enrichis`);
        continue;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[extract]${batchLabel}: bulk_match FAILED — ${msg}`);
        if (batchNum === 1) {
          console.warn(`[extract] bulk_match failed on first batch, switching to single match fallback`);
          bulkMatchFailed = true;
        } else {
          // Fallback pour ce batch uniquement
          enrichedPeople.push(...batch);
          continue;
        }
      }
    }

    // Fallback : people/match one-by-one
    console.log(`[extract]${batchLabel}: using single match fallback for ${batchIds.length} leads`);
    for (const person of batch) {
      const pid = person.id as string;
      if (!pid) {
        enrichedPeople.push(person);
        continue;
      }
      try {
        const enriched = await apolloSingleMatch(pid, apolloKey);
        if (enriched) {
          enrichedPeople.push(enriched);
          totalFallbackSingle++;
        } else {
          enrichedPeople.push(person);
        }
      } catch {
        enrichedPeople.push(person);
      }
    }
  }

  console.log(`[extract] Enrichment done: ${totalEnriched} via bulk_match, ${totalFallbackSingle} via single_match, ${finalPeople.length - totalEnriched - totalFallbackSingle} raw fallback, total=${enrichedPeople.length}`);

  // ── Écrire dans le sheet maître (un onglet par client, avec append si existant) ──
  let sheetUrl: string;

  try {
    // Vérifier si l'onglet existe déjà dans le master sheet
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: MASTER_SHEET_ID });
    const existingTab = (spreadsheet.data.sheets ?? []).find(
      (s) => s.properties?.title === tabName
    );

    const dataRows = enrichedPeople.map(formatPersonRow);
    console.log("[extract] Tab:", tabName, "| existing:", !!existingTab, "| leads:", dataRows.length);

    if (!existingTab) {
      // Créer l'onglet et écrire headers + données
      const batchRes = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: MASTER_SHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: tabName } } }],
        },
      });
      const newSheetId = batchRes.data.replies![0].addSheet!.properties!.sheetId!;
      sheetUrl = `https://docs.google.com/spreadsheets/d/${MASTER_SHEET_ID}/edit#gid=${newSheetId}`;
      console.log("[extract] Tab created, gid:", newSheetId);

      await sheets.spreadsheets.values.update({
        spreadsheetId: MASTER_SHEET_ID,
        range: `'${tabName}'!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [SHEET_HEADERS, ...dataRows] },
      });
      console.log("[extract] Headers + data written");
    } else {
      // Onglet existant : appendre les nouvelles lignes à la suite
      const gid = existingTab.properties!.sheetId!;
      sheetUrl = `https://docs.google.com/spreadsheets/d/${MASTER_SHEET_ID}/edit#gid=${gid}`;

      await sheets.spreadsheets.values.append({
        spreadsheetId: MASTER_SHEET_ID,
        range: `'${tabName}'!A:A`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: dataRows },
      });
      console.log("[extract] Leads appended to existing tab");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[extract] Google Sheets step failed:", msg);
    await supabase
      .from("extraction_logs")
      .update({ status: "failed", error_message: msg, completed_at: new Date().toISOString() })
      .eq("id", logId);
    return NextResponse.json({ error: `Erreur Google Sheets: ${msg}` }, { status: 502 });
  }

  // ── Mettre à jour le log d'extraction ─────────────────────────────────────
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

  return NextResponse.json({
    success: true,
    leads_count: enrichedPeople.length,
    google_sheet_url: sheetUrl,
    google_sheet_id: MASTER_SHEET_ID,
    tab_name: tabName,
    extraction_log_id: logId,
  });
}

function arr(v: unknown): v is unknown[] {
  return Array.isArray(v) && v.length > 0;
}

function str(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
