import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `Tu es un expert en prospection B2B et en Apollo.io. À partir des réponses d'un client à un questionnaire, génère les filtres Apollo.io optimaux pour trouver un MAXIMUM de prospects pertinents.

Retourne UNIQUEMENT un JSON valide sans aucun texte autour.

VOICI LES SEULS PARAMÈTRES ACCEPTÉS PAR L'API APOLLO — n'utilise QUE ceux-là :

1. "person_titles" (array de strings) : Génère TOUTES les variantes possibles du titre demandé ET tous les titres de décideurs liés.

RÈGLE IMPORTANTE : quand le client cible un type de décideur (ex: "CEO"), il veut en réalité TOUS les décideurs de ce niveau. Génère systématiquement toutes les variantes de décideurs équivalents.

Exemple : si le client dit "CEO" → génère :
["CEO", "Chief Executive Officer", "Directeur Général", "DG", "PDG", "Président Directeur Général", "Président", "Fondateur", "Co-fondateur", "Founder", "Co-founder", "Gérant", "Dirigeant", "Owner", "Managing Director", "Directeur", "General Manager"]

Exemple : si le client dit "Directeur Commercial" → génère :
["Directeur Commercial", "Sales Director", "Head of Sales", "VP Sales", "Responsable Commercial", "Directeur des Ventes", "Chief Sales Officer", "CSO", "Commercial Director", "Business Development Director", "Directeur Business Development"]

Exemple : si le client dit "DRH" → génère :
["DRH", "Directeur des Ressources Humaines", "HR Director", "Head of HR", "VP HR", "Chief Human Resources Officer", "CHRO", "Responsable RH", "Human Resources Manager", "People Director", "Head of People"]

Toujours en français ET en anglais, avec toutes les abréviations et synonymes. Plus il y a de variantes pertinentes, plus il y aura de résultats.

2. "include_similar_titles" : Mets TOUJOURS à true.

3. "organization_locations" (array de strings) : Localisation du siège de l'entreprise. Format : nom de ville, région, département ou pays. Exemples : "France", "Paris", "Marseille", "California", "Var, France". Si le client donne des numéros de département français, traduis-les en noms : "13" → "Bouches-du-Rhône, France", "83" → "Var, France", "84" → "Vaucluse, France", etc.

4. "organization_num_employees_ranges" (array de strings) : Taille entreprise. Format STRICT "min,max". Exemples valides UNIQUEMENT : "1,10", "11,20", "21,50", "51,100", "101,200", "201,500", "501,1000", "1001,2000", "2001,5000", "5001,10000", "10001,20000". AUCUN autre format.

5. "q_keywords" (string) : Utilise ce champ pour le secteur d'activité du client. Mets UN SEUL mot-clé simple et large, pas une expression composée.
Exemples :
- Client dit "Agence de communication" → q_keywords: "communication"
- Client dit "Agence de marketing digital" → q_keywords: "marketing"
- Client dit "Cabinet de conseil en stratégie" → q_keywords: "conseil"
- Client dit "E-commerce mode" → q_keywords: "ecommerce"
- Client dit "SaaS B2B" → q_keywords: "software"
- Client dit "Industrie agroalimentaire" → q_keywords: "agroalimentaire"
NE JAMAIS mettre plusieurs mots comme "agence communication" ou "cabinet conseil stratégie". UN SEUL mot-clé.
Si le secteur est trop vague ou générique, OMETS ce champ.

6. "revenue_range" (objet {"min": integer, "max": integer}) : Chiffre d'affaires en dollars, sans symboles. UNIQUEMENT si le client mentionne un CA.

7. "currently_using_any_of_technology_uids" (array de strings) : Technologies. Format : underscores à la place des espaces et points. Ex : "salesforce", "google_analytics", "hubspot", "wordpress_org". UNIQUEMENT si le client mentionne des technologies.

PARAMÈTRES QUI N'EXISTENT PAS SUR CET ENDPOINT (ne les génère JAMAIS) :
- PAS de organization_industry_tag_ids
- PAS de person_seniorities
- PAS de person_locations
- PAS de organization_not_locations
- PAS de person_departments
- PAS de person_not_titles
- PAS de q_organization_keyword_tags
- PAS de exclude_keywords

RÈGLE D'OR : Mieux vaut trop de résultats qu'on filtre ensuite que zéro résultat. Si le client est vague, OMETS le filtre plutôt que d'inventer une valeur.`;

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
  if (answers.q6_commercial_promise)
    lines.push(`Promesse commerciale : ${answers.q6_commercial_promise}`);

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
