import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertConversationOwnership,
  createSupportSupabase,
  getAuthenticatedSupportUser,
} from "@/lib/support-widget-server";

export const runtime = "nodejs";

const sendSchema = z.object({
  conversationId: z.string().uuid(),
  body: z
    .string()
    .trim()
    .min(1)
    .max(4000),
});

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

    await assertConversationOwnership(supabase, conversationId, supportUser.userId);

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

    return NextResponse.json({
      success: true,
      message: data,
    });
  } catch (error) {
    console.error("SUPPORT_WIDGET_SEND_POST_ERROR:", error);
    if (error instanceof Error && error.message === "support_conversation_not_found") {
      return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
