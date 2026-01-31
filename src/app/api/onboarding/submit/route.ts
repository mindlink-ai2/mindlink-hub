import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";

export const runtime = "nodejs"; // important (fetch externes + email)

type Payload = {
  submitted_at: string; // auto
  full_name: string;
  email: string; // forcé depuis Clerk
  phone: string;
  company: string;
  target_company_type: string;
  target_industry: string;
  target_geo_france: string;

  // ✅ checkbox values (ex: ["1-10", "101-200"])
  target_company_size: string[];

  target_personas_titles: string;
  ideal_targets: string;
  value_promise: string;
};

function safeStr(v: unknown, max = 4000) {
  return String(v ?? "").slice(0, max).trim();
}

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseCompanySizes(v: unknown): string[] {
  // Accept:
  // - array ["1-10", "11-20"]
  // - string "1-10" (fallback)
  // - string "1-10, 11-20" or "1-10\n11-20" (fallback)
  if (Array.isArray(v)) {
    return v
      .map((x) => safeStr(x, 40))
      .filter(Boolean);
  }

  const s = safeStr(v, 500);
  if (!s) return [];

  // if someone sends comma/newline separated
  if (s.includes(",") || s.includes("\n") || s.includes(";")) {
    return s
      .split(/[\n,;]+/)
      .map((x) => safeStr(x, 40))
      .filter(Boolean);
  }

  // single value
  return [s];
}

function missingFieldError(field: string) {
  return NextResponse.json({ error: `Champ manquant : ${field}` }, { status: 400 });
}

export async function POST(req: Request) {
  try {
    // 1) Auth obligatoire
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
    }

    // 2) User Clerk (source of truth)
    const user = await currentUser();
    const clerkEmail =
      user?.primaryEmailAddress?.emailAddress ||
      user?.emailAddresses?.[0]?.emailAddress ||
      "";

    const clerkName =
      (user?.firstName || user?.lastName)
        ? [user?.firstName, user?.lastName].filter(Boolean).join(" ")
        : (user?.fullName || "");

    if (!clerkEmail || !isEmail(clerkEmail)) {
      return NextResponse.json({ error: "Email du compte invalide." }, { status: 400 });
    }

    // 3) Body
    const raw = (await req.json()) as Partial<Record<keyof Payload, unknown>>;

    // 4) Payload final (email forcé)
    const payload: Payload = {
      submitted_at: new Date().toISOString(),
      full_name: safeStr(raw.full_name, 200) || safeStr(clerkName, 200),
      email: clerkEmail, // 🔒 forcé

      phone: safeStr(raw.phone, 60),
      company: safeStr(raw.company, 200),

      target_company_type: safeStr(raw.target_company_type, 500),
      target_industry: safeStr(raw.target_industry, 500),
      target_geo_france: safeStr(raw.target_geo_france, 500),

      // ✅ array (checkboxes)
      target_company_size: parseCompanySizes(raw.target_company_size),

      target_personas_titles: safeStr(raw.target_personas_titles, 500),
      ideal_targets: safeStr(raw.ideal_targets, 4000),
      value_promise: safeStr(raw.value_promise, 4000),
    };

    // 5) Validation minimale
    // (On valide les strings + le cas spécial target_company_size)
    const requiredStringFields: (keyof Omit<Payload, "target_company_size">)[] = [
      "full_name",
      "email",
      "phone",
      "company",
      "target_company_type",
      "target_industry",
      "target_geo_france",
      "target_personas_titles",
      "ideal_targets",
      "value_promise",
      // submitted_at est auto mais on peut le laisser hors check
    ];

    for (const f of requiredStringFields) {
      const val = payload[f];
      if (!val) return missingFieldError(String(f));
    }

    if (!payload.target_company_size.length) {
      return missingFieldError("target_company_size");
    }

    // 6) Envoi vers n8n
    const n8nUrl = process.env.N8N_WEBHOOK_URL;
    if (!n8nUrl) {
      return NextResponse.json({ error: "N8N_WEBHOOK_URL manquant." }, { status: 500 });
    }

    const n8nBody = {
      ...payload,
      source: "hub_onboarding",
      user_id: userId,
    };

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.N8N_WEBHOOK_SECRET) {
      headers["x-webhook-secret"] = process.env.N8N_WEBHOOK_SECRET;
    }

    const n8nRes = await fetch(n8nUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(n8nBody),
    });

    if (!n8nRes.ok) {
      const txt = await n8nRes.text().catch(() => "");
      return NextResponse.json(
        { error: "Erreur n8n (webhook).", details: txt.slice(0, 1200) },
        { status: 502 }
      );
    }

    // 7) Email récap interne (Resend)
    await sendNotifyEmail(n8nBody);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Erreur serveur.", details: String(e?.message || e) },
      { status: 500 }
    );
  }
}

async function sendNotifyEmail(data: any) {
  const to = process.env.ONBOARDING_NOTIFY_EMAIL || "contact@lidmeo.com";

  // Si Resend n’est pas configuré, on ne bloque pas
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) return;

  const sizes = Array.isArray(data.target_company_size)
    ? data.target_company_size.join(", ")
    : String(data.target_company_size || "");

  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system; line-height:1.5">
      <h2>Nouvel onboarding Lidmeo</h2>

      <p><b>Entreprise :</b> ${escapeHtml(data.company || "")}</p>
      <p><b>Nom :</b> ${escapeHtml(data.full_name || "")}</p>
      <p><b>Email (compte) :</b> ${escapeHtml(data.email || "")}</p>
      <p><b>Téléphone :</b> ${escapeHtml(data.phone || "")}</p>

      <p><b>Taille entreprise recherchée :</b> ${escapeHtml(sizes)}</p>

      <hr/>
      <pre style="font-family: ui-monospace, SFMono-Regular; white-space: pre-wrap; background:#f6f6f6; padding:12px; border-radius:10px;">
${escapeHtml(JSON.stringify(data, null, 2))}
      </pre>
    </div>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM,
      to: [to],
      subject: `Onboarding — ${data.company || "Nouveau client"}`,
      html,
      reply_to: "contact@lidmeo.com",
    }),
  });

  // Ne pas throw : n8n a déjà été déclenché
  if (!res.ok) return;
}