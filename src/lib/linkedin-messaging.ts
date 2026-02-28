import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeLinkedInUrl } from "@/lib/linkedin-url";
import { normalizeUnipileBase, requireEnv } from "@/lib/inbox-server";
import {
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

type InvitationLookupRow = {
  id: number | string;
  status?: string | null;
  lead_id?: number | string | null;
  unipile_account_id?: string | null;
  created_at?: string | null;
  accepted_at?: string | null;
  sent_at?: string | null;
  raw?: unknown;
};

function parseInvitationLookupRows(data: unknown): InvitationLookupRow[] {
  if (!Array.isArray(data)) return [];

  const rows: InvitationLookupRow[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const id = row.id;
    if (typeof id !== "string" && typeof id !== "number") continue;

    rows.push({
      id,
      status: typeof row.status === "string" ? row.status : null,
      lead_id:
        typeof row.lead_id === "string" || typeof row.lead_id === "number"
          ? row.lead_id
          : null,
      unipile_account_id:
        typeof row.unipile_account_id === "string" ? row.unipile_account_id : null,
      created_at: typeof row.created_at === "string" ? row.created_at : null,
      accepted_at: typeof row.accepted_at === "string" ? row.accepted_at : null,
      sent_at: typeof row.sent_at === "string" ? row.sent_at : null,
      raw: row.raw,
    });
  }

  return rows;
}

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

type LinkedinSendContext = "create-chat" | "send-message";

type UnipileCallFailureDetail = {
  status: number | null;
  method: string;
  url: string;
  data: unknown;
  text: string;
  message: string;
  requestBody?: JsonObject;
};

class UnipileHttpError extends Error {
  readonly status: number;
  readonly method: string;
  readonly url: string;
  readonly data: unknown;
  readonly text: string;

  constructor(params: {
    status: number;
    method: string;
    url: string;
    data: unknown;
    text: string;
    message: string;
  }) {
    super(`[UNIPILE ${params.status}] ${params.message}`);
    this.name = "UnipileHttpError";
    this.status = params.status;
    this.method = params.method;
    this.url = params.url;
    this.data = params.data;
    this.text = params.text;
  }
}

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
  | {
      ok: true;
      providerId: string;
      source: "invitation_lookup";
      invitationId: string | null;
      matchedBy:
        | "acceptance.matching.profile_slug"
        | "acceptance.webhook_payload.user_public_identifier"
        | "acceptance.matching.normalized_linkedin_url"
        | "acceptance.webhook_payload.user_profile_url"
        | "acceptance.webhook_payload.user_provider_id"
        | "webhook_payload.user_provider_id"
        | null;
      candidatesCount: number;
    }
  | {
      ok: false;
      status: "provider_id_missing";
      userMessage: string;
      details?: unknown;
    };

export type FindProviderIdFromInvitationsResult = {
  providerId: string | null;
  invitationId: string | null;
  invitationStatus: string | null;
  invitationCreatedAt: string | null;
  invitationAcceptedAt: string | null;
  invitationSentAt: string | null;
  matchedBy:
    | "acceptance.matching.profile_slug"
    | "acceptance.webhook_payload.user_public_identifier"
    | "acceptance.matching.normalized_linkedin_url"
    | "acceptance.webhook_payload.user_profile_url"
    | "acceptance.webhook_payload.user_provider_id"
    | "webhook_payload.user_provider_id"
    | null;
  candidatesCount: number;
  inspectedCount: number;
  normalizedLeadUrl: string | null;
  slug: string | null;
  recentProfileUrls: string[];
  rawKeys: string[];
  acceptanceKeys: string[];
  usedDateFilter: boolean;
};

export function assertValidLinkedinProviderId(providerId: unknown): asserts providerId is string {
  if (!providerId) {
    throw new Error("provider_id manquant");
  }
  if (typeof providerId !== "string") {
    throw new Error("provider_id invalide (type)");
  }
  const trimmed = providerId.trim();
  if (!trimmed) {
    throw new Error("provider_id manquant");
  }
  if (trimmed.length < 15) {
    throw new Error(
      `Provider ID invalide: ${trimmed} (tu utilises invitation_id au lieu de user_provider_id)`
    );
  }
  if (!trimmed.startsWith("ACoA")) {
    throw new Error(
      `Provider ID invalide: ${trimmed} (tu utilises invitation_id au lieu de user_provider_id)`
    );
  }
}

export function extractLinkedinSlug(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = String(url).match(/linkedin\.com\/in\/([^\/\?#]+)/i);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).trim().toLowerCase();
  } catch {
    return match[1].trim().toLowerCase();
  }
}

export function extractProviderId(payload: unknown): string | null {
  const data = toJsonObject(payload);
  return getFirstString(data, [
    ["user_provider_id"],
    ["userProviderId"],
    ["provider_id"],
    ["providerId"],
    ["recipient_provider_id"],
    ["recipientProviderId"],
    ["counterpart_provider_id"],
    ["counterpartProviderId"],
    ["data", "provider_id"],
    ["data", "providerId"],
    ["data", "user_provider_id"],
    ["data", "userProviderId"],
    ["data", "recipient_provider_id"],
    ["data", "recipientProviderId"],
    ["user", "provider_id"],
    ["user", "providerId"],
    ["user", "user_provider_id"],
    ["user", "userProviderId"],
    ["contact", "provider_id"],
    ["contact", "providerId"],
    ["counterpart", "provider_id"],
    ["counterpart", "providerId"],
    ["webhook_payload", "user_provider_id"],
    ["webhook_payload", "userProviderId"],
    ["webhook_payload", "provider_id"],
    ["webhook_payload", "providerId"],
    ["profile", "provider_id"],
    ["profile", "providerId"],
    ["message", "provider_id"],
    ["message", "providerId"],
    ["data", "user", "provider_id"],
    ["data", "user", "providerId"],
    ["data", "user", "user_provider_id"],
    ["data", "user", "userProviderId"],
    ["data", "contact", "provider_id"],
    ["data", "contact", "providerId"],
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

function safeStringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function extractUnipileErrorExcerpt(rawDetails: string | null): string {
  const clean = String(rawDetails ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "détail indisponible";
  return clean.length > 220 ? `${clean.slice(0, 220)}…` : clean;
}

function getUnipileErrorText(data: unknown, text: string): string {
  const payloadMessage = getErrorMessage(data);
  if (payloadMessage) return payloadMessage;

  const cleanText = text.trim();
  if (cleanText) return cleanText;

  const payloadText = safeStringify(data).trim();
  if (payloadText && payloadText !== "{}" && payloadText !== "null") return payloadText;

  return "empty_response_body";
}

function toUnipileFailureMessage(
  error: unknown,
  fallback: { method: string; url: string; requestBody?: JsonObject }
): UnipileCallFailureDetail {
  if (error instanceof UnipileHttpError) {
    const data =
      typeof error.data === "undefined" || error.data === null
        ? { raw_text: error.text || "empty_response_body" }
        : error.data;
    const text = error.text || safeStringify(data);
    return {
      status: error.status,
      method: error.method,
      url: error.url,
      data,
      text,
      message: getUnipileErrorText(data, text),
      requestBody: fallback.requestBody,
    };
  }

  const networkMessage = error instanceof Error ? error.message : String(error ?? "unknown_error");
  return {
    status: null,
    method: fallback.method,
    url: fallback.url,
    data: { network_error: networkMessage },
    text: networkMessage,
    message: networkMessage,
    requestBody: fallback.requestBody,
  };
}

function pickPrimaryFailureDetail(details: unknown): UnipileCallFailureDetail | null {
  if (!Array.isArray(details)) return null;

  for (const entry of details) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Partial<UnipileCallFailureDetail>;
    const message = String(row.message ?? "").trim();
    if (message) {
      return {
        status: typeof row.status === "number" ? row.status : null,
        method: String(row.method ?? "POST"),
        url: String(row.url ?? ""),
        data: row.data ?? null,
        text: String(row.text ?? ""),
        message,
        requestBody:
          row.requestBody && typeof row.requestBody === "object"
            ? (row.requestBody as JsonObject)
            : undefined,
      };
    }
  }

  return null;
}

async function callUnipile(params: {
  url: string;
  method: string;
  apiKey: string;
  body?: JsonObject;
}): Promise<{ status: number; payload: unknown; text: string }> {
  const { url, method, apiKey, body } = params;
  console.log("UNIPILE_HTTP_REQUEST", {
    method,
    url,
    body: safeStringify(body ?? null),
  });
  const response = await fetch(url, {
    method,
    headers: {
      "X-API-KEY": apiKey,
      accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text().catch(() => "");
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as JsonObject;
    } catch {
      payload = text;
    }
  }
  console.log("UNIPILE_HTTP_RESPONSE", {
    method,
    url,
    status: response.status,
    ok: response.ok,
    response_body: payload,
    response_text: text,
  });

  if (!response.ok) {
    const message = getUnipileErrorText(payload, text);
    throw new UnipileHttpError({
      status: response.status,
      method,
      url,
      data: payload,
      text,
      message,
    });
  }

  return { status: response.status, payload, text };
}

function mapUnipileErrorToUserMessage(params: {
  status: number | null;
  errText: string | null;
  context: LinkedinSendContext;
}): string {
  const { status, errText, context } = params;
  const excerpt = extractUnipileErrorExcerpt(errText);
  const normalized = excerpt.toLowerCase();

  if (status === 401 || status === 403) {
    return "Compte LinkedIn non connecté ou autorisation refusée. Reconnecte ton LinkedIn.";
  }

  if (normalized.includes("not connected") || normalized.includes("forbidden")) {
    return "Compte LinkedIn non connecté ou autorisation refusée. Reconnecte ton LinkedIn.";
  }

  if (normalized.includes("provider") || normalized.includes("invalid")) {
    return "Profil LinkedIn du prospect invalide (provider_id manquant ou incorrect).";
  }

  if (
    normalized.includes("open profile") ||
    normalized.includes("invitation") ||
    normalized.includes("cannot message") ||
    normalized.includes("not a 1st degree") ||
    normalized.includes("relation") ||
    normalized.includes("connection")
  ) {
    return "Impossible de créer une conversation (profil non accessible). Il faut d’abord se connecter ou utiliser InMail/Open Profile.";
  }

  if (context === "create-chat") {
    return `Unipile refuse la création du chat: ${excerpt}`;
  }
  return `Unipile refuse l’envoi du message: ${excerpt}`;
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

function isMissingColumnError(error: unknown, columnName: string): boolean {
  const missing = extractMissingColumnName(error);
  return missing === columnName;
}

function extractProviderIdFromInvitationRaw(rawInput: unknown): {
  providerId: string | null;
  matchedBy:
    | "acceptance.webhook_payload.user_provider_id"
    | "webhook_payload.user_provider_id"
    | null;
  rawKeys: string[];
  acceptanceKeys: string[];
} {
  const raw = toJsonObject(rawInput);
  const acceptance = toJsonObject(raw.acceptance);
  const acceptancePayload = toJsonObject(acceptance.webhook_payload);
  const webhookPayload = toJsonObject(raw.webhook_payload);

  const providerIdFromAcceptance = getFirstString(acceptancePayload, [
    ["user_provider_id"],
    ["userProviderId"],
    ["provider_id"],
    ["providerId"],
    ["user", "provider_id"],
    ["user", "providerId"],
  ]);
  if (providerIdFromAcceptance) {
    return {
      providerId: providerIdFromAcceptance,
      matchedBy: "acceptance.webhook_payload.user_provider_id",
      rawKeys: Object.keys(raw),
      acceptanceKeys: Object.keys(acceptance),
    };
  }

  const providerIdFromWebhook = getFirstString(webhookPayload, [
    ["user_provider_id"],
    ["userProviderId"],
    ["provider_id"],
    ["providerId"],
    ["user", "provider_id"],
    ["user", "providerId"],
  ]);

  return {
    providerId: providerIdFromWebhook,
    matchedBy: providerIdFromWebhook ? "webhook_payload.user_provider_id" : null,
    rawKeys: Object.keys(raw),
    acceptanceKeys: Object.keys(acceptance),
  };
}

export async function getAcceptedProviderIdForLead(params: {
  supabase: SupabaseClient;
  leadId: number;
  clientId?: string | null;
}): Promise<FindProviderIdFromInvitationsResult> {
  const { supabase, leadId, clientId } = params;

  const selectCandidates = [
    "id, raw, accepted_at, sent_at, status",
    "id, raw, sent_at, status",
    "id, raw, status",
    "id, raw",
  ];

  let rows: InvitationLookupRow[] = [];
  let lastError: unknown = null;

  for (const selectFields of selectCandidates) {
    let query = supabase
      .from("linkedin_invitations")
      .select(selectFields)
      .eq("lead_id", leadId)
      .limit(1);

    if (clientId) {
      query = query.eq("client_id", clientId);
    }
    if (selectFields.includes("status")) {
      query = query.eq("status", "accepted");
    }
    if (selectFields.includes("accepted_at")) {
      query = query.order("accepted_at", { ascending: false, nullsFirst: false });
    }
    if (selectFields.includes("sent_at")) {
      query = query.order("sent_at", { ascending: false, nullsFirst: false });
    }
    query = query.order("id", { ascending: false });

    const { data, error } = await query;
    if (error) {
      lastError = error;
      if (isMissingColumnError(error, "accepted_at")) continue;
      if (isMissingColumnError(error, "sent_at")) continue;
      if (isMissingColumnError(error, "status")) continue;
      if (isMissingColumnError(error, "client_id")) continue;
      break;
    }

    rows = parseInvitationLookupRows(data);
    break;
  }

  if (rows.length === 0 && lastError) {
    console.error("PROVIDER_LOOKUP_INVITATIONS_QUERY_ERROR", {
      leadId,
      clientId,
      error: lastError,
    });
  }

  const invitation = rows[0] ?? null;
  const invitationId = invitation ? String(invitation.id ?? "").trim() || null : null;
  const invitationStatus = invitation ? String(invitation.status ?? "").trim() || null : null;
  const invitationAcceptedAt = invitation ? String(invitation.accepted_at ?? "").trim() || null : null;
  const invitationSentAt = invitation ? String(invitation.sent_at ?? "").trim() || null : null;
  const invitationCreatedAt = invitation ? String(invitation.created_at ?? "").trim() || null : null;
  const extracted = extractProviderIdFromInvitationRaw(invitation?.raw);

  console.log({
    step: "provider-lookup:accepted-invitation",
    leadId,
    invitationId,
    status: invitationStatus,
    accepted_at: invitationAcceptedAt,
    providerId: extracted.providerId,
  });

  if (!extracted.providerId) {
    console.warn("PROVIDER_LOOKUP_NOT_FOUND", {
      leadId,
      invitation_id: invitationId,
      status: invitationStatus,
      accepted_at: invitationAcceptedAt,
      raw_keys: extracted.rawKeys,
      acceptance_keys: extracted.acceptanceKeys,
    });
  }

  return {
    providerId: extracted.providerId,
    invitationId,
    invitationStatus,
    invitationCreatedAt,
    invitationAcceptedAt,
    invitationSentAt,
    matchedBy: extracted.matchedBy,
    candidatesCount: rows.length,
    inspectedCount: rows.length,
    normalizedLeadUrl: null,
    slug: null,
    recentProfileUrls: [],
    rawKeys: extracted.rawKeys,
    acceptanceKeys: extracted.acceptanceKeys,
    usedDateFilter: invitationAcceptedAt !== null,
  };
}

export async function getProviderIdForLeadFromInvitations(params: {
  supabase: SupabaseClient;
  leadId: number;
  clientId?: string | null;
}): Promise<FindProviderIdFromInvitationsResult> {
  return getAcceptedProviderIdForLead(params);
}

export async function findProviderIdFromInvitations(params: {
  supabase: SupabaseClient;
  clientId: string;
  leadId?: number | null;
  linkedinUrl: string | null;
  unipileAccountId?: string | null;
  lookbackDays?: number;
}): Promise<FindProviderIdFromInvitationsResult> {
  if (!params.leadId || !Number.isFinite(Number(params.leadId))) {
    return {
      providerId: null,
      invitationId: null,
      invitationStatus: null,
      invitationCreatedAt: null,
      invitationAcceptedAt: null,
      invitationSentAt: null,
      matchedBy: null,
      candidatesCount: 0,
      inspectedCount: 0,
      normalizedLeadUrl: normalizeLinkedInUrl(params.linkedinUrl),
      slug: extractLinkedinSlug(params.linkedinUrl),
      recentProfileUrls: [],
      rawKeys: [],
      acceptanceKeys: [],
      usedDateFilter: false,
    };
  }

  return getProviderIdForLeadFromInvitations({
    supabase: params.supabase,
    leadId: Number(params.leadId),
    clientId: params.clientId,
  });
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
}): Promise<{ threadId: string | null; details: UnipileCallFailureDetail[] }> {
  const { baseUrl, apiKey, unipileAccountId, providerId } = params;

  const endpoints = [`${baseUrl}/api/v1/chats`, `${baseUrl}/api/v1/conversations`];
  const bodyCandidates = dedupeBodies([
    {
      account_id: unipileAccountId,
      provider: "LINKEDIN",
      attendees: [{ provider_id: providerId }],
    },
    {
      account_id: unipileAccountId,
      provider: "LINKEDIN",
      attendee_provider_id: providerId,
    },
    {
      account_id: unipileAccountId,
      provider: "LINKEDIN",
      participant_provider_ids: [providerId],
    },
  ]);
  const attemptNames = ["A", "B", "C"];

  const failures: UnipileCallFailureDetail[] = [];

  for (const url of endpoints) {
    for (let index = 0; index < bodyCandidates.length; index += 1) {
      const body = bodyCandidates[index];
      const attempt = attemptNames[index] ?? `FALLBACK_${index + 1}`;
      console.log("UNIPILE_CREATE_CHAT_ATTEMPT", {
        attempt,
        method: "POST",
        url,
        body: safeStringify(body),
      });
      try {
        const response = await callUnipile({
          url,
          method: "POST",
          apiKey,
          body,
        });
        const threadId = extractThreadId(response.payload);
        console.log("UNIPILE_CREATE_CHAT_ATTEMPT_RESULT", {
          attempt,
          method: "POST",
          url,
          status: response.status,
          thread_id: threadId,
          response_body: response.payload,
          response_text: response.text,
        });
        if (threadId) return { threadId, details: failures };

        failures.push({
          status: response.status,
          method: "POST",
          url,
          data: response.payload,
          text: response.text,
          message: "thread_id_missing_in_create_response",
          requestBody: body,
        });
      } catch (error) {
        failures.push(
          toUnipileFailureMessage(error, {
            method: "POST",
            url,
            requestBody: body,
          })
        );
        const lastFailure = failures[failures.length - 1] ?? null;
        console.warn("UNIPILE_CREATE_CHAT_ATTEMPT_FAILED", {
          attempt,
          method: "POST",
          url,
          body: safeStringify(body),
          status: lastFailure?.status ?? null,
          data: lastFailure?.data ?? null,
          text: lastFailure?.text ?? null,
          message: lastFailure?.message ?? null,
        });
      }
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

  const failures: UnipileCallFailureDetail[] = [];

  for (const url of endpoints) {
    const body = /\/api\/v1\/messages$/.test(url)
      ? {
          account_id: unipileAccountId,
          chat_id: unipileThreadId,
          text,
        }
      : {
          account_id: unipileAccountId,
          text,
        };
    console.log("UNIPILE_SEND_MESSAGE_ATTEMPT", {
      method: "POST",
      url,
      body: safeStringify(body),
    });

    let payload: unknown = null;
    let responseStatus = 0;
    let responseText = "";
    try {
      const response = await callUnipile({
        url,
        method: "POST",
        apiKey,
        body,
      });
      payload = response.payload;
      responseStatus = response.status;
      responseText = response.text;
      console.log("UNIPILE_SEND_MESSAGE_ATTEMPT_RESULT", {
        method: "POST",
        url,
        status: responseStatus,
        response_body: payload,
        response_text: responseText,
      });
    } catch (error) {
      const failure = toUnipileFailureMessage(error, {
        method: "POST",
        url,
        requestBody: body,
      });
      failures.push(failure);
      console.warn("UNIPILE_SEND_MESSAGE_ATTEMPT_FAILED", {
        method: "POST",
        url,
        body: safeStringify(body),
        status: failure.status,
        data: failure.data,
        text: failure.text,
        message: failure.message,
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
        status: responseStatus,
        method: "POST",
        url,
        data: payload,
        text: responseText,
        message: "message_id_missing_in_send_response",
        requestBody: body,
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

  const primaryFailure = pickPrimaryFailureDetail(failures);
  if (primaryFailure) {
    console.error("UNIPILE_SEND_MESSAGE_FAILED", {
      status: primaryFailure.status,
      url: primaryFailure.url,
      method: primaryFailure.method,
      data: primaryFailure.data,
      text: primaryFailure.text,
      message: primaryFailure.message,
    });
  }
  return {
    ok: false,
    status: "send_failed",
    userMessage: mapUnipileErrorToUserMessage({
      status: primaryFailure?.status ?? null,
      errText: primaryFailure?.message ?? null,
      context: "send-message",
    }),
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
  const lookup = await findProviderIdFromInvitations({
    supabase: params.supabase,
    clientId: params.clientId,
    leadId: params.leadId,
    linkedinUrl: params.leadLinkedInUrl,
    unipileAccountId: params.unipileAccountId,
    lookbackDays: 180,
  });

  if (!lookup.providerId) {
    return {
      ok: false,
      status: "provider_id_missing",
      userMessage:
        "Impossible d’envoyer un message: provider_id introuvable dans les webhooks Unipile pour ce prospect.",
      details: lookup,
    };
  }

  return {
    ok: true,
    providerId: lookup.providerId,
    source: "invitation_lookup",
    invitationId: lookup.invitationId,
    matchedBy: lookup.matchedBy,
    candidatesCount: lookup.candidatesCount,
  };
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
    console.log({
      step: "db-insert-message",
      clientId,
      leadId,
      chat_id: unipileThreadId,
      unipile_account_id: unipileAccountId,
      provider_message_id: unipileMessageId,
    });

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

  console.log({
    step: "db-update-thread",
    clientId,
    leadId,
    chat_id: unipileThreadId,
    unipile_account_id: unipileAccountId,
  });

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

  console.log({
    step: "ensure-thread",
    clientId,
    leadId,
    provider_id: providerId,
    unipile_account_id: unipileAccountId,
    chat_id: unipileThreadId,
  });

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
    assertValidLinkedinProviderId(usableProviderId);

    console.log({
      step: "create-chat:start",
      leadId,
      providerId: usableProviderId,
      accountId: unipileAccountId,
      clientId,
    });
    console.log("SEND_LINKEDIN_DEBUG", {
      leadId,
      account_id: unipileAccountId,
      providerId: usableProviderId,
    });

    const created = await createConversationThreadId({
      baseUrl,
      apiKey,
      unipileAccountId,
      providerId: usableProviderId,
    });
    if (!created.threadId) {
      const primaryFailure = pickPrimaryFailureDetail(created.details);
      const failureStatus = primaryFailure?.status ?? null;
      const failureData = primaryFailure?.data ?? null;
      const failureText = primaryFailure?.text ?? null;
      const failureMessage = primaryFailure?.message ?? "unipile_create_chat_failed";

      console.error("UNIPILE_CREATE_CHAT_FAILED", {
        leadId,
        providerId: usableProviderId,
        accountId: unipileAccountId,
        status: failureStatus,
        data: failureData,
        text: failureText,
        method: primaryFailure?.method ?? "POST",
        url: primaryFailure?.url ?? null,
        message: failureMessage,
      });

      return {
        ok: false,
        status: "conversation_create_failed",
        userMessage: mapUnipileErrorToUserMessage({
          status: failureStatus,
          errText: failureMessage,
          context: "create-chat",
        }),
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

  console.log({
    step: "send-message",
    clientId,
    leadId,
    provider_id: providerId,
    unipile_account_id: unipileAccountId,
    chat_id: unipileThreadId,
  });

  const sent = await sendOutboundMessageInThread({
    baseUrl,
    apiKey,
    unipileAccountId,
    unipileThreadId,
    text,
  });
  if (sent.ok === false) {
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

  if (persisted.ok === false) {
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

  if (sent.ok === false) {
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

  if (persisted.ok === false) {
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
