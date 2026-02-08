import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");
    if (!secret || secret !== requireEnv("UNIPILE_NOTIFY_SECRET")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const payload = await req.json();

    /**
     * Hosted Auth notify payload contient typiquement:
     * - account_id (ou id)
     * - provider ("LINKEDIN")
     * - status
     * - name (celui que tu as envoyé: client.id)
     * Les champs exacts peuvent varier selon version -> on gère plusieurs clés.
     */
    const clientId = payload?.name;
    const unipileAccountId =
      payload?.account_id ?? payload?.accountId ?? payload?.id ?? payload?.account?.id;
    const providerRaw = payload?.provider ?? payload?.account?.provider ?? "LINKEDIN";
    const statusRaw = payload?.status ?? payload?.account?.status ?? "connected";

    if (!clientId || !unipileAccountId) {
      return NextResponse.json(
        { error: "bad_payload", received: payload },
        { status: 400 }
      );
    }

    const provider = String(providerRaw).toLowerCase(); // "linkedin"
    // normaliser statut
    const status =
      String(statusRaw).toLowerCase() === "credentials"
        ? "action_required"
        : String(statusRaw).toLowerCase();

    const supabase = createClient(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY")
    );

    // UPSERT par unipile_account_id (mets un index/unique côté DB si possible)
    const { error: upsertErr } = await supabase
      .from("unipile_accounts")
      .upsert(
        {
          client_id: clientId,
          provider,
          unipile_account_id: unipileAccountId,
          status,
          connected_at: new Date().toISOString(),
          last_sync_at: new Date().toISOString(),
          meta: payload,
        },
        { onConflict: "unipile_account_id" }
      );

    if (upsertErr) {
      return NextResponse.json(
        { error: "db_upsert_failed", details: upsertErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: "server_error", details: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}