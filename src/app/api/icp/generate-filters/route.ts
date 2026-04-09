import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `Tu es un expert en prospection B2B et en Apollo.io. À partir des réponses d'un client à un questionnaire, génère les filtres Apollo.io optimaux pour trouver un MAXIMUM de prospects pertinents. Retourne UNIQUEMENT un JSON valide sans aucun texte autour.

RÈGLES CRITIQUES POUR CHAQUE FILTRE :

1. person_titles (array de strings) : Génère TOUTES les variantes possibles du titre demandé — en français ET en anglais, les abréviations, les synonymes. Exemple : si le client dit "Directeur Commercial" → ["Directeur Commercial", "Sales Director", "Head of Sales", "VP Sales", "Directeur des Ventes", "Chief Sales Officer", "Responsable Commercial", "Commercial Director"]. Plus il y a de variantes pertinentes, mieux c'est.

2. person_not_titles (array de strings) : Titres à exclure, uniquement si le client les mentionne.

3. person_seniorities (array de strings) : Les valeurs DOIVENT être UNIQUEMENT parmi : "owner", "founder", "c_suite", "vp", "director", "manager", "senior", "entry". AUCUNE autre valeur acceptée. Sélectionne toutes les seniority cohérentes avec les titres demandés.

4. person_departments (array de strings) : UNIQUEMENT si le client mentionne explicitement un département. Valeurs possibles : "engineering", "sales", "marketing", "finance", "human_resources", "operations", "information_technology", "executive", "support", "legal", "consulting", "education", "media_and_communications", "accounting". Si pas mentionné, OMETS ce champ.

5. person_locations (array de strings) : Format "Ville, Pays" ou juste "Pays" en anglais. Ex : "Paris, France" ou "France".

6. organization_num_employees_ranges (array de strings) : Format STRICT "min,max". Valeurs acceptées UNIQUEMENT : "1,10", "11,20", "21,50", "51,100", "101,200", "201,500", "501,1000", "1001,2000", "2001,5000", "5001,10000". AUCUN autre format.

7. organization_locations (array de strings) : Même format que person_locations.

8. organization_not_locations (array de strings) : Localisations à exclure, uniquement si mentionnées.

9. q_keywords (string) : UNIQUEMENT si le client mentionne un mot-clé très spécifique (technologie, niche précise). NE METS PAS de mots génériques comme "b2b", "digital", "agence" qui réduisent les résultats sans apporter de précision. En cas de doute, OMETS ce champ.

RÈGLE D'OR : Si le client est vague sur un critère, N'INVENTE PAS de filtre. Omets la clé. Mieux vaut trop de résultats qu'on filtre ensuite que zéro résultat à cause de filtres trop restrictifs.

Clés du JSON à retourner (omets les clés vides ou non pertinentes) :
- person_titles
- person_not_titles
- person_seniorities
- person_departments
- person_locations
- q_keywords
- organization_num_employees_ranges
- organization_locations
- organization_not_locations`;

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
