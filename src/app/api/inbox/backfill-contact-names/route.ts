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

    const { data: threads, error: threadsErr } = await supabase
      .from("inbox_threads")
      .select("id")
      .eq("client_id", clientId);

    if (threadsErr) {
      console.error("INBOX_BACKFILL_THREADS_ERROR:", threadsErr);
      return NextResponse.json({ error: "threads_fetch_failed" }, { status: 500 });
    }

    let updatedThreads = 0;
    for (const thread of threads ?? []) {
      const threadId = String(thread?.id ?? "").trim();
      if (!threadId) continue;

      const { data: latestInbound, error: latestInboundErr } = await supabase
        .from("inbox_messages")
        .select("sender_name, sender_linkedin_url")
        .eq("client_id", clientId)
        .eq("thread_db_id", threadId)
        .eq("direction", "inbound")
        .not("sender_name", "is", null)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestInboundErr) {
        console.error("INBOX_BACKFILL_LATEST_INBOUND_ERROR:", latestInboundErr);
        continue;
      }

      const senderName =
        typeof latestInbound?.sender_name === "string"
          ? latestInbound.sender_name.trim()
          : "";
      if (!senderName) continue;

      const updatePayload: Record<string, unknown> = {
        contact_name: senderName,
        updated_at: new Date().toISOString(),
      };

      const senderLinkedInUrl =
        typeof latestInbound?.sender_linkedin_url === "string"
          ? latestInbound.sender_linkedin_url.trim()
          : "";
      if (senderLinkedInUrl) {
        updatePayload.contact_linkedin_url = senderLinkedInUrl;
      }

      const { error: updateErr } = await supabase
        .from("inbox_threads")
        .update(updatePayload)
        .eq("id", threadId)
        .eq("client_id", clientId);

      if (updateErr) {
        console.error("INBOX_BACKFILL_THREAD_UPDATE_ERROR:", updateErr);
        continue;
      }

      updatedThreads += 1;
    }

    return NextResponse.json({ success: true, updatedThreads });
  } catch (error: unknown) {
    console.error("INBOX_BACKFILL_CONTACT_NAMES_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
