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
import { getFirstString, parseUnipileMessage, toJsonObject, truncatePreview } from "@/lib/unipile-inbox";

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
  status: number;
  details: string | null;
};

function buildConversationCreateUserMessage(rawDetails: string | null): string {
  const defaultMessage = "Impossible d’envoyer : création de conversation LinkedIn échouée.";
  if (!rawDetails) return defaultMessage;

  const details = rawDetails.trim();
  if (!details) return defaultMessage;
  const normalized = details.toLowerCase();

  if (
    normalized.includes("not connected") ||
    normalized.includes("not a 1st degree") ||
    normalized.includes("invitation") ||
    normalized.includes("relation") ||
    normalized.includes("connection")
  ) {
    return "Impossible d’envoyer : le prospect doit d’abord accepter votre invitation LinkedIn.";
  }

  if (
    normalized === "not found" ||
    normalized.includes("not found") ||
    normalized.includes("404")
  ) {
    return "Impossible d’envoyer : prospect introuvable côté messagerie LinkedIn (souvent pas encore connecté).";
  }

  return `Impossible d’envoyer : ${details}`;
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
  profileSlug?: string | null;
  normalizedLeadLinkedInUrl?: string | null;
}): Array<Record<string, unknown>> {
  const { providerId, profileSlug, normalizedLeadLinkedInUrl } = params;
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

  return variants;
}

async function postFirstSuccessful(
  urls: string[],
  initBuilder: (url: string) => RequestInit
): Promise<{ payload: unknown; url: string } | null> {
  for (const url of urls) {
    const res = await fetch(url, initBuilder(url));
    const payload = await readResponseBody(res);
    if (res.ok) {
      return { payload, url };
    }
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
}): Promise<{ sentAt: string; unipileMessageId: string; payload: unknown; senderName: string | null; senderLinkedInUrl: string | null } | null> {
  const { base, apiKey, unipileAccountId, unipileThreadId, text } = params;

  const sendResult = await postFirstSuccessful(
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

  if (!sendResult) return null;

  const responseObject = toJsonObject(sendResult.payload);
  const parsedMessage = parseUnipileMessage({
    ...responseObject,
    ...(toJsonObject(responseObject.data)),
    ...(toJsonObject(responseObject.message)),
    direction: "outbound",
    thread_id: unipileThreadId,
    text,
  });

  if (!parsedMessage.unipileMessageId) return null;

  return {
    sentAt: parsedMessage.sentAtIso,
    unipileMessageId: parsedMessage.unipileMessageId,
    payload: sendResult.payload,
    senderName: parsedMessage.senderName,
    senderLinkedInUrl: parsedMessage.senderLinkedInUrl,
  };
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

      const payload = await readResponseBody(res);
      if (!res.ok) {
        failures.push({
          endpoint,
          status: res.status,
          details: getErrorMessage(payload),
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
      return NextResponse.json({ ok: false, status: "client_not_found" }, { status: 404 });
    }

    currentLockKey = lockKey(clientId, leadId);
    if (inFlightSends.has(currentLockKey)) {
      return NextResponse.json(
        {
          ok: false,
          status: "already_in_progress",
          message: "Envoi déjà en cours",
        },
        { status: 409 }
      );
    }
    inFlightSends.add(currentLockKey);

    const lead = await resolveLead(supabase, clientId, leadId);
    if (!lead) {
      return NextResponse.json(
        { ok: false, status: "lead_not_found", message: "Prospect introuvable." },
        { status: 404 }
      );
    }

    const normalizedLeadLinkedInUrl = normalizeLinkedInUrl(lead.LinkedInURL);
    const profileSlug = extractLinkedInProfileSlug(lead.LinkedInURL);
    if (!normalizedLeadLinkedInUrl || !profileSlug) {
      return NextResponse.json(
        {
          ok: false,
          status: "missing_linkedin_info",
          message: "Impossible d’envoyer : informations LinkedIn du prospect manquantes.",
        },
        { status: 400 }
      );
    }

    const unipileAccountId = await getLinkedinUnipileAccountId(supabase, clientId);
    if (!unipileAccountId) {
      return NextResponse.json(
        {
          ok: false,
          status: "linkedin_account_not_connected",
          message: "Compte LinkedIn non connecté.",
        },
        { status: 404 }
      );
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
        return NextResponse.json(
          {
            ok: false,
            status: "provider_id_missing",
            message: "Impossible d’envoyer : informations LinkedIn du prospect manquantes.",
          },
          { status: 502 }
        );
      }

      const targetVariants = buildRecipientTargetVariants({
        providerId,
        profileSlug,
        normalizedLeadLinkedInUrl,
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
        const directSendFailures: Array<{ status: number; details: string | null }> = [];
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

          const payload = await readResponseBody(res);
          if (!res.ok) {
            directSendFailures.push({
              status: res.status,
              details: getErrorMessage(payload),
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
              details: failure.details,
            })),
          ];
          const firstDetail = combinedFailures.find((failure) => failure.details)?.details ?? null;
          return NextResponse.json(
            {
              ok: false,
              status: "conversation_create_failed",
              message: buildConversationCreateUserMessage(firstDetail),
            },
            { status: 502 }
          );
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

    if (!sent) {
      return NextResponse.json(
        {
          ok: false,
          status: "send_failed",
          message: "Impossible d’envoyer le message LinkedIn pour le moment.",
        },
        { status: 502 }
      );
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
    console.error("PROSPECTION_SEND_LINKEDIN_MESSAGE_ERROR", error);
    return NextResponse.json(
      { ok: false, status: "server_error", message: "Erreur serveur pendant l’envoi." },
      { status: 500 }
    );
  } finally {
    if (currentLockKey) inFlightSends.delete(currentLockKey);
  }
}
