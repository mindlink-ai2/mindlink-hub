import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  createUnipileChatWithMessage,
  extractLinkedInProfileSlug,
  normalizeUnipileBase,
  requireEnv,
  sendUnipileMessage,
} from "../_shared/unipile.ts";

type JsonObject = Record<string, unknown>;
type AcceptedResolution = {
  invitationId: string;
  leadId: string;
};

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function getPathValue(obj: JsonObject, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return null;
    current = (current as JsonObject)[key];
  }
  return current;
}

function firstString(obj: JsonObject, paths: string[][]): string | null {
  for (const path of paths) {
    const value = getPathValue(obj, path);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function normalizeEventType(raw: string | null): string {
  if (!raw) return "UNKNOWN";
  return raw
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[-./]/g, "_")
    .toUpperCase();
}

function classifyEvent(eventType: string): "new_message" | "invitation_sent" | "accepted" | "other" {
  if (
    eventType.includes("NEW_RELATION") ||
    eventType.includes("NEW_CONNECTION") ||
    eventType.includes("RELATION_ACCEPTED") ||
    eventType.includes("CONNECTION_ACCEPTED")
  ) {
    return "accepted";
  }

  if (
    eventType.includes("INVITE_SENT") ||
    eventType.includes("INVITATION_SENT") ||
    eventType.includes("RELATION_SENT")
  ) {
    return "invitation_sent";
  }

  if (eventType.includes("NEW_MESSAGE") || eventType.includes("MESSAGE_NEW")) {
    return "new_message";
  }

  return "other";
}

function normalizeLinkedInUrl(value: string | null): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (!host.includes("linkedin.com")) return withProtocol;
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.protocol}//${host}${path}`;
  } catch {
    return withProtocol;
  }
}

function normalizeTextForComparison(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeInvitationId(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  return raw || null;
}

function normalizeProviderId(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw || !raw.startsWith("ACoA")) return null;
  return raw;
}

function truncatePreview(text: string | null | undefined, maxLength = 160): string | null {
  const value = String(text ?? "").trim();
  if (!value) return null;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

async function resolveClientId(supabase: ReturnType<typeof createClient>, unipileAccountId: string | null) {
  if (!unipileAccountId) return null;

  const { data: account } = await supabase
    .from("unipile_accounts")
    .select("client_id")
    .eq("unipile_account_id", unipileAccountId)
    .eq("provider", "linkedin")
    .limit(1)
    .maybeSingle();

  if (!account?.client_id) return null;
  return String(account.client_id);
}

async function logEvent(params: {
  supabase: ReturnType<typeof createClient>;
  clientId: string | null;
  unipileAccountId: string | null;
  eventType: string;
  payload: JsonObject;
}) {
  const { supabase, clientId, unipileAccountId, eventType, payload } = params;

  const base = {
    provider: "linkedin",
    client_id: clientId,
    event_type: eventType,
    received_at: new Date().toISOString(),
  };

  const candidates = [
    { ...base, unipile_account_id: unipileAccountId, payload },
    { ...base, payload },
    { ...base, unipile_account_id: unipileAccountId, raw: payload },
    { ...base, raw: payload },
  ];

  for (const candidate of candidates) {
    const { error } = await supabase.from("unipile_events").insert(candidate);
    if (!error) return;
  }
}

async function findLeadIdByIdentity(params: {
  supabase: ReturnType<typeof createClient>;
  clientId: string;
  linkedinUrl: string | null;
  slug: string | null;
}): Promise<string | null> {
  const { supabase, clientId, linkedinUrl, slug } = params;
  if (!linkedinUrl && !slug) return null;

  const { data: leads } = await supabase
    .from("leads")
    .select("id, LinkedInURL")
    .eq("client_id", clientId)
    .not("LinkedInURL", "is", null);

  const matchedIds = new Set<string>();
  for (const lead of leads ?? []) {
    const leadId = String(lead.id ?? "");
    const leadUrl = normalizeLinkedInUrl(String(lead.LinkedInURL ?? ""));
    const leadSlug = normalizeTextForComparison(
      extractLinkedInProfileSlug(String(lead.LinkedInURL ?? ""))
    );

    if (linkedinUrl && leadUrl === linkedinUrl) matchedIds.add(leadId);
    if (slug && leadSlug === normalizeTextForComparison(slug)) matchedIds.add(leadId);
  }

  return matchedIds.size === 1 ? Array.from(matchedIds)[0] : null;
}

async function buildDraftPayload(params: {
  supabase: ReturnType<typeof createClient>;
  clientId: string;
  leadId: string;
}) {
  const { supabase, clientId, leadId } = params;
  const { data: lead } = await supabase
    .from("leads")
    .select("internal_message")
    .eq("client_id", clientId)
    .eq("id", leadId)
    .limit(1)
    .maybeSingle();

  const draftText = typeof lead?.internal_message === "string" ? lead.internal_message.trim() : "";
  return {
    dm_draft_text: draftText || null,
    dm_draft_status: draftText ? "draft" : "none",
    last_error: null,
  };
}

async function isClientFullActivePlan(
  supabase: ReturnType<typeof createClient>,
  clientId: string
): Promise<boolean> {
  const { data: client } = await supabase
    .from("clients")
    .select("plan, subscription_status")
    .eq("id", clientId)
    .limit(1)
    .maybeSingle();

  if (!client) return false;

  const plan = String(client.plan ?? "").trim().toLowerCase();
  const subscriptionStatus = String(client.subscription_status ?? "")
    .trim()
    .toLowerCase();
  return plan === "full" && subscriptionStatus === "active";
}

function extractAcceptedIdentity(payload: JsonObject) {
  const linkedinUrl = normalizeLinkedInUrl(
    firstString(payload, [
      ["user_profile_url"],
      ["profile_url"],
      ["linkedin_url"],
      ["data", "user_profile_url"],
      ["data", "profile_url"],
      ["data", "linkedin_url"],
      ["contact", "profile_url"],
      ["contact", "linkedin_url"],
      ["relation", "profile_url"],
      ["relation", "linkedin_url"],
    ])
  );

  const publicIdentifier =
    normalizeTextForComparison(
      firstString(payload, [
        ["user_public_identifier"],
        ["public_identifier"],
        ["data", "user_public_identifier"],
        ["data", "public_identifier"],
        ["contact", "public_identifier"],
        ["relation", "public_identifier"],
      ])
    ) ?? null;

  return {
    linkedinUrl,
    slug: publicIdentifier ?? normalizeTextForComparison(extractLinkedInProfileSlug(linkedinUrl)),
    providerId:
      normalizeProviderId(
        firstString(payload, [
          ["user_provider_id"],
          ["provider_id"],
          ["data", "user_provider_id"],
          ["data", "provider_id"],
          ["contact", "provider_id"],
          ["relation", "provider_id"],
        ])
      ) ?? null,
    invitationId:
      normalizeInvitationId(
        firstString(payload, [
          ["invitation_id"],
          ["invitationId"],
          ["data", "invitation_id"],
          ["data", "invitationId"],
          ["relation", "invitation_id"],
          ["relation", "invitationId"],
        ])
      ) ?? null,
  };
}

async function findInvitationForAccepted(params: {
  supabase: ReturnType<typeof createClient>;
  clientId: string;
  unipileAccountId: string;
  payload: JsonObject;
}): Promise<{ invitationId: string; leadId: string } | null> {
  const { supabase, clientId, unipileAccountId, payload } = params;
  const identity = extractAcceptedIdentity(payload);

  const selectFields =
    "id, lead_id, raw, target_linkedin_provider_id, target_profile_slug, target_linkedin_url_normalized, unipile_invitation_id";
  const directLookups: Array<{
    field:
      | "unipile_invitation_id"
      | "target_linkedin_provider_id"
      | "target_linkedin_url_normalized"
      | "target_profile_slug";
    value: string | null;
  }> = [
    { field: "unipile_invitation_id", value: identity.invitationId },
    { field: "target_linkedin_provider_id", value: identity.providerId },
    { field: "target_linkedin_url_normalized", value: identity.linkedinUrl },
    { field: "target_profile_slug", value: identity.slug },
  ];

  for (const lookup of directLookups) {
    if (!lookup.value) continue;

    const { data, error } = await supabase
      .from("linkedin_invitations")
      .select(selectFields)
      .eq("client_id", clientId)
      .eq("unipile_account_id", unipileAccountId)
      .eq(lookup.field, lookup.value)
      .in("status", ["queued", "pending", "sent", "accepted"])
      .limit(2);

    if (error) continue;

    const rows = Array.isArray(data) ? data : [];
    if (rows.length !== 1) {
      if (rows.length > 1) return null;
      continue;
    }

    const row = rows[0] as Record<string, unknown>;
    const invitationId = String(row.id ?? "").trim();
    const leadId = String(row.lead_id ?? "").trim();
    if (invitationId && leadId) return { invitationId, leadId };
  }

  const leadId = await findLeadIdByIdentity({
    supabase,
    clientId,
    linkedinUrl: identity.linkedinUrl,
    slug: identity.slug,
  });
  if (!leadId) return null;

  const { data: invitations, error } = await supabase
    .from("linkedin_invitations")
    .select("id, lead_id")
    .eq("client_id", clientId)
    .eq("lead_id", leadId)
    .eq("unipile_account_id", unipileAccountId)
    .in("status", ["queued", "pending", "sent", "accepted"])
    .limit(2);

  if (error) return null;
  const rows = Array.isArray(invitations) ? invitations : [];
  if (rows.length !== 1) return null;

  const invitationId = String((rows[0] as Record<string, unknown>).id ?? "").trim();
  return invitationId ? { invitationId, leadId } : null;
}

async function resolveThreadForAutoSend(params: {
  supabase: ReturnType<typeof createClient>;
  clientId: string;
  leadId: string;
  unipileAccountId: string;
  payload: JsonObject;
}): Promise<{ threadDbId: string; unipileThreadId: string } | null> {
  const { supabase, clientId, leadId, unipileAccountId, payload } = params;

  const threadIdFromPayload = firstString(payload, [
    ["thread_id"],
    ["threadId"],
    ["conversation_id"],
    ["conversationId"],
    ["chat_id"],
    ["chatId"],
    ["data", "thread_id"],
    ["data", "conversation_id"],
    ["message", "thread_id"],
    ["message", "conversation_id"],
  ]);

  if (threadIdFromPayload) {
    await supabase.from("inbox_threads").upsert(
      {
        client_id: clientId,
        provider: "linkedin",
        lead_id: leadId,
        unipile_account_id: unipileAccountId,
        unipile_thread_id: threadIdFromPayload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "client_id,unipile_account_id,unipile_thread_id" }
    );

    const { data: threadById } = await supabase
      .from("inbox_threads")
      .select("id, unipile_thread_id")
      .eq("client_id", clientId)
      .eq("unipile_account_id", unipileAccountId)
      .eq("unipile_thread_id", threadIdFromPayload)
      .limit(1)
      .maybeSingle();

    if (threadById?.id && threadById.unipile_thread_id) {
      return {
        threadDbId: String(threadById.id),
        unipileThreadId: String(threadById.unipile_thread_id),
      };
    }
  }

  const { data: latestThread } = await supabase
    .from("inbox_threads")
    .select("id, unipile_thread_id")
    .eq("client_id", clientId)
    .eq("lead_id", leadId)
    .eq("unipile_account_id", unipileAccountId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (!latestThread?.id || !latestThread.unipile_thread_id) return null;
  return {
    threadDbId: String(latestThread.id),
    unipileThreadId: String(latestThread.unipile_thread_id),
  };
}

async function autoSendDraftAfterAccepted(params: {
  supabase: ReturnType<typeof createClient>;
  clientId: string;
  invitationId: string;
  leadId: string;
  unipileAccountId: string;
  payload: JsonObject;
}) {
  const { supabase, clientId, invitationId, leadId, unipileAccountId, payload } = params;

  const isFullActive = await isClientFullActivePlan(supabase, clientId);
  if (!isFullActive) return;

  // Atomic claim of the draft to prevent double-sends
  const provisionalSentAt = new Date().toISOString();
  const { data: claimed } = await supabase
    .from("linkedin_invitations")
    .update({
      dm_draft_status: "sent",
      dm_sent_at: provisionalSentAt,
      last_error: null,
    })
    .eq("id", invitationId)
    .eq("client_id", clientId)
    .eq("dm_draft_status", "draft")
    .is("dm_sent_at", null)
    .select("id, dm_draft_text")
    .limit(1)
    .maybeSingle();

  if (!claimed?.id) return;

  const draftText = String(claimed.dm_draft_text ?? "").trim();
  if (!draftText) {
    await supabase
      .from("linkedin_invitations")
      .update({ dm_draft_status: "none", dm_sent_at: null, last_error: "draft_text_empty" })
      .eq("id", invitationId)
      .eq("client_id", clientId);
    return;
  }

  const unipileBase = normalizeUnipileBase(requireEnv("UNIPILE_DSN"));
  const unipileApiKey = requireEnv("UNIPILE_API_KEY");

  let thread = await resolveThreadForAutoSend({ supabase, clientId, leadId, unipileAccountId, payload });

  let messageId = `edge-auto-${Date.now()}`;
  let sentAt = provisionalSentAt;
  let sendPayload: unknown = null;

  if (thread) {
    // Thread already exists — send to it
    const sendResult = await sendUnipileMessage({
      baseUrl: unipileBase,
      apiKey: unipileApiKey,
      accountId: unipileAccountId,
      threadId: thread.unipileThreadId,
      text: draftText,
    });

    if (!sendResult.ok) {
      await supabase
        .from("linkedin_invitations")
        .update({ dm_draft_status: "draft", dm_sent_at: null, last_error: sendResult.error })
        .eq("id", invitationId)
        .eq("client_id", clientId);
      return;
    }

    sendPayload = sendResult.payload;
    const p = asObject(sendResult.payload);
    sentAt = firstString(p, [["sent_at"], ["timestamp"], ["created_at"], ["data", "sent_at"]]) ?? provisionalSentAt;
    if (Number.isNaN(new Date(sentAt).getTime())) sentAt = provisionalSentAt;
    messageId = firstString(p, [["message_id"], ["id"], ["provider_id"], ["data", "message_id"]]) ?? messageId;
  } else {
    // No thread found — create conversation with first message included (requires provider_id)
    const { data: leadRow } = await supabase
      .from("leads")
      .select("linkedin_provider_id")
      .eq("id", leadId)
      .eq("client_id", clientId)
      .limit(1)
      .maybeSingle();

    let providerId = String(leadRow?.linkedin_provider_id ?? "").trim();

    // Fallback: extract provider_id from the acceptance webhook payload (present in NEW_RELATION events)
    if (!providerId) {
      const payloadProviderId = firstString(payload, [
        ["provider_id"],
        ["attendee", "provider_id"],
        ["data", "provider_id"],
        ["contact", "provider_id"],
        ["sender", "provider_id"],
        ["user", "provider_id"],
      ]);
      // LinkedIn provider IDs (ACoA...) are at least 10 chars
      if (payloadProviderId && payloadProviderId.length >= 10) {
        providerId = payloadProviderId;
        // Persist for future use (cron, followup, etc.)
        await supabase
          .from("leads")
          .update({ linkedin_provider_id: providerId })
          .eq("id", leadId)
          .eq("client_id", clientId);
      }
    }

    if (!providerId) {
      await supabase
        .from("linkedin_invitations")
        .update({ dm_draft_status: "draft", dm_sent_at: null, last_error: "auto_send_provider_id_missing" })
        .eq("id", invitationId)
        .eq("client_id", clientId);
      return;
    }

    const createResult = await createUnipileChatWithMessage({
      baseUrl: unipileBase,
      apiKey: unipileApiKey,
      accountId: unipileAccountId,
      attendeeProviderId: providerId,
      text: draftText,
    });

    if (!createResult.ok) {
      await supabase
        .from("linkedin_invitations")
        .update({ dm_draft_status: "draft", dm_sent_at: null, last_error: createResult.error })
        .eq("id", invitationId)
        .eq("client_id", clientId);
      return;
    }

    sendPayload = createResult.payload;
    if (createResult.messageId) messageId = createResult.messageId;
    if (createResult.sentAt) sentAt = createResult.sentAt;
    if (Number.isNaN(new Date(sentAt).getTime())) sentAt = provisionalSentAt;

    // Save new thread to DB
    await supabase.from("inbox_threads").upsert(
      {
        client_id: clientId,
        provider: "linkedin",
        lead_id: leadId,
        unipile_account_id: unipileAccountId,
        unipile_thread_id: createResult.threadId,
        last_message_at: sentAt,
        last_message_preview: truncatePreview(draftText),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "client_id,unipile_account_id,unipile_thread_id" }
    );

    const { data: newThread } = await supabase
      .from("inbox_threads")
      .select("id, unipile_thread_id")
      .eq("client_id", clientId)
      .eq("unipile_account_id", unipileAccountId)
      .eq("unipile_thread_id", createResult.threadId)
      .limit(1)
      .maybeSingle();

    if (newThread?.id && newThread.unipile_thread_id) {
      thread = { threadDbId: String(newThread.id), unipileThreadId: String(newThread.unipile_thread_id) };
    }
  }

  if (!thread) return;

  const { data: existingMessage } = await supabase
    .from("inbox_messages")
    .select("id")
    .eq("client_id", clientId)
    .eq("unipile_account_id", unipileAccountId)
    .eq("unipile_message_id", messageId)
    .limit(1)
    .maybeSingle();

  if (!existingMessage?.id) {
    await supabase.from("inbox_messages").insert({
      client_id: clientId,
      provider: "linkedin",
      thread_db_id: thread.threadDbId,
      unipile_account_id: unipileAccountId,
      unipile_thread_id: thread.unipileThreadId,
      unipile_message_id: messageId,
      direction: "outbound",
      sender_name: null,
      sender_linkedin_url: null,
      text: draftText,
      sent_at: sentAt,
      raw: sendPayload,
    });
  }

  await supabase
    .from("inbox_threads")
    .update({ last_message_at: sentAt, last_message_preview: truncatePreview(draftText), updated_at: new Date().toISOString() })
    .eq("id", thread.threadDbId)
    .eq("client_id", clientId);

  await supabase
    .from("linkedin_invitations")
    .update({ dm_draft_status: "sent", dm_sent_at: sentAt, last_error: null })
    .eq("id", invitationId)
    .eq("client_id", clientId);

  await supabase
    .from("leads")
    .update({ message_sent: true, message_sent_at: sentAt })
    .eq("id", leadId)
    .eq("client_id", clientId);
}

async function handleAccepted(params: {
  supabase: ReturnType<typeof createClient>;
  clientId: string;
  unipileAccountId: string;
  payload: JsonObject;
}): Promise<AcceptedResolution | null> {
  const { supabase, clientId, unipileAccountId, payload } = params;
  const matched = await findInvitationForAccepted({
    supabase,
    clientId,
    unipileAccountId,
    payload,
  });
  if (!matched) return null;

  const { data: invitation } = await supabase
    .from("linkedin_invitations")
    .select("id, raw, accepted_at")
    .eq("id", matched.invitationId)
    .eq("client_id", clientId)
    .limit(1)
    .maybeSingle();

  if (!invitation?.id) return null;

  const acceptedAt =
    typeof invitation.accepted_at === "string" && invitation.accepted_at.trim()
      ? invitation.accepted_at
      : new Date().toISOString();
  const draftPayload = await buildDraftPayload({
    supabase,
    clientId,
    leadId: matched.leadId,
  });

  await supabase
    .from("linkedin_invitations")
    .update({
      status: "accepted",
      accepted_at: acceptedAt,
      raw: {
        invitation: invitation.raw ?? null,
        acceptance: payload,
      },
      ...draftPayload,
    })
    .eq("id", matched.invitationId)
    .eq("client_id", clientId);

  return {
    invitationId: matched.invitationId,
    leadId: matched.leadId,
  };
}

async function handleInvitationSent(params: {
  supabase: ReturnType<typeof createClient>;
  clientId: string;
  unipileAccountId: string;
  payload: JsonObject;
}) {
  const { supabase, clientId, unipileAccountId, payload } = params;
  const identity = extractAcceptedIdentity(payload);

  const leadId = await findLeadIdByIdentity({
    supabase,
    clientId,
    linkedinUrl: identity.linkedinUrl,
    slug: identity.slug,
  });

  if (!leadId) return;

  const sentAt = new Date().toISOString();

  await supabase.from("linkedin_invitations").upsert(
    {
      client_id: clientId,
      lead_id: leadId,
      unipile_account_id: unipileAccountId,
      status: "sent",
      sent_at: sentAt,
      target_linkedin_provider_id: identity.providerId,
      target_profile_slug: identity.slug,
      target_linkedin_url_normalized: identity.linkedinUrl,
      unipile_invitation_id: identity.invitationId,
      raw: {
        provider_id: identity.providerId,
        profile_slug: identity.slug,
        normalized_linkedin_url: identity.linkedinUrl,
        unipile_invitation_id: identity.invitationId,
        sent_webhook: payload,
      },
    },
    { onConflict: "client_id,lead_id,unipile_account_id" }
  );
}

async function handleNewMessage(params: {
  supabase: ReturnType<typeof createClient>;
  clientId: string;
  unipileAccountId: string;
  payload: JsonObject;
}) {
  const { supabase, clientId, unipileAccountId, payload } = params;

  const threadId = firstString(payload, [
    ["thread_id"],
    ["threadId"],
    ["conversation_id"],
    ["conversationId"],
    ["chat_id"],
    ["chatId"],
  ]);
  const messageId = firstString(payload, [
    ["message_id"],
    ["messageId"],
    ["id"],
    ["provider_id"],
    ["providerId"],
  ]);

  if (!threadId || !messageId) return;

  const text =
    firstString(payload, [["text"], ["content"], ["body"], ["message", "text"], ["data", "text"]]) ??
    null;

  const directionRaw =
    firstString(payload, [["direction"], ["data", "direction"], ["message", "direction"]]) ?? "inbound";
  const direction = directionRaw.toLowerCase().includes("out") ? "outbound" : "inbound";

  const sentAtRaw =
    firstString(payload, [["sent_at"], ["timestamp"], ["created_at"], ["data", "sent_at"], ["data", "timestamp"]]) ??
    new Date().toISOString();
  const sentAt = Number.isNaN(new Date(sentAtRaw).getTime()) ? new Date().toISOString() : new Date(sentAtRaw).toISOString();

  await supabase.from("inbox_threads").upsert(
    {
      client_id: clientId,
      provider: "linkedin",
      unipile_account_id: unipileAccountId,
      unipile_thread_id: threadId,
      last_message_at: sentAt,
      last_message_preview: truncatePreview(text),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "client_id,unipile_account_id,unipile_thread_id" }
  );

  const { data: thread } = await supabase
    .from("inbox_threads")
    .select("id")
    .eq("client_id", clientId)
    .eq("unipile_account_id", unipileAccountId)
    .eq("unipile_thread_id", threadId)
    .limit(1)
    .maybeSingle();

  if (!thread?.id) return;

  const { data: existing } = await supabase
    .from("inbox_messages")
    .select("id")
    .eq("client_id", clientId)
    .eq("unipile_account_id", unipileAccountId)
    .eq("unipile_message_id", messageId)
    .limit(1)
    .maybeSingle();

  if (!existing?.id) {
    await supabase.from("inbox_messages").insert({
      client_id: clientId,
      provider: "linkedin",
      thread_db_id: String(thread.id),
      unipile_account_id: unipileAccountId,
      unipile_thread_id: threadId,
      unipile_message_id: messageId,
      direction,
      sender_name: direction === "outbound" ? null : firstString(payload, [["sender_name"], ["sender", "name"]]),
      sender_linkedin_url: normalizeLinkedInUrl(
        firstString(payload, [["sender_linkedin_url"], ["sender", "linkedin_url"], ["sender", "profile_url"]])
      ),
      text,
      sent_at: sentAt,
      raw: payload,
    });
  }
}

Deno.serve(async (req) => {
  try {
    const provided = req.headers.get("x-unipile-secret") ?? new URL(req.url).searchParams.get("secret");
    if (provided !== requireEnv("UNIPILE_WEBHOOK_SECRET")) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const payloadInput = await req.json().catch(() => ({}));
    const payload = asObject(payloadInput);

    const eventType = normalizeEventType(
      firstString(payload, [
        ["event_type"],
        ["eventType"],
        ["event"],
        ["type"],
        ["data", "event_type"],
        ["data", "eventType"],
      ])
    );
    const kind = classifyEvent(eventType);

    const unipileAccountId = firstString(payload, [
      ["account_id"],
      ["accountId"],
      ["account", "id"],
      ["data", "account_id"],
      ["data", "accountId"],
    ]);

    const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const clientId = await resolveClientId(supabase, unipileAccountId);

    await logEvent({
      supabase,
      clientId,
      unipileAccountId,
      eventType,
      payload,
    });

    if (!clientId || !unipileAccountId) {
      return new Response(JSON.stringify({ ok: true, processed: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (kind === "new_message") {
      await handleNewMessage({ supabase, clientId, unipileAccountId, payload });
    }

    if (kind === "invitation_sent") {
      await handleInvitationSent({ supabase, clientId, unipileAccountId, payload });
    }

    if (kind === "accepted") {
      const accepted = await handleAccepted({
        supabase,
        clientId,
        unipileAccountId,
        payload,
      });
      if (accepted?.invitationId) {
        await autoSendDraftAfterAccepted({
          supabase,
          clientId,
          invitationId: accepted.invitationId,
          leadId: accepted.leadId,
          unipileAccountId,
          payload,
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, kind, processed: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("UNIPILE_WEBHOOK_EDGE_ERROR", error);
    return new Response(
      JSON.stringify({ ok: false, error: "server_error", details: String(error) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
