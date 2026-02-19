import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceSupabase } from "@/lib/inbox-server";
import { getSupportAdminContext } from "@/lib/support-admin-auth";

export const runtime = "nodejs";

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
});

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

    const { conversationId, body } = parsedBody.data;
    const supabase = createServiceSupabase();

    const { data: conversation, error: conversationErr } = await supabase
      .from("support_conversations")
      .select("id")
      .eq("id", conversationId)
      .maybeSingle();

    if (conversationErr || !conversation) {
      return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
    }

    const createdAt = new Date().toISOString();
    const { data: message, error: insertErr } = await supabase
      .from("support_messages")
      .insert({
        conversation_id: conversationId,
        sender_type: "support",
        body,
        created_at: createdAt,
      })
      .select(
        "id, conversation_id, sender_type, body, created_at, read_at, read_by_support_at"
      )
      .single();

    if (insertErr || !message) {
      console.error("ADMIN_SUPPORT_REPLY_INSERT_ERROR:", insertErr);
      return NextResponse.json({ error: "reply_insert_failed" }, { status: 500 });
    }

    const { error: updateConversationErr } = await supabase
      .from("support_conversations")
      .update({
        last_message_at: createdAt,
        status: "open",
        updated_at: createdAt,
      })
      .eq("id", conversationId);

    if (updateConversationErr) {
      console.error("ADMIN_SUPPORT_REPLY_CONVERSATION_UPDATE_ERROR:", updateConversationErr);
      return NextResponse.json(
        { error: "reply_conversation_update_failed" },
        { status: 500 }
      );
    }

    await supabase
      .from("support_messages")
      .update({ read_by_support_at: createdAt })
      .eq("conversation_id", conversationId)
      .eq("sender_type", "user")
      .is("read_by_support_at", null);

    return NextResponse.json({
      success: true,
      message,
    });
  } catch (error) {
    console.error("ADMIN_SUPPORT_REPLY_POST_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
