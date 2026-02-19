import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceSupabase, getClientIdFromClerkUser } from "@/lib/inbox-server";

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ messages: [] }, { status: 200 });
    }

    const url = new URL(req.url);
    const threadDbId = url.searchParams.get("threadDbId")?.trim() ?? "";
    if (!threadDbId) {
      return NextResponse.json({ messages: [] }, { status: 200 });
    }

    const supabase = createServiceSupabase();
    const clientId = await getClientIdFromClerkUser(supabase, userId);
    if (!clientId) {
      return NextResponse.json({ messages: [] }, { status: 200 });
    }

    const { data: thread, error: threadErr } = await supabase
      .from("inbox_threads")
      .select("id")
      .eq("id", threadDbId)
      .eq("client_id", clientId)
      .limit(1)
      .maybeSingle();

    if (threadErr || !thread?.id) {
      return NextResponse.json({ messages: [] }, { status: 200 });
    }

    const { data: messages, error } = await supabase
      .from("inbox_messages")
      .select(
        "id, provider, thread_db_id, unipile_account_id, unipile_thread_id, unipile_message_id, direction, sender_name, sender_linkedin_url, text, sent_at, raw"
      )
      .eq("client_id", clientId)
      .eq("thread_db_id", threadDbId)
      .order("sent_at", { ascending: true, nullsFirst: true });

    if (error) {
      return NextResponse.json({ error: "messages_fetch_failed" }, { status: 500 });
    }

    return NextResponse.json({ messages: messages ?? [] });
  } catch (error: unknown) {
    console.error("INBOX_MESSAGES_GET_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
