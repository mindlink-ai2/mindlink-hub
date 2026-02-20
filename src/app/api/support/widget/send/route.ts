import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertConversationOwnership,
  createSupportSupabase,
  getAuthenticatedSupportUser,
} from "@/lib/support-widget-server";
import { notifySupportTeamClientMessage } from "@/lib/support-email";

export const runtime = "nodejs";

const sendSchema = z.object({
  conversationId: z.string().uuid(),
  body: z
    .string()
    .trim()
    .min(1)
    .max(4000),
});

function isMissingTicketNumberColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const errorCode = String(error.code ?? "");
  const errorMessage = String(error.message ?? "");
  return (
    errorCode === "42703" ||
    errorCode === "PGRST204" ||
    errorMessage.includes("ticket_number")
  );
}

export async function POST(request: Request) {
  try {
    const supportUser = await getAuthenticatedSupportUser();
    if (!supportUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const payload = await request.json().catch(() => ({}));
    const parsedBody = sendSchema.safeParse(payload);
    if (!parsedBody.success) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const { conversationId, body } = parsedBody.data;
    const supabase = createSupportSupabase();

    const conversation = await assertConversationOwnership(
      supabase,
      conversationId,
      supportUser.userId
    );
    const { count: messageCountBeforeInsert, error: messageCountError } = await supabase
      .from("support_messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);
    if (messageCountError) {
      console.error("SUPPORT_WIDGET_SEND_MESSAGE_COUNT_ERROR:", messageCountError);
    }
    const isFirstMessageInTicket = Number(messageCountBeforeInsert ?? 0) === 0;

    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("support_messages")
      .insert({
        conversation_id: conversationId,
        sender_type: "user",
        body,
        created_at: nowIso,
      })
      .select("id, conversation_id, sender_type, body, created_at, read_at")
      .single();

    if (error || !data) {
      console.error("SUPPORT_WIDGET_SEND_ERROR:", error);
      return NextResponse.json({ error: "send_failed" }, { status: 500 });
    }

    const nextStatus = conversation.status === "closed" ? "reopened" : conversation.status;
    let { data: updatedConversation, error: conversationErr } = await supabase
      .from("support_conversations")
      .update({
        status: nextStatus,
        last_message_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", conversationId)
      .eq("user_id", supportUser.userId)
      .select(
        "id, ticket_number, user_id, user_email, user_name, status, last_message_at, unread_count, created_at, updated_at"
      )
      .single();

    if (conversationErr && isMissingTicketNumberColumn(conversationErr)) {
      const fallback = await supabase
        .from("support_conversations")
        .update({
          status: nextStatus,
          last_message_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", conversationId)
        .eq("user_id", supportUser.userId)
        .select("id, user_id, user_email, user_name, status, last_message_at, unread_count, created_at, updated_at")
        .single();

      updatedConversation = fallback.data
        ? { ...fallback.data, ticket_number: null }
        : null;
      conversationErr = fallback.error;
    }

    if (conversationErr || !updatedConversation) {
      console.error("SUPPORT_WIDGET_SEND_CONVERSATION_UPDATE_ERROR:", conversationErr);
      return NextResponse.json({ error: "conversation_update_failed" }, { status: 500 });
    }

    try {
      await notifySupportTeamClientMessage({
        conversation: updatedConversation,
        messageBody: body,
        isFirstMessageInTicket,
      });
    } catch (notifyError) {
      console.error("SUPPORT_WIDGET_SEND_NOTIFY_ERROR:", notifyError);
    }

    return NextResponse.json({
      success: true,
      message: data,
      conversation: updatedConversation,
    });
  } catch (error) {
    console.error("SUPPORT_WIDGET_SEND_POST_ERROR:", error);
    if (error instanceof Error && error.message === "support_conversation_not_found") {
      return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
