import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { extractLinkedInProfileSlug, normalizeLinkedInUrl } from "@/lib/linkedin-url";
import {
  createServiceSupabase,
  getClientIdFromClerkUser,
  getLinkedinUnipileAccountId,
} from "@/lib/inbox-server";
import { extractProviderId } from "@/lib/linkedin-messaging";
import { extractArrayCandidates, getFirstString, toJsonObject } from "@/lib/unipile-inbox";

type InvitationRow = {
  id: number | string;
  unipile_account_id?: string | null;
  raw?: unknown;
};

function toNumber(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function extractCandidateIdentity(candidateInput: unknown): {
  normalizedUrl: string | null;
  slug: string | null;
} {
  const candidate = toJsonObject(candidateInput);
  const profileUrl = getFirstString(candidate, [
    ["matching", "normalized_linkedin_url"],
    ["normalized_linkedin_url"],
    ["user_profile_url"],
    ["userProfileUrl"],
    ["profile_url"],
    ["profileUrl"],
    ["linkedin_url"],
    ["linkedinUrl"],
    ["user", "profile_url"],
    ["user", "profileUrl"],
    ["webhook_payload", "user_profile_url"],
    ["webhook_payload", "profile_url"],
    ["webhook_payload", "linkedin_url"],
  ]);
  const normalizedUrl = normalizeLinkedInUrl(profileUrl);

  const slugCandidate = getFirstString(candidate, [
    ["matching", "profile_slug"],
    ["profile_slug"],
    ["profileSlug"],
    ["user_public_identifier"],
    ["userPublicIdentifier"],
    ["public_identifier"],
    ["publicIdentifier"],
    ["webhook_payload", "user_public_identifier"],
    ["webhook_payload", "userPublicIdentifier"],
  ]);

  const slugFromUrl = extractLinkedInProfileSlug(profileUrl);
  const slug =
    slugFromUrl ??
    (slugCandidate
      ? (() => {
          try {
            return decodeURIComponent(slugCandidate).toLowerCase();
          } catch {
            return slugCandidate.toLowerCase();
          }
        })()
      : null);

  return { normalizedUrl, slug };
}

function buildInvitationCandidates(rawInput: unknown): Array<Record<string, unknown>> {
  const raw = toJsonObject(rawInput);
  const candidates = [
    raw,
    toJsonObject(raw.webhook_payload),
    toJsonObject(raw.invitation),
    toJsonObject(toJsonObject(raw.invitation).webhook_payload),
    toJsonObject(raw.acceptance),
    toJsonObject(toJsonObject(raw.acceptance).webhook_payload),
    toJsonObject(raw.relation),
    toJsonObject(toJsonObject(raw.relation).webhook_payload),
    ...extractArrayCandidates(raw),
  ];
  return candidates.filter((candidate) => Object.keys(candidate).length > 0);
}

function scanInvitations(params: {
  invitations: InvitationRow[];
  targetUrl: string | null;
  targetSlug: string | null;
  requireIdentityMatch: boolean;
  scope: "by_lead_and_account" | "by_lead_any_account" | "by_identity_on_account";
}) {
  const { invitations, targetUrl, targetSlug, requireIdentityMatch, scope } = params;
  const hits: Array<{
    scope: string;
    invitation_id: string;
    invitation_account_id: string | null;
    candidate_index: number;
    provider_id: string;
    identity_url: string | null;
    identity_slug: string | null;
    same_url: boolean;
    same_slug: boolean;
  }> = [];

  for (const invitation of invitations) {
    const invitationId = String(invitation.id ?? "").trim();
    const invitationAccountId = String(invitation.unipile_account_id ?? "").trim() || null;
    const candidates = buildInvitationCandidates(invitation.raw);

    for (let idx = 0; idx < candidates.length; idx += 1) {
      const candidate = candidates[idx];
      const identity = extractCandidateIdentity(candidate);
      const sameUrl = Boolean(targetUrl && identity.normalizedUrl && identity.normalizedUrl === targetUrl);
      const sameSlug = Boolean(targetSlug && identity.slug && identity.slug === targetSlug);

      if (requireIdentityMatch && !sameUrl && !sameSlug) continue;

      const providerId = extractProviderId(candidate);
      if (!providerId) continue;

      hits.push({
        scope,
        invitation_id: invitationId,
        invitation_account_id: invitationAccountId,
        candidate_index: idx,
        provider_id: providerId,
        identity_url: identity.normalizedUrl,
        identity_slug: identity.slug,
        same_url: sameUrl,
        same_slug: sameSlug,
      });
    }
  }

  return hits;
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const leadId = toNumber(body?.leadId ?? body?.prospectId);
    if (leadId === null) {
      return NextResponse.json({ ok: false, error: "invalid_lead_id" }, { status: 400 });
    }

    const supabase = createServiceSupabase();
    const clientId = await getClientIdFromClerkUser(supabase, userId);
    if (!clientId) {
      return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });
    }

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, LinkedInURL")
      .eq("id", leadId)
      .eq("client_id", clientId)
      .limit(1)
      .maybeSingle();
    if (leadError || !lead) {
      return NextResponse.json({ ok: false, error: "lead_not_found" }, { status: 404 });
    }

    const leadLinkedInUrl = String(lead.LinkedInURL ?? "").trim() || null;
    const targetUrl = normalizeLinkedInUrl(leadLinkedInUrl);
    const targetSlug = extractLinkedInProfileSlug(leadLinkedInUrl);

    const unipileAccountId = await getLinkedinUnipileAccountId(supabase, clientId);
    if (!unipileAccountId) {
      return NextResponse.json({ ok: false, error: "unipile_account_not_found" }, { status: 400 });
    }

    const strict = await supabase
      .from("linkedin_invitations")
      .select("id, raw, unipile_account_id")
      .eq("client_id", clientId)
      .eq("lead_id", leadId)
      .eq("unipile_account_id", unipileAccountId)
      .order("id", { ascending: false })
      .limit(30);

    const byLeadAny = await supabase
      .from("linkedin_invitations")
      .select("id, raw, unipile_account_id")
      .eq("client_id", clientId)
      .eq("lead_id", leadId)
      .order("id", { ascending: false })
      .limit(30);

    const byIdentityOnAccount = await supabase
      .from("linkedin_invitations")
      .select("id, raw, unipile_account_id")
      .eq("client_id", clientId)
      .eq("unipile_account_id", unipileAccountId)
      .order("id", { ascending: false })
      .limit(200);

    const strictRows = Array.isArray(strict.data) ? (strict.data as InvitationRow[]) : [];
    const anyRows = Array.isArray(byLeadAny.data) ? (byLeadAny.data as InvitationRow[]) : [];
    const identityRows = Array.isArray(byIdentityOnAccount.data)
      ? (byIdentityOnAccount.data as InvitationRow[])
      : [];

    const strictHits = scanInvitations({
      invitations: strictRows,
      targetUrl,
      targetSlug,
      requireIdentityMatch: false,
      scope: "by_lead_and_account",
    });
    const anyHits = scanInvitations({
      invitations: anyRows,
      targetUrl,
      targetSlug,
      requireIdentityMatch: false,
      scope: "by_lead_any_account",
    });
    const identityHits = scanInvitations({
      invitations: identityRows,
      targetUrl,
      targetSlug,
      requireIdentityMatch: true,
      scope: "by_identity_on_account",
    });

    const resolved =
      strictHits[0]?.provider_id ??
      anyHits[0]?.provider_id ??
      identityHits[0]?.provider_id ??
      null;

    return NextResponse.json({
      ok: true,
      target: {
        client_id: clientId,
        lead_id: leadId,
        unipile_account_id: unipileAccountId,
        lead_linkedin_url: leadLinkedInUrl,
        normalized_lead_url: targetUrl,
        lead_slug: targetSlug,
      },
      queries: {
        strict_count: strictRows.length,
        any_lead_count: anyRows.length,
        identity_account_count: identityRows.length,
      },
      hits: {
        strict: strictHits.slice(0, 20),
        any_lead: anyHits.slice(0, 20),
        identity_on_account: identityHits.slice(0, 20),
      },
      resolved_provider_id: resolved,
      errors: {
        strict: strict.error ?? null,
        any_lead: byLeadAny.error ?? null,
        identity_on_account: byIdentityOnAccount.error ?? null,
      },
    });
  } catch (error: unknown) {
    console.error("PROSPECTION_DEBUG_PROVIDER_RESOLUTION_ERROR", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

