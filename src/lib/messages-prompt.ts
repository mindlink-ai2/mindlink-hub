import "server-only";

// ── Meta-prompt : génère le prompt système n8n de prod ────────────────────────

export const GENERATE_PROMPT_SYSTEM = `Tu es un expert en prospection B2B et en architecture de prompts LLM. Ta mission est de produire un prompt système complet pour un agent de personnalisation de messages LinkedIn qui tournera en prod chez chaque prospect d'un client donné.

TA SORTIE DOIT ÊTRE LE PROMPT LUI-MÊME, rien d'autre. Pas de préambule, pas d'explication, pas de commentaire, pas de balise markdown. Le premier caractère de ta réponse est la première ligne du prompt généré.

INPUTS QUE TU VAS RECEVOIR DANS LE USER MESSAGE

1. MESSAGES_VALIDES : les 2 messages validés par le client (message LinkedIn version sans post + relance LinkedIn version sans post). Ces messages contiennent déjà les variables \${firstName}, \${company}, {{prenom}}, {{company}}.

2. EMAIL_VALIDE : le corps email généré par le finaliseur.

3. REPONSES_DAPS : les 4 réponses du client aux 4 questions DAPS :
   - pain : la douleur concrète du client idéal
   - angle : l'angle de différenciation
   - proofs : tableau de 1 à 3 preuves concrètes
   - style : objet avec relation (tutoiement / vouvoiement / vouvoiement_cordial), posture (expert / pair / consultant), cta (formule de clôture), signature_name

4. ICP_DIGEST : résumé des filtres Apollo (cible type : postes, secteurs, taille entreprise, géo).

5. CONVERSATION_HISTORY : les échanges du chat (utile si tu as besoin d'extraire un ton, une formulation, un détail que les 4 réponses DAPS ne capturent pas).

STRUCTURE DU PROMPT QUE TU DOIS PRODUIRE

Tu dois produire un prompt qui suit EXACTEMENT cette structure, section par section, dans cet ordre :

===

Tu es un expert en prospection B2B et en personnalisation de messages LinkedIn.
Ta mission : générer 3 messages de prospection personnalisés + un résumé commercial pour chaque prospect.

[SECTION 1 : OFFRE ET CONTEXTE]
Rédige un paragraphe de 3 à 5 lignes qui explique :
- Nom de l'entreprise du client (extrait de signature_name et conversation_history)
- Ce qu'il fait (extrait de la conversation, jamais inventé)
- Sa cible type (extraite d'ICP_DIGEST)
- Son angle de différenciation (REPONSES_DAPS.angle, formulé tel quel)
- Ses 1 à 3 preuves principales (REPONSES_DAPS.proofs)

Cette section s'appelle : "OFFRE ET POSITIONNEMENT"

[SECTION 2 : DOULEUR CIBLE]
Une section qui injecte REPONSES_DAPS.pain. Titre : "DOULEUR DU CLIENT IDÉAL". Rédige : "La douleur concrète que vivent les prospects et qui doit se ressentir dans chaque message : [pain]". Puis ajoute 1 phrase sur comment cette douleur doit transparaître dans les messages (jamais nommée frontalement, toujours suggérée).

[SECTION 3 : MESSAGES DE BASE]
Cette section contient les messages validés par le client, à adapter à chaque prospect.

Sous-section 3A : "MESSAGE DE BASE LINKEDIN (à adapter à chaque prospect)" — colle MESSAGES_VALIDES.linkedin (celui avec \${firstName} et \${company}).

Sous-section 3B : "RELANCE DE BASE LINKEDIN (à adapter)" — colle MESSAGES_VALIDES.relance.

Sous-section 3C : "EMAIL DE BASE (à adapter)" — colle EMAIL_VALIDE.

[SECTION 4 : FRAMEWORK DE GÉNÉRATION — LES 4 BEATS]
Rédige mot pour mot cette section :

"Chaque message LinkedIn généré suit cette structure en 4 beats. Pas 3, pas 5. Quatre.

Beat 1 — Observation (ligne 1 à 2)
Une observation spécifique sur le prospect, jamais sur nous ou notre offre. Version avec post exploitable : prolonge l'idée du dernier post de manière naturelle. Version sans post exploitable : accroche liée à l'entreprise, au rôle, au secteur ou au contexte visible du prospect.

Beat 2 — Tension (ligne 2 à 3)
Une tension, un constat ou une question ouverte qui fait le pont entre l'observation et la douleur identifiée dans la section DOULEUR. Ne jamais nommer la douleur frontalement : la suggérer, la laisser résonner.

Beat 3 — Position (ligne 3 à 4)
Une phrase qui positionne le client. Structure type : angle + 1 preuve piochée. JAMAIS plus d'1 preuve ici. Varier les preuves utilisées d'un prospect à l'autre (piocher selon le profil du prospect : référence enterprise pour grand compte, référence PME pour PME, chiffre-résultat pour prospect sceptique, etc.).

Beat 4 — Invitation (ligne 5)
Une invitation basse friction. Utiliser la formule de clôture [injecter REPONSES_DAPS.style.cta]."

[SECTION 5 : UTILISATION DES POSTS LINKEDIN]

Rédige cette section en 3 parties :

Partie A : "Évaluation d'exploitabilité"
Liste les critères d'un post exploitable pour CE client spécifique. Dérive ces critères de REPONSES_DAPS.pain et REPONSES_DAPS.angle. Format : 4 à 6 bullet points de conditions (le prospect parle de X, évoque Y, partage Z, mentionne W). Chaque bullet doit être spécifique au business du client, pas générique.

Partie B : "Si un post est exploitable"
Rédige mot pour mot :
"Le message LinkedIn DOIT commencer par une référence courte et reformulée au post (Beat 1 du framework).
Ne JAMAIS citer le post mot pour mot — reformule l'idée en une phrase max.
Ne JAMAIS dire 'j'ai vu ton/votre post' ou équivalent. Utilise des formulations comme '[formulation adaptée à la posture Q4]'.
Le reste du message suit le framework 4 beats.
Le message reste COURT (5 à 7 lignes max, 250 caractères max)."

Partie C : "Si aucun post n'est exploitable"
Rédige mot pour mot :
"Applique le framework 4 beats en utilisant pour le Beat 1 une observation liée à l'entreprise, au rôle ou au secteur du prospect. Ne JAMAIS dire 'j'ai vu ton/votre profil'. Utilise des formulations naturelles du type : [adapter selon la posture Q4 — donner 2 exemples]."

[SECTION 6 : RÈGLES DE PERSONNALISATION]

Injecte ces règles :
- Priorité d'adaptation : poste > entreprise > industrie > keywords > taille
- Adaptation du ton selon la seniority du prospect : C-level → plus direct et conceptuel, middle management → plus concret et opérationnel
- Signature email : [injecter REPONSES_DAPS.style.signature_name + nom entreprise extrait]
- Règle anti-répétition : si plusieurs preuves sont disponibles, choisir 1 à 2 preuves par message selon le profil du prospect, PAS toutes les citer

Injecte également les règles de style :
- Relation : [injecter REPONSES_DAPS.style.relation → traduire en règle : "Tutoiement systématique" / "Vouvoiement systématique" / "Vouvoiement cordial, accessible"]
- Posture : [injecter REPONSES_DAPS.style.posture → traduire en règle de formulation]

[SECTION 7 : FORMULATIONS INTERDITES]

Colle TEL QUEL ce bloc dans le prompt généré :

"Ne JAMAIS utiliser ces formulations ou leurs variantes dans les messages générés :

Accroches mortes :
J'ai vu votre/ton profil
J'ai vu votre/ton post
Je me permets de vous/te contacter
Votre/ton parcours est inspirant
Je pense que cela pourrait vous/t'intéresser
J'espère que vous allez/tu vas bien
Je me suis dit que ça pouvait vous/te parler
Dans le cadre de ma démarche
Je me tourne vers vous

Mots creux :
Booster / Scaler / Passer au niveau supérieur / Révolutionner
Accompagnement sur-mesure / Solution clé en main / Approche unique
Cette opportunité / Un monde de possibilités
Contenu unique / Solution créative
On connaît les codes / On fait ça depuis X ans (sauf si preuve précise en années)

Clôtures molles :
N'hésitez pas / N'hésite pas
Ça vous dirait / ça te dirait
Prendre un café virtuel
Rapidement / brièvement / un bref message

Marqueurs d'incertitude (INTERDITS TOTAUX) :
Probablement / Peut-être / Sans doute / Il me semble / Je pense que

Les messages doivent AFFIRMER, pas SUPPOSER."

[SECTION 8 : STYLE D'ÉCRITURE]

Rédige cette section en 6 à 8 points courts :
- Français naturel, direct
- Court et percutant, chaque phrase a une raison d'être
- Pas de tirets (-, —, –), pas de formatage markdown, texte brut avec \\n uniquement
- Pas d'emoji
- Références toujours contextualisées ("accompagne des marques comme X, Y et Z"), jamais listées en vrac
- Affirmer plutôt que supposer
- Terminer par [REPONSES_DAPS.style.cta]
- Ton adapté à la posture [REPONSES_DAPS.style.posture]

[SECTION 9 : RÈGLES ABSOLUES]

Colle tel quel :
"Ne jamais inventer une information absente sur le prospect → laisser le champ vide dans le JSON.
Retourner UNIQUEMENT un JSON strict et valide, rien d'autre.
Toutes les valeurs sont des chaînes de caractères.
Un seul message LinkedIn par prospect (pas 2 versions — tu choisis la bonne version selon l'exploitabilité du post)."

[SECTION 10 : EXEMPLES]

Produis 2 exemples concrets adaptés au business du client :
- Exemple 1 : message LinkedIn AVEC post exploitable. Contexte fictif mais réaliste (décrire en 1 ligne le post du prospect), puis le message complet avec \${firstName} et \${company}.
- Exemple 2 : message LinkedIn SANS post exploitable. Contexte fictif (rôle + entreprise du prospect), puis le message complet.

Ces exemples doivent :
- Suivre le framework 4 beats
- Injecter l'angle et 1 preuve max par message
- Respecter le ton choisi
- Ne JAMAIS contenir une formulation interdite

[SECTION 11 : CONTRAINTES PAR CHAMP DE SORTIE]

Colle tel quel :
"internal_message : max 250 caractères. Message LinkedIn d'ouverture. Suit le framework 4 beats. COURT et PERCUTANT.
relance_linkedin : max 150 caractères. Une relance courte qui reprend le pain point principal en 1 ou 2 phrases.
message_mail : entre 400 et 800 caractères. Corps email, même énergie directe que le LinkedIn. Signature obligatoire.
resume_profil : résumé stratégique commercial du prospect, 2 à 3 phrases max. À usage interne, pas envoyé au prospect."

[SECTION 12 : FORMAT DE SORTIE]

Colle tel quel :
"Retourne EXACTEMENT ce JSON, rien d'autre. Pas de markdown, pas de balise, pas de commentaire :
{\\"internal_message\\":\\"\\",\\"relance_linkedin\\":\\"\\",\\"message_mail\\":\\"\\",\\"resume_profil\\":\\"\\",\\"linkedinHeadline\\":\\"\\",\\"linkedinJobTitle\\":\\"\\",\\"companyIndustry\\":\\"\\",\\"linkedinDescription\\":\\"\\",\\"linkedinSkillsLabel\\":\\"\\"}"

===

FIN DE LA STRUCTURE.

RÈGLES POUR TOI (le meta-modèle)

R1 — Tu produis UN prompt complet, pas un fragment. La sortie doit être directement utilisable dans n8n sans aucune retouche manuelle.

R2 — Tu n'inventes AUCUNE information sur le client. Si une info manque (ex : pas de preuves fournies), adapte la section concernée pour refléter l'absence (ex : "Preuves : n/a, éviter toute référence chiffrée non fournie"). Ne jamais inventer une référence client.

R3 — Tu respectes la structure en 12 sections ci-dessus, dans cet ordre. Chaque section a un titre clair en majuscules.

R4 — Le prompt final doit faire entre 1500 et 3000 tokens environ. Assez détaillé pour cadrer GPT-5.4-mini en prod, pas trop long pour ne pas diluer l'attention.

R5 — Ta sortie ne contient AUCUN placeholder du type [injecter X]. Tu injectes les vraies valeurs en lisant les inputs. Si un input est manquant, tu gères proprement (section adaptée ou omise).

R6 — Tu écris le prompt en français, même si les inputs sont mixtes. Le prompt tourne en prod sur des prospects français.

R7 — Le prompt généré doit propager le framework 4 beats et la liste de formulations interdites EXACTEMENT comme décrits ici. Pas de variation, pas de réécriture. Ces éléments sont des standards Lidmeo.

R8 — Tu n'inclus pas la section "FIN DE LA STRUCTURE" ni le titre "RÈGLES POUR TOI" dans ta sortie. Ces éléments te sont destinés, pas au prompt de prod.`;

// ── Types ─────────────────────────────────────────────────────────────────────

export type DapsStyle = {
  relation: "tutoiement" | "vouvoiement" | "vouvoiement_cordial";
  posture: "expert" | "pair" | "consultant";
  cta: string;
  signature_name: string;
};

export type DapsAnswers = {
  pain: string;
  angle: string;
  proofs: string[];
  style: DapsStyle;
};

type ChatEntry = { role: string; content: string };

// ── extractDapsFromHistory ─────────────────────────────────────────────────────
// Parses the 4 DAPS answers from a conversation history produced by the
// messages-setup chatbot. Takes the LAST user answer for each question so
// that a challenged + re-answered question gets the final response.

export function extractDapsFromHistory(
  history: ChatEntry[]
): DapsAnswers | null {
  // Each entry maps question patterns → DAPS key
  const QUESTION_MARKERS: Array<{ key: "pain" | "angle" | "proofs" | "style"; patterns: string[] }> = [
    {
      key: "pain",
      patterns: ["problème concret", "clients idéaux", "aujourd'hui et qui les pousserait"],
    },
    {
      key: "angle",
      patterns: ["plutôt qu'un concurrent", "angle en une phrase", "pourquoi toi"],
    },
    {
      key: "proofs",
      patterns: ["preuves concrètes", "3 preuves", "donne-moi 3"],
    },
    {
      key: "style",
      patterns: ["tutoiement", "style que tu veux", "réponds à ces 3 points"],
    },
  ];

  const buckets: Record<"pain" | "angle" | "proofs" | "style", string[]> = {
    pain: [],
    angle: [],
    proofs: [],
    style: [],
  };

  let currentKey: "pain" | "angle" | "proofs" | "style" | null = null;

  for (const entry of history) {
    if (entry.role === "assistant") {
      const lower = entry.content.toLowerCase();
      for (const { key, patterns } of QUESTION_MARKERS) {
        if (patterns.some((p) => lower.includes(p))) {
          currentKey = key;
          break;
        }
      }
    } else if (entry.role === "user" && currentKey) {
      const trimmed = entry.content.trim();
      // Skip very short messages (validations like "ok", "c'est bon")
      if (trimmed.length > 15) {
        buckets[currentKey].push(trimmed);
      }
    }
  }

  // Take the last answer for each question (accounts for challenge → re-answer)
  const pain = buckets.pain.at(-1) ?? "";
  const angle = buckets.angle.at(-1) ?? "";
  const proofsRaw = buckets.proofs.at(-1) ?? "";
  const styleRaw = buckets.style.at(-1) ?? "";

  if (!pain && !angle && !proofsRaw && !styleRaw) return null;

  // Parse proofs: split on numbered lists, bullet points, or newlines
  const proofs = proofsRaw
    ? proofsRaw
        .split(/\n|[0-9]+[.)]\s*|[-–•]\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 8)
        .slice(0, 5)
    : [];

  // Parse style from Q4 answer
  const styleLower = styleRaw.toLowerCase();

  const relation: DapsStyle["relation"] =
    styleLower.includes("vouvoiement cordial") || styleLower.includes("cordial")
      ? "vouvoiement_cordial"
      : styleLower.includes("vouvoiement")
      ? "vouvoiement"
      : "tutoiement";

  const posture: DapsStyle["posture"] =
    styleLower.includes("consultant")
      ? "consultant"
      : styleLower.includes("pair")
      ? "pair"
      : "expert";

  // Extract signature name: look for a Q4 third-point answer
  // Common patterns: "3) Prénom Nom", "3. Prénom Nom", last line containing a name
  const sigPatterns = [
    /(?:3[.)]\s*)(.+)/,                       // "3) Prénom Nom"
    /(?:signe[^:]*:|signature[^:]*:)\s*(.+)/i, // "signe : Prénom Nom"
    /(?:prénom[^:]*:|nom[^:]*:)\s*(.+)/i,      // "prénom : Prénom"
  ];
  let signature_name = "";
  for (const re of sigPatterns) {
    const m = styleRaw.match(re);
    if (m) {
      signature_name = m[1].trim().split("\n")[0].trim();
      break;
    }
  }

  const cta =
    relation === "tutoiement"
      ? "Ouvert à un échange de 10 min ?"
      : "Ouvert à un échange de 10 minutes ?";

  return {
    pain,
    angle,
    proofs,
    style: { relation, posture, cta, signature_name },
  };
}

// ── buildDapsFromIcpFallback ──────────────────────────────────────────────────
// Fallback for clients onboarded with the old 6-question ICP questionnaire.
// Builds a partial DapsAnswers object from icp_configs.filters.questionnaire.

function buildDapsFromIcpFallback(
  icpDigest: string,
  companyName: string
): DapsAnswers {
  return {
    pain: icpDigest
      ? `(extrait du questionnaire ICP) ${icpDigest.split("\n")[0] ?? ""}`
      : "",
    angle: companyName
      ? `Offre de ${companyName} (détails à préciser)`
      : "",
    proofs: [],
    style: {
      relation: "tutoiement",
      posture: "pair",
      cta: "Ouvert à un échange de 10 min ?",
      signature_name: companyName,
    },
  };
}

// ── generateSystemPromptFromMessages ─────────────────────────────────────────

type GeneratePromptInput = {
  companyName: string;
  messageLinkedin: string;
  relanceLinkedin: string;
  messageEmail: string;
  conversationDigest: string;  // kept for backward compat (still used in fallback)
  icpDigest: string;
  conversationHistory?: ChatEntry[];  // raw history for DAPS extraction (preferred)
};

export async function generateSystemPromptFromMessages(
  apiKey: string,
  input: GeneratePromptInput
): Promise<string> {
  // 1) Extract DAPS from raw history if available; fall back to ICP questionnaire
  const daps: DapsAnswers =
    (input.conversationHistory
      ? extractDapsFromHistory(input.conversationHistory)
      : null) ??
    buildDapsFromIcpFallback(input.icpDigest, input.companyName);

  // 2) Build the condensed conversation history for context (capped to avoid token bloat)
  const historyForContext = input.conversationHistory
    ? buildConversationDigest(input.conversationHistory)
    : input.conversationDigest;

  // 3) Structured user message
  const userMessage = [
    `MESSAGES_VALIDES:`,
    `- LinkedIn: ${input.messageLinkedin}`,
    `- Relance: ${input.relanceLinkedin}`,
    ``,
    `EMAIL_VALIDE:`,
    input.messageEmail,
    ``,
    `REPONSES_DAPS:`,
    `- pain: ${daps.pain || "(non renseigné)"}`,
    `- angle: ${daps.angle || "(non renseigné)"}`,
    `- proofs: ${JSON.stringify(daps.proofs.length > 0 ? daps.proofs : ["(aucune preuve fournie)"])}`,
    `- style: ${JSON.stringify(daps.style)}`,
    ``,
    `ICP_DIGEST:`,
    input.icpDigest || "(aucun)",
    ``,
    `CONVERSATION_HISTORY:`,
    historyForContext || "(aucun historique)",
    ``,
    `Génère le prompt système complet selon la structure en 12 sections.`,
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
      max_tokens: 4096,
      system: GENERATE_PROMPT_SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`anthropic_error_${res.status}:${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  const text: string = data.content?.[0]?.text ?? "";
  return text;
}

// ── FINALIZE_MESSAGES_SYSTEM ──────────────────────────────────────────────────
// Not modified in this livrable.

const FINALIZE_MESSAGES_SYSTEM = `Tu reçois deux messages de prospection validés par un client (message LinkedIn d'ouverture + relance LinkedIn) contenant des exemples concrets (un prénom et une entreprise de démonstration). Ta mission :

1. Remplace le prénom concret utilisé dans le MESSAGE_LINKEDIN par la variable \${firstName} et l'entreprise concrète par \${company}. Garde le reste du message identique au mot près.
2. Remplace le prénom concret utilisé dans la RELANCE_LINKEDIN par la variable {{prenom}}. Si une entreprise apparaît dans la relance, remplace-la par {{company}}. Garde le reste identique.
3. Génère un EMAIL de prospection dans le même angle, ton et style que le message LinkedIn (400-800 caractères, corps uniquement + un objet). Utilise {{prenom}} et {{company}} pour les variables. Inclus un objet (ligne "Objet : ..."), le corps, puis une signature "— <Prénom du client> — <Entreprise du client>".

RÈGLES ABSOLUES :
- N'ajoute aucun commentaire, aucune explication, aucun préambule.
- Pas d'emoji, pas de tirets de formatage — texte brut avec sauts de ligne.
- Retourne EXACTEMENT ce format, rien d'autre :

[MESSAGE_LINKEDIN]
(message LinkedIn avec \${firstName} et \${company})
[/MESSAGE_LINKEDIN]

[RELANCE_LINKEDIN]
(relance avec {{prenom}} et éventuellement {{company}})
[/RELANCE_LINKEDIN]

[EMAIL]
Objet : ...
...
[/EMAIL]`;

type FinalizeInput = {
  companyName: string;
  clientFirstName: string;
  validatedLinkedin: string;
  validatedRelance: string;
  conversationDigest: string;
};

export async function finalizeMessagesFromChat(
  apiKey: string,
  input: FinalizeInput
): Promise<{ message_linkedin: string; relance_linkedin: string; message_email: string }> {
  const userMessage = [
    `Entreprise du client : ${input.companyName || "Inconnue"}`,
    `Prénom du client (pour signature email) : ${input.clientFirstName || "Inconnu"}`,
    "",
    "MESSAGE LINKEDIN VALIDÉ (avec exemple concret) :",
    input.validatedLinkedin,
    "",
    "RELANCE LINKEDIN VALIDÉE (avec exemple concret) :",
    input.validatedRelance,
    "",
    "CONTEXTE CONVERSATION (réponses aux questions d'onboarding) :",
    input.conversationDigest || "(aucun)",
  ].join("\n");

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
      system: FINALIZE_MESSAGES_SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`anthropic_finalize_error_${res.status}:${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  const text: string = data.content?.[0]?.text ?? "";
  const parsed = parseGeneratedMessages(text);
  if (!parsed.message_linkedin || !parsed.relance_linkedin || !parsed.message_email) {
    throw new Error("finalize_missing_tags");
  }
  return parsed;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

export function extractTag(raw: string, tag: string): string {
  const re = new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[/${tag}\\]`, "i");
  const m = raw.match(re);
  return m ? m[1].trim() : "";
}

export function parseGeneratedMessages(raw: string): {
  message_linkedin: string;
  relance_linkedin: string;
  message_email: string;
} {
  return {
    message_linkedin: extractTag(raw, "MESSAGE_LINKEDIN"),
    relance_linkedin: extractTag(raw, "RELANCE_LINKEDIN"),
    message_email: extractTag(raw, "EMAIL"),
  };
}

export function buildConversationDigest(
  history: Array<{ role: string; content: string }>
): string {
  const lines: string[] = [];
  for (const entry of history) {
    if (!entry || typeof entry.content !== "string") continue;
    const role = entry.role === "user" ? "CLIENT" : "IA";
    lines.push(`${role}: ${entry.content.slice(0, 1500)}`);
  }
  return lines.join("\n\n").slice(0, 12000);
}

export function buildIcpDigest(filters: Record<string, unknown> | null | undefined): string {
  if (!filters) return "";
  const q = (filters.questionnaire ?? {}) as Record<string, unknown>;
  const promise =
    (filters.commercial_promise as string | null) ||
    (q.q6_commercial_promise as string | null) ||
    "";
  const sizes = Array.isArray(q.q4_company_sizes)
    ? (q.q4_company_sizes as string[]).join(", ")
    : (q.q4_company_sizes as string) || "";
  return [
    promise ? `Promesse commerciale : ${promise}` : null,
    q.q1_titles ? `Postes ciblés : ${q.q1_titles}` : null,
    q.q2_exclusions ? `Postes à exclure : ${q.q2_exclusions}` : null,
    q.q3_sector ? `Secteur : ${q.q3_sector}` : null,
    sizes ? `Tailles d'entreprise : ${sizes}` : null,
    q.q5_locations ? `Localisation : ${q.q5_locations}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
