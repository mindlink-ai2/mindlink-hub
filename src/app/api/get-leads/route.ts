import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_PAGE_SIZE = 1000;

type LeadRow = Record<string, unknown> & {
  id?: number | string | null;
};

type InvitationRow = {
  id?: number | string | null;
  lead_id?: number | string | null;
  status?: string | null;
};

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ leads: [] });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("clerk_user_id", userId)
    .single();

  if (!client) return NextResponse.json({ leads: [] });

  const clientId = client.id;

  async function fetchAllLeadsForClient(selectFields: string): Promise<LeadRow[]> {
    const rows: LeadRow[] = [];
    let from = 0;

    while (true) {
      const to = from + SUPABASE_PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from("leads")
        .select(selectFields)
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      const batch: LeadRow[] = Array.isArray(data) ? (data as unknown as LeadRow[]) : [];
      rows.push(...batch);

      if (batch.length < SUPABASE_PAGE_SIZE) break;
      from += SUPABASE_PAGE_SIZE;
    }

    return rows;
  }

  async function fetchAllInvitationsForClient(): Promise<InvitationRow[]> {
    const rows: InvitationRow[] = [];
    let from = 0;

    while (true) {
      const to = from + SUPABASE_PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from("linkedin_invitations")
        .select("id, lead_id, status")
        .eq("client_id", clientId)
        .in("status", ["sent", "accepted", "connected"])
        .order("id", { ascending: true })
        .range(from, to);

      if (error) throw error;

      const batch: InvitationRow[] = Array.isArray(data)
        ? (data as unknown as InvitationRow[])
        : [];
      rows.push(...batch);

      if (batch.length < SUPABASE_PAGE_SIZE) break;
      from += SUPABASE_PAGE_SIZE;
    }

    return rows;
  }

  const plan = (client.plan ?? "").toLowerCase();
  const is_premium = plan === "premium";

  const email_option = Boolean(client.email_option);
  const phone_option = Boolean(client.phone_option);

  const baseSelect = `
      id,
      Name,
      FirstName,
      LastName,
      Company,
      linkedinJobTitle,
      LinkedInURL,
      location,
      created_at,
      traite,
      internal_message,
      message_mail,
      message_sent,
      message_sent_at,
      next_followup_at
  `;

  const selectFields =
    baseSelect +
    (email_option ? `, email` : ``) +
    (phone_option ? `, phone` : ``);

  let leadRows: LeadRow[] = [];
  try {
    leadRows = await fetchAllLeadsForClient(selectFields);
  } catch (leadsErr) {
    console.error("Failed to load leads:", leadsErr);
    return NextResponse.json({ error: "Failed to load leads" }, { status: 500 });
  }

  const leadIds = leadRows
    .map((lead) => lead?.id)
    .filter((id) => id !== null && id !== undefined);
  const leadIdSet = new Set(leadIds.map((id) => String(id)));

  const invitationStatusByLead = new Map<string, "sent" | "accepted">();

  if (leadIds.length > 0) {
    try {
      const invitationRows = await fetchAllInvitationsForClient();

      invitationRows.forEach((invitation) => {
        const leadId = invitation?.lead_id;
        if (leadId === null || leadId === undefined) return;

        const key = String(leadId);
        if (!leadIdSet.has(key)) return;

        const normalizedStatus = String(invitation?.status ?? "")
          .trim()
          .toLowerCase();
        if (
          normalizedStatus !== "sent" &&
          normalizedStatus !== "accepted" &&
          normalizedStatus !== "connected"
        ) {
          return;
        }

        const mappedStatus = normalizedStatus === "connected" ? "accepted" : normalizedStatus;

        const current = invitationStatusByLead.get(key);
        if (mappedStatus === "accepted" || !current) {
          invitationStatusByLead.set(key, mappedStatus as "sent" | "accepted");
        }
      });
    } catch (invitationsErr) {
      console.error("Failed to load linkedin invitations:", invitationsErr);
    }
  }

  const leadsWithInvitationState = leadRows.map((lead) => ({
    ...lead,
    linkedin_invitation_status: invitationStatusByLead.get(String(lead.id)) ?? null,
    linkedin_invitation_sent: invitationStatusByLead.has(String(lead.id)),
  }));

  return NextResponse.json({
    leads: leadsWithInvitationState,
    client: {
      plan,
      is_premium,
      email_option,
      phone_option,
    },
  });
}
