import "server-only";

import type { DapsAnswers, DapsStyle } from "@/lib/messages-prompt";

const EXTRACT_SYSTEM = `Tu es un extracteur de métadonnées commerciales. Tu reçois :
- Un message LinkedIn de prospection (ouverture) rédigé par un client B2B
- Une relance LinkedIn (follow-up) rédigée par le même client
- Un digest d'ICP (filtres Apollo et promesse commerciale)
- Le nom de l'entreprise du client

Ta mission : retourner UNIQUEMENT un JSON strict et valide avec les champs suivants :

{
  "pain": "la douleur concrète des clients idéaux, en 1 à 2 phrases, dérivée de l'ICP en priorité (commercial_promise) et du message",
  "angle": "l'angle de différenciation du client, en 1 phrase, dérivé du message et de l'ICP",
  "proofs": ["preuve 1", "preuve 2", ...] (tableau de 0 à 5 preuves concrètes identifiées dans le message : noms de clients cités, chiffres, années d'expérience, résultats mesurables. Si aucune preuve n'est identifiable, retourne un tableau vide.),
  "style": {
    "relation": "tutoiement" | "vouvoiement" | "vouvoiement_cordial" (déduit du ton du message : "tu" → tutoiement, "vous" formel → vouvoiement, "vous" accessible → vouvoiement_cordial),
    "posture": "expert" | "pair" | "consultant" (expert = affirmatif, pair = partage entre indépendants, consultant = pose des questions ouvertes),
    "cta": "la phrase de clôture utilisée dans le message ou la relance (ex: 'Ouvert à un échange de 10 min ?')",
    "signature_name": "le prénom ou prénom + nom du client si identifiable dans le message/relance/email, sinon chaîne vide"
  }
}

RÈGLES ABSOLUES
- Retourne UNIQUEMENT le JSON, rien d'autre. Pas de markdown, pas d'explication, pas de préambule.
- Si une info manque, retourne une chaîne vide pour les strings ou un tableau vide pour proofs. N'INVENTE JAMAIS.
- N'inclus pas les variables comme \${firstName} ou {{prenom}} dans tes sorties.
- Base-toi sur le texte réel, pas sur une projection de ce que le client pourrait vouloir dire.`;

function normalizeRelation(v: unknown): DapsStyle["relation"] {
  const s = typeof v === "string" ? v.toLowerCase() : "";
  if (s.includes("vouvoiement_cordial") || s.includes("cordial")) return "vouvoiement_cordial";
  if (s.includes("vouvoiement")) return "vouvoiement";
  return "tutoiement";
}

function normalizePosture(v: unknown): DapsStyle["posture"] {
  const s = typeof v === "string" ? v.toLowerCase() : "";
  if (s.includes("consultant")) return "consultant";
  if (s.includes("pair")) return "pair";
  return "expert";
}

type ExtractInput = {
  messageLinkedin: string;
  relanceLinkedin: string;
  icpDigest: string;
  companyName: string;
};

export async function extractDapsFromManualMessages(
  apiKey: string,
  input: ExtractInput
): Promise<DapsAnswers> {
  const userMessage = [
    `MESSAGE_LINKEDIN (ouverture) :`,
    input.messageLinkedin || "(vide)",
    ``,
    `RELANCE_LINKEDIN :`,
    input.relanceLinkedin || "(vide)",
    ``,
    `ICP_DIGEST :`,
    input.icpDigest || "(aucun)",
    ``,
    `NOM DE L'ENTREPRISE DU CLIENT : ${input.companyName || "(inconnu)"}`,
  ].join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: EXTRACT_SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`manual_daps_extract_${res.status}:${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  const text: string = data.content?.[0]?.text ?? "";

  // Strip potential code fences just in case the model wraps its output
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error("manual_daps_invalid_json");
  }

  const styleRaw = (parsed.style ?? {}) as Record<string, unknown>;
  const relation = normalizeRelation(styleRaw.relation);
  const cta =
    typeof styleRaw.cta === "string" && styleRaw.cta.trim().length > 0
      ? styleRaw.cta.trim()
      : relation === "tutoiement"
      ? "Ouvert à un échange de 10 min ?"
      : "Ouvert à un échange de 10 minutes ?";

  const proofsRaw = Array.isArray(parsed.proofs) ? (parsed.proofs as unknown[]) : [];
  const proofs = proofsRaw
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter((p) => p.length > 0)
    .slice(0, 5);

  return {
    pain: typeof parsed.pain === "string" ? parsed.pain.trim() : "",
    angle: typeof parsed.angle === "string" ? parsed.angle.trim() : "",
    proofs,
    style: {
      relation,
      posture: normalizePosture(styleRaw.posture),
      cta,
      signature_name:
        typeof styleRaw.signature_name === "string"
          ? styleRaw.signature_name.trim()
          : "",
    },
  };
}
