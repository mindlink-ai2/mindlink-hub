import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceSupabase } from "@/lib/inbox-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabase = createServiceSupabase();

  const { data: clientRow, error: clientErr } = await supabase
    .from("clients")
    .select("id")
    .eq("clerk_user_id", userId)
    .single();

  if (clientErr || !clientRow) {
    return NextResponse.json({ error: "Client introuvable" }, { status: 404 });
  }
  const orgId: number = clientRow.id;

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
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);

  const filters = icpConfig.filters as Record<string, unknown>;
  const payload = buildBrowsePayload(filters, page);

  try {
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

    const totalEntries =
      typeof data.total_entries === "number"
        ? data.total_entries
        : typeof data.pagination?.total_entries === "number"
        ? data.pagination.total_entries
        : typeof data.unique_enriched_records === "number"
        ? data.unique_enriched_records
        : 0;

    const perPage = 25;
    const totalPages = Math.max(1, Math.ceil(totalEntries / perPage));

    const profiles = people.slice(0, perPage).map((p) => ({
      id: p.id ?? null,
      first_name: p.first_name ?? null,
      last_name: maskLastName(p.last_name as string | null),
      title: p.title ?? null,
      linkedin_url: p.linkedin_url ?? null,
      organization: p.organization
        ? {
            name: (p.organization as Record<string, unknown>).name ?? null,
            industry:
              (p.organization as Record<string, unknown>).industry ?? null,
            estimated_num_employees:
              (p.organization as Record<string, unknown>)
                .estimated_num_employees ?? null,
          }
        : null,
      city: p.city ?? null,
      state: p.state ?? null,
      country: p.country ?? null,
    }));

    return NextResponse.json({
      people: profiles,
      total_entries: totalEntries,
      page,
      per_page: perPage,
      total_pages: totalPages,
    });
  } catch (err) {
    console.error("[apollo/browse] fetch error:", err);
    return NextResponse.json(
      { error: "Impossible de contacter le service de recherche." },
      { status: 502 }
    );
  }
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
