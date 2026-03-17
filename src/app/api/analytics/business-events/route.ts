import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceSupabase, getClientIdFromClerkUser } from "@/lib/inbox-server";

export const runtime = "nodejs";

type IncomingEvent = {
  event_type: string;
  event_category: string;
  metadata?: Record<string, unknown>;
  session_id?: string;
};

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ ok: true });
    }

    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.events) || body.events.length === 0) {
      return NextResponse.json({ ok: true });
    }

    const supabase = createServiceSupabase();
    const clientId = await getClientIdFromClerkUser(supabase, userId);
    if (!clientId) {
      return NextResponse.json({ ok: true });
    }

    const events: IncomingEvent[] = body.events;
    const now = new Date().toISOString();

    const rows = events
      .filter((e) => e && typeof e.event_type === "string" && typeof e.event_category === "string")
      .map((e) => ({
        client_id: Number(clientId),
        user_id: userId,
        event_type: e.event_type,
        event_category: e.event_category,
        metadata: e.metadata ?? {},
        session_id: e.session_id ?? null,
        created_at: now,
      }));

    if (rows.length > 0) {
      await supabase.from("client_events").insert(rows);
    }

    // Update activity summary
    const loginEvents = rows.filter((r) => r.event_type === "login" || r.event_type === "session_start");
    const messageEvents = rows.filter((r) => r.event_type === "message_sent");
    const connectionEvents = rows.filter((r) => r.event_type === "connection_request_sent");
    const prospectViewEvents = rows.filter((r) => r.event_type === "prospect_detail_viewed");
    const replyEvents = rows.filter((r) => r.event_type === "reply_received");

    const { data: existing } = await supabase
      .from("client_activity_summary")
      .select("*")
      .eq("client_id", Number(clientId))
      .maybeSingle();

    const base = existing ?? {
      client_id: Number(clientId),
      total_logins: 0,
      last_login_at: null,
      total_prospects_received: 0,
      total_prospects_viewed: 0,
      total_messages_sent: 0,
      total_connections_sent: 0,
      total_replies_received: 0,
      total_sessions: 0,
      avg_session_duration_seconds: 0,
      last_active_at: null,
      days_since_last_activity: 0,
      health_score: 100,
    };

    const updatedSummary = {
      client_id: Number(clientId),
      total_logins: (base.total_logins ?? 0) + loginEvents.length,
      last_login_at: loginEvents.length > 0 ? now : base.last_login_at,
      total_prospects_received: base.total_prospects_received ?? 0,
      total_prospects_viewed: (base.total_prospects_viewed ?? 0) + prospectViewEvents.length,
      total_messages_sent: (base.total_messages_sent ?? 0) + messageEvents.length,
      total_connections_sent: (base.total_connections_sent ?? 0) + connectionEvents.length,
      total_replies_received: (base.total_replies_received ?? 0) + replyEvents.length,
      total_sessions: base.total_sessions ?? 0,
      avg_session_duration_seconds: base.avg_session_duration_seconds ?? 0,
      last_active_at: now,
      days_since_last_activity: 0,
      health_score: base.health_score ?? 100,
      updated_at: now,
    };

    await supabase
      .from("client_activity_summary")
      .upsert(updatedSummary, { onConflict: "client_id" });

    return NextResponse.json({ ok: true });
  } catch {
    // fail silently
    return NextResponse.json({ ok: true });
  }
}
