import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const QUESTION_LABELS: Record<string, string> = {
  q1_titles: "Postes ciblés (titres LinkedIn)",
  q2_exclusions: "Postes à exclure",
  q3_sector: "Secteur d'activité",
  q4_company_sizes: "Taille d'entreprise",
  q5_locations: "Localisation géographique",
  q6_commercial_promise: "Promesse commerciale",
};

function buildSystemPrompt(questionContext: string): string {
  const label = QUESTION_LABELS[questionContext] ?? questionContext;
  return `Tu es l'Assistant Lidmeo. Tu aides un client à remplir son questionnaire de ciblage.

Le client est actuellement sur cette question : ${label}

RÈGLES :
- Parle comme un ami qui aide, pas comme un expert
- Phrases courtes et simples, pas de jargon
- Pose UNE SEULE question à la fois, jamais plusieurs
- Si le client te décrit son activité, propose-lui directement une réponse qu'il peut copier-coller dans le champ
- Sois encourageant, jamais condescendant
- Réponses de 1 à 3 phrases maximum
- Tutoiement obligatoire
- Pas d'emoji

EXEMPLES DE BONNES RÉPONSES :
Client : "je sais pas quoi mettre comme poste"
Toi : "Pas de souci. Tes clients, c'est plutôt des patrons de boîte ? Des responsables marketing ? Des directeurs commerciaux ? Dis-moi juste qui prend la décision d'acheter chez toi."

Client : "je fais du consulting en RH"
Toi : "Ok parfait. Tu pourrais mettre : DRH, Responsable RH, Directeur des Ressources Humaines. Ce sont eux qui achètent du conseil RH en général."

Client : "j'ai pas de secteur précis"
Toi : "Tes 3 derniers clients, ils faisaient quoi comme activité ?"`;
}

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function sanitizeMessages(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return [];
  const out: ChatMessage[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;
    const role = (entry as Record<string, unknown>).role;
    const content = (entry as Record<string, unknown>).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string")
      continue;
    if (!content.trim()) continue;
    out.push({ role, content: content.slice(0, 4000) });
  }
  return out.slice(-30);
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY non configurée" },
        { status: 500 }
      );
    }

    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const messages = sanitizeMessages(body?.messages);
    if (messages.length === 0) {
      return NextResponse.json(
        { error: "messages_required" },
        { status: 400 }
      );
    }

    const questionContext =
      typeof body?.question_context === "string"
        ? body.question_context
        : "q1_titles";

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: buildSystemPrompt(questionContext),
        messages,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(
        "[chat/icp-helper] Anthropic error:",
        res.status,
        errBody.slice(0, 300)
      );
      return NextResponse.json(
        { error: "Erreur lors de la génération. Veuillez réessayer." },
        { status: 502 }
      );
    }

    const data = await res.json();
    const reply: string = data.content?.[0]?.text ?? "";

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("[chat/icp-helper] error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
