import { NextResponse } from "next/server";

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function normalizeUnipileBase(dsn: string) {
  return dsn.replace(/\/+$/, "").replace(/\/api\/v1\/.*$/, "");
}

export async function GET() {
  try {
    const UNIPILE_DSN = requireEnv("UNIPILE_DSN");
    const UNIPILE_API_KEY = requireEnv("UNIPILE_API_KEY");
    const BASE = normalizeUnipileBase(UNIPILE_DSN);

    const res = await fetch(`${BASE}/api/v1/accounts`, {
      method: "GET",
      headers: {
        "X-API-KEY": UNIPILE_API_KEY,
        accept: "application/json",
      },
    });

    const text = await res.text().catch(() => "");
    return NextResponse.json(
      { status: res.status, ok: res.ok, base: BASE, raw: text },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: "server_error", details: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}