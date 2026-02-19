import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceSupabase, getClientIdFromClerkUser } from "@/lib/inbox-server";

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const supabase = createServiceSupabase();
    const clientId = await getClientIdFromClerkUser(supabase, userId);
    if (!clientId) {
      return NextResponse.json({ error: "client_not_found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("inbox_threads")
      .update({
        unread_count: 0,
        last_read_at: now,
        updated_at: now,
      })
      .eq("client_id", clientId);

    if (error) {
      console.error("INBOX_MARK_ALL_READ_ERROR:", error);
      return NextResponse.json({ error: "mark_all_read_failed" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("INBOX_MARK_ALL_READ_ROUTE_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
