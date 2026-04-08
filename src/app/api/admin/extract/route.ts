import { NextResponse } from "next/server";
import { getSupportAdminContext } from "@/lib/support-admin-auth";
import { createServiceSupabase } from "@/lib/inbox-server";

export const runtime = "nodejs";
export const maxDuration = 300; // Vercel Pro: jusqu'à 300s pour les extractions longues

type ApolloPersonRaw = Record<string, unknown>;

interface ExtractRequestBody {
  org_id: number;
  quota: number;
}

// ── Helpers Apollo ────────────────────────────────────────────────────────────

function buildApolloPayload(
  filters: Record<string, unknown>,
  page: number
): Record<string, unknown> {
  const payload: Record<string, unknown> = { page, per_page: 100 };

  if (arr(filters.person_titles)) payload.person_titles = filters.person_titles;
  if (arr(filters.person_not_titles)) payload.person_not_titles = filters.person_not_titles;
  if (arr(filters.person_seniorities)) payload.person_seniorities = filters.person_seniorities;
  if (arr(filters.person_departments)) payload.person_departments = filters.person_departments;
  if (arr(filters.person_locations)) payload.person_locations = filters.person_locations;
  if (str(filters.q_keywords)) payload.q_keywords = filters.q_keywords;
  if (arr(filters.organization_industry_tag_ids))
    payload.organization_industry_tag_ids = filters.organization_industry_tag_ids;
  if (arr(filters.organization_num_employees_ranges))
    payload.organization_num_employees_ranges = filters.organization_num_employees_ranges;
  if (arr(filters.organization_locations))
    payload.organization_locations = filters.organization_locations;
  if (arr(filters.organization_not_locations))
    payload.organization_not_locations = filters.organization_not_locations;
  if (arr(filters.currently_using_any_of_technology_uids))
    payload.currently_using_any_of_technology_uids =
      filters.currently_using_any_of_technology_uids;
  if (filters.revenue_range && typeof filters.revenue_range === "object") {
    const rr = filters.revenue_range as Record<string, unknown>;
    if (rr.min !== undefined || rr.max !== undefined) {
      payload.revenue_range = { min: rr.min ?? null, max: rr.max ?? null };
    }
  }

  return payload;
}

async function apolloFetchPage(
  filters: Record<string, unknown>,
  page: number,
  apiKey: string
): Promise<{ people: ApolloPersonRaw[]; total: number }> {
  const res = await fetch("https://api.apollo.io/api/v1/mixed_people/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify(buildApolloPayload(filters, page)),
  });

  if (!res.ok) {
    throw new Error(`Apollo HTTP ${res.status}`);
  }

  const data = await res.json();
  const people = Array.isArray(data.people)
    ? (data.people as ApolloPersonRaw[])
    : [];
  const total: number =
    typeof data.pagination?.total_entries === "number"
      ? data.pagination.total_entries
      : people.length;

  return { people, total };
}

// ── Helpers Google Sheets ─────────────────────────────────────────────────────

function getGoogleCredentials(): {
  client_email: string;
  private_key: string;
} {
  const raw = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY non défini");
  const parsed = JSON.parse(raw) as { client_email: string; private_key: string };
  return parsed;
}

async function getGoogleAccessToken(
  clientEmail: string,
  privateKey: string
): Promise<string> {
  // JWT pour Service Account Google
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const encode = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");

  const signingInput = `${encode(header)}.${encode(claim)}`;

  // Signer avec la clé privée RSA
  const { createSign } = await import("crypto");
  const sign = createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = sign.sign(privateKey, "base64url");

  const jwt = `${signingInput}.${signature}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text().catch(() => "");
    throw new Error(`Google OAuth error: ${err}`);
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token as string;
}

async function createSpreadsheet(
  accessToken: string,
  title: string
): Promise<{ spreadsheetId: string; url: string }> {
  const res = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [
        {
          properties: { title: "Leads" },
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Sheets create error: ${err}`);
  }

  const data = await res.json();
  const spreadsheetId = data.spreadsheetId as string;
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
  return { spreadsheetId, url };
}

async function writeSheetData(
  accessToken: string,
  spreadsheetId: string,
  rows: string[][]
): Promise<void> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Leads!A1:append?valueInputOption=RAW`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: rows }),
    }
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Sheets write error: ${err}`);
  }
}

async function shareSheet(
  accessToken: string,
  spreadsheetId: string,
  email: string
): Promise<void> {
  await fetch(
    `https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        role: "writer",
        type: "user",
        emailAddress: email,
      }),
    }
  );
  // Non bloquant si ça échoue
}

// ── Formater un profil Apollo en ligne de sheet ────────────────────────────────

function formatPersonRow(p: ApolloPersonRaw): string[] {
  const org = p.organization as Record<string, unknown> | null ?? {};
  const getStr = (v: unknown) => (typeof v === "string" ? v : String(v ?? ""));
  const numStr = (v: unknown) =>
    typeof v === "number" ? v.toString() : "";

  return [
    getStr(p.first_name),
    getStr(p.last_name),
    getStr(p.title),
    getStr(org.name),
    getStr(org.industry),
    numStr(org.estimated_num_employees),
    [p.city, p.state, p.country].filter(Boolean).map(getStr).join(", "),
    getStr(p.email),
    getStr(p.phone_number ?? p.sanitized_phone),
    getStr(p.linkedin_url),
    getStr(org.primary_domain),
  ];
}

const SHEET_HEADERS = [
  "Prénom",
  "Nom",
  "Titre",
  "Entreprise",
  "Secteur",
  "Taille entreprise",
  "Localisation",
  "Email",
  "Téléphone",
  "LinkedIn URL",
  "Domaine",
];

// ── Handler principal ─────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const adminCtx = await getSupportAdminContext();
  if (!adminCtx) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  let body: ExtractRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const { org_id, quota } = body;
  if (!org_id || !quota || quota < 1) {
    return NextResponse.json({ error: "org_id et quota requis" }, { status: 400 });
  }

  const supabase = createServiceSupabase();

  // Récupérer les infos client (nom, prénom, entreprise)
  const { data: clientRow, error: clientErr } = await supabase
    .from("clients")
    .select("id, email, first_name, last_name, company_name")
    .eq("id", org_id)
    .single();

  if (clientErr || !clientRow) {
    return NextResponse.json({ error: "Client introuvable" }, { status: 404 });
  }

  // Récupérer la config ICP validée
  const { data: icpConfig, error: icpErr } = await supabase
    .from("icp_configs")
    .select("id, filters, status")
    .eq("org_id", org_id)
    .in("status", ["submitted", "reviewed", "active"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (icpErr || !icpConfig) {
    return NextResponse.json(
      { error: "Aucun ICP validé trouvé pour ce client." },
      { status: 404 }
    );
  }

  const apolloKey = process.env.APOLLO_API_KEY;
  if (!apolloKey) {
    return NextResponse.json({ error: "Clé Apollo non configurée" }, { status: 500 });
  }

  // Créer le log d'extraction avec statut "running"
  const { data: extractionLog, error: logErr } = await supabase
    .from("extraction_logs")
    .insert({
      org_id,
      icp_config_id: icpConfig.id,
      status: "running",
      leads_count: 0,
    })
    .select("id")
    .single();

  if (logErr || !extractionLog) {
    return NextResponse.json({ error: "Impossible de créer le log d'extraction" }, { status: 500 });
  }
  const logId: string = extractionLog.id;

  const filters = (icpConfig.filters ?? {}) as Record<string, unknown>;

  // ── Extraction Apollo par pages ────────────────────────────────────────────
  const allPeople: ApolloPersonRaw[] = [];
  let page = 1;

  try {
    while (allPeople.length < quota) {
      const { people, total } = await apolloFetchPage(filters, page, apolloKey);
      if (people.length === 0) break;
      allPeople.push(...people);
      if (allPeople.length >= total) break;
      page++;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase
      .from("extraction_logs")
      .update({ status: "failed", error_message: msg, completed_at: new Date().toISOString() })
      .eq("id", logId);
    return NextResponse.json({ error: `Erreur Apollo: ${msg}` }, { status: 502 });
  }

  const finalPeople = allPeople.slice(0, quota);

  // ── Créer le Google Sheet ──────────────────────────────────────────────────
  let spreadsheetId: string;
  let sheetUrl: string;

  try {
    const creds = getGoogleCredentials();
    const token = await getGoogleAccessToken(creds.client_email, creds.private_key);

    const firstName = (clientRow as Record<string, unknown>).first_name as string | null;
    const lastName = (clientRow as Record<string, unknown>).last_name as string | null;
    const company = (clientRow as Record<string, unknown>).company_name as string | null;
    const email = clientRow.email as string | null;

    const sheetTitle = [
      firstName && lastName
        ? `${firstName} ${lastName}`
        : email ?? `Client ${org_id}`,
      company,
    ]
      .filter(Boolean)
      .join(" — ");

    const created = await createSpreadsheet(token, sheetTitle);
    spreadsheetId = created.spreadsheetId;
    sheetUrl = created.url;

    // Écrire les données
    const rows = [
      SHEET_HEADERS,
      ...finalPeople.map(formatPersonRow),
    ];
    await writeSheetData(token, spreadsheetId, rows);

    // Partager avec l'adresse Lidmeo
    await shareSheet(token, spreadsheetId, "contact@lidmeo.com");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase
      .from("extraction_logs")
      .update({ status: "failed", error_message: msg, completed_at: new Date().toISOString() })
      .eq("id", logId);
    return NextResponse.json({ error: `Erreur Google Sheets: ${msg}` }, { status: 502 });
  }

  // ── Mettre à jour le log d'extraction ─────────────────────────────────────
  await supabase
    .from("extraction_logs")
    .update({
      status: "completed",
      leads_count: finalPeople.length,
      google_sheet_url: sheetUrl,
      google_sheet_id: spreadsheetId,
      completed_at: new Date().toISOString(),
    })
    .eq("id", logId);

  return NextResponse.json({
    success: true,
    leads_count: finalPeople.length,
    google_sheet_url: sheetUrl,
    google_sheet_id: spreadsheetId,
    extraction_log_id: logId,
  });
}

function arr(v: unknown): v is unknown[] {
  return Array.isArray(v) && v.length > 0;
}

function str(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
