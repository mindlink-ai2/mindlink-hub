import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceSupabase, getClientIdFromClerkUser } from "@/lib/inbox-server";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ threads: [] }, { status: 200 });
    }

    const supabase = createServiceSupabase();
    const clientId = await getClientIdFromClerkUser(supabase, userId);
    if (!clientId) {
      return NextResponse.json({ threads: [] }, { status: 200 });
    }

    const { data: threads, error } = await supabase
      .from("inbox_threads")
      .select(
        "id, provider, unipile_account_id, unipile_thread_id, lead_id, lead_linkedin_url, last_message_at, last_message_preview, unread_count, created_at, updated_at"
      )
      .eq("client_id", clientId)
      .order("last_message_at", { ascending: false, nullsFirst: false });

    if (error) {
      return NextResponse.json({ error: "threads_fetch_failed" }, { status: 500 });
    }

    return NextResponse.json({ threads: threads ?? [] });
  } catch (error: unknown) {
    console.error("INBOX_THREADS_GET_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
