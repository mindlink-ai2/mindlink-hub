import { NextResponse } from "next/server";
import { getSupportAdminContext } from "@/lib/support-admin-auth";
import { createServiceSupabase } from "@/lib/inbox-server";

export const runtime = "nodejs";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Escape a string for safe insertion as a JSON string value in an already-serialized JSON. */
function jsonEscape(s: string): string {
  return JSON.stringify(s).slice(1, -1);
}

/** Returns tomorrow's date as YYYY-MM-DD */
function getTomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

// ── Workflow template injection ───────────────────────────────────────────────

/**
 * Builds the n8n workflow JSON by injecting client-specific parameters into the template.
 * The template uses {{PLACEHOLDER}} markers which are replaced here.
 */
function buildWorkflowJson(params: {
  clientName: string;
  companyName: string;
  quotaPerDay: number;
  startDate: string;
  googleSheetId: string;
  tabName: string;
  clientId: number;
  unipileAccountId: string;
  promptSystems: string;
}): Record<string, unknown> {
  // Serialize the template to a string, inject params, then parse back.
  // jsonEscape() ensures each value is safely embedded in the JSON string.
  const templateStr = JSON.stringify(getWorkflowTemplate());

  const result = templateStr
    .replace(/\{\{CLIENT_NAME\}\}/g, jsonEscape(params.clientName))
    .replace(/\{\{COMPANY_NAME\}\}/g, jsonEscape(params.companyName))
    .replace(/\{\{QUOTA_PER_DAY\}\}/g, String(params.quotaPerDay))
    .replace(/\{\{START_DATE\}\}/g, jsonEscape(params.startDate))
    .replace(/\{\{GOOGLE_SHEET_ID\}\}/g, jsonEscape(params.googleSheetId))
    .replace(/\{\{TAB_NAME\}\}/g, jsonEscape(params.tabName))
    .replace(/\{\{CLIENT_ID\}\}/g, String(params.clientId))
    .replace(/\{\{UNIPILE_ACCOUNT_ID\}\}/g, jsonEscape(params.unipileAccountId))
    .replace(/\{\{PROMPT_SYSTEME\}\}/g, jsonEscape(params.promptSystems));

  return JSON.parse(result) as Record<string, unknown>;
}

/**
 * Returns the workflow template object with {{PLACEHOLDER}} markers.
 * Template is defined here as a TypeScript object for type safety and maintainability.
 */
function getWorkflowTemplate(): Record<string, unknown> {
  return {
    name: "Prospection — {{CLIENT_NAME}} — {{COMPANY_NAME}}",
    nodes: [
      {
        parameters: {
          jsCode:
            "const allItems = $input.all();\n" +
            "const itemsPerDay = {{QUOTA_PER_DAY}};\n\n" +
            "function toUTCDateOnly(d) {\n" +
            "  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));\n" +
            "}\n\n" +
            "const startDate = toUTCDateOnly(new Date('{{START_DATE}}'));\n" +
            "const today = toUTCDateOnly(new Date());\n\n" +
            "function businessDaysDiff(start, end) {\n" +
            "  if (end <= start) return 0;\n" +
            "  let count = 0;\n" +
            "  const cur = new Date(start);\n" +
            "  while (cur < end) {\n" +
            "    const dow = cur.getUTCDay();\n" +
            "    if (dow !== 0 && dow !== 6) count++;\n" +
            "    cur.setUTCDate(cur.getUTCDate() + 1);\n" +
            "  }\n" +
            "  return count;\n" +
            "}\n\n" +
            "const businessDays = businessDaysDiff(startDate, today);\n" +
            "const startIndex = businessDays * itemsPerDay;\n" +
            "const endIndex = startIndex + itemsPerDay;\n\n" +
            "const sliced = allItems.slice(startIndex, endIndex);\n\n" +
            "return sliced.map((item, i) => ({\n" +
            "  json: {\n" +
            "    ...item.json,\n" +
            '    "Corporate Phone": item.json["Corporate Phone"] ?? ""\n' +
            "  },\n" +
            "  pairedItem: { item: startIndex + i }\n" +
            "}));",
        },
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [-1056, 1264],
        id: "slice-per-day",
        name: "Leads/jour",
      },
      {
        parameters: {
          triggerTimes: {
            item: [{ mode: "custom", cronExpression: "0 7 * * 1-5" }],
          },
        },
        name: "Cron (07:00)",
        type: "n8n-nodes-base.cron",
        typeVersion: 1,
        position: [-1504, 1264],
        id: "cron-trigger",
      },
      {
        parameters: { batchSize: 30, options: { reset: false } },
        type: "n8n-nodes-base.splitInBatches",
        typeVersion: 3,
        position: [416, 1120],
        id: "batch-loop",
        name: "Loop Over Items",
      },
      {
        parameters: { amount: 3 },
        type: "n8n-nodes-base.wait",
        typeVersion: 1.1,
        position: [640, 1120],
        id: "wait-node",
        name: "Wait",
      },
      {
        parameters: {
          documentId: { __rl: true, value: "{{GOOGLE_SHEET_ID}}", mode: "id" },
          sheetName: {
            __rl: true,
            value: "{{TAB_NAME}}",
            mode: "name",
          },
          options: {},
        },
        type: "n8n-nodes-base.googleSheets",
        typeVersion: 4.7,
        position: [-1280, 1264],
        id: "read-sheet",
        name: "Get row(s) in sheet",
        credentials: {
          googleSheetsOAuth2Api: {
            id: "N2fzwEkNZE5w6Xal",
            name: "Direction.mindlink",
          },
        },
      },
      {
        parameters: {
          method: "POST",
          url: "https://ecvzrnhufpwlqjcfvqum.supabase.co/rest/v1/leads",
          sendHeaders: true,
          headerParameters: {
            parameters: [
              {
                name: "apikey",
                value:
                  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjdnpybmh1ZnB3bHFqY2Z2cXVtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzIxMDU5NCwiZXhwIjoyMDc4Nzg2NTk0fQ.Dxpf897UjXfZUyXjsmxIwf7IXUznGAwbp6a-Uvz-KKw",
              },
              {
                name: "Authorization",
                value:
                  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjdnpybmh1ZnB3bHFqY2Z2cXVtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzIxMDU5NCwiZXhwIjoyMDc4Nzg2NTk0fQ.Dxpf897UjXfZUyXjsmxIwf7IXUznGAwbp6a-Uvz-KKw",
              },
              { name: "Content-Type", value: "application/json" },
              { name: "Prefer", value: "return=representation" },
            ],
          },
          sendBody: true,
          specifyBody: "json",
          jsonBody: "={{$json}}",
          options: {},
        },
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [1312, 1120],
        id: "supabase-insert",
        name: "Ajout Supabase",
      },
      {
        parameters: {
          mode: "raw",
          jsonOutput:
            "={{(() => {\n" +
            "  const data = $input.item.json;\n" +
            "  return {\n" +
            "    properties: {\n" +
            "      firstname: data.FirstName || data.firstName || data.firstname || data['First Name'] || '',\n" +
            "      lastname: data.LastName || data.lastName || data.lastname || data['Last Name'] || '',\n" +
            "      company: data.Company || data.company || data['Company Name'] || '',\n" +
            "      location: data.location || data.Location || [data['City'], data['State'], data['Country']].filter(Boolean).join(', ') || '',\n" +
            "      linkedin_profile: data.LinkedInURL || data.linkedin_profile || data.linkedinUrl || data.linkedin || data['Person Linkedin Url'] || '',\n" +
            "      linkedin_message_propose: data.internal_message || data.message_linkedin || data.linkedin_message_propose || '',\n" +
            "      relance_linkedin: data.relance_linkedin || '',\n" +
            "      message_mail: data.message_mail || '',\n" +
            "      resume_profil: data.resume_profil || '',\n" +
            "      linkedinHeadline: data.linkedinHeadline || '',\n" +
            "      linkedinJobTitle: data.linkedinJobTitle || data['Title'] || '',\n" +
            "      companyIndustry: data.companyIndustry || data['Industry'] || '',\n" +
            "      linkedinDescription: data.linkedinDescription || '',\n" +
            "      linkedinSkillsLabel: data.linkedinSkillsLabel || data['Keywords'] || data['Technologies'] || '',\n" +
            "      email: data.email || data.Email || data['Email'] || data['Work Email'] || '',\n" +
            "      phone: data.phone || data.Phone || data['Mobile Phone'] || data['Work Direct Phone'] || data['Corporate Phone'] || data['Other Phone'] || '',\n" +
            "      website: data.website || data.Website || ''\n" +
            "    }\n" +
            "  };\n" +
            "})()}}",
          options: {},
        },
        type: "n8n-nodes-base.set",
        typeVersion: 3.4,
        position: [864, 1120],
        id: "naming-supabase",
        name: "naming pour supabase",
      },
      {
        parameters: {
          mode: "runOnceForEachItem",
          jsCode:
            "const firstname = $json.properties.firstname || '';\n" +
            "const lastname = $json.properties.lastname || '';\n" +
            "const company = $json.properties.company || '';\n" +
            "const linkedin_profile = $json.properties.linkedin_profile || '';\n" +
            "const location = $json.properties.location || '';\n" +
            "const internal_message = $json.properties.linkedin_message_propose || '';\n" +
            "const relance_linkedin = $json.properties.relance_linkedin || '';\n" +
            "const message_mail = $json.properties.message_mail || '';\n" +
            "const resume_profil = $json.properties.resume_profil || '';\n" +
            "const client_id = {{CLIENT_ID}};\n" +
            "const linkedinHeadline = $json.properties.linkedinHeadline || '';\n" +
            "const linkedinJobTitle = $json.properties.linkedinJobTitle || '';\n" +
            "const companyIndustry = $json.properties.companyIndustry || '';\n" +
            "const linkedinDescription = $json.properties.linkedinDescription || '';\n" +
            "const linkedinSkillsLabel = $json.properties.linkedinSkillsLabel || '';\n" +
            "const email = $json.properties.email || '';\n" +
            "const phone = $json.properties.phone || '';\n" +
            "const website = $json.properties.website || '';\n\n" +
            "const payload = {\n" +
            "  client_id: client_id,\n" +
            "  Name: `${firstname} ${lastname}`.trim(),\n" +
            "  FirstName: firstname,\n" +
            "  LastName: lastname,\n" +
            "  Company: company,\n" +
            "  LinkedInURL: linkedin_profile,\n" +
            "  location: location,\n" +
            "  traite: false,\n" +
            "  internal_message: internal_message,\n" +
            "  relance_linkedin: relance_linkedin,\n" +
            "  message_mail: message_mail,\n" +
            "  resume_profil: resume_profil,\n" +
            "  linkedinHeadline: linkedinHeadline,\n" +
            "  linkedinJobTitle: linkedinJobTitle,\n" +
            "  companyIndustry: companyIndustry,\n" +
            "  linkedinDescription: linkedinDescription,\n" +
            "  linkedinSkillsLabel: linkedinSkillsLabel,\n" +
            "  email: email,\n" +
            "  phone: phone,\n" +
            "  website: website\n" +
            "};\n\n" +
            "return { json: payload };",
        },
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [1088, 1120],
        id: "prep-supabase",
        name: "préparation envoi supabase",
      },
      {
        parameters: {
          promptType: "define",
          text:
            "=DONNÉES DU PROSPECT :\n" +
            "- Prénom : {{ $('Get row(s) in sheet').item.json['First Name'] }}\n" +
            "- Nom : {{ $('Get row(s) in sheet').item.json['Last Name'] }}\n" +
            "- Poste : {{ $('Get row(s) in sheet').item.json['Title'] }}\n" +
            "- Entreprise : {{ $('Get row(s) in sheet').item.json['Company Name'] }}\n" +
            "- Industrie : {{ $('Get row(s) in sheet').item.json['Industry'] }}\n" +
            "- Seniority : {{ $('Get row(s) in sheet').item.json['Seniority'] }}\n" +
            "- Département : {{ $('Get row(s) in sheet').item.json['Departments'] }}\n" +
            "- Nombre d'employés : {{ $('Get row(s) in sheet').item.json['# Employees'] }}\n" +
            "- Pays : {{ $('Get row(s) in sheet').item.json['Country'] }}\n" +
            "- Ville : {{ $('Get row(s) in sheet').item.json['City'] }}\n" +
            "- State : {{ $('Get row(s) in sheet').item.json['State'] }}\n" +
            "- Email : {{ $('Get row(s) in sheet').item.json['Email'] || $('Get row(s) in sheet').item.json['Work Email'] || '' }}\n" +
            "- Téléphone : {{ $('Get row(s) in sheet').item.json['Mobile Phone'] || $('Get row(s) in sheet').item.json['Work Direct Phone'] || $('Get row(s) in sheet').item.json['Corporate Phone'] || '' }}\n" +
            "- LinkedIn : {{ $('Get row(s) in sheet').item.json['Person Linkedin Url'] }}\n" +
            "- Site web : {{ $('Get row(s) in sheet').item.json['Website'] }}\n" +
            "- Keywords : {{ $('Get row(s) in sheet').item.json['Keywords'] || $('Get row(s) in sheet').item.json['Technologies'] || '' }}\n" +
            "- LinkedIn entreprise : {{ $('Get row(s) in sheet').item.json['Company Linkedin Url'] }}\n\n" +
            "POSTS LINKEDIN RÉCENTS :\n" +
            "{{ $json.recent_posts }}\n\n" +
            "Génère les 3 messages personnalisés (linkedin_message_propose, relance_linkedin, message_mail) et le resume_profil.\n" +
            "Retourne uniquement le JSON.",
          hasOutputParser: true,
          options: {
            systemMessage: "{{PROMPT_SYSTEME}}",
          },
        },
        type: "@n8n/n8n-nodes-langchain.agent",
        typeVersion: 1.7,
        position: [-160, 1120],
        id: "ai-enrichment",
        name: "Enrichissement IA",
      },
      {
        parameters: {
          model: {
            __rl: true,
            value: "gpt-5.4-mini",
            mode: "list",
            cachedResultName: "gpt-5.4-mini",
          },
          options: {
            maxTokens: 2000,
            responseFormat: "json_object",
            temperature: 0.6,
          },
        },
        type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
        typeVersion: 1.2,
        position: [-144, 1344],
        id: "openai-model",
        name: "OpenAI Chat Model",
        credentials: {
          openAiApi: { id: "zvuxpIqui59g36uo", name: "OpenAi account 3" },
        },
      },
      {
        parameters: {
          schemaType: "manual",
          inputSchema:
            '{\n  "type": "object",\n  "properties": {\n    "internal_message": { "type": "string", "description": "Message LinkedIn personnalisé" },\n    "relance_linkedin": { "type": "string", "description": "Relance LinkedIn courte" },\n    "message_mail": { "type": "string", "description": "Email de prospection" },\n    "resume_profil": { "type": "string", "description": "Résumé stratégique du prospect" },\n    "linkedinHeadline": { "type": "string", "description": "Headline LinkedIn" },\n    "linkedinJobTitle": { "type": "string", "description": "Intitulé de poste" },\n    "companyIndustry": { "type": "string", "description": "Secteur d\'activité" },\n    "linkedinDescription": { "type": "string", "description": "Description profil LinkedIn" },\n    "linkedinSkillsLabel": { "type": "string", "description": "Compétences / mots-clés" }\n  },\n  "required": ["internal_message", "relance_linkedin", "message_mail", "resume_profil", "linkedinHeadline", "linkedinJobTitle", "companyIndustry", "linkedinDescription", "linkedinSkillsLabel"]\n}',
        },
        type: "@n8n/n8n-nodes-langchain.outputParserStructured",
        typeVersion: 1.2,
        position: [-16, 1344],
        id: "output-parser",
        name: "Structured Output Parser",
      },
      {
        parameters: {
          assignments: {
            assignments: [
              {
                id: "field-firstname",
                name: "firstname",
                value: "={{ $('Get row(s) in sheet').item.json['First Name'] }}",
                type: "string",
              },
              {
                id: "field-lastname",
                name: "lastname",
                value: "={{ $('Get row(s) in sheet').item.json['Last Name'] }}",
                type: "string",
              },
              {
                id: "field-company",
                name: "company",
                value: "={{ $('Get row(s) in sheet').item.json['Company Name'] }}",
                type: "string",
              },
              {
                id: "field-linkedin_profile",
                name: "linkedin_profile",
                value: "={{ $('Get row(s) in sheet').item.json['Person Linkedin Url'] ?? '' }}",
                type: "string",
              },
              {
                id: "field-location",
                name: "location",
                value:
                  "={{ [$('Get row(s) in sheet').item.json['City'], $('Get row(s) in sheet').item.json['State'], $('Get row(s) in sheet').item.json['Country']].filter(Boolean).join(', ') }}",
                type: "string",
              },
              {
                id: "field-linkedinHeadline",
                name: "linkedinHeadline",
                value: "={{ $json.output?.linkedinHeadline ?? '' }}",
                type: "string",
              },
              {
                id: "field-linkedinJobTitle",
                name: "linkedinJobTitle",
                value:
                  "={{ $json.output?.linkedinJobTitle ?? $('Get row(s) in sheet').item.json['Title'] ?? '' }}",
                type: "string",
              },
              {
                id: "field-companyIndustry",
                name: "companyIndustry",
                value:
                  "={{ $json.output?.companyIndustry ?? $('Get row(s) in sheet').item.json['Industry'] ?? '' }}",
                type: "string",
              },
              {
                id: "field-linkedinDescription",
                name: "linkedinDescription",
                value: "={{ $json.output?.linkedinDescription ?? '' }}",
                type: "string",
              },
              {
                id: "field-linkedinSkillsLabel",
                name: "linkedinSkillsLabel",
                value:
                  "={{ $json.output?.linkedinSkillsLabel ?? $('Get row(s) in sheet').item.json['Keywords'] ?? '' }}",
                type: "string",
              },
              {
                id: "field-email",
                name: "email",
                value:
                  "={{ $('Get row(s) in sheet').item.json['Email'] || $('Get row(s) in sheet').item.json['Work Email'] || '' }}",
                type: "string",
              },
              {
                id: "field-phone",
                name: "phone",
                value:
                  "={{ $('Get row(s) in sheet').item.json['Mobile Phone'] || $('Get row(s) in sheet').item.json['Work Direct Phone'] || $('Get row(s) in sheet').item.json['Corporate Phone'] || '' }}",
                type: "string",
              },
              {
                id: "field-internal_message",
                name: "internal_message",
                value: "={{ $json.output?.internal_message ?? '' }}",
                type: "string",
              },
              {
                id: "field-message_mail",
                name: "message_mail",
                value: "={{ $json.output?.message_mail ?? '' }}",
                type: "string",
              },
              {
                id: "field-website",
                name: "website",
                value: "={{ $('Get row(s) in sheet').item.json['Website'] ?? '' }}",
                type: "string",
              },
              {
                id: "field-relance_linkedin",
                name: "relance_linkedin",
                value: "={{ $json.output?.relance_linkedin ?? '' }}",
                type: "string",
              },
              {
                id: "field-resume_profil",
                name: "resume_profil",
                value: "={{ $json.output?.resume_profil ?? '' }}",
                type: "string",
              },
            ],
          },
          options: {},
        },
        type: "n8n-nodes-base.set",
        typeVersion: 3.4,
        position: [192, 1120],
        id: "format-data",
        name: "format des données",
      },
      {
        parameters: {
          url: '=https://api30.unipile.com:16023/api/v1/users/{{ $json["Person Linkedin Url"].split("/in/").pop().replace(/\\//g, "") }}',
          sendQuery: true,
          queryParameters: {
            parameters: [{ name: "account_id", value: "{{UNIPILE_ACCOUNT_ID}}" }],
          },
          sendHeaders: true,
          headerParameters: {
            parameters: [
              {
                name: "X-API-KEY",
                value: "iyWBHK7l.RPPbGgYhwkWWPikxHEftEK5gG1mN/f/FNKoMOB0lODc=",
              },
            ],
          },
          options: {},
        },
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.4,
        position: [-832, 1264],
        id: "unipile-profile",
        name: "Get LinkedIn Profile",
        onError: "continueRegularOutput",
      },
      {
        parameters: {
          url: "=https://api30.unipile.com:16023/api/v1/users/{{ $json.provider_id }}/posts",
          sendQuery: true,
          queryParameters: {
            parameters: [
              { name: "account_id", value: "{{UNIPILE_ACCOUNT_ID}}" },
              { name: "limit", value: "3" },
            ],
          },
          sendHeaders: true,
          headerParameters: {
            parameters: [
              {
                name: "X-API-KEY",
                value: "iyWBHK7l.RPPbGgYhwkWWPikxHEftEK5gG1mN/f/FNKoMOB0lODc=",
              },
            ],
          },
          options: {},
        },
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.4,
        position: [-384, 1312],
        id: "unipile-posts",
        name: "Get LinkedIn Posts",
        onError: "continueRegularOutput",
      },
      {
        parameters: { options: {} },
        type: "n8n-nodes-base.splitInBatches",
        typeVersion: 3,
        position: [-608, 1264],
        id: "loop-unipile",
        name: "Loop Unipile",
      },
      {
        parameters: {
          jsCode:
            "const items = $input.all();\n" +
            "const result = [];\n\n" +
            "for (const item of items) {\n" +
            "  const posts = item.json.items || [];\n" +
            "  const postsText = posts.slice(0, 3).map((p, i) => `Post ${i + 1} : ${p.text?.slice(0, 400) || ''}`).join('\\n\\n');\n" +
            "  const prospect = $('Leads/jour').item.json;\n" +
            "  result.push({ json: { ...prospect, recent_posts: postsText || 'Aucun post récent' } });\n" +
            "}\n\n" +
            "return result;",
        },
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [-384, 1120],
        id: "merge-posts",
        name: "Merge Posts",
      },
    ],
    connections: {
      "Leads/jour": {
        main: [[{ node: "Get LinkedIn Profile", type: "main", index: 0 }]],
      },
      "Cron (07:00)": {
        main: [[{ node: "Get row(s) in sheet", type: "main", index: 0 }]],
      },
      "Loop Over Items": {
        main: [[], [{ node: "Wait", type: "main", index: 0 }]],
      },
      Wait: {
        main: [[{ node: "naming pour supabase", type: "main", index: 0 }]],
      },
      "Get row(s) in sheet": {
        main: [[{ node: "Leads/jour", type: "main", index: 0 }]],
      },
      "naming pour supabase": {
        main: [[{ node: "préparation envoi supabase", type: "main", index: 0 }]],
      },
      "préparation envoi supabase": {
        main: [[{ node: "Ajout Supabase", type: "main", index: 0 }]],
      },
      "Enrichissement IA": {
        main: [[{ node: "format des données", type: "main", index: 0 }]],
      },
      "OpenAI Chat Model": {
        ai_languageModel: [[{ node: "Enrichissement IA", type: "ai_languageModel", index: 0 }]],
      },
      "Structured Output Parser": {
        ai_outputParser: [[{ node: "Enrichissement IA", type: "ai_outputParser", index: 0 }]],
      },
      "format des données": {
        main: [[{ node: "Loop Over Items", type: "main", index: 0 }]],
      },
      "Get LinkedIn Profile": {
        main: [[{ node: "Loop Unipile", type: "main", index: 0 }]],
      },
      "Get LinkedIn Posts": {
        main: [[{ node: "Loop Unipile", type: "main", index: 0 }]],
      },
      "Loop Unipile": {
        main: [
          [{ node: "Merge Posts", type: "main", index: 0 }],
          [{ node: "Get LinkedIn Posts", type: "main", index: 0 }],
        ],
      },
      "Merge Posts": {
        main: [[{ node: "Enrichissement IA", type: "main", index: 0 }]],
      },
    },
    settings: { executionOrder: "v1" },
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const adminCtx = await getSupportAdminContext();
  if (!adminCtx) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  let body: {
    org_id: number;
    prompt_systeme?: string;
    google_sheet_id: string;
    tab_name: string;
    extraction_log_id?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const { org_id, prompt_systeme, google_sheet_id, tab_name, extraction_log_id } = body;
  if (!org_id || !google_sheet_id || !tab_name) {
    return NextResponse.json(
      { error: "org_id, google_sheet_id et tab_name sont requis" },
      { status: 400 }
    );
  }

  const n8nApiKey = process.env.N8N_API_KEY;
  const n8nBaseUrl = process.env.N8N_BASE_URL ?? "https://mindlink2.app.n8n.cloud";

  if (!n8nApiKey) {
    return NextResponse.json({ error: "N8N_API_KEY non configurée" }, { status: 500 });
  }

  const supabase = createServiceSupabase();

  // ── Récupérer les infos client ────────────────────────────────────────────
  const { data: clientRow, error: clientErr } = await supabase
    .from("clients")
    .select("id, company_name, quota, n8n_workflow_id")
    .eq("id", org_id)
    .single();

  if (clientErr || !clientRow) {
    return NextResponse.json({ error: "Client introuvable" }, { status: 404 });
  }

  // ── Récupérer le compte Unipile du client ─────────────────────────────────
  const { data: unipileRow } = await supabase
    .from("unipile_accounts")
    .select("unipile_account_id")
    .eq("client_id", org_id)
    .maybeSingle();

  const unipileAccountId = (unipileRow?.unipile_account_id as string | null) ?? "";
  if (!unipileAccountId) {
    console.warn(`[create-workflow] No unipile_account_id found for org_id=${org_id}`);
  }

  const clientName = (clientRow.company_name as string | null) || `Client ${org_id}`;
  const companyName = (clientRow.company_name as string | null) ?? "";
  const quotaPerDay = Number(clientRow.quota) || 10;
  const startDate = getTomorrowDate();
  const existingWorkflowId = (clientRow.n8n_workflow_id as string | null) ?? null;

  let workflowId: string;
  let updated = false;

  // ── Workflow existant ? Tenter une mise à jour ────────────────────────────
  if (existingWorkflowId) {
    console.log(`[create-workflow] Existing workflow detected: ${existingWorkflowId}`);

    // GET le workflow actuel depuis n8n
    let existingWorkflow: Record<string, unknown> | null = null;
    try {
      const getRes = await fetch(`${n8nBaseUrl}/api/v1/workflows/${existingWorkflowId}`, {
        headers: { "X-N8N-API-KEY": n8nApiKey },
      });

      if (getRes.status === 404) {
        console.warn(`[create-workflow] Workflow ${existingWorkflowId} not found in n8n — will create new`);
      } else if (!getRes.ok) {
        const errText = await getRes.text().catch(() => "");
        console.error(`[create-workflow] GET workflow failed ${getRes.status}: ${errText.slice(0, 200)}`);
      } else {
        existingWorkflow = (await getRes.json()) as Record<string, unknown>;
      }
    } catch (err) {
      console.error("[create-workflow] GET workflow error:", err);
    }

    // Si le workflow existe, mettre à jour tab_name + startDate
    if (existingWorkflow) {
      const nodes = existingWorkflow.nodes as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(nodes)) {
        return NextResponse.json(
          { error: "Format de workflow inattendu (nodes manquants)." },
          { status: 500 }
        );
      }

      let sheetUpdated = false;
      let dateUpdated = false;

      for (const node of nodes) {
        // Mettre à jour le Google Sheet ID + tab name dans "Get row(s) in sheet"
        if (node.id === "read-sheet" || node.name === "Get row(s) in sheet") {
          const params = node.parameters as Record<string, unknown> | undefined;
          if (params) {
            const docId = params.documentId as Record<string, unknown> | undefined;
            if (docId) {
              docId.value = google_sheet_id;
              sheetUpdated = true;
            }
            const sheetName = params.sheetName as Record<string, unknown> | undefined;
            if (sheetName) {
              sheetName.value = tab_name;
            }
          }
        }

        // Mettre à jour la startDate dans le jsCode "Leads/jour"
        if (node.id === "slice-per-day" || node.name === "Leads/jour") {
          const params = node.parameters as Record<string, unknown> | undefined;
          if (params && typeof params.jsCode === "string") {
            const updatedCode = params.jsCode.replace(
              /new Date\('[0-9]{4}-[0-9]{2}-[0-9]{2}'\)/,
              `new Date('${startDate}')`
            );
            if (updatedCode !== params.jsCode) {
              params.jsCode = updatedCode;
              dateUpdated = true;
            }
          }
        }
      }

      console.log(
        `[create-workflow] Update: sheetUpdated=${sheetUpdated} dateUpdated=${dateUpdated}`
      );

      // PUT le workflow mis à jour
      try {
        const putRes = await fetch(`${n8nBaseUrl}/api/v1/workflows/${existingWorkflowId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-N8N-API-KEY": n8nApiKey,
          },
          body: JSON.stringify(existingWorkflow),
        });

        if (!putRes.ok) {
          const errText = await putRes.text().catch(() => "");
          throw new Error(`n8n PUT ${putRes.status}: ${errText.slice(0, 300)}`);
        }

        console.log(`[create-workflow] Workflow ${existingWorkflowId} updated successfully`);
        workflowId = existingWorkflowId;
        updated = true;
      } catch (err) {
        console.error("[create-workflow] PUT error:", err);
        return NextResponse.json(
          { error: "Impossible de mettre à jour le workflow n8n." },
          { status: 502 }
        );
      }
    }
  }

  // ── Pas de workflow existant (ou supprimé) → créer un nouveau ─────────────
  if (!updated) {
    if (!prompt_systeme) {
      return NextResponse.json(
        { error: "prompt_systeme est requis pour créer un nouveau workflow." },
        { status: 400 }
      );
    }

    try {
      const workflowPayload = buildWorkflowJson({
        clientName,
        companyName,
        quotaPerDay,
        startDate,
        googleSheetId: google_sheet_id,
        tabName: tab_name,
        clientId: clientRow.id as number,
        unipileAccountId,
        promptSystems: prompt_systeme,
      });

      const workflowRes = await fetch(`${n8nBaseUrl}/api/v1/workflows`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-N8N-API-KEY": n8nApiKey,
        },
        body: JSON.stringify(workflowPayload),
      });

      if (!workflowRes.ok) {
        const errText = await workflowRes.text().catch(() => "");
        throw new Error(
          `n8n workflow creation failed ${workflowRes.status}: ${errText.slice(0, 300)}`
        );
      }

      const workflowData = await workflowRes.json();
      workflowId = workflowData.id as string;
      console.log(`[create-workflow] Workflow created: ${workflowId}`);
    } catch (err) {
      console.error("[create-workflow] workflow error:", err);
      return NextResponse.json(
        { error: "Impossible de créer le workflow n8n." },
        { status: 502 }
      );
    }

    // Activer le nouveau workflow
    try {
      const activateRes = await fetch(`${n8nBaseUrl}/api/v1/workflows/${workflowId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-N8N-API-KEY": n8nApiKey,
        },
        body: JSON.stringify({ active: true }),
      });

      if (!activateRes.ok) {
        const errText = await activateRes.text().catch(() => "");
        console.warn(
          `[create-workflow] activation failed ${activateRes.status}: ${errText.slice(0, 200)}`
        );
      } else {
        console.log(`[create-workflow] Workflow ${workflowId} activated`);
      }
    } catch (err) {
      console.warn("[create-workflow] activation error (non-blocking):", err);
    }

    // Sauvegarder le nouveau workflow_id
    const { error: clientUpdateErr } = await supabase
      .from("clients")
      .update({
        n8n_workflow_id: workflowId,
        n8n_folder_id: null,
      })
      .eq("id", org_id);

    if (clientUpdateErr) {
      console.warn("[create-workflow] could not save n8n IDs to clients:", clientUpdateErr.message);
    }
  }

  if (extraction_log_id) {
    const { error: logUpdateErr } = await supabase
      .from("extraction_logs")
      .update({
        workflow_id: workflowId,
        folder_id: null,
      })
      .eq("id", extraction_log_id);

    if (logUpdateErr) {
      console.warn("[create-workflow] could not save workflow_id to extraction_logs:", logUpdateErr.message);
    }
  }

  const workflowUrl = `${n8nBaseUrl}/workflow/${workflowId}`;

  return NextResponse.json({
    workflow_id: workflowId,
    workflow_url: workflowUrl,
    updated,
  });
}
