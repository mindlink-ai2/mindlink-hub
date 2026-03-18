import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { extractLinkedInProfileSlug, normalizeLinkedInUrl } from "@/lib/linkedin-url";
import {
  assertValidLinkedinProviderId,
  ensureThreadAndSendMessage,
  findExistingThreadForLead,
} from "@/lib/linkedin-messaging";
import { normalizeUnipileBase, readResponseBody, requireEnv } from "@/lib/inbox-server";
import { syncLeadProviderFromRelationPayload } from "@/lib/unipile-relation-provider";
import { extractArrayCandidates, getFirstString, toJsonObject, type JsonObject } from "@/lib/unipile-inbox";

const AUTO_DM_RUNNER = "linkedin-auto-dm";
const AUTO_DM_ACTION = "send_message";
const MAX_RETRYABLE_ATTEMPTS = 12;
const RETRY_HISTORY_LIMIT = 50;

type AutoDmLeadRow = {
  id: number;
  client_id?: number | string | null;
  LinkedInURL: string | null;
  linkedin_url?: string | null;
  linkedin_provider_id?: string | null;
  linkedin_public_identifier?: string | null;
  internal_message?: string | null;
  message_sent?: boolean | null;
  message_sent_at?: string | null;
  next_followup_at?: string | null;
  FirstName?: string | null;
  LastName?: string | null;
  Name?: string | null;
  unipile_chat_id?: string | null;
  unipile_thread_id?: string | null;
};

type AutoDmInvitationRow = {
  id: string;
  client_id: string;
  lead_id: number;
  unipile_account_id: string;
  status: string | null;
  accepted_at: string | null;
  dm_draft_text: string | null;
  dm_draft_status: string | null;
  dm_sent_at: string | null;
  last_error: string | null;
  raw: unknown;
};

type AutomationLogRow = {
  created_at: string | null;
  status: string | null;
  details: unknown;
};

type RetryState = {
  attempts: number;
  exhausted: boolean;
  inCooldown: boolean;
  cooldownMinutes: number;
  lastAttemptAt: string | null;
};

type ResolvedIdentity = {
  providerId: string | null;
  source:
    | "lead.linkedin_provider_id"
    | "payload.provider_id"
    | "invitation_history.provider_id"
    | "lead.public_identifier_lookup"
    | "payload.public_identifier_lookup"
    | "payload.slug_lookup"
    | "lead.slug_lookup"
    | "none";
  payloadProviderId: string | null;
  payloadPublicIdentifier: string | null;
  payloadSlug: string | null;
  payloadAccountId: string | null;
  resolvedViaLookup: boolean;
  invitationCandidateId: string | null;
  lookupInput: string | null;
  syncResult?: unknown;
};

export type AcceptedInvitationAutoDmResult = {
  ok: boolean;
  status:
    | "sent"
    | "already_sent"
    | "draft_not_ready"
    | "claim_conflict"
    | "retry_deferred"
    | "retry_exhausted"
    | "lead_not_found"
    | "invitation_not_found"
    | "not_accepted"
    | "resolve_identity_failed"
    | "create_chat_failed"
    | "thread_upsert_failed"
    | "send_failed"
    | "persist_message_failed";
  invitationId: string;
  leadId: number;
  skipped: boolean;
  retryable: boolean;
  stage:
    | "skip"
    | "claim"
    | "resolve_identity"
    | "create_chat"
    | "send_message"
    | "persist_message"
    | "complete";
  providerId: string | null;
  unipileThreadId: string | null;
  threadCreated: boolean;
  sentAt: string | null;
  lastError: string | null;
  details?: unknown;
};

function isValidLinkedinProviderId(value: string | null | undefined): value is string {
  try {
    assertValidLinkedinProviderId(value);
    return true;
  } catch {
    return false;
  }
}

function decodeAndNormalizeSlug(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  try {
    return decodeURIComponent(raw).trim().toLowerCase() || null;
  } catch {
    return raw.toLowerCase() || null;
  }
}

function parseIsoToMs(value: string | null | undefined): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function getLeadLinkedInUrl(lead: AutoDmLeadRow): string | null {
  const upper = String(lead.LinkedInURL ?? "").trim();
  if (upper) return upper;
  const lower = String(lead.linkedin_url ?? "").trim();
  return lower || null;
}

function getLeadDisplayName(lead: AutoDmLeadRow): string | null {
  const full = `${lead.FirstName ?? ""} ${lead.LastName ?? ""}`.trim();
  if (full) return full;
  return String(lead.Name ?? "").trim() || null;
}

function getLeadThreadId(lead: AutoDmLeadRow): string | null {
  return String(lead.unipile_chat_id ?? lead.unipile_thread_id ?? "").trim() || null;
}

function extractPayloadAccountId(candidate: JsonObject): string | null {
  return (
    getFirstString(candidate, [
      ["account_id"],
      ["accountId"],
      ["account", "id"],
      ["account", "account_id"],
      ["data", "account_id"],
      ["data", "accountId"],
    ]) ?? null
  );
}

function extractPayloadProviderId(candidate: JsonObject): string | null {
  const providerId =
    getFirstString(candidate, [
      ["user_provider_id"],
      ["userProviderId"],
      ["provider_id"],
      ["providerId"],
      ["recipient_provider_id"],
      ["recipientProviderId"],
      ["counterpart_provider_id"],
      ["counterpartProviderId"],
      ["user", "provider_id"],
      ["user", "providerId"],
      ["contact", "provider_id"],
      ["contact", "providerId"],
      ["counterpart", "provider_id"],
      ["counterpart", "providerId"],
      ["attendee", "provider_id"],
      ["attendee", "providerId"],
      ["sender", "provider_id"],
      ["sender", "providerId"],
      ["data", "provider_id"],
      ["data", "providerId"],
      ["data", "user_provider_id"],
      ["data", "userProviderId"],
      ["data", "user", "provider_id"],
      ["data", "user", "providerId"],
    ]) ?? null;

  return isValidLinkedinProviderId(providerId) ? providerId : null;
}

function extractPayloadPublicIdentifier(candidate: JsonObject): string | null {
  return (
    getFirstString(candidate, [
      ["user_public_identifier"],
      ["userPublicIdentifier"],
      ["public_identifier"],
      ["publicIdentifier"],
      ["user", "public_identifier"],
      ["user", "publicIdentifier"],
      ["contact", "public_identifier"],
      ["contact", "publicIdentifier"],
      ["counterpart", "public_identifier"],
      ["counterpart", "publicIdentifier"],
      ["data", "user_public_identifier"],
      ["data", "userPublicIdentifier"],
      ["data", "public_identifier"],
      ["data", "publicIdentifier"],
      ["data", "user", "public_identifier"],
      ["data", "user", "publicIdentifier"],
    ]) ?? null
  );
}

function extractPayloadProfileUrl(candidate: JsonObject): string | null {
  return (
    normalizeLinkedInUrl(
      getFirstString(candidate, [
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
        ["contact", "linkedin_url"],
        ["contact", "linkedinUrl"],
        ["counterpart", "profile_url"],
        ["counterpart", "profileUrl"],
        ["counterpart", "linkedin_url"],
        ["counterpart", "linkedinUrl"],
        ["data", "profile_url"],
        ["data", "profileUrl"],
        ["data", "linkedin_url"],
        ["data", "linkedinUrl"],
      ])
    ) ?? null
  );
}

function extractPayloadSlug(candidate: JsonObject): string | null {
  const publicIdentifier = decodeAndNormalizeSlug(extractPayloadPublicIdentifier(candidate));
  if (publicIdentifier) return publicIdentifier;

  return decodeAndNormalizeSlug(extractLinkedInProfileSlug(extractPayloadProfileUrl(candidate)));
}

function buildInvitationCandidates(rawInput: unknown, payloadOverride?: JsonObject | null): JsonObject[] {
  const raw = toJsonObject(rawInput);
  const invitation = toJsonObject(raw.invitation);
  const acceptance = toJsonObject(raw.acceptance);
  const relation = toJsonObject(raw.relation);

  const baseCandidates: JsonObject[] = [
    payloadOverride && Object.keys(payloadOverride).length > 0 ? payloadOverride : {},
    raw,
    toJsonObject(raw.webhook_payload),
    invitation,
    toJsonObject(invitation.webhook_payload),
    toJsonObject(invitation.invite_response),
    acceptance,
    toJsonObject(acceptance.webhook_payload),
    relation,
    toJsonObject(relation.webhook_payload),
    ...extractArrayCandidates(raw),
  ];

  const unique = new Map<string, JsonObject>();
  for (const candidate of baseCandidates) {
    if (!candidate || Object.keys(candidate).length === 0) continue;
    const key = JSON.stringify(candidate);
    if (!unique.has(key)) unique.set(key, candidate);
  }

  return Array.from(unique.values());
}

function extractPayloadContext(rawInput: unknown, payloadOverride?: JsonObject | null) {
  const candidates = buildInvitationCandidates(rawInput, payloadOverride);
  const primaryPayload =
    candidates.find(
      (candidate) =>
        extractPayloadProviderId(candidate) ||
        extractPayloadPublicIdentifier(candidate) ||
        extractPayloadProfileUrl(candidate)
    ) ?? (payloadOverride ?? candidates[0] ?? {});

  return {
    payloadProviderId: extractPayloadProviderId(primaryPayload),
    payloadPublicIdentifier: decodeAndNormalizeSlug(extractPayloadPublicIdentifier(primaryPayload)),
    payloadSlug: extractPayloadSlug(primaryPayload),
    payloadAccountId: extractPayloadAccountId(primaryPayload),
  };
}

async function loadInvitation(params: {
  supabase: SupabaseClient;
  clientId: string;
  invitationId: string;
}): Promise<AutoDmInvitationRow | null> {
  const { supabase, clientId, invitationId } = params;

  const { data, error } = await supabase
    .from("linkedin_invitations")
    .select(
      "id, client_id, lead_id, unipile_account_id, status, accepted_at, dm_draft_text, dm_draft_status, dm_sent_at, last_error, raw"
    )
    .eq("client_id", clientId)
    .eq("id", invitationId)
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;

  return {
    id: String(data.id),
    client_id: String(data.client_id ?? clientId),
    lead_id: Number(data.lead_id),
    unipile_account_id: String(data.unipile_account_id ?? "").trim(),
    status: typeof data.status === "string" ? data.status : null,
    accepted_at: typeof data.accepted_at === "string" ? data.accepted_at : null,
    dm_draft_text: typeof data.dm_draft_text === "string" ? data.dm_draft_text : null,
    dm_draft_status: typeof data.dm_draft_status === "string" ? data.dm_draft_status : null,
    dm_sent_at: typeof data.dm_sent_at === "string" ? data.dm_sent_at : null,
    last_error: typeof data.last_error === "string" ? data.last_error : null,
    raw: data.raw,
  };
}

async function loadLead(params: {
  supabase: SupabaseClient;
  clientId: string;
  leadId: number;
}): Promise<AutoDmLeadRow | null> {
  const { supabase, clientId, leadId } = params;
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("client_id", clientId)
    .eq("id", leadId)
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  return data as AutoDmLeadRow;
}

async function logAutoDm(params: {
  supabase: SupabaseClient;
  clientId: string;
  leadId: number;
  accountId: string;
  status: "success" | "error" | "skipped" | "retryable";
  stage:
    | "skip"
    | "claim"
    | "resolve_identity"
    | "create_chat"
    | "send_message"
    | "persist_message"
    | "complete";
  invitationId: string;
  providerId: string | null;
  payloadProviderId: string | null;
  payloadPublicIdentifier: string | null;
  payloadSlug: string | null;
  payloadAccountId: string | null;
  message: string | null;
  errorCode?: string | null;
  unipileStatusCode?: number | null;
  chatId?: string | null;
  retryable?: boolean;
  details?: Record<string, unknown>;
}) {
  const {
    supabase,
    clientId,
    leadId,
    accountId,
    status,
    stage,
    invitationId,
    providerId,
    payloadProviderId,
    payloadPublicIdentifier,
    payloadSlug,
    payloadAccountId,
    message,
    errorCode = null,
    unipileStatusCode = null,
    chatId = null,
    retryable = false,
    details = {},
  } = params;

  try {
    await supabase.from("automation_logs").insert({
      client_id: clientId,
      runner: AUTO_DM_RUNNER,
      action: AUTO_DM_ACTION,
      status,
      lead_id: leadId,
      unipile_account_id: accountId,
      details: {
        invitation_id: invitationId,
        lead_id: leadId,
        client_id: clientId,
        account_id: accountId,
        linkedin_provider_id: providerId,
        payload_provider_id: payloadProviderId,
        payload_public_identifier: payloadPublicIdentifier,
        payload_slug: payloadSlug,
        payload_account_id: payloadAccountId,
        step: stage,
        error_code: errorCode,
        error_message: message,
        error_status: unipileStatusCode,
        chat_id: chatId,
        retryable,
        ...details,
      },
    });
  } catch {
    // Logging is best-effort only.
  }
}

async function readRetryState(params: {
  supabase: SupabaseClient;
  clientId: string;
  leadId: number;
  accountId: string;
  invitationId: string;
}): Promise<RetryState> {
  const { supabase, clientId, leadId, accountId, invitationId } = params;
  const { data } = await supabase
    .from("automation_logs")
    .select("created_at, status, details")
    .eq("client_id", clientId)
    .eq("runner", AUTO_DM_RUNNER)
    .eq("action", AUTO_DM_ACTION)
    .eq("lead_id", leadId)
    .eq("unipile_account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(RETRY_HISTORY_LIMIT);

  const rows = (Array.isArray(data) ? data : []) as AutomationLogRow[];
  const retryableRows = rows.filter((row) => {
    const details = toJsonObject(row.details);
    return (
      String(details.invitation_id ?? "") === invitationId &&
      String(row.status ?? "").trim().toLowerCase() === "retryable"
    );
  });

  const attempts = retryableRows.length;
  const lastAttemptAt =
    typeof retryableRows[0]?.created_at === "string" ? retryableRows[0].created_at : null;
  const lastStage = String(toJsonObject(retryableRows[0]?.details).step ?? "").trim().toLowerCase();

  const exhausted = attempts >= MAX_RETRYABLE_ATTEMPTS;
  const cooldownMinutes = lastStage === "resolve_identity"
    ? Math.min(5 * Math.max(1, attempts), 60)
    : Math.min(10 * Math.max(1, attempts), 180);
  const lastAttemptMs = parseIsoToMs(lastAttemptAt);
  const inCooldown =
    !exhausted &&
    lastAttemptMs !== null &&
    Date.now() - lastAttemptMs < cooldownMinutes * 60 * 1000;

  return {
    attempts,
    exhausted,
    inCooldown,
    cooldownMinutes,
    lastAttemptAt,
  };
}

async function claimInvitation(params: {
  supabase: SupabaseClient;
  clientId: string;
  invitationId: string;
  draftText: string;
  currentDraftStatus: string | null;
  currentSentAt: string | null;
}): Promise<{ ok: true; provisionalSentAt: string } | { ok: false; status: "already_sent" | "claim_conflict" }> {
  const { supabase, clientId, invitationId, draftText, currentDraftStatus, currentSentAt } = params;

  if (currentSentAt) {
    return { ok: false, status: "already_sent" };
  }

  if (String(currentDraftStatus ?? "").trim().toLowerCase() !== "draft") {
    return { ok: false, status: "claim_conflict" };
  }

  const provisionalSentAt = new Date().toISOString();
  const { data } = await supabase
    .from("linkedin_invitations")
    .update({
      dm_draft_status: "sent",
      dm_sent_at: provisionalSentAt,
      dm_draft_text: draftText,
      last_error: null,
    })
    .eq("client_id", clientId)
    .eq("id", invitationId)
    .eq("dm_draft_status", "draft")
    .is("dm_sent_at", null)
    .select("id")
    .limit(1)
    .maybeSingle();

  if (!data?.id) {
    return { ok: false, status: "claim_conflict" };
  }

  return { ok: true, provisionalSentAt };
}

async function resetInvitationToRetryable(params: {
  supabase: SupabaseClient;
  clientId: string;
  invitationId: string;
  lastError: string;
  draftText: string;
}) {
  const { supabase, clientId, invitationId, lastError, draftText } = params;
  await supabase
    .from("linkedin_invitations")
    .update({
      dm_draft_status: "draft",
      dm_sent_at: null,
      dm_draft_text: draftText,
      last_error: lastError,
    })
    .eq("client_id", clientId)
    .eq("id", invitationId);
}

async function finalizeInvitationAsSent(params: {
  supabase: SupabaseClient;
  clientId: string;
  invitationId: string;
  sentAt: string;
  lastError: string | null;
  draftText: string;
}) {
  const { supabase, clientId, invitationId, sentAt, lastError, draftText } = params;
  await supabase
    .from("linkedin_invitations")
    .update({
      dm_draft_status: "sent",
      dm_sent_at: sentAt,
      dm_draft_text: draftText,
      last_error: lastError,
    })
    .eq("client_id", clientId)
    .eq("id", invitationId);
}

async function markLeadMessageSent(params: {
  supabase: SupabaseClient;
  clientId: string;
  leadId: number;
  sentAt: string;
  chatId: string | null;
}) {
  const { supabase, clientId, leadId, sentAt, chatId } = params;
  const followupAt = new Date(sentAt);
  if (Number.isNaN(followupAt.getTime())) {
    followupAt.setTime(Date.now());
  }
  followupAt.setDate(followupAt.getDate() + 7);

  const payload: Record<string, unknown> = {
    message_sent: true,
    message_sent_at: sentAt,
    next_followup_at: followupAt.toISOString(),
  };
  if (chatId) payload.unipile_chat_id = chatId;

  await supabase
    .from("leads")
    .update(payload)
    .eq("client_id", clientId)
    .eq("id", leadId);
}

function pickPrimaryFailureDetails(details: unknown): { status: number | null; message: string | null } {
  if (Array.isArray(details)) {
    for (const entry of details) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as { status?: unknown; message?: unknown };
      const status = typeof row.status === "number" ? row.status : null;
      const message = typeof row.message === "string" ? row.message : null;
      if (status !== null || message) {
        return { status, message };
      }
    }
  }

  if (details && typeof details === "object") {
    const row = details as { status?: unknown; message?: unknown; error?: unknown };
    return {
      status: typeof row.status === "number" ? row.status : null,
      message:
        typeof row.message === "string"
          ? row.message
          : typeof row.error === "string"
            ? row.error
            : null,
    };
  }

  return {
    status: null,
    message: typeof details === "string" ? details : null,
  };
}

async function resolveProviderIdViaLookup(params: {
  accountId: string;
  slug: string;
}): Promise<{ providerId: string | null; error: string | null; status: number | null; details: unknown }> {
  const { accountId, slug } = params;
  const baseUrl = normalizeUnipileBase(requireEnv("UNIPILE_DSN"));
  const apiKey = requireEnv("UNIPILE_API_KEY");
  const url = `${baseUrl}/api/v1/users/${encodeURIComponent(slug)}?account_id=${encodeURIComponent(accountId)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-KEY": apiKey,
        accept: "application/json",
      },
    });
    const payload = await readResponseBody(response);

    if (!response.ok) {
      return {
        providerId: null,
        error: "provider_lookup_failed",
        status: response.status,
        details: payload,
      };
    }

    const providerId = extractPayloadProviderId(toJsonObject(payload));
    if (!providerId) {
      return {
        providerId: null,
        error: "provider_lookup_missing_provider_id",
        status: response.status,
        details: payload,
      };
    }

    return {
      providerId,
      error: null,
      status: response.status,
      details: payload,
    };
  } catch (error: unknown) {
    return {
      providerId: null,
      error: "provider_lookup_request_failed",
      status: null,
      details: String(error ?? "unknown_error"),
    };
  }
}

async function findProviderIdInInvitationHistory(params: {
  supabase: SupabaseClient;
  clientId: string;
  leadId: number;
  accountId: string;
  currentInvitationId: string;
  payloadOverride?: JsonObject | null;
}): Promise<{ providerId: string | null; invitationId: string | null }> {
  const { supabase, clientId, leadId, accountId, currentInvitationId, payloadOverride } = params;
  const { data } = await supabase
    .from("linkedin_invitations")
    .select("id, raw, unipile_account_id")
    .eq("client_id", clientId)
    .eq("lead_id", leadId)
    .eq("unipile_account_id", accountId)
    .order("accepted_at", { ascending: false, nullsFirst: false })
    .order("sent_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(25);

  const rows = Array.isArray(data) ? data : [];
  const orderedRows = rows
    .map((row) => ({
      id: String((row as { id?: unknown }).id ?? "").trim(),
      raw: (row as { raw?: unknown }).raw,
    }))
    .sort((a, b) => {
      if (a.id === currentInvitationId) return -1;
      if (b.id === currentInvitationId) return 1;
      return 0;
    });

  for (const row of orderedRows) {
    const candidates = buildInvitationCandidates(
      row.raw,
      row.id === currentInvitationId ? payloadOverride ?? null : null
    );
    for (const candidate of candidates) {
      const providerId = extractPayloadProviderId(candidate);
      if (providerId) {
        return { providerId, invitationId: row.id };
      }
    }
  }

  return { providerId: null, invitationId: null };
}

async function resolveIdentity(params: {
  supabase: SupabaseClient;
  clientId: string;
  invitation: AutoDmInvitationRow;
  lead: AutoDmLeadRow;
  payloadOverride?: JsonObject | null;
}): Promise<ResolvedIdentity> {
  const { supabase, clientId, invitation, payloadOverride } = params;
  let lead = params.lead;

  const payloadContext = extractPayloadContext(invitation.raw, payloadOverride);

  let syncResult: unknown = null;
  try {
    syncResult = await syncLeadProviderFromRelationPayload({
      supabase,
      raw: invitation.raw,
      eventId: invitation.id,
      clientId,
      unipileAccountId: invitation.unipile_account_id,
      leadIdHint: invitation.lead_id,
    });
  } catch (error) {
    syncResult = { error: String(error ?? "sync_failed") };
  }

  const reloadedLead = await loadLead({
    supabase,
    clientId,
    leadId: invitation.lead_id,
  });
  if (reloadedLead) {
    lead = reloadedLead;
  }

  const existingLeadProviderId = String(lead.linkedin_provider_id ?? "").trim() || null;
  if (isValidLinkedinProviderId(existingLeadProviderId)) {
    return {
      providerId: existingLeadProviderId,
      source: "lead.linkedin_provider_id",
      resolvedViaLookup: false,
      invitationCandidateId: invitation.id,
      lookupInput: null,
      syncResult,
      ...payloadContext,
    };
  }

  if (payloadContext.payloadProviderId) {
    return {
      providerId: payloadContext.payloadProviderId,
      source: "payload.provider_id",
      resolvedViaLookup: false,
      invitationCandidateId: invitation.id,
      lookupInput: null,
      syncResult,
      ...payloadContext,
    };
  }

  const historyHit = await findProviderIdInInvitationHistory({
    supabase,
    clientId,
    leadId: invitation.lead_id,
    accountId: invitation.unipile_account_id,
    currentInvitationId: invitation.id,
    payloadOverride,
  });
  if (historyHit.providerId) {
    if (!existingLeadProviderId) {
      await supabase
        .from("leads")
        .update({ linkedin_provider_id: historyHit.providerId })
        .eq("client_id", clientId)
        .eq("id", invitation.lead_id);
    }

    return {
      providerId: historyHit.providerId,
      source: "invitation_history.provider_id",
      resolvedViaLookup: false,
      invitationCandidateId: historyHit.invitationId,
      lookupInput: null,
      syncResult,
      ...payloadContext,
    };
  }

  const leadPublicIdentifier = decodeAndNormalizeSlug(lead.linkedin_public_identifier ?? null);
  const leadSlug = decodeAndNormalizeSlug(extractLinkedInProfileSlug(getLeadLinkedInUrl(lead)));
  const lookupCandidates: Array<{
    source: ResolvedIdentity["source"];
    value: string | null;
  }> = [
    { source: "lead.public_identifier_lookup", value: leadPublicIdentifier },
    { source: "payload.public_identifier_lookup", value: payloadContext.payloadPublicIdentifier },
    { source: "payload.slug_lookup", value: payloadContext.payloadSlug },
    { source: "lead.slug_lookup", value: leadSlug },
  ];

  for (const candidate of lookupCandidates) {
    if (!candidate.value) continue;
    const lookup = await resolveProviderIdViaLookup({
      accountId: invitation.unipile_account_id,
      slug: candidate.value,
    });

    if (!lookup.providerId) continue;

    await supabase
      .from("leads")
      .update({ linkedin_provider_id: lookup.providerId })
      .eq("client_id", clientId)
      .eq("id", invitation.lead_id);

    return {
      providerId: lookup.providerId,
      source: candidate.source,
      resolvedViaLookup: true,
      invitationCandidateId: invitation.id,
      lookupInput: candidate.value,
      syncResult,
      ...payloadContext,
    };
  }

  return {
    providerId: null,
    source: "none",
    resolvedViaLookup: false,
    invitationCandidateId: null,
    lookupInput: leadPublicIdentifier ?? payloadContext.payloadPublicIdentifier ?? payloadContext.payloadSlug ?? leadSlug,
    syncResult,
    ...payloadContext,
  };
}

function buildLastError(params: {
  stage: AcceptedInvitationAutoDmResult["stage"];
  code: string;
  extra?: string | number | null;
}): string {
  const suffix =
    params.extra === null || params.extra === undefined || String(params.extra).trim() === ""
      ? ""
      : ` (${String(params.extra).trim()})`;
  return `auto_send: ${params.stage}: ${params.code}${suffix}`;
}

export async function processAcceptedInvitationAutoDm(params: {
  supabase: SupabaseClient;
  clientId: string;
  invitationId: string;
  leadId: number;
  unipileAccountId: string;
  payload?: JsonObject | null;
}): Promise<AcceptedInvitationAutoDmResult> {
  const { supabase, clientId, invitationId, leadId, unipileAccountId, payload = null } = params;

  const invitation = await loadInvitation({ supabase, clientId, invitationId });
  if (!invitation) {
    return {
      ok: false,
      status: "invitation_not_found",
      invitationId,
      leadId,
      skipped: true,
      retryable: false,
      stage: "skip",
      providerId: null,
      unipileThreadId: null,
      threadCreated: false,
      sentAt: null,
      lastError: "invitation_not_found",
    };
  }

  const lead = await loadLead({ supabase, clientId, leadId });
  if (!lead) {
    const lastError = "auto_send: lead_not_found";
    await supabase
      .from("linkedin_invitations")
      .update({ last_error: lastError })
      .eq("client_id", clientId)
      .eq("id", invitation.id);

    await logAutoDm({
      supabase,
      clientId,
      leadId,
      accountId: unipileAccountId,
      status: "error",
      stage: "skip",
      invitationId: invitation.id,
      providerId: null,
      payloadProviderId: null,
      payloadPublicIdentifier: null,
      payloadSlug: null,
      payloadAccountId: null,
      message: "lead_not_found",
      errorCode: "lead_not_found",
    });

    return {
      ok: false,
      status: "lead_not_found",
      invitationId: invitation.id,
      leadId,
      skipped: true,
      retryable: false,
      stage: "skip",
      providerId: null,
      unipileThreadId: null,
      threadCreated: false,
      sentAt: null,
      lastError,
    };
  }

  const payloadContext = extractPayloadContext(invitation.raw, payload);

  if (String(invitation.status ?? "").trim().toLowerCase() !== "accepted") {
    await logAutoDm({
      supabase,
      clientId,
      leadId,
      accountId: unipileAccountId,
      status: "skipped",
      stage: "skip",
      invitationId: invitation.id,
      providerId: String(lead.linkedin_provider_id ?? "").trim() || null,
      payloadProviderId: payloadContext.payloadProviderId,
      payloadPublicIdentifier: payloadContext.payloadPublicIdentifier,
      payloadSlug: payloadContext.payloadSlug,
      payloadAccountId: payloadContext.payloadAccountId,
      message: "invitation_not_accepted",
      errorCode: "invitation_not_accepted",
    });

    return {
      ok: false,
      status: "not_accepted",
      invitationId: invitation.id,
      leadId,
      skipped: true,
      retryable: false,
      stage: "skip",
      providerId: String(lead.linkedin_provider_id ?? "").trim() || null,
      unipileThreadId: null,
      threadCreated: false,
      sentAt: null,
      lastError: invitation.last_error,
    };
  }

  const normalizedLeadLinkedInUrl = normalizeLinkedInUrl(getLeadLinkedInUrl(lead));
  const existingThread = await findExistingThreadForLead({
    supabase,
    clientId,
    leadId,
    unipileAccountId,
    normalizedLeadLinkedInUrl,
  });
  const existingThreadDbId = existingThread?.threadDbId ?? null;
  const existingUnipileThreadId = existingThread?.unipileThreadId ?? getLeadThreadId(lead);

  if (invitation.dm_sent_at || lead.message_sent === true) {
    const alreadySentAt =
      invitation.dm_sent_at ??
      (typeof lead.message_sent_at === "string" ? lead.message_sent_at : null) ??
      new Date().toISOString();

    await finalizeInvitationAsSent({
      supabase,
      clientId,
      invitationId: invitation.id,
      sentAt: alreadySentAt,
      lastError: null,
      draftText:
        String(invitation.dm_draft_text ?? lead.internal_message ?? "").trim() ||
        String(invitation.dm_draft_text ?? "").trim(),
    });

    await logAutoDm({
      supabase,
      clientId,
      leadId,
      accountId: unipileAccountId,
      status: "skipped",
      stage: "skip",
      invitationId: invitation.id,
      providerId: String(lead.linkedin_provider_id ?? "").trim() || null,
      payloadProviderId: payloadContext.payloadProviderId,
      payloadPublicIdentifier: payloadContext.payloadPublicIdentifier,
      payloadSlug: payloadContext.payloadSlug,
      payloadAccountId: payloadContext.payloadAccountId,
      message: "first_message_already_sent",
      errorCode: "already_sent",
      chatId: existingUnipileThreadId,
      details: {
        existing_thread_db_id: existingThreadDbId,
      },
    });

    return {
      ok: false,
      status: "already_sent",
      invitationId: invitation.id,
      leadId,
      skipped: true,
      retryable: false,
      stage: "skip",
      providerId: String(lead.linkedin_provider_id ?? "").trim() || null,
      unipileThreadId: existingUnipileThreadId,
      threadCreated: false,
      sentAt: alreadySentAt,
      lastError: null,
    };
  }

  const retryState = await readRetryState({
    supabase,
    clientId,
    leadId,
    accountId: unipileAccountId,
    invitationId: invitation.id,
  });

  if (retryState.exhausted) {
    const lastError = buildLastError({
      stage: "resolve_identity",
      code: "retry_limit_exceeded",
      extra: retryState.attempts,
    });

    await supabase
      .from("linkedin_invitations")
      .update({ last_error: lastError })
      .eq("client_id", clientId)
      .eq("id", invitation.id);

    await logAutoDm({
      supabase,
      clientId,
      leadId,
      accountId: unipileAccountId,
      status: "error",
      stage: "skip",
      invitationId: invitation.id,
      providerId: String(lead.linkedin_provider_id ?? "").trim() || null,
      payloadProviderId: payloadContext.payloadProviderId,
      payloadPublicIdentifier: payloadContext.payloadPublicIdentifier,
      payloadSlug: payloadContext.payloadSlug,
      payloadAccountId: payloadContext.payloadAccountId,
      message: "retry_limit_exceeded",
      errorCode: "retry_limit_exceeded",
      details: {
        retry_attempts: retryState.attempts,
        last_attempt_at: retryState.lastAttemptAt,
      },
    });

    return {
      ok: false,
      status: "retry_exhausted",
      invitationId: invitation.id,
      leadId,
      skipped: true,
      retryable: false,
      stage: "skip",
      providerId: String(lead.linkedin_provider_id ?? "").trim() || null,
      unipileThreadId: existingUnipileThreadId,
      threadCreated: false,
      sentAt: null,
      lastError,
      details: {
        retry_attempts: retryState.attempts,
        last_attempt_at: retryState.lastAttemptAt,
      },
    };
  }

  if (retryState.inCooldown) {
    await logAutoDm({
      supabase,
      clientId,
      leadId,
      accountId: unipileAccountId,
      status: "skipped",
      stage: "skip",
      invitationId: invitation.id,
      providerId: String(lead.linkedin_provider_id ?? "").trim() || null,
      payloadProviderId: payloadContext.payloadProviderId,
      payloadPublicIdentifier: payloadContext.payloadPublicIdentifier,
      payloadSlug: payloadContext.payloadSlug,
      payloadAccountId: payloadContext.payloadAccountId,
      message: "retry_deferred_by_cooldown",
      errorCode: "retry_deferred",
      details: {
        retry_attempts: retryState.attempts,
        cooldown_minutes: retryState.cooldownMinutes,
        last_attempt_at: retryState.lastAttemptAt,
      },
    });

    return {
      ok: false,
      status: "retry_deferred",
      invitationId: invitation.id,
      leadId,
      skipped: true,
      retryable: true,
      stage: "skip",
      providerId: String(lead.linkedin_provider_id ?? "").trim() || null,
      unipileThreadId: existingUnipileThreadId,
      threadCreated: false,
      sentAt: null,
      lastError: invitation.last_error,
      details: {
        retry_attempts: retryState.attempts,
        cooldown_minutes: retryState.cooldownMinutes,
        last_attempt_at: retryState.lastAttemptAt,
      },
    };
  }

  const draftText = String(invitation.dm_draft_text ?? lead.internal_message ?? "").trim();
  if (!draftText) {
    const lastError = "draft_text_empty";
    await supabase
      .from("linkedin_invitations")
      .update({
        dm_draft_status: "none",
        dm_sent_at: null,
        last_error: lastError,
      })
      .eq("client_id", clientId)
      .eq("id", invitation.id);

    await logAutoDm({
      supabase,
      clientId,
      leadId,
      accountId: unipileAccountId,
      status: "skipped",
      stage: "skip",
      invitationId: invitation.id,
      providerId: String(lead.linkedin_provider_id ?? "").trim() || null,
      payloadProviderId: payloadContext.payloadProviderId,
      payloadPublicIdentifier: payloadContext.payloadPublicIdentifier,
      payloadSlug: payloadContext.payloadSlug,
      payloadAccountId: payloadContext.payloadAccountId,
      message: lastError,
      errorCode: lastError,
      chatId: existingUnipileThreadId,
    });

    return {
      ok: false,
      status: "draft_not_ready",
      invitationId: invitation.id,
      leadId,
      skipped: true,
      retryable: false,
      stage: "skip",
      providerId: String(lead.linkedin_provider_id ?? "").trim() || null,
      unipileThreadId: existingUnipileThreadId,
      threadCreated: false,
      sentAt: null,
      lastError,
    };
  }

  const claim = await claimInvitation({
    supabase,
    clientId,
    invitationId: invitation.id,
    draftText,
    currentDraftStatus: invitation.dm_draft_status,
    currentSentAt: invitation.dm_sent_at,
  });

  if (!claim.ok) {
    const status = claim.status === "already_sent" ? "already_sent" : "claim_conflict";
    await logAutoDm({
      supabase,
      clientId,
      leadId,
      accountId: unipileAccountId,
      status: "skipped",
      stage: "claim",
      invitationId: invitation.id,
      providerId: String(lead.linkedin_provider_id ?? "").trim() || null,
      payloadProviderId: payloadContext.payloadProviderId,
      payloadPublicIdentifier: payloadContext.payloadPublicIdentifier,
      payloadSlug: payloadContext.payloadSlug,
      payloadAccountId: payloadContext.payloadAccountId,
      message: status,
      errorCode: status,
      chatId: existingUnipileThreadId,
    });

    return {
      ok: false,
      status,
      invitationId: invitation.id,
      leadId,
      skipped: true,
      retryable: false,
      stage: "claim",
      providerId: String(lead.linkedin_provider_id ?? "").trim() || null,
      unipileThreadId: existingUnipileThreadId,
      threadCreated: false,
      sentAt: claim.status === "already_sent" ? invitation.dm_sent_at : null,
      lastError: invitation.last_error,
    };
  }

  const identity = await resolveIdentity({
    supabase,
    clientId,
    invitation,
    lead,
    payloadOverride: payload,
  });

  if (!identity.providerId && !existingUnipileThreadId) {
    const lastError = buildLastError({
      stage: "resolve_identity",
      code: "provider_id_missing",
      extra: identity.lookupInput,
    });

    await resetInvitationToRetryable({
      supabase,
      clientId,
      invitationId: invitation.id,
      lastError,
      draftText,
    });

    await logAutoDm({
      supabase,
      clientId,
      leadId,
      accountId: unipileAccountId,
      status: "retryable",
      stage: "resolve_identity",
      invitationId: invitation.id,
      providerId: null,
      payloadProviderId: identity.payloadProviderId,
      payloadPublicIdentifier: identity.payloadPublicIdentifier,
      payloadSlug: identity.payloadSlug,
      payloadAccountId: identity.payloadAccountId,
      message: "provider_id_missing",
      errorCode: "provider_id_missing",
      retryable: true,
      chatId: existingUnipileThreadId,
      details: {
        provider_resolution_source: identity.source,
        lookup_input: identity.lookupInput,
        invitation_candidate_id: identity.invitationCandidateId,
        sync_result: identity.syncResult,
        existing_thread_db_id: existingThreadDbId,
      },
    });

    return {
      ok: false,
      status: "resolve_identity_failed",
      invitationId: invitation.id,
      leadId,
      skipped: false,
      retryable: true,
      stage: "resolve_identity",
      providerId: null,
      unipileThreadId: existingUnipileThreadId,
      threadCreated: false,
      sentAt: null,
      lastError,
      details: {
        provider_resolution_source: identity.source,
        lookup_input: identity.lookupInput,
        invitation_candidate_id: identity.invitationCandidateId,
        sync_result: identity.syncResult,
      },
    };
  }

  const sendResult = await ensureThreadAndSendMessage({
    supabase,
    clientId,
    leadId,
    text: draftText,
    leadLinkedInUrl: getLeadLinkedInUrl(lead),
    contactName: getLeadDisplayName(lead),
    unipileAccountId,
    providerId: identity.providerId,
    existingThreadDbId,
    existingUnipileThreadId,
  });

  if (!sendResult.ok) {
    const primaryFailure = pickPrimaryFailureDetails(sendResult.details);
    const mappedStatus =
      sendResult.status === "conversation_create_failed"
        ? "create_chat_failed"
        : sendResult.status === "thread_upsert_failed"
          ? "thread_upsert_failed"
          : sendResult.status === "message_persist_failed"
            ? "persist_message_failed"
            : sendResult.status === "send_failed"
              ? "send_failed"
              : "resolve_identity_failed";
    const stage =
      sendResult.status === "conversation_create_failed"
        ? "create_chat"
        : sendResult.status === "thread_upsert_failed"
          ? "create_chat"
          : sendResult.status === "message_persist_failed"
            ? "persist_message"
            : sendResult.status === "send_failed"
              ? "send_message"
              : "resolve_identity";
    const retryable = sendResult.status !== "message_persist_failed";
    const lastError = buildLastError({
      stage,
      code: sendResult.status,
      extra: primaryFailure.status ?? primaryFailure.message,
    });

    if (retryable) {
      await resetInvitationToRetryable({
        supabase,
        clientId,
        invitationId: invitation.id,
        lastError,
        draftText,
      });
    } else {
      const sentAt = claim.provisionalSentAt;
      await finalizeInvitationAsSent({
        supabase,
        clientId,
        invitationId: invitation.id,
        sentAt,
        lastError,
        draftText,
      });
      await markLeadMessageSent({
        supabase,
        clientId,
        leadId,
        sentAt,
        chatId: sendResult.unipileThreadId,
      });
    }

    await logAutoDm({
      supabase,
      clientId,
      leadId,
      accountId: unipileAccountId,
      status: retryable ? "retryable" : "error",
      stage,
      invitationId: invitation.id,
      providerId: identity.providerId,
      payloadProviderId: identity.payloadProviderId,
      payloadPublicIdentifier: identity.payloadPublicIdentifier,
      payloadSlug: identity.payloadSlug,
      payloadAccountId: identity.payloadAccountId,
      message: sendResult.userMessage,
      errorCode: sendResult.status,
      unipileStatusCode: primaryFailure.status,
      retryable,
      chatId: sendResult.unipileThreadId ?? existingUnipileThreadId,
      details: {
        provider_resolution_source: identity.source,
        invitation_candidate_id: identity.invitationCandidateId,
        lookup_input: identity.lookupInput,
        sync_result: identity.syncResult,
        existing_thread_db_id: existingThreadDbId,
        send_details: sendResult.details ?? null,
      },
    });

    return {
      ok: false,
      status: mappedStatus,
      invitationId: invitation.id,
      leadId,
      skipped: false,
      retryable,
      stage,
      providerId: identity.providerId,
      unipileThreadId: sendResult.unipileThreadId ?? existingUnipileThreadId,
      threadCreated: false,
      sentAt: retryable ? null : claim.provisionalSentAt,
      lastError,
      details: sendResult.details ?? null,
    };
  }

  await finalizeInvitationAsSent({
    supabase,
    clientId,
    invitationId: invitation.id,
    sentAt: sendResult.sentAt,
    lastError: null,
    draftText,
  });

  await markLeadMessageSent({
    supabase,
    clientId,
    leadId,
    sentAt: sendResult.sentAt,
    chatId: sendResult.unipileThreadId,
  });

  await logAutoDm({
    supabase,
    clientId,
    leadId,
    accountId: unipileAccountId,
    status: "success",
    stage: "complete",
    invitationId: invitation.id,
    providerId: sendResult.providerId,
    payloadProviderId: identity.payloadProviderId,
    payloadPublicIdentifier: identity.payloadPublicIdentifier,
    payloadSlug: identity.payloadSlug,
    payloadAccountId: identity.payloadAccountId,
    message: "auto_dm_sent",
    chatId: sendResult.unipileThreadId,
    details: {
      provider_resolution_source: identity.source,
      invitation_candidate_id: identity.invitationCandidateId,
      lookup_input: identity.lookupInput,
      sync_result: identity.syncResult,
      existing_thread_db_id: existingThreadDbId,
      thread_created: sendResult.threadCreated,
      unipile_message_id: sendResult.unipileMessageId,
    },
  });

  return {
    ok: true,
    status: "sent",
    invitationId: invitation.id,
    leadId,
    skipped: false,
    retryable: false,
    stage: "complete",
    providerId: sendResult.providerId,
    unipileThreadId: sendResult.unipileThreadId,
    threadCreated: sendResult.threadCreated,
    sentAt: sendResult.sentAt,
    lastError: null,
    details: {
      provider_resolution_source: identity.source,
      invitation_candidate_id: identity.invitationCandidateId,
      lookup_input: identity.lookupInput,
    },
  };
}
