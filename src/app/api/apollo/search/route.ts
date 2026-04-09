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

  // ── ÉTAPE 2 : Appel Apollo avec retries progressifs si 0 résultat ──
  // Séquence de payloads : full → sans q_keywords → sans revenue/technologies → titres + localisation seuls
  const basePayload = buildSearchPayload(filters);
  const retryPayloads = buildRetryPayloads(basePayload);

  let searchData: Record<string, unknown> | null = null;
  let attemptIndex = 0;

  for (const payload of retryPayloads) {
    const searchPayload = { ...payload, page: 1, per_page: 5 };
    const attemptLabel = attemptIndex === 0 ? "initial" : `retry ${attemptIndex}`;

    console.log(
      `[search] ${attemptLabel} payload:`,
      JSON.stringify(searchPayload).slice(0, 500)
    );

    let rawText: string;
    let httpOk: boolean;
    let httpStatus: number;

    try {
      const searchRes = await fetch("https://api.apollo.io/api/v1/mixed_people/api_search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": apiKey,
        },
        body: JSON.stringify(searchPayload),
      });
      rawText = await searchRes.text();
      httpOk = searchRes.ok;
      httpStatus = searchRes.status;
    } catch (err) {
      console.error("[search] erreur réseau:", err);
      // Erreur réseau — NE PAS décrémenter les crédits
      return NextResponse.json(
        { error: "Impossible de contacter le service de recherche. Veuillez réessayer." },
        { status: 502 }
      );
    }

    console.log(
      `[search] ${attemptLabel} réponse status=${httpStatus} body=${rawText.slice(0, 300)}`
    );

    if (!httpOk) {
      // Erreur HTTP — NE PAS décrémenter les crédits
      return NextResponse.json(
        { error: "Erreur lors de la recherche. Veuillez réessayer." },
        { status: 502 }
      );
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      console.error("[search] impossible de parser la réponse JSON");
      return NextResponse.json(
        { error: "Réponse inattendue du service de recherche. Veuillez réessayer." },
        { status: 502 }
      );
    }

    const total =
      (parsed.unique_enriched_records as number | undefined) ??
      ((parsed.pagination as Record<string, unknown> | null)?.total_entries as number | undefined) ??
      0;

    if (total > 0) {
      searchData = parsed;
      break;
    }

    // 0 résultats — log et essayer le prochain payload
    console.log(
      `[search] ${attemptLabel} → 0 résultats, ${attemptIndex < retryPayloads.length - 1 ? "retry..." : "abandon."}`
    );
    attemptIndex++;
  }

  // ── ÉTAPE 3 : Décrémentation des crédits (un seul crédit, même après retries) ──
  const { error: decrementErr, count: decrementCount } = await supabase
    .from("search_credits")
    .update({ credits_used: creditsUsedBefore + 1 })
    .eq("org_id", orgId)
    .eq("credits_used", creditsUsedBefore); // optimistic lock

  if (decrementErr) {
    console.error("[search] échec décrémentation crédits:", decrementErr.message);
  } else {
    console.log(
      `[search] org_id=${orgId} crédits après=${creditsBeforeSearch - 1}/${creditsTotal} (rows updated: ${decrementCount ?? "?"})`
    );
  }

  const creditsRemaining = creditsBeforeSearch - 1;

  // Aucun résultat après tous les retries
  if (!searchData) {
    await supabase.from("search_logs").insert({
      org_id: orgId,
      filters_used: filters,
      results_count: 0,
    });
    return NextResponse.json({
      profiles: [],
      total_results: 0,
      credits_remaining: creditsRemaining,
      error: "Aucun profil trouvé. Essayez de reformuler vos réponses.",
    });
  }

  // ── ÉTAPE 4 : Formater les profils ──
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

  await supabase.from("search_logs").insert({
    org_id: orgId,
    filters_used: filters,
    results_count: profiles.length,
  });

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
 * Whitelist stricte des paramètres acceptés par mixed_people/api_search.
 * Seuls ces champs sont transmis à Apollo — tout le reste est ignoré.
 */
function buildSearchPayload(filters: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

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

/**
 * Produit une séquence de payloads de plus en plus permissifs pour les retries.
 * Appelé uniquement si le payload initial retourne 0 résultats.
 *
 * Ordre de suppression :
 *   1. Full payload (déjà essayé)
 *   2. Sans q_keywords (trop restrictif si mal formaté)
 *   3. Sans revenue_range + sans currently_using_any_of_technology_uids
 *   4. Seulement person_titles + include_similar_titles + localisation principale
 */
function buildRetryPayloads(
  base: Record<string, unknown>
): Array<Record<string, unknown>> {
  // Retry 1 : supprimer q_keywords
  const r1 = { ...base };
  delete r1.q_keywords;

  // Retry 2 : supprimer aussi revenue_range et technologies
  const r2 = { ...r1 };
  delete r2.revenue_range;
  delete r2.currently_using_any_of_technology_uids;

  // Retry 3 : garder uniquement titres + include_similar_titles + localisation principale
  const r3: Record<string, unknown> = { include_similar_titles: true };
  if (base.person_titles) r3.person_titles = base.person_titles;
  if (base.person_locations) {
    r3.person_locations = base.person_locations;
  } else if (base.organization_locations) {
    r3.organization_locations = base.organization_locations;
  }

  return [base, r1, r2, r3];
}

function arr(v: unknown): v is unknown[] {
  return Array.isArray(v) && v.length > 0;
}

function str(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
