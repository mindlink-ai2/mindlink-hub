import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceSupabase, getClientIdFromClerkUser } from "@/lib/inbox-server";

export async function GET() {
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

    const { data: rows, error } = await supabase
      .from("inbox_threads")
      .select("unread_count")
      .eq("client_id", clientId);

    if (error) {
      console.error("INBOX_UNREAD_COUNT_GET_ERROR:", error);
      return NextResponse.json({ error: "unread_count_fetch_failed" }, { status: 500 });
    }

    const total = (rows ?? []).reduce((sum, row) => {
      const value =
        row && typeof row === "object" && "unread_count" in row
          ? Number((row as Record<string, unknown>).unread_count ?? 0)
          : 0;
      return Number.isFinite(value) && value > 0 ? sum + value : sum;
    }, 0);

    return NextResponse.json({ total });
  } catch (error: unknown) {
    console.error("INBOX_UNREAD_COUNT_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
