import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceSupabase, getClientIdFromClerkUser } from "@/lib/inbox-server";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const threadDbId = String(body?.threadDbId ?? "").trim();
    if (!threadDbId) {
      return NextResponse.json({ error: "threadDbId_required" }, { status: 400 });
    }

    const supabase = createServiceSupabase();
    const clientId = await getClientIdFromClerkUser(supabase, userId);
    if (!clientId) {
      return NextResponse.json({ error: "client_not_found" }, { status: 404 });
    }

    const { error } = await supabase
      .from("inbox_threads")
      .update({ unread_count: 0, updated_at: new Date().toISOString() })
      .eq("id", threadDbId)
      .eq("client_id", clientId);

    if (error) {
      return NextResponse.json({ error: "mark_read_failed" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("INBOX_MARK_READ_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
