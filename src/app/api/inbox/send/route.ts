import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  createServiceSupabase,
  getClientIdFromClerkUser,
} from "@/lib/inbox-server";
import { sendAndPersistMessageForThread } from "@/lib/linkedin-messaging";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const threadDbId = String(body?.threadDbId ?? "").trim();
    const text = String(body?.text ?? "").trim();

    if (!threadDbId) {
      return NextResponse.json({ error: "threadDbId_required" }, { status: 400 });
    }
    if (!text) {
      return NextResponse.json({ error: "text_required" }, { status: 400 });
    }

    const supabase = createServiceSupabase();
    const clientId = await getClientIdFromClerkUser(supabase, userId);
    if (!clientId) {
      return NextResponse.json({ error: "client_not_found" }, { status: 404 });
    }

    const { data: thread, error: threadErr } = await supabase
      .from("inbox_threads")
      .select("id, lead_id, unipile_account_id, unipile_thread_id")
      .eq("id", threadDbId)
      .eq("client_id", clientId)
      .limit(1)
      .maybeSingle();

    if (threadErr || !thread?.id) {
      return NextResponse.json({ error: "thread_not_found" }, { status: 404 });
    }

    const unipileAccountId = String(thread.unipile_account_id ?? "").trim();
    const unipileThreadId = String(thread.unipile_thread_id ?? "").trim();
    if (!unipileAccountId || !unipileThreadId) {
      return NextResponse.json(
        { error: "invalid_thread_unipile_identifiers" },
        { status: 400 }
      );
    }

    const leadIdNumber = Number(thread.lead_id);
    const leadId = Number.isFinite(leadIdNumber) ? leadIdNumber : null;

    const sendResult = await sendAndPersistMessageForThread({
      supabase,
      clientId,
      leadId,
      threadDbId: String(thread.id),
      unipileAccountId,
      unipileThreadId,
      text,
    });

    if (!sendResult.ok) {
      const statusCode =
        sendResult.status === "send_failed"
          ? 502
          : 500;

      return NextResponse.json(
        {
          error: sendResult.status,
          message: sendResult.userMessage,
        },
        { status: statusCode }
      );
    }

    return NextResponse.json({
      success: true,
      message: {
        unipile_message_id: sendResult.unipileMessageId,
        text,
        sent_at: sendResult.sentAt,
        direction: "outbound",
      },
    });
  } catch (error: unknown) {
    console.error("INBOX_SEND_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
