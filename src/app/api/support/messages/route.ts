import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertConversationOwnership,
  createSupportSupabase,
  getAuthenticatedSupportUser,
} from "@/lib/support-widget-server";

export const runtime = "nodejs";

const querySchema = z.object({
  conversationId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  before: z.string().datetime().optional(),
});

export async function GET(request: Request) {
  try {
    const supportUser = await getAuthenticatedSupportUser();
    if (!supportUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parsedQuery = querySchema.safeParse({
      conversationId: searchParams.get("conversationId"),
      limit: searchParams.get("limit") ?? undefined,
      before: searchParams.get("before") ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json({ error: "invalid_query" }, { status: 400 });
    }

    const { conversationId, before } = parsedQuery.data;
    const limit = parsedQuery.data.limit ?? 30;

    const supabase = createSupportSupabase();
    await assertConversationOwnership(supabase, conversationId, supportUser.userId);

    let query = supabase
      .from("support_messages")
      .select("id, conversation_id, sender_type, body, created_at, read_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt("created_at", before);
    }

    const { data, error } = await query;
    if (error) {
      console.error("SUPPORT_MESSAGES_FETCH_ERROR:", error);
      return NextResponse.json({ error: "messages_fetch_failed" }, { status: 500 });
    }

    const rows = Array.isArray(data) ? data : [];
    const messages = [...rows].reverse();

    return NextResponse.json({
      messages,
      hasMore: rows.length === limit,
    });
  } catch (error) {
    console.error("SUPPORT_MESSAGES_GET_ERROR:", error);
    if (error instanceof Error && error.message === "support_conversation_not_found") {
      return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
