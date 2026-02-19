import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceSupabase, getClientIdFromClerkUser } from "@/lib/inbox-server";
import {
  extractSenderAttendeeId,
  resolveAttendeeForMessage,
} from "@/lib/unipile-attendees";
import { toJsonObject } from "@/lib/unipile-inbox";

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
      .select("id, unipile_account_id, unipile_thread_id")
      .eq("client_id", clientId);

    if (threadsErr) {
      console.error("INBOX_BACKFILL_THREADS_ERROR:", threadsErr);
      return NextResponse.json({ error: "threads_fetch_failed" }, { status: 500 });
    }

    let updatedThreads = 0;
    for (const thread of threads ?? []) {
      const threadObj = toJsonObject(thread);
      const threadId = String(threadObj.id ?? "").trim();
      const unipileAccountId = String(threadObj.unipile_account_id ?? "").trim();
      const unipileThreadId = String(threadObj.unipile_thread_id ?? "").trim();
      if (!threadId || !unipileAccountId || !unipileThreadId) continue;

      const { data: latestInbound, error: latestInboundErr } = await supabase
        .from("inbox_messages")
        .select("id, sender_name, sender_linkedin_url, raw")
        .eq("client_id", clientId)
        .eq("thread_db_id", threadId)
        .eq("direction", "inbound")
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
      const senderLinkedInUrl =
        typeof latestInbound?.sender_linkedin_url === "string"
          ? latestInbound.sender_linkedin_url.trim()
          : "";
      const senderAttendeeId = extractSenderAttendeeId(latestInbound?.raw);

      let resolvedSenderName = senderName;
      let resolvedSenderLinkedInUrl = senderLinkedInUrl;
      if ((!resolvedSenderName || !resolvedSenderLinkedInUrl) && senderAttendeeId) {
        const resolved = await resolveAttendeeForMessage({
          supabase,
          clientId,
          unipileAccountId,
          senderAttendeeId,
          chatId: unipileThreadId,
        });

        if (resolved?.name && !resolvedSenderName) {
          resolvedSenderName = resolved.name;
        }
        if (resolved?.linkedinUrl && !resolvedSenderLinkedInUrl) {
          resolvedSenderLinkedInUrl = resolved.linkedinUrl;
        }

        if (latestInbound?.id && (resolved?.name || resolved?.linkedinUrl)) {
          const messagePatch: Record<string, unknown> = {};
          if (resolved?.name && !senderName) {
            messagePatch.sender_name = resolved.name;
          }
          if (resolved?.linkedinUrl && !senderLinkedInUrl) {
            messagePatch.sender_linkedin_url = resolved.linkedinUrl;
          }

          if (Object.keys(messagePatch).length > 0) {
            const { error: messageUpdateErr } = await supabase
              .from("inbox_messages")
              .update(messagePatch)
              .eq("id", String(latestInbound.id))
              .eq("client_id", clientId);

            if (messageUpdateErr) {
              console.error("INBOX_BACKFILL_MESSAGE_UPDATE_ERROR:", messageUpdateErr);
            }
          }
        }
      }

      if (!resolvedSenderName) continue;

      const updatePayload: Record<string, unknown> = {
        contact_name: resolvedSenderName,
        updated_at: new Date().toISOString(),
      };

      if (resolvedSenderLinkedInUrl) {
        updatePayload.contact_linkedin_url = resolvedSenderLinkedInUrl;
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
