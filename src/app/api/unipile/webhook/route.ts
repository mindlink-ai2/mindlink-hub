import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractLinkedInProfileSlug, normalizeLinkedInUrl } from "@/lib/linkedin-url";
import { createServiceSupabase } from "@/lib/inbox-server";
import {
  extractAcceptedRelationIdentity,
  resolveAcceptedInvitationMatch,
} from "@/lib/linkedin-invitations";
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
import {
  resolveClientIdFromUnipileAccountId,
  syncLeadProviderFromRelationPayload,
} from "@/lib/unipile-relation-provider";

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
  return resolveClientIdFromUnipileAccountId({
    supabase,
    unipileAccountId,
  });
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

// ---------------------------------------------------------------------------
// AUTO-RESPONDED TRACKING (plan='full' uniquement)
//
// AUDIT: responded=true n'est jamais positionné automatiquement dans ce webhook.
// Les deux seuls endpoints qui l'écrivent sont :
//   - /api/leads/responded       (action manuelle depuis la page /followups)
//   - /api/map-leads/responded   (idem pour les leads Google Maps)
//
// Pour les clients plan='full' + subscription_status='active', on doit détecter
// automatiquement quand un prospect répond à notre DM et passer responded=true.
// On le fait ici, sur chaque new_message inbound, si :
//   1. Le client est plan='full' && subscription_status='active'
//   2. Le lead est identifié (leadId != null)
//   3. Le lead a message_sent=true (on lui a envoyé le premier DM)
//   4. Le lead n'a pas encore responded=true
// On efface aussi next_followup_at pour le retirer de la file de relance.
// ---------------------------------------------------------------------------
async function autoMarkLeadResponded(params: {
  supabase: SupabaseClient;
  clientId: string;
  leadId: number | string;
  // URL LinkedIn du prospect expéditeur (issue du payload webhook) — utilisée pour
  // vérifier explicitement que le lead résolu correspond bien au bon prospect et non
  // à un homonymne ou à une erreur de résolution silencieuse.
  senderLinkedInUrl: string | null;
}): Promise<void> {
  const { supabase, clientId, leadId, senderLinkedInUrl } = params;

  // 1. Vérifier que le client est plan='full' + subscription_status='active'
  const { data: clientRow, error: clientErr } = await supabase
    .from("clients")
    .select("plan, subscription_status")
    .eq("id", clientId)
    .maybeSingle();

  if (clientErr || !clientRow) return;

  const plan = String(clientRow.plan ?? "").trim().toLowerCase();
  const subscriptionStatus = String(clientRow.subscription_status ?? "").trim().toLowerCase();
  if (plan !== "full" || subscriptionStatus !== "active") return;

  // 2. Vérifier que le lead matché possède bien l'URL LinkedIn du prospect expéditeur.
  //    Ce double-check protège contre une erreur de résolution silencieuse dans
  //    findLeadIdByLinkedInIdentity() : un message du prospect A ne peut jamais
  //    marquer le prospect B comme répondu.
  if (senderLinkedInUrl) {
    const { data: leadRow } = await supabase
      .from("leads")
      .select("id, LinkedInURL")
      .eq("id", leadId)
      .eq("client_id", clientId)
      .maybeSingle();

    if (!leadRow) return; // lead introuvable pour ce client

    const normalizedLeadUrl = normalizeLinkedInUrl(
      typeof leadRow.LinkedInURL === "string" ? leadRow.LinkedInURL : null
    );
    const normalizedSenderUrl = normalizeLinkedInUrl(senderLinkedInUrl);

    if (normalizedLeadUrl && normalizedSenderUrl && normalizedLeadUrl !== normalizedSenderUrl) {
      // Mismatch : le leadId résolu ne correspond pas à l'expéditeur du message
      console.warn("UNIPILE_WEBHOOK_AUTO_RESPONDED_LINKEDIN_MISMATCH", {
        clientId,
        leadId: String(leadId),
        leadLinkedInUrl: normalizedLeadUrl,
        senderLinkedInUrl: normalizedSenderUrl,
      });
      return;
    }
  }

  // 3. Mettre à jour uniquement si message_sent=true et responded != true
  const { error: updateErr } = await supabase
    .from("leads")
    .update({ responded: true, next_followup_at: null })
    .eq("id", leadId)
    .eq("client_id", clientId)
    .eq("message_sent", true)
    .neq("responded", true);

  if (updateErr) {
    console.error("UNIPILE_WEBHOOK_AUTO_RESPONDED_UPDATE_ERROR:", updateErr);
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

  // Auto-marquer le lead comme répondu (plan='full' uniquement, voir commentaire ci-dessus)
  if (wasInserted && parsed.direction === "inbound" && leadId != null) {
    await autoMarkLeadResponded({ supabase, clientId, leadId, senderLinkedInUrl });
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

async function getLeadInternalMessage(params: {
  supabase: SupabaseClient;
  clientId: string;
  leadId: number | string;
}): Promise<string | null> {
  const { supabase, clientId, leadId } = params;
  const { data: lead } = await supabase
    .from("leads")
    .select("internal_message")
    .eq("client_id", clientId)
    .eq("id", leadId)
    .limit(1)
    .maybeSingle();

  const draftText =
    typeof lead?.internal_message === "string" ? lead.internal_message.trim() : "";
  return draftText || null;
}

async function logAcceptanceResolution(params: {
  supabase: SupabaseClient;
  clientId: string;
  leadId?: number | string | null;
  unipileAccountId: string;
  status: "success" | "skipped" | "error";
  details: Record<string, unknown>;
}) {
  const { supabase, clientId, leadId = null, unipileAccountId, status, details } = params;

  try {
    await supabase.from("automation_logs").insert({
      client_id: clientId,
      runner: "unipile-webhook",
      action: "relation_acceptance_match",
      status,
      lead_id: leadId,
      unipile_account_id: unipileAccountId,
      details,
    });
  } catch (error: unknown) {
    console.error("UNIPILE_WEBHOOK_ACCEPTANCE_LOG_ERROR:", error);
  }
}

async function updateInvitationAcceptedWithDraft(params: {
  supabase: SupabaseClient;
  clientId: string;
  invitationId: string;
  acceptedAtIso: string;
  raw: Record<string, unknown>;
  draftText: string | null;
}) {
  const { supabase, clientId, invitationId, acceptedAtIso, raw, draftText } = params;

  const draftAwarePayload: Record<string, unknown> = {
    status: "accepted",
    accepted_at: acceptedAtIso,
    raw,
    dm_draft_text: draftText,
    dm_draft_status: draftText ? "draft" : "none",
    last_error: null,
  };

  const { error } = await supabase
    .from("linkedin_invitations")
    .update(draftAwarePayload)
    .eq("id", invitationId)
    .eq("client_id", clientId);

  if (
    error &&
    (isMissingColumnError(error, "dm_draft_text") ||
      isMissingColumnError(error, "dm_draft_status") ||
      isMissingColumnError(error, "last_error"))
  ) {
    const { error: fallbackErr } = await supabase
      .from("linkedin_invitations")
      .update({
        status: "accepted",
        accepted_at: acceptedAtIso,
        raw,
      })
      .eq("id", invitationId)
      .eq("client_id", clientId);

    if (fallbackErr) {
      console.error("UNIPILE_WEBHOOK_RELATION_UPDATE_FALLBACK_ERROR:", fallbackErr);
    }
    return;
  }

  if (error) {
    console.error("UNIPILE_WEBHOOK_RELATION_UPDATE_DRAFT_ERROR:", error);
  }
}

function buildAcceptedInvitationRaw(params: {
  currentRaw: unknown;
  payload: JsonObject;
  matchedBy: string;
  candidatesCount: number;
}) {
  const { currentRaw, payload, matchedBy, candidatesCount } = params;
  const identity = extractAcceptedRelationIdentity(payload);
  const rawObject = toJsonObject(currentRaw);
  const preservedInvitation =
    Object.keys(toJsonObject(rawObject.invitation)).length > 0 ? rawObject.invitation : currentRaw;

  return {
    invitation: preservedInvitation ?? null,
    acceptance: {
      webhook_payload: payload,
      matching: {
        strategy: matchedBy,
        uncertain: false,
        candidates_count: candidatesCount,
        normalized_linkedin_url: identity.normalizedLinkedInUrl,
        profile_slug: identity.profileSlug,
        provider_id: identity.providerId,
        unipile_invitation_id: identity.unipileInvitationId,
      },
    },
  };
}

async function markResolvedInvitationAccepted(params: {
  supabase: SupabaseClient;
  clientId: string;
  invitationId: string;
  leadId: number | string;
  payload: JsonObject;
  matchedBy: string;
  candidatesCount: number;
}): Promise<{ invitationId: string | null; draftText: string | null }> {
  const {
    supabase,
    clientId,
    invitationId,
    leadId,
    payload,
    matchedBy,
    candidatesCount,
  } = params;

  const { data: invitation, error: invitationError } = await supabase
    .from("linkedin_invitations")
    .select("id, raw, accepted_at, lead_id")
    .eq("client_id", clientId)
    .eq("id", invitationId)
    .limit(1)
    .maybeSingle();

  if (invitationError || !invitation?.id) {
    console.error("UNIPILE_WEBHOOK_RELATION_ACCEPT_LOAD_ERROR:", invitationError);
    return { invitationId: null, draftText: null };
  }

  const acceptedAtIso =
    typeof invitation.accepted_at === "string" && invitation.accepted_at.trim()
      ? invitation.accepted_at
      : new Date().toISOString();
  const draftText = await getLeadInternalMessage({ supabase, clientId, leadId });

  await updateInvitationAcceptedWithDraft({
    supabase,
    clientId,
    invitationId: String(invitation.id),
    acceptedAtIso,
    raw: buildAcceptedInvitationRaw({
      currentRaw: invitation.raw,
      payload,
      matchedBy,
      candidatesCount,
    }),
    draftText,
  });

  return { invitationId: String(invitation.id), draftText };
}

async function handleNewRelation(params: {
  supabase: SupabaseClient;
  clientId: string;
  unipileAccountId: string;
  payload: JsonObject;
}) {
  const { supabase, clientId, unipileAccountId, payload } = params;
  const resolution = await resolveAcceptedInvitationMatch({
    supabase,
    clientId,
    unipileAccountId,
    payload,
  });

  if (!resolution.ok) {
    await logAcceptanceResolution({
      supabase,
      clientId,
      unipileAccountId,
      status: resolution.status === "ambiguous" ? "error" : "skipped",
      details: {
        result: resolution.status,
        reason: resolution.reason,
        matched_by: resolution.matchedBy,
        candidates_count: resolution.candidatesCount,
        identity: resolution.identity,
        details: resolution.details ?? null,
      },
    });

    console.warn("UNIPILE_WEBHOOK_RELATION_UNRESOLVED", {
      clientId,
      unipileAccountId,
      result: resolution.status,
      reason: resolution.reason,
      matched_by: resolution.matchedBy,
      candidates_count: resolution.candidatesCount,
      identity: resolution.identity,
      details: resolution.details ?? null,
    });
    return;
  }

  const matchedLeadId = resolution.leadId;
  const accepted = await markResolvedInvitationAccepted({
    supabase,
    clientId,
    invitationId: resolution.invitationId,
    leadId: matchedLeadId,
    payload,
    matchedBy: resolution.matchedBy,
    candidatesCount: resolution.candidatesCount,
  });

  const invitationEventId = accepted.invitationId;
  const draftText = accepted.draftText;

  if (!invitationEventId) {
    await logAcceptanceResolution({
      supabase,
      clientId,
      leadId: matchedLeadId,
      unipileAccountId,
      status: "error",
      details: {
        result: "accept_update_failed",
        matched_by: resolution.matchedBy,
        candidates_count: resolution.candidatesCount,
        identity: resolution.identity,
        invitation_id: resolution.invitationId,
      },
    });
    return;
  }

  const matchingDetails = {
    strategy: resolution.matchedBy,
    uncertain: false,
    candidates_count: resolution.candidatesCount,
    normalized_linkedin_url: resolution.identity.normalizedLinkedInUrl,
    profile_slug: resolution.identity.profileSlug,
    provider_id: resolution.identity.providerId,
    unipile_invitation_id: resolution.identity.unipileInvitationId,
  };

  const syncResult = await syncLeadProviderFromRelationPayload({
    supabase,
    raw: {
      webhook_payload: payload,
      matching: matchingDetails,
    },
    eventId: invitationEventId,
    clientId,
    unipileAccountId,
    leadIdHint: matchedLeadId,
  });

  await logAcceptanceResolution({
    supabase,
    clientId,
    leadId: matchedLeadId,
    unipileAccountId,
    status: "success",
    details: {
      result: "accepted_matched",
      matched_by: resolution.matchedBy,
      candidates_count: resolution.candidatesCount,
      invitation_id: invitationEventId,
      lead_id: matchedLeadId,
      identity: resolution.identity,
      sync_result: syncResult,
    },
  });

  if (draftText) {
    const providerId = syncResult.userProviderId ?? resolution.identity.providerId ?? null;

    // DM délégué au cron flush-accepted-drafts — pas d'envoi immédiat depuis le webhook
    await supabase.from("automation_logs").insert({
      client_id: clientId,
      runner: "unipile-webhook",
      action: "dm_delegated_to_cron",
      status: "info",
      lead_id: matchedLeadId,
      unipile_account_id: unipileAccountId,
      details: {
        invitation_id: invitationEventId,
        provider_id: providerId,
        dm_draft_status: "draft",
      },
    }).then(({ error }) => {
      if (error) console.error("UNIPILE_WEBHOOK_DM_DELEGATE_LOG_ERROR:", error);
    });

    if (providerId) {
      console.log("UNIPILE_WEBHOOK_RELATION_PROVIDER_READY", {
        clientId,
        leadId: String(matchedLeadId),
        invitationId: invitationEventId,
        providerId,
      });
    }
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
      console.warn("UNIPILE_WEBHOOK_CLIENT_NOT_FOUND", {
        eventType: parsed.eventType,
        account_id: parsed.unipileAccountId,
      });
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
