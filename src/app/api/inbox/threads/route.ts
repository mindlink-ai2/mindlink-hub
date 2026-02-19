import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceSupabase, getClientIdFromClerkUser } from "@/lib/inbox-server";

type InvitationStatus = "pending" | "connected";

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

    const threadRows = Array.isArray(threads)
      ? (threads as Array<Record<string, unknown>>)
      : [];
    const leadIds = threadRows
      .map((thread) =>
        thread && typeof thread === "object" && "lead_id" in thread
          ? (thread as Record<string, unknown>).lead_id
          : null
      )
      .filter((leadId) => leadId !== null && leadId !== undefined);

    const invitationStatusByLead = new Map<string, InvitationStatus>();

    if (leadIds.length > 0) {
      const { data: invitations, error: invitationsErr } = await supabase
        .from("linkedin_invitations")
        .select("lead_id, status")
        .eq("client_id", clientId)
        .in("lead_id", leadIds)
        .in("status", ["pending", "sent", "accepted", "connected"]);

      if (invitationsErr) {
        console.error("INBOX_THREADS_INVITATIONS_FETCH_ERROR:", invitationsErr);
      } else {
        const invitationRows = Array.isArray(invitations)
          ? (invitations as Array<Record<string, unknown>>)
          : [];

        invitationRows.forEach((invitation) => {
          const leadId =
            invitation && typeof invitation === "object" && "lead_id" in invitation
              ? (invitation as Record<string, unknown>).lead_id
              : null;
          if (leadId === null || leadId === undefined) return;

          const rawStatus =
            invitation && typeof invitation === "object" && "status" in invitation
              ? String((invitation as Record<string, unknown>).status ?? "")
              : "";
          const normalized = rawStatus.trim().toLowerCase();

          let mappedStatus: InvitationStatus | null = null;
          if (normalized === "connected" || normalized === "accepted") {
            mappedStatus = "connected";
          } else if (normalized === "pending" || normalized === "sent") {
            mappedStatus = "pending";
          }
          if (!mappedStatus) return;

          const key = String(leadId);
          const current = invitationStatusByLead.get(key);
          if (mappedStatus === "connected" || !current) {
            invitationStatusByLead.set(key, mappedStatus);
          }
        });
      }
    }

    const threadsWithStatus = threadRows.map((thread) => {
      const leadId =
        thread && typeof thread === "object" && "lead_id" in thread
          ? (thread as Record<string, unknown>).lead_id
          : null;
      const connectionStatus =
        leadId === null || leadId === undefined
          ? null
          : (invitationStatusByLead.get(String(leadId)) ?? null);

      return {
        ...thread,
        connection_status: connectionStatus,
      };
    });

    return NextResponse.json({ threads: threadsWithStatus });
  } catch (error: unknown) {
    console.error("INBOX_THREADS_GET_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
