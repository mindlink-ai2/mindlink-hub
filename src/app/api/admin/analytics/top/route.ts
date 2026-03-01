import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/inbox-server";
import { getAnalyticsAdminContext } from "@/lib/analytics/server";
import { parseAnalyticsFilters } from "@/lib/analytics/filters";

export const runtime = "nodejs";

type TopEventRow = {
  event_name: string;
  total: number;
};

type TopFeatureRow = {
  feature: string;
  total: number;
};

type TopPageRow = {
  page_path: string;
  total: number;
};

type TopElementRow = {
  element_label: string;
  element_type: string | null;
  element_id: string | null;
  href: string | null;
  total: number;
};

type FunnelRow = {
  step: string;
  sessions: number;
  conversion_rate: number;
};

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: Request) {
  try {
    const adminContext = await getAnalyticsAdminContext();
    if (!adminContext) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const parsedFilters = parseAnalyticsFilters(new URL(request.url).searchParams, {
      limit: 10,
      offset: 0,
    });

    if (!parsedFilters.ok) {
      return NextResponse.json({ error: "invalid_query" }, { status: 400 });
    }

    const filters = parsedFilters.data;
    const supabase = createServiceSupabase();

    const commonArgs = {
      p_client_id: filters.clientId,
      p_event_name: filters.eventName,
      p_event_category: filters.category,
      p_page_path: filters.pagePath,
      p_limit: filters.limit,
    };

    const [
      currentTopEventsResult,
      previousTopEventsResult,
      topFeaturesResult,
      topPagesResult,
      topElementsResult,
      funnelResult,
    ] = await Promise.all([
      supabase.rpc("admin_analytics_top_event_names", {
        ...commonArgs,
        p_from: filters.fromIso,
        p_to: filters.toIso,
      }),
      supabase.rpc("admin_analytics_top_event_names", {
        ...commonArgs,
        p_from: filters.previousFromIso,
        p_to: filters.previousToIso,
      }),
      supabase.rpc("admin_analytics_top_features", {
        p_from: filters.fromIso,
        p_to: filters.toIso,
        p_client_id: filters.clientId,
        p_limit: filters.limit,
      }),
      supabase.rpc("admin_analytics_top_pages", {
        p_from: filters.fromIso,
        p_to: filters.toIso,
        p_client_id: filters.clientId,
        p_limit: filters.limit,
      }),
      supabase.rpc("admin_analytics_top_elements", {
        p_from: filters.fromIso,
        p_to: filters.toIso,
        p_client_id: filters.clientId,
        p_limit: filters.limit,
      }),
      supabase.rpc("admin_analytics_funnel", {
        p_from: filters.fromIso,
        p_to: filters.toIso,
        p_client_id: filters.clientId,
      }),
    ]);

    if (currentTopEventsResult.error) {
      console.error("ADMIN_ANALYTICS_TOP_EVENTS_CURRENT_ERROR:", currentTopEventsResult.error);
      return NextResponse.json({ error: "top_events_failed" }, { status: 500 });
    }
    if (previousTopEventsResult.error) {
      console.error("ADMIN_ANALYTICS_TOP_EVENTS_PREVIOUS_ERROR:", previousTopEventsResult.error);
      return NextResponse.json({ error: "top_events_failed" }, { status: 500 });
    }
    if (topFeaturesResult.error) {
      console.error("ADMIN_ANALYTICS_TOP_FEATURES_ERROR:", topFeaturesResult.error);
      return NextResponse.json({ error: "top_features_failed" }, { status: 500 });
    }
    if (topPagesResult.error) {
      console.error("ADMIN_ANALYTICS_TOP_PAGES_ERROR:", topPagesResult.error);
      return NextResponse.json({ error: "top_pages_failed" }, { status: 500 });
    }
    if (topElementsResult.error) {
      console.error("ADMIN_ANALYTICS_TOP_ELEMENTS_ERROR:", topElementsResult.error);
      return NextResponse.json({ error: "top_elements_failed" }, { status: 500 });
    }
    if (funnelResult.error) {
      console.error("ADMIN_ANALYTICS_FUNNEL_ERROR:", funnelResult.error);
      return NextResponse.json({ error: "funnel_failed" }, { status: 500 });
    }

    const currentTopEvents = Array.isArray(currentTopEventsResult.data)
      ? (currentTopEventsResult.data as TopEventRow[])
      : [];
    const previousTopEvents = Array.isArray(previousTopEventsResult.data)
      ? (previousTopEventsResult.data as TopEventRow[])
      : [];

    const previousMap = new Map<string, number>();
    previousTopEvents.forEach((row) => {
      previousMap.set(row.event_name, toNumber(row.total));
    });

    const topEvents = currentTopEvents.map((row) => {
      const current = toNumber(row.total);
      const previous = toNumber(previousMap.get(row.event_name) ?? 0);
      const delta = current - previous;
      const deltaPercent = previous === 0 ? (current > 0 ? 100 : 0) : (delta / previous) * 100;

      return {
        eventName: row.event_name,
        total: current,
        previousTotal: previous,
        delta,
        deltaPercent: Number(deltaPercent.toFixed(2)),
      };
    });

    const topFeatures = (Array.isArray(topFeaturesResult.data)
      ? (topFeaturesResult.data as TopFeatureRow[])
      : []
    ).map((row) => ({
      feature: row.feature,
      total: toNumber(row.total),
    }));

    const topPages = (Array.isArray(topPagesResult.data)
      ? (topPagesResult.data as TopPageRow[])
      : []
    ).map((row) => ({
      pagePath: row.page_path,
      total: toNumber(row.total),
    }));

    const topElements = (Array.isArray(topElementsResult.data)
      ? (topElementsResult.data as TopElementRow[])
      : []
    ).map((row) => ({
      label: row.element_label,
      type: row.element_type,
      id: row.element_id,
      href: row.href,
      total: toNumber(row.total),
    }));

    const funnel = (Array.isArray(funnelResult.data) ? (funnelResult.data as FunnelRow[]) : []).map(
      (row) => ({
        step: row.step,
        sessions: toNumber(row.sessions),
        conversionRate: Number(toNumber(row.conversion_rate).toFixed(2)),
      })
    );

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
      topEvents,
      topFeatures,
      topPages,
      topElements,
      funnel,
    });
  } catch (error) {
    console.error("ADMIN_ANALYTICS_TOP_GET_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
