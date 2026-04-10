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
  if (arr(filters.person_seniorities)) payload.person_seniorities = filters.person_seniorities;
  if (arr(filters.person_locations)) payload.person_locations = filters.person_locations;

  // ── Mots-clés ──
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
      reveal_phone_number: true,
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

  const { org_id, quota } = body;
  // Forcer la coercion en nombre (client.id peut arriver en string selon la version supabase-js)
  const orgId = Number(org_id);
  if (!orgId || !quota || quota < 1) {
    return NextResponse.json({ error: "org_id et quota requis" }, { status: 400 });
  }

  const supabase = createServiceSupabase();

  // Récupérer les infos client (nom, prénom, entreprise)
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

  // Récupérer la config ICP validée
  const { data: icpConfig, error: icpErr } = await supabase
    .from("icp_configs")
    .select("id, filters, status")
    .eq("org_id", orgId)
    .in("status", ["submitted", "reviewed", "active"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (icpErr || !icpConfig) {
    return NextResponse.json(
      { error: "Aucun ICP validé trouvé pour ce client." },
      { status: 404 }
    );
  }

  const apolloKey = process.env.APOLLO_API_KEY;
  if (!apolloKey) {
    return NextResponse.json({ error: "Clé Apollo non configurée" }, { status: 500 });
  }

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

  const filters = (icpConfig.filters ?? {}) as Record<string, unknown>;

  // ── Extraction Apollo par pages ────────────────────────────────────────────
  const allPeople: ApolloPersonRaw[] = [];
  let page = 1;

  try {
    while (allPeople.length < quota) {
      const { people, total } = await apolloFetchPage(filters, page, apolloKey);
      if (people.length === 0) break;
      allPeople.push(...people);
      if (allPeople.length >= total) break;
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

  const finalPeople = allPeople.slice(0, quota);

  // ── Phase 2 : Enrichissement via people/bulk_match ────────────────────────
  const BATCH_SIZE = 10;
  const enrichedPeople: ApolloPersonRaw[] = [];
  let totalEnriched = 0;

  for (let i = 0; i < finalPeople.length; i += BATCH_SIZE) {
    const batch = finalPeople.slice(i, i + BATCH_SIZE);
    const batchIds = batch.map((p) => p.id as string).filter(Boolean);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    if (batchIds.length === 0) {
      enrichedPeople.push(...batch);
      continue;
    }

    try {
      const enriched = await apolloBulkMatch(batchIds, apolloKey);
      enrichedPeople.push(...enriched);
      totalEnriched += enriched.length;
      console.log(`[extract] Batch ${batchNum}: enriched ${enriched.length}/${batchIds.length}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[extract] Batch ${batchNum} enrichment failed — using raw data:`, msg);
      enrichedPeople.push(...batch);
    }
  }

  console.log(`[extract] Enrichissement terminé: ${totalEnriched}/${finalPeople.length} leads enrichis`);

  // ── Écrire dans le sheet maître (un onglet par extraction) ───────────────
  const MASTER_SHEET_ID = process.env.GOOGLE_MASTER_SHEET_ID;
  if (!MASTER_SHEET_ID) {
    return NextResponse.json({ error: "GOOGLE_MASTER_SHEET_ID non configurée" }, { status: 500 });
  }

  let sheetUrl: string;
  let tabName: string;

  try {
    const auth = getGoogleAuth();
    const sheets = google.sheets({ version: "v4", auth });

    const company = (clientRow as Record<string, unknown>).company_name as string | null;
    const clientEmail = clientRow.email as string | null;
    const baseLabel = company ?? clientEmail ?? `Client ${org_id}`;
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    // Les noms d'onglets Google Sheets : max 100 chars, pas de \ / ? * [ ] :
    tabName = `${baseLabel} — ${today}`
      .replace(/[\\/?*[\]:]/g, "-")
      .slice(0, 100);

    console.log("[extract] Adding tab:", tabName, "to master sheet:", MASTER_SHEET_ID);
    const batchRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: MASTER_SHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: tabName } } }],
      },
    });
    const newSheetId = batchRes.data.replies![0].addSheet!.properties!.sheetId!;
    sheetUrl = `https://docs.google.com/spreadsheets/d/${MASTER_SHEET_ID}/edit#gid=${newSheetId}`;
    console.log("[extract] Tab created, gid:", newSheetId);

    // Écrire les données dans le nouvel onglet
    const rows = [SHEET_HEADERS, ...enrichedPeople.map(formatPersonRow)];
    console.log("[extract] Writing", rows.length - 1, "rows to tab:", tabName);
    await sheets.spreadsheets.values.update({
      spreadsheetId: MASTER_SHEET_ID,
      range: `'${tabName}'!A1`,
      valueInputOption: "RAW",
      requestBody: { values: rows },
    });
    console.log("[extract] Sheet data written");
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
