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
    console.error("[search] client not found for userId", userId, clientErr?.message);
    return NextResponse.json({ error: "Client introuvable" }, { status: 404 });
  }
  const orgId: number = clientRow.id;

  // ── ÉTAPE 1 : Vérifier les crédits (lecture seule, PAS de décrémentation encore) ──
  const { data: creditRow } = await supabase
    .from("search_credits")
    .select("id, credits_total, credits_used")
    .eq("org_id", orgId)
    .maybeSingle();

  let creditsUsedBefore: number;
  let creditsTotal: number;

  if (!creditRow) {
    // Première recherche : initialiser les crédits
    const { error: insertErr } = await supabase.from("search_credits").insert({
      org_id: orgId,
      credits_total: 15,
      credits_used: 0,
    });
    if (insertErr) {
      console.error("[search] failed to init credits for org", orgId, insertErr.message);
    }
    creditsUsedBefore = 0;
    creditsTotal = 15;
  } else {
    creditsUsedBefore = creditRow.credits_used;
    creditsTotal = creditRow.credits_total;
  }

  const creditsBeforeSearch = creditsTotal - creditsUsedBefore;
  console.log(`[search] org_id=${orgId} crédits avant=${creditsBeforeSearch}/${creditsTotal}`);

  if (creditsBeforeSearch <= 0) {
    return NextResponse.json(
      {
        error:
          "Vous n'avez plus de crédits de recherche. Contactez-nous pour en obtenir davantage.",
        credits_remaining: 0,
      },
      { status: 402 }
    );
  }

  // ── ÉTAPE 2 : Appel à la base de données de profils (AVANT décrémentation) ──
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    console.error("[search] APOLLO_API_KEY non configurée");
    return NextResponse.json(
      { error: "Service de recherche non configuré. Contactez le support." },
      { status: 500 }
    );
  }

  const searchPayload = {
    ...buildSearchPayload(filters),
    page: 1,
    per_page: 5,
  };

  console.log(
    "[search] payload envoyé:",
    JSON.stringify(searchPayload).slice(0, 500)
  );

  let searchData: Record<string, unknown>;
  try {
    const searchRes = await fetch("https://api.apollo.io/api/v1/mixed_people/api_search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify(searchPayload),
    });

    const responseText = await searchRes.text();
    console.log(
      `[search] réponse status=${searchRes.status} body=${responseText.slice(0, 300)}`
    );

    if (!searchRes.ok) {
      // L'appel a échoué — NE PAS décrémenter les crédits
      return NextResponse.json(
        { error: "Erreur lors de la recherche. Veuillez réessayer." },
        { status: 502 }
      );
    }

    try {
      searchData = JSON.parse(responseText);
    } catch {
      console.error("[search] impossible de parser la réponse JSON");
      return NextResponse.json(
        { error: "Réponse inattendue du service de recherche. Veuillez réessayer." },
        { status: 502 }
      );
    }
  } catch (err) {
    console.error("[search] erreur réseau:", err);
    // Erreur réseau — NE PAS décrémenter les crédits
    return NextResponse.json(
      { error: "Impossible de contacter le service de recherche. Veuillez réessayer." },
      { status: 502 }
    );
  }

  // ── ÉTAPE 3 : Décrémentation des crédits (seulement après succès) ──
  // UPDATE atomique avec optimistic lock sur la valeur précédemment lue
  const { error: decrementErr, count: decrementCount } = await supabase
    .from("search_credits")
    .update({ credits_used: creditsUsedBefore + 1 })
    .eq("org_id", orgId)
    .eq("credits_used", creditsUsedBefore); // optimistic lock

  if (decrementErr) {
    // Loguer l'échec mais ne pas bloquer — la recherche a déjà eu lieu
    console.error("[search] échec décrémentation crédits:", decrementErr.message);
  } else {
    console.log(
      `[search] org_id=${orgId} crédits après=${creditsBeforeSearch - 1}/${creditsTotal} (rows updated: ${decrementCount ?? "?"})`
    );
  }

  // ── ÉTAPE 4 : Formater les profils (sans email ni téléphone) ──
  // Le nouveau endpoint retourne "matches", l'ancien retournait "people"
  const rawPeople = (
    Array.isArray(searchData.matches)
      ? searchData.matches
      : Array.isArray(searchData.people)
      ? searchData.people
      : []
  ) as Array<Record<string, unknown>>;

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

  const creditsRemaining = creditsBeforeSearch - 1;

  // Le nouveau endpoint expose unique_enriched_records, l'ancien exposait pagination.total_entries
  const totalResults =
    (searchData.unique_enriched_records as number | null) ??
    (searchData.pagination as Record<string, unknown> | null)?.total_entries ??
    null;

  return NextResponse.json({
    profiles,
    total_results: totalResults,
    credits_remaining: creditsRemaining,
  });
}

/**
 * Convertit les filtres du formulaire en payload compatible avec l'API de recherche.
 */
function buildSearchPayload(filters: Record<string, unknown>): Record<string, unknown> {
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

  // Revenue range — n'inclure que si min ou max est défini et non-null
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
