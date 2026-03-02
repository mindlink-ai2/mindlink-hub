import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceSupabase, getClientIdFromClerkUser } from "@/lib/inbox-server";
import { sendLinkedinMessageForThread } from "@/lib/inbox-send";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const threadDbId = String(body?.threadDbId ?? "").trim();
    if (!threadDbId) {
      return NextResponse.json({ error: "threadDbId_required" }, { status: 400 });
    }

    const supabase = createServiceSupabase();
    const clientId = await getClientIdFromClerkUser(supabase, userId);
    if (!clientId) {
      return NextResponse.json({ error: "client_not_found" }, { status: 404 });
    }

    const { data: thread, error: threadErr } = await supabase
      .from("inbox_threads")
      .select("id, lead_id, unipile_account_id")
      .eq("id", threadDbId)
      .eq("client_id", clientId)
      .limit(1)
      .maybeSingle();

    if (threadErr || !thread?.id) {
      return NextResponse.json({ error: "thread_not_found" }, { status: 404 });
    }

    const leadId =
      thread.lead_id === null || thread.lead_id === undefined
        ? null
        : String(thread.lead_id);
    if (!leadId) {
      return NextResponse.json({ error: "thread_has_no_lead" }, { status: 400 });
    }

    const { data: invitation, error: invitationErr } = await supabase
      .from("linkedin_invitations")
      .select("id, dm_draft_text, dm_draft_status, unipile_account_id")
      .eq("client_id", clientId)
      .eq("lead_id", leadId)
      .eq("dm_draft_status", "draft")
      .order("accepted_at", { ascending: false, nullsFirst: false })
      .order("sent_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (invitationErr || !invitation?.id) {
      return NextResponse.json({ error: "draft_not_found" }, { status: 404 });
    }

    const expectedAccountId = String(invitation.unipile_account_id ?? "").trim();
    const threadAccountId = String(thread.unipile_account_id ?? "").trim();
    if (expectedAccountId && threadAccountId && expectedAccountId !== threadAccountId) {
      return NextResponse.json({ error: "draft_thread_account_mismatch" }, { status: 409 });
    }

    const draftText = String(invitation.dm_draft_text ?? "").trim();
    if (!draftText) {
      return NextResponse.json({ error: "draft_text_empty" }, { status: 400 });
    }

    const sendResult = await sendLinkedinMessageForThread({
      supabase,
      clientId,
      threadDbId,
      text: draftText,
    });

    if (!sendResult.ok) {
      await supabase
        .from("linkedin_invitations")
        .update({
          last_error: sendResult.error,
        })
        .eq("id", invitation.id)
        .eq("client_id", clientId);

      return NextResponse.json(
        {
          error: sendResult.error,
          details: "details" in sendResult ? sendResult.details : undefined,
        },
        { status: sendResult.status }
      );
    }

    const nowIso = new Date().toISOString();
    await supabase
      .from("linkedin_invitations")
      .update({
        dm_draft_status: "sent",
        dm_sent_at: nowIso,
        last_error: null,
      })
      .eq("id", invitation.id)
      .eq("client_id", clientId);

    await supabase
      .from("leads")
      .update({
        message_sent: true,
        message_sent_at: nowIso,
      })
      .eq("id", leadId)
      .eq("client_id", clientId);

    return NextResponse.json({
      success: true,
      invitation_id: String(invitation.id),
      message: sendResult.message,
    });
  } catch (error: unknown) {
    console.error("INBOX_SEND_DRAFT_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
