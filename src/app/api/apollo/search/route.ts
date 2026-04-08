import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceSupabase } from "@/lib/inbox-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let filters: Record<string, unknown>;
  try {
    filters = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const supabase = createServiceSupabase();

  // Résoudre l'org_id depuis le clerk_user_id
  const { data: clientRow, error: clientErr } = await supabase
    .from("clients")
    .select("id")
    .eq("clerk_user_id", userId)
    .single();

  if (clientErr || !clientRow) {
    return NextResponse.json({ error: "Client introuvable" }, { status: 404 });
  }
  const orgId: number = clientRow.id;

  // Vérifier / créer les crédits (lazy init : 15 crédits à la première recherche)
  const { data: creditRow } = await supabase
    .from("search_credits")
    .select("id, credits_total, credits_used")
    .eq("org_id", orgId)
    .maybeSingle();

  if (!creditRow) {
    // Première fois : initialiser les crédits
    await supabase.from("search_credits").insert({
      org_id: orgId,
      credits_total: 15,
      credits_used: 0,
    });
  } else {
    const remaining = creditRow.credits_total - creditRow.credits_used;
    if (remaining <= 0) {
      return NextResponse.json(
        {
          error:
            "Vous n'avez plus de crédits de recherche. Contactez-nous pour en obtenir davantage.",
          credits_remaining: 0,
        },
        { status: 402 }
      );
    }
  }

  // Décrémenter atomiquement
  const { data: decrementOk, error: rpcErr } = await supabase.rpc(
    "decrement_search_credit",
    { p_org_id: orgId }
  );

  if (rpcErr || decrementOk === false) {
    return NextResponse.json(
      {
        error:
          "Vous n'avez plus de crédits de recherche. Contactez-nous pour en obtenir davantage.",
        credits_remaining: 0,
      },
      { status: 402 }
    );
  }

  // Appel Apollo — prévisualisation 5 profils max
  const apolloKey = process.env.APOLLO_API_KEY;
  if (!apolloKey) {
    return NextResponse.json({ error: "Configuration Apollo manquante" }, { status: 500 });
  }

  const apolloPayload = {
    ...buildApolloPayload(filters),
    page: 1,
    per_page: 5,
  };

  let apolloData: Record<string, unknown>;
  try {
    const apolloRes = await fetch("https://api.apollo.io/api/v1/mixed_people/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apolloKey,
      },
      body: JSON.stringify(apolloPayload),
    });

    if (!apolloRes.ok) {
      const errText = await apolloRes.text().catch(() => "");
      console.error("[apollo/search] Apollo error", apolloRes.status, errText);
      return NextResponse.json(
        { error: "Erreur lors de la recherche Apollo. Veuillez réessayer." },
        { status: 502 }
      );
    }

    apolloData = await apolloRes.json();
  } catch (err) {
    console.error("[apollo/search] fetch error", err);
    return NextResponse.json(
      { error: "Impossible de contacter Apollo. Veuillez réessayer." },
      { status: 502 }
    );
  }

  // Formater les profils (sans email ni téléphone — prévisualisation uniquement)
  const rawPeople = Array.isArray(apolloData.people)
    ? (apolloData.people as Array<Record<string, unknown>>)
    : [];

  const profiles = rawPeople.slice(0, 5).map((p) => ({
    id: p.id ?? null,
    first_name: p.first_name ?? null,
    last_name: p.last_name ?? null,
    title: p.title ?? null,
    linkedin_url: p.linkedin_url ?? null,
    organization: p.organization
      ? {
          name: (p.organization as Record<string, unknown>).name ?? null,
          industry: (p.organization as Record<string, unknown>).industry ?? null,
          estimated_num_employees:
            (p.organization as Record<string, unknown>).estimated_num_employees ?? null,
          primary_domain: (p.organization as Record<string, unknown>).primary_domain ?? null,
        }
      : null,
    city: p.city ?? null,
    state: p.state ?? null,
    country: p.country ?? null,
  }));

  // Log la recherche
  await supabase.from("search_logs").insert({
    org_id: orgId,
    filters_used: filters,
    results_count: profiles.length,
  });

  // Crédits restants après décrément
  const { data: updatedCredits } = await supabase
    .from("search_credits")
    .select("credits_total, credits_used")
    .eq("org_id", orgId)
    .single();

  const creditsRemaining = updatedCredits
    ? updatedCredits.credits_total - updatedCredits.credits_used
    : null;

  return NextResponse.json({
    profiles,
    total_results: (apolloData.pagination as Record<string, unknown>)?.total_entries ?? null,
    credits_remaining: creditsRemaining,
  });
}

/**
 * Convertit les filtres du formulaire ICP en payload Apollo valide.
 */
function buildApolloPayload(filters: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (arr(filters.person_titles)) payload.person_titles = filters.person_titles;
  if (arr(filters.person_not_titles)) payload.person_not_titles = filters.person_not_titles;
  if (arr(filters.person_seniorities)) payload.person_seniorities = filters.person_seniorities;
  if (arr(filters.person_departments)) payload.person_departments = filters.person_departments;
  if (arr(filters.person_locations)) payload.person_locations = filters.person_locations;
  if (str(filters.q_keywords)) payload.q_keywords = filters.q_keywords;
  if (arr(filters.organization_industry_tag_ids))
    payload.organization_industry_tag_ids = filters.organization_industry_tag_ids;
  if (arr(filters.organization_num_employees_ranges))
    payload.organization_num_employees_ranges = filters.organization_num_employees_ranges;
  if (arr(filters.organization_locations))
    payload.organization_locations = filters.organization_locations;
  if (arr(filters.organization_not_locations))
    payload.organization_not_locations = filters.organization_not_locations;
  if (arr(filters.currently_using_any_of_technology_uids))
    payload.currently_using_any_of_technology_uids =
      filters.currently_using_any_of_technology_uids;

  // Revenue range
  if (filters.revenue_range && typeof filters.revenue_range === "object") {
    const rr = filters.revenue_range as Record<string, unknown>;
    if (rr.min !== undefined || rr.max !== undefined) {
      payload.revenue_range = { min: rr.min ?? null, max: rr.max ?? null };
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
