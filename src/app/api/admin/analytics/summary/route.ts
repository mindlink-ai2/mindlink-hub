import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/inbox-server";
import { getAnalyticsAdminContext } from "@/lib/analytics/server";
import { parseAnalyticsFilters } from "@/lib/analytics/filters";

export const runtime = "nodejs";

type SummaryRow = {
  sessions: number;
  active_users: number;
  page_views: number;
  clicks: number;
  top_feature: string;
  top_feature_count: number;
  errors: number;
  total_events: number;
  avg_events_per_session: number;
  avg_page_views_per_session: number;
  median_time_on_page_ms: number;
};

type ClientRow = {
  client_id: number;
  total_events: number;
};

export async function GET(request: Request) {
  try {
    const adminContext = await getAnalyticsAdminContext();
    if (!adminContext) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const parsedFilters = parseAnalyticsFilters(new URL(request.url).searchParams);
    if (!parsedFilters.ok) {
      return NextResponse.json({ error: "invalid_query" }, { status: 400 });
    }

    const filters = parsedFilters.data;
    const supabase = createServiceSupabase();

    const { data: summaryData, error: summaryError } = await supabase.rpc(
      "admin_analytics_summary",
      {
        p_from: filters.fromIso,
        p_to: filters.toIso,
        p_client_id: filters.clientId,
        p_event_name: filters.eventName,
        p_event_category: filters.category,
        p_page_path: filters.pagePath,
      }
    );

    if (summaryError) {
      console.error("ADMIN_ANALYTICS_SUMMARY_RPC_ERROR:", summaryError);
      return NextResponse.json({ error: "summary_fetch_failed" }, { status: 500 });
    }

    const { data: clientsData, error: clientsError } = await supabase.rpc(
      "admin_analytics_clients",
      {
        p_from: filters.fromIso,
        p_to: filters.toIso,
        p_limit: 250,
      }
    );

    if (clientsError) {
      console.error("ADMIN_ANALYTICS_CLIENTS_RPC_ERROR:", clientsError);
      return NextResponse.json({ error: "clients_fetch_failed" }, { status: 500 });
    }

    const row = (Array.isArray(summaryData) ? summaryData[0] : null) as SummaryRow | null;
    const clients = Array.isArray(clientsData) ? (clientsData as ClientRow[]) : [];

    return NextResponse.json({
      ok: true,
      filters: {
        from: filters.fromDate,
        to: filters.toDate,
        client_id: filters.clientId,
        event_name: filters.eventName,
        category: filters.category,
        page: filters.pagePath,
      },
      overview: {
        sessions: Number(row?.sessions ?? 0),
        activeUsers: Number(row?.active_users ?? 0),
        pageViews: Number(row?.page_views ?? 0),
        clicks: Number(row?.clicks ?? 0),
        topFeature: row?.top_feature || null,
        topFeatureCount: Number(row?.top_feature_count ?? 0),
        errors: Number(row?.errors ?? 0),
        totalEvents: Number(row?.total_events ?? 0),
      },
      averages: {
        eventsPerSession: Number(row?.avg_events_per_session ?? 0),
        pageViewsPerSession: Number(row?.avg_page_views_per_session ?? 0),
        medianTimeOnPageMs: Number(row?.median_time_on_page_ms ?? 0),
      },
      availableClients: clients.map((entry) => ({
        clientId: Number(entry.client_id),
        totalEvents: Number(entry.total_events ?? 0),
      })),
    });
  } catch (error) {
    console.error("ADMIN_ANALYTICS_SUMMARY_GET_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
