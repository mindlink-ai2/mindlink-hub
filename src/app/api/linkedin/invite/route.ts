import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { extractLinkedInProfileSlug } from "@/lib/linkedin-url";
import { buildInvitationRawPatch, buildInvitationTargetMetadata } from "@/lib/linkedin-invitations";
import { createServiceSupabase, getLinkedinUnipileAccountId } from "@/lib/inbox-server";

type JsonLike = Record<string, unknown> | string | null;

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function normalizeUnipileBase(dsn: string) {
  return dsn.replace(/\/+$/, "").replace(/\/api\/v1\/.*$/, "");
}

async function readResponseBody(res: Response): Promise<JsonLike> {
  const text = await res.text().catch(() => "");
  if (!text) return null;

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return text;
  }
}

function toJsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function extractProviderId(payload: unknown): string {
  const obj = toJsonRecord(payload);
  const data = toJsonRecord(obj.data);

  const direct =
    typeof obj.provider_id === "string" && obj.provider_id.trim()
      ? obj.provider_id.trim()
      : typeof obj.providerId === "string" && obj.providerId.trim()
        ? obj.providerId.trim()
        : "";
  if (direct) return direct;

  if (typeof data.provider_id === "string" && data.provider_id.trim()) {
    return data.provider_id.trim();
  }
  if (typeof data.providerId === "string" && data.providerId.trim()) {
    return data.providerId.trim();
  }

  return "";
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => null);
    const leadId = Number(body?.leadId);

    if (!Number.isFinite(leadId)) {
      return NextResponse.json(
        { success: false, error: "invalid_lead_id" },
        { status: 400 }
      );
    }

    const supabase = createServiceSupabase();

    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id, plan, subscription_status")
      .eq("clerk_user_id", userId)
      .single();

    if (clientErr || !client) {
      return NextResponse.json(
        { success: false, error: "client_not_found" },
        { status: 404 }
      );
    }

    const plan = String(client.plan ?? "").trim().toLowerCase();
    const subscriptionStatus = String(client.subscription_status ?? "")
      .trim()
      .toLowerCase();

    if (plan === "full" && subscriptionStatus === "active") {
      return NextResponse.json(
        { success: false, error: "invitation_managed_automatically" },
        { status: 403 }
      );
    }

    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, client_id, LinkedInURL")
      .eq("id", leadId)
      .eq("client_id", client.id)
      .single();

    if (leadErr || !lead) {
      return NextResponse.json(
        { success: false, error: "lead_not_found" },
        { status: 404 }
      );
    }

    if (!lead.LinkedInURL) {
      return NextResponse.json(
        { success: false, error: "missing_linkedin_url" },
        { status: 400 }
      );
    }

    const profileIdentifier = extractLinkedInProfileSlug(lead.LinkedInURL);
    if (!profileIdentifier) {
      return NextResponse.json(
        { success: false, error: "invalid_linkedin_url" },
        { status: 400 }
      );
    }

    const unipileAccountId = await getLinkedinUnipileAccountId(
      supabase,
      String(client.id)
    );

    if (!unipileAccountId) {
      return NextResponse.json(
        { success: false, error: "linkedin_account_not_connected" },
        { status: 404 }
      );
    }

    const { data: existingInvitations, error: existingInviteErr } = await supabase
      .from("linkedin_invitations")
      .select("id, status")
      .eq("client_id", client.id)
      .eq("lead_id", leadId)
      .in("status", ["queued", "pending", "sent", "accepted", "connected"])
      .limit(1);

    if (existingInviteErr) {
      return NextResponse.json(
        { success: false, error: "invitation_lookup_failed" },
        { status: 500 }
      );
    }

    if ((existingInvitations ?? []).length > 0) {
      const hasAccepted = (existingInvitations ?? []).some(
        (invitation) =>
          ["accepted", "connected"].includes(
            String((invitation as { status?: string | null }).status ?? "").toLowerCase()
          )
      );

      const { error: updateLeadStatusErr } = await supabase
        .from("leads")
        .update({ traite: true })
        .eq("id", lead.id)
        .eq("client_id", client.id);

      if (updateLeadStatusErr) {
        console.error("LINKEDIN_INVITE_STATUS_UPDATE_ERROR:", updateLeadStatusErr);
      }

      return NextResponse.json({
        success: true,
        alreadySent: true,
        invitationStatus: hasAccepted ? "accepted" : "sent",
      });
    }

    const UNIPILE_DSN = requireEnv("UNIPILE_DSN");
    const UNIPILE_API_KEY = requireEnv("UNIPILE_API_KEY");
    const BASE = normalizeUnipileBase(UNIPILE_DSN);
    const profileRes = await fetch(
      `${BASE}/api/v1/users/${encodeURIComponent(
        profileIdentifier
      )}?account_id=${encodeURIComponent(unipileAccountId)}`,
      {
        method: "GET",
        headers: {
          "X-API-KEY": UNIPILE_API_KEY,
          accept: "application/json",
        },
      }
    );

    const profilePayload = await readResponseBody(profileRes);
    if (!profileRes.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "unipile_profile_lookup_failed",
          details: profilePayload,
        },
        { status: 502 }
      );
    }

    const providerId = extractProviderId(profilePayload);

    if (!providerId) {
      return NextResponse.json(
        { success: false, error: "unipile_provider_id_missing" },
        { status: 502 }
      );
    }

    const inviteRes = await fetch(`${BASE}/api/v1/users/invite`, {
      method: "POST",
      headers: {
        "X-API-KEY": UNIPILE_API_KEY,
        accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        account_id: unipileAccountId,
        provider_id: providerId,
      }),
    });

    const invitePayload = await readResponseBody(inviteRes);
    if (!inviteRes.ok) {
      return NextResponse.json(
        { success: false, error: "unipile_invite_failed", details: invitePayload },
        { status: 502 }
      );
    }

    const invitationMetadata = buildInvitationTargetMetadata({
      leadLinkedInUrl: String(lead.LinkedInURL ?? "").trim() || null,
      profileSlug: profileIdentifier,
      providerId,
      invitePayload,
    });
    const rawPatch = buildInvitationRawPatch({
      leadLinkedInUrl: String(lead.LinkedInURL ?? "").trim() || null,
      profileSlug: profileIdentifier,
      providerId,
      invitePayload,
    });

    const { error: invitationInsertErr } = await supabase
      .from("linkedin_invitations")
      .upsert(
        {
          client_id: client.id,
          lead_id: lead.id,
          unipile_account_id: unipileAccountId,
          status: "sent",
          sent_at: new Date().toISOString(),
          raw: rawPatch,
          target_linkedin_provider_id: invitationMetadata.targetProviderId,
          target_profile_slug: invitationMetadata.targetProfileSlug,
          target_linkedin_url_normalized:
            invitationMetadata.targetLinkedInUrlNormalized,
          unipile_invitation_id: invitationMetadata.unipileInvitationId,
        },
        { onConflict: "client_id,lead_id,unipile_account_id" }
      );

    if (invitationInsertErr) {
      return NextResponse.json(
        { success: false, error: "invitation_log_failed" },
        { status: 500 }
      );
    }

    const { error: updateLeadStatusErr } = await supabase
      .from("leads")
      .update({ traite: true })
      .eq("id", lead.id)
      .eq("client_id", client.id);

    if (updateLeadStatusErr) {
      console.error("LINKEDIN_INVITE_STATUS_UPDATE_ERROR:", updateLeadStatusErr);
    }

    console.info("LINKEDIN_INVITE_SENT", {
      client_id: String(client.id),
      lead_id: String(lead.id),
      unipile_account_id: unipileAccountId,
      target_provider_id: invitationMetadata.targetProviderId,
      target_profile_slug: invitationMetadata.targetProfileSlug,
      target_linkedin_url_normalized:
        invitationMetadata.targetLinkedInUrlNormalized,
      unipile_invitation_id: invitationMetadata.unipileInvitationId,
    });

    return NextResponse.json({ success: true, invitationStatus: "sent" });
  } catch (error: unknown) {
    console.error("LINKEDIN_INVITE_ERROR:", error);
    return NextResponse.json(
      { success: false, error: "server_error" },
      { status: 500 }
    );
  }
}
