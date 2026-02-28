import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  extractLinkedInProfileSlugForMatching,
  normalizeLinkedInUrl,
  normalizeLinkedInUrlForMatching,
  normalizeTextForComparison,
} from "@/lib/linkedin-url";
import { getFirstString, toJsonObject, type JsonObject } from "@/lib/unipile-inbox";

type LeadIdentityRow = {
  id: number | string;
  LinkedInURL: string | null;
  linkedin_url?: string | null;
  linkedin_provider_id?: string | null;
  linkedin_public_identifier?: string | null;
  linkedin_url_normalized?: string | null;
};

type InvitationRow = {
  id: number | string;
  client_id: number | string | null;
  lead_id: number | string | null;
  unipile_account_id: string | null;
  raw: unknown;
  created_at?: string | null;
};

export type RelationMatchResult = {
  leadId: number | string | null;
  strategy: "url_exact" | "slug_match" | "slug_ilike" | "none";
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

export type ProviderBackfillResult = {
  scanned: number;
  processedNewRelation: number;
  nextCursor: number;
  hasMore: boolean;
  usedDateFilter: boolean;
  results: Record<ProviderSyncResultCode, number>;
};

export type LinkedinUrlNormalizationBackfillResult = {
  scanned: number;
  updated: number;
  skippedNoUrl: number;
  nextCursor: number;
  hasMore: boolean;
};

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

function extractMissingColumnName(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const maybe = error as {
    message?: string | null;
    details?: string | null;
    hint?: string | null;
  };
  const text = `${maybe.message ?? ""} ${maybe.details ?? ""} ${maybe.hint ?? ""}`;
  const patterns = [
    /column ["']?([a-zA-Z0-9_]+)["']? does not exist/i,
    /Could not find the ['"]([a-zA-Z0-9_]+)['"] column/i,
    /schema cache.*['"]([a-zA-Z0-9_]+)['"]/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

function normalizeSlug(value: string | null | undefined): string | null {
  return normalizeTextForComparison(value);
}

function getLeadLinkedInUrl(lead: LeadIdentityRow): string | null {
  const uppercase = String(lead.LinkedInURL ?? "").trim();
  if (uppercase) return uppercase;
  const lowercase = String(lead.linkedin_url ?? "").trim();
  return lowercase || null;
}

function extractRelationSource(rawInput: unknown): {
  payload: JsonObject;
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
  const invitation = toJsonObject(raw.invitation);
  const relation = toJsonObject(raw.relation);

  const payloadCandidates: JsonObject[] = [
    toJsonObject(raw.webhook_payload),
    toJsonObject(acceptance.webhook_payload),
    toJsonObject(invitation.webhook_payload),
    toJsonObject(relation.webhook_payload),
    raw,
  ];
  const payload = payloadCandidates.find((candidate) => Object.keys(candidate).length > 0) ?? {};

  const userProfileUrl = getFirstString(payload, [
    ["user_profile_url"],
    ["userProfileUrl"],
    ["profile_url"],
    ["profileUrl"],
    ["linkedin_url"],
    ["linkedinUrl"],
    ["user", "profile_url"],
    ["user", "profileUrl"],
    ["user", "linkedin_url"],
    ["user", "linkedinUrl"],
    ["contact", "profile_url"],
    ["contact", "profileUrl"],
  ]);

  const normalizedLinkedInUrl =
    normalizeLinkedInUrlForMatching(
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
    extractLinkedInProfileSlugForMatching(userProfileUrl) ??
    null;

  return {
    payload,
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
  const fullRows = await supabase
    .from("leads")
    .select("*")
    .eq("client_id", clientId);

  if (fullRows.error || !Array.isArray(fullRows.data)) {
    console.error("UNIPILE_RELATION_PROVIDER_LEAD_LOOKUP_ERROR", {
      clientId,
      error: fullRows.error,
    });
    return [];
  }

  return (fullRows.data as LeadIdentityRow[]).filter((lead) => Boolean(getLeadLinkedInUrl(lead)));
}

async function findLeadByNormalizedUrl(params: {
  supabase: SupabaseClient;
  clientId: string;
  normalizedUrl: string;
}): Promise<number | string | null> {
  const { supabase, clientId, normalizedUrl } = params;

  const byNormalizedColumn = await supabase
    .from("leads")
    .select("id")
    .eq("client_id", clientId)
    .eq("linkedin_url_normalized", normalizedUrl)
    .limit(1)
    .maybeSingle();

  if (!byNormalizedColumn.error && byNormalizedColumn.data?.id !== undefined) {
    return byNormalizedColumn.data.id as number | string;
  }

  const leads = await fetchLeadIdentityRows(supabase, clientId);
  const exact = leads.find((lead) => {
    const normalizedStored = normalizeLinkedInUrlForMatching(lead.linkedin_url_normalized ?? null);
    if (normalizedStored && normalizedStored === normalizedUrl) return true;
    const normalizedFromRaw = normalizeLinkedInUrlForMatching(getLeadLinkedInUrl(lead));
    return normalizedFromRaw === normalizedUrl;
  });

  return exact ? exact.id : null;
}

async function findLeadBySlugIlike(params: {
  supabase: SupabaseClient;
  clientId: string;
  normalizedSlug: string;
}): Promise<number | string | null> {
  const { supabase, clientId, normalizedSlug } = params;

  const byUppercase = await supabase
    .from("leads")
    .select("id")
    .eq("client_id", clientId)
    .ilike("LinkedInURL", `%/in/${normalizedSlug}%`)
    .limit(1)
    .maybeSingle();

  if (!byUppercase.error && byUppercase.data?.id !== undefined) {
    return byUppercase.data.id as number | string;
  }

  if (!isMissingColumnError(byUppercase.error, "LinkedInURL")) {
    return null;
  }

  const byLowercase = await supabase
    .from("leads")
    .select("id")
    .eq("client_id", clientId)
    .ilike("linkedin_url", `%/in/${normalizedSlug}%`)
    .limit(1)
    .maybeSingle();

  if (!byLowercase.error && byLowercase.data?.id !== undefined) {
    return byLowercase.data.id as number | string;
  }

  return null;
}

function extractSlugFromLinkedInRaw(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const match = raw.match(/linkedin\.com\/in\/([^\/\?#]+)/i);
  if (!match?.[1]) return extractLinkedInProfileSlugForMatching(raw);
  return normalizeSlug(match[1]);
}

export async function resolveClientIdFromUnipileAccountId(params: {
  supabase: SupabaseClient;
  unipileAccountId: string | null;
}): Promise<string | null> {
  const { supabase, unipileAccountId } = params;
  if (!unipileAccountId) return null;

  const settings = await supabase
    .from("client_linkedin_settings")
    .select("client_id")
    .eq("unipile_account_id", unipileAccountId)
    .limit(1)
    .maybeSingle();

  if (!settings.error && settings.data?.client_id !== undefined && settings.data?.client_id !== null) {
    return String(settings.data.client_id);
  }

  const byAccountId = await supabase
    .from("unipile_accounts")
    .select("client_id")
    .eq("provider", "linkedin")
    .eq("account_id", unipileAccountId)
    .limit(1)
    .maybeSingle();

  if (!byAccountId.error && byAccountId.data?.client_id !== undefined && byAccountId.data?.client_id !== null) {
    return String(byAccountId.data.client_id);
  }

  const byUnipileAccountId = await supabase
    .from("unipile_accounts")
    .select("client_id")
    .eq("provider", "linkedin")
    .eq("unipile_account_id", unipileAccountId)
    .limit(1)
    .maybeSingle();

  if (
    !byUnipileAccountId.error &&
    byUnipileAccountId.data?.client_id !== undefined &&
    byUnipileAccountId.data?.client_id !== null
  ) {
    return String(byUnipileAccountId.data.client_id);
  }

  const byAnyProviderLegacy = await supabase
    .from("unipile_accounts")
    .select("client_id")
    .eq("unipile_account_id", unipileAccountId)
    .limit(1)
    .maybeSingle();

  if (
    !byAnyProviderLegacy.error &&
    byAnyProviderLegacy.data?.client_id !== undefined &&
    byAnyProviderLegacy.data?.client_id !== null
  ) {
    return String(byAnyProviderLegacy.data.client_id);
  }

  return null;
}

export async function findLeadForRelation(params: {
  supabase: SupabaseClient;
  clientId: string;
  normalizedUrlFromWebhook: string | null;
  publicIdentifier: string | null;
}): Promise<RelationMatchResult> {
  const { supabase, clientId, normalizedUrlFromWebhook, publicIdentifier } = params;

  const normalizedUrl = normalizeLinkedInUrlForMatching(normalizedUrlFromWebhook);
  const normalizedSlug = normalizeSlug(publicIdentifier);

  if (normalizedUrl) {
    const leadId = await findLeadByNormalizedUrl({
      supabase,
      clientId,
      normalizedUrl,
    });
    if (leadId !== null) {
      return {
        leadId,
        strategy: "url_exact",
        normalizedLinkedInUrl: normalizedUrl,
        slug: normalizedSlug,
      };
    }
  }

  if (normalizedSlug) {
    const leads = await fetchLeadIdentityRows(supabase, clientId);

    const bySlug = leads.find((lead) => {
      const slugFromUrl = extractSlugFromLinkedInRaw(getLeadLinkedInUrl(lead));
      return slugFromUrl === normalizedSlug;
    });

    if (bySlug) {
      return {
        leadId: bySlug.id,
        strategy: "slug_match",
        normalizedLinkedInUrl: normalizedUrl,
        slug: normalizedSlug,
      };
    }

    const ilikeLeadId = await findLeadBySlugIlike({
      supabase,
      clientId,
      normalizedSlug,
    });
    if (ilikeLeadId !== null) {
      return {
        leadId: ilikeLeadId,
        strategy: "slug_ilike",
        normalizedLinkedInUrl: normalizedUrl,
        slug: normalizedSlug,
      };
    }
  }

  return {
    leadId: null,
    strategy: "none",
    normalizedLinkedInUrl: normalizedUrl,
    slug: normalizedSlug,
  };
}

export async function matchLeadFromUnipileRelationPayload(params: {
  supabase: SupabaseClient;
  clientId: string;
  raw: unknown;
}): Promise<RelationMatchResult> {
  const { supabase, clientId, raw } = params;
  const relation = extractRelationSource(raw);
  const fallbackSlug = relation.slug;
  return findLeadForRelation({
    supabase,
    clientId,
    normalizedUrlFromWebhook: relation.normalizedLinkedInUrl,
    publicIdentifier: fallbackSlug,
  });
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

async function loadLeadForProviderSync(params: {
  supabase: SupabaseClient;
  clientId: string;
  leadId: number | string;
}): Promise<LeadIdentityRow | null> {
  const { supabase, clientId, leadId } = params;

  const row = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .eq("client_id", clientId)
    .limit(1)
    .maybeSingle();

  if (!row.error && row.data) {
    return row.data as LeadIdentityRow;
  }

  return null;
}

async function updateLeadWithOptionalColumns(params: {
  supabase: SupabaseClient;
  clientId: string;
  leadId: string | number;
  payload: Record<string, unknown>;
  optionalColumns: string[];
}): Promise<{ error: unknown | null; payloadUsed: Record<string, unknown> }> {
  const { supabase, clientId, leadId, payload, optionalColumns } = params;
  const mutablePayload = { ...payload };
  const optionalSet = new Set(optionalColumns);

  while (true) {
    const update = await supabase
      .from("leads")
      .update(mutablePayload)
      .eq("id", leadId)
      .eq("client_id", clientId);

    if (!update.error) {
      return { error: null, payloadUsed: mutablePayload };
    }

    const missingColumn = extractMissingColumnName(update.error);
    if (!missingColumn || !optionalSet.has(missingColumn)) {
      return { error: update.error, payloadUsed: mutablePayload };
    }

    delete mutablePayload[missingColumn];
    optionalSet.delete(missingColumn);
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

  const directMatch = await findLeadForRelation({
    supabase,
    clientId: resolvedClientId,
    normalizedUrlFromWebhook: relation.normalizedLinkedInUrl,
    publicIdentifier: relation.slug,
  });

  let match: RelationMatchResult = directMatch;

  if (directMatch.leadId === null && leadIdHint !== null && leadIdHint !== undefined) {
    const hintedLead = await loadLeadForProviderSync({
      supabase,
      clientId: resolvedClientId,
      leadId: leadIdHint,
    });

    if (hintedLead?.id !== undefined && hintedLead?.id !== null) {
      const hintedUrl = normalizeLinkedInUrlForMatching(getLeadLinkedInUrl(hintedLead));
      const hintedSlug = extractSlugFromLinkedInRaw(getLeadLinkedInUrl(hintedLead));
      const hasWebhookIdentity = Boolean(relation.normalizedLinkedInUrl || relation.slug);
      const hintMatchesIdentity = Boolean(
        (relation.normalizedLinkedInUrl &&
          hintedUrl &&
          relation.normalizedLinkedInUrl === hintedUrl) ||
          (relation.slug && hintedSlug && relation.slug === hintedSlug)
      );

      if (!hasWebhookIdentity || hintMatchesIdentity) {
        match = {
          leadId: hintedLead.id,
          strategy: "none",
          normalizedLinkedInUrl: relation.normalizedLinkedInUrl,
          slug: relation.slug,
        };
      } else {
        console.warn("UNIPILE_RELATION_PROVIDER_HINT_MISMATCH", {
          ...baseLog,
          client_id: resolvedClientId,
          hinted_lead_id: String(hintedLead.id),
          hinted_url: hintedUrl,
          hinted_slug: hintedSlug,
          webhook_url: relation.normalizedLinkedInUrl,
          webhook_slug: relation.slug,
        });
      }
    }
  }

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

  const leadRow = await loadLeadForProviderSync({
    supabase,
    clientId: resolvedClientId,
    leadId,
  });

  if (!leadRow) {
    console.error("UNIPILE_RELATION_PROVIDER_LEAD_LOAD_ERROR", {
      ...baseLog,
      client_id: resolvedClientId,
      lead_id: String(leadId),
      error: "lead_row_not_found",
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
      details: "lead_row_not_found",
    };
  }

  const existingProviderId = String(leadRow.linkedin_provider_id ?? "").trim();
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
      details: { existingProviderId },
    };
  }

  const currentPublicIdentifier = normalizeSlug(leadRow.linkedin_public_identifier ?? null);
  const normalizedLeadUrl = normalizeLinkedInUrlForMatching(getLeadLinkedInUrl(leadRow));
  const targetNormalizedUrl = relation.normalizedLinkedInUrl ?? normalizedLeadUrl;

  const updatePayload: Record<string, unknown> = {};
  if (!existingProviderId) updatePayload.linkedin_provider_id = providerId;
  if (publicIdentifier && currentPublicIdentifier !== publicIdentifier) {
    updatePayload.linkedin_public_identifier = publicIdentifier;
  }
  if (targetNormalizedUrl) {
    updatePayload.linkedin_url_normalized = targetNormalizedUrl;
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

  console.log("UNIPILE_RELATION_PROVIDER_UPDATE_START", {
    ...baseLog,
    client_id: resolvedClientId,
    lead_id: String(leadId),
    before_provider_id: existingProviderId || null,
    new_provider_id: providerId,
    update_payload: updatePayload,
  });

  const update = await updateLeadWithOptionalColumns({
    supabase,
    clientId: resolvedClientId,
    leadId,
    payload: updatePayload,
    optionalColumns: ["linkedin_public_identifier", "linkedin_url_normalized"],
  });

  if (update.error) {
    console.error("UNIPILE_RELATION_PROVIDER_LEAD_UPDATE_ERROR", {
      ...baseLog,
      client_id: resolvedClientId,
      lead_id: String(leadId),
      update_payload: update.payloadUsed,
      error: update.error,
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
      details: update.error,
    };
  }

  console.log("UNIPILE_RELATION_PROVIDER_UPDATE_DONE", {
    ...baseLog,
    client_id: resolvedClientId,
    lead_id: String(leadId),
    before_provider_id: existingProviderId || null,
    new_provider_id: providerId,
    payload_used: update.payloadUsed,
    result: "UPDATED",
  });

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

export async function debugFindLatestNewRelationForLead(params: {
  supabase: SupabaseClient;
  linkedinUrl: string;
  limit?: number;
}): Promise<{
  normalizedInputUrl: string | null;
  inputSlug: string | null;
  inspected: number;
  matches: Array<{
    invitation_id: string;
    client_id: string | null;
    account_id: string | null;
    normalized_url: string | null;
    slug: string | null;
    user_provider_id: string | null;
  }>;
}> {
  const { supabase, linkedinUrl } = params;
  const limit = Math.max(1, Math.min(Number(params.limit ?? 10), 50));

  const normalizedInputUrl = normalizeLinkedInUrlForMatching(linkedinUrl);
  const inputSlug = extractLinkedInProfileSlugForMatching(linkedinUrl);

  const { data, error } = await supabase
    .from("linkedin_invitations")
    .select("id, client_id, unipile_account_id, raw")
    .order("id", { ascending: false })
    .limit(300);

  if (error) {
    console.error("UNIPILE_RELATION_DEBUG_FETCH_ERROR", error);
    return {
      normalizedInputUrl,
      inputSlug,
      inspected: 0,
      matches: [],
    };
  }

  const rows = Array.isArray(data) ? (data as InvitationRow[]) : [];
  const matches: Array<{
    invitation_id: string;
    client_id: string | null;
    account_id: string | null;
    normalized_url: string | null;
    slug: string | null;
    user_provider_id: string | null;
  }> = [];

  for (const row of rows) {
    const relation = extractRelationSource(row.raw);
    if (String(relation.eventName ?? "").toLowerCase() !== "new_relation") continue;

    const sameUrl = Boolean(
      normalizedInputUrl && relation.normalizedLinkedInUrl && relation.normalizedLinkedInUrl === normalizedInputUrl
    );
    const sameSlug = Boolean(inputSlug && relation.slug && relation.slug === inputSlug);
    if (!sameUrl && !sameSlug) continue;

    matches.push({
      invitation_id: String(row.id),
      client_id: row.client_id !== null && row.client_id !== undefined ? String(row.client_id) : null,
      account_id: String(row.unipile_account_id ?? "").trim() || null,
      normalized_url: relation.normalizedLinkedInUrl,
      slug: relation.slug,
      user_provider_id: String(relation.userProviderId ?? "").trim() || null,
    });

    if (matches.length >= limit) break;
  }

  console.log("UNIPILE_RELATION_DEBUG", {
    normalized_input_url: normalizedInputUrl,
    input_slug: inputSlug,
    inspected: rows.length,
    matched_count: matches.length,
    sample: matches.slice(0, 10),
  });

  return {
    normalizedInputUrl,
    inputSlug,
    inspected: rows.length,
    matches,
  };
}

export async function backfillProviderIdsFromInvitations(params: {
  supabase: SupabaseClient;
  limit?: number;
  cursor?: number;
  days?: number;
  clientId?: string | null;
}): Promise<ProviderBackfillResult> {
  const { supabase } = params;
  const limit = Math.max(1, Math.min(Number(params.limit ?? 200), 500));
  const cursor = Math.max(0, Number(params.cursor ?? 0));
  const days = Math.max(1, Math.min(Number(params.days ?? 30), 365));
  const clientIdFilter = params.clientId ? String(params.clientId) : null;

  const counters: Record<ProviderSyncResultCode, number> = {
    UPDATED: 0,
    ALREADY_PRESENT: 0,
    LEAD_NOT_FOUND: 0,
    CLIENT_NOT_FOUND: 0,
    PROVIDER_ID_MISSING: 0,
    MISMATCH_WARNING: 0,
    LEAD_UPDATE_FAILED: 0,
  };

  let queryWithDate = supabase
    .from("linkedin_invitations")
    .select("id, client_id, lead_id, unipile_account_id, raw, created_at")
    .order("id", { ascending: true })
    .limit(limit)
    .gte("created_at", new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

  if (cursor > 0) queryWithDate = queryWithDate.gt("id", cursor);
  if (clientIdFilter) queryWithDate = queryWithDate.eq("client_id", clientIdFilter);

  let dataResultWithDate = await queryWithDate;
  let usedDateFilter = true;
  let fetchError: unknown = null;
  let rows: InvitationRow[] = [];

  if (dataResultWithDate.error && isMissingColumnError(dataResultWithDate.error, "created_at")) {
    usedDateFilter = false;
    let queryWithoutDate = supabase
      .from("linkedin_invitations")
      .select("id, client_id, lead_id, unipile_account_id, raw")
      .order("id", { ascending: true })
      .limit(limit);
    if (cursor > 0) queryWithoutDate = queryWithoutDate.gt("id", cursor);
    if (clientIdFilter) queryWithoutDate = queryWithoutDate.eq("client_id", clientIdFilter);
    const dataResultWithoutDate = await queryWithoutDate;
    fetchError = dataResultWithoutDate.error;
    if (Array.isArray(dataResultWithoutDate.data)) {
      rows = dataResultWithoutDate.data as InvitationRow[];
    }
  } else {
    fetchError = dataResultWithDate.error;
    if (Array.isArray(dataResultWithDate.data)) {
      rows = dataResultWithDate.data as InvitationRow[];
    }
  }

  if (fetchError) throw fetchError;

  let scanned = 0;
  let processedNewRelation = 0;
  let nextCursor = cursor;

  for (const row of rows) {
    scanned += 1;
    const rowId = Number(row.id);
    if (Number.isFinite(rowId)) nextCursor = rowId;

    const eventName = getUnipileRelationEventName(row.raw);
    if (eventName !== "new_relation") continue;
    processedNewRelation += 1;

    const result = await syncLeadProviderFromRelationPayload({
      supabase,
      raw: row.raw,
      eventId: row.id,
      clientId:
        row.client_id === null || row.client_id === undefined
          ? null
          : String(row.client_id),
      unipileAccountId: String(row.unipile_account_id ?? "").trim() || null,
      leadIdHint: row.lead_id,
    });

    counters[result.result] = (counters[result.result] ?? 0) + 1;
  }

  return {
    scanned,
    processedNewRelation,
    nextCursor,
    hasMore: rows.length === limit,
    usedDateFilter,
    results: counters,
  };
}

export async function backfillLeadLinkedinUrlNormalized(params: {
  supabase: SupabaseClient;
  limit?: number;
  cursor?: number;
  clientId?: string | null;
}): Promise<LinkedinUrlNormalizationBackfillResult> {
  const { supabase } = params;
  const limit = Math.max(1, Math.min(Number(params.limit ?? 200), 500));
  const cursor = Math.max(0, Number(params.cursor ?? 0));
  const clientIdFilter = params.clientId ? String(params.clientId) : null;

  let query = supabase.from("leads").select("*").order("id", { ascending: true }).limit(limit);
  if (cursor > 0) query = query.gt("id", cursor);
  if (clientIdFilter) query = query.eq("client_id", clientIdFilter);

  const { data, error } = await query;
  if (error) throw error;

  const rows = Array.isArray(data) ? (data as LeadIdentityRow[]) : [];

  let scanned = 0;
  let updated = 0;
  let skippedNoUrl = 0;
  let nextCursor = cursor;

  for (const row of rows) {
    scanned += 1;
    const rowId = Number(row.id);
    if (Number.isFinite(rowId)) nextCursor = rowId;

    const rawUrl = getLeadLinkedInUrl(row);
    if (!rawUrl) {
      skippedNoUrl += 1;
      continue;
    }

    const normalized = normalizeLinkedInUrlForMatching(rawUrl);
    if (!normalized) {
      skippedNoUrl += 1;
      continue;
    }

    const current = normalizeLinkedInUrlForMatching(row.linkedin_url_normalized ?? null);
    if (current === normalized) continue;

    const rawClientId = (row as { client_id?: string | number | null }).client_id;
    let updateQuery = supabase
      .from("leads")
      .update({ linkedin_url_normalized: normalized })
      .eq("id", row.id);

    if (rawClientId !== null && rawClientId !== undefined && String(rawClientId).trim()) {
      updateQuery = updateQuery.eq("client_id", String(rawClientId));
    }

    const update = await updateQuery;

    if (update.error) {
      if (isMissingColumnError(update.error, "linkedin_url_normalized")) {
        throw update.error;
      }
      throw update.error;
    }

    updated += 1;
  }

  return {
    scanned,
    updated,
    skippedNoUrl,
    nextCursor,
    hasMore: rows.length === limit,
  };
}
