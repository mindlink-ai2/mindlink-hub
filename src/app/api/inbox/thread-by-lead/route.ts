import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceSupabase, getClientIdFromClerkUser } from "@/lib/inbox-server";

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ thread: null }, { status: 200 });
    }

    const url = new URL(req.url);
    const leadIdRaw = url.searchParams.get("leadId")?.trim() ?? "";
    const leadId = Number(leadIdRaw);
    if (!Number.isFinite(leadId) || leadId <= 0) {
      return NextResponse.json({ thread: null }, { status: 200 });
    }

    const supabase = createServiceSupabase();
    const clientId = await getClientIdFromClerkUser(supabase, userId);
    if (!clientId) {
      return NextResponse.json({ thread: null }, { status: 200 });
    }

    const { data: thread, error } = await supabase
      .from("inbox_threads")
      .select("id, unipile_thread_id, contact_name, contact_avatar_url, last_message_at")
      .eq("client_id", clientId)
      .eq("lead_id", leadId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (error || !thread) {
      return NextResponse.json({ thread: null }, { status: 200 });
    }

    return NextResponse.json({ thread });
  } catch (error: unknown) {
    console.error("THREAD_BY_LEAD_ERROR:", error);
    return NextResponse.json({ thread: null }, { status: 200 });
  }
}
