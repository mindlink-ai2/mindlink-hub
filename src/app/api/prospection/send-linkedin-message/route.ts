import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractLinkedInProfileSlug, normalizeLinkedInUrl } from "@/lib/linkedin-url";
import {
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
  toJsonObject,
  truncatePreview,
} from "@/lib/unipile-inbox";

type LeadRow = {
  id: number | string;
  client_id: number | string;
  LinkedInURL: string | null;
  FirstName: string | null;
  LastName: string | null;
  Name: string | null;
  internal_message: string | null;
  message_sent: boolean | null;
  message_sent_at: string | null;
  next_followup_at: string | null;
};

type ThreadRow = {
  id: string;
  unipile_thread_id: string | null;
  lead_id: number | string | null;
  lead_linkedin_url: string | null;
  contact_linkedin_url: string | null;
  updated_at: string | null;
};

const inFlightSends = new Set<string>();

function lockKey(clientId: string, leadId: number): string {
  return `${clientId}:${leadId}`;
}

function getDisplayName(lead: LeadRow): string | null {
  const fullName = `${lead.FirstName ?? ""} ${lead.LastName ?? ""}`.trim();
  if (fullName) return fullName;
  const raw = String(lead.Name ?? "").trim();
  return raw || null;
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

function extractProviderId(payload: unknown): string | null {
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
    ["data", "user", "provider_id"],
    ["data", "user", "providerId"],
    ["data", "profile", "provider_id"],
    ["data", "profile", "providerId"],
  ]);
}

function getErrorMessage(payload: unknown): string | null {
  if (typeof payload === "string") {
    const clean = payload.trim();
    return clean || null;
  }
  if (!payload || typeof payload !== "object") return null;

  const data = payload as Record<string, unknown>;
  const candidate = data.error ?? data.message ?? data.details ?? null;
  if (typeof candidate === "string") {
    const clean = candidate.trim();
    return clean || null;
  }
  return null;
}

type ConversationFailure = {
  endpoint: string;
  status: number | null;
  method: string;
  data: unknown;
  text: string;
  details: string | null;
  requestBody?: Record<string, unknown>;
};

function safeStringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function extractUnipileFailureDetails(data: unknown, text: string): string | null {
  const payloadMessage = getErrorMessage(data);
  if (payloadMessage) return payloadMessage;
  const cleanText = text.trim();
  if (cleanText) return cleanText;
  const serialized = safeStringify(data).trim();
  return serialized || null;
}

function mapUnipileErrorToUserMessage(params: { status: number | null; rawDetails: string | null }): string {
  const { status, rawDetails } = params;
  const excerptRaw = String(rawDetails ?? "").replace(/\s+/g, " ").trim();
  const excerpt = excerptRaw.length > 220 ? `${excerptRaw.slice(0, 220)}…` : excerptRaw;
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

  if (!excerpt) return "Unipile refuse la création du chat: détail indisponible";
  return `Unipile refuse la création du chat: ${excerpt}`;
}

function buildErrorResponse(params: {
  status: string;
  httpStatus: number;
  errorCode: string;
  errorMessage: string;
  debug?: unknown;
}) {
  const payload: Record<string, unknown> = {
    ok: false,
    status: params.status,
    error_code: params.errorCode,
    error_message: params.errorMessage,
    message: params.errorMessage,
  };

  if (process.env.NODE_ENV !== "production" && typeof params.debug !== "undefined") {
    payload.debug = params.debug;
  }

  return NextResponse.json(payload, { status: params.httpStatus });
}

function dedupeBodies(candidates: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>();
  const unique: Record<string, unknown>[] = [];

  for (const candidate of candidates) {
    const key = JSON.stringify(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }

  return unique;
}

function buildRecipientTargetVariants(params: {
  providerId: string;
  attendeeId?: string | null;
  profileSlug?: string | null;
  normalizedLeadLinkedInUrl?: string | null;
}): Array<Record<string, unknown>> {
  const { providerId, attendeeId, profileSlug, normalizedLeadLinkedInUrl } = params;
  const variants: Array<Record<string, unknown>> = [
    { provider_id: providerId },
    { recipient_provider_id: providerId },
    { attendee_id: providerId },
    { participant_id: providerId },
    { user_id: providerId },
    { id: providerId },
  ];

  const normalizedUrl = String(normalizedLeadLinkedInUrl ?? "").trim();
  if (normalizedUrl) {
    variants.push(
      { linkedin_url: normalizedUrl },
      { profile_url: normalizedUrl },
      { recipient_linkedin_url: normalizedUrl },
      { recipient_profile_url: normalizedUrl }
    );
  }

  const slug = String(profileSlug ?? "").trim();
  if (slug) {
    variants.push(
      { public_identifier: slug },
      { profile_slug: slug },
      { username: slug }
    );
  }

  const cleanAttendeeId = String(attendeeId ?? "").trim();
  if (cleanAttendeeId) {
    variants.unshift(
      { attendee_id: cleanAttendeeId },
      { participant_id: cleanAttendeeId },
      { recipient_attendee_id: cleanAttendeeId }
    );
  }

  return variants;
}

function extractAttendeeIdFromCandidate(candidate: Record<string, unknown>): string | null {
  return getFirstString(candidate, [
    ["attendee_id"],
    ["attendeeId"],
    ["participant_id"],
    ["participantId"],
    ["user_id"],
    ["userId"],
    ["id"],
  ]);
}

function extractProviderIdFromCandidate(candidate: Record<string, unknown>): string | null {
  return getFirstString(candidate, [
    ["provider_id"],
    ["providerId"],
    ["user_provider_id"],
    ["userProviderId"],
    ["profile", "provider_id"],
    ["profile", "providerId"],
  ]);
}

function extractNormalizedLinkedinFromCandidate(candidate: Record<string, unknown>): string | null {
  return normalizeLinkedInUrl(
    getFirstString(candidate, [
      ["linkedin_url"],
      ["linkedinUrl"],
      ["profile_url"],
      ["profileUrl"],
      ["public_profile_url"],
      ["publicProfileUrl"],
      ["url"],
      ["profile", "url"],
    ])
  );
}

async function resolveRecipientAttendeeId(params: {
  base: string;
  apiKey: string;
  unipileAccountId: string;
  providerId: string;
  normalizedLeadLinkedInUrl: string | null;
  profileSlug: string | null;
}): Promise<string | null> {
  const {
    base,
    apiKey,
    unipileAccountId,
    providerId,
    normalizedLeadLinkedInUrl,
    profileSlug,
  } = params;

  const accountId = encodeURIComponent(unipileAccountId);
  const encodedProviderId = encodeURIComponent(providerId);
  const encodedLinkedInUrl = normalizedLeadLinkedInUrl
    ? encodeURIComponent(normalizedLeadLinkedInUrl)
    : null;
  const encodedSlug = profileSlug ? encodeURIComponent(profileSlug) : null;

  const endpointCandidates = [
    `${base}/api/v1/attendees?account_id=${accountId}&provider_id=${encodedProviderId}`,
    `${base}/api/v1/attendees?account_id=${accountId}&user_provider_id=${encodedProviderId}`,
    `${base}/api/v1/attendees?account_id=${accountId}&id=${encodedProviderId}`,
    ...(encodedLinkedInUrl
      ? [
          `${base}/api/v1/attendees?account_id=${accountId}&linkedin_url=${encodedLinkedInUrl}`,
          `${base}/api/v1/attendees?account_id=${accountId}&profile_url=${encodedLinkedInUrl}`,
        ]
      : []),
    ...(encodedSlug
      ? [
          `${base}/api/v1/attendees?account_id=${accountId}&public_identifier=${encodedSlug}`,
          `${base}/api/v1/attendees?account_id=${accountId}&profile_slug=${encodedSlug}`,
        ]
      : []),
    `${base}/api/v1/attendees?account_id=${accountId}&limit=200`,
  ];

  for (const endpoint of endpointCandidates) {
    const res = await fetch(endpoint, {
      method: "GET",
      headers: {
        "X-API-KEY": apiKey,
        accept: "application/json",
      },
    }).catch(() => null);

    if (!res || !res.ok) continue;
    const payload = await readResponseBody(res);
    const candidates = [
      toJsonObject(payload),
      ...extractArrayCandidates(payload).map((entry) => toJsonObject(entry)),
    ];

    let fallbackAttendeeId: string | null = null;
    for (const candidate of candidates) {
      const attendeeId = extractAttendeeIdFromCandidate(candidate);
      if (!attendeeId) continue;
      if (!fallbackAttendeeId) fallbackAttendeeId = attendeeId;

      const candidateProviderId = extractProviderIdFromCandidate(candidate);
      if (candidateProviderId && candidateProviderId === providerId) {
        return attendeeId;
      }

      const candidateLinkedInUrl = extractNormalizedLinkedinFromCandidate(candidate);
      if (candidateLinkedInUrl && normalizedLeadLinkedInUrl && candidateLinkedInUrl === normalizedLeadLinkedInUrl) {
        return attendeeId;
      }

      const candidateSlug = extractLinkedInProfileSlug(candidateLinkedInUrl);
      if (candidateSlug && profileSlug && candidateSlug === profileSlug) {
        return attendeeId;
      }
    }

    if (fallbackAttendeeId) return fallbackAttendeeId;
  }

  return null;
}

async function resolveLead(
  supabase: SupabaseClient,
  clientId: string,
  leadId: number
): Promise<LeadRow | null> {
  const { data, error } = await supabase
    .from("leads")
    .select(
      "id, client_id, LinkedInURL, FirstName, LastName, Name, internal_message, message_sent, message_sent_at, next_followup_at"
    )
    .eq("id", leadId)
    .eq("client_id", clientId)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as LeadRow;
}

async function findExistingThread(params: {
  supabase: SupabaseClient;
  clientId: string;
  unipileAccountId: string;
  leadId: number;
  normalizedLeadLinkedInUrl: string | null;
}): Promise<ThreadRow | null> {
  const { supabase, clientId, unipileAccountId, leadId, normalizedLeadLinkedInUrl } = params;

  const { data: leadThreads, error: leadThreadError } = await supabase
    .from("inbox_threads")
    .select("id, unipile_thread_id, lead_id, lead_linkedin_url, contact_linkedin_url, updated_at")
    .eq("client_id", clientId)
    .eq("unipile_account_id", unipileAccountId)
    .eq("lead_id", leadId)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(1);

  if (!leadThreadError && Array.isArray(leadThreads) && leadThreads.length > 0) {
    return leadThreads[0] as ThreadRow;
  }

  if (!normalizedLeadLinkedInUrl) return null;

  const { data: accountThreads, error: accountThreadsError } = await supabase
    .from("inbox_threads")
    .select("id, unipile_thread_id, lead_id, lead_linkedin_url, contact_linkedin_url, updated_at")
    .eq("client_id", clientId)
    .eq("unipile_account_id", unipileAccountId)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(400);

  if (accountThreadsError || !Array.isArray(accountThreads)) return null;

  for (const row of accountThreads as ThreadRow[]) {
    const leadUrl = normalizeLinkedInUrl(row.lead_linkedin_url);
    if (leadUrl && leadUrl === normalizedLeadLinkedInUrl) return row;

    const contactUrl = normalizeLinkedInUrl(row.contact_linkedin_url);
    if (contactUrl && contactUrl === normalizedLeadLinkedInUrl) return row;
  }

  return null;
}

async function ensureThreadRow(params: {
  supabase: SupabaseClient;
  clientId: string;
  unipileAccountId: string;
  unipileThreadId: string;
  lead: LeadRow;
  normalizedLeadLinkedInUrl: string | null;
}): Promise<{ threadDbId: string } | null> {
  const { supabase, clientId, unipileAccountId, unipileThreadId, lead, normalizedLeadLinkedInUrl } = params;
  const nowIso = new Date().toISOString();

  const upsertPayload: Record<string, unknown> = {
    client_id: clientId,
    provider: "linkedin",
    unipile_account_id: unipileAccountId,
    unipile_thread_id: unipileThreadId,
    updated_at: nowIso,
  };

  const leadId = Number(lead.id);
  if (Number.isFinite(leadId)) upsertPayload.lead_id = leadId;
  if (normalizedLeadLinkedInUrl) {
    upsertPayload.lead_linkedin_url = normalizedLeadLinkedInUrl;
    upsertPayload.contact_linkedin_url = normalizedLeadLinkedInUrl;
  }

  const contactName = getDisplayName(lead);
  if (contactName) upsertPayload.contact_name = contactName;

  const { data: upserted, error: upsertErr } = await supabase
    .from("inbox_threads")
    .upsert(upsertPayload, { onConflict: "client_id,unipile_account_id,unipile_thread_id" })
    .select("id")
    .limit(1)
    .maybeSingle();

  if (upsertErr) {
    console.error("PROSPECTION_SEND_THREAD_UPSERT_ERROR", {
      clientId,
      leadId: lead.id,
      unipileAccountId,
      unipileThreadId,
      error: upsertErr,
    });
    return null;
  }

  const threadDbId = String(upserted?.id ?? "").trim();
  if (threadDbId) return { threadDbId };

  const { data: row } = await supabase
    .from("inbox_threads")
    .select("id")
    .eq("client_id", clientId)
    .eq("unipile_account_id", unipileAccountId)
    .eq("unipile_thread_id", unipileThreadId)
    .limit(1)
    .maybeSingle();

  const fallbackThreadDbId = String(row?.id ?? "").trim();
  if (!fallbackThreadDbId) return null;
  return { threadDbId: fallbackThreadDbId };
}

async function sendMessageToThread(params: {
  base: string;
  apiKey: string;
  unipileAccountId: string;
  unipileThreadId: string;
  text: string;
}): Promise<
  | {
      ok: true;
      sentAt: string;
      unipileMessageId: string;
      payload: unknown;
      senderName: string | null;
      senderLinkedInUrl: string | null;
    }
  | {
      ok: false;
      failures: ConversationFailure[];
    }
> {
  const { base, apiKey, unipileAccountId, unipileThreadId, text } = params;
  const endpoints = [
    `${base}/api/v1/chats/${encodeURIComponent(unipileThreadId)}/messages`,
    `${base}/api/v1/conversations/${encodeURIComponent(unipileThreadId)}/messages`,
    `${base}/api/v1/messages`,
  ];
  const failures: ConversationFailure[] = [];

  for (const endpoint of endpoints) {
    const requestBody = /\/api\/v1\/messages$/.test(endpoint)
      ? {
          account_id: unipileAccountId,
          chat_id: unipileThreadId,
          text,
        }
      : {
          account_id: unipileAccountId,
          text,
        };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const textBody = await res.text().catch(() => "");
    let payload: unknown = null;
    if (textBody) {
      try {
        payload = JSON.parse(textBody) as Record<string, unknown>;
      } catch {
        payload = textBody;
      }
    }

    if (!res.ok) {
      failures.push({
        endpoint,
        status: res.status,
        method: "POST",
        data: payload ?? { raw_text: textBody || "empty_response_body" },
        text: textBody,
        details: extractUnipileFailureDetails(payload, textBody),
        requestBody,
      });
      continue;
    }

    const responseObject = toJsonObject(payload);
  const parsedMessage = parseUnipileMessage({
    ...responseObject,
    ...(toJsonObject(responseObject.data)),
    ...(toJsonObject(responseObject.message)),
    direction: "outbound",
    thread_id: unipileThreadId,
    text,
  });

    if (!parsedMessage.unipileMessageId) {
      failures.push({
        endpoint,
        status: res.status,
        method: "POST",
        data: payload,
        text: textBody,
        details: "message_id_missing_in_send_response",
        requestBody,
      });
      continue;
    }

    return {
      ok: true,
      sentAt: parsedMessage.sentAtIso,
      unipileMessageId: parsedMessage.unipileMessageId,
      payload,
      senderName: parsedMessage.senderName,
      senderLinkedInUrl: parsedMessage.senderLinkedInUrl,
    };
  }

  return { ok: false, failures };
}

async function persistOutboundMessage(params: {
  supabase: SupabaseClient;
  clientId: string;
  threadDbId: string;
  unipileAccountId: string;
  unipileThreadId: string;
  unipileMessageId: string;
  text: string;
  sentAt: string;
  payload: unknown;
  senderLinkedInUrl: string | null;
}) {
  const {
    supabase,
    clientId,
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
    console.error("PROSPECTION_SEND_MESSAGE_EXISTS_LOOKUP_ERROR", {
      clientId,
      threadDbId,
      unipileMessageId,
      error: existingMessageErr,
    });
    return { ok: false as const };
  }

  if (!existingMessage?.id) {
    const { error: messageInsertErr } = await supabase.from("inbox_messages").insert({
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
    });

    if (messageInsertErr) {
      console.error("PROSPECTION_SEND_MESSAGE_INSERT_ERROR", {
        clientId,
        threadDbId,
        unipileMessageId,
        error: messageInsertErr,
      });
      return { ok: false as const };
    }
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

  if (threadUpdateErr) {
    console.error("PROSPECTION_SEND_THREAD_UPDATE_ERROR", {
      clientId,
      threadDbId,
      error: threadUpdateErr,
    });
  }

  return { ok: true as const };
}

async function createConversationThreadId(params: {
  base: string;
  apiKey: string;
  unipileAccountId: string;
  providerId: string;
  targetVariants: Array<Record<string, unknown>>;
}): Promise<{ threadId: string | null; failures: ConversationFailure[] }> {
  const { base, apiKey, unipileAccountId, providerId, targetVariants } = params;

  const endpointCandidates = [
    `${base}/api/v1/chats`,
    `${base}/api/v1/conversations`,
  ];

  const bodyCandidates: Record<string, unknown>[] = dedupeBodies([
    ...targetVariants.map((target) => ({ account_id: unipileAccountId, ...target })),
    ...targetVariants.map((target) => ({ account_id: unipileAccountId, attendees: [target] })),
    ...targetVariants.map((target) => ({ account_id: unipileAccountId, participants: [target] })),
    { account_id: unipileAccountId, participant_ids: [providerId] },
    { account_id: unipileAccountId, attendee_ids: [providerId] },
    { account_id: unipileAccountId, provider_ids: [providerId] },
  ]);

  const failures: ConversationFailure[] = [];

  for (const endpoint of endpointCandidates) {
    for (const body of bodyCandidates) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const text = await res.text().catch(() => "");
      let payload: unknown = null;
      if (text) {
        try {
          payload = JSON.parse(text) as Record<string, unknown>;
        } catch {
          payload = text;
        }
      }

      if (!res.ok) {
        const details = extractUnipileFailureDetails(payload, text);
        failures.push({
          endpoint,
          status: res.status,
          method: "POST",
          data: payload ?? { raw_text: text || "empty_response_body" },
          text,
          details,
          requestBody: body,
        });
        continue;
      }

      const threadId = extractThreadId(payload);
      if (threadId) return { threadId, failures };
    }
  }

  if (failures.length > 0) {
    console.error("PROSPECTION_SEND_CONVERSATION_CREATE_FAILED", {
      unipileAccountId,
      providerId,
      failures: failures.slice(0, 8),
    });
  }

  return { threadId: null, failures };
}

async function updateLeadSentMetadata(
  supabase: SupabaseClient,
  clientId: string,
  leadId: number
): Promise<{ message_sent_at: string | null; next_followup_at: string | null } | null> {
  const now = new Date();
  const next = new Date();
  next.setDate(now.getDate() + 7);

  const { data, error } = await supabase
    .from("leads")
    .update({
      message_sent: true,
      message_sent_at: now.toISOString(),
      next_followup_at: next.toISOString(),
    })
    .eq("id", leadId)
    .eq("client_id", clientId)
    .select("message_sent_at, next_followup_at")
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return {
    message_sent_at:
      typeof data?.message_sent_at === "string" ? data.message_sent_at : null,
    next_followup_at:
      typeof data?.next_followup_at === "string" ? data.next_followup_at : null,
  };
}

export async function POST(req: Request) {
  let currentLockKey: string | null = null;

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ ok: false, status: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const leadIdRaw = body?.leadId ?? body?.prospectId;
    const leadId = Number(leadIdRaw);
    const content = String(body?.content ?? "").trim();

    if (!Number.isFinite(leadId)) {
      return NextResponse.json(
        { ok: false, status: "invalid_lead_id", message: "Prospect invalide." },
        { status: 400 }
      );
    }

    if (!content) {
      return NextResponse.json(
        { ok: false, status: "empty_content", message: "Le message LinkedIn est vide." },
        { status: 400 }
      );
    }

    const supabase = createClient(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY")
    );

    const clientId = await getClientIdFromClerkUser(supabase, userId);
    if (!clientId) {
      return buildErrorResponse({
        status: "client_not_found",
        httpStatus: 404,
        errorCode: "CLIENT_NOT_FOUND",
        errorMessage: "Client introuvable.",
      });
    }

    currentLockKey = lockKey(clientId, leadId);
    if (inFlightSends.has(currentLockKey)) {
      return buildErrorResponse({
        status: "already_in_progress",
        httpStatus: 409,
        errorCode: "SEND_ALREADY_IN_PROGRESS",
        errorMessage: "Envoi déjà en cours",
      });
    }
    inFlightSends.add(currentLockKey);

    console.log({
      step: "load-lead:start",
      leadId,
      provider_id: null,
      unipile_account_id: null,
    });

    const lead = await resolveLead(supabase, clientId, leadId);
    if (!lead) {
      return buildErrorResponse({
        status: "lead_not_found",
        httpStatus: 404,
        errorCode: "LEAD_NOT_FOUND",
        errorMessage: "Prospect introuvable.",
      });
    }

    const normalizedLeadLinkedInUrl = normalizeLinkedInUrl(lead.LinkedInURL);
    const profileSlug = extractLinkedInProfileSlug(lead.LinkedInURL);
    if (!normalizedLeadLinkedInUrl || !profileSlug) {
      return buildErrorResponse({
        status: "missing_linkedin_info",
        httpStatus: 400,
        errorCode: "MISSING_PROVIDER_ID",
        errorMessage: "Profil LinkedIn du prospect invalide (provider_id manquant ou incorrect).",
      });
    }

    const unipileAccountId = await getLinkedinUnipileAccountId(supabase, clientId);
    if (!unipileAccountId) {
      return buildErrorResponse({
        status: "linkedin_account_not_connected",
        httpStatus: 400,
        errorCode: "LINKEDIN_ACCOUNT_NOT_CONNECTED",
        errorMessage: "Compte LinkedIn non connecté ou autorisation refusée. Reconnecte ton LinkedIn.",
      });
    }

    const base = normalizeUnipileBase(requireEnv("UNIPILE_DSN"));
    const apiKey = requireEnv("UNIPILE_API_KEY");

    const existingThread = await findExistingThread({
      supabase,
      clientId,
      unipileAccountId,
      leadId,
      normalizedLeadLinkedInUrl,
    });

    let threadDbId = existingThread ? String(existingThread.id) : "";
    let unipileThreadId = existingThread?.unipile_thread_id
      ? String(existingThread.unipile_thread_id)
      : "";
    let threadCreated = false;

    if (!threadDbId || !unipileThreadId) {
      const profileRes = await fetch(
        `${base}/api/v1/users/${encodeURIComponent(
          profileSlug
        )}?account_id=${encodeURIComponent(unipileAccountId)}`,
        {
          method: "GET",
          headers: {
            "X-API-KEY": apiKey,
            accept: "application/json",
          },
        }
      );

      const profilePayload = await readResponseBody(profileRes);
      if (!profileRes.ok) {
        console.error("PROSPECTION_SEND_PROFILE_LOOKUP_FAILED", {
          clientId,
          leadId,
          status: profileRes.status,
          details: getErrorMessage(profilePayload),
        });
        return NextResponse.json(
          {
            ok: false,
            status: "profile_lookup_failed",
            message: "Impossible d’envoyer : profil LinkedIn introuvable.",
          },
          { status: 502 }
        );
      }

      const providerId = extractProviderId(profilePayload);
      if (!providerId) {
        return buildErrorResponse({
          status: "provider_id_missing",
          httpStatus: 400,
          errorCode: "MISSING_PROVIDER_ID",
          errorMessage: "Profil LinkedIn du prospect invalide (provider_id manquant ou incorrect).",
        });
      }

      console.log({
        step: "load-lead",
        leadId,
        provider_id: providerId,
        unipile_account_id: unipileAccountId,
      });

      const resolvedAttendeeId = await resolveRecipientAttendeeId({
        base,
        apiKey,
        unipileAccountId,
        providerId,
        normalizedLeadLinkedInUrl,
        profileSlug,
      });

      const targetVariants = buildRecipientTargetVariants({
        providerId,
        attendeeId: resolvedAttendeeId,
        profileSlug,
        normalizedLeadLinkedInUrl,
      });

      console.log({
        step: "create-chat:start",
        leadId,
        providerId,
        accountId: unipileAccountId,
      });

      const conversationCreate = await createConversationThreadId({
        base,
        apiKey,
        unipileAccountId,
        providerId,
        targetVariants,
      });
      const createdThreadId = conversationCreate.threadId;

      if (createdThreadId) {
        const ensured = await ensureThreadRow({
          supabase,
          clientId,
          unipileAccountId,
          unipileThreadId: createdThreadId,
          lead,
          normalizedLeadLinkedInUrl,
        });

        if (!ensured?.threadDbId) {
          return NextResponse.json(
            { ok: false, status: "thread_upsert_failed", message: "Impossible de préparer la conversation." },
            { status: 500 }
          );
        }

        threadDbId = ensured.threadDbId;
        unipileThreadId = createdThreadId;
        threadCreated = true;
      } else {
        const primaryCreateFailure = conversationCreate.failures.find(
          (failure) => Boolean(failure.details || failure.text)
        );
        console.error("UNIPILE_CREATE_CHAT_FAILED", {
          leadId,
          providerId,
          accountId: unipileAccountId,
          status: primaryCreateFailure?.status ?? null,
          data: primaryCreateFailure?.data ?? null,
          text: primaryCreateFailure?.text ?? null,
          message: primaryCreateFailure?.details ?? "unipile_create_chat_failed",
        });

        // Fallback: certains comptes Unipile créent implicitement la conversation à l'envoi.
        const directSendBodies = dedupeBodies([
          ...targetVariants.map((target) => ({
            account_id: unipileAccountId,
            text: content,
            ...target,
          })),
          ...targetVariants.map((target) => ({
            account_id: unipileAccountId,
            message: content,
            ...target,
          })),
          ...targetVariants.map((target) => ({
            account_id: unipileAccountId,
            content,
            ...target,
          })),
          ...targetVariants.map((target) => ({
            account_id: unipileAccountId,
            text: content,
            attendees: [target],
          })),
          ...targetVariants.map((target) => ({
            account_id: unipileAccountId,
            text: content,
            participants: [target],
          })),
          { account_id: unipileAccountId, text: content, participant_ids: [providerId] },
          { account_id: unipileAccountId, text: content, attendee_ids: [providerId] },
          { account_id: unipileAccountId, text: content, provider_ids: [providerId] },
        ]);

        let directSend: { payload: unknown; url: string } | null = null;
        const directSendFailures: Array<{ status: number; data: unknown; text: string; details: string | null }> = [];
        for (const requestBody of directSendBodies) {
          const res = await fetch(`${base}/api/v1/messages`, {
            method: "POST",
            headers: {
              "X-API-KEY": apiKey,
              accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          });

          const text = await res.text().catch(() => "");
          let payload: unknown = null;
          if (text) {
            try {
              payload = JSON.parse(text) as Record<string, unknown>;
            } catch {
              payload = text;
            }
          }
          if (!res.ok) {
            directSendFailures.push({
              status: res.status,
              data: payload ?? { raw_text: text || "empty_response_body" },
              text,
              details: extractUnipileFailureDetails(payload, text),
            });
            continue;
          }
          directSend = { payload, url: `${base}/api/v1/messages` };
          break;
        }

        if (!directSend) {
          console.error("PROSPECTION_SEND_DIRECT_MESSAGE_FALLBACK_FAILED", {
            unipileAccountId,
            providerId,
            failures: directSendFailures.slice(0, 8),
          });
          const combinedFailures = [
            ...conversationCreate.failures,
            ...directSendFailures.map((failure) => ({
              endpoint: `${base}/api/v1/messages`,
              status: failure.status,
              method: "POST",
              data: failure.data,
              text: failure.text,
              details: failure.details,
            })),
          ];
          const firstFailure = combinedFailures.find((failure) => Boolean(failure.details || failure.text)) ?? null;
          const userMessage = mapUnipileErrorToUserMessage({
            status: firstFailure?.status ?? null,
            rawDetails: firstFailure?.details ?? firstFailure?.text ?? null,
          });
          return buildErrorResponse({
            status: "conversation_create_failed",
            httpStatus: 502,
            errorCode: "UNIPILE_CREATE_CHAT_FAILED",
            errorMessage: userMessage,
            debug: combinedFailures,
          });
        }

        const parsedDirectMessage = parseUnipileMessage({
          ...toJsonObject(directSend.payload),
          ...(toJsonObject(toJsonObject(directSend.payload).data)),
          ...(toJsonObject(toJsonObject(directSend.payload).message)),
          direction: "outbound",
          text: content,
        });

        const directThreadId =
          parsedDirectMessage.unipileThreadId ?? extractThreadId(directSend.payload);
        const directMessageId = parsedDirectMessage.unipileMessageId;

        if (!directThreadId || !directMessageId) {
          return NextResponse.json(
            {
              ok: false,
              status: "conversation_create_failed",
              message: "Impossible d’envoyer : conversation LinkedIn introuvable après création.",
            },
            { status: 502 }
          );
        }

        const ensured = await ensureThreadRow({
          supabase,
          clientId,
          unipileAccountId,
          unipileThreadId: directThreadId,
          lead,
          normalizedLeadLinkedInUrl,
        });

        if (!ensured?.threadDbId) {
          return NextResponse.json(
            { ok: false, status: "thread_upsert_failed", message: "Impossible de préparer la conversation." },
            { status: 500 }
          );
        }

        threadDbId = ensured.threadDbId;
        unipileThreadId = directThreadId;
        threadCreated = true;

        const persisted = await persistOutboundMessage({
          supabase,
          clientId,
          threadDbId,
          unipileAccountId,
          unipileThreadId,
          unipileMessageId: directMessageId,
          text: content,
          sentAt: parsedDirectMessage.sentAtIso,
          payload: directSend.payload,
          senderLinkedInUrl: parsedDirectMessage.senderLinkedInUrl,
        });

        if (!persisted.ok) {
          return NextResponse.json(
            { ok: false, status: "message_persist_failed", message: "Message envoyé mais enregistrement Hub échoué." },
            { status: 500 }
          );
        }

        const leadUpdate = await updateLeadSentMetadata(supabase, clientId, leadId);
        return NextResponse.json({
          ok: true,
          status: "sent",
          threadCreated,
          lead: {
            message_sent: true,
            message_sent_at: leadUpdate?.message_sent_at ?? parsedDirectMessage.sentAtIso,
            next_followup_at: leadUpdate?.next_followup_at ?? null,
          },
        });
      }
    }

    const sent = await sendMessageToThread({
      base,
      apiKey,
      unipileAccountId,
      unipileThreadId,
      text: content,
    });

    if (!sent.ok) {
      return buildErrorResponse({
        status: "send_failed",
        httpStatus: 502,
        errorCode: "UNIPILE_SEND_MESSAGE_FAILED",
        errorMessage: "Impossible d’envoyer le message LinkedIn pour le moment.",
        debug: sent.failures,
      });
    }

    const persisted = await persistOutboundMessage({
      supabase,
      clientId,
      threadDbId,
      unipileAccountId,
      unipileThreadId,
      unipileMessageId: sent.unipileMessageId,
      text: content,
      sentAt: sent.sentAt,
      payload: sent.payload,
      senderLinkedInUrl: sent.senderLinkedInUrl,
    });

    if (!persisted.ok) {
      return NextResponse.json(
        { ok: false, status: "message_persist_failed", message: "Message envoyé mais enregistrement Hub échoué." },
        { status: 500 }
      );
    }

    const leadUpdate = await updateLeadSentMetadata(supabase, clientId, leadId);

    return NextResponse.json({
      ok: true,
      status: "sent",
      threadCreated,
      lead: {
        message_sent: true,
        message_sent_at: leadUpdate?.message_sent_at ?? sent.sentAt,
        next_followup_at: leadUpdate?.next_followup_at ?? null,
      },
    });
  } catch (error: unknown) {
    console.error("SEND_LINKEDIN_ERROR", error);
    return buildErrorResponse({
      status: "server_error",
      httpStatus: 500,
      errorCode: "SEND_LINKEDIN_SERVER_ERROR",
      errorMessage: error instanceof Error ? error.message : "Erreur serveur pendant l’envoi.",
      debug: error,
    });
  } finally {
    if (currentLockKey) inFlightSends.delete(currentLockKey);
  }
}
