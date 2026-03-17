import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  createServiceSupabase,
  getClientIdFromClerkUser,
  getLinkedinUnipileAccountId,
} from "@/lib/inbox-server";
import { ensureThreadAndSendMessage } from "@/lib/inbox-send";

export const maxDuration = 300;

type InvitationRow = {
  id: string;
  lead_id: number;
  accepted_at: string | null;
  dm_draft_text: string | null;
};

type LeadRow = {
  id: number;
  linkedin_provider_id: string | null;
  internal_message: string | null;
  message_sent: boolean | null;
};

type SendResult =
  | { ok: true; invitation_id: string; lead_id: number; mode: string }
  | { ok: false; invitation_id: string; lead_id: number; error: string; skipped?: boolean };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  // Fetch ALL accepted invitations (not just ones with dm_draft_text set)
  // We'll fall back to lead.internal_message for those without dm_draft_text
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
      ok: true,
      total: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      results: [],
      message: allPending ? "Aucune connexion acceptée sans message." : "Aucune connexion acceptée aujourd'hui sans message.",
    });
  }

  // Fetch leads for all invitation lead_ids in one query
  const leadIds = [...new Set(invitations.map((inv) => inv.lead_id))];
  const { data: leadsData } = await supabase
    .from("leads")
    .select("id, linkedin_provider_id, internal_message, message_sent")
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

    // Skip leads already marked as message_sent
    if (lead?.message_sent === true) {
      results.push({ ok: false, invitation_id: inv.id, lead_id: inv.lead_id, error: "already_sent", skipped: true });
      continue;
    }

    // Use dm_draft_text from invitation, fallback to lead.internal_message
    const draftText = String(inv.dm_draft_text ?? lead?.internal_message ?? "").trim();

    if (!draftText) {
      results.push({ ok: false, invitation_id: inv.id, lead_id: inv.lead_id, error: "no_message_text", skipped: true });
      continue;
    }

    const providerId = typeof lead?.linkedin_provider_id === "string" ? lead.linkedin_provider_id.trim() : null;

    const sendResult = await ensureThreadAndSendMessage({
      supabase,
      clientId,
      leadId: String(inv.lead_id),
      accountId: unipileAccountId,
      linkedinProviderId: providerId,
      text: draftText,
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

      results.push({ ok: true, invitation_id: inv.id, lead_id: inv.lead_id, mode: sendResult.mode });
    } else {
      const errorMsg = "error" in sendResult ? (sendResult.error ?? "send_failed") : "send_failed";
      await supabase
        .from("linkedin_invitations")
        .update({ last_error: `flush: ${errorMsg}` })
        .eq("id", inv.id)
        .eq("client_id", clientId);

      results.push({ ok: false, invitation_id: inv.id, lead_id: inv.lead_id, error: errorMsg });
    }

    // Wait between sends, except after the last one
    if (i < invitations.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  const sent = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok && !("skipped" in r && r.skipped)).length;
  const skipped = results.filter((r) => "skipped" in r && r.skipped).length;

  return NextResponse.json({
    ok: true,
    total: invitations.length,
    sent,
    failed,
    skipped,
    results,
  });
}
