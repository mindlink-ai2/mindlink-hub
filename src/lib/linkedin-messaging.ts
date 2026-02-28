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
  lead_id?: number | string | null;
  unipile_account_id?: string | null;
  created_at?: string | null;
  raw?: unknown;
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
  invitationCreatedAt: string | null;
  matchedBy:
    | "acceptance.matching.profile_slug"
    | "acceptance.webhook_payload.user_public_identifier"
    | "acceptance.matching.normalized_linkedin_url"
    | "acceptance.webhook_payload.user_profile_url"
    | null;
  candidatesCount: number;
  inspectedCount: number;
  normalizedLeadUrl: string | null;
  slug: string | null;
  recentProfileUrls: string[];
  usedDateFilter: boolean;
};

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

function normalizeSlugForMatching(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    return decodeURIComponent(raw).trim().toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function isMissingColumnError(error: unknown, columnName: string): boolean {
  const missing = extractMissingColumnName(error);
  return missing === columnName;
}

async function listClientLinkedinAccountIds(params: {
  supabase: SupabaseClient;
  clientId: string;
  preferredAccountId?: string | null;
}): Promise<string[]> {
  const accountIds = new Set<string>();
  const push = (value: unknown) => {
    const normalized = String(value ?? "").trim();
    if (normalized) accountIds.add(normalized);
  };

  const { supabase, clientId, preferredAccountId } = params;
  push(preferredAccountId);

  const settings = await supabase
    .from("client_linkedin_settings")
    .select("unipile_account_id")
    .eq("client_id", clientId)
    .limit(20);

  if (!settings.error && Array.isArray(settings.data)) {
    for (const row of settings.data as Array<{ unipile_account_id?: string | null }>) {
      push(row.unipile_account_id);
    }
  }

  let accounts = await supabase
    .from("unipile_accounts")
    .select("account_id, unipile_account_id")
    .eq("client_id", clientId)
    .eq("provider", "linkedin")
    .limit(50);

  if (accounts.error && isMissingColumnError(accounts.error, "provider")) {
    accounts = await supabase
      .from("unipile_accounts")
      .select("account_id, unipile_account_id")
      .eq("client_id", clientId)
      .limit(50);
  }

  if (!accounts.error && Array.isArray(accounts.data)) {
    for (const row of accounts.data as Array<{
      account_id?: string | null;
      unipile_account_id?: string | null;
    }>) {
      push(row.account_id);
      push(row.unipile_account_id);
    }
  }

  return [...accountIds];
}

function getWebhookAccountId(rawInput: unknown, fallbackAccountId?: string | null): string | null {
  const raw = toJsonObject(rawInput);
  const acceptance = toJsonObject(raw.acceptance);
  const payload = toJsonObject(acceptance.webhook_payload);
  const fallback = String(fallbackAccountId ?? "").trim() || null;
  return (
    getFirstString(payload, [
      ["account_id"],
      ["accountId"],
      ["account", "id"],
      ["account", "account_id"],
    ]) ??
    getFirstString(raw, [
      ["account_id"],
      ["accountId"],
    ]) ??
    fallback
  );
}

function getWebhookProfileUrl(rawInput: unknown): string | null {
  const raw = toJsonObject(rawInput);
  const acceptance = toJsonObject(raw.acceptance);
  const payload = toJsonObject(acceptance.webhook_payload);
  const url = getFirstString(payload, [
    ["user_profile_url"],
    ["userProfileUrl"],
    ["profile_url"],
    ["profileUrl"],
    ["linkedin_url"],
    ["linkedinUrl"],
    ["user", "profile_url"],
    ["user", "profileUrl"],
    ["user", "linkedin_url"],
    ["user", "linkedinUrl"],
  ]);
  return normalizeLinkedInUrl(url);
}

function getMatchingNormalizedUrl(rawInput: unknown): string | null {
  const raw = toJsonObject(rawInput);
  const acceptance = toJsonObject(raw.acceptance);
  const matching = toJsonObject(acceptance.matching);
  return normalizeLinkedInUrl(
    getFirstString(matching, [
      ["normalized_linkedin_url"],
      ["normalizedLinkedinUrl"],
    ])
  );
}

function getWebhookPublicIdentifier(rawInput: unknown): string | null {
  const raw = toJsonObject(rawInput);
  const acceptance = toJsonObject(raw.acceptance);
  const payload = toJsonObject(acceptance.webhook_payload);
  return normalizeSlugForMatching(
    getFirstString(payload, [
      ["user_public_identifier"],
      ["userPublicIdentifier"],
      ["public_identifier"],
      ["publicIdentifier"],
      ["user", "public_identifier"],
      ["user", "publicIdentifier"],
    ])
  );
}

function getMatchingProfileSlug(rawInput: unknown): string | null {
  const raw = toJsonObject(rawInput);
  const acceptance = toJsonObject(raw.acceptance);
  const matching = toJsonObject(acceptance.matching);
  return normalizeSlugForMatching(
    getFirstString(matching, [
      ["profile_slug"],
      ["profileSlug"],
    ])
  );
}

function getWebhookProviderId(rawInput: unknown): string | null {
  const raw = toJsonObject(rawInput);
  const acceptance = toJsonObject(raw.acceptance);
  const payload = toJsonObject(acceptance.webhook_payload);
  return (
    getFirstString(payload, [
      ["user_provider_id"],
      ["userProviderId"],
      ["provider_id"],
      ["providerId"],
      ["user", "provider_id"],
      ["user", "providerId"],
    ]) ?? extractProviderId(raw)
  );
}

export async function findProviderIdFromInvitations(params: {
  supabase: SupabaseClient;
  clientId: string;
  leadId?: number | null;
  linkedinUrl: string | null;
  unipileAccountId?: string | null;
  lookbackDays?: number;
}): Promise<FindProviderIdFromInvitationsResult> {
  const { supabase, clientId, leadId, linkedinUrl, unipileAccountId } = params;
  const lookbackDays = Math.max(1, Math.min(Number(params.lookbackDays ?? 180), 365));
  const normalizedLeadUrl = normalizeLinkedInUrl(linkedinUrl);
  const slugLead = extractLinkedinSlug(linkedinUrl);

  const accountIds = await listClientLinkedinAccountIds({
    supabase,
    clientId,
    preferredAccountId: unipileAccountId ?? null,
  });
  const accountSet = new Set(accountIds);

  console.log({
    step: "provider-lookup:start",
    leadId,
    clientId,
    normalized_lead_url: normalizedLeadUrl,
    slug: slugLead,
    account_ids_count: accountIds.length,
  });

  const cutoffIso = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  let usedDateFilter = true;

  const queryWithDate = supabase
    .from("linkedin_invitations")
    .select("id, lead_id, unipile_account_id, created_at, raw")
    .eq("client_id", clientId)
    .not("raw->acceptance->webhook_payload->>user_provider_id", "is", null)
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(1200)
    .gte("created_at", cutoffIso);

  const rowsResultWithDate = await queryWithDate;
  let rowsError: unknown = null;
  let rows: InvitationLookupRow[] = [];

  if (rowsResultWithDate.error && isMissingColumnError(rowsResultWithDate.error, "created_at")) {
    usedDateFilter = false;
    const fallbackQuery = supabase
      .from("linkedin_invitations")
      .select("id, lead_id, unipile_account_id, raw")
      .eq("client_id", clientId)
      .not("raw->acceptance->webhook_payload->>user_provider_id", "is", null)
      .order("id", { ascending: false })
      .limit(1200);

    const fallbackResult = await fallbackQuery;
    rowsError = fallbackResult.error;
    rows = Array.isArray(fallbackResult.data)
      ? (fallbackResult.data as InvitationLookupRow[])
      : [];
  } else {
    rowsError = rowsResultWithDate.error;
    rows = Array.isArray(rowsResultWithDate.data)
      ? (rowsResultWithDate.data as InvitationLookupRow[])
      : [];
  }

  if (rowsError) {
    const fallbackNoProviderFilter = usedDateFilter
      ? await supabase
          .from("linkedin_invitations")
          .select("id, lead_id, unipile_account_id, created_at, raw")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false, nullsFirst: false })
          .limit(1200)
          .gte("created_at", cutoffIso)
      : await supabase
          .from("linkedin_invitations")
          .select("id, lead_id, unipile_account_id, raw")
          .eq("client_id", clientId)
          .order("id", { ascending: false })
          .limit(1200);

    if (!fallbackNoProviderFilter.error) {
      rowsError = null;
      rows = Array.isArray(fallbackNoProviderFilter.data)
        ? (fallbackNoProviderFilter.data as InvitationLookupRow[])
        : [];
    }
  }

  if (rowsError) {
    console.error("PROVIDER_LOOKUP_INVITATIONS_QUERY_ERROR", {
      leadId,
      clientId,
      normalized_lead_url: normalizedLeadUrl,
      slug: slugLead,
      error: rowsError,
    });
    return {
      providerId: null,
      invitationId: null,
      invitationCreatedAt: null,
      matchedBy: null,
      candidatesCount: 0,
      inspectedCount: 0,
      normalizedLeadUrl,
      slug: slugLead,
      recentProfileUrls: [],
      usedDateFilter,
    };
  }
  const recentProfileUrls: string[] = [];
  const slugMatchedRows: Array<{
    invitationId: string;
    createdAt: string | null;
    matchedBy:
      | "acceptance.matching.profile_slug"
      | "acceptance.webhook_payload.user_public_identifier";
    providerId: string | null;
  }> = [];
  const urlMatchedRows: Array<{
    invitationId: string;
    createdAt: string | null;
    matchedBy:
      | "acceptance.matching.normalized_linkedin_url"
      | "acceptance.webhook_payload.user_profile_url";
    providerId: string | null;
  }> = [];

  for (const row of rows) {
    const invitationRaw = row.raw;
    const rowAccountId = String(row.unipile_account_id ?? "").trim() || null;
    const webhookAccountId = getWebhookAccountId(invitationRaw, rowAccountId);
    if (accountSet.size > 0 && (!webhookAccountId || !accountSet.has(webhookAccountId))) {
      continue;
    }

    const invitationId = String(row.id ?? "").trim();
    const createdAt = String(row.created_at ?? "").trim() || null;
    const providerId = getWebhookProviderId(invitationRaw);
    if (!providerId) continue;

    const matchingNormalizedUrl = getMatchingNormalizedUrl(invitationRaw);
    const webhookProfileUrl = getWebhookProfileUrl(invitationRaw);
    const slugFromMatching = getMatchingProfileSlug(invitationRaw);
    const slugFromPublicIdentifier = getWebhookPublicIdentifier(invitationRaw);
    const slugWebhook = slugFromMatching ?? slugFromPublicIdentifier;
    const slugSource =
      slugFromMatching !== null
        ? "acceptance.matching.profile_slug"
        : slugFromPublicIdentifier !== null
          ? "acceptance.webhook_payload.user_public_identifier"
          : null;

    const isSlugMatch = Boolean(slugLead && slugWebhook && slugLead === slugWebhook);
    console.log({
      leadId,
      slugLead,
      slugWebhook,
      matched: isSlugMatch,
      providerId,
    });

    if (webhookProfileUrl && recentProfileUrls.length < 5) {
      recentProfileUrls.push(webhookProfileUrl);
    }

    if (isSlugMatch && slugSource) {
      slugMatchedRows.push({
        invitationId,
        createdAt,
        matchedBy: slugSource,
        providerId,
      });
      continue;
    }

    if (normalizedLeadUrl && matchingNormalizedUrl && matchingNormalizedUrl === normalizedLeadUrl) {
      urlMatchedRows.push({
        invitationId,
        createdAt,
        matchedBy: "acceptance.matching.normalized_linkedin_url",
        providerId,
      });
      continue;
    }

    if (normalizedLeadUrl && webhookProfileUrl && webhookProfileUrl === normalizedLeadUrl) {
      urlMatchedRows.push({
        invitationId,
        createdAt,
        matchedBy: "acceptance.webhook_payload.user_profile_url",
        providerId,
      });
    }
  }

  const sortedSlugMatches = [...slugMatchedRows].sort((a, b) => {
    const aDate = Date.parse(a.createdAt ?? "");
    const bDate = Date.parse(b.createdAt ?? "");
    if (Number.isFinite(aDate) && Number.isFinite(bDate) && aDate !== bDate) {
      return bDate - aDate;
    }
    return b.invitationId.localeCompare(a.invitationId);
  });
  const sortedUrlMatches = [...urlMatchedRows].sort((a, b) => {
    const aDate = Date.parse(a.createdAt ?? "");
    const bDate = Date.parse(b.createdAt ?? "");
    if (Number.isFinite(aDate) && Number.isFinite(bDate) && aDate !== bDate) {
      return bDate - aDate;
    }
    return b.invitationId.localeCompare(a.invitationId);
  });

  const chosen =
    sortedSlugMatches.find((row) => String(row.providerId ?? "").trim()) ??
    sortedUrlMatches.find((row) => String(row.providerId ?? "").trim()) ??
    null;
  const candidatesCount = sortedSlugMatches.length + sortedUrlMatches.length;

  console.log({
    step: "provider-lookup:done",
    leadId,
    clientId,
    normalized_lead_url: normalizedLeadUrl,
    slug: slugLead,
    candidates_count: candidatesCount,
    slug_candidates_count: sortedSlugMatches.length,
    url_candidates_count: sortedUrlMatches.length,
    used_invitation_id: chosen?.invitationId ?? null,
    used_invitation_created_at: chosen?.createdAt ?? null,
    matched_by: chosen?.matchedBy ?? null,
    provider_id_found: String(chosen?.providerId ?? "").trim() || null,
  });

  if (!chosen) {
    console.warn("PROVIDER_LOOKUP_NOT_FOUND", {
      leadId,
      clientId,
      normalized_lead_url: normalizedLeadUrl,
      slug: slugLead,
      candidates_count: candidatesCount,
      debug_last_profile_urls: recentProfileUrls,
      used_date_filter: usedDateFilter,
    });
  }

  return {
    providerId: String(chosen?.providerId ?? "").trim() || null,
    invitationId: chosen?.invitationId ?? null,
    invitationCreatedAt: chosen?.createdAt ?? null,
    matchedBy: chosen?.matchedBy ?? null,
    candidatesCount,
    inspectedCount: rows.length,
    normalizedLeadUrl,
    slug: slugLead,
    recentProfileUrls,
    usedDateFilter,
  };
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

  const failures: UnipileCallFailureDetail[] = [];

  for (const url of endpoints) {
    for (const body of bodyCandidates) {
      try {
        const response = await callUnipile({
          url,
          method: "POST",
          apiKey,
          body,
        });
        const threadId = extractThreadId(response.payload);
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
    } catch (error) {
      failures.push(
        toUnipileFailureMessage(error, {
          method: "POST",
          url,
          requestBody: body,
        })
      );
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

    console.log({
      step: "create-chat:start",
      leadId,
      providerId: usableProviderId,
      accountId: unipileAccountId,
      clientId,
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
