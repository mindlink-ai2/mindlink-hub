import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceSupabase } from "@/lib/inbox-server";
import { getSupportAdminContext } from "@/lib/support-admin-auth";

export const runtime = "nodejs";

const querySchema = z.object({
  conversationId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  before: z.string().datetime().optional(),
});

export async function GET(request: Request) {
  try {
    const adminContext = await getSupportAdminContext();
    if (!adminContext) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const params = new URL(request.url).searchParams;
    const parsedQuery = querySchema.safeParse({
      conversationId: params.get("conversationId"),
      limit: params.get("limit") ?? undefined,
      before: params.get("before") ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json({ error: "invalid_query" }, { status: 400 });
    }

    const { conversationId, limit, before } = parsedQuery.data;
    const supabase = createServiceSupabase();

    const { data: conversation, error: conversationErr } = await supabase
      .from("support_conversations")
      .select("id")
      .eq("id", conversationId)
      .maybeSingle();

    if (conversationErr || !conversation) {
      return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
    }

    let query = supabase
      .from("support_messages")
      .select(
        "id, conversation_id, sender_type, body, created_at, read_at, read_by_support_at"
      )
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt("created_at", before);
    }

    const { data, error } = await query;
    if (error) {
      console.error("ADMIN_SUPPORT_MESSAGES_FETCH_ERROR:", error);
      return NextResponse.json({ error: "messages_fetch_failed" }, { status: 500 });
    }

    const rows = Array.isArray(data) ? data : [];
    const messages = [...rows].reverse();

    const nowIso = new Date().toISOString();
    await supabase
      .from("support_messages")
      .update({ read_by_support_at: nowIso })
      .eq("conversation_id", conversationId)
      .eq("sender_type", "user")
      .is("read_by_support_at", null);

    return NextResponse.json({
      messages,
      hasMore: rows.length === limit,
    });
  } catch (error) {
    console.error("ADMIN_SUPPORT_MESSAGES_GET_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
