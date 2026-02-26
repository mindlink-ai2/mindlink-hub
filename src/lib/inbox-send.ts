import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeUnipileBase,
  readResponseBody,
  requireEnv,
} from "@/lib/inbox-server";
import { parseUnipileMessage, toJsonObject, truncatePreview } from "@/lib/unipile-inbox";

async function postFirstSuccessful(
  urls: string[],
  initBuilder: (url: string) => RequestInit
): Promise<{ payload: unknown; url: string } | null> {
  for (const url of urls) {
    const response = await fetch(url, initBuilder(url));
    const payload = await readResponseBody(response);
    if (response.ok) {
      return { payload, url };
    }
  }
  return null;
}

export async function sendLinkedinMessageForThread(params: {
  supabase: SupabaseClient;
  clientId: string;
  threadDbId: string;
  text: string;
}) {
  const { supabase, clientId, threadDbId, text } = params;

  const { data: thread, error: threadErr } = await supabase
    .from("inbox_threads")
    .select("id, lead_id, unipile_account_id, unipile_thread_id")
    .eq("id", threadDbId)
    .eq("client_id", clientId)
    .limit(1)
    .maybeSingle();

  if (threadErr || !thread?.id) {
    return { ok: false as const, status: 404, error: "thread_not_found" };
  }

  const unipileAccountId = String(thread.unipile_account_id ?? "").trim();
  const unipileThreadId = String(thread.unipile_thread_id ?? "").trim();
  if (!unipileAccountId || !unipileThreadId) {
    return {
      ok: false as const,
      status: 400,
      error: "invalid_thread_unipile_identifiers",
    };
  }

  const base = normalizeUnipileBase(requireEnv("UNIPILE_DSN"));
  const apiKey = requireEnv("UNIPILE_API_KEY");

  const sendResult = await postFirstSuccessful(
    [
      `${base}/api/v1/chats/${encodeURIComponent(unipileThreadId)}/messages`,
      `${base}/api/v1/conversations/${encodeURIComponent(unipileThreadId)}/messages`,
      `${base}/api/v1/messages`,
    ],
    (url) => ({
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        /\/api\/v1\/messages$/.test(url)
          ? {
              account_id: unipileAccountId,
              chat_id: unipileThreadId,
              text,
            }
          : {
              account_id: unipileAccountId,
              text,
            }
      ),
    })
  );

  if (!sendResult) {
    return { ok: false as const, status: 502, error: "unipile_send_failed" };
  }

  const responseObject = toJsonObject(sendResult.payload);
  const parsedMessage = parseUnipileMessage({
    ...responseObject,
    ...(toJsonObject(responseObject.data)),
    ...(toJsonObject(responseObject.message)),
    direction: "outbound",
    thread_id: unipileThreadId,
    text,
  });

  if (!parsedMessage.unipileMessageId) {
    return {
      ok: false as const,
      status: 502,
      error: "unipile_message_id_missing",
      details: sendResult.payload,
    };
  }

  const sentAt = parsedMessage.sentAtIso;
  const messageRecord = {
    client_id: clientId,
    provider: "linkedin",
    thread_db_id: String(thread.id),
    unipile_account_id: unipileAccountId,
    unipile_thread_id: unipileThreadId,
    unipile_message_id: parsedMessage.unipileMessageId,
    direction: "outbound",
    sender_name: null,
    sender_linkedin_url: parsedMessage.senderLinkedInUrl,
    text,
    sent_at: sentAt,
    raw: sendResult.payload,
  };

  const { data: existingMessage, error: existingMessageErr } = await supabase
    .from("inbox_messages")
    .select("id")
    .eq("client_id", clientId)
    .eq("unipile_account_id", unipileAccountId)
    .eq("unipile_message_id", parsedMessage.unipileMessageId)
    .limit(1)
    .maybeSingle();

  if (existingMessageErr) {
    return {
      ok: false as const,
      status: 500,
      error: "message_exists_lookup_failed",
    };
  }

  if (!existingMessage?.id) {
    const { error: messageInsertErr } = await supabase
      .from("inbox_messages")
      .insert(messageRecord);

    if (messageInsertErr) {
      return { ok: false as const, status: 500, error: "message_insert_failed" };
    }
  }

  const { error: threadUpdateErr } = await supabase
    .from("inbox_threads")
    .update({
      last_message_at: sentAt,
      last_message_preview: truncatePreview(text),
      updated_at: new Date().toISOString(),
    })
    .eq("id", thread.id)
    .eq("client_id", clientId);

  if (threadUpdateErr) {
    console.error("INBOX_SEND_THREAD_UPDATE_ERROR:", threadUpdateErr);
  }

  return {
    ok: true as const,
    threadId: String(thread.id),
    threadLeadId:
      thread.lead_id === null || thread.lead_id === undefined ? null : String(thread.lead_id),
    unipileAccountId,
    message: {
      unipile_message_id: parsedMessage.unipileMessageId,
      text,
      sent_at: sentAt,
      direction: "outbound" as const,
    },
  };
}
