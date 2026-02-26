import { createClient } from "jsr:@supabase/supabase-js@2";
import { extractLinkedInProfileSlug, requireEnv } from "../_shared/unipile.ts";

type JsonObject = Record<string, unknown>;

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

  for (const lead of leads ?? []) {
    const leadId = String(lead.id ?? "");
    const leadUrl = normalizeLinkedInUrl(String(lead.LinkedInURL ?? ""));
    const leadSlug = extractLinkedInProfileSlug(String(lead.LinkedInURL ?? ""));

    if (linkedinUrl && leadUrl === linkedinUrl) return leadId;
    if (slug && leadSlug === slug) return leadId;
  }

  return null;
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

async function handleAccepted(params: {
  supabase: ReturnType<typeof createClient>;
  clientId: string;
  unipileAccountId: string;
  payload: JsonObject;
}) {
  const { supabase, clientId, unipileAccountId, payload } = params;

  const identityUrl = normalizeLinkedInUrl(
    firstString(payload, [
      ["user_profile_url"],
      ["profile_url"],
      ["linkedin_url"],
      ["data", "profile_url"],
      ["data", "linkedin_url"],
      ["contact", "profile_url"],
      ["contact", "linkedin_url"],
    ])
  );

  const identitySlug =
    extractLinkedInProfileSlug(
      firstString(payload, [
        ["user_public_identifier"],
        ["provider_id"],
        ["data", "provider_id"],
        ["contact", "provider_id"],
      ])
    ) ?? null;

  let leadId = await findLeadIdByIdentity({
    supabase,
    clientId,
    linkedinUrl: identityUrl,
    slug: identitySlug,
  });

  let invitationId: string | null = null;
  let previousRaw: unknown = null;

  if (leadId) {
    const { data: invitation } = await supabase
      .from("linkedin_invitations")
      .select("id, raw")
      .eq("client_id", clientId)
      .eq("lead_id", leadId)
      .eq("unipile_account_id", unipileAccountId)
      .in("status", ["queued", "pending", "sent", "accepted"])
      .order("sent_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    invitationId = invitation?.id ? String(invitation.id) : null;
    previousRaw = invitation?.raw ?? null;
  }

  if (!invitationId) {
    const { data: fallback } = await supabase
      .from("linkedin_invitations")
      .select("id, lead_id, raw")
      .eq("client_id", clientId)
      .eq("unipile_account_id", unipileAccountId)
      .in("status", ["queued", "pending", "sent"])
      .order("sent_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (fallback?.id) {
      invitationId = String(fallback.id);
      previousRaw = fallback.raw ?? null;
      if (!leadId && fallback.lead_id !== null && fallback.lead_id !== undefined) {
        leadId = String(fallback.lead_id);
      }
    }
  }

  const acceptedAt = new Date().toISOString();
  const draftPayload =
    leadId !== null ? await buildDraftPayload({ supabase, clientId, leadId }) : {
      dm_draft_text: null,
      dm_draft_status: "none",
      last_error: null,
    };

  if (invitationId) {
    await supabase
      .from("linkedin_invitations")
      .update({
        status: "accepted",
        accepted_at: acceptedAt,
        raw: {
          invitation: previousRaw,
          acceptance: payload,
        },
        ...draftPayload,
      })
      .eq("id", invitationId)
      .eq("client_id", clientId);

    return;
  }

  if (!leadId) return;

  await supabase.from("linkedin_invitations").insert({
    client_id: clientId,
    lead_id: leadId,
    unipile_account_id: unipileAccountId,
    status: "accepted",
    accepted_at: acceptedAt,
    raw: { acceptance: payload },
    ...draftPayload,
  });
}

async function handleInvitationSent(params: {
  supabase: ReturnType<typeof createClient>;
  clientId: string;
  unipileAccountId: string;
  payload: JsonObject;
}) {
  const { supabase, clientId, unipileAccountId, payload } = params;

  const identityUrl = normalizeLinkedInUrl(
    firstString(payload, [
      ["user_profile_url"],
      ["profile_url"],
      ["linkedin_url"],
      ["data", "profile_url"],
      ["data", "linkedin_url"],
      ["contact", "profile_url"],
      ["contact", "linkedin_url"],
    ])
  );

  const identitySlug =
    extractLinkedInProfileSlug(
      firstString(payload, [
        ["user_public_identifier"],
        ["provider_id"],
        ["data", "provider_id"],
        ["contact", "provider_id"],
      ])
    ) ?? null;

  const leadId = await findLeadIdByIdentity({
    supabase,
    clientId,
    linkedinUrl: identityUrl,
    slug: identitySlug,
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
      raw: {
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
      await handleAccepted({ supabase, clientId, unipileAccountId, payload });
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
