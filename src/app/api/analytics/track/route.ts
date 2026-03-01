import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/inbox-server";
import { analyticsTrackRequestSchema } from "@/lib/analytics/schemas";
import {
  extractIp,
  hashIp,
  sanitizeElement,
  sanitizeMetadata,
  sanitizePath,
  withinMetadataLimit,
} from "@/lib/analytics/server-sanitize";
import {
  getAuthenticatedAnalyticsClientContext,
  isAnalyticsEnabled,
} from "@/lib/analytics/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!isAnalyticsEnabled()) {
      return NextResponse.json({ ok: true, disabled: true });
    }

    const context = await getAuthenticatedAnalyticsClientContext();
    if (!context) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const payload = await request.json().catch(() => ({}));
    const parsedBody = analyticsTrackRequestSchema.safeParse(payload);
    if (!parsedBody.success) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const ipHash = hashIp(extractIp(request.headers), process.env.ANALYTICS_IP_HASH_SALT);
    const userAgent = request.headers.get("user-agent") ?? "";
    const isMobile = /mobile|android|iphone|ipad/i.test(userAgent);

    const nowIso = new Date().toISOString();
    const rows = parsedBody.data.events
      .map((event) => {
        const metadata = sanitizeMetadata(event.metadata);
        if (!withinMetadataLimit(metadata)) return null;

        const element = sanitizeElement(event.element);
        const createdAt = event.occurred_at ?? nowIso;

        return {
          created_at: createdAt,
          client_id: context.clientId,
          user_id: context.userId,
          session_id: event.session_id,
          event_name: event.event_name,
          event_category: event.event_category ?? null,
          page_path: sanitizePath(event.page_path ?? undefined),
          referrer: sanitizePath(event.referrer ?? undefined),
          element,
          metadata,
          duration_ms: event.duration_ms ?? null,
          device: {
            ua: userAgent.slice(0, 500),
            platform: typeof event.device?.platform === "string" ? event.device.platform : "unknown",
            isMobile:
              typeof event.device?.isMobile === "boolean" ? event.device.isMobile : isMobile,
          },
          ip_hash: ipHash,
        };
      })
      .filter(Boolean);

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const supabase = createServiceSupabase();
    const { error } = await supabase.from("analytics_events").insert(rows);

    if (error) {
      console.error("ANALYTICS_TRACK_INSERT_ERROR:", error);
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      inserted: rows.length,
    });
  } catch (error) {
    console.error("ANALYTICS_TRACK_POST_ERROR:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
