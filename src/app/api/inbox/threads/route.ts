import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceSupabase, getClientIdFromClerkUser } from "@/lib/inbox-server";

type PostgrestErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

function isMissingColumnError(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== "object") return false;
  const pgError = error as PostgrestErrorLike;
  if (String(pgError.code ?? "") !== "42703") return false;
  const details = `${pgError.message ?? ""} ${pgError.details ?? ""} ${pgError.hint ?? ""}`
    .toLowerCase();
  return details.includes(columnName.toLowerCase());
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ threads: [] }, { status: 200 });
    }

    const supabase = createServiceSupabase();
    const clientId = await getClientIdFromClerkUser(supabase, userId);
    if (!clientId) {
      return NextResponse.json({ threads: [] }, { status: 200 });
    }

    const { data: threads, error } = await supabase
      .from("inbox_threads")
      .select(
        "id, provider, unipile_account_id, unipile_thread_id, lead_id, lead_linkedin_url, contact_name, contact_linkedin_url, contact_avatar_url, last_message_at, last_message_preview, unread_count, created_at, updated_at"
      )
      .eq("client_id", clientId)
      .order("last_message_at", { ascending: false, nullsFirst: false });

    if (error) {
      return NextResponse.json({ error: "threads_fetch_failed" }, { status: 500 });
    }

    const threadRows = Array.isArray(threads) ? threads : [];
    const leadIds = threadRows
      .map((thread) => thread?.lead_id)
      .filter((leadId) => leadId !== null && leadId !== undefined);

    let existingLeadIdSet = new Set<string>();

    if (leadIds.length > 0) {
      const { data: existingLeads, error: leadsError } = await supabase
        .from("leads")
        .select("id")
        .eq("client_id", clientId)
        .in("id", leadIds);

      if (leadsError) {
        console.error("INBOX_THREADS_LEADS_FETCH_ERROR:", leadsError);
      } else {
        existingLeadIdSet = new Set(
          (existingLeads ?? [])
            .map((lead) => String(lead.id))
            .filter((id) => id !== "")
        );
      }
    }

    const invitationDraftByLeadId = new Map<
      string,
      { invitation_id: string; dm_draft_status: "draft" | "sent"; dm_draft_text: string | null }
    >();

    if (leadIds.length > 0) {
      const { data: invitationDrafts, error: invitationErr } = await supabase
        .from("linkedin_invitations")
        .select("id, lead_id, dm_draft_status, dm_draft_text, accepted_at, dm_sent_at, sent_at")
        .eq("client_id", clientId)
        .in("lead_id", leadIds)
        .in("dm_draft_status", ["draft", "sent"])
        .order("accepted_at", { ascending: false, nullsFirst: false })
        .order("dm_sent_at", { ascending: false, nullsFirst: false })
        .order("sent_at", { ascending: false, nullsFirst: false });

      if (invitationErr) {
        if (
          !isMissingColumnError(invitationErr, "dm_draft_status") &&
          !isMissingColumnError(invitationErr, "dm_draft_text") &&
          !isMissingColumnError(invitationErr, "dm_sent_at")
        ) {
          console.error("INBOX_THREADS_DRAFT_FETCH_ERROR:", invitationErr);
        }
      } else {
        for (const invitation of invitationDrafts ?? []) {
          const leadId = invitation?.lead_id;
          const rawStatus = String(invitation?.dm_draft_status ?? "").toLowerCase();
          if (leadId === null || leadId === undefined) continue;
          if (rawStatus !== "draft" && rawStatus !== "sent") continue;

          const key = String(leadId);
          const existing = invitationDraftByLeadId.get(key);
          if (existing?.dm_draft_status === "draft" && rawStatus !== "draft") continue;
          if (existing) continue;

          invitationDraftByLeadId.set(key, {
            invitation_id: String(invitation?.id ?? ""),
            dm_draft_status: rawStatus,
            dm_draft_text:
              typeof invitation?.dm_draft_text === "string"
                ? invitation.dm_draft_text
                : null,
          });
        }
      }
    }

    const threadsWithLeadPresence = threadRows.map((thread) => {
      const leadId = thread?.lead_id;
      const leadExists =
        leadId !== null &&
        leadId !== undefined &&
        existingLeadIdSet.has(String(leadId));
      const draftMeta =
        leadId !== null && leadId !== undefined
          ? invitationDraftByLeadId.get(String(leadId))
          : undefined;

      return {
        ...thread,
        lead_exists: leadExists,
        dm_draft_invitation_id: draftMeta?.invitation_id ?? null,
        dm_draft_status: draftMeta?.dm_draft_status ?? "none",
        dm_draft_text: draftMeta?.dm_draft_text ?? null,
      };
    });

    return NextResponse.json({ threads: threadsWithLeadPresence });
  } catch (error: unknown) {
    console.error("INBOX_THREADS_GET_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
