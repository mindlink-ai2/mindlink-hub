import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractLinkedInProfileSlug, normalizeLinkedInUrl } from "@/lib/linkedin-url";
import { createServiceSupabase } from "@/lib/inbox-server";
import { saveAttendeeAvatarToStorage } from "@/lib/unipile-avatar-storage";
import {
  extractSenderAttendeeId,
  resolveAttendeeForMessage,
} from "@/lib/unipile-attendees";
import {
  getFirstBoolean,
  getFirstString,
  parseUnipileEvent,
  toJsonObject,
  truncatePreview,
  type JsonObject,
  type ParsedUnipileEvent,
} from "@/lib/unipile-inbox";

type MatchResult = {
  leadId: number | string | null;
  strategy: "url_exact" | "slug_match" | "fallback_last_sent" | "none";
  uncertain: boolean;
  matchedLinkedInUrl: string | null;
  matchedSlug: string | null;
};

type InboxThreadRow = {
  id: string;
  unread_count: number | null;
  last_message_at: string | null;
  last_read_at: string | null;
  contact_name: string | null;
  contact_avatar_url: string | null;
};

type InboxMessageRow = {
  id: string;
  raw: unknown;
  text: string | null;
  unipile_thread_id: string | null;
};

type ThreadContactInfo = {
  contactName: string | null;
  contactLinkedInUrl: string | null;
  contactAvatarUrl: string | null;
};

type PayloadParticipant = {
  name: string | null;
  linkedinUrl: string | null;
  avatarUrl: string | null;
  isSelf: boolean | null;
};

type PostgrestErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

function parseIsoDate(value: string | null): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getTime();
}

function isMissingColumnError(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== "object") return false;
  const pgError = error as PostgrestErrorLike;
  if (String(pgError.code ?? "") !== "42703") return false;
  const details = `${pgError.message ?? ""} ${pgError.details ?? ""} ${pgError.hint ?? ""}`
    .toLowerCase();
  return details.includes(columnName.toLowerCase());
}

function mergeRawObject(
  currentRaw: unknown,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const base =
    currentRaw && typeof currentRaw === "object" && !Array.isArray(currentRaw)
      ? (currentRaw as Record<string, unknown>)
      : {};
  return { ...base, ...patch };
}

function extractSenderAvatarFromPayload(payload: JsonObject): string | null {
  return (
    getFirstString(payload, [
      ["sender_avatar_url"],
      ["senderAvatarUrl"],
      ["sender", "avatar_url"],
      ["sender", "avatarUrl"],
      ["sender", "photo_url"],
      ["sender", "photoUrl"],
      ["sender", "profile_picture_url"],
      ["sender", "profilePictureUrl"],
      ["author", "avatar_url"],
      ["author", "photo_url"],
      ["data", "sender", "avatar_url"],
      ["data", "sender", "avatarUrl"],
      ["data", "sender", "photo_url"],
      ["data", "sender", "photoUrl"],
      ["data", "attendee", "avatar_url"],
      ["data", "attendee", "avatarUrl"],
      ["data", "attendee", "photo_url"],
      ["data", "attendee", "photoUrl"],
      ["data", "contact", "avatar_url"],
      ["data", "contact", "avatarUrl"],
      ["data", "contact", "photo_url"],
      ["data", "contact", "photoUrl"],
    ]) ?? null
  );
}

function extractPayloadParticipant(value: unknown): PayloadParticipant | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const participant = value as JsonObject;

  return {
    name:
      getFirstString(participant, [
        ["name"],
        ["full_name"],
        ["fullName"],
        ["display_name"],
        ["displayName"],
      ]) ?? null,
    linkedinUrl: normalizeLinkedInUrl(
      getFirstString(participant, [
        ["linkedin_url"],
        ["linkedinUrl"],
        ["profile_url"],
        ["profileUrl"],
        ["url"],
      ])
    ),
    avatarUrl:
      getFirstString(participant, [
        ["avatar_url"],
        ["avatarUrl"],
        ["photo_url"],
        ["photoUrl"],
        ["profile_picture_url"],
        ["profilePictureUrl"],
      ]) ?? null,
    isSelf: getFirstBoolean(participant, [
      ["is_self"],
      ["isSelf"],
      ["self"],
      ["from_me"],
      ["is_sender"],
      ["isSender"],
      ["sender", "is_self"],
    ]),
  };
}

function extractOtherParticipantFromPayload(payload: JsonObject): PayloadParticipant | null {
  const candidates: PayloadParticipant[] = [];

  const arraysToCheck: unknown[] = [
    payload.participants,
    payload.members,
    payload.recipients,
    payload.counterparts,
    payload.users,
    payload.people,
  ];

  for (const rawArray of arraysToCheck) {
    if (!Array.isArray(rawArray)) continue;
    for (const rawParticipant of rawArray) {
      const parsed = extractPayloadParticipant(rawParticipant);
      if (parsed) candidates.push(parsed);
    }
  }

  const nestedToCheck: unknown[] = [
    payload.participant,
    payload.recipient,
    payload.counterpart,
    payload.contact,
    payload.other,
  ];
  for (const nested of nestedToCheck) {
    const parsed = extractPayloadParticipant(nested);
    if (parsed) candidates.push(parsed);
  }

  const explicitOther = candidates.find((candidate) => candidate.isSelf === false);
  if (explicitOther) return explicitOther;

  const fallback = candidates.find(
    (candidate) =>
      candidate.isSelf !== true &&
      Boolean(candidate.name || candidate.linkedinUrl || candidate.avatarUrl)
  );
  if (fallback) return fallback;

  return null;
}

function extractThreadContactFromPayload(
  payload: JsonObject,
  parsed: ParsedUnipileEvent
): ThreadContactInfo {
  const otherParticipant = extractOtherParticipantFromPayload(payload);
  if (otherParticipant) {
    return {
      contactName: otherParticipant.name,
      contactLinkedInUrl: otherParticipant.linkedinUrl,
      contactAvatarUrl: otherParticipant.avatarUrl,
    };
  }

  const otherName =
    getFirstString(payload, [
      ["contact_name"],
      ["contactName"],
      ["contact", "name"],
      ["participant", "name"],
      ["counterpart", "name"],
      ["recipient", "name"],
      ["other", "name"],
    ]) ?? null;

  const otherLinkedInUrl = normalizeLinkedInUrl(
    getFirstString(payload, [
      ["contact_linkedin_url"],
      ["contactLinkedInUrl"],
      ["contact", "linkedin_url"],
      ["contact", "linkedinUrl"],
      ["contact", "profile_url"],
      ["contact", "profileUrl"],
      ["participant", "linkedin_url"],
      ["participant", "linkedinUrl"],
      ["participant", "profile_url"],
      ["participant", "profileUrl"],
      ["counterpart", "linkedin_url"],
      ["counterpart", "linkedinUrl"],
      ["counterpart", "profile_url"],
      ["counterpart", "profileUrl"],
      ["recipient", "linkedin_url"],
      ["recipient", "profile_url"],
    ])
  );

  const otherAvatarUrl =
    getFirstString(payload, [
      ["contact_avatar_url"],
      ["contactAvatarUrl"],
      ["contact", "avatar_url"],
      ["contact", "avatarUrl"],
      ["contact", "photo_url"],
      ["contact", "photoUrl"],
      ["contact", "profile_picture_url"],
      ["contact", "profilePictureUrl"],
      ["participant", "avatar_url"],
      ["participant", "avatarUrl"],
      ["participant", "photo_url"],
      ["participant", "photoUrl"],
      ["counterpart", "avatar_url"],
      ["counterpart", "avatarUrl"],
      ["counterpart", "photo_url"],
      ["counterpart", "photoUrl"],
    ]) ?? null;

  if (otherName || otherLinkedInUrl || otherAvatarUrl) {
    return {
      contactName: otherName,
      contactLinkedInUrl: otherLinkedInUrl,
      contactAvatarUrl: otherAvatarUrl,
    };
  }

  if (parsed.direction === "inbound") {
    return {
      contactName: parsed.senderName,
      contactLinkedInUrl: parsed.senderLinkedInUrl,
      contactAvatarUrl:
        getFirstString(payload, [
          ["sender_avatar_url"],
          ["senderAvatarUrl"],
          ["sender", "avatar_url"],
          ["sender", "avatarUrl"],
          ["sender", "photo_url"],
          ["sender", "photoUrl"],
          ["sender", "profile_picture_url"],
          ["sender", "profilePictureUrl"],
          ["author", "avatar_url"],
          ["author", "photo_url"],
        ]) ?? null,
    };
  }

  return {
    contactName: null,
    contactLinkedInUrl: null,
    contactAvatarUrl: null,
  };
}

async function resolveClientId(
  supabase: SupabaseClient,
  unipileAccountId: string | null
): Promise<string | null> {
  if (!unipileAccountId) return null;

  const { data: account, error } = await supabase
    .from("unipile_accounts")
    .select("client_id")
    .eq("provider", "linkedin")
    .eq("unipile_account_id", unipileAccountId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("UNIPILE_WEBHOOK_ACCOUNT_LOOKUP_ERROR:", error);
    return null;
  }

  if (account?.client_id) return String(account.client_id);

  const { data: anyProviderAccount, error: fallbackError } = await supabase
    .from("unipile_accounts")
    .select("client_id")
    .eq("unipile_account_id", unipileAccountId)
    .limit(1)
    .maybeSingle();

  if (fallbackError) {
    console.error("UNIPILE_WEBHOOK_ACCOUNT_LOOKUP_FALLBACK_ERROR:", fallbackError);
    return null;
  }

  if (!anyProviderAccount?.client_id) return null;
  return String(anyProviderAccount.client_id);
}

async function logUnipileEvent(params: {
  supabase: SupabaseClient;
  eventType: string;
  clientId: string | null;
  unipileAccountId: string | null;
  payload: JsonObject;
}) {
  const { supabase, eventType, clientId, unipileAccountId, payload } = params;
  const base = {
    provider: "linkedin",
    event_type: eventType,
    client_id: clientId,
    received_at: new Date().toISOString(),
  };

  const candidates: Array<Record<string, unknown>> = [
    { ...base, unipile_account_id: unipileAccountId, payload },
    { ...base, payload },
    { ...base, unipile_account_id: unipileAccountId, raw: payload },
    { ...base, raw: payload },
  ];

  let lastError: unknown = null;

  for (const row of candidates) {
    const { error } = await supabase.from("unipile_events").insert(row);
    if (!error) return;

    lastError = error;
    const canRetry =
      isMissingColumnError(error, "unipile_account_id") ||
      isMissingColumnError(error, "payload") ||
      isMissingColumnError(error, "raw");
    if (!canRetry) break;
  }

  if (lastError) {
    console.error("UNIPILE_WEBHOOK_EVENT_LOG_ERROR:", lastError);
  }
}

async function findLeadIdByLinkedInIdentity(params: {
  supabase: SupabaseClient;
  clientId: string;
  linkedinUrl: string | null;
  slug: string | null;
}): Promise<number | string | null> {
  const { supabase, clientId, linkedinUrl, slug } = params;
  if (!linkedinUrl && !slug) return null;

  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, LinkedInURL")
    .eq("client_id", clientId)
    .not("LinkedInURL", "is", null);

  if (error || !Array.isArray(leads)) {
    console.error("UNIPILE_WEBHOOK_LEAD_LOOKUP_ERROR:", error);
    return null;
  }

  const normalizedUrl = normalizeLinkedInUrl(linkedinUrl);
  if (normalizedUrl) {
    const exact = leads.find((lead) => {
      const leadUrl =
        lead && typeof lead === "object" && "LinkedInURL" in lead
          ? normalizeLinkedInUrl(String((lead as Record<string, unknown>).LinkedInURL ?? ""))
          : null;
      return leadUrl === normalizedUrl;
    });

    if (exact && typeof exact === "object" && "id" in exact) {
      const id = (exact as Record<string, unknown>).id;
      if (typeof id === "string" || typeof id === "number") return id;
    }
  }

  if (slug) {
    const normalizedSlug = slug.toLowerCase();
    const match = leads.find((lead) => {
      const rawUrl =
        lead && typeof lead === "object" && "LinkedInURL" in lead
          ? String((lead as Record<string, unknown>).LinkedInURL ?? "")
          : "";
      return extractLinkedInProfileSlug(rawUrl) === normalizedSlug;
    });

    if (match && typeof match === "object" && "id" in match) {
      const id = (match as Record<string, unknown>).id;
      if (typeof id === "string" || typeof id === "number") return id;
    }
  }

  return null;
}

async function upsertThreadAndLoad(params: {
  supabase: SupabaseClient;
  clientId: string;
  parsed: ParsedUnipileEvent;
  leadId: number | string | null;
}): Promise<InboxThreadRow | null> {
  const { supabase, clientId, parsed, leadId } = params;
  if (!parsed.unipileAccountId || !parsed.unipileThreadId) return null;

  const lastMessageAt = parsed.sentAtIso;
  const lastMessagePreview = truncatePreview(parsed.text);
  const threadUpsertRecord: Record<string, unknown> = {
    client_id: clientId,
    provider: "linkedin",
    unipile_account_id: parsed.unipileAccountId,
    unipile_thread_id: parsed.unipileThreadId,
    last_message_at: lastMessageAt,
    last_message_preview: lastMessagePreview,
    updated_at: new Date().toISOString(),
  };

  if (leadId !== null) {
    threadUpsertRecord.lead_id = leadId;
  }

  if (parsed.senderLinkedInUrl) {
    threadUpsertRecord.lead_linkedin_url = parsed.senderLinkedInUrl;
  }

  const { error: upsertErr } = await supabase
    .from("inbox_threads")
    .upsert(threadUpsertRecord, { onConflict: "client_id,unipile_account_id,unipile_thread_id" });

  if (upsertErr) {
    console.error("UNIPILE_WEBHOOK_THREAD_UPSERT_ERROR:", upsertErr);
    return null;
  }

  const { data: thread, error: threadErr } = await supabase
    .from("inbox_threads")
    .select("id, unread_count, last_message_at, last_read_at, contact_name, contact_avatar_url")
    .eq("client_id", clientId)
    .eq("unipile_account_id", parsed.unipileAccountId)
    .eq("unipile_thread_id", parsed.unipileThreadId)
    .limit(1)
    .maybeSingle();

  if (threadErr || !thread?.id) {
    console.error("UNIPILE_WEBHOOK_THREAD_LOAD_ERROR:", threadErr);
    return null;
  }

  return {
    id: String(thread.id),
    unread_count:
      typeof thread.unread_count === "number" ? thread.unread_count : Number(thread.unread_count ?? 0),
    last_message_at:
      typeof thread.last_message_at === "string" ? thread.last_message_at : null,
    last_read_at:
      typeof thread.last_read_at === "string" ? thread.last_read_at : null,
    contact_name: typeof thread.contact_name === "string" ? thread.contact_name : null,
    contact_avatar_url:
      typeof thread.contact_avatar_url === "string" ? thread.contact_avatar_url : null,
  };
}

async function enrichThreadContactIfMissing(params: {
  supabase: SupabaseClient;
  clientId: string;
  threadContactName: string | null;
  unipileAccountId: string;
  unipileThreadId: string;
  contact: ThreadContactInfo;
}) {
  const {
    supabase,
    clientId,
    threadContactName,
    unipileAccountId,
    unipileThreadId,
    contact,
  } = params;
  const currentName = (threadContactName ?? "").trim();
  const nextName = (contact.contactName ?? "").trim();

  if (currentName || !nextName) return;

  const updatePayload: Record<string, unknown> = {
    contact_name: nextName,
  };

  if (contact.contactLinkedInUrl) {
    updatePayload.contact_linkedin_url = contact.contactLinkedInUrl;
  }

  if (contact.contactAvatarUrl) {
    updatePayload.contact_avatar_url = contact.contactAvatarUrl;
  }

  const { error } = await supabase
    .from("inbox_threads")
    .update(updatePayload)
    .eq("client_id", clientId)
    .eq("unipile_account_id", unipileAccountId)
    .eq("unipile_thread_id", unipileThreadId);

  if (error) {
    console.error("UNIPILE_WEBHOOK_THREAD_CONTACT_UPDATE_ERROR:", error);
  }
}

async function handleNewMessage(params: {
  supabase: SupabaseClient;
  clientId: string;
  parsed: ParsedUnipileEvent;
  payload: JsonObject;
}) {
  const { supabase, clientId, parsed, payload } = params;

  if (!parsed.unipileAccountId || !parsed.unipileThreadId || !parsed.unipileMessageId) {
    console.error("UNIPILE_WEBHOOK_NEW_MESSAGE_MISSING_IDS:", parsed);
    return;
  }

  const senderAttendeeId = extractSenderAttendeeId(payload);
  let senderName = parsed.senderName;
  let senderLinkedInUrl = parsed.senderLinkedInUrl;
  let senderAvatarUrl = extractSenderAvatarFromPayload(payload);

  if (
    parsed.direction === "inbound" &&
    (!senderName || !senderLinkedInUrl || !senderAvatarUrl) &&
    senderAttendeeId
  ) {
    const resolvedAttendee = await resolveAttendeeForMessage({
      supabase,
      clientId,
      unipileAccountId: parsed.unipileAccountId,
      senderAttendeeId,
      chatId: parsed.unipileThreadId,
    });

    if (resolvedAttendee) {
      if (!senderName && resolvedAttendee.name) senderName = resolvedAttendee.name;
      if (!senderLinkedInUrl && resolvedAttendee.linkedinUrl) {
        senderLinkedInUrl = resolvedAttendee.linkedinUrl;
      }
      if (!senderAvatarUrl && resolvedAttendee.avatarUrl) {
        senderAvatarUrl = resolvedAttendee.avatarUrl;
      }
    }
  }

  if (parsed.direction === "outbound") {
    senderName = null;
  }

  const parsedWithResolvedSender: ParsedUnipileEvent = {
    ...parsed,
    senderName,
    senderLinkedInUrl,
  };
  const senderSlug = extractLinkedInProfileSlug(senderLinkedInUrl);
  let threadContact = extractThreadContactFromPayload(payload, parsedWithResolvedSender);
  if (!threadContact.contactAvatarUrl && senderAvatarUrl && parsed.direction === "inbound") {
    threadContact = {
      ...threadContact,
      contactAvatarUrl: senderAvatarUrl,
    };
  }
  const leadId = await findLeadIdByLinkedInIdentity({
    supabase,
    clientId,
    linkedinUrl: senderLinkedInUrl,
    slug: senderSlug,
  });

  const thread = await upsertThreadAndLoad({
    supabase,
    clientId,
    parsed: parsedWithResolvedSender,
    leadId,
  });
  if (!thread) return;

  const currentThreadAvatar = (thread.contact_avatar_url ?? "").trim();
  if (!currentThreadAvatar && senderAttendeeId && parsed.direction === "inbound") {
    const storedAvatarUrl = await saveAttendeeAvatarToStorage({
      clientId,
      unipileAccountId: parsed.unipileAccountId,
      attendeeId: senderAttendeeId,
    }).catch((error: unknown) => {
      console.error("UNIPILE_WEBHOOK_AVATAR_STORAGE_ERROR:", error);
      return null;
    });

    if (storedAvatarUrl) {
      senderAvatarUrl = storedAvatarUrl;
      threadContact = {
        ...threadContact,
        contactAvatarUrl: storedAvatarUrl,
      };
    }
  }

  await enrichThreadContactIfMissing({
    supabase,
    clientId,
    threadContactName: thread.contact_name,
    unipileAccountId: parsed.unipileAccountId,
    unipileThreadId: parsed.unipileThreadId,
    contact: threadContact,
  });

  const resolvedSenderPatch: Record<string, unknown> = {};
  if (senderAttendeeId) resolvedSenderPatch.attendee_id = senderAttendeeId;
  if (senderName) resolvedSenderPatch.name = senderName;
  if (senderLinkedInUrl) resolvedSenderPatch.linkedin_url = senderLinkedInUrl;
  if (senderAvatarUrl) resolvedSenderPatch.avatar_url = senderAvatarUrl;
  const messageRaw =
    Object.keys(resolvedSenderPatch).length > 0
      ? mergeRawObject(payload, { resolved_sender: resolvedSenderPatch })
      : payload;

  const messageRecord = {
    client_id: clientId,
    provider: "linkedin",
    thread_db_id: thread.id,
    unipile_account_id: parsedWithResolvedSender.unipileAccountId,
    unipile_thread_id: parsedWithResolvedSender.unipileThreadId,
    unipile_message_id: parsedWithResolvedSender.unipileMessageId,
    direction: parsed.direction,
    sender_name: parsed.direction === "outbound" ? null : senderName,
    sender_linkedin_url: senderLinkedInUrl,
    text: parsed.text,
    sent_at: parsed.sentAtIso,
    raw: messageRaw,
  };

  const { data: existingMessage, error: existingMessageErr } = await supabase
    .from("inbox_messages")
    .select("id, sender_name, sender_linkedin_url, raw")
    .eq("client_id", clientId)
    .eq("unipile_account_id", parsed.unipileAccountId)
    .eq("unipile_message_id", parsed.unipileMessageId)
    .limit(1)
    .maybeSingle();

  if (existingMessageErr) {
    console.error("UNIPILE_WEBHOOK_MESSAGE_EXISTS_CHECK_ERROR:", existingMessageErr);
    return;
  }

  let wasInserted = false;
  if (!existingMessage?.id) {
    const { error: insertErr } = await supabase
      .from("inbox_messages")
      .insert(messageRecord);

    if (insertErr) {
      console.error("UNIPILE_WEBHOOK_MESSAGE_INSERT_ERROR:", insertErr);
      return;
    }

    wasInserted = true;
  }

  if (existingMessage?.id) {
    const existingSenderName =
      typeof existingMessage.sender_name === "string" ? existingMessage.sender_name.trim() : "";
    const existingSenderLinkedInUrl =
      typeof existingMessage.sender_linkedin_url === "string"
        ? existingMessage.sender_linkedin_url.trim()
        : "";

    const existingPatch: Record<string, unknown> = {};
    if (!existingSenderName && senderName) {
      existingPatch.sender_name = senderName;
    }
    if (!existingSenderLinkedInUrl && senderLinkedInUrl) {
      existingPatch.sender_linkedin_url = senderLinkedInUrl;
    }
    if (Object.keys(resolvedSenderPatch).length > 0) {
      existingPatch.raw = mergeRawObject(existingMessage.raw, {
        resolved_sender: resolvedSenderPatch,
      });
    }

    if (Object.keys(existingPatch).length > 0) {
      const { error: messageUpdateErr } = await supabase
        .from("inbox_messages")
        .update(existingPatch)
        .eq("id", String(existingMessage.id))
        .eq("client_id", clientId);

      if (messageUpdateErr) {
        console.error("UNIPILE_WEBHOOK_MESSAGE_ENRICH_UPDATE_ERROR:", messageUpdateErr);
      }
    }
  }

  const currentLast = parseIsoDate(thread.last_message_at);
  const incomingLast = parseIsoDate(parsed.sentAtIso);
  const shouldRefreshLastMessage =
    incomingLast !== null && (currentLast === null || incomingLast >= currentLast);

  const threadUpdate: Record<string, unknown> = {};
  if (shouldRefreshLastMessage) {
    threadUpdate.last_message_at = parsed.sentAtIso;
    threadUpdate.last_message_preview = truncatePreview(parsed.text);
  }

  const normalizedSenderName = (senderName ?? "").trim();
  const normalizedSenderLinkedInUrl = (senderLinkedInUrl ?? "").trim();
  const hasContactName = (thread.contact_name ?? "").trim().length > 0;
  const hasContactAvatar = currentThreadAvatar.length > 0;
  if (parsed.direction === "inbound" && !hasContactName && normalizedSenderName) {
    threadUpdate.contact_name = normalizedSenderName;
    if (normalizedSenderLinkedInUrl) {
      threadUpdate.contact_linkedin_url = normalizedSenderLinkedInUrl;
    }
    if (senderAvatarUrl) {
      threadUpdate.contact_avatar_url = senderAvatarUrl;
    }
  }

  if (parsed.direction === "inbound" && !hasContactAvatar && senderAvatarUrl) {
    threadUpdate.contact_avatar_url = senderAvatarUrl;
  }

  const lastReadAt = parseIsoDate(thread.last_read_at);
  const shouldIncrementUnread =
    wasInserted &&
    parsed.direction === "inbound" &&
    (lastReadAt === null || (incomingLast !== null && incomingLast > lastReadAt));

  if (shouldIncrementUnread) {
    const currentUnread = typeof thread.unread_count === "number" ? thread.unread_count : 0;
    threadUpdate.unread_count = currentUnread + 1;
  }

  if (Object.keys(threadUpdate).length > 0) {
    const { error: updateThreadErr } = await supabase
      .from("inbox_threads")
      .update(threadUpdate)
      .eq("id", thread.id)
      .eq("client_id", clientId);

    if (updateThreadErr) {
      console.error("UNIPILE_WEBHOOK_THREAD_UPDATE_ERROR:", updateThreadErr);
    }
  }
}

async function findMessageForEvent(params: {
  supabase: SupabaseClient;
  clientId: string;
  parsed: ParsedUnipileEvent;
}): Promise<InboxMessageRow | null> {
  const { supabase, clientId, parsed } = params;

  if (!parsed.unipileAccountId || !parsed.unipileMessageId) return null;

  const { data: message, error } = await supabase
    .from("inbox_messages")
    .select("id, raw, text, unipile_thread_id")
    .eq("client_id", clientId)
    .eq("unipile_account_id", parsed.unipileAccountId)
    .eq("unipile_message_id", parsed.unipileMessageId)
    .limit(1)
    .maybeSingle();

  if (error || !message?.id) {
    if (error) console.error("UNIPILE_WEBHOOK_MESSAGE_LOOKUP_ERROR:", error);
    return null;
  }

  return {
    id: String(message.id),
    raw: message.raw,
    text: typeof message.text === "string" ? message.text : null,
    unipile_thread_id:
      typeof message.unipile_thread_id === "string" ? message.unipile_thread_id : null,
  };
}

async function updateMessage(params: {
  supabase: SupabaseClient;
  clientId: string;
  messageId: string;
  text?: string | null;
  rawPatch: Record<string, unknown>;
}) {
  const { supabase, clientId, messageId, text, rawPatch } = params;

  const { data: current, error: currentErr } = await supabase
    .from("inbox_messages")
    .select("raw, text")
    .eq("id", messageId)
    .eq("client_id", clientId)
    .limit(1)
    .maybeSingle();

  if (currentErr || !current) {
    if (currentErr) console.error("UNIPILE_WEBHOOK_MESSAGE_CURRENT_ERROR:", currentErr);
    return;
  }

  const updatePayload: Record<string, unknown> = {
    raw: mergeRawObject(current.raw, rawPatch),
  };

  if (text !== undefined && text !== null) {
    updatePayload.text = text;
  }

  const { error: updateErr } = await supabase
    .from("inbox_messages")
    .update(updatePayload)
    .eq("id", messageId)
    .eq("client_id", clientId);

  if (updateErr) {
    console.error("UNIPILE_WEBHOOK_MESSAGE_UPDATE_ERROR:", updateErr);
  }
}

function extractRelationIdentity(payload: JsonObject): {
  normalizedUrl: string | null;
  slug: string | null;
} {
  const urlCandidate = getFirstString(payload, [
    ["user_profile_url"],
    ["userProfileUrl"],
    ["profile_url"],
    ["profileUrl"],
    ["linkedin_url"],
    ["linkedinUrl"],
    ["data", "user_profile_url"],
    ["data", "userProfileUrl"],
    ["data", "profile_url"],
    ["data", "profileUrl"],
    ["data", "linkedin_url"],
    ["data", "linkedinUrl"],
    ["data", "user", "profile_url"],
    ["data", "user", "profileUrl"],
    ["data", "user", "linkedin_url"],
    ["data", "user", "linkedinUrl"],
    ["user", "profile_url"],
    ["user", "profileUrl"],
    ["user", "linkedin_url"],
    ["user", "linkedinUrl"],
    ["contact", "profile_url"],
    ["contact", "profileUrl"],
    ["contact", "linkedin_url"],
    ["contact", "linkedinUrl"],
    ["relation", "profile_url"],
    ["relation", "profileUrl"],
    ["relation", "linkedin_url"],
    ["relation", "linkedinUrl"],
    ["counterpart", "profile_url"],
    ["counterpart", "profileUrl"],
    ["counterpart", "linkedin_url"],
    ["counterpart", "linkedinUrl"],
    ["attendee", "profile_url"],
    ["attendee", "profileUrl"],
    ["attendee", "linkedin_url"],
    ["attendee", "linkedinUrl"],
  ]);

  const slugCandidate = getFirstString(payload, [
    ["user_public_identifier"],
    ["userPublicIdentifier"],
    ["user_provider_id"],
    ["userProviderId"],
    ["public_identifier"],
    ["publicIdentifier"],
    ["provider_id"],
    ["providerId"],
    ["data", "user_public_identifier"],
    ["data", "userPublicIdentifier"],
    ["data", "user_provider_id"],
    ["data", "userProviderId"],
    ["data", "public_identifier"],
    ["data", "publicIdentifier"],
    ["data", "provider_id"],
    ["data", "providerId"],
    ["data", "user", "public_identifier"],
    ["data", "user", "publicIdentifier"],
    ["data", "user", "provider_id"],
    ["data", "user", "providerId"],
    ["contact", "public_identifier"],
    ["contact", "publicIdentifier"],
    ["contact", "provider_id"],
    ["contact", "providerId"],
    ["relation", "public_identifier"],
    ["relation", "publicIdentifier"],
    ["relation", "provider_id"],
    ["relation", "providerId"],
    ["counterpart", "public_identifier"],
    ["counterpart", "publicIdentifier"],
    ["counterpart", "provider_id"],
    ["counterpart", "providerId"],
  ]);

  return {
    normalizedUrl: normalizeLinkedInUrl(urlCandidate),
    slug: extractLinkedInProfileSlug(slugCandidate) ?? slugCandidate?.toLowerCase() ?? null,
  };
}

async function findLeadForRelation(params: {
  supabase: SupabaseClient;
  clientId: string;
  normalizedUrl: string | null;
  slug: string | null;
}): Promise<MatchResult> {
  const { supabase, clientId, normalizedUrl, slug } = params;

  if (!normalizedUrl && !slug) {
    return {
      leadId: null,
      strategy: "none",
      uncertain: true,
      matchedLinkedInUrl: null,
      matchedSlug: null,
    };
  }

  const leadId = await findLeadIdByLinkedInIdentity({
    supabase,
    clientId,
    linkedinUrl: normalizedUrl,
    slug,
  });

  if (leadId !== null) {
    return {
      leadId,
      strategy: normalizedUrl ? "url_exact" : "slug_match",
      uncertain: false,
      matchedLinkedInUrl: normalizedUrl,
      matchedSlug: slug,
    };
  }

  return {
    leadId: null,
    strategy: "none",
    uncertain: true,
    matchedLinkedInUrl: normalizedUrl,
    matchedSlug: slug,
  };
}

async function markInvitationAccepted(params: {
  supabase: SupabaseClient;
  clientId: string;
  leadId: number | string;
  unipileAccountId: string;
  payload: JsonObject;
  match: MatchResult;
}) {
  const { supabase, clientId, leadId, unipileAccountId, payload, match } = params;
  const now = new Date().toISOString();
  const acceptanceRaw = {
    webhook_payload: payload,
    matching: {
      strategy: match.strategy,
      uncertain: match.uncertain,
      normalized_linkedin_url: match.matchedLinkedInUrl,
      profile_slug: match.matchedSlug,
    },
  };

  const { data: sentInvitation } = await supabase
    .from("linkedin_invitations")
    .select("id, raw")
    .eq("client_id", clientId)
    .eq("lead_id", leadId)
    .eq("unipile_account_id", unipileAccountId)
    .in("status", ["sent", "pending"])
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sentInvitation?.id) {
    const { error } = await supabase
      .from("linkedin_invitations")
      .update({
        status: "accepted",
        accepted_at: now,
        raw: {
          invitation: sentInvitation.raw ?? null,
          acceptance: acceptanceRaw,
        },
      })
      .eq("id", sentInvitation.id)
      .eq("client_id", clientId);

    if (error) console.error("UNIPILE_WEBHOOK_RELATION_UPDATE_SENT_ERROR:", error);
    return;
  }

  const { data: existingAccepted } = await supabase
    .from("linkedin_invitations")
    .select("id")
    .eq("client_id", clientId)
    .eq("lead_id", leadId)
    .eq("unipile_account_id", unipileAccountId)
    .eq("status", "accepted")
    .limit(1)
    .maybeSingle();

  if (existingAccepted?.id) return;

  const { error: insertErr } = await supabase.from("linkedin_invitations").insert({
    client_id: clientId,
    lead_id: leadId,
    unipile_account_id: unipileAccountId,
    status: "accepted",
    accepted_at: now,
    raw: acceptanceRaw,
  });

  if (insertErr) console.error("UNIPILE_WEBHOOK_RELATION_INSERT_ACCEPTED_ERROR:", insertErr);
}

async function fallbackAcceptLastSent(params: {
  supabase: SupabaseClient;
  clientId: string;
  unipileAccountId: string;
  payload: JsonObject;
  match: MatchResult;
}): Promise<number | string | null> {
  const { supabase, clientId, unipileAccountId, payload, match } = params;
  const now = new Date().toISOString();

  const { data: lastSent } = await supabase
    .from("linkedin_invitations")
    .select("id, lead_id, raw")
    .eq("client_id", clientId)
    .eq("unipile_account_id", unipileAccountId)
    .in("status", ["sent", "pending"])
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lastSent?.id || lastSent?.lead_id === null || lastSent?.lead_id === undefined) {
    return null;
  }

  const { error } = await supabase
    .from("linkedin_invitations")
    .update({
      status: "accepted",
      accepted_at: now,
      raw: {
        invitation: lastSent.raw ?? null,
        acceptance: {
          webhook_payload: payload,
          matching: {
            strategy: "fallback_last_sent",
            uncertain: true,
            normalized_linkedin_url: match.matchedLinkedInUrl,
            profile_slug: match.matchedSlug,
          },
        },
      },
    })
    .eq("id", lastSent.id)
    .eq("client_id", clientId);

  if (error) {
    console.error("UNIPILE_WEBHOOK_RELATION_FALLBACK_UPDATE_ERROR:", error);
    return null;
  }

  return lastSent.lead_id;
}

async function handleNewRelation(params: {
  supabase: SupabaseClient;
  clientId: string;
  unipileAccountId: string;
  payload: JsonObject;
}) {
  const { supabase, clientId, unipileAccountId, payload } = params;
  const identity = extractRelationIdentity(payload);
  const match = await findLeadForRelation({
    supabase,
    clientId,
    normalizedUrl: identity.normalizedUrl,
    slug: identity.slug,
  });

  if (match.leadId !== null) {
    await markInvitationAccepted({
      supabase,
      clientId,
      leadId: match.leadId,
      unipileAccountId,
      payload,
      match,
    });
    return;
  }

  const fallbackLeadId = await fallbackAcceptLastSent({
    supabase,
    clientId,
    unipileAccountId,
    payload,
    match,
  });

  if (fallbackLeadId === null) {
    console.warn("UNIPILE_WEBHOOK_RELATION_NO_MATCH_NO_FALLBACK", {
      clientId,
      unipileAccountId,
      normalizedUrl: identity.normalizedUrl,
      slug: identity.slug,
    });
  }
}

export async function POST(req: Request) {
  try {
    const provided =
      req.headers.get("x-unipile-secret") ??
      new URL(req.url).searchParams.get("secret");
    if (
      !process.env.UNIPILE_WEBHOOK_SECRET ||
      provided !== process.env.UNIPILE_WEBHOOK_SECRET
    ) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const payloadInput = await req.json().catch(() => ({}));
    const payload = toJsonObject(payloadInput);
    const parsed = parseUnipileEvent(payload);

    const supabase = createServiceSupabase();
    const clientId = await resolveClientId(supabase, parsed.unipileAccountId);

    await logUnipileEvent({
      supabase,
      eventType: parsed.eventType,
      clientId,
      unipileAccountId: parsed.unipileAccountId,
      payload,
    });

    if (!clientId || !parsed.unipileAccountId) {
      return NextResponse.json({ ok: true, processed: false });
    }

    if (parsed.kind === "new_message") {
      await handleNewMessage({ supabase, clientId, parsed, payload });
      return NextResponse.json({ ok: true, processed: true, kind: parsed.kind });
    }

    if (
      parsed.kind === "message_edit" ||
      parsed.kind === "message_delete" ||
      parsed.kind === "message_reaction" ||
      parsed.kind === "message_delivered" ||
      parsed.kind === "message_read"
    ) {
      const message = await findMessageForEvent({ supabase, clientId, parsed });
      if (!message) {
        return NextResponse.json({ ok: true, processed: false, kind: parsed.kind });
      }

      if (parsed.kind === "message_edit") {
        await updateMessage({
          supabase,
          clientId,
          messageId: message.id,
          text: parsed.text ?? message.text,
          rawPatch: { edit_event: payload },
        });
      }

      if (parsed.kind === "message_delete") {
        await updateMessage({
          supabase,
          clientId,
          messageId: message.id,
          rawPatch: { deleted: true, delete_event: payload },
        });
      }

      if (parsed.kind === "message_reaction") {
        await updateMessage({
          supabase,
          clientId,
          messageId: message.id,
          rawPatch: { reaction_event: payload },
        });
      }

      if (parsed.kind === "message_delivered") {
        await updateMessage({
          supabase,
          clientId,
          messageId: message.id,
          rawPatch: { delivery_status: "delivered", delivery_event: payload },
        });
      }

      if (parsed.kind === "message_read") {
        await updateMessage({
          supabase,
          clientId,
          messageId: message.id,
          rawPatch: { delivery_status: "read", read_event: payload },
        });
      }

      return NextResponse.json({ ok: true, processed: true, kind: parsed.kind });
    }

    if (parsed.kind === "new_relation") {
      await handleNewRelation({
        supabase,
        clientId,
        unipileAccountId: parsed.unipileAccountId,
        payload,
      });
      return NextResponse.json({ ok: true, processed: true, kind: parsed.kind });
    }

    return NextResponse.json({ ok: true, processed: false, kind: parsed.kind });
  } catch (error: unknown) {
    console.error("UNIPILE_WEBHOOK_ERROR:", error);
    return NextResponse.json({ ok: true });
  }
}
