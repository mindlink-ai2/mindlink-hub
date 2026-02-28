import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { extractLinkedInProfileSlug, normalizeLinkedInUrl } from "@/lib/linkedin-url";
import { getFirstString, toJsonObject, type JsonObject } from "@/lib/unipile-inbox";

type LeadIdentityRow = {
  id: number | string;
  LinkedInURL: string | null;
  linkedin_provider_id?: string | null;
  linkedin_public_identifier?: string | null;
};

export type RelationMatchResult = {
  leadId: number | string | null;
  strategy: "url_exact" | "slug_match" | "none";
  normalizedLinkedInUrl: string | null;
  slug: string | null;
};

export type ProviderSyncResultCode =
  | "UPDATED"
  | "ALREADY_PRESENT"
  | "LEAD_NOT_FOUND"
  | "CLIENT_NOT_FOUND"
  | "PROVIDER_ID_MISSING"
  | "MISMATCH_WARNING"
  | "LEAD_UPDATE_FAILED";

export type ProviderSyncResult = {
  result: ProviderSyncResultCode;
  eventId: string | null;
  clientId: string | null;
  accountId: string | null;
  leadId: string | null;
  userProviderId: string | null;
  userProfileUrl: string | null;
  strategy: RelationMatchResult["strategy"];
  details?: unknown;
};

function normalizeSlug(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    return decodeURIComponent(raw).toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function isMissingColumnError(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as {
    code?: string | null;
    message?: string | null;
    details?: string | null;
    hint?: string | null;
  };
  if (String(maybe.code ?? "") !== "42703") return false;
  const text = `${maybe.message ?? ""} ${maybe.details ?? ""} ${maybe.hint ?? ""}`.toLowerCase();
  return text.includes(columnName.toLowerCase());
}

function extractRelationSource(rawInput: unknown): {
  payload: JsonObject;
  matching: JsonObject;
  accountId: string | null;
  userProviderId: string | null;
  userPublicIdentifier: string | null;
  userProfileUrl: string | null;
  normalizedLinkedInUrl: string | null;
  slug: string | null;
  eventName: string | null;
} {
  const raw = toJsonObject(rawInput);
  const acceptance = toJsonObject(raw.acceptance);
  const acceptancePayload = toJsonObject(acceptance.webhook_payload);
  const webhookPayload = toJsonObject(raw.webhook_payload);
  const payloadCandidates: JsonObject[] = [webhookPayload, acceptancePayload, raw];
  const payload = payloadCandidates.find((candidate) => Object.keys(candidate).length > 0) ?? {};
  const matching = toJsonObject(raw.matching);

  const userProfileUrl = getFirstString(payload, [
    ["user_profile_url"],
    ["userProfileUrl"],
    ["profile_url"],
    ["profileUrl"],
    ["linkedin_url"],
    ["linkedinUrl"],
    ["user", "profile_url"],
    ["user", "profileUrl"],
    ["contact", "profile_url"],
    ["contact", "profileUrl"],
  ]);

  const normalizedLinkedInUrl =
    normalizeLinkedInUrl(
      getFirstString(raw, [["matching", "normalized_linkedin_url"]]) ?? userProfileUrl
    ) ?? null;

  const userPublicIdentifier = getFirstString(payload, [
    ["user_public_identifier"],
    ["userPublicIdentifier"],
    ["public_identifier"],
    ["publicIdentifier"],
    ["user", "public_identifier"],
    ["user", "publicIdentifier"],
  ]);

  const slug =
    normalizeSlug(getFirstString(raw, [["matching", "profile_slug"]])) ??
    normalizeSlug(userPublicIdentifier) ??
    extractLinkedInProfileSlug(userProfileUrl) ??
    null;

  return {
    payload,
    matching,
    accountId: getFirstString(payload, [
      ["account_id"],
      ["accountId"],
      ["account", "id"],
      ["account", "account_id"],
    ]),
    userProviderId: getFirstString(payload, [
      ["user_provider_id"],
      ["userProviderId"],
      ["provider_id"],
      ["providerId"],
      ["user", "provider_id"],
      ["user", "providerId"],
      ["contact", "provider_id"],
      ["contact", "providerId"],
      ["counterpart", "provider_id"],
      ["counterpart", "providerId"],
    ]),
    userPublicIdentifier: userPublicIdentifier ?? null,
    userProfileUrl: normalizeLinkedInUrl(userProfileUrl),
    normalizedLinkedInUrl,
    slug,
    eventName: getFirstString(payload, [["event"], ["event_type"], ["eventType"], ["type"]]),
  };
}

export function getUnipileRelationEventName(rawInput: unknown): string | null {
  const relation = extractRelationSource(rawInput);
  const normalized = String(relation.eventName ?? "").trim().toLowerCase();
  return normalized || null;
}

async function fetchLeadIdentityRows(
  supabase: SupabaseClient,
  clientId: string
): Promise<LeadIdentityRow[]> {
  const { data, error } = await supabase
    .from("leads")
    .select("id, LinkedInURL, linkedin_provider_id, linkedin_public_identifier")
    .eq("client_id", clientId)
    .not("LinkedInURL", "is", null);

  if (!error && Array.isArray(data)) {
    return data as LeadIdentityRow[];
  }

  if (
    error &&
    (isMissingColumnError(error, "linkedin_provider_id") ||
      isMissingColumnError(error, "linkedin_public_identifier"))
  ) {
    const fallback = await supabase
      .from("leads")
      .select("id, LinkedInURL")
      .eq("client_id", clientId)
      .not("LinkedInURL", "is", null);
    if (!fallback.error && Array.isArray(fallback.data)) {
      return fallback.data as LeadIdentityRow[];
    }
  }

  if (error) {
    console.error("UNIPILE_RELATION_PROVIDER_LEAD_LOOKUP_ERROR", { clientId, error });
  }
  return [];
}

export async function resolveClientIdFromUnipileAccountId(params: {
  supabase: SupabaseClient;
  unipileAccountId: string | null;
}): Promise<string | null> {
  const { supabase, unipileAccountId } = params;
  if (!unipileAccountId) return null;

  const { data: settings, error: settingsError } = await supabase
    .from("client_linkedin_settings")
    .select("client_id")
    .eq("unipile_account_id", unipileAccountId)
    .limit(1)
    .maybeSingle();

  if (!settingsError && settings?.client_id !== null && settings?.client_id !== undefined) {
    return String(settings.client_id);
  }
  if (settingsError && !isMissingColumnError(settingsError, "unipile_account_id")) {
    console.error("UNIPILE_RELATION_PROVIDER_CLIENT_SETTINGS_LOOKUP_ERROR", settingsError);
  }

  const { data: account, error: accountError } = await supabase
    .from("unipile_accounts")
    .select("client_id")
    .eq("provider", "linkedin")
    .eq("unipile_account_id", unipileAccountId)
    .limit(1)
    .maybeSingle();

  if (!accountError && account?.client_id !== null && account?.client_id !== undefined) {
    return String(account.client_id);
  }

  const { data: fallbackAccount, error: fallbackError } = await supabase
    .from("unipile_accounts")
    .select("client_id")
    .eq("unipile_account_id", unipileAccountId)
    .limit(1)
    .maybeSingle();

  if (fallbackError) {
    console.error("UNIPILE_RELATION_PROVIDER_CLIENT_ACCOUNT_LOOKUP_ERROR", fallbackError);
    return null;
  }

  if (fallbackAccount?.client_id === null || fallbackAccount?.client_id === undefined) {
    return null;
  }
  return String(fallbackAccount.client_id);
}

export async function matchLeadFromUnipileRelationPayload(params: {
  supabase: SupabaseClient;
  clientId: string;
  raw: unknown;
}): Promise<RelationMatchResult> {
  const { supabase, clientId, raw } = params;
  const relation = extractRelationSource(raw);
  const normalizedLinkedInUrl = relation.normalizedLinkedInUrl;
  const slug = relation.slug;

  if (!normalizedLinkedInUrl && !slug) {
    return {
      leadId: null,
      strategy: "none",
      normalizedLinkedInUrl,
      slug,
    };
  }

  const leads = await fetchLeadIdentityRows(supabase, clientId);

  if (normalizedLinkedInUrl) {
    const exact = leads.find((lead) => {
      const leadUrl = normalizeLinkedInUrl(String(lead.LinkedInURL ?? ""));
      return leadUrl === normalizedLinkedInUrl;
    });
    if (exact) {
      return {
        leadId: exact.id,
        strategy: "url_exact",
        normalizedLinkedInUrl,
        slug,
      };
    }
  }

  if (slug) {
    const normalizedSlug = normalizeSlug(slug);
    const bySlug = leads.find((lead) => {
      const leadSlug = extractLinkedInProfileSlug(lead.LinkedInURL);
      return leadSlug && normalizedSlug && leadSlug === normalizedSlug;
    });
    if (bySlug) {
      return {
        leadId: bySlug.id,
        strategy: "slug_match",
        normalizedLinkedInUrl,
        slug: normalizedSlug,
      };
    }
  }

  return {
    leadId: null,
    strategy: "none",
    normalizedLinkedInUrl,
    slug,
  };
}

async function enrichInboxThreadProviderId(params: {
  supabase: SupabaseClient;
  clientId: string;
  leadId: string | number;
  providerId: string;
}) {
  const { supabase, clientId, leadId, providerId } = params;
  const { error } = await supabase
    .from("inbox_threads")
    .update({
      provider_id: providerId,
      updated_at: new Date().toISOString(),
    })
    .eq("client_id", clientId)
    .eq("lead_id", leadId);

  if (error && !isMissingColumnError(error, "provider_id")) {
    console.error("UNIPILE_RELATION_PROVIDER_THREAD_UPDATE_ERROR", {
      clientId,
      leadId,
      providerId,
      error,
    });
  }
}

export async function syncLeadProviderFromRelationPayload(params: {
  supabase: SupabaseClient;
  raw: unknown;
  eventId?: string | number | null;
  clientId?: string | null;
  unipileAccountId?: string | null;
  leadIdHint?: string | number | null;
}): Promise<ProviderSyncResult> {
  const { supabase, raw, eventId, leadIdHint } = params;
  const relation = extractRelationSource(raw);
  const accountId = params.unipileAccountId ?? relation.accountId ?? null;
  const resolvedClientId =
    params.clientId ??
    (await resolveClientIdFromUnipileAccountId({
      supabase,
      unipileAccountId: accountId,
    }));
  const providerId = String(relation.userProviderId ?? "").trim() || null;
  const publicIdentifier = normalizeSlug(relation.userPublicIdentifier);
  const profileUrl = relation.userProfileUrl ?? relation.normalizedLinkedInUrl ?? null;
  const eventName = String(relation.eventName ?? "").toLowerCase();

  const baseLog = {
    event_id: eventId !== null && eventId !== undefined ? String(eventId) : null,
    client_id: resolvedClientId,
    account_id: accountId,
    lead_id: leadIdHint ? String(leadIdHint) : null,
    user_provider_id: providerId,
    user_profile_url: profileUrl,
  };

  if (eventName && eventName !== "new_relation") {
    return {
      result: "LEAD_NOT_FOUND",
      eventId: baseLog.event_id,
      clientId: baseLog.client_id,
      accountId: baseLog.account_id,
      leadId: baseLog.lead_id,
      userProviderId: baseLog.user_provider_id,
      userProfileUrl: baseLog.user_profile_url,
      strategy: "none",
      details: { skipped_reason: "not_new_relation", event_name: relation.eventName },
    };
  }

  if (!resolvedClientId) {
    console.warn("UNIPILE_RELATION_PROVIDER_SYNC", {
      ...baseLog,
      result: "CLIENT_NOT_FOUND",
    });
    return {
      result: "CLIENT_NOT_FOUND",
      eventId: baseLog.event_id,
      clientId: null,
      accountId: baseLog.account_id,
      leadId: baseLog.lead_id,
      userProviderId: baseLog.user_provider_id,
      userProfileUrl: baseLog.user_profile_url,
      strategy: "none",
    };
  }

  const match =
    leadIdHint !== null && leadIdHint !== undefined
      ? {
          leadId: leadIdHint,
          strategy: "none" as const,
          normalizedLinkedInUrl: relation.normalizedLinkedInUrl,
          slug: relation.slug,
        }
      : await matchLeadFromUnipileRelationPayload({
          supabase,
          clientId: resolvedClientId,
          raw,
        });

  const leadId = match.leadId;
  if (leadId === null) {
    console.warn("UNIPILE_RELATION_PROVIDER_SYNC", {
      ...baseLog,
      client_id: resolvedClientId,
      result: "LEAD_NOT_FOUND",
      strategy: match.strategy,
      normalized_linkedin_url: match.normalizedLinkedInUrl,
      slug: match.slug,
    });
    return {
      result: "LEAD_NOT_FOUND",
      eventId: baseLog.event_id,
      clientId: resolvedClientId,
      accountId: baseLog.account_id,
      leadId: null,
      userProviderId: baseLog.user_provider_id,
      userProfileUrl: baseLog.user_profile_url,
      strategy: match.strategy,
    };
  }

  if (!providerId) {
    console.warn("UNIPILE_RELATION_PROVIDER_SYNC", {
      ...baseLog,
      client_id: resolvedClientId,
      lead_id: String(leadId),
      result: "PROVIDER_ID_MISSING",
      strategy: match.strategy,
    });
    return {
      result: "PROVIDER_ID_MISSING",
      eventId: baseLog.event_id,
      clientId: resolvedClientId,
      accountId: baseLog.account_id,
      leadId: String(leadId),
      userProviderId: null,
      userProfileUrl: baseLog.user_profile_url,
      strategy: match.strategy,
    };
  }

  const leadLoad = await supabase
    .from("leads")
    .select("id, linkedin_provider_id, linkedin_public_identifier")
    .eq("id", leadId)
    .eq("client_id", resolvedClientId)
    .limit(1)
    .maybeSingle();

  if (leadLoad.error) {
    console.error("UNIPILE_RELATION_PROVIDER_LEAD_LOAD_ERROR", {
      ...baseLog,
      client_id: resolvedClientId,
      lead_id: String(leadId),
      error: leadLoad.error,
    });
    return {
      result: "LEAD_UPDATE_FAILED",
      eventId: baseLog.event_id,
      clientId: resolvedClientId,
      accountId: baseLog.account_id,
      leadId: String(leadId),
      userProviderId: providerId,
      userProfileUrl: baseLog.user_profile_url,
      strategy: match.strategy,
      details: leadLoad.error,
    };
  }

  const existingProviderId = String(leadLoad.data?.linkedin_provider_id ?? "").trim();
  if (existingProviderId && existingProviderId !== providerId) {
    console.warn("UNIPILE_RELATION_PROVIDER_SYNC", {
      ...baseLog,
      client_id: resolvedClientId,
      lead_id: String(leadId),
      result: "MISMATCH_WARNING",
      existing_provider_id: existingProviderId,
      incoming_provider_id: providerId,
      strategy: match.strategy,
    });
    return {
      result: "MISMATCH_WARNING",
      eventId: baseLog.event_id,
      clientId: resolvedClientId,
      accountId: baseLog.account_id,
      leadId: String(leadId),
      userProviderId: providerId,
      userProfileUrl: baseLog.user_profile_url,
      strategy: match.strategy,
      details: {
        existingProviderId,
      },
    };
  }

  const currentPublicIdentifier = normalizeSlug(leadLoad.data?.linkedin_public_identifier ?? null);
  const updatePayload: Record<string, unknown> = {};
  if (!existingProviderId) updatePayload.linkedin_provider_id = providerId;
  if (publicIdentifier && currentPublicIdentifier !== publicIdentifier) {
    updatePayload.linkedin_public_identifier = publicIdentifier;
  }

  if (Object.keys(updatePayload).length === 0) {
    await enrichInboxThreadProviderId({
      supabase,
      clientId: resolvedClientId,
      leadId,
      providerId,
    });
    console.log("UNIPILE_RELATION_PROVIDER_SYNC", {
      ...baseLog,
      client_id: resolvedClientId,
      lead_id: String(leadId),
      result: "ALREADY_PRESENT",
      strategy: match.strategy,
    });
    return {
      result: "ALREADY_PRESENT",
      eventId: baseLog.event_id,
      clientId: resolvedClientId,
      accountId: baseLog.account_id,
      leadId: String(leadId),
      userProviderId: providerId,
      userProfileUrl: baseLog.user_profile_url,
      strategy: match.strategy,
    };
  }

  const { error: updateError } = await supabase
    .from("leads")
    .update(updatePayload)
    .eq("id", leadId)
    .eq("client_id", resolvedClientId);

  if (updateError) {
    console.error("UNIPILE_RELATION_PROVIDER_LEAD_UPDATE_ERROR", {
      ...baseLog,
      client_id: resolvedClientId,
      lead_id: String(leadId),
      update_payload: updatePayload,
      error: updateError,
    });
    return {
      result: "LEAD_UPDATE_FAILED",
      eventId: baseLog.event_id,
      clientId: resolvedClientId,
      accountId: baseLog.account_id,
      leadId: String(leadId),
      userProviderId: providerId,
      userProfileUrl: baseLog.user_profile_url,
      strategy: match.strategy,
      details: updateError,
    };
  }

  await enrichInboxThreadProviderId({
    supabase,
    clientId: resolvedClientId,
    leadId,
    providerId,
  });

  console.log("UNIPILE_RELATION_PROVIDER_SYNC", {
    ...baseLog,
    client_id: resolvedClientId,
    lead_id: String(leadId),
    result: "UPDATED",
    strategy: match.strategy,
  });

  return {
    result: "UPDATED",
    eventId: baseLog.event_id,
    clientId: resolvedClientId,
    accountId: baseLog.account_id,
    leadId: String(leadId),
    userProviderId: providerId,
    userProfileUrl: baseLog.user_profile_url,
    strategy: match.strategy,
  };
}
