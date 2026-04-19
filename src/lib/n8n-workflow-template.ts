import "server-only";

function jsonEscape(s: string): string {
  return JSON.stringify(s).slice(1, -1);
}

export function getTomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

export function buildWorkflowJson(params: {
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
          sheetName: { __rl: true, value: "{{TAB_NAME}}", mode: "name" },
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
            "      firstname: data['First Name'] || '',\n" +
            "      lastname: data['Last Name'] || '',\n" +
            "      company: data['Company Name'] || '',\n" +
            "      linkedin_profile: data['Person Linkedin Url'] || '',\n" +
            "      location: [data['City'], data['State'], data['Country']].filter(Boolean).join(', ') || '',\n" +
            "      linkedin_message_propose: '',\n" +
            "      relance_linkedin: '',\n" +
            "      message_mail: '',\n" +
            "      resume_profil: '',\n" +
            "      linkedinHeadline: '',\n" +
            "      linkedinJobTitle: data['Title'] || '',\n" +
            "      companyIndustry: data['Industry'] || '',\n" +
            "      linkedinDescription: '',\n" +
            "      linkedinSkillsLabel: data['Keywords'] || data['Technologies'] || '',\n" +
            "      email: data['Email'] || '',\n" +
            "      phone: data['Work Direct Phone'] || data['Mobile Phone'] || data['Corporate Phone'] || '',\n" +
            "      website: data['Website'] || ''\n" +
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
          options: { systemMessage: "{{PROMPT_SYSTEME}}" },
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
              { id: "field-firstname", name: "firstname", value: "={{ $('Get row(s) in sheet').item.json['First Name'] }}", type: "string" },
              { id: "field-lastname", name: "lastname", value: "={{ $('Get row(s) in sheet').item.json['Last Name'] }}", type: "string" },
              { id: "field-company", name: "company", value: "={{ $('Get row(s) in sheet').item.json['Company Name'] }}", type: "string" },
              { id: "field-linkedin_profile", name: "linkedin_profile", value: "={{ $('Get row(s) in sheet').item.json['Person Linkedin Url'] ?? '' }}", type: "string" },
              { id: "field-location", name: "location", value: "={{ [$('Get row(s) in sheet').item.json['City'], $('Get row(s) in sheet').item.json['State'], $('Get row(s) in sheet').item.json['Country']].filter(Boolean).join(', ') }}", type: "string" },
              { id: "field-linkedinHeadline", name: "linkedinHeadline", value: "={{ $json.output?.linkedinHeadline ?? '' }}", type: "string" },
              { id: "field-linkedinJobTitle", name: "linkedinJobTitle", value: "={{ $json.output?.linkedinJobTitle ?? $('Get row(s) in sheet').item.json['Title'] ?? '' }}", type: "string" },
              { id: "field-companyIndustry", name: "companyIndustry", value: "={{ $json.output?.companyIndustry ?? $('Get row(s) in sheet').item.json['Industry'] ?? '' }}", type: "string" },
              { id: "field-linkedinDescription", name: "linkedinDescription", value: "={{ $json.output?.linkedinDescription ?? '' }}", type: "string" },
              { id: "field-linkedinSkillsLabel", name: "linkedinSkillsLabel", value: "={{ $json.output?.linkedinSkillsLabel ?? $('Get row(s) in sheet').item.json['Keywords'] ?? '' }}", type: "string" },
              { id: "field-email", name: "email", value: "={{ $('Get row(s) in sheet').item.json['Email'] || $('Get row(s) in sheet').item.json['Work Email'] || '' }}", type: "string" },
              { id: "field-phone", name: "phone", value: "={{ $('Get row(s) in sheet').item.json['Work Direct Phone'] || $('Get row(s) in sheet').item.json['Mobile Phone'] || $('Get row(s) in sheet').item.json['Corporate Phone'] || '' }}", type: "string" },
              { id: "field-internal_message", name: "internal_message", value: "={{ $json.output?.internal_message ?? '' }}", type: "string" },
              { id: "field-message_mail", name: "message_mail", value: "={{ $json.output?.message_mail ?? '' }}", type: "string" },
              { id: "field-website", name: "website", value: "={{ $('Get row(s) in sheet').item.json['Website'] ?? '' }}", type: "string" },
              { id: "field-relance_linkedin", name: "relance_linkedin", value: "={{ $json.output?.relance_linkedin ?? '' }}", type: "string" },
              { id: "field-resume_profil", name: "resume_profil", value: "={{ $json.output?.resume_profil ?? '' }}", type: "string" },
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
              { name: "X-API-KEY", value: "iyWBHK7l.RPPbGgYhwkWWPikxHEftEK5gG1mN/f/FNKoMOB0lODc=" },
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
              { name: "X-API-KEY", value: "iyWBHK7l.RPPbGgYhwkWWPikxHEftEK5gG1mN/f/FNKoMOB0lODc=" },
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
      "Leads/jour": { main: [[{ node: "Get LinkedIn Profile", type: "main", index: 0 }]] },
      "Cron (07:00)": { main: [[{ node: "Get row(s) in sheet", type: "main", index: 0 }]] },
      "Loop Over Items": { main: [[], [{ node: "Wait", type: "main", index: 0 }]] },
      Wait: { main: [[{ node: "naming pour supabase", type: "main", index: 0 }]] },
      "Get row(s) in sheet": { main: [[{ node: "Leads/jour", type: "main", index: 0 }]] },
      "naming pour supabase": { main: [[{ node: "préparation envoi supabase", type: "main", index: 0 }]] },
      "préparation envoi supabase": { main: [[{ node: "Ajout Supabase", type: "main", index: 0 }]] },
      "Enrichissement IA": { main: [[{ node: "format des données", type: "main", index: 0 }]] },
      "OpenAI Chat Model": { ai_languageModel: [[{ node: "Enrichissement IA", type: "ai_languageModel", index: 0 }]] },
      "Structured Output Parser": { ai_outputParser: [[{ node: "Enrichissement IA", type: "ai_outputParser", index: 0 }]] },
      "format des données": { main: [[{ node: "Loop Over Items", type: "main", index: 0 }]] },
      "Get LinkedIn Profile": { main: [[{ node: "Loop Unipile", type: "main", index: 0 }]] },
      "Get LinkedIn Posts": { main: [[{ node: "Loop Unipile", type: "main", index: 0 }]] },
      "Loop Unipile": {
        main: [
          [{ node: "Merge Posts", type: "main", index: 0 }],
          [{ node: "Get LinkedIn Posts", type: "main", index: 0 }],
        ],
      },
      "Merge Posts": { main: [[{ node: "Enrichissement IA", type: "main", index: 0 }]] },
    },
    settings: { executionOrder: "v1" },
  };
}
