import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/inbox-server";
import { getAnalyticsAdminContext } from "@/lib/analytics/server";

export const runtime = "nodejs";

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function GET() {
  try {
    const adminContext = await getAnalyticsAdminContext();
    if (!adminContext) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const supabase = createServiceSupabase();
    const now = new Date();
    const day7ago = daysAgo(7);
    const day14ago = daysAgo(14);
    const day30ago = daysAgo(30);

    // Active clients last 7 days
    const { data: activeClientsData } = await supabase
      .from("client_events")
      .select("client_id")
      .gte("created_at", day7ago.toISOString());

    const activeClientIds = new Set(
      (activeClientsData ?? []).map((r: { client_id: number }) => r.client_id)
    );

    // Total distinct clients
    const { data: allClientsData } = await supabase
      .from("clients")
      .select("id, email, name, company_name");

    const totalClients = (allClientsData ?? []).length;

    // Prospects this week vs prev week
    const { data: prospectsThisWeek } = await supabase
      .from("client_events")
      .select("id")
      .eq("event_type", "prospects_received")
      .gte("created_at", day7ago.toISOString());

    const { data: prospectsPrevWeek } = await supabase
      .from("client_events")
      .select("id")
      .eq("event_type", "prospects_received")
      .gte("created_at", day14ago.toISOString())
      .lt("created_at", day7ago.toISOString());

    // Messages this week vs prev week
    const { data: messagesThisWeek } = await supabase
      .from("client_events")
      .select("id")
      .eq("event_type", "message_sent")
      .gte("created_at", day7ago.toISOString());

    const { data: messagesPrevWeek } = await supabase
      .from("client_events")
      .select("id")
      .eq("event_type", "message_sent")
      .gte("created_at", day14ago.toISOString())
      .lt("created_at", day7ago.toISOString());

    // Reply rate: replies / messages sent (all time)
    const { data: allMessages } = await supabase
      .from("client_activity_summary")
      .select("total_messages_sent, total_replies_received");

    let totalMessagesSent = 0;
    let totalReplies = 0;
    for (const row of allMessages ?? []) {
      totalMessagesSent += row.total_messages_sent ?? 0;
      totalReplies += row.total_replies_received ?? 0;
    }
    const avgReplyRate =
      totalMessagesSent > 0
        ? Math.round((totalReplies / totalMessagesSent) * 100)
        : 0;

    // Activity chart: last 30 days
    const { data: chartEvents } = await supabase
      .from("client_events")
      .select("event_type, created_at")
      .gte("created_at", day30ago.toISOString())
      .in("event_type", ["login", "session_start", "message_sent", "prospects_received"]);

    const chartMap: Record<string, { logins: number; messages: number; prospects: number }> = {};
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      chartMap[formatDate(d)] = { logins: 0, messages: 0, prospects: 0 };
    }
    for (const e of chartEvents ?? []) {
      const day = formatDate(new Date(e.created_at));
      if (!chartMap[day]) continue;
      if (e.event_type === "login" || e.event_type === "session_start") chartMap[day].logins++;
      else if (e.event_type === "message_sent") chartMap[day].messages++;
      else if (e.event_type === "prospects_received") chartMap[day].prospects++;
    }
    const activityChart = Object.entries(chartMap).map(([date, vals]) => ({ date, ...vals }));

    // Clients table
    const clientsMap: Record<number, { id: number; email?: string; name?: string; company_name?: string }> = {};
    for (const c of allClientsData ?? []) {
      clientsMap[c.id] = c;
    }

    const { data: summaries } = await supabase
      .from("client_activity_summary")
      .select("*");

    const { data: weeklyMessages } = await supabase
      .from("client_events")
      .select("client_id")
      .eq("event_type", "message_sent")
      .gte("created_at", day7ago.toISOString());

    const weeklyMessagesMap: Record<number, number> = {};
    for (const r of weeklyMessages ?? []) {
      weeklyMessagesMap[r.client_id] = (weeklyMessagesMap[r.client_id] ?? 0) + 1;
    }

    const { data: weeklyProspects } = await supabase
      .from("client_events")
      .select("client_id")
      .eq("event_type", "prospects_received")
      .gte("created_at", day7ago.toISOString());

    const weeklyProspectsMap: Record<number, number> = {};
    for (const r of weeklyProspects ?? []) {
      weeklyProspectsMap[r.client_id] = (weeklyProspectsMap[r.client_id] ?? 0) + 1;
    }

    const clientsTable = (summaries ?? []).map((s) => {
      const client = clientsMap[s.client_id];
      const clientName =
        client?.name ?? client?.company_name ?? client?.email ?? `Client ${s.client_id}`;
      const msgs = s.total_messages_sent ?? 0;
      const replies = s.total_replies_received ?? 0;
      const replyRate = msgs > 0 ? Math.round((replies / msgs) * 100) : 0;
      return {
        client_id: s.client_id,
        client_name: clientName,
        last_login_at: s.last_login_at ?? null,
        prospects_total: s.total_prospects_viewed ?? 0,
        prospects_week: weeklyProspectsMap[s.client_id] ?? 0,
        messages_total: msgs,
        messages_week: weeklyMessagesMap[s.client_id] ?? 0,
        reply_rate: replyRate,
        health_score: s.health_score ?? 100,
      };
    });

    // Recent events
    const { data: recentEvents } = await supabase
      .from("client_events")
      .select("client_id, event_type, event_category, created_at, metadata")
      .order("created_at", { ascending: false })
      .limit(20);

    const recentEventsMapped = (recentEvents ?? []).map((e) => {
      const client = clientsMap[e.client_id];
      const clientName =
        client?.name ?? client?.company_name ?? client?.email ?? `Client ${e.client_id}`;
      return {
        client_id: e.client_id,
        client_name: clientName,
        event_type: e.event_type,
        event_category: e.event_category,
        created_at: e.created_at,
        metadata: e.metadata ?? {},
      };
    });

    return NextResponse.json({
      active_clients_7d: activeClientIds.size,
      total_clients: totalClients,
      total_prospects_delivered_week: (prospectsThisWeek ?? []).length,
      total_prospects_delivered_prev_week: (prospectsPrevWeek ?? []).length,
      total_messages_week: (messagesThisWeek ?? []).length,
      total_messages_prev_week: (messagesPrevWeek ?? []).length,
      avg_reply_rate: avgReplyRate,
      activity_chart: activityChart,
      clients_table: clientsTable,
      recent_events: recentEventsMapped,
      updated_at: now.toISOString(),
    });
  } catch (error) {
    console.error("CLIENT_ANALYTICS_GLOBAL_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
