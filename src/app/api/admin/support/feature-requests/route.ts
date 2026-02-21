import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceSupabase } from "@/lib/inbox-server";
import { getSupportAdminContext } from "@/lib/support-admin-auth";

export const runtime = "nodejs";

const querySchema = z.object({
  status: z.enum(["new", "reviewed", "all"]).default("all"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(24),
});

const bodySchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum(["new", "reviewed"]),
});

type FeatureRequestRow = {
  id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  body: string;
  status: "new" | "reviewed";
  created_at: string;
  updated_at: string;
};

export async function GET(request: Request) {
  try {
    const adminContext = await getSupportAdminContext();
    if (!adminContext) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const params = new URL(request.url).searchParams;
    const parsed = querySchema.safeParse({
      status: params.get("status") ?? undefined,
      limit: params.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_query" }, { status: 400 });
    }

    const { status, limit } = parsed.data;
    const supabase = createServiceSupabase();

    let query = supabase
      .from("support_feature_requests")
      .select("id, user_id, user_email, user_name, body, status, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) {
      console.error("ADMIN_SUPPORT_FEATURE_REQUESTS_FETCH_ERROR:", error);
      return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
    }

    return NextResponse.json({
      requests: (Array.isArray(data) ? data : []) as FeatureRequestRow[],
    });
  } catch (error) {
    console.error("ADMIN_SUPPORT_FEATURE_REQUESTS_GET_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const adminContext = await getSupportAdminContext();
    if (!adminContext) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const payload = await request.json().catch(() => ({}));
    const parsedBody = bodySchema.safeParse(payload);
    if (!parsedBody.success) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const { requestId, status } = parsedBody.data;
    const supabase = createServiceSupabase();

    const { data, error } = await supabase
      .from("support_feature_requests")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .select("id, status")
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: "request_not_found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      request: data,
    });
  } catch (error) {
    console.error("ADMIN_SUPPORT_FEATURE_REQUESTS_POST_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
