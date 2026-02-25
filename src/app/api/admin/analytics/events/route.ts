import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/inbox-server";
import { getAnalyticsAdminContext } from "@/lib/analytics/server";
import { parseAnalyticsFilters } from "@/lib/analytics/filters";

export const runtime = "nodejs";

type EventRow = {
  id: string;
  created_at: string;
  client_id: number;
  user_id: string | null;
  session_id: string;
  event_name: string;
  event_category: string | null;
  page_path: string | null;
  element: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  duration_ms: number | null;
};

export async function GET(request: Request) {
  try {
    const adminContext = await getAnalyticsAdminContext();
    if (!adminContext) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const parsedFilters = parseAnalyticsFilters(new URL(request.url).searchParams, {
      limit: 50,
      offset: 0,
    });
    if (!parsedFilters.ok) {
      return NextResponse.json({ error: "invalid_query" }, { status: 400 });
    }

    const filters = parsedFilters.data;
    const supabase = createServiceSupabase();

    let query = supabase
      .from("analytics_events")
      .select(
        "id, created_at, client_id, user_id, session_id, event_name, event_category, page_path, element, metadata, duration_ms",
        { count: "exact" }
      )
      .gte("created_at", filters.fromIso)
      .lte("created_at", filters.toIso)
      .order("created_at", { ascending: false })
      .range(filters.offset, filters.offset + filters.limit - 1);

    if (filters.clientId !== null) query = query.eq("client_id", filters.clientId);
    if (filters.eventName) query = query.eq("event_name", filters.eventName);
    if (filters.category) query = query.eq("event_category", filters.category);
    if (filters.pagePath) query = query.eq("page_path", filters.pagePath);

    const { data, error, count } = await query;
    if (error) {
      console.error("ADMIN_ANALYTICS_EVENTS_QUERY_ERROR:", error);
      return NextResponse.json({ error: "events_fetch_failed" }, { status: 500 });
    }

    const events = (Array.isArray(data) ? (data as EventRow[]) : []).map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      clientId: Number(row.client_id),
      userId: row.user_id,
      sessionId: row.session_id,
      eventName: row.event_name,
      category: row.event_category,
      pagePath: row.page_path,
      element: row.element,
      metadata: row.metadata,
      durationMs: row.duration_ms,
    }));

    const total = Number(count ?? 0);
    const nextOffset = filters.offset + events.length;

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
      pagination: {
        limit: filters.limit,
        offset: filters.offset,
        total,
        hasMore: nextOffset < total,
      },
      events,
    });
  } catch (error) {
    console.error("ADMIN_ANALYTICS_EVENTS_GET_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
