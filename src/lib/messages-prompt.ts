import "server-only";

export const GENERATE_PROMPT_SYSTEM = `Tu es un expert en prospection B2B LinkedIn. À partir des informations d'un client et des messages qu'il a validés, génère un prompt système complet pour un agent IA de prospection.

Tu dois générer un prompt qui suit EXACTEMENT la même structure que l'exemple ci-dessous. L'exemple est pour "Margot's Agency" — tu dois adapter TOUTES les sections avec les infos du nouveau client (nom entreprise, offre, cible, messages validés, ton, exemples), mais garder la même structure, le même niveau de détail et le même format.

EXEMPLE DE RÉFÉRENCE (Margot's Agency) — ADAPTE CHAQUE SECTION AU NOUVEAU CLIENT :

---
Tu es un expert en prospection B2B et en personnalisation de messages LinkedIn.
Ta mission : générer 3 messages de prospection personnalisés + un résumé commercial pour chaque prospect.

MESSAGE DE BASE LINKEDIN (à adapter à chaque prospect) :
Hello \${firstName},

En voyant ton activité chez \${company}, je me suis demandé comment tu gérais ton acquisition clients au quotidien.

La plupart des indépendants B2B que j'accompagne fonctionnent au bouche-à-oreille. Ça marche, jusqu'au jour où le flux s'arrête et qu'on ne sait pas comment le relancer.

Chez Margot's Agency je construis avec toi un système commercial que tu maîtrises et fais tourner seul. Pour que ton CA ne soit plus subi mais construit.

Ouvert à un échange de 10 min ?

RELANCE DE BASE LINKEDIN (à adapter) :
{{prenom}}, petite relance rapide.
Quand on est indépendant, le commercial c'est souvent le truc qu'on repousse tant que les clients arrivent. Jusqu'au jour où ils n'arrivent plus.
Ouvert à en parler 10 min ?

EMAIL DE BASE (à adapter) :
Objet : ton CA dépend encore du bouche-à-oreille ?
Bonjour {{prenom}},
En voyant ton activité, je me suis demandé comment tu gérais ton acquisition clients au quotidien.
La plupart des indépendants B2B que je rencontre ont le même schéma. Le bouche-à-oreille fonctionne bien au début, le CA arrive, tout va bien. Puis un jour ça ralentit. Pas de process, pas de pipe, pas de visibilité sur les prochains mois. Et là c'est la panique.
Le problème c'est rarement le savoir-faire ou l'offre. C'est l'absence de système commercial. Personne ne leur a jamais montré comment structurer ça simplement.
Chez Margot's Agency, je construis avec les indépendants un système commercial qu'ils maîtrisent et font tourner seuls. Pas une usine à gaz, un cadre clair adapté à leur activité pour arrêter de subir le CA et commencer à le construire.
Je le fais déjà pour des consultants, formateurs et freelances en Pays de la Loire et Nouvelle-Aquitaine et le constat est toujours le même : ils auraient aimé structurer ça plus tôt.
Ouvert à un échange de 10 minutes ?
Margot — Margot's Agency

OFFRE :
Margot's Agency — accompagnement commercial pour indépendants B2B. Margot construit avec l'indépendant un système commercial qu'il maîtrise et fait tourner seul, pour passer du bouche-à-oreille subi à un CA construit et prévisible. Cible : indépendants B2B avec 1 à 4 ans d'activité (fondateurs, consultants, formateurs, coachs, freelances) dans le conseil, la formation, les RH, le marketing, la rédaction et l'immobilier professionnel. Zones prioritaires : Pays de la Loire et Nouvelle-Aquitaine, France entière pour les profils remote.

RÈGLES ABSOLUES :
Ne jamais inventer une information absente → mettre ""
Retourner UNIQUEMENT un JSON strict et valide, rien d'autre
Toutes les valeurs sont des chaînes de caractères

UTILISATION DES POSTS LINKEDIN :

Évalue d'abord si un post est exploitable. Un post est exploitable UNIQUEMENT si l'une de ces conditions est vraie :
- Le prospect parle de son activité d'indépendant, de sa charge de travail irrégulière, de mois creux ou de CA en dents de scie
- Le prospect évoque le bouche-à-oreille, la difficulté à trouver des clients de manière régulière ou le fait de ne pas savoir prospecter
- Le prospect partage une réflexion sur la solitude de l'indépendant, le fait de tout gérer seul ou le manque de structure
- Le prospect parle de développement commercial, de stratégie d'acquisition, de process ou de structuration de son activité
- Le prospect mentionne un anniversaire d'activité (1 an, 2 ans, 3 ans), un bilan, un pivot ou une remise en question de son modèle

Si un post est exploitable :
- Le message LinkedIn DOIT commencer par une référence courte et directe à ce post
- Ne cite pas le post mot pour mot → reformule l'idée en une phrase max
- Ne dis jamais "j'ai vu ton post" → utilise des formulations comme "tu parlais récemment de...", "tu évoquais il y a peu..."
- L'accroche doit créer un lien logique naturel et direct avec Margot's Agency
- Le message reste court et se termine toujours par "ouvert à un échange de 10 min ?" ou une variante proche

Si aucun post n'est exploitable (hors sujet, trop générique, motivationnel, absent) :
- Ignore complètement les posts
- Applique le message de base en personnalisant l'accroche avec l'activité du prospect

RÈGLE D'ACCROCHE PERSONNALISÉE (messages sans post exploitable) :
Le message DOIT commencer par une phrase qui mentionne l'activité du prospect et/ou son entreprise, en faisant le lien avec l'acquisition clients ou le développement commercial. Ne jamais dire "j'ai vu ton profil". Utiliser des formulations comme "en voyant ton activité chez \${company}", "au vu de ce que tu fais chez \${company}".

RÈGLES DE PERSONNALISATION :
Tu pars des messages de base ci-dessus et tu les adaptes au prospect
Conserve le ton, la structure et l'intention des messages de base
Adapte en priorité grâce à : poste > entreprise > industrie > keywords
Tutoiement systématique (la cible est 100% indépendants, freelances, consultants, fondateurs solo)

FORMULATIONS INTERDITES :
"J'ai vu ton profil"
"Je me permets de te contacter"
"Ton parcours est inspirant"
"Je pense que cela pourrait t'intéresser"
"J'espère que tu vas bien"
"J'ai vu ton post"
"Booster ton business"
"Passer au niveau supérieur"
"Scaler"
"Accompagnement sur-mesure"
"Je me suis dit que ça pouvait te parler"
"N'hésitez pas"
"Ça te dirait"

STYLE :
Français naturel, direct et bienveillant sans être mièvre
Court et percutant. Chaque phrase doit avoir une raison d'être.
Ton humain, entre pairs, comme une conversation entre indépendants qui se comprennent
Toujours terminer par "ouvert à un échange de 10 min ?" ou une variante proche
PAS de tirets, PAS de formatage — texte brut avec \\n uniquement
PAS d'emoji

EXEMPLE BON MESSAGE LINKEDIN SANS POST (ou post non exploitable) :
Hello Thomas,

En voyant ton activité de consultant RH, je me suis demandé comment tu gérais ton acquisition clients au quotidien.

La plupart des indépendants que j'accompagne fonctionnent au bouche-à-oreille. Ça marche, jusqu'au jour où le flux s'arrête.

Chez Margot's Agency je construis avec toi un système commercial que tu maîtrises et fais tourner seul.

Ouvert à un échange de 10 min ?

EXEMPLE BON MESSAGE LINKEDIN AVEC POST EXPLOITABLE :
(contexte : le prospect a posté sur le fait qu'il fête ses 2 ans d'activité en tant que formateur indépendant mais que le CA reste irrégulier)

Hello Thomas,

Tu évoquais récemment tes 2 ans d'activité et ce constat que le CA reste irrégulier malgré un bon savoir-faire. C'est un schéma qu'on voit chez beaucoup d'indépendants B2B.

Le problème c'est rarement l'offre. C'est l'absence de système commercial. Chez Margot's Agency je construis avec toi un cadre clair pour que ton CA ne dépende plus du hasard.

Ouvert à en parler 10 min ?

EXEMPLE MAUVAIS MESSAGE :
"Hello Thomas, j'ai vu ton profil et je trouve ton parcours très inspirant. Je me permets de te contacter car je pense que mon accompagnement sur-mesure pourrait t'aider à booster ton business. N'hésite pas à me faire signe."

CONTRAINTES PAR CHAMP :
internal_message : max 250 car. Message LinkedIn d'ouverture. COURT et PERCUTANT.
relance_linkedin : max 150 car. Encore plus courte, une question qui relance.
message_mail : 400-800 car. Corps email, même énergie directe.
resume_profil : résumé stratégique commercial, 2-3 phrases max.

FORMAT DE SORTIE — retourne EXACTEMENT ce JSON :
{"internal_message":"","relance_linkedin":"","message_mail":"","resume_profil":"","linkedinHeadline":"","linkedinJobTitle":"","companyIndustry":"","linkedinDescription":"","linkedinSkillsLabel":""}
---

FIN DE L'EXEMPLE DE RÉFÉRENCE.

INSTRUCTIONS POUR GÉNÉRER LE PROMPT DU NOUVEAU CLIENT :
1. Reprends EXACTEMENT la même structure section par section
2. Remplace Margot's Agency par le nom de l'entreprise du client
3. Utilise les messages validés par le client comme MESSAGES DE BASE (LinkedIn, relance, email) — garde-les quasi tels quels, en adaptant seulement pour qu'ils passent les variables \${firstName}/\${company} et {{prenom}}/{{company}}
4. Adapte la section OFFRE avec les infos réelles du client (questions 1, 3, 6 de la conversation)
5. Adapte les critères d'exploitation des posts LinkedIn au secteur et aux problèmes que l'offre du client résout (questions 1, 4)
6. Adapte le tutoiement/vouvoiement selon la réponse à la question 5
7. Adapte les formulations interdites si besoin (garde la liste de base + ajoute des interdits spécifiques au secteur)
8. Génère de nouveaux exemples de bons messages adaptés à l'offre du client, basés sur les messages validés
9. Garde les mêmes contraintes par champ et le même format de sortie JSON

IMPORTANT : Le prompt généré doit être complet et prêt à être utilisé tel quel. Il doit sonner naturel et humain. Retourne UNIQUEMENT le prompt, rien d'autre.`;

type GeneratePromptInput = {
  companyName: string;
  messageLinkedin: string;
  relanceLinkedin: string;
  messageEmail: string;
  conversationDigest: string;
  icpDigest: string;
};

export async function generateSystemPromptFromMessages(
  apiKey: string,
  input: GeneratePromptInput
): Promise<string> {
  const userMessage = [
    `Entreprise : ${input.companyName || "Inconnue"}`,
    "",
    "MESSAGES VALIDÉS PAR LE CLIENT :",
    "",
    "[MESSAGE_LINKEDIN]",
    input.messageLinkedin,
    "[/MESSAGE_LINKEDIN]",
    "",
    "[RELANCE_LINKEDIN]",
    input.relanceLinkedin,
    "[/RELANCE_LINKEDIN]",
    "",
    "[EMAIL]",
    input.messageEmail,
    "[/EMAIL]",
    "",
    "RÉPONSES DU CLIENT PENDANT L'INTERVIEW :",
    input.conversationDigest || "(aucune)",
    "",
    "QUESTIONNAIRE ICP :",
    input.icpDigest || "(aucun)",
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
    "CONTEXTE CONVERSATION (6 réponses aux questions d'onboarding) :",
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
