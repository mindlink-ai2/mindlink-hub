import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `Tu es un expert en prospection B2B et en Apollo.io. À partir des réponses d'un client à un questionnaire, génère les filtres Apollo.io optimaux pour trouver un MAXIMUM de prospects pertinents.

Retourne UNIQUEMENT un JSON valide sans aucun texte autour.

VOICI LES SEULS FILTRES QUI EXISTENT SUR L'API APOLLO — tu ne peux utiliser QUE ceux-là :

1. "person_titles" (array de strings) : Titres de poste. Génère TOUTES les variantes possibles — français ET anglais, abréviations, synonymes. Ex : si le client dit "Directeur Commercial" → ["Directeur Commercial", "Sales Director", "Head of Sales", "VP Sales", "Directeur des Ventes", "Chief Sales Officer", "Responsable Commercial", "Commercial Director"]. Apollo inclut aussi les titres similaires automatiquement.

2. "include_similar_titles" (boolean) : Mets TOUJOURS à true pour élargir les résultats avec des titres similaires.

3. "person_seniorities" (array de strings) : Valeurs acceptées UNIQUEMENT : "owner", "founder", "c_suite", "partner", "vp", "head", "director", "manager", "senior", "entry", "intern". AUCUNE autre valeur. Sélectionne toutes les seniority cohérentes avec les titres demandés.

4. "person_locations" (array de strings) : Localisation personnelle. Format libre : "France", "Paris", "California", "Ireland", "Chicago". En anglais de préférence.

5. "organization_locations" (array de strings) : Localisation du siège de l'entreprise. Même format que person_locations.

6. "organization_num_employees_ranges" (array de strings) : Taille entreprise. Format STRICT "min,max". Exemples valides : "1,10", "11,20", "21,50", "51,100", "101,200", "201,500", "501,1000", "1001,2000", "2001,5000", "5001,10000", "10001,20000".

7. "q_keywords" (string) : Mot-clé général pour filtrer les résultats. UNIQUEMENT si le client mentionne un terme très spécifique. NE METS PAS de mots génériques comme "b2b", "digital", "agence", "services". En cas de doute, OMETS ce champ.

8. "revenue_range" (objet avec "min" et "max" en integers) : Chiffre d'affaires de l'entreprise en dollars. Sans symboles, virgules ou points. Ex : {"min": 1000000, "max": 10000000}. UNIQUEMENT si le client mentionne un CA.

9. "currently_using_any_of_technology_uids" (array de strings) : Technologies utilisées par l'entreprise. Format : underscores à la place des espaces et points. Ex : "salesforce", "google_analytics", "wordpress_org", "hubspot". UNIQUEMENT si le client mentionne des technologies.

FILTRES QUI N'EXISTENT PAS (ne les génère JAMAIS) :
- PAS de filtre par industrie/secteur (organization_industry_tag_ids N'EXISTE PAS)
- PAS de organization_not_locations
- PAS de person_departments
- PAS de person_not_titles (ce filtre n'existe pas sur cet endpoint)

Si le client mentionne un secteur d'activité, utilise q_keywords avec un terme spécifique OU traduis le secteur en titres de poste pertinents. Ex : "agences de communication" → ajoute des titres comme "Directeur d'agence", "Agency Director", "Agency Owner".

RÈGLE D'OR : Si le client est vague sur un critère, N'INVENTE PAS de filtre. Omets la clé. Mieux vaut trop de résultats qu'on filtre ensuite que zéro résultat.`;

function formatAnswers(answers: Record<string, unknown>): string {
  const lines: string[] = [];

  if (answers.q1_titles)
    lines.push(`Postes ciblés : ${answers.q1_titles}`);
  if (answers.q2_exclusions)
    lines.push(`Postes à exclure : ${answers.q2_exclusions}`);
  if (answers.q3_sector)
    lines.push(`Secteur d'activité : ${answers.q3_sector}`);
  if (
    Array.isArray(answers.q4_company_sizes) &&
    answers.q4_company_sizes.length > 0
  )
    lines.push(`Tailles d'entreprise (fourchettes employés) : ${(answers.q4_company_sizes as string[]).join(", ")}`);
  if (answers.q5_locations)
    lines.push(`Localisation des cibles : ${answers.q5_locations}`);
  if (answers.q6_additional)
    lines.push(`Critères supplémentaires : ${answers.q6_additional}`);
  if (answers.q7_commercial_promise)
    lines.push(`Promesse commerciale : ${answers.q7_commercial_promise}`);

  return lines.join("\n");
}

async function callClaude(userMessage: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY non configurée");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const text: string = data.content?.[0]?.text ?? "";
  return text;
}

function parseFilters(text: string): Record<string, unknown> | null {
  // Strip markdown code fences if present
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let answers: Record<string, unknown>;
  try {
    const body = await req.json();
    answers = body.answers ?? {};
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const userMessage = formatAnswers(answers);
  if (!userMessage.trim()) {
    return NextResponse.json({ error: "Réponses vides" }, { status: 400 });
  }

  // Appel Claude avec retry unique si JSON invalide
  let filters: Record<string, unknown> | null = null;

  try {
    const text1 = await callClaude(userMessage);
    filters = parseFilters(text1);

    if (!filters) {
      console.warn("[generate-filters] First attempt returned invalid JSON, retrying...");
      const text2 = await callClaude(userMessage);
      filters = parseFilters(text2);
    }
  } catch (err) {
    console.error("[generate-filters] Anthropic call failed:", err);
    return NextResponse.json(
      { error: "Impossible de générer les filtres. Veuillez réessayer." },
      { status: 502 }
    );
  }

  if (!filters) {
    console.error("[generate-filters] Could not parse valid JSON after retry");
    return NextResponse.json(
      { error: "Erreur interne lors de la génération des filtres." },
      { status: 500 }
    );
  }

  return NextResponse.json({ filters });
}
