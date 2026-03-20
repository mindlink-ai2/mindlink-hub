import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  extractLinkedInProfileSlug,
  extractLinkedInProfileSlugForMatching,
  normalizeLinkedInUrl,
  normalizeLinkedInUrlForMatching,
  normalizeTextForComparison,
} from "@/lib/linkedin-url";
import { getFirstString, toJsonObject, type JsonObject } from "@/lib/unipile-inbox";

type PostgrestErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

type LeadIdentityRow = {
  id: number | string;
  LinkedInURL?: string | null;
  linkedin_url?: string | null;
};

type InvitationMatchRow = {
  id: number | string;
  client_id?: number | string | null;
  lead_id?: number | string | null;
  unipile_account_id?: string | null;
  status?: string | null;
  sent_at?: string | null;
  accepted_at?: string | null;
  raw?: unknown;
  target_linkedin_provider_id?: string | null;
  target_profile_slug?: string | null;
  target_linkedin_url_normalized?: string | null;
  unipile_invitation_id?: string | null;
};

export type InvitationTargetMetadata = {
  targetProviderId: string | null;
  targetProfileSlug: string | null;
  targetLinkedInUrlNormalized: string | null;
  unipileInvitationId: string | null;
};

export type AcceptedRelationIdentity = {
  providerId: string | null;
  profileSlug: string | null;
  normalizedLinkedInUrl: string | null;
  unipileInvitationId: string | null;
};

export type AcceptedInvitationMatchResult =
  | {
      ok: true;
      invitationId: string;
      leadId: string;
      clientId: string | null;
      unipileAccountId: string | null;
      status: string | null;
      matchedBy:
        | "unipile_invitation_id"
        | "target_provider_id"
        | "target_linkedin_url_normalized"
        | "target_profile_slug"
        | "lead_identity";
      candidatesCount: number;
      identity: AcceptedRelationIdentity;
    }
  | {
      ok: false;
      status: "unmatched" | "ambiguous";
      reason:
        | "missing_account"
        | "missing_identity"
        | "multiple_invitations"
        | "multiple_leads"
        | "identity_conflict"
        | "lookup_failed"
        | "no_matching_invitation";
      matchedBy:
        | "unipile_invitation_id"
        | "target_provider_id"
        | "target_linkedin_url_normalized"
        | "target_profile_slug"
        | "lead_identity"
        | null;
      candidatesCount: number;
      identity: AcceptedRelationIdentity;
      details?: unknown;
    };

function isMissingColumnError(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== "object") return false;
  const pgError = error as PostgrestErrorLike;
  if (String(pgError.code ?? "") !== "42703") return false;
  const details = `${pgError.message ?? ""} ${pgError.details ?? ""} ${pgError.hint ?? ""}`.toLowerCase();
  return details.includes(columnName.toLowerCase());
}

function parseInvitationRows(data: unknown): InvitationMatchRow[] {
  if (!Array.isArray(data)) return [];

  return data
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .map((item) => item as InvitationMatchRow)
    .filter((row) => typeof row.id === "string" || typeof row.id === "number");
}

function normalizeSlug(value: string | null | undefined): string | null {
  return normalizeTextForComparison(value);
}

function normalizeInvitationId(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  return raw || null;
}

function normalizeProviderId(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return raw.startsWith("ACoA") ? raw : null;
}

function extractRawTargetMetadata(rawInput: unknown): InvitationTargetMetadata {
  const raw = toJsonObject(rawInput);
  const invitation = toJsonObject(raw.invitation);
  const acceptance = toJsonObject(raw.acceptance);

  return {
    targetProviderId:
      normalizeProviderId(
        getFirstString(raw, [
          ["target_linkedin_provider_id"],
          ["provider_id"],
          ["invite_response", "provider_id"],
        ]) ??
          getFirstString(invitation, [
            ["target_linkedin_provider_id"],
            ["provider_id"],
            ["invite_response", "provider_id"],
          ]) ??
          getFirstString(acceptance, [
            ["target_linkedin_provider_id"],
            ["provider_id"],
            ["webhook_payload", "user_provider_id"],
          ])
      ) ?? null,
    targetProfileSlug:
      normalizeSlug(
        getFirstString(raw, [
          ["target_profile_slug"],
          ["profile_slug"],
          ["matching", "profile_slug"],
        ]) ??
          getFirstString(invitation, [
            ["target_profile_slug"],
            ["profile_slug"],
            ["matching", "profile_slug"],
          ]) ??
          getFirstString(acceptance, [
            ["target_profile_slug"],
            ["matching", "profile_slug"],
          ])
      ) ?? null,
    targetLinkedInUrlNormalized:
      normalizeLinkedInUrlForMatching(
        getFirstString(raw, [
          ["target_linkedin_url_normalized"],
          ["normalized_linkedin_url"],
          ["matching", "normalized_linkedin_url"],
        ]) ??
          getFirstString(invitation, [
            ["target_linkedin_url_normalized"],
            ["normalized_linkedin_url"],
            ["matching", "normalized_linkedin_url"],
          ]) ??
          getFirstString(acceptance, [
            ["target_linkedin_url_normalized"],
            ["matching", "normalized_linkedin_url"],
          ])
      ) ?? null,
    unipileInvitationId:
      normalizeInvitationId(
        getFirstString(raw, [
          ["unipile_invitation_id"],
          ["invitation_id"],
          ["invite_response", "invitation_id"],
        ]) ??
          getFirstString(invitation, [
            ["unipile_invitation_id"],
            ["invitation_id"],
            ["invite_response", "invitation_id"],
          ])
      ) ?? null,
  };
}

function getInvitationTargetMetadata(row: InvitationMatchRow): InvitationTargetMetadata {
  const rawMetadata = extractRawTargetMetadata(row.raw);

  return {
    targetProviderId:
      normalizeProviderId(String(row.target_linkedin_provider_id ?? "").trim()) ??
      rawMetadata.targetProviderId,
    targetProfileSlug:
      normalizeSlug(String(row.target_profile_slug ?? "").trim()) ?? rawMetadata.targetProfileSlug,
    targetLinkedInUrlNormalized:
      normalizeLinkedInUrlForMatching(String(row.target_linkedin_url_normalized ?? "").trim()) ??
      rawMetadata.targetLinkedInUrlNormalized,
    unipileInvitationId:
      normalizeInvitationId(String(row.unipile_invitation_id ?? "").trim()) ??
      rawMetadata.unipileInvitationId,
  };
}

function buildLeadLinkedInUrl(lead: LeadIdentityRow): string | null {
  const upper = String(lead.LinkedInURL ?? "").trim();
  if (upper) return upper;
  const lower = String(lead.linkedin_url ?? "").trim();
  return lower || null;
}

function isIdentityCompatible(
  row: InvitationMatchRow,
  identity: AcceptedRelationIdentity
): boolean {
  const stored = getInvitationTargetMetadata(row);

  if (
    identity.unipileInvitationId &&
    stored.unipileInvitationId &&
    identity.unipileInvitationId !== stored.unipileInvitationId
  ) {
    return false;
  }

  if (identity.providerId && stored.targetProviderId && identity.providerId !== stored.targetProviderId) {
    return false;
  }

  if (
    identity.normalizedLinkedInUrl &&
    stored.targetLinkedInUrlNormalized &&
    identity.normalizedLinkedInUrl !== stored.targetLinkedInUrlNormalized
  ) {
    return false;
  }

  if (identity.profileSlug && stored.targetProfileSlug && identity.profileSlug !== stored.targetProfileSlug) {
    return false;
  }

  return true;
}

function extractFirstProviderId(payload: JsonObject): string | null {
  return (
    normalizeProviderId(
      getFirstString(payload, [
        ["user_provider_id"],
        ["userProviderId"],
        ["provider_id"],
        ["providerId"],
        ["recipient_provider_id"],
        ["recipientProviderId"],
        ["contact", "provider_id"],
        ["contact", "providerId"],
        ["user", "provider_id"],
        ["user", "providerId"],
        ["relation", "provider_id"],
        ["relation", "providerId"],
        ["counterpart", "provider_id"],
        ["counterpart", "providerId"],
        ["data", "user_provider_id"],
        ["data", "userProviderId"],
        ["data", "provider_id"],
        ["data", "providerId"],
        ["data", "user", "provider_id"],
        ["data", "user", "providerId"],
      ])
    ) ?? null
  );
}

function extractFirstInvitationId(payload: JsonObject): string | null {
  return (
    normalizeInvitationId(
      getFirstString(payload, [
        ["invitation_id"],
        ["invitationId"],
        ["invite_response", "invitation_id"],
        ["inviteResponse", "invitationId"],
        ["data", "invitation_id"],
        ["data", "invitationId"],
        ["relation", "invitation_id"],
        ["relation", "invitationId"],
      ])
    ) ?? null
  );
}

export function buildInvitationTargetMetadata(params: {
  leadLinkedInUrl: string | null;
  profileSlug?: string | null;
  providerId?: string | null;
  invitePayload?: unknown;
}): InvitationTargetMetadata {
  const leadLinkedInUrl = normalizeLinkedInUrl(params.leadLinkedInUrl);
  const normalizedUrl = normalizeLinkedInUrlForMatching(leadLinkedInUrl);
  const fallbackSlug =
    normalizeSlug(params.profileSlug ?? null) ??
    extractLinkedInProfileSlugForMatching(leadLinkedInUrl) ??
    null;
  const invitePayload = toJsonObject(params.invitePayload);

  return {
    targetProviderId:
      normalizeProviderId(params.providerId ?? null) ??
      normalizeProviderId(
        getFirstString(invitePayload, [
          ["provider_id"],
          ["providerId"],
        ])
      ) ??
      null,
    targetProfileSlug: fallbackSlug,
    targetLinkedInUrlNormalized: normalizedUrl,
    unipileInvitationId: extractFirstInvitationId(invitePayload),
  };
}

export function buildInvitationRawPatch(params: {
  leadLinkedInUrl: string | null;
  profileSlug?: string | null;
  providerId?: string | null;
  invitePayload?: unknown;
}): Record<string, unknown> {
  const metadata = buildInvitationTargetMetadata(params);

  return {
    provider_id: metadata.targetProviderId,
    profile_slug: metadata.targetProfileSlug,
    normalized_linkedin_url: metadata.targetLinkedInUrlNormalized,
    unipile_invitation_id: metadata.unipileInvitationId,
    invite_response: params.invitePayload ?? null,
  };
}

export function extractAcceptedRelationIdentity(payloadInput: unknown): AcceptedRelationIdentity {
  const payload = toJsonObject(payloadInput);
  const profileUrl =
    normalizeLinkedInUrl(
      getFirstString(payload, [
        ["user_profile_url"],
        ["userProfileUrl"],
        ["profile_url"],
        ["profileUrl"],
        ["linkedin_url"],
        ["linkedinUrl"],
        ["contact", "profile_url"],
        ["contact", "profileUrl"],
        ["contact", "linkedin_url"],
        ["contact", "linkedinUrl"],
        ["user", "profile_url"],
        ["user", "profileUrl"],
        ["user", "linkedin_url"],
        ["user", "linkedinUrl"],
        ["relation", "profile_url"],
        ["relation", "profileUrl"],
        ["relation", "linkedin_url"],
        ["relation", "linkedinUrl"],
        ["data", "user_profile_url"],
        ["data", "userProfileUrl"],
        ["data", "profile_url"],
        ["data", "profileUrl"],
        ["data", "linkedin_url"],
        ["data", "linkedinUrl"],
      ])
    ) ?? null;

  const publicIdentifier =
    normalizeSlug(
      getFirstString(payload, [
        ["user_public_identifier"],
        ["userPublicIdentifier"],
        ["public_identifier"],
        ["publicIdentifier"],
        ["contact", "public_identifier"],
        ["contact", "publicIdentifier"],
        ["relation", "public_identifier"],
        ["relation", "publicIdentifier"],
        ["data", "user_public_identifier"],
        ["data", "userPublicIdentifier"],
        ["data", "public_identifier"],
        ["data", "publicIdentifier"],
      ])
    ) ?? null;

  return {
    providerId: extractFirstProviderId(payload),
    profileSlug: publicIdentifier ?? extractLinkedInProfileSlugForMatching(profileUrl) ?? null,
    normalizedLinkedInUrl: normalizeLinkedInUrlForMatching(profileUrl),
    unipileInvitationId: extractFirstInvitationId(payload),
  };
}

async function queryInvitationsByField(params: {
  supabase: SupabaseClient;
  clientId: string;
  unipileAccountId: string;
  field:
    | "unipile_invitation_id"
    | "target_linkedin_provider_id"
    | "target_linkedin_url_normalized"
    | "target_profile_slug";
  value: string;
}): Promise<{ rows: InvitationMatchRow[]; missingColumn: boolean; error: unknown | null }> {
  const { supabase, clientId, unipileAccountId, field, value } = params;
  const selectFields =
    "id, client_id, lead_id, unipile_account_id, status, sent_at, accepted_at, raw, " +
    "target_linkedin_provider_id, target_profile_slug, target_linkedin_url_normalized, unipile_invitation_id";

  const { data, error } = await supabase
    .from("linkedin_invitations")
    .select(selectFields)
    .eq("client_id", clientId)
    .eq("unipile_account_id", unipileAccountId)
    .eq(field, value)
    .in("status", ["queued", "pending", "sent", "accepted", "connected"])
    .order("accepted_at", { ascending: false, nullsFirst: false })
    .order("sent_at", { ascending: false, nullsFirst: false })
    .limit(3);

  if (error) {
    return {
      rows: [],
      missingColumn: isMissingColumnError(error, field),
      error,
    };
  }

  return {
    rows: parseInvitationRows(data),
    missingColumn: false,
    error: null,
  };
}

async function queryInvitationsForLead(params: {
  supabase: SupabaseClient;
  clientId: string;
  unipileAccountId: string;
  leadId: string;
}): Promise<{ rows: InvitationMatchRow[]; error: unknown | null }> {
  const { supabase, clientId, unipileAccountId, leadId } = params;
  const selectFields =
    "id, client_id, lead_id, unipile_account_id, status, sent_at, accepted_at, raw, " +
    "target_linkedin_provider_id, target_profile_slug, target_linkedin_url_normalized, unipile_invitation_id";

  const { data, error } = await supabase
    .from("linkedin_invitations")
    .select(selectFields)
    .eq("client_id", clientId)
    .eq("unipile_account_id", unipileAccountId)
    .eq("lead_id", leadId)
    .in("status", ["queued", "pending", "sent", "accepted", "connected"])
    .order("accepted_at", { ascending: false, nullsFirst: false })
    .order("sent_at", { ascending: false, nullsFirst: false })
    .limit(3);

  return {
    rows: parseInvitationRows(data),
    error,
  };
}

async function findUniqueLeadId(params: {
  supabase: SupabaseClient;
  clientId: string;
  identity: AcceptedRelationIdentity;
}): Promise<{ status: "matched"; leadId: string } | { status: "ambiguous" } | { status: "unmatched" } | { status: "error"; error: unknown }> {
  const { supabase, clientId, identity } = params;
  if (!identity.normalizedLinkedInUrl && !identity.profileSlug) {
    return { status: "unmatched" };
  }

  const { data, error } = await supabase
    .from("leads")
    .select("id, LinkedInURL, linkedin_url")
    .eq("client_id", clientId)
    .not("LinkedInURL", "is", null);

  let leadRows: LeadIdentityRow[] = [];

  if (
    error &&
    (isMissingColumnError(error, "linkedin_url") || isMissingColumnError(error, "LinkedInURL"))
  ) {
    const fallback = await supabase
      .from("leads")
      .select("id, LinkedInURL, linkedin_url")
      .eq("client_id", clientId);

    if (fallback.error) {
      return { status: "error", error: fallback.error };
    }

    leadRows = (Array.isArray(fallback.data) ? fallback.data : []) as LeadIdentityRow[];
  } else if (error) {
    return { status: "error", error };
  } else {
    leadRows = (Array.isArray(data) ? data : []) as LeadIdentityRow[];
  }

  const matches = leadRows.filter((lead) => {
    const leadUrl = buildLeadLinkedInUrl(lead);
    const normalizedLeadUrl = normalizeLinkedInUrlForMatching(leadUrl);
    const leadSlug =
      extractLinkedInProfileSlugForMatching(leadUrl) ??
      normalizeSlug(extractLinkedInProfileSlug(leadUrl)) ??
      null;

    if (
      identity.normalizedLinkedInUrl &&
      normalizedLeadUrl &&
      identity.normalizedLinkedInUrl === normalizedLeadUrl
    ) {
      return true;
    }

    if (identity.profileSlug && leadSlug && identity.profileSlug === leadSlug) {
      return true;
    }

    return false;
  });

  const leadIds = Array.from(
    new Set(
      matches
        .map((lead) => {
          const id = lead.id;
          return typeof id === "string" || typeof id === "number" ? String(id) : null;
        })
        .filter((value): value is string => Boolean(value))
    )
  );

  if (leadIds.length === 1) {
    return { status: "matched", leadId: leadIds[0] };
  }

  if (leadIds.length > 1) {
    return { status: "ambiguous" };
  }

  return { status: "unmatched" };
}

function toMatchedResult(
  row: InvitationMatchRow,
  matchedBy:
    | "unipile_invitation_id"
    | "target_provider_id"
    | "target_linkedin_url_normalized"
    | "target_profile_slug"
    | "lead_identity",
  candidatesCount: number,
  identity: AcceptedRelationIdentity
): AcceptedInvitationMatchResult {
  return {
    ok: true,
    invitationId: String(row.id),
    leadId: String(row.lead_id),
    clientId:
      row.client_id === null || row.client_id === undefined ? null : String(row.client_id),
    unipileAccountId: String(row.unipile_account_id ?? "").trim() || null,
    status: String(row.status ?? "").trim() || null,
    matchedBy,
    candidatesCount,
    identity,
  };
}

function canReturnMatchedRow(row: InvitationMatchRow): boolean {
  const leadId = row.lead_id;
  return typeof leadId === "string" || typeof leadId === "number";
}

export async function resolveAcceptedInvitationMatch(params: {
  supabase: SupabaseClient;
  clientId: string;
  unipileAccountId: string | null;
  payload: unknown;
}): Promise<AcceptedInvitationMatchResult> {
  const { supabase, clientId } = params;
  const unipileAccountId = String(params.unipileAccountId ?? "").trim() || null;
  const identity = extractAcceptedRelationIdentity(params.payload);

  if (!unipileAccountId) {
    return {
      ok: false,
      status: "unmatched",
      reason: "missing_account",
      matchedBy: null,
      candidatesCount: 0,
      identity,
    };
  }

  if (
    !identity.unipileInvitationId &&
    !identity.providerId &&
    !identity.normalizedLinkedInUrl &&
    !identity.profileSlug
  ) {
    return {
      ok: false,
      status: "unmatched",
      reason: "missing_identity",
      matchedBy: null,
      candidatesCount: 0,
      identity,
    };
  }

  const directLookups: Array<{
    field:
      | "unipile_invitation_id"
      | "target_linkedin_provider_id"
      | "target_linkedin_url_normalized"
      | "target_profile_slug";
    matchedBy:
      | "unipile_invitation_id"
      | "target_provider_id"
      | "target_linkedin_url_normalized"
      | "target_profile_slug";
    value: string | null;
  }> = [
    {
      field: "unipile_invitation_id",
      matchedBy: "unipile_invitation_id",
      value: identity.unipileInvitationId,
    },
    {
      field: "target_linkedin_provider_id",
      matchedBy: "target_provider_id",
      value: identity.providerId,
    },
    {
      field: "target_linkedin_url_normalized",
      matchedBy: "target_linkedin_url_normalized",
      value: identity.normalizedLinkedInUrl,
    },
    {
      field: "target_profile_slug",
      matchedBy: "target_profile_slug",
      value: identity.profileSlug,
    },
  ];

  for (const lookup of directLookups) {
    if (!lookup.value) continue;

    const result = await queryInvitationsByField({
      supabase,
      clientId,
      unipileAccountId,
      field: lookup.field,
      value: lookup.value,
    });

    if (result.error && !result.missingColumn) {
      return {
        ok: false,
        status: "unmatched",
        reason: "lookup_failed",
        matchedBy: lookup.matchedBy,
        candidatesCount: 0,
        identity,
        details: result.error,
      };
    }

    if (result.rows.length === 0) continue;

    if (result.rows.length > 1) {
      return {
        ok: false,
        status: "ambiguous",
        reason: "multiple_invitations",
        matchedBy: lookup.matchedBy,
        candidatesCount: result.rows.length,
        identity,
        details: result.rows.map((row) => ({
          invitation_id: String(row.id),
          lead_id: String(row.lead_id ?? ""),
          status: String(row.status ?? ""),
        })),
      };
    }

    const candidate = result.rows[0];
    if (!canReturnMatchedRow(candidate)) {
      return {
        ok: false,
        status: "unmatched",
        reason: "no_matching_invitation",
        matchedBy: lookup.matchedBy,
        candidatesCount: 0,
        identity,
      };
    }

    if (!isIdentityCompatible(candidate, identity)) {
      return {
        ok: false,
        status: "ambiguous",
        reason: "identity_conflict",
        matchedBy: lookup.matchedBy,
        candidatesCount: 1,
        identity,
        details: {
          invitation_id: String(candidate.id),
          lead_id: String(candidate.lead_id ?? ""),
          stored: getInvitationTargetMetadata(candidate),
        },
      };
    }

    return toMatchedResult(candidate, lookup.matchedBy, 1, identity);
  }

  const leadMatch = await findUniqueLeadId({
    supabase,
    clientId,
    identity,
  });

  if (leadMatch.status === "error") {
    return {
      ok: false,
      status: "unmatched",
      reason: "lookup_failed",
      matchedBy: "lead_identity",
      candidatesCount: 0,
      identity,
      details: leadMatch.error,
    };
  }

  if (leadMatch.status === "ambiguous") {
    return {
      ok: false,
      status: "ambiguous",
      reason: "multiple_leads",
      matchedBy: "lead_identity",
      candidatesCount: 0,
      identity,
    };
  }

  if (leadMatch.status === "matched") {
    const invitationRows = await queryInvitationsForLead({
      supabase,
      clientId,
      unipileAccountId,
      leadId: leadMatch.leadId,
    });

    if (invitationRows.error) {
      return {
        ok: false,
        status: "unmatched",
        reason: "lookup_failed",
        matchedBy: "lead_identity",
        candidatesCount: 0,
        identity,
        details: invitationRows.error,
      };
    }

    const compatibleRows = invitationRows.rows.filter((row) => isIdentityCompatible(row, identity));

    if (compatibleRows.length > 1) {
      return {
        ok: false,
        status: "ambiguous",
        reason: "multiple_invitations",
        matchedBy: "lead_identity",
        candidatesCount: compatibleRows.length,
        identity,
        details: compatibleRows.map((row) => ({
          invitation_id: String(row.id),
          lead_id: String(row.lead_id ?? ""),
          status: String(row.status ?? ""),
        })),
      };
    }

    if (compatibleRows.length === 1 && canReturnMatchedRow(compatibleRows[0])) {
      return toMatchedResult(compatibleRows[0], "lead_identity", compatibleRows.length, identity);
    }
  }

  return {
    ok: false,
    status: "unmatched",
    reason: "no_matching_invitation",
    matchedBy: null,
    candidatesCount: 0,
    identity,
  };
}
