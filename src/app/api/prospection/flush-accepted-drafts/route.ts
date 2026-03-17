import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { normalizeLinkedInUrl } from "@/lib/linkedin-url";
import {
  createServiceSupabase,
  getClientIdFromClerkUser,
  getLinkedinUnipileAccountId,
} from "@/lib/inbox-server";
import {
  ensureThreadAndSendMessage,
  getAcceptedProviderIdForLead,
  findExistingThreadForLead,
} from "@/lib/linkedin-messaging";

export const maxDuration = 300;

type InvitationRow = {
  id: string;
  lead_id: number;
  accepted_at: string | null;
  dm_draft_text: string | null;
};

type LeadRow = {
  id: number;
  LinkedInURL: string | null;
  linkedin_url: string | null;
  linkedin_provider_id: string | null;
  internal_message: string | null;
  message_sent: boolean | null;
  FirstName: string | null;
  LastName: string | null;
  Name: string | null;
  unipile_chat_id: string | null;
  unipile_thread_id: string | null;
  [key: string]: unknown;
};

type SendResult =
  | { ok: true; invitation_id: string; lead_id: number; mode: string }
  | { ok: false; invitation_id: string; lead_id: number; error: string; details?: unknown; skipped?: boolean };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getLeadLinkedInUrl(lead: LeadRow): string | null {
  const upper = String(lead.LinkedInURL ?? "").trim();
  if (upper) return upper;
  const lower = String(lead.linkedin_url ?? "").trim();
  return lower || null;
}

function getLeadProviderId(lead: LeadRow): string | null {
  return String(lead.linkedin_provider_id ?? "").trim() || null;
}

function getDisplayName(lead: LeadRow): string | null {
  const full = `${lead.FirstName ?? ""} ${lead.LastName ?? ""}`.trim();
  if (full) return full;
  return String(lead.Name ?? "").trim() || null;
}

function getLeadThreadId(lead: LeadRow): string | null {
  return String(lead.unipile_chat_id ?? lead.unipile_thread_id ?? "").trim() || null;
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceSupabase();
  const clientId = await getClientIdFromClerkUser(supabase, userId);
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 403 });
  }

  const unipileAccountId = await getLinkedinUnipileAccountId(supabase, clientId);
  if (!unipileAccountId) {
    return NextResponse.json({ ok: false, error: "linkedin_account_not_found" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const delayMs = typeof body.delay_ms === "number" ? Math.max(0, body.delay_ms) : 10_000;
  const allPending = body.all_pending === true;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  let query = supabase
    .from("linkedin_invitations")
    .select("id, lead_id, accepted_at, dm_draft_text")
    .eq("client_id", clientId)
    .eq("status", "accepted")
    .not("dm_draft_status", "eq", "sent")
    .order("accepted_at", { ascending: true });

  if (!allPending) {
    query = query.gte("accepted_at", todayStart.toISOString());
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: "query_failed", details: String(error.message) }, { status: 500 });
  }

  const invitations = (Array.isArray(data) ? data : []) as InvitationRow[];
  if (invitations.length === 0) {
    return NextResponse.json({
      ok: true, total: 0, sent: 0, failed: 0, skipped: 0, results: [],
      message: allPending ? "Aucune connexion acceptée sans message." : "Aucune connexion acceptée aujourd'hui sans message.",
    });
  }

  // Fetch all leads in one query
  const leadIds = [...new Set(invitations.map((inv) => inv.lead_id))];
  const { data: leadsData } = await supabase
    .from("leads")
    .select("*")
    .eq("client_id", clientId)
    .in("id", leadIds);

  const leadsMap = new Map<number, LeadRow>();
  for (const lead of (Array.isArray(leadsData) ? leadsData : []) as LeadRow[]) {
    leadsMap.set(lead.id, lead);
  }

  const results: SendResult[] = [];

  for (let i = 0; i < invitations.length; i++) {
    const inv = invitations[i];
    const lead = leadsMap.get(inv.lead_id);

    if (lead?.message_sent === true) {
      results.push({ ok: false, invitation_id: inv.id, lead_id: inv.lead_id, error: "already_sent", skipped: true });
      continue;
    }

    const draftText = String(inv.dm_draft_text ?? lead?.internal_message ?? "").trim();
    if (!draftText) {
      results.push({ ok: false, invitation_id: inv.id, lead_id: inv.lead_id, error: "no_message_text", skipped: true });
      continue;
    }

    if (!lead) {
      results.push({ ok: false, invitation_id: inv.id, lead_id: inv.lead_id, error: "lead_not_found", skipped: true });
      continue;
    }

    // Exact same logic as the manual send button
    const leadLinkedinUrl = getLeadLinkedInUrl(lead);
    const normalizedLeadLinkedInUrl = normalizeLinkedInUrl(leadLinkedinUrl);

    const existingThread = await findExistingThreadForLead({
      supabase,
      clientId,
      leadId: inv.lead_id,
      unipileAccountId,
      normalizedLeadLinkedInUrl,
    });

    const existingThreadDbId = existingThread?.threadDbId ?? null;
    const existingUnipileThreadId = existingThread?.unipileThreadId ?? getLeadThreadId(lead);

    let providerId = getLeadProviderId(lead);

    if (!providerId) {
      const lookup = await getAcceptedProviderIdForLead({
        supabase,
        leadId: inv.lead_id,
        clientId,
      });
      if (lookup.providerId) {
        providerId = lookup.providerId;
        // Persist it on the lead like the manual button does
        await supabase
          .from("leads")
          .update({ linkedin_provider_id: providerId })
          .eq("id", inv.lead_id)
          .eq("client_id", clientId);
      }
    }

    if (!providerId && !existingUnipileThreadId) {
      results.push({ ok: false, invitation_id: inv.id, lead_id: inv.lead_id, error: "provider_id_missing", skipped: true });
      continue;
    }

    const sendResult = await ensureThreadAndSendMessage({
      supabase,
      clientId,
      leadId: inv.lead_id,
      text: draftText,
      leadLinkedInUrl: leadLinkedinUrl,
      contactName: getDisplayName(lead),
      unipileAccountId,
      providerId,
      existingThreadDbId,
      existingUnipileThreadId,
    });

    const nowIso = new Date().toISOString();

    if (sendResult.ok) {
      await supabase
        .from("linkedin_invitations")
        .update({ dm_draft_status: "sent", dm_sent_at: nowIso, last_error: null })
        .eq("id", inv.id)
        .eq("client_id", clientId);

      await supabase
        .from("leads")
        .update({ message_sent: true, message_sent_at: nowIso })
        .eq("id", inv.lead_id)
        .eq("client_id", clientId);

      results.push({ ok: true, invitation_id: inv.id, lead_id: inv.lead_id, mode: sendResult.threadCreated ? "created_thread" : "existing_thread" });
    } else {
      await supabase
        .from("linkedin_invitations")
        .update({ last_error: `flush: ${sendResult.status}` })
        .eq("id", inv.id)
        .eq("client_id", clientId);

      results.push({
        ok: false,
        invitation_id: inv.id,
        lead_id: inv.lead_id,
        error: sendResult.status,
        details: sendResult.details ?? null,
      });
    }

    if (i < invitations.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  const sent = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok && !("skipped" in r && r.skipped)).length;
  const skipped = results.filter((r) => "skipped" in r && r.skipped).length;

  return NextResponse.json({ ok: true, total: invitations.length, sent, failed, skipped, results });
}
