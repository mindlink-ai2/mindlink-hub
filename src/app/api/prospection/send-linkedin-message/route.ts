import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeLinkedInUrl } from "@/lib/linkedin-url";
import {
  createServiceSupabase,
  getClientIdFromClerkUser,
  getLinkedinUnipileAccountId,
} from "@/lib/inbox-server";
import {
  ensureThreadAndSendMessage,
  findExistingThreadForLead,
  resolveLinkedinProviderIdForLead,
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
  const candidates = [
    lead.provider_id,
    lead.linkedin_provider_id,
    lead.unipile_provider_id,
  ];

  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value) return value;
  }
  return null;
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
    const text = String(body?.content ?? body?.text ?? "").trim();

    if (!Number.isFinite(leadId)) {
      return NextResponse.json(
        { ok: false, status: "invalid_lead_id", message: "Prospect invalide." },
        { status: 400 }
      );
    }
    if (!text) {
      return NextResponse.json(
        { ok: false, status: "empty_content", message: "Le message LinkedIn est vide." },
        { status: 400 }
      );
    }

    const supabase = createServiceSupabase();
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
          message: "Envoi déjà en cours.",
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

    const normalizedLeadLinkedInUrl = normalizeLinkedInUrl(lead.LinkedInURL);
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
    if (!existingUnipileThreadId && !providerId) {
      const providerResolution = await resolveLinkedinProviderIdForLead({
        supabase,
        clientId,
        leadId,
        unipileAccountId,
        leadLinkedInUrl: lead.LinkedInURL,
      });

      if (!providerResolution.ok) {
        return NextResponse.json(
          {
            ok: false,
            status: providerResolution.status,
            message: providerResolution.userMessage,
          },
          { status: providerResolution.status === "provider_id_missing" ? 400 : 502 }
        );
      }

      providerId = providerResolution.providerId;
    }

    console.info("PROSPECTION_LINKEDIN_SEND_START", {
      leadId,
      clientId,
      unipile_account_id: unipileAccountId,
      provider_id: providerId,
      chat_id: existingUnipileThreadId ?? null,
      status: "start",
    });

    const sendResult = await ensureThreadAndSendMessage({
      supabase,
      clientId,
      leadId,
      text,
      leadLinkedInUrl: lead.LinkedInURL,
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

      return NextResponse.json(
        {
          ok: false,
          status: sendResult.status,
          message: sendResult.userMessage,
        },
        { status: getHttpStatusForSendError(sendResult.status) }
      );
    }

    const leadUpdate = await updateLeadSentMetadata(supabase, clientId, leadId);

    console.info("PROSPECTION_LINKEDIN_SEND_SUCCESS", {
      leadId,
      clientId,
      unipile_account_id: unipileAccountId,
      provider_id: sendResult.providerId,
      chat_id: sendResult.unipileThreadId,
      status: "sent",
    });

    return NextResponse.json({
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
    console.error("PROSPECTION_SEND_LINKEDIN_MESSAGE_ERROR", error);
    return NextResponse.json(
      { ok: false, status: "server_error", message: "Erreur serveur pendant l’envoi." },
      { status: 500 }
    );
  } finally {
    if (currentLockKey) inFlightSends.delete(currentLockKey);
  }
}
