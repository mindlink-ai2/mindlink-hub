import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createServiceSupabase } from "@/lib/inbox-server";
import { resolveClientContextForUser } from "@/lib/client-onboarding-state";

export const runtime = "nodejs";
export const maxDuration = 60;

const CHAT_SYSTEM_PROMPT = `Tu es un expert en prospection B2B LinkedIn. Tu aides un client à créer ses messages de prospection personnalisés.

TON RÔLE :
- Poser des questions une par une pour comprendre l'offre, la cible et le ton du client
- Générer 3 messages de prospection (LinkedIn, relance, email) basés sur ses réponses
- Ajuster les messages autant de fois que le client le demande

SCRIPT DE QUESTIONS (pose-les UNE PAR UNE, attends la réponse avant de passer à la suivante) :

1. "En une ou deux phrases, qu'est-ce que tu vends exactement ? Quel problème concret résous-tu pour tes clients ?"
2. "Qui sont tes clients idéaux ? (leur poste, leur secteur, la taille de leur entreprise)"
3. "Qu'est-ce qui te différencie de tes concurrents ? Pourquoi un prospect devrait te choisir plutôt qu'un autre ?"
4. "Quel est le problème principal que tes prospects rencontrent avant de travailler avec toi ? Qu'est-ce qui les empêche de dormir ?"
5. "Comment veux-tu sonner dans tes messages ? Plutôt tutoiement ou vouvoiement ? Ton décontracté entre pairs ou professionnel et factuel ?"
6. "As-tu des résultats concrets à mettre en avant ? (chiffres, témoignages, nombre de clients, etc.)"

APRÈS TOUTES LES QUESTIONS, génère les 3 messages :

FORMAT DE GÉNÉRATION :
Quand tu génères les messages, utilise EXACTEMENT ce format dans ta réponse (le front va parser ces balises) :

[MESSAGE_LINKEDIN]
Hello \${firstName},

(message ici, max 250 caractères, avec \${firstName}, \${company} comme variables)

Ouvert à un échange de 10 min ?
[/MESSAGE_LINKEDIN]

[RELANCE_LINKEDIN]
(message ici, max 150 caractères, avec {{prenom}} comme variable)
[/RELANCE_LINKEDIN]

[EMAIL]
Objet : (objet ici)
(corps de l'email ici, 400-800 caractères, avec {{prenom}}, {{company}} comme variables)
(signature avec prénom du client et nom de son entreprise)
[/EMAIL]

RÈGLES POUR LES MESSAGES :
- Message LinkedIn : commence par "Hello \${firstName}," suivi d'une accroche liée à l'activité du prospect
- Relance : courte, directe, reprend le pain point principal
- Email : développe l'angle avec plus de détail, inclut l'objet
- Pas de tirets, pas de formatage — texte brut avec des sauts de ligne
- Pas d'emoji
- Terminer par "ouvert à un échange de 10 min ?" ou variante
- Les variables \${firstName}, \${company}, {{prenom}}, {{company}} seront remplacées dynamiquement — garde-les telles quelles

QUAND LE CLIENT DEMANDE DES MODIFICATIONS :
- Régénère les 3 messages à chaque fois (pas juste celui modifié)
- Utilise les mêmes balises [MESSAGE_LINKEDIN], [RELANCE_LINKEDIN], [EMAIL]
- Sois réactif et concis dans tes réponses d'ajustement

STYLE DE CONVERSATION :
- Tutoie le client (c'est un fondateur, on est entre pairs)
- Sois concis dans tes questions et transitions
- Pas de flatterie, pas de blabla
- Accuse réception de chaque réponse en 1 phrase max avant de passer à la question suivante

FORMULATIONS INTERDITES DANS LES MESSAGES GÉNÉRÉS :
"J'ai vu votre/ton profil"
"Je me permets de vous/te contacter"
"Votre/ton parcours est inspirant"
"Je pense que cela pourrait vous/t' intéresser"
"J'espère que vous allez/tu vas bien"
"J'ai vu votre/ton post"
"Booster"
"Passer au niveau supérieur"
"Scaler"
"Accompagnement sur-mesure"
"N'hésitez pas"
"Révolutionner"
"Solution verte/innovante"`;

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
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;
    if (!content.trim()) continue;
    out.push({ role, content: content.slice(0, 8000) });
  }
  return out.slice(-60);
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

    const user = await currentUser();
    const email =
      user?.primaryEmailAddress?.emailAddress ||
      user?.emailAddresses?.[0]?.emailAddress ||
      null;

    const supabase = createServiceSupabase();
    const clientContext = await resolveClientContextForUser(supabase, userId, email);
    if (!clientContext) {
      return NextResponse.json({ error: "client_not_found" }, { status: 404 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const messages = sanitizeMessages(body?.messages);
    if (messages.length === 0) {
      return NextResponse.json({ error: "messages_required" }, { status: 400 });
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
        max_tokens: 2000,
        system: CHAT_SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("[chat/messages-setup] Anthropic error:", res.status, errBody.slice(0, 300));
      return NextResponse.json(
        { error: "Erreur lors de la génération. Veuillez réessayer." },
        { status: 502 }
      );
    }

    const data = await res.json();
    const reply: string = data.content?.[0]?.text ?? "";

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("[chat/messages-setup] error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
