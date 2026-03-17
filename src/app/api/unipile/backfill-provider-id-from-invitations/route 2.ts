import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/inbox-server";
import {
  backfillLeadLinkedinUrlNormalized,
  backfillProviderIdsFromInvitations,
} from "@/lib/unipile-relation-provider";

function asInt(value: unknown, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.trunc(num);
}

export async function POST(req: Request) {
  try {
    const expectedSecret = process.env.UNIPILE_PROVIDER_BACKFILL_SECRET;
    const providedSecret =
      req.headers.get("x-backfill-secret") ??
      new URL(req.url).searchParams.get("secret");

    if (!expectedSecret || providedSecret !== expectedSecret) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(asInt(body?.limit, 200), 500));
    const cursor = Math.max(0, asInt(body?.cursor, 0));
    const days = Math.max(1, Math.min(asInt(body?.days, 30), 365));
    const clientId = body?.clientId ? String(body.clientId) : null;
    const normalizeUrls = Boolean(body?.normalizeUrls);
    const normalizeLimit = Math.max(1, Math.min(asInt(body?.normalizeLimit, 200), 500));
    const normalizeCursor = Math.max(0, asInt(body?.normalizeCursor, 0));

    const supabase = createServiceSupabase();
    let normalizedResult: Awaited<ReturnType<typeof backfillLeadLinkedinUrlNormalized>> | null = null;

    if (normalizeUrls) {
      normalizedResult = await backfillLeadLinkedinUrlNormalized({
        supabase,
        limit: normalizeLimit,
        cursor: normalizeCursor,
        clientId,
      });
    }

    const providerResult = await backfillProviderIdsFromInvitations({
      supabase,
      limit,
      cursor,
      days,
      clientId,
    });

    console.log("UNIPILE_PROVIDER_BACKFILL_DONE", {
      limit,
      cursor,
      days,
      client_id: clientId,
      normalize_urls: normalizeUrls,
      provider_result: providerResult,
      normalization_result: normalizedResult,
    });

    return NextResponse.json({
      ok: true,
      providerBackfill: providerResult,
      urlNormalizationBackfill: normalizedResult,
    });
  } catch (error: unknown) {
    console.error("UNIPILE_PROVIDER_BACKFILL_ERROR", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
