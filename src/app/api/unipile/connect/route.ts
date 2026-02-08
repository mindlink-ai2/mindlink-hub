import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function normalizeUnipileBase(dsn: string) {
  // 1) retire les / finaux
  // 2) si quelqu’un met /api/v1/... par erreur, on coupe à la base
  return dsn.replace(/\/+$/, "").replace(/\/api\/v1\/.*$/, "");
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const supabase = createClient(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY")
    );

    // ✅ Source de vérité : retrouver le client lié à ce user Clerk
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id")
      .eq("clerk_user_id", userId)
      .single();

    if (clientErr || !client) {
      return NextResponse.json({ error: "client_not_found" }, { status: 404 });
    }

    const UNIPILE_DSN = requireEnv("UNIPILE_DSN");
    const UNIPILE_API_KEY = requireEnv("UNIPILE_API_KEY");
    const success_redirect_url = requireEnv("UNIPILE_SUCCESS_REDIRECT_URL");
    const failure_redirect_url = requireEnv("UNIPILE_FAILURE_REDIRECT_URL");
    const notify_url = requireEnv("UNIPILE_NOTIFY_URL");

    const BASE = normalizeUnipileBase(UNIPILE_DSN);

    // ✅ DEBUG (à appeler avec ?debug=1)
    const debug = new URL(req.url).searchParams.get("debug") === "1";
    if (debug) {
      return NextResponse.json({
        ok: true,
        clerkUserId: userId,
        clientId: client.id,
        env: {
          NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
          UNIPILE_DSN: process.env.UNIPILE_DSN,
          UNIPILE_BASE_USED: BASE,
          UNIPILE_API_KEY: !!process.env.UNIPILE_API_KEY,
          UNIPILE_SUCCESS_REDIRECT_URL: process.env.UNIPILE_SUCCESS_REDIRECT_URL,
          UNIPILE_FAILURE_REDIRECT_URL: process.env.UNIPILE_FAILURE_REDIRECT_URL,
          UNIPILE_NOTIFY_URL: process.env.UNIPILE_NOTIFY_URL,
        },
      });
    }

    // ✅ Unipile Hosted Auth Wizard (body simplifié + auth Bearer)
    const res = await fetch(`${BASE}/api/v1/hosted/accounts/link`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UNIPILE_API_KEY}`,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        provider: "LINKEDIN",
        success_redirect_url,
        failure_redirect_url,
        notify_url,
        // ✅ Unipile renverra ce "name" dans le notify webhook -> mapping client_id
        name: client.id,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("UNIPILE_CONNECT_UNIPILE_ERROR:", res.status, text);
      return NextResponse.json(
        { error: "unipile_error", status: res.status, details: text, base: BASE },
        { status: 500 }
      );
    }

    const json = await res.json();
    const url = json?.url;

    if (!url) {
      console.error("UNIPILE_CONNECT_MISSING_URL:", json);
      return NextResponse.json(
        { error: "unipile_missing_url", raw: json },
        { status: 500 }
      );
    }

    return NextResponse.json({ url });
  } catch (e: any) {
    console.error("UNIPILE_CONNECT_ERROR:", e);
    return NextResponse.json(
      { error: "server_error", details: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}