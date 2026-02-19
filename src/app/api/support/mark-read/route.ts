import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertConversationOwnership,
  createSupportSupabase,
  getAuthenticatedSupportUser,
} from "@/lib/support-widget-server";

export const runtime = "nodejs";

const markReadSchema = z.object({
  conversationId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const supportUser = await getAuthenticatedSupportUser();
    if (!supportUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const payload = await request.json().catch(() => ({}));
    const parsedBody = markReadSchema.safeParse(payload);
    if (!parsedBody.success) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const { conversationId } = parsedBody.data;
    const supabase = createSupportSupabase();

    await assertConversationOwnership(supabase, conversationId, supportUser.userId);

    const nowIso = new Date().toISOString();
    const { data: updatedMessages, error: messagesErr } = await supabase
      .from("support_messages")
      .update({ read_at: nowIso })
      .eq("conversation_id", conversationId)
      .eq("sender_type", "support")
      .is("read_at", null)
      .select("id");

    if (messagesErr) {
      console.error("SUPPORT_MARK_READ_MESSAGES_ERROR:", messagesErr);
      return NextResponse.json({ error: "mark_read_failed" }, { status: 500 });
    }

    const { error: conversationErr } = await supabase
      .from("support_conversations")
      .update({ unread_count: 0, updated_at: nowIso })
      .eq("id", conversationId)
      .eq("user_id", supportUser.userId);

    if (conversationErr) {
      console.error("SUPPORT_MARK_READ_CONVERSATION_ERROR:", conversationErr);
      return NextResponse.json({ error: "conversation_update_failed" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      updatedCount: Array.isArray(updatedMessages) ? updatedMessages.length : 0,
    });
  } catch (error) {
    console.error("SUPPORT_MARK_READ_POST_ERROR:", error);
    if (error instanceof Error && error.message === "support_conversation_not_found") {
      return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
