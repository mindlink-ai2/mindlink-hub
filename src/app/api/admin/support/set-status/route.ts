import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceSupabase } from "@/lib/inbox-server";
import { getSupportAdminContext } from "@/lib/support-admin-auth";

export const runtime = "nodejs";

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  status: z.enum(["open", "closed"]),
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

    const { conversationId, status } = parsedBody.data;
    const supabase = createServiceSupabase();

    const updatedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("support_conversations")
      .update({ status, updated_at: updatedAt })
      .eq("id", conversationId)
      .select("id, status")
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      conversation: data,
    });
  } catch (error) {
    console.error("ADMIN_SUPPORT_SET_STATUS_POST_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
