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

function computeHealthScore(params: {
  lastLoginAt: string | null;
  logins30d: number;
  messages30d: number;
  prospectsReceived: number;
  prospectsViewed: number;
}): number {
  let score = 0;

  // Last login: < 2 days = 30pts, < 7 days = 20pts, < 14 days = 10pts, > 14 days = 0pts
  if (params.lastLoginAt) {
    const daysSince =
      (Date.now() - new Date(params.lastLoginAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 2) score += 30;
    else if (daysSince < 7) score += 20;
    else if (daysSince < 14) score += 10;
  }

  // Login frequency (30d): > 15 = 25pts, > 8 = 15pts, > 3 = 10pts, <= 3 = 0pts
  if (params.logins30d > 15) score += 25;
  else if (params.logins30d > 8) score += 15;
  else if (params.logins30d > 3) score += 10;

  // Messages (30d): > 20 = 25pts, > 10 = 15pts, > 0 = 5pts, 0 = 0pts
  if (params.messages30d > 20) score += 25;
  else if (params.messages30d > 10) score += 15;
  else if (params.messages30d > 0) score += 5;

  // Prospects viewed ratio: > 80% = 20pts, > 50% = 10pts, <= 50% = 0pts
  if (params.prospectsReceived > 0) {
    const ratio = params.prospectsViewed / params.prospectsReceived;
    if (ratio > 0.8) score += 20;
    else if (ratio > 0.5) score += 10;
  }

  return Math.min(100, score);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const adminContext = await getAnalyticsAdminContext();
    if (!adminContext) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const { clientId: clientIdStr } = await params;
    const clientId = Number(clientIdStr);
    if (!Number.isFinite(clientId) || clientId <= 0) {
      return NextResponse.json({ error: "invalid_client_id" }, { status: 400 });
    }

    const supabase = createServiceSupabase();
    const day30ago = daysAgo(30);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Client info
    const { data: clientData } = await supabase
      .from("clients")
      .select("id, email, name, company_name")
      .eq("id", clientId)
      .maybeSingle();

    const clientName =
      clientData?.name ??
      clientData?.company_name ??
      clientData?.email ??
      `Client ${clientId}`;

    // Summary
    const { data: summary } = await supabase
      .from("client_activity_summary")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle();

    // Last 30 days events
    const { data: events30d } = await supabase
      .from("client_events")
      .select("event_type, event_category, created_at")
      .eq("client_id", clientId)
      .gte("created_at", day30ago.toISOString());

    // Logins this month
    const { data: loginsMonth } = await supabase
      .from("client_events")
      .select("id")
      .eq("client_id", clientId)
      .in("event_type", ["login", "session_start"])
      .gte("created_at", startOfMonth.toISOString());

    // Messages this month
    const { data: messagesMonth } = await supabase
      .from("client_events")
      .select("id")
      .eq("client_id", clientId)
      .eq("event_type", "message_sent")
      .gte("created_at", startOfMonth.toISOString());

    // Prospects this month
    const { data: prospectsMonth } = await supabase
      .from("client_events")
      .select("id")
      .eq("client_id", clientId)
      .eq("event_type", "prospect_detail_viewed")
      .gte("created_at", startOfMonth.toISOString());

    // Last 50 events
    const { data: recentEvents } = await supabase
      .from("client_events")
      .select("id, event_type, event_category, metadata, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(50);

    // Activity chart: last 30 days
    const chartMap: Record<string, number> = {};
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      chartMap[formatDate(d)] = 0;
    }
    for (const e of events30d ?? []) {
      const day = formatDate(new Date(e.created_at));
      if (chartMap[day] !== undefined) chartMap[day]++;
    }
    const activityChart = Object.entries(chartMap).map(([date, events]) => ({ date, events }));

    // Category breakdown
    const categoryCount: Record<string, number> = {};
    for (const e of events30d ?? []) {
      categoryCount[e.event_category] = (categoryCount[e.event_category] ?? 0) + 1;
    }
    const categoryBreakdown = Object.entries(categoryCount).map(([category, count]) => ({
      category,
      count,
    }));

    // Logins 30d for health score
    const logins30d = (events30d ?? []).filter(
      (e) => e.event_type === "login" || e.event_type === "session_start"
    ).length;

    const messages30d = (events30d ?? []).filter(
      (e) => e.event_type === "message_sent"
    ).length;

    // Reply rate from leads table: responded / message_sent (1 reply max per person)
    const { data: leadsMessageSent } = await supabase
      .from("leads")
      .select("id")
      .eq("client_id", clientId)
      .eq("message_sent", true);

    const { data: leadsResponded } = await supabase
      .from("leads")
      .select("id")
      .eq("client_id", clientId)
      .eq("responded", true);

    const totalMsgsSent = (leadsMessageSent ?? []).length;
    const totalReplies = (leadsResponded ?? []).length;
    const replyRate =
      totalMsgsSent > 0 ? Math.round((totalReplies / totalMsgsSent) * 100) : 0;

    const healthScore = computeHealthScore({
      lastLoginAt: summary?.last_login_at ?? null,
      logins30d,
      messages30d,
      prospectsReceived: summary?.total_prospects_received ?? 0,
      prospectsViewed: summary?.total_prospects_viewed ?? 0,
    });

    // Funnel
    const funnel = {
      prospects_received: summary?.total_prospects_received ?? 0,
      prospects_viewed: summary?.total_prospects_viewed ?? 0,
      messages_sent: totalMsgsSent,
      replies: totalReplies,
    };

    return NextResponse.json({
      client_id: clientId,
      client_name: clientName,
      health_score: healthScore,
      last_login_at: summary?.last_login_at ?? null,
      logins_month: (loginsMonth ?? []).length,
      prospects_total: summary?.total_prospects_viewed ?? 0,
      prospects_month: (prospectsMonth ?? []).length,
      messages_total: totalMsgsSent,
      messages_month: (messagesMonth ?? []).length,
      reply_rate: replyRate,
      activity_chart: activityChart,
      category_breakdown: categoryBreakdown,
      funnel,
      events: (recentEvents ?? []).map((e) => ({
        id: e.id,
        event_type: e.event_type,
        event_category: e.event_category,
        metadata: e.metadata ?? {},
        created_at: e.created_at,
      })),
    });
  } catch (error) {
    console.error("CLIENT_ANALYTICS_CLIENT_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
