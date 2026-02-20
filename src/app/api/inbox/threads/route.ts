import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceSupabase, getClientIdFromClerkUser } from "@/lib/inbox-server";

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

    const threadsWithLeadPresence = threadRows.map((thread) => {
      const leadId = thread?.lead_id;
      const leadExists =
        leadId !== null &&
        leadId !== undefined &&
        existingLeadIdSet.has(String(leadId));

      return {
        ...thread,
        lead_exists: leadExists,
      };
    });

    return NextResponse.json({ threads: threadsWithLeadPresence });
  } catch (error: unknown) {
    console.error("INBOX_THREADS_GET_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
