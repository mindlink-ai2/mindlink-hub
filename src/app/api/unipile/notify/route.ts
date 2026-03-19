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

    // Upsert client_linkedin_settings so the row always exists after Unipile connection.
    // Quota comes from clients.quota (source of truth); enabled = true only for full+active.
    if (provider === "linkedin") {
      const { data: clientRow } = await supabase
        .from("clients")
        .select("plan, subscription_status, quota")
        .eq("id", clientId)
        .maybeSingle();

      if (clientRow) {
        const isFullActive =
          String(clientRow.plan ?? "").toLowerCase() === "full" &&
          String(clientRow.subscription_status ?? "").toLowerCase() === "active";

        const rawQuota = Number(clientRow.quota);
        const dailyQuota = Number.isFinite(rawQuota) && rawQuota >= 1 ? Math.trunc(rawQuota) : 10;

        await supabase
          .from("client_linkedin_settings")
          .upsert(
            {
              client_id: clientId,
              unipile_account_id: unipileAccountId,
              enabled: isFullActive,
              daily_invite_quota: dailyQuota,
              timezone: "Europe/Paris",
              start_time: "08:00",
              end_time: "18:00",
            },
            { onConflict: "client_id" }
          );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: "server_error", details: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}