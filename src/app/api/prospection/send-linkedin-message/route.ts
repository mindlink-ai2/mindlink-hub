import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractLinkedInProfileSlug, normalizeLinkedInUrl } from "@/lib/linkedin-url";
import {
  createServiceSupabase,
  getClientIdFromClerkUser,
  getLinkedinUnipileAccountId,
} from "@/lib/inbox-server";
import {
  assertValidLinkedinProviderId,
  ensureThreadAndSendMessage,
  getAcceptedProviderIdForLead,
  findExistingThreadForLead,
} from "@/lib/linkedin-messaging";

type LeadRow = {
  id: number | string;
  client_id: number | string;
  LinkedInURL: string | null;
  FirstName: string | null;
  LastName: string | null;
  Name: string | null;
  message_sent: boolean | null;
  message_sent_at: string | null;
  next_followup_at: string | null;
  [key: string]: unknown;
};

const inFlightSends = new Set<string>();

function lockKey(clientId: string, leadId: number): string {
  return `${clientId}:${leadId}`;
}

function getDisplayName(lead: LeadRow): string | null {
  const fullName = `${lead.FirstName ?? ""} ${lead.LastName ?? ""}`.trim();
  if (fullName) return fullName;
  const fallback = String(lead.Name ?? "").trim();
  return fallback || null;
}

async function resolveLead(
  supabase: SupabaseClient,
  clientId: string,
  leadId: number
): Promise<LeadRow | null> {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .eq("client_id", clientId)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as LeadRow;
}

function extractLeadThreadId(lead: LeadRow): string | null {
  const candidates = [
    lead.unipile_chat_id,
    lead.unipile_thread_id,
    lead.chat_id,
    lead.thread_id,
  ];

  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value) return value;
  }
  return null;
}

function extractLeadProviderId(lead: LeadRow): string | null {
  const value = String(lead.linkedin_provider_id ?? "").trim();
  return value || null;
}

function extractLeadLinkedinUrl(lead: LeadRow): string | null {
  const uppercase = String(lead.LinkedInURL ?? "").trim();
  if (uppercase) return uppercase;
  const lowercase = String(lead.linkedin_url ?? "").trim();
  return lowercase || null;
}

async function persistLeadProviderId(params: {
  supabase: SupabaseClient;
  clientId: string;
  leadId: number;
  providerId: string;
}) {
  const { supabase, clientId, leadId, providerId } = params;
  const { error } = await supabase
    .from("leads")
    .update({ linkedin_provider_id: providerId })
    .eq("id", leadId)
    .eq("client_id", clientId);

  return { error };
}

async function persistLeadChatId(params: {
  supabase: SupabaseClient;
  clientId: string;
  leadId: number;
  chatId: string;
}) {
  const { supabase, clientId, leadId, chatId } = params;
  const { error } = await supabase
    .from("leads")
    .update({ unipile_chat_id: chatId })
    .eq("id", leadId)
    .eq("client_id", clientId);

  return { error };
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

function getHttpStatusForSendError(status: string): number {
  if (status === "provider_id_missing") return 400;
  if (status === "conversation_create_failed" || status === "send_failed") return 502;
  return 500;
}

function getErrorCodeForSendStatus(status: string): string {
  if (status === "provider_id_missing") return "MISSING_PROVIDER_ID";
  if (status === "conversation_create_failed") return "UNIPILE_CREATE_CHAT_FAILED";
  if (status === "send_failed") return "UNIPILE_SEND_MESSAGE_FAILED";
  if (status === "thread_upsert_failed") return "INBOX_THREAD_UPSERT_FAILED";
  if (status === "message_persist_failed") return "INBOX_MESSAGE_INSERT_FAILED";
  return "SEND_LINKEDIN_UNKNOWN_ERROR";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error || "unknown_error");
}

function buildErrorResponse(params: {
  status: string;
  httpStatus: number;
  errorCode: string;
  errorMessage: string;
  debug?: unknown;
}) {
  const payload: Record<string, unknown> = {
    success: false,
    ok: false,
    status: params.status,
    error_code: params.errorCode,
    error_message: params.errorMessage,
    error: params.errorMessage,
    message: params.errorMessage,
  };

  if (process.env.NODE_ENV !== "production" && typeof params.debug !== "undefined") {
    payload.debug = params.debug;
  }

  return NextResponse.json(payload, { status: params.httpStatus });
}

export async function POST(req: Request) {
  let currentLockKey: string | null = null;

  try {
    const { userId } = await auth();
    if (!userId) {
      return buildErrorResponse({
        status: "unauthorized",
        httpStatus: 401,
        errorCode: "UNAUTHORIZED",
        errorMessage: "Unauthorized",
      });
    }

    const body = await req.json().catch(() => ({}));
    const leadIdRaw = body?.leadId ?? body?.prospectId;
    const leadId = Number(leadIdRaw);
    const text = String(body?.content ?? body?.text ?? "").trim();

    if (!Number.isFinite(leadId)) {
      return buildErrorResponse({
        status: "invalid_lead_id",
        httpStatus: 400,
        errorCode: "INVALID_LEAD_ID",
        errorMessage: "Prospect invalide.",
      });
    }
    if (!text) {
      return buildErrorResponse({
        status: "empty_content",
        httpStatus: 400,
        errorCode: "EMPTY_LINKEDIN_MESSAGE",
        errorMessage: "Le message LinkedIn est vide.",
      });
    }

    const supabase = createServiceSupabase();
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
        errorMessage: "Envoi déjà en cours.",
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

    const unipileAccountId = await getLinkedinUnipileAccountId(supabase, clientId);
    if (!unipileAccountId) {
      return buildErrorResponse({
        status: "unipile_account_missing",
        httpStatus: 400,
        errorCode: "LINKEDIN_ACCOUNT_NOT_CONNECTED",
        errorMessage: "Aucun compte LinkedIn connecté pour ce client.",
      });
    }

    const leadLinkedinUrl = extractLeadLinkedinUrl(lead);
    const normalizedLeadLinkedInUrl = normalizeLinkedInUrl(leadLinkedinUrl);
    const leadSlug = extractLinkedInProfileSlug(leadLinkedinUrl);
    const existingThread = await findExistingThreadForLead({
      supabase,
      clientId,
      leadId,
      unipileAccountId,
      normalizedLeadLinkedInUrl,
    });

    const leadThreadId = extractLeadThreadId(lead);
    const existingThreadDbId = existingThread?.threadDbId ?? null;
    const existingUnipileThreadId = existingThread?.unipileThreadId ?? leadThreadId;

    let providerId: string | null = extractLeadProviderId(lead);

    if (!providerId) {
      const lookup = await getAcceptedProviderIdForLead({
        supabase,
        leadId,
        clientId,
      });

      console.log({
        step: "provider-lookup",
        leadId,
        clientId,
        invitation_id: lookup.invitationId,
        status: lookup.invitationStatus,
        accepted_at: lookup.invitationAcceptedAt,
        sent_at: lookup.invitationSentAt,
        candidates_count: lookup.candidatesCount,
        matched_by: lookup.matchedBy,
        provider_id: lookup.providerId,
      });

      if (lookup.providerId) {
        providerId = lookup.providerId;
        const providerUpdate = await persistLeadProviderId({
          supabase,
          clientId,
          leadId,
          providerId,
        });

        if (providerUpdate.error) {
          console.error("PROSPECTION_PROVIDER_ID_PERSIST_ERROR", {
            leadId,
            clientId,
            provider_id: providerId,
            error: providerUpdate.error,
          });
          return buildErrorResponse({
            status: "provider_id_persist_failed",
            httpStatus: 500,
            errorCode: "PROVIDER_ID_PERSIST_FAILED",
            errorMessage:
              "Le provider_id a été trouvé mais son enregistrement dans le lead a échoué.",
            debug: providerUpdate.error,
          });
        }
      } else if (!existingUnipileThreadId) {
        return buildErrorResponse({
          status: "provider_id_missing",
          httpStatus: 400,
          errorCode: "MISSING_PROVIDER_ID",
          errorMessage:
            "Invitation pas acceptée ou provider_id absent dans linkedin_invitations.",
          debug: {
            invitation_id: lookup.invitationId,
            status: lookup.invitationStatus,
            accepted_at: lookup.invitationAcceptedAt,
            sent_at: lookup.invitationSentAt,
            raw_keys: lookup.rawKeys,
            acceptance_keys: lookup.acceptanceKeys,
          },
        });
      }
    }

    if (!existingUnipileThreadId) {
      try {
        assertValidLinkedinProviderId(providerId);
      } catch (validationError) {
        return buildErrorResponse({
          status: "provider_id_invalid",
          httpStatus: 400,
          errorCode: "INVALID_PROVIDER_ID",
          errorMessage: getErrorMessage(validationError),
          debug: {
            leadId,
            providerId,
          },
        });
      }
    }

    if (!existingUnipileThreadId && !providerId) {
      return buildErrorResponse({
        status: "provider_id_missing",
        httpStatus: 400,
        errorCode: "MISSING_PROVIDER_ID",
        errorMessage: "Invitation pas acceptée ou provider_id absent dans linkedin_invitations.",
      });
    }

    console.log({
      step: "load-lead",
      leadId,
      normalized_lead_url: normalizedLeadLinkedInUrl,
      slug: leadSlug,
      provider_id: providerId,
      unipile_account_id: unipileAccountId,
    });

    console.log({
      step: "ensure-thread",
      leadId,
      provider_id: providerId,
      unipile_account_id: unipileAccountId,
      chat_id: existingUnipileThreadId ?? null,
    });

    const sendResult = await ensureThreadAndSendMessage({
      supabase,
      clientId,
      leadId,
      text,
      leadLinkedInUrl: leadLinkedinUrl,
      contactName: getDisplayName(lead),
      unipileAccountId,
      providerId,
      existingThreadDbId,
      existingUnipileThreadId,
    });

    if (!sendResult.ok) {
      console.error("PROSPECTION_LINKEDIN_SEND_FAILED", {
        leadId,
        clientId,
        unipile_account_id: unipileAccountId,
        provider_id: sendResult.providerId,
        chat_id: sendResult.unipileThreadId,
        status: sendResult.status,
        details: sendResult.details ?? null,
      });

      return buildErrorResponse({
        status: sendResult.status,
        httpStatus: getHttpStatusForSendError(sendResult.status),
        errorCode: getErrorCodeForSendStatus(sendResult.status),
        errorMessage: sendResult.userMessage,
        debug: sendResult.details ?? null,
      });
    }

    const leadUpdate = await updateLeadSentMetadata(supabase, clientId, leadId);
    const chatPersist = await persistLeadChatId({
      supabase,
      clientId,
      leadId,
      chatId: sendResult.unipileThreadId,
    });
    if (chatPersist.error) {
      console.error("PROSPECTION_CHAT_ID_PERSIST_ERROR", {
        leadId,
        clientId,
        chat_id: sendResult.unipileThreadId,
        error: chatPersist.error,
      });
    }

    console.info("PROSPECTION_LINKEDIN_SEND_SUCCESS", {
      leadId,
      clientId,
      unipile_account_id: unipileAccountId,
      provider_id: sendResult.providerId,
      chat_id: sendResult.unipileThreadId,
      status: "sent",
    });

    return NextResponse.json({
      success: true,
      ok: true,
      status: "sent",
      threadCreated: sendResult.threadCreated,
      thread: {
        id: sendResult.threadDbId,
        unipile_thread_id: sendResult.unipileThreadId,
      },
      message: {
        id: sendResult.unipileMessageId,
        sent_at: sendResult.sentAt,
      },
      lead: {
        message_sent: true,
        message_sent_at: leadUpdate?.message_sent_at ?? sendResult.sentAt,
        next_followup_at: leadUpdate?.next_followup_at ?? null,
      },
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error("SEND_LINKEDIN_ERROR", error);
    const lower = message.toLowerCase();
    const status =
      lower.includes("missing linkedin provider_id") ||
      lower.includes("no linkedin account connected") ||
      lower.includes("provider_id invalide") ||
      lower.includes("provider id invalide") ||
      lower.includes("provider_id manquant")
        ? 400
        : lower.includes("profil linkedin introuvable")
          ? 502
          : 500;

    return buildErrorResponse({
      status: "server_error",
      httpStatus: status,
      errorCode: "SEND_LINKEDIN_SERVER_ERROR",
      errorMessage: message,
      debug: error,
    });
  } finally {
    if (currentLockKey) inFlightSends.delete(currentLockKey);
  }
}
