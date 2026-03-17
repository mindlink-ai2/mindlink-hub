import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  createServiceSupabase,
  getClientIdFromClerkUser,
  getLinkedinUnipileAccountId,
} from "@/lib/inbox-server";
import { ensureThreadAndSendMessage } from "@/lib/inbox-send";

export const maxDuration = 300;

type InvitationDraftRow = {
  id: string;
  lead_id: number;
  unipile_account_id: string;
  dm_draft_text: string;
  accepted_at: string | null;
};

type SendResult =
  | { ok: true; invitation_id: string; lead_id: number; mode: string }
  | { ok: false; invitation_id: string; lead_id: number; error: string };

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

  // Parse optional body params
  const body = await req.json().catch(() => ({}));
  const delayMs = typeof body.delay_ms === "number" ? Math.max(0, body.delay_ms) : 10_000;
  // By default: today only. Pass all_pending=true to process all accepted drafts regardless of date.
  const allPending = body.all_pending === true;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  let query = supabase
    .from("linkedin_invitations")
    .select("id, lead_id, unipile_account_id, dm_draft_text, accepted_at")
    .eq("client_id", clientId)
    .eq("status", "accepted")
    .eq("dm_draft_status", "draft")
    .not("dm_draft_text", "is", null)
    .order("accepted_at", { ascending: true });

  if (!allPending) {
    query = query.gte("accepted_at", todayStart.toISOString());
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ ok: false, error: "query_failed", details: String(error.message) }, { status: 500 });
  }

  const rows = (Array.isArray(data) ? data : []) as InvitationDraftRow[];

  if (rows.length === 0) {
    return NextResponse.json({
      ok: true,
      total: 0,
      sent: 0,
      failed: 0,
      results: [],
      message: allPending ? "Aucun draft en attente." : "Aucun draft en attente pour aujourd'hui.",
    });
  }

  const results: SendResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const inv = rows[i];
    const draftText = String(inv.dm_draft_text ?? "").trim();

    if (!draftText) {
      results.push({ ok: false, invitation_id: inv.id, lead_id: inv.lead_id, error: "draft_text_empty" });
      continue;
    }

    // Fetch provider_id from lead
    const { data: lead } = await supabase
      .from("leads")
      .select("linkedin_provider_id")
      .eq("id", inv.lead_id)
      .eq("client_id", clientId)
      .limit(1)
      .maybeSingle();

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
    if (i < rows.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  const sent = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  return NextResponse.json({
    ok: true,
    total: rows.length,
    sent,
    failed,
    results,
  });
}
