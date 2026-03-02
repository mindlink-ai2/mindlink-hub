import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceSupabase, getClientIdFromClerkUser } from "@/lib/inbox-server";
import { isFullActivePlan, normalizeClientPlan } from "@/lib/client-plan";

type InvitationRow = {
  id: string | number;
  lead_id: string | number | null;
  status: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  dm_draft_status: string | null;
  dm_sent_at: string | null;
  last_error: string | null;
  unipile_account_id: string | null;
};

type LeadRow = {
  id: string | number;
  FirstName: string | null;
  LastName: string | null;
  Name: string | null;
  Company: string | null;
  LinkedInURL: string | null;
};

function leadDisplayName(lead: LeadRow | undefined): string {
  if (!lead) return "Prospect";
  const first = String(lead.FirstName ?? "").trim();
  const last = String(lead.LastName ?? "").trim();
  const full = `${first} ${last}`.trim();
  if (full) return full;

  const fallback = String(lead.Name ?? "").trim();
  if (fallback) return fallback;
  return "Prospect";
}

function mapEventRow(row: InvitationRow, leadById: Map<string, LeadRow>) {
  const leadId = row.lead_id === null || row.lead_id === undefined ? null : String(row.lead_id);
  const lead = leadId ? leadById.get(leadId) : undefined;

  return {
    invitation_id: String(row.id),
    lead_id: leadId,
    person_name: leadDisplayName(lead),
    company: lead?.Company ?? null,
    linkedin_url: lead?.LinkedInURL ?? null,
    status: String(row.status ?? "").toLowerCase() || null,
    sent_at: row.sent_at,
    accepted_at: row.accepted_at,
    dm_sent_at: row.dm_sent_at,
    dm_draft_status: row.dm_draft_status,
    unipile_account_id: row.unipile_account_id,
    last_error: row.last_error,
  };
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const supabase = createServiceSupabase();
    const clientId = await getClientIdFromClerkUser(supabase, userId);
    if (!clientId) {
      return NextResponse.json({ error: "client_not_found" }, { status: 404 });
    }

    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("plan, subscription_status")
      .eq("id", clientId)
      .limit(1)
      .maybeSingle();

    if (clientErr || !client) {
      return NextResponse.json({ error: "client_not_found" }, { status: 404 });
    }

    const plan = normalizeClientPlan(client.plan);
    const subscriptionStatus = String(client.subscription_status ?? "")
      .trim()
      .toLowerCase();

    if (!isFullActivePlan({ plan, subscriptionStatus })) {
      return NextResponse.json(
        {
          error: "full_active_required",
          plan,
          subscription_status: subscriptionStatus,
        },
        { status: 403 }
      );
    }

    const [sentRes, acceptedRes, dmRes] = await Promise.all([
      supabase
        .from("linkedin_invitations")
        .select(
          "id, lead_id, status, sent_at, accepted_at, dm_draft_status, dm_sent_at, last_error, unipile_account_id"
        )
        .eq("client_id", clientId)
        .in("status", ["queued", "pending", "sent"])
        .order("sent_at", { ascending: false, nullsFirst: false })
        .limit(300),
      supabase
        .from("linkedin_invitations")
        .select(
          "id, lead_id, status, sent_at, accepted_at, dm_draft_status, dm_sent_at, last_error, unipile_account_id"
        )
        .eq("client_id", clientId)
        .in("status", ["accepted", "connected"])
        .order("accepted_at", { ascending: false, nullsFirst: false })
        .limit(300),
      supabase
        .from("linkedin_invitations")
        .select(
          "id, lead_id, status, sent_at, accepted_at, dm_draft_status, dm_sent_at, last_error, unipile_account_id"
        )
        .eq("client_id", clientId)
        .eq("dm_draft_status", "sent")
        .not("dm_sent_at", "is", null)
        .order("dm_sent_at", { ascending: false, nullsFirst: false })
        .limit(300),
    ]);

    if (sentRes.error || acceptedRes.error || dmRes.error) {
      return NextResponse.json({ error: "feed_fetch_failed" }, { status: 500 });
    }

    const sentRows = (sentRes.data ?? []) as InvitationRow[];
    const acceptedRows = (acceptedRes.data ?? []) as InvitationRow[];
    const dmRows = (dmRes.data ?? []) as InvitationRow[];

    const leadIds = Array.from(
      new Set(
        [...sentRows, ...acceptedRows, ...dmRows]
          .map((row) => (row.lead_id === null || row.lead_id === undefined ? null : String(row.lead_id)))
          .filter((value): value is string => Boolean(value))
      )
    );

    const leadById = new Map<string, LeadRow>();
    if (leadIds.length > 0) {
      const { data: leads, error: leadsErr } = await supabase
        .from("leads")
        .select("id, FirstName, LastName, Name, Company, LinkedInURL")
        .eq("client_id", clientId)
        .in("id", leadIds);

      if (!leadsErr) {
        for (const lead of (leads ?? []) as LeadRow[]) {
          leadById.set(String(lead.id), lead);
        }
      }
    }

    const sentInvitations = sentRows.map((row) => mapEventRow(row, leadById));
    const acceptedInvitations = acceptedRows.map((row) => mapEventRow(row, leadById));
    const autoMessagesSent = dmRows.map((row) => mapEventRow(row, leadById));

    return NextResponse.json({
      success: true,
      plan,
      subscription_status: subscriptionStatus,
      stats: {
        sent_invitations: sentInvitations.length,
        accepted_invitations: acceptedInvitations.length,
        auto_messages_sent: autoMessagesSent.length,
      },
      sent_invitations: sentInvitations,
      accepted_invitations: acceptedInvitations,
      auto_messages_sent: autoMessagesSent,
    });
  } catch (error: unknown) {
    console.error("LINKEDIN_AUTOMATION_FEED_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
