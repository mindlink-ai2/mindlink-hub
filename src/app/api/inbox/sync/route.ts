import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractLinkedInProfileSlug, normalizeLinkedInUrl } from "@/lib/linkedin-url";
import {
  createServiceSupabase,
  getClientIdFromClerkUser,
  getLinkedinUnipileAccountId,
  normalizeUnipileBase,
  readResponseBody,
  requireEnv,
} from "@/lib/inbox-server";
import {
  extractArrayCandidates,
  getFirstString,
  parseUnipileMessage,
  truncatePreview,
  type JsonObject,
} from "@/lib/unipile-inbox";

type ParsedThread = {
  unipileThreadId: string;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  leadLinkedInUrl: string | null;
  leadId: number | string | null;
};

function parseThreadFromItem(
  item: JsonObject,
  leadId: number | string | null
): ParsedThread | null {
  const unipileThreadId = getFirstString(item, [
    ["thread_id"],
    ["threadId"],
    ["conversation_id"],
    ["conversationId"],
    ["chat_id"],
    ["chatId"],
    ["id"],
  ]);

  if (!unipileThreadId) return null;

  const lastMessageAtRaw = getFirstString(item, [
    ["last_message_at"],
    ["lastMessageAt"],
    ["updated_at"],
    ["updatedAt"],
    ["created_at"],
    ["createdAt"],
    ["last_message", "sent_at"],
    ["last_message", "created_at"],
  ]);

  const lastMessageAtDate = lastMessageAtRaw ? new Date(lastMessageAtRaw) : new Date();
  const lastMessageAt = Number.isNaN(lastMessageAtDate.getTime())
    ? new Date().toISOString()
    : lastMessageAtDate.toISOString();

  const preview = truncatePreview(
    getFirstString(item, [
      ["last_message_preview"],
      ["lastMessagePreview"],
      ["last_message", "text"],
      ["last_message", "content"],
      ["last_message", "body"],
      ["snippet"],
    ])
  );

  const leadLinkedInUrl = normalizeLinkedInUrl(
    getFirstString(item, [
      ["lead_linkedin_url"],
      ["leadLinkedInUrl"],
      ["participant", "linkedin_url"],
      ["participant", "profile_url"],
      ["contact", "linkedin_url"],
      ["contact", "profile_url"],
    ])
  );

  return {
    unipileThreadId,
    lastMessageAt,
    lastMessagePreview: preview,
    leadLinkedInUrl,
    leadId,
  };
}

async function fetchFirstSuccessful(
  urls: string[],
  init: RequestInit
): Promise<{ payload: unknown; url: string } | null> {
  for (const url of urls) {
    const response = await fetch(url, init);
    const payload = await readResponseBody(response);
    if (response.ok) {
      return { payload, url };
    }
  }
  return null;
}

async function resolveLeadIdByUrl(
  supabase: SupabaseClient,
  clientId: string,
  linkedinUrl: string | null
): Promise<number | string | null> {
  if (!linkedinUrl) return null;

  const normalized = normalizeLinkedInUrl(linkedinUrl);
  const slug = extractLinkedInProfileSlug(linkedinUrl);
  if (!normalized && !slug) return null;

  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, LinkedInURL")
    .eq("client_id", clientId)
    .not("LinkedInURL", "is", null);

  if (error || !Array.isArray(leads)) {
    console.error("INBOX_SYNC_LEAD_LOOKUP_ERROR:", error);
    return null;
  }

  if (normalized) {
    const match = leads.find((lead) => {
      const rawUrl =
        lead && typeof lead === "object" && "LinkedInURL" in lead
          ? String((lead as Record<string, unknown>).LinkedInURL ?? "")
          : "";
      return normalizeLinkedInUrl(rawUrl) === normalized;
    });

    if (match && typeof match === "object" && "id" in match) {
      const id = (match as Record<string, unknown>).id;
      if (typeof id === "string" || typeof id === "number") return id;
    }
  }

  if (slug) {
    const match = leads.find((lead) => {
      const rawUrl =
        lead && typeof lead === "object" && "LinkedInURL" in lead
          ? String((lead as Record<string, unknown>).LinkedInURL ?? "")
          : "";
      return extractLinkedInProfileSlug(rawUrl) === slug;
    });

    if (match && typeof match === "object" && "id" in match) {
      const id = (match as Record<string, unknown>).id;
      if (typeof id === "string" || typeof id === "number") return id;
    }
  }

  return null;
}

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

    const unipileAccountId = await getLinkedinUnipileAccountId(supabase, clientId);
    if (!unipileAccountId) {
      return NextResponse.json(
        { error: "linkedin_account_not_connected" },
        { status: 404 }
      );
    }

    const base = normalizeUnipileBase(requireEnv("UNIPILE_DSN"));
    const apiKey = requireEnv("UNIPILE_API_KEY");

    const threadResult = await fetchFirstSuccessful(
      [
        `${base}/api/v1/chats?account_id=${encodeURIComponent(unipileAccountId)}&limit=100`,
        `${base}/api/v1/conversations?account_id=${encodeURIComponent(
          unipileAccountId
        )}&limit=100`,
      ],
      {
        method: "GET",
        headers: {
          "X-API-KEY": apiKey,
          accept: "application/json",
        },
      }
    );

    if (!threadResult) {
      return NextResponse.json({ error: "unipile_threads_fetch_failed" }, { status: 502 });
    }

    const threadItems = extractArrayCandidates(threadResult.payload);
    let threadsSynced = 0;
    let messagesInserted = 0;

    for (const threadItem of threadItems) {
      const participantUrl = normalizeLinkedInUrl(
        getFirstString(threadItem, [
          ["participant", "linkedin_url"],
          ["participant", "profile_url"],
          ["contact", "linkedin_url"],
          ["contact", "profile_url"],
          ["lead_linkedin_url"],
          ["leadLinkedInUrl"],
        ])
      );
      const leadId = await resolveLeadIdByUrl(supabase, clientId, participantUrl);

      const parsedThread = parseThreadFromItem(threadItem, leadId);
      if (!parsedThread) continue;

      const threadUpsertRecord: Record<string, unknown> = {
        client_id: clientId,
        provider: "linkedin",
        unipile_account_id: unipileAccountId,
        unipile_thread_id: parsedThread.unipileThreadId,
        last_message_at: parsedThread.lastMessageAt,
        last_message_preview: parsedThread.lastMessagePreview,
        unread_count: 0,
        updated_at: new Date().toISOString(),
      };

      if (parsedThread.leadId !== null) {
        threadUpsertRecord.lead_id = parsedThread.leadId;
      }

      const threadLeadUrl = parsedThread.leadLinkedInUrl ?? participantUrl;
      if (threadLeadUrl) {
        threadUpsertRecord.lead_linkedin_url = threadLeadUrl;
      }

      const { error: threadUpsertErr } = await supabase
        .from("inbox_threads")
        .upsert(threadUpsertRecord, {
          onConflict: "client_id,unipile_account_id,unipile_thread_id",
        });

      if (threadUpsertErr) {
        console.error("INBOX_SYNC_THREAD_UPSERT_ERROR:", threadUpsertErr);
        continue;
      }

      threadsSynced += 1;

      const { data: dbThread } = await supabase
        .from("inbox_threads")
        .select("id")
        .eq("client_id", clientId)
        .eq("unipile_account_id", unipileAccountId)
        .eq("unipile_thread_id", parsedThread.unipileThreadId)
        .limit(1)
        .maybeSingle();

      if (!dbThread?.id) continue;

      const messagesResult = await fetchFirstSuccessful(
        [
          `${base}/api/v1/chats/${encodeURIComponent(
            parsedThread.unipileThreadId
          )}/messages?account_id=${encodeURIComponent(unipileAccountId)}&limit=30`,
          `${base}/api/v1/conversations/${encodeURIComponent(
            parsedThread.unipileThreadId
          )}/messages?account_id=${encodeURIComponent(unipileAccountId)}&limit=30`,
          `${base}/api/v1/messages?account_id=${encodeURIComponent(
            unipileAccountId
          )}&chat_id=${encodeURIComponent(parsedThread.unipileThreadId)}&limit=30`,
        ],
        {
          method: "GET",
          headers: {
            "X-API-KEY": apiKey,
            accept: "application/json",
          },
        }
      );

      if (!messagesResult) continue;

      const messageItems = extractArrayCandidates(messagesResult.payload);
      for (const messageItem of messageItems) {
        const parsedMessage = parseUnipileMessage({
          ...messageItem,
          thread_id:
            getFirstString(messageItem, [["thread_id"], ["threadId"]]) ??
            parsedThread.unipileThreadId,
        });

        if (!parsedMessage.unipileMessageId) continue;

        const { data: existingMessage, error: existingMessageErr } = await supabase
          .from("inbox_messages")
          .select("id")
          .eq("client_id", clientId)
          .eq("unipile_account_id", unipileAccountId)
          .eq("unipile_message_id", parsedMessage.unipileMessageId)
          .limit(1)
          .maybeSingle();

        if (existingMessageErr) {
          console.error("INBOX_SYNC_MESSAGE_EXISTS_ERROR:", existingMessageErr);
          continue;
        }

        if (existingMessage?.id) continue;

        const { error: messageInsertErr } = await supabase.from("inbox_messages").insert({
          client_id: clientId,
          provider: "linkedin",
          thread_db_id: String(dbThread.id),
          unipile_account_id: unipileAccountId,
          unipile_thread_id: parsedMessage.unipileThreadId ?? parsedThread.unipileThreadId,
          unipile_message_id: parsedMessage.unipileMessageId,
          direction: parsedMessage.direction,
          sender_name: parsedMessage.senderName,
          sender_linkedin_url: parsedMessage.senderLinkedInUrl,
          text: parsedMessage.text,
          sent_at: parsedMessage.sentAtIso,
          raw: messageItem,
        });

        if (messageInsertErr) {
          console.error("INBOX_SYNC_MESSAGE_INSERT_ERROR:", messageInsertErr);
          continue;
        }

        messagesInserted += 1;
      }
    }

    return NextResponse.json({ success: true, threadsSynced, messagesInserted });
  } catch (error: unknown) {
    console.error("INBOX_SYNC_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
