import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/inbox-server";
import { debugFindLatestNewRelationForLead } from "@/lib/unipile-relation-provider";

function asInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
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
    const linkedinUrl = String(body?.linkedinUrl ?? body?.linkedin_url ?? "").trim();
    if (!linkedinUrl) {
      return NextResponse.json({ ok: false, error: "linkedin_url_required" }, { status: 400 });
    }

    const limit = Math.max(1, Math.min(asInt(body?.limit, 10), 50));
    const supabase = createServiceSupabase();

    const result = await debugFindLatestNewRelationForLead({
      supabase,
      linkedinUrl,
      limit,
    });

    return NextResponse.json({
      ok: true,
      query: { linkedinUrl, limit },
      result,
    });
  } catch (error: unknown) {
    console.error("UNIPILE_DEBUG_NEW_RELATION_FOR_LEAD_ERROR", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
