import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { extractLinkedInProfileSlug, normalizeLinkedInUrl } from "@/lib/linkedin-url";
import { normalizeUnipileBase, readResponseBody, requireEnv } from "@/lib/inbox-server";
import {
  extractArrayCandidates,
  getFirstString,
  parseUnipileMessage,
  toJsonObject,
  truncatePreview,
} from "@/lib/unipile-inbox";

type JsonObject = Record<string, unknown>;

type ThreadLookupRow = {
  id: string;
  unipile_thread_id: string | null;
  lead_linkedin_url: string | null;
  contact_linkedin_url: string | null;
};

type SendInThreadResult =
  | {
      ok: true;
      unipileMessageId: string;
      sentAt: string;
      senderLinkedInUrl: string | null;
      payload: unknown;
    }
  | {
      ok: false;
      status: "send_failed";
      userMessage: string;
      details: unknown;
    };

export type EnsureThreadAndSendMessageResult =
  | {
      ok: true;
      threadDbId: string;
      unipileThreadId: string;
      unipileMessageId: string;
      sentAt: string;
      senderLinkedInUrl: string | null;
      threadCreated: boolean;
      providerId: string | null;
    }
  | {
      ok: false;
      status:
        | "provider_id_missing"
        | "conversation_create_failed"
        | "thread_upsert_failed"
        | "send_failed"
        | "message_persist_failed";
      userMessage: string;
      details?: unknown;
      providerId: string | null;
      unipileThreadId: string | null;
    };

export type ResolveProviderIdResult =
  | { ok: true; providerId: string; source: "invitation_raw" | "profile_lookup" }
  | {
      ok: false;
      status: "provider_id_missing" | "profile_lookup_failed";
      userMessage: string;
      details?: unknown;
    };

export function extractProviderId(payload: unknown): string | null {
  const data = toJsonObject(payload);
  return getFirstString(data, [
    ["provider_id"],
    ["providerId"],
    ["data", "provider_id"],
    ["data", "providerId"],
    ["user", "provider_id"],
    ["user", "providerId"],
    ["profile", "provider_id"],
    ["profile", "providerId"],
    ["message", "provider_id"],
    ["message", "providerId"],
    ["data", "user", "provider_id"],
    ["data", "user", "providerId"],
    ["data", "profile", "provider_id"],
    ["data", "profile", "providerId"],
  ]);
}

function extractThreadId(payload: unknown): string | null {
  const data = toJsonObject(payload);
  return getFirstString(data, [
    ["thread_id"],
    ["threadId"],
    ["conversation_id"],
    ["conversationId"],
    ["chat_id"],
    ["chatId"],
    ["id"],
    ["data", "thread_id"],
    ["data", "threadId"],
    ["data", "conversation_id"],
    ["data", "conversationId"],
    ["data", "chat_id"],
    ["data", "chatId"],
    ["data", "id"],
    ["message", "thread_id"],
    ["message", "conversation_id"],
    ["message", "chat_id"],
    ["chat", "id"],
    ["conversation", "id"],
  ]);
}

function getErrorMessage(payload: unknown): string | null {
  if (typeof payload === "string") {
    const clean = payload.trim();
    return clean || null;
  }
  if (!payload || typeof payload !== "object") return null;
  const data = payload as JsonObject;
  const candidate = data.error ?? data.message ?? data.details ?? null;
  if (typeof candidate !== "string") return null;
  const clean = candidate.trim();
  return clean || null;
}

function buildLinkedinSendUserMessage(rawDetails: string | null): string {
  const defaultMessage = "Impossible d’envoyer le message LinkedIn pour le moment.";
  if (!rawDetails) return defaultMessage;

  const details = rawDetails.trim();
  if (!details) return defaultMessage;
  const normalized = details.toLowerCase();

  if (
    normalized.includes("not connected") ||
    normalized.includes("forbidden") ||
    normalized.includes("unauthorized")
  ) {
    return "Compte LinkedIn non connecté ou non autorisé.";
  }

  if (
    normalized.includes("not a 1st degree") ||
    normalized.includes("invitation") ||
    normalized.includes("relation") ||
    normalized.includes("connection")
  ) {
    return "Impossible d’envoyer : le prospect doit d’abord accepter votre invitation LinkedIn.";
  }

  if (normalized.includes("not found") || normalized.includes("404")) {
    return "Impossible d’envoyer : conversation ou profil LinkedIn introuvable.";
  }

  return `Impossible d’envoyer : ${details}`;
}

function dedupeBodies(candidates: JsonObject[]): JsonObject[] {
  const seen = new Set<string>();
  const unique: JsonObject[] = [];

  for (const candidate of candidates) {
    const key = JSON.stringify(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }

  return unique;
}

function extractMissingColumnName(error: unknown): string | null {
  const text = `${String((error as { message?: unknown })?.message ?? "")} ${String(
    (error as { details?: unknown })?.details ?? ""
  )} ${String((error as { hint?: unknown })?.hint ?? "")}`;

  const patterns = [
    /column ["']?([a-zA-Z0-9_]+)["']? does not exist/i,
    /Could not find the ['"]([a-zA-Z0-9_]+)['"] column/i,
    /schema cache.*['"]([a-zA-Z0-9_]+)['"]/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

async function upsertThreadRowWithOptionalColumns(params: {
  supabase: SupabaseClient;
  basePayload: JsonObject;
  optionalPayload: JsonObject;
}): Promise<{ id: string | null; error: unknown | null }> {
  const { supabase, basePayload, optionalPayload } = params;
  const payload: JsonObject = { ...basePayload, ...optionalPayload };
  const optionalColumns = new Set(Object.keys(optionalPayload));

  while (true) {
    const { data, error } = await supabase
      .from("inbox_threads")
      .upsert(payload, { onConflict: "client_id,unipile_account_id,unipile_thread_id" })
      .select("id")
      .limit(1)
      .maybeSingle();

    if (!error) {
      const id = String(data?.id ?? "").trim();
      return { id: id || null, error: null };
    }

    const missing = extractMissingColumnName(error);
    if (!missing || !optionalColumns.has(missing)) {
      return { id: null, error };
    }

    delete payload[missing];
    optionalColumns.delete(missing);
  }
}

async function insertMessageWithOptionalColumns(params: {
  supabase: SupabaseClient;
  basePayload: JsonObject;
  optionalPayload: JsonObject;
}): Promise<{ error: unknown | null }> {
  const { supabase, basePayload, optionalPayload } = params;
  const payload: JsonObject = { ...basePayload, ...optionalPayload };
  const optionalColumns = new Set(Object.keys(optionalPayload));

  while (true) {
    const { error } = await supabase.from("inbox_messages").insert(payload);
    if (!error) return { error: null };

    const missing = extractMissingColumnName(error);
    if (!missing || !optionalColumns.has(missing)) {
      return { error };
    }

    delete payload[missing];
    optionalColumns.delete(missing);
  }
}

async function createConversationThreadId(params: {
  baseUrl: string;
  apiKey: string;
  unipileAccountId: string;
  providerId: string;
}): Promise<{ threadId: string | null; details: unknown }> {
  const { baseUrl, apiKey, unipileAccountId, providerId } = params;

  const endpoints = [`${baseUrl}/api/v1/chats`, `${baseUrl}/api/v1/conversations`];
  const bodyCandidates = dedupeBodies([
    { account_id: unipileAccountId, provider_id: providerId },
    { account_id: unipileAccountId, recipient_provider_id: providerId },
    { account_id: unipileAccountId, attendee_id: providerId },
    { account_id: unipileAccountId, participant_id: providerId },
    { account_id: unipileAccountId, provider_ids: [providerId] },
    { account_id: unipileAccountId, attendee_ids: [providerId] },
    { account_id: unipileAccountId, participant_ids: [providerId] },
    { account_id: unipileAccountId, attendees: [{ provider_id: providerId }] },
    { account_id: unipileAccountId, participants: [{ provider_id: providerId }] },
  ]);

  const failures: Array<{ endpoint: string; status: number; details: string | null }> = [];

  for (const endpoint of endpoints) {
    for (const body of bodyCandidates) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const payload = await readResponseBody(response);
      if (!response.ok) {
        failures.push({
          endpoint,
          status: response.status,
          details: getErrorMessage(payload),
        });
        continue;
      }

      const threadId = extractThreadId(payload);
      if (threadId) return { threadId, details: payload };
      failures.push({
        endpoint,
        status: response.status,
        details: "thread_id_missing_in_create_response",
      });
    }
  }

  return { threadId: null, details: failures };
}

export async function sendOutboundMessageInThread(params: {
  baseUrl: string;
  apiKey: string;
  unipileAccountId: string;
  unipileThreadId: string;
  text: string;
}): Promise<SendInThreadResult> {
  const { baseUrl, apiKey, unipileAccountId, unipileThreadId, text } = params;
  const endpoints = [
    `${baseUrl}/api/v1/chats/${encodeURIComponent(unipileThreadId)}/messages`,
    `${baseUrl}/api/v1/conversations/${encodeURIComponent(unipileThreadId)}/messages`,
    `${baseUrl}/api/v1/messages`,
  ];

  const failures: Array<{ endpoint: string; status: number; details: string | null }> = [];

  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        /\/api\/v1\/messages$/.test(endpoint)
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
    });

    const payload = await readResponseBody(response);
    if (!response.ok) {
      failures.push({
        endpoint,
        status: response.status,
        details: getErrorMessage(payload),
      });
      continue;
    }

    const parsedMessage = parseUnipileMessage({
      ...toJsonObject(payload),
      ...toJsonObject(toJsonObject(payload).data),
      ...toJsonObject(toJsonObject(payload).message),
      direction: "outbound",
      thread_id: unipileThreadId,
      text,
    });

    if (!parsedMessage.unipileMessageId) {
      failures.push({
        endpoint,
        status: response.status,
        details: "message_id_missing_in_send_response",
      });
      continue;
    }

    return {
      ok: true,
      unipileMessageId: parsedMessage.unipileMessageId,
      sentAt: parsedMessage.sentAtIso,
      senderLinkedInUrl: parsedMessage.senderLinkedInUrl,
      payload,
    };
  }

  const firstFailure = failures.find((failure) => failure.details)?.details ?? null;
  return {
    ok: false,
    status: "send_failed",
    userMessage: buildLinkedinSendUserMessage(firstFailure),
    details: failures,
  };
}

export async function findExistingThreadForLead(params: {
  supabase: SupabaseClient;
  clientId: string;
  leadId: number;
  unipileAccountId: string;
  normalizedLeadLinkedInUrl: string | null;
}): Promise<{ threadDbId: string; unipileThreadId: string } | null> {
  const { supabase, clientId, leadId, unipileAccountId, normalizedLeadLinkedInUrl } = params;

  const { data: leadThreads, error: leadThreadError } = await supabase
    .from("inbox_threads")
    .select("id, unipile_thread_id, lead_linkedin_url, contact_linkedin_url")
    .eq("client_id", clientId)
    .eq("unipile_account_id", unipileAccountId)
    .eq("lead_id", leadId)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(1);

  if (!leadThreadError && Array.isArray(leadThreads) && leadThreads.length > 0) {
    const first = leadThreads[0] as ThreadLookupRow;
    const threadDbId = String(first.id ?? "").trim();
    const unipileThreadId = String(first.unipile_thread_id ?? "").trim();
    if (threadDbId && unipileThreadId) {
      return { threadDbId, unipileThreadId };
    }
  }

  if (!normalizedLeadLinkedInUrl) return null;

  const { data: accountThreads, error: accountThreadsError } = await supabase
    .from("inbox_threads")
    .select("id, unipile_thread_id, lead_linkedin_url, contact_linkedin_url")
    .eq("client_id", clientId)
    .eq("unipile_account_id", unipileAccountId)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(400);

  if (accountThreadsError || !Array.isArray(accountThreads)) return null;

  for (const row of accountThreads as ThreadLookupRow[]) {
    const threadDbId = String(row.id ?? "").trim();
    const unipileThreadId = String(row.unipile_thread_id ?? "").trim();
    if (!threadDbId || !unipileThreadId) continue;

    const leadUrl = normalizeLinkedInUrl(row.lead_linkedin_url);
    if (leadUrl && leadUrl === normalizedLeadLinkedInUrl) {
      return { threadDbId, unipileThreadId };
    }

    const contactUrl = normalizeLinkedInUrl(row.contact_linkedin_url);
    if (contactUrl && contactUrl === normalizedLeadLinkedInUrl) {
      return { threadDbId, unipileThreadId };
    }
  }

  return null;
}

export async function resolveLinkedinProviderIdForLead(params: {
  supabase: SupabaseClient;
  clientId: string;
  leadId: number;
  unipileAccountId: string;
  leadLinkedInUrl: string | null;
}): Promise<ResolveProviderIdResult> {
  const { supabase, clientId, leadId, unipileAccountId, leadLinkedInUrl } = params;

  const { data: invitations, error: invitationError } = await supabase
    .from("linkedin_invitations")
    .select("id, raw")
    .eq("client_id", clientId)
    .eq("lead_id", leadId)
    .eq("unipile_account_id", unipileAccountId)
    .order("id", { ascending: false })
    .limit(20);

  if (!invitationError && Array.isArray(invitations)) {
    for (const invitation of invitations as Array<{ raw?: unknown }>) {
      const raw = toJsonObject(invitation.raw);
      const candidates = [
        raw,
        toJsonObject(raw.invitation),
        toJsonObject(raw.acceptance),
        toJsonObject(toJsonObject(raw.acceptance).webhook_payload),
        ...extractArrayCandidates(raw),
      ];

      for (const candidate of candidates) {
        const providerId = extractProviderId(candidate);
        if (providerId) {
          return { ok: true, providerId, source: "invitation_raw" };
        }
      }
    }
  }

  const profileSlug = extractLinkedInProfileSlug(leadLinkedInUrl);
  if (!profileSlug) {
    return {
      ok: false,
      status: "provider_id_missing",
      userMessage: "Impossible d’envoyer : `provider_id` LinkedIn du prospect introuvable.",
    };
  }

  const baseUrl = normalizeUnipileBase(requireEnv("UNIPILE_DSN"));
  const apiKey = requireEnv("UNIPILE_API_KEY");
  const response = await fetch(
    `${baseUrl}/api/v1/users/${encodeURIComponent(profileSlug)}?account_id=${encodeURIComponent(
      unipileAccountId
    )}`,
    {
      method: "GET",
      headers: {
        "X-API-KEY": apiKey,
        accept: "application/json",
      },
    }
  );

  const payload = await readResponseBody(response);
  if (!response.ok) {
    return {
      ok: false,
      status: "profile_lookup_failed",
      userMessage: "Impossible d’envoyer : profil LinkedIn introuvable côté Unipile.",
      details: payload,
    };
  }

  const providerId = extractProviderId(payload);
  if (!providerId) {
    return {
      ok: false,
      status: "provider_id_missing",
      userMessage: "Impossible d’envoyer : `provider_id` LinkedIn du prospect introuvable.",
      details: payload,
    };
  }

  return { ok: true, providerId, source: "profile_lookup" };
}

async function ensureThreadRow(params: {
  supabase: SupabaseClient;
  clientId: string;
  leadId: number;
  unipileAccountId: string;
  unipileThreadId: string;
  leadLinkedInUrl: string | null;
  contactName: string | null;
  providerId: string | null;
}): Promise<{ threadDbId: string | null; error: unknown | null }> {
  const {
    supabase,
    clientId,
    leadId,
    unipileAccountId,
    unipileThreadId,
    leadLinkedInUrl,
    contactName,
    providerId,
  } = params;

  const nowIso = new Date().toISOString();
  const normalizedLeadLinkedInUrl = normalizeLinkedInUrl(leadLinkedInUrl);

  const basePayload: JsonObject = {
    client_id: clientId,
    provider: "linkedin",
    unipile_account_id: unipileAccountId,
    unipile_thread_id: unipileThreadId,
    lead_id: leadId,
    updated_at: nowIso,
  };
  if (normalizedLeadLinkedInUrl) {
    basePayload.lead_linkedin_url = normalizedLeadLinkedInUrl;
    basePayload.contact_linkedin_url = normalizedLeadLinkedInUrl;
  }
  if (contactName) {
    basePayload.contact_name = contactName;
  }

  const optionalPayload: JsonObject = {
    unipile_chat_id: unipileThreadId,
  };
  if (providerId) optionalPayload.provider_id = providerId;

  const upserted = await upsertThreadRowWithOptionalColumns({
    supabase,
    basePayload,
    optionalPayload,
  });

  if (upserted.error) return { threadDbId: null, error: upserted.error };
  if (upserted.id) return { threadDbId: upserted.id, error: null };

  const { data: fallbackRow } = await supabase
    .from("inbox_threads")
    .select("id")
    .eq("client_id", clientId)
    .eq("unipile_account_id", unipileAccountId)
    .eq("unipile_thread_id", unipileThreadId)
    .limit(1)
    .maybeSingle();

  const threadDbId = String(fallbackRow?.id ?? "").trim();
  return { threadDbId: threadDbId || null, error: threadDbId ? null : "thread_db_id_not_found_after_upsert" };
}

async function persistOutboundMessage(params: {
  supabase: SupabaseClient;
  clientId: string;
  leadId: number | null;
  threadDbId: string;
  unipileAccountId: string;
  unipileThreadId: string;
  unipileMessageId: string;
  text: string;
  sentAt: string;
  payload: unknown;
  senderLinkedInUrl: string | null;
}): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const {
    supabase,
    clientId,
    leadId,
    threadDbId,
    unipileAccountId,
    unipileThreadId,
    unipileMessageId,
    text,
    sentAt,
    payload,
    senderLinkedInUrl,
  } = params;

  const { data: existingMessage, error: existingMessageErr } = await supabase
    .from("inbox_messages")
    .select("id")
    .eq("client_id", clientId)
    .eq("unipile_account_id", unipileAccountId)
    .eq("unipile_message_id", unipileMessageId)
    .limit(1)
    .maybeSingle();

  if (existingMessageErr) {
    return { ok: false, error: existingMessageErr };
  }

  if (!existingMessage?.id) {
    const insertBasePayload: JsonObject = {
      client_id: clientId,
      provider: "linkedin",
      thread_db_id: threadDbId,
      unipile_account_id: unipileAccountId,
      unipile_thread_id: unipileThreadId,
      unipile_message_id: unipileMessageId,
      direction: "outbound",
      sender_name: null,
      sender_linkedin_url: senderLinkedInUrl,
      text,
      sent_at: sentAt,
      raw: payload,
    };

    const insertOptionalPayload: JsonObject = {
      thread_id: threadDbId,
      body: text,
      status: "sent",
      provider_message_id: unipileMessageId,
    };
    if (Number.isFinite(leadId)) {
      insertOptionalPayload.lead_id = leadId;
    }

    const { error: messageInsertErr } = await insertMessageWithOptionalColumns({
      supabase,
      basePayload: insertBasePayload,
      optionalPayload: insertOptionalPayload,
    });
    if (messageInsertErr) return { ok: false, error: messageInsertErr };
  }

  const { error: threadUpdateErr } = await supabase
    .from("inbox_threads")
    .update({
      last_message_at: sentAt,
      last_message_preview: truncatePreview(text),
      updated_at: new Date().toISOString(),
    })
    .eq("id", threadDbId)
    .eq("client_id", clientId);

  if (threadUpdateErr) return { ok: false, error: threadUpdateErr };
  return { ok: true };
}

export async function ensureThreadAndSendMessage(params: {
  supabase: SupabaseClient;
  clientId: string;
  leadId: number;
  text: string;
  leadLinkedInUrl: string | null;
  contactName: string | null;
  unipileAccountId: string;
  providerId: string | null;
  existingThreadDbId: string | null;
  existingUnipileThreadId: string | null;
}): Promise<EnsureThreadAndSendMessageResult> {
  const {
    supabase,
    clientId,
    leadId,
    text,
    leadLinkedInUrl,
    contactName,
    unipileAccountId,
    providerId,
    existingThreadDbId,
    existingUnipileThreadId,
  } = params;

  const baseUrl = normalizeUnipileBase(requireEnv("UNIPILE_DSN"));
  const apiKey = requireEnv("UNIPILE_API_KEY");

  let threadDbId = String(existingThreadDbId ?? "").trim() || null;
  let unipileThreadId = String(existingUnipileThreadId ?? "").trim() || null;
  let createdNow = false;

  if (!unipileThreadId) {
    const usableProviderId = String(providerId ?? "").trim();
    if (!usableProviderId) {
      return {
        ok: false,
        status: "provider_id_missing",
        userMessage: "Impossible d’envoyer : `provider_id` LinkedIn du prospect manquant.",
        providerId: null,
        unipileThreadId: null,
      };
    }

    const created = await createConversationThreadId({
      baseUrl,
      apiKey,
      unipileAccountId,
      providerId: usableProviderId,
    });
    if (!created.threadId) {
      const firstFailure =
        Array.isArray(created.details) && created.details.length > 0
          ? getErrorMessage(created.details[0])
          : getErrorMessage(created.details);
      return {
        ok: false,
        status: "conversation_create_failed",
        userMessage: buildLinkedinSendUserMessage(firstFailure),
        details: created.details,
        providerId: usableProviderId,
        unipileThreadId: null,
      };
    }

    unipileThreadId = created.threadId;
    createdNow = true;
  }

  if (!threadDbId) {
    const threadRow = await ensureThreadRow({
      supabase,
      clientId,
      leadId,
      unipileAccountId,
      unipileThreadId,
      leadLinkedInUrl,
      contactName,
      providerId,
    });
    if (threadRow.error || !threadRow.threadDbId) {
      return {
        ok: false,
        status: "thread_upsert_failed",
        userMessage: "Impossible de préparer le thread LinkedIn dans la messagerie.",
        details: threadRow.error,
        providerId,
        unipileThreadId,
      };
    }
    threadDbId = threadRow.threadDbId;
  }

  const sent = await sendOutboundMessageInThread({
    baseUrl,
    apiKey,
    unipileAccountId,
    unipileThreadId,
    text,
  });
  if (!sent.ok) {
    return {
      ok: false,
      status: sent.status,
      userMessage: sent.userMessage,
      details: sent.details,
      providerId,
      unipileThreadId,
    };
  }

  const persisted = await persistOutboundMessage({
    supabase,
    clientId,
    leadId,
    threadDbId,
    unipileAccountId,
    unipileThreadId,
    unipileMessageId: sent.unipileMessageId,
    text,
    sentAt: sent.sentAt,
    payload: sent.payload,
    senderLinkedInUrl: sent.senderLinkedInUrl,
  });

  if (!persisted.ok) {
    return {
      ok: false,
      status: "message_persist_failed",
      userMessage: "Message envoyé mais enregistrement local échoué.",
      details: persisted.error,
      providerId,
      unipileThreadId,
    };
  }

  return {
    ok: true,
    threadDbId,
    unipileThreadId,
    unipileMessageId: sent.unipileMessageId,
    sentAt: sent.sentAt,
    senderLinkedInUrl: sent.senderLinkedInUrl,
    threadCreated: createdNow,
    providerId,
  };
}

export async function sendAndPersistMessageForThread(params: {
  supabase: SupabaseClient;
  clientId: string;
  leadId: number | null;
  threadDbId: string;
  unipileAccountId: string;
  unipileThreadId: string;
  text: string;
}):
  Promise<
    | {
        ok: true;
        unipileMessageId: string;
        sentAt: string;
      }
    | {
        ok: false;
        status: "send_failed" | "message_persist_failed";
        userMessage: string;
        details?: unknown;
      }
  > {
  const baseUrl = normalizeUnipileBase(requireEnv("UNIPILE_DSN"));
  const apiKey = requireEnv("UNIPILE_API_KEY");

  const sent = await sendOutboundMessageInThread({
    baseUrl,
    apiKey,
    unipileAccountId: params.unipileAccountId,
    unipileThreadId: params.unipileThreadId,
    text: params.text,
  });

  if (!sent.ok) {
    return {
      ok: false,
      status: sent.status,
      userMessage: sent.userMessage,
      details: sent.details,
    };
  }

  const persisted = await persistOutboundMessage({
    supabase: params.supabase,
    clientId: params.clientId,
    leadId: params.leadId,
    threadDbId: params.threadDbId,
    unipileAccountId: params.unipileAccountId,
    unipileThreadId: params.unipileThreadId,
    unipileMessageId: sent.unipileMessageId,
    text: params.text,
    sentAt: sent.sentAt,
    payload: sent.payload,
    senderLinkedInUrl: sent.senderLinkedInUrl,
  });

  if (!persisted.ok) {
    return {
      ok: false,
      status: "message_persist_failed",
      userMessage: "Message envoyé mais enregistrement local échoué.",
      details: persisted.error,
    };
  }

  return {
    ok: true,
    unipileMessageId: sent.unipileMessageId,
    sentAt: sent.sentAt,
  };
}
