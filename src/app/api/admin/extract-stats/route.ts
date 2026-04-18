import { NextResponse } from "next/server";
import { getSupportAdminContext } from "@/lib/support-admin-auth";
import { createServiceSupabase } from "@/lib/inbox-server";
import { google } from "googleapis";

export const runtime = "nodejs";

function getGoogleAuth() {
  const raw = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY non defini");
  const credentials = JSON.parse(raw) as Record<string, string>;
  credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

function deriveTabName(companyName: string | null, email: string | null, orgId: number): string {
  return (companyName ?? email ?? `Client ${orgId}`)
    .replace(/[\\/?*[\]:]/g, "-")
    .slice(0, 100);
}

function buildApolloPayload(rawFilters: Record<string, unknown>): Record<string, unknown> {
  const filters =
    rawFilters.apollo_filters &&
    typeof rawFilters.apollo_filters === "object" &&
    !Array.isArray(rawFilters.apollo_filters)
      ? (rawFilters.apollo_filters as Record<string, unknown>)
      : rawFilters;

  const payload: Record<string, unknown> = { page: 1, per_page: 1 };

  if (Array.isArray(filters.person_titles) && filters.person_titles.length > 0)
    payload.person_titles = filters.person_titles;
  payload.include_similar_titles = true;
  if (Array.isArray(filters.person_seniorities) && filters.person_seniorities.length > 0)
    payload.person_seniorities = filters.person_seniorities;
  if (Array.isArray(filters.person_locations) && filters.person_locations.length > 0)
    payload.person_locations = filters.person_locations;
  if (typeof filters.q_keywords === "string" && filters.q_keywords.trim())
    payload.q_keywords = (filters.q_keywords as string).trim();
  if (Array.isArray(filters.organization_num_employees_ranges) && filters.organization_num_employees_ranges.length > 0)
    payload.organization_num_employees_ranges = filters.organization_num_employees_ranges;
  if (Array.isArray(filters.organization_locations) && filters.organization_locations.length > 0)
    payload.organization_locations = filters.organization_locations;
  if (Array.isArray(filters.currently_using_any_of_technology_uids) && filters.currently_using_any_of_technology_uids.length > 0)
    payload.currently_using_any_of_technology_uids = filters.currently_using_any_of_technology_uids;

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

export async function GET(request: Request) {
  const adminCtx = await getSupportAdminContext();
  if (!adminCtx) {
    return NextResponse.json({ error: "Acces refuse" }, { status: 403 });
  }

  const url = new URL(request.url);
  const orgId = Number(url.searchParams.get("org_id"));
  if (!orgId) {
    return NextResponse.json({ error: "org_id requis" }, { status: 400 });
  }

  const supabase = createServiceSupabase();

  // Fetch client + ICP in parallel
  const [clientRes, icpRes] = await Promise.all([
    supabase.from("clients").select("id, email, company_name").eq("id", orgId).single(),
    supabase
      .from("icp_configs")
      .select("filters")
      .eq("org_id", orgId)
      .in("status", ["submitted", "reviewed", "active"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (clientRes.error || !clientRes.data) {
    return NextResponse.json({ error: "Client introuvable" }, { status: 404 });
  }
  if (icpRes.error || !icpRes.data) {
    return NextResponse.json({ error: "Aucun ICP valide" }, { status: 404 });
  }

  const clientRow = clientRes.data;
  const filters = (icpRes.data.filters ?? {}) as Record<string, unknown>;

  console.log("[extract-stats] Raw icp_configs.filters keys:", Object.keys(filters));
  if (filters.apollo_filters) {
    console.log("[extract-stats] apollo_filters keys:", Object.keys(filters.apollo_filters as Record<string, unknown>));
  } else {
    console.log("[extract-stats] No apollo_filters found — full filters:", JSON.stringify(filters).slice(0, 500));
  }

  // ── Apollo: total_entries with per_page=1 ──
  const apolloKey = process.env.APOLLO_API_KEY;
  let totalAvailable = 0;

  if (apolloKey) {
    try {
      const payload = buildApolloPayload(filters);
      console.log("[extract-stats] Apollo payload:", JSON.stringify(payload));

      const res = await fetch("https://api.apollo.io/api/v1/mixed_people/api_search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": apolloKey,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      console.log("[extract-stats] Apollo response:", res.status, JSON.stringify({
        total_entries: data.pagination?.total_entries,
        unique_enriched_records: data.unique_enriched_records,
      }));

      if (res.ok) {
        totalAvailable =
          typeof data.pagination?.total_entries === "number"
            ? data.pagination.total_entries
            : typeof data.unique_enriched_records === "number"
            ? data.unique_enriched_records
            : 0;
      } else {
        console.error("[extract-stats] Apollo error body:", JSON.stringify(data).slice(0, 300));
      }
    } catch (err) {
      console.error("[extract-stats] Apollo fetch error:", err);
    }
  } else {
    console.warn("[extract-stats] APOLLO_API_KEY not set");
  }

  // ── Google Sheet: count existing rows ──
  let alreadyExtracted = 0;
  const MASTER_SHEET_ID = process.env.GOOGLE_MASTER_SHEET_ID;

  if (MASTER_SHEET_ID) {
    try {
      const auth = getGoogleAuth();
      const sheetsApi = google.sheets({ version: "v4", auth });
      const tabName = deriveTabName(
        clientRow.company_name as string | null,
        clientRow.email as string | null,
        orgId
      );

      const readRes = await sheetsApi.spreadsheets.values.get({
        spreadsheetId: MASTER_SHEET_ID,
        range: `'${tabName}'!A:A`,
      });

      const rows = readRes.data.values;
      if (rows && rows.length > 1) {
        alreadyExtracted = rows.length - 1; // minus header
      }
    } catch {
      // Tab doesn't exist — 0 extracted
    }
  }

  const remaining = Math.max(0, totalAvailable - alreadyExtracted);

  return NextResponse.json({
    total_available: totalAvailable,
    already_extracted: alreadyExtracted,
    remaining,
  });
}
