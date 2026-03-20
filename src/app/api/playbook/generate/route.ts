import { NextResponse } from "next/server";
import { getPlaybookContext } from "@/lib/playbook-auth";

const SYSTEM_PROMPT = `Tu es un coach commercial pour Lidmeo. Lidmeo automatise la prospection LinkedIn pour les fondateurs d'agences B2B. Essential 49€/mois, Full Automatisé 199€/mois, essai gratuit 7 jours. Règles : pas de tirets, ton naturel et direct, messages courts 4-6 lignes, toujours finir par une question ou proposer l'essai. Génère 3 réponses : 1) Qualification, 2) Valeur directe, 3) Résultats concrets. Réponds UNIQUEMENT en JSON valide, sans backticks ni texte autour : {"replies":[{"label":"...","tone":"...","text":"..."}]}`;

export async function POST(req: Request) {
  const context = await getPlaybookContext();
  if (!context) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const userMessage =
    body !== null &&
    typeof body === "object" &&
    "message" in body &&
    typeof (body as Record<string, unknown>).message === "string"
      ? ((body as Record<string, unknown>).message as string).trim()
      : null;

  if (!userMessage) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return NextResponse.json({ error: "configuration_error" }, { status: 500 });
  }

  let openaiRes: Response;
  try {
    openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 1000,
        temperature: 0.7,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Message du prospect : "${userMessage}"`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
  } catch (err) {
    console.error("[playbook/generate] OpenAI fetch error:", err);
    return NextResponse.json({ error: "network_error" }, { status: 502 });
  }

  if (!openaiRes.ok) {
    const errText = await openaiRes.text().catch(() => "");
    console.error("[playbook/generate] OpenAI error:", openaiRes.status, errText);
    return NextResponse.json({ error: "openai_error" }, { status: 502 });
  }

  const data = await openaiRes.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;

  if (!content) {
    return NextResponse.json({ error: "empty_response" }, { status: 502 });
  }

  try {
    const parsed = JSON.parse(content);
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: "parse_error" }, { status: 502 });
  }
}
