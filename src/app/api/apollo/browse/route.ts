import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceSupabase } from "@/lib/inbox-server";
import { google } from "googleapis";

export const runtime = "nodejs";

// ── Google Sheets helpers ─────────────────────────────────────────────────────

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

const COL_APOLLO_ID = 26; // "Apollo Contact Id" — 0-based index

/**
 * Load existing Apollo Contact IDs from the client's Google Sheet tab.
 * Returns empty Set if no tab exists or no sheet configured.
 */
async function loadExistingApolloIds(
  clientEmail: string | null,
  companyName: string | null,
  orgId: number
): Promise<Set<string>> {
  const ids = new Set<string>();
  const MASTER_SHEET_ID = process.env.GOOGLE_MASTER_SHEET_ID;
  if (!MASTER_SHEET_ID) return ids;

  const auth = getGoogleAuth();
  if (!auth) return ids;

  try {
    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: MASTER_SHEET_ID });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sheetsList: any[] = spreadsheet.data.sheets ?? [];

    // Find tab by email in title (robust to company name changes)
    const tabName = clientEmail
      ? `${companyName ?? `Client ${orgId}`} — ${clientEmail}`.replace(/[\\/?*[\]:]/g, "-").slice(0, 100)
      : null;
    const existingTab = clientEmail
      ? sheetsList.find((s: any) => s.properties?.title?.includes(clientEmail))
      : tabName
      ? sheetsList.find((s: any) => s.properties?.title === tabName)
      : null;

    if (!existingTab?.properties?.title) return ids;

    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId: MASTER_SHEET_ID,
      range: `'${existingTab.properties.title}'`,
    });

    const rows = readRes.data.values;
    if (!rows || rows.length < 2) return ids;

    for (let i = 1; i < rows.length; i++) {
      const apolloId = (rows[i][COL_APOLLO_ID] ?? "").toString().trim();
      if (apolloId) ids.add(apolloId);
    }

    console.log(`[browse] Loaded ${ids.size} existing Apollo IDs from sheet tab "${existingTab.properties.title}"`);
  } catch {
    // Sheet not accessible or tab doesn't exist — no exclusions
  }

  return ids;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET(request: Request) {
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
  const clientEmail = clientRow.email as string | null;
  const companyName = clientRow.company_name as string | null;

  // Fetch ICP filters
  const { data: icpConfig } = await supabase
    .from("icp_configs")
    .select("filters")
    .eq("org_id", orgId)
    .in("status", ["draft", "submitted", "reviewed", "active"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!icpConfig?.filters) {
    return NextResponse.json(
      { error: "Aucun ICP configuré. Remplissez d'abord le questionnaire." },
      { status: 404 }
    );
  }

  const apolloKey = process.env.APOLLO_API_KEY;
  if (!apolloKey) {
    return NextResponse.json(
      { error: "Service de recherche non configuré." },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  let page = Math.max(1, Number(url.searchParams.get("page")) || 1);

  const filters = icpConfig.filters as Record<string, unknown>;
  const perPage = 25;

  // Load existing Apollo IDs from Google Sheet for dedup
  const existingIds = await loadExistingApolloIds(clientEmail, companyName, orgId);
  const existingCount = existingIds.size;

  // Fetch pages from Apollo, skipping already-extracted leads
  const MAX_CONSECUTIVE_EMPTY = 3;
  let consecutiveEmpty = 0;
  let finalProfiles: ReturnType<typeof mapProfile>[] = [];
  let apolloTotalEntries = 0;

  while (finalProfiles.length === 0 && consecutiveEmpty < MAX_CONSECUTIVE_EMPTY) {
    const payload = buildBrowsePayload(filters, page);

    const res = await fetch(
      "https://api.apollo.io/api/v1/mixed_people/api_search",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": apolloKey,
        },
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[apollo/browse] Apollo error:", res.status, errText.slice(0, 300));
      return NextResponse.json(
        { error: "Erreur lors de la recherche." },
        { status: 502 }
      );
    }

    const data = await res.json();

    const people = (
      Array.isArray(data.matches)
        ? data.matches
        : Array.isArray(data.people)
        ? data.people
        : []
    ) as Array<Record<string, unknown>>;

    apolloTotalEntries =
      typeof data.total_entries === "number"
        ? data.total_entries
        : typeof data.pagination?.total_entries === "number"
        ? data.pagination.total_entries
        : typeof data.unique_enriched_records === "number"
        ? data.unique_enriched_records
        : 0;

    if (people.length === 0) break;

    // Filter out already-extracted leads
    const newPeople = existingIds.size > 0
      ? people.filter((p) => {
          const id = typeof p.id === "string" ? p.id.trim() : "";
          return !id || !existingIds.has(id);
        })
      : people;

    if (newPeople.length === 0) {
      // Entire page was duplicates — try next page
      consecutiveEmpty++;
      const apolloTotalPages = Math.ceil(apolloTotalEntries / perPage);
      if (page >= apolloTotalPages) break;
      page++;
      continue;
    }

    consecutiveEmpty = 0;

    finalProfiles = newPeople.slice(0, perPage).map(mapProfile);
  }

  // Adjusted total: Apollo total minus already extracted
  const adjustedTotal = Math.max(0, apolloTotalEntries - existingCount);
  const totalPages = Math.max(1, Math.ceil(adjustedTotal / perPage));

  return NextResponse.json({
    people: finalProfiles,
    total_entries: adjustedTotal,
    page,
    per_page: perPage,
    total_pages: totalPages,
  });
}

function mapProfile(p: Record<string, unknown>) {
  const org = (p.organization as Record<string, unknown>) ?? {};

  // Location: prefer person-level, fallback to org-level
  const city = (p.city as string | null) ?? (org.city as string | null) ?? null;
  const state = (p.state as string | null) ?? (org.state as string | null) ?? null;
  const country = (p.country as string | null) ?? (org.country as string | null) ?? null;

  // Apollo may expose has_city/has_country flags without actual values
  const locationAvailable =
    !city && !country && (p.has_city === true || p.has_country === true);

  return {
    id: p.id ?? null,
    first_name: p.first_name ?? null,
    last_name: maskLastName(p.last_name as string | null),
    title: p.title ?? null,
    linkedin_url: p.linkedin_url ?? null,
    organization: p.organization
      ? {
          name: org.name ?? null,
          industry: org.industry ?? null,
          estimated_num_employees: org.estimated_num_employees ?? null,
        }
      : null,
    city,
    state,
    country,
    location_available: locationAvailable,
  };
}

/** Mask last name like Apollo does: first 2 chars + *** */
function maskLastName(name: string | null): string | null {
  if (!name) return null;
  if (name.length <= 2) return name + "***";
  return name.slice(0, 2) + "***";
}

function buildBrowsePayload(
  rawFilters: Record<string, unknown>,
  page: number
): Record<string, unknown> {
  const filters =
    rawFilters.apollo_filters &&
    typeof rawFilters.apollo_filters === "object" &&
    !Array.isArray(rawFilters.apollo_filters)
      ? (rawFilters.apollo_filters as Record<string, unknown>)
      : rawFilters;

  const payload: Record<string, unknown> = { page, per_page: 25 };

  if (arr(filters.person_titles)) payload.person_titles = filters.person_titles;
  payload.include_similar_titles = true;
  if (str(filters.q_keywords))
    payload.q_keywords = (filters.q_keywords as string).trim();
  if (arr(filters.organization_num_employees_ranges))
    payload.organization_num_employees_ranges =
      filters.organization_num_employees_ranges;
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

function arr(v: unknown): v is unknown[] {
  return Array.isArray(v) && v.length > 0;
}

function str(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
