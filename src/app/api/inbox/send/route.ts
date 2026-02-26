import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  createServiceSupabase,
  getClientIdFromClerkUser,
} from "@/lib/inbox-server";
import { sendLinkedinMessageForThread } from "@/lib/inbox-send";

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

    const sendResult = await sendLinkedinMessageForThread({
      supabase,
      clientId,
      threadDbId,
      text,
    });

    if (!sendResult.ok) {
      return NextResponse.json(
        {
          error: sendResult.error,
          details: "details" in sendResult ? sendResult.details : undefined,
        },
        { status: sendResult.status }
      );
    }

    return NextResponse.json({ success: true, message: sendResult.message });
  } catch (error: unknown) {
    console.error("INBOX_SEND_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
