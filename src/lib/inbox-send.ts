import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeUnipileBase,
  readResponseBody,
  requireEnv,
} from "@/lib/inbox-server";
import { extractLinkedInProfileSlug } from "@/lib/linkedin-url";
import { parseUnipileMessage, toJsonObject, truncatePreview } from "@/lib/unipile-inbox";

type UnipileFailure = {
  status: number;
  payload: unknown;
  url: string;
};

type UnipilePostResult =
  | {
      ok: true;
      payload: unknown;
      url: string;
      status: number;
    }
  | {
      ok: false;
      failure: UnipileFailure | null;
    };

function getPathValue(obj: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function firstString(obj: Record<string, unknown>, paths: string[][]): string | null {
  for (const path of paths) {
    const value = getPathValue(obj, path);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value ?? "");
  }
}

function normalizeErrorMessage(params: {
  message?: string | null;
  details?: unknown;
}): string {
  const raw = `${params.message ?? ""} ${stringifyUnknown(params.details)}`.toLowerCase();
  return raw;
}

export function isForbiddenOrNotConnected(
  errorLike: unknown,
  messageLike?: string | null
): boolean {
  let status: number | null = null;

  if (typeof errorLike === "number") {
    status = errorLike;
  } else if (errorLike && typeof errorLike === "object") {
    const candidate = (errorLike as { status?: unknown }).status;
    if (typeof candidate === "number") status = candidate;
  }

  const normalizedMessage = normalizeErrorMessage({
    message: messageLike,
    details: errorLike,
  });

  if (status === 401 || status === 403) return true;

  return (
    normalizedMessage.includes("not connected") ||
    normalizedMessage.includes("forbidden") ||
    normalizedMessage.includes("member can't be messaged") ||
    normalizedMessage.includes("member cant be messaged") ||
    normalizedMessage.includes("cannot be messaged") ||
    normalizedMessage.includes("not messageable")
  );
}

async function postFirstSuccessfulDetailed(
  urls: string[],
  initBuilder: (url: string) => RequestInit
): Promise<UnipilePostResult> {
  let lastFailure: UnipileFailure | null = null;

  for (const url of urls) {
    try {
      const response = await fetch(url, initBuilder(url));
      const payload = await readResponseBody(response);

      if (response.ok) {
        return { ok: true, payload, url, status: response.status };
      }

      lastFailure = {
        status: response.status,
        payload,
        url,
      };
    } catch (error: unknown) {
      lastFailure = {
        status: 0,
        payload: { error: String(error) },
        url,
      };
    }
  }

  return { ok: false, failure: lastFailure };
}

async function findLatestLeadThread(params: {
  supabase: SupabaseClient;
  clientId: string;
  leadId: string;
  accountId: string;
}): Promise<{ threadDbId: string; chatId: string } | null> {
  const { supabase, clientId, leadId, accountId } = params;

  const { data: thread } = await supabase
    .from("inbox_threads")
    .select("id, unipile_thread_id")
    .eq("client_id", clientId)
    .eq("lead_id", leadId)
    .eq("unipile_account_id", accountId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const threadDbId = thread?.id ? String(thread.id) : "";
  const chatId = typeof thread?.unipile_thread_id === "string" ? thread.unipile_thread_id.trim() : "";

  if (!threadDbId || !chatId) return null;
  return { threadDbId, chatId };
}

async function upsertThreadFromChatId(params: {
  supabase: SupabaseClient;
  clientId: string;
  leadId: string;
  accountId: string;
  chatId: string;
}): Promise<{ threadDbId: string; chatId: string } | null> {
  const { supabase, clientId, leadId, accountId, chatId } = params;

  await supabase
    .from("inbox_threads")
    .upsert(
      {
        client_id: clientId,
        provider: "linkedin",
        lead_id: leadId,
        unipile_account_id: accountId,
        unipile_thread_id: chatId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "client_id,unipile_account_id,unipile_thread_id" }
    );

  const { data: thread } = await supabase
    .from("inbox_threads")
    .select("id, unipile_thread_id")
    .eq("client_id", clientId)
    .eq("unipile_account_id", accountId)
    .eq("unipile_thread_id", chatId)
    .limit(1)
    .maybeSingle();

  const threadDbId = thread?.id ? String(thread.id) : "";
  const normalizedChatId =
    typeof thread?.unipile_thread_id === "string" ? thread.unipile_thread_id.trim() : "";

  if (!threadDbId || !normalizedChatId) return null;
  return { threadDbId, chatId: normalizedChatId };
}

function extractChatId(payload: unknown): string | null {
  const obj = toJsonObject(payload);
  const data = toJsonObject(obj.data);
  const message = toJsonObject(obj.message);

  return (
    firstString(obj, [["chat_id"], ["chatId"], ["conversation_id"], ["conversationId"], ["id"]]) ??
    firstString(data, [["chat_id"], ["chatId"], ["conversation_id"], ["conversationId"], ["id"]]) ??
    firstString(message, [["chat_id"], ["chatId"], ["conversation_id"], ["conversationId"], ["id"]])
  );
}

function extractProviderId(payload: unknown): string | null {
  const obj = toJsonObject(payload);
  const data = toJsonObject(obj.data);

  return (
    firstString(obj, [["provider_id"], ["providerId"], ["public_identifier"], ["publicIdentifier"]]) ??
    firstString(data, [["provider_id"], ["providerId"], ["public_identifier"], ["publicIdentifier"]])
  );
}

async function resolveLinkedinProviderIdForLead(params: {
  supabase: SupabaseClient;
  clientId: string;
  leadId: string;
  accountId: string;
}): Promise<
  | { ok: true; providerId: string }
  | { ok: false; status: number | null; error: string; details?: unknown }
> {
  const { supabase, clientId, leadId, accountId } = params;

  const { data: lead } = await supabase
    .from("leads")
    .select("id, LinkedInURL")
    .eq("client_id", clientId)
    .eq("id", leadId)
    .limit(1)
    .maybeSingle();

  const linkedinUrl = typeof lead?.LinkedInURL === "string" ? lead.LinkedInURL.trim() : "";
  const slug = extractLinkedInProfileSlug(linkedinUrl);

  if (!slug) {
    return { ok: false, status: null, error: "linkedin_slug_missing" };
  }

  const base = normalizeUnipileBase(requireEnv("UNIPILE_DSN"));
  const apiKey = requireEnv("UNIPILE_API_KEY");
  const url = `${base}/api/v1/users/${encodeURIComponent(slug)}?account_id=${encodeURIComponent(accountId)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-KEY": apiKey,
        accept: "application/json",
      },
    });

    const payload = await readResponseBody(response);
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: "provider_lookup_failed",
        details: payload,
      };
    }

    const providerId = extractProviderId(payload);
    if (!providerId) {
      return {
        ok: false,
        status: response.status,
        error: "provider_id_missing",
        details: payload,
      };
    }

    return { ok: true, providerId };
  } catch (error: unknown) {
    return {
      ok: false,
      status: null,
      error: "provider_lookup_request_failed",
      details: String(error),
    };
  }
}

async function logEnsureThreadAndSend(params: {
  supabase: SupabaseClient;
  clientId: string;
  leadId: string;
  accountId: string;
  providerId: string | null;
  mode: string;
  chatId?: string | null;
  errorStatus?: number | null;
  error?: string | null;
}) {
  const { supabase, clientId, leadId, accountId, providerId, mode, chatId = null, errorStatus = null, error = null } = params;

  const leadIdNumber = Number(leadId);
  try {
    await supabase
      .from("automation_logs")
      .insert({
        client_id: clientId,
        runner: "ensure-thread-and-send",
        action: "send_message",
        status: mode,
        lead_id: Number.isFinite(leadIdNumber) ? leadIdNumber : null,
        unipile_account_id: accountId,
        details: {
          lead_id: leadId,
          account_id: accountId,
          linkedin_provider_id: providerId,
          mode,
          chat_id: chatId,
          error_status: errorStatus,
          error,
        },
      })
      .throwOnError();
  } catch {
    // Best effort logging only.
  }
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

  const sendResult = await postFirstSuccessfulDetailed(
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

  if (!sendResult.ok) {
    const failure = sendResult.failure;
    const blocked = isForbiddenOrNotConnected(failure?.status ?? null, stringifyUnknown(failure?.payload));

    return {
      ok: false as const,
      status: failure?.status && failure.status > 0 ? failure.status : blocked ? 403 : 502,
      error: blocked ? "NOT_CONNECTED_OR_NOT_MESSAGEABLE" : "unipile_send_failed",
      details: failure?.payload ?? null,
      error_status: failure?.status ?? null,
    };
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

export async function ensureThreadAndSendMessage(params: {
  supabase: SupabaseClient;
  clientId: string;
  leadId: string;
  accountId: string;
  linkedinProviderId?: string | null;
  text: string;
}) {
  const { supabase, clientId, leadId, accountId, text } = params;
  let providerId = String(params.linkedinProviderId ?? "").trim() || null;

  const existingThread = await findLatestLeadThread({
    supabase,
    clientId,
    leadId,
    accountId,
  });

  if (existingThread) {
    const sent = await sendLinkedinMessageForThread({
      supabase,
      clientId,
      threadDbId: existingThread.threadDbId,
      text,
    });

    if (sent.ok) {
      await logEnsureThreadAndSend({
        supabase,
        clientId,
        leadId,
        accountId,
        providerId,
        mode: "existing_thread",
        chatId: existingThread.chatId,
      });

      return {
        ok: true as const,
        mode: "existing_thread" as const,
        chat_id: existingThread.chatId,
        threadDbId: existingThread.threadDbId,
        message: sent.message,
      };
    }

    if (isForbiddenOrNotConnected(sent.status, sent.error)) {
      await logEnsureThreadAndSend({
        supabase,
        clientId,
        leadId,
        accountId,
        providerId,
        mode: "blocked",
        chatId: existingThread.chatId,
        errorStatus: sent.status,
        error: sent.error,
      });

      return {
        ok: false as const,
        mode: "blocked" as const,
        reason: "NOT_CONNECTED_OR_NOT_MESSAGEABLE" as const,
        error_status: sent.status,
        details: "details" in sent ? sent.details : null,
      };
    }

    await logEnsureThreadAndSend({
      supabase,
      clientId,
      leadId,
      accountId,
      providerId,
      mode: "error",
      chatId: existingThread.chatId,
      errorStatus: sent.status,
      error: sent.error,
    });

    return {
      ok: false as const,
      mode: "error" as const,
      error: sent.error,
      error_status: sent.status,
      details: "details" in sent ? sent.details : null,
    };
  }

  if (!providerId) {
    const resolvedProvider = await resolveLinkedinProviderIdForLead({
      supabase,
      clientId,
      leadId,
      accountId,
    });

    if (!resolvedProvider.ok) {
      const blocked = isForbiddenOrNotConnected(
        resolvedProvider.status,
        normalizeErrorMessage({ message: resolvedProvider.error, details: resolvedProvider.details })
      );

      await logEnsureThreadAndSend({
        supabase,
        clientId,
        leadId,
        accountId,
        providerId: null,
        mode: blocked ? "blocked" : "error",
        errorStatus: resolvedProvider.status,
        error: resolvedProvider.error,
      });

      if (blocked) {
        return {
          ok: false as const,
          mode: "blocked" as const,
          reason: "NOT_CONNECTED_OR_NOT_MESSAGEABLE" as const,
          error_status: resolvedProvider.status,
          details: resolvedProvider.details ?? null,
        };
      }

      return {
        ok: false as const,
        mode: "error" as const,
        error: resolvedProvider.error,
        error_status: resolvedProvider.status,
        details: resolvedProvider.details ?? null,
      };
    }

    providerId = resolvedProvider.providerId;
  }

  const base = normalizeUnipileBase(requireEnv("UNIPILE_DSN"));
  const apiKey = requireEnv("UNIPILE_API_KEY");

  const createChatResult = await postFirstSuccessfulDetailed(
    [
      `${base}/api/v1/chats`,
      `${base}/api/v1/conversations`,
    ],
    () => ({
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        account_id: accountId,
        provider: "LINKEDIN",
        attendees: [{ provider_id: providerId }],
        text,
      }),
    })
  );

  if (!createChatResult.ok) {
    const failure = createChatResult.failure;
    const message = normalizeErrorMessage({ message: "create_chat_failed", details: failure?.payload });
    const blocked = isForbiddenOrNotConnected(failure?.status ?? null, message);

    await logEnsureThreadAndSend({
      supabase,
      clientId,
      leadId,
      accountId,
      providerId,
      mode: blocked ? "blocked" : "error",
      errorStatus: failure?.status ?? null,
      error: blocked ? "NOT_CONNECTED_OR_NOT_MESSAGEABLE" : "unipile_create_chat_failed",
    });

    if (blocked) {
      return {
        ok: false as const,
        mode: "blocked" as const,
        reason: "NOT_CONNECTED_OR_NOT_MESSAGEABLE" as const,
        error_status: failure?.status ?? null,
        details: failure?.payload ?? null,
      };
    }

    return {
      ok: false as const,
      mode: "error" as const,
      error: "unipile_create_chat_failed",
      error_status: failure?.status ?? null,
      details: failure?.payload ?? null,
    };
  }

  const createdChatId = extractChatId(createChatResult.payload);
  if (!createdChatId) {
    await logEnsureThreadAndSend({
      supabase,
      clientId,
      leadId,
      accountId,
      providerId,
      mode: "error",
      errorStatus: createChatResult.status,
      error: "UNIPILE_CREATE_CHAT_NO_ID",
    });

    return {
      ok: false as const,
      mode: "error" as const,
      error: "UNIPILE_CREATE_CHAT_NO_ID",
      error_status: createChatResult.status,
      details: createChatResult.payload,
    };
  }

  // Idempotence: if another worker just created/stored a thread for this lead, reuse it.
  const racedThread = await findLatestLeadThread({
    supabase,
    clientId,
    leadId,
    accountId,
  });

  const targetThread =
    racedThread && racedThread.chatId !== createdChatId
      ? racedThread
      : await upsertThreadFromChatId({
          supabase,
          clientId,
          leadId,
          accountId,
          chatId: createdChatId,
        });

  if (!targetThread) {
    await logEnsureThreadAndSend({
      supabase,
      clientId,
      leadId,
      accountId,
      providerId,
      mode: "error",
      chatId: createdChatId,
      error: "thread_upsert_failed",
    });

    return {
      ok: false as const,
      mode: "error" as const,
      error: "thread_upsert_failed",
      error_status: null,
    };
  }

  const sent = await sendLinkedinMessageForThread({
    supabase,
    clientId,
    threadDbId: targetThread.threadDbId,
    text,
  });

  if (!sent.ok) {
    const blocked = isForbiddenOrNotConnected(sent.status, sent.error);
    await logEnsureThreadAndSend({
      supabase,
      clientId,
      leadId,
      accountId,
      providerId,
      mode: blocked ? "blocked" : "error",
      chatId: targetThread.chatId,
      errorStatus: sent.status,
      error: sent.error,
    });

    if (blocked) {
      return {
        ok: false as const,
        mode: "blocked" as const,
        reason: "NOT_CONNECTED_OR_NOT_MESSAGEABLE" as const,
        error_status: sent.status,
        details: "details" in sent ? sent.details : null,
      };
    }

    return {
      ok: false as const,
      mode: "error" as const,
      error: sent.error,
      error_status: sent.status,
      details: "details" in sent ? sent.details : null,
    };
  }

  await logEnsureThreadAndSend({
    supabase,
    clientId,
    leadId,
    accountId,
    providerId,
    mode: "created_thread",
    chatId: targetThread.chatId,
  });

  return {
    ok: true as const,
    mode: "created_thread" as const,
    chat_id: targetThread.chatId,
    threadDbId: targetThread.threadDbId,
    message: sent.message,
  };
}
