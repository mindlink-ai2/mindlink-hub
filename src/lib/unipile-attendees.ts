import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeLinkedInUrl } from "@/lib/linkedin-url";
import { normalizeUnipileBase, readResponseBody, requireEnv } from "@/lib/inbox-server";
import {
  extractArrayCandidates,
  getFirstBoolean,
  getFirstString,
  toJsonObject,
} from "@/lib/unipile-inbox";

const ATTENDEE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type UnipileApiConfig = {
  base: string;
  apiKey: string;
};

export type ResolvedAttendee = {
  attendeeId: string | null;
  name: string | null;
  linkedinUrl: string | null;
  avatarUrl: string | null;
  isSelf: boolean | null;
};

function parseIsoMs(value: string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return Number.NEGATIVE_INFINITY;
  return date.getTime();
}

function parseAttendeeCandidate(input: unknown): ResolvedAttendee | null {
  const obj = toJsonObject(input);
  if (!obj || Object.keys(obj).length === 0) return null;

  const attendeeId =
    getFirstString(obj, [
      ["attendee_id"],
      ["attendeeId"],
      ["participant_id"],
      ["participantId"],
      ["user_id"],
      ["userId"],
      ["id"],
      ["profile_id"],
      ["profileId"],
    ]) ?? null;

  const name =
    getFirstString(obj, [
      ["display_name"],
      ["displayName"],
      ["name"],
      ["full_name"],
      ["fullName"],
      ["public_name"],
      ["publicName"],
    ]) ?? null;

  const linkedinUrl = normalizeLinkedInUrl(
    getFirstString(obj, [
      ["linkedin_url"],
      ["linkedinUrl"],
      ["profile_url"],
      ["profileUrl"],
      ["public_profile_url"],
      ["publicProfileUrl"],
      ["url"],
    ])
  );

  const avatarUrl =
    getFirstString(obj, [
      ["avatar_url"],
      ["avatarUrl"],
      ["photo_url"],
      ["photoUrl"],
      ["profile_picture_url"],
      ["profilePictureUrl"],
      ["image_url"],
      ["imageUrl"],
    ]) ?? null;

  const isSelf = getFirstBoolean(obj, [
    ["is_self"],
    ["isSelf"],
    ["self"],
    ["is_sender"],
    ["isSender"],
    ["from_me"],
  ]);

  if (!attendeeId && !name && !linkedinUrl && !avatarUrl) {
    return null;
  }

  return {
    attendeeId,
    name,
    linkedinUrl,
    avatarUrl,
    isSelf,
  };
}

function extractAttendeeCandidatesFromPayload(payload: unknown): ResolvedAttendee[] {
  const output: ResolvedAttendee[] = [];
  const root = toJsonObject(payload);

  const direct = parseAttendeeCandidate(root);
  if (direct) output.push(direct);

  const nestedObjects: unknown[] = [
    root.data,
    root.attendee,
    root.participant,
    root.contact,
    root.sender,
    root.user,
    root.profile,
  ];

  for (const nested of nestedObjects) {
    const parsedNested = parseAttendeeCandidate(nested);
    if (parsedNested) output.push(parsedNested);
  }

  const nestedArrays: unknown[] = [
    root.attendees,
    root.participants,
    root.members,
    root.recipients,
    root.counterparts,
    root.users,
    root.people,
  ];

  for (const maybeArray of nestedArrays) {
    if (!Array.isArray(maybeArray)) continue;
    for (const item of maybeArray) {
      const parsed = parseAttendeeCandidate(item);
      if (parsed) output.push(parsed);
    }
  }

  for (const item of extractArrayCandidates(payload)) {
    const parsed = parseAttendeeCandidate(item);
    if (parsed) output.push(parsed);
  }

  return output;
}

function chooseAttendee(params: {
  candidates: ResolvedAttendee[];
  attendeeId?: string | null;
  preferOther?: boolean;
}): ResolvedAttendee | null {
  const { candidates, attendeeId, preferOther } = params;
  if (candidates.length === 0) return null;

  if (attendeeId) {
    const wantedId = attendeeId.trim();
    const byExactId = candidates.find(
      (candidate) => candidate.attendeeId && candidate.attendeeId === wantedId
    );
    if (byExactId) return byExactId;
  }

  if (preferOther) {
    const explicitOther = candidates.find((candidate) => candidate.isSelf === false);
    if (explicitOther) return explicitOther;
  }

  const firstNamed = candidates.find(
    (candidate) => Boolean(candidate.name || candidate.linkedinUrl || candidate.avatarUrl)
  );
  if (firstNamed) return firstNamed;

  return candidates[0] ?? null;
}

async function fetchAttendeeFromEndpoints(params: {
  endpoints: string[];
  apiKey: string;
  attendeeId?: string | null;
  preferOther?: boolean;
}): Promise<ResolvedAttendee | null> {
  const { endpoints, apiKey, attendeeId, preferOther } = params;

  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "X-API-KEY": apiKey,
        accept: "application/json",
      },
    }).catch(() => null);

    if (!response || !response.ok) continue;

    const payload = await readResponseBody(response);
    const candidates = extractAttendeeCandidatesFromPayload(payload);
    const chosen = chooseAttendee({
      candidates,
      attendeeId,
      preferOther,
    });
    if (chosen) return chosen;
  }

  return null;
}

function getUnipileConfigOrNull(config?: UnipileApiConfig): UnipileApiConfig | null {
  if (config?.base && config?.apiKey) return config;

  try {
    return {
      base: normalizeUnipileBase(requireEnv("UNIPILE_DSN")),
      apiKey: requireEnv("UNIPILE_API_KEY"),
    };
  } catch {
    return null;
  }
}

export function extractSenderAttendeeId(payloadInput: unknown): string | null {
  const payload = toJsonObject(payloadInput);
  return getFirstString(payload, [
    ["sender_attendee_id"],
    ["senderAttendeeId"],
    ["sender", "attendee_id"],
    ["sender", "attendeeId"],
    ["sender", "id"],
    ["attendee_id"],
    ["attendeeId"],
    ["data", "sender_attendee_id"],
    ["data", "senderAttendeeId"],
    ["data", "sender", "attendee_id"],
    ["data", "sender", "attendeeId"],
    ["data", "sender", "id"],
    ["data", "attendee_id"],
    ["data", "attendeeId"],
  ]);
}

function extractAttendeeIdFromRawMessage(raw: unknown): string | null {
  const rawObj = toJsonObject(raw);
  const resolvedId = getFirstString(rawObj, [
    ["resolved_sender", "attendee_id"],
    ["resolved_sender", "attendeeId"],
  ]);
  return resolvedId ?? extractSenderAttendeeId(rawObj);
}

export async function findCachedAttendeeBySenderId(params: {
  supabase: SupabaseClient;
  clientId: string;
  unipileAccountId: string;
  senderAttendeeId: string;
}): Promise<ResolvedAttendee | null> {
  const { supabase, clientId, unipileAccountId, senderAttendeeId } = params;
  const wanted = senderAttendeeId.trim();
  if (!wanted) return null;

  const cutoffIso = new Date(Date.now() - ATTENDEE_CACHE_TTL_MS).toISOString();

  const { data: rows, error } = await supabase
    .from("inbox_messages")
    .select("sender_name, sender_linkedin_url, raw, sent_at")
    .eq("client_id", clientId)
    .eq("unipile_account_id", unipileAccountId)
    .gte("sent_at", cutoffIso)
    .order("sent_at", { ascending: false })
    .limit(500);

  if (error || !Array.isArray(rows)) {
    if (error) console.error("UNIPILE_ATTENDEE_CACHE_QUERY_ERROR:", error);
    return null;
  }

  for (const row of rows) {
    const messageObj = toJsonObject(row);
    const raw = messageObj.raw;
    const attendeeId = extractAttendeeIdFromRawMessage(raw);
    if (!attendeeId || attendeeId !== wanted) continue;

    const sentAt =
      typeof messageObj.sent_at === "string" ? parseIsoMs(messageObj.sent_at) : Number.NEGATIVE_INFINITY;
    if (sentAt < Date.now() - ATTENDEE_CACHE_TTL_MS) continue;

    const rowSenderName =
      typeof messageObj.sender_name === "string" ? messageObj.sender_name.trim() : "";
    const rowLinkedinUrl =
      typeof messageObj.sender_linkedin_url === "string"
        ? normalizeLinkedInUrl(messageObj.sender_linkedin_url)
        : null;

    const rawObj = toJsonObject(raw);
    const resolvedName =
      rowSenderName ||
      getFirstString(rawObj, [
        ["resolved_sender", "name"],
        ["sender_name"],
      ]) ||
      "";
    const resolvedLinkedInUrl =
      rowLinkedinUrl ??
      normalizeLinkedInUrl(
        getFirstString(rawObj, [
          ["resolved_sender", "linkedin_url"],
          ["resolved_sender", "linkedinUrl"],
          ["resolved_sender", "profile_url"],
          ["resolved_sender", "profileUrl"],
        ])
      );
    const resolvedAvatar =
      getFirstString(rawObj, [
        ["resolved_sender", "avatar_url"],
        ["resolved_sender", "avatarUrl"],
      ]) ?? null;

    if (!resolvedName && !resolvedLinkedInUrl && !resolvedAvatar) continue;

    return {
      attendeeId: wanted,
      name: resolvedName || null,
      linkedinUrl: resolvedLinkedInUrl,
      avatarUrl: resolvedAvatar,
      isSelf: null,
    };
  }

  return null;
}

export async function resolveAttendeeFromUnipile(params: {
  senderAttendeeId: string | null;
  unipileAccountId: string;
  chatId: string | null;
  config?: UnipileApiConfig;
}): Promise<ResolvedAttendee | null> {
  const { senderAttendeeId, unipileAccountId, chatId, config } = params;
  const resolvedConfig = getUnipileConfigOrNull(config);
  if (!resolvedConfig) return null;

  const accountId = encodeURIComponent(unipileAccountId);
  const attendeeId = senderAttendeeId ? encodeURIComponent(senderAttendeeId) : null;
  const threadId = chatId ? encodeURIComponent(chatId) : null;

  if (attendeeId) {
    const direct = await fetchAttendeeFromEndpoints({
      endpoints: [
        `${resolvedConfig.base}/api/v1/attendees/${attendeeId}?account_id=${accountId}`,
        `${resolvedConfig.base}/api/v1/users/${attendeeId}?account_id=${accountId}`,
        `${resolvedConfig.base}/api/v1/profiles/${attendeeId}?account_id=${accountId}`,
        `${resolvedConfig.base}/api/v1/attendees?account_id=${accountId}&attendee_id=${attendeeId}`,
        `${resolvedConfig.base}/api/v1/attendees?account_id=${accountId}&id=${attendeeId}`,
      ],
      apiKey: resolvedConfig.apiKey,
      attendeeId: senderAttendeeId,
    });
    if (direct) {
      return {
        ...direct,
        attendeeId: direct.attendeeId ?? senderAttendeeId,
      };
    }
  }

  if (!threadId) return null;

  const fallback = await fetchAttendeeFromEndpoints({
    endpoints: [
      `${resolvedConfig.base}/api/v1/chats/${threadId}/attendees?account_id=${accountId}`,
      `${resolvedConfig.base}/api/v1/conversations/${threadId}/attendees?account_id=${accountId}`,
      `${resolvedConfig.base}/api/v1/chats/${threadId}?account_id=${accountId}`,
      `${resolvedConfig.base}/api/v1/conversations/${threadId}?account_id=${accountId}`,
    ],
    apiKey: resolvedConfig.apiKey,
    attendeeId: senderAttendeeId,
    preferOther: !senderAttendeeId,
  });
  if (!fallback) return null;
  return {
    ...fallback,
    attendeeId: fallback.attendeeId ?? senderAttendeeId,
  };
}

export async function resolveAttendeeForMessage(params: {
  supabase: SupabaseClient;
  clientId: string;
  unipileAccountId: string;
  senderAttendeeId: string | null;
  chatId: string | null;
  config?: UnipileApiConfig;
}): Promise<ResolvedAttendee | null> {
  const { supabase, clientId, unipileAccountId, senderAttendeeId, chatId, config } = params;
  if (!senderAttendeeId) return null;

  const cached = await findCachedAttendeeBySenderId({
    supabase,
    clientId,
    unipileAccountId,
    senderAttendeeId,
  });
  if (cached) return cached;

  return resolveAttendeeFromUnipile({
    senderAttendeeId,
    unipileAccountId,
    chatId,
    config,
  });
}

export async function resolveOtherAttendeeForChat(params: {
  unipileAccountId: string;
  chatId: string | null;
  config?: UnipileApiConfig;
}): Promise<ResolvedAttendee | null> {
  const { unipileAccountId, chatId, config } = params;
  if (!chatId) return null;

  return resolveAttendeeFromUnipile({
    senderAttendeeId: null,
    unipileAccountId,
    chatId,
    config,
  });
}
