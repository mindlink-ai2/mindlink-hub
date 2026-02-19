import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

type LeadRow = Record<string, unknown> & {
  id?: number | string | null;
};

type InvitationRow = {
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

  // ✅ plan
  const plan = (client.plan ?? "").toLowerCase();
  const is_premium = plan === "premium";

  // ✅ options (fallback false if null/undefined)
  const email_option = Boolean(client.email_option);
  const phone_option = Boolean(client.phone_option);

  // ✅ Build select list safely (don’t leak fields if not paid)
  const baseSelect = `
      id,
      Name,
      FirstName,
      LastName,
      Company,
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

  const { data: leads } = await supabase
    .from("leads")
    .select(selectFields)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  const leadRows: LeadRow[] = Array.isArray(leads)
    ? (leads as unknown as LeadRow[])
    : [];
  const leadIds = leadRows
    .map((lead) => lead?.id)
    .filter((id) => id !== null && id !== undefined);

  const invitationStatusByLead = new Map<string, "sent" | "accepted">();

  if (leadIds.length > 0) {
    const { data: invitations, error: invitationsErr } = await supabase
      .from("linkedin_invitations")
      .select("lead_id, status")
      .eq("client_id", clientId)
      .in("lead_id", leadIds)
      .in("status", ["sent", "accepted"]);

    if (invitationsErr) {
      console.error("Failed to load linkedin invitations:", invitationsErr);
    } else {
      const invitationRows: InvitationRow[] = Array.isArray(invitations)
        ? (invitations as unknown as InvitationRow[])
        : [];

      invitationRows.forEach((invitation) => {
        const leadId = invitation?.lead_id;
        if (leadId === null || leadId === undefined) return;

        const normalizedStatus = String(invitation?.status ?? "")
          .trim()
          .toLowerCase();
        if (normalizedStatus !== "sent" && normalizedStatus !== "accepted") return;

        const key = String(leadId);
        const current = invitationStatusByLead.get(key);
        if (normalizedStatus === "accepted" || !current) {
          invitationStatusByLead.set(key, normalizedStatus as "sent" | "accepted");
        }
      });
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
