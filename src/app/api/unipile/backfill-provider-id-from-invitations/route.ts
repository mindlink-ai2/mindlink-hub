import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/inbox-server";
import {
  getUnipileRelationEventName,
  syncLeadProviderFromRelationPayload,
  type ProviderSyncResultCode,
} from "@/lib/unipile-relation-provider";

type InvitationRow = {
  id: number | string;
  client_id: number | string | null;
  lead_id: number | string | null;
  unipile_account_id: string | null;
  raw: unknown;
};

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

    const supabase = createServiceSupabase();

    let query = supabase
      .from("linkedin_invitations")
      .select("id, client_id, lead_id, unipile_account_id, raw")
      .order("id", { ascending: true })
      .limit(limit);

    if (cursor > 0) query = query.gt("id", cursor);

    const { data, error } = await query;
    if (error) {
      console.error("UNIPILE_PROVIDER_BACKFILL_FETCH_ERROR", { cursor, limit, error });
      return NextResponse.json({ ok: false, error: "fetch_failed" }, { status: 500 });
    }

    const rows = Array.isArray(data) ? (data as InvitationRow[]) : [];
    const counters: Record<ProviderSyncResultCode, number> = {
      UPDATED: 0,
      ALREADY_PRESENT: 0,
      LEAD_NOT_FOUND: 0,
      CLIENT_NOT_FOUND: 0,
      PROVIDER_ID_MISSING: 0,
      MISMATCH_WARNING: 0,
      LEAD_UPDATE_FAILED: 0,
    };

    let scanned = 0;
    let processedNewRelation = 0;
    let nextCursor = cursor;

    for (const row of rows) {
      scanned += 1;
      const rowId = Number(row.id);
      if (Number.isFinite(rowId)) nextCursor = rowId;

      const eventName = getUnipileRelationEventName(row.raw);
      if (eventName !== "new_relation") continue;
      processedNewRelation += 1;

      const result = await syncLeadProviderFromRelationPayload({
        supabase,
        raw: row.raw,
        eventId: row.id,
        clientId:
          row.client_id === null || row.client_id === undefined
            ? null
            : String(row.client_id),
        unipileAccountId: String(row.unipile_account_id ?? "").trim() || null,
        leadIdHint: row.lead_id,
      });

      counters[result.result] = (counters[result.result] ?? 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      scanned,
      processedNewRelation,
      nextCursor,
      hasMore: rows.length === limit,
      results: counters,
    });
  } catch (error: unknown) {
    console.error("UNIPILE_PROVIDER_BACKFILL_ERROR", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

