import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const SYSTEM_PROMPT = `Tu es un expert en copywriting LinkedIn B2B. Tu reçois un message LinkedIn d'ouverture rédigé par un client (avec un prénom et une entreprise concrets, pas encore de variables).

Ta mission : générer UNE relance LinkedIn courte (max 150 caractères, prénom concret entre guillemets) qui prolonge le message d'ouverture sans le répéter. Reprends le pain ou l'angle évoqué dans l'ouverture, mais sous un autre angle (question, constat, ou court rappel). Ne propose pas un nouveau RDV : la relance doit relancer la conversation, pas la fermer.

Conserve EXACTEMENT le même ton, la même relation (tutoiement / vouvoiement) et le même prénom concret que dans le message d'ouverture.

RÈGLES STRICTES
- Retourne UNIQUEMENT le texte de la relance, rien d'autre. Pas de préambule, pas d'explication, pas de balise.
- Pas d'emoji, pas de markdown.
- Max 150 caractères au total.
- Pas de formules creuses : "n'hésite pas", "prendre un café virtuel", "rapidement", etc.
- Pas de variables comme \${firstName} ou {{prenom}} : garde le prénom concret du message d'ouverture.`;

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

    const body = (await req.json().catch(() => null)) as { messageLinkedin?: unknown } | null;
    const messageLinkedin =
      typeof body?.messageLinkedin === "string" ? body.messageLinkedin.trim() : "";

    if (!messageLinkedin || messageLinkedin.length < 30) {
      return NextResponse.json(
        { error: "message_too_short" },
        { status: 400 }
      );
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `MESSAGE LINKEDIN D'OUVERTURE :\n\n${messageLinkedin.slice(0, 2000)}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(
        "[messages/generate-relance] Anthropic error:",
        res.status,
        errBody.slice(0, 300)
      );
      return NextResponse.json({ error: "generation_failed" }, { status: 502 });
    }

    const data = await res.json();
    const relance: string = (data.content?.[0]?.text ?? "").trim();

    if (!relance) {
      return NextResponse.json({ error: "empty_relance" }, { status: 502 });
    }

    return NextResponse.json({ relance });
  } catch (err) {
    console.error("[messages/generate-relance] error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
