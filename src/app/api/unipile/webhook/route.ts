import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  extractLinkedInProfileSlug,
  normalizeLinkedInUrl,
} from "@/lib/linkedin-url";

type JsonObject = Record<string, unknown>;

type LeadRow = {
  id: number | string;
  LinkedInURL: string | null;
};

type MatchResult = {
  leadId: number | string | null;
  strategy: "url_exact" | "slug_match" | "fallback_last_sent" | "none";
  uncertain: boolean;
  matchedLinkedInUrl: string | null;
  matchedSlug: string | null;
};

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function toObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function getPathValue(obj: JsonObject, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }
    current = (current as JsonObject)[key];
  }
  return current;
}

function getFirstString(obj: JsonObject, paths: string[][]): string | null {
  for (const path of paths) {
    const value = getPathValue(obj, path);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function normalizeEventType(rawEvent: string | null): string {
  if (!rawEvent) return "UNKNOWN";
  return rawEvent.trim().replace(/\s+/g, "_").replace(/-/g, "_").toUpperCase();
}

function isNewRelationEvent(eventType: string, payload: JsonObject): boolean {
  if (eventType.includes("NEW_RELATION")) return true;

  const relationHint = getFirstString(payload, [
    ["event", "name"],
    ["trigger"],
    ["action"],
  ]);

  return Boolean(relationHint && /new[\s_-]*relation/i.test(relationHint));
}

function extractUnipileAccountId(payload: JsonObject): string | null {
  return getFirstString(payload, [
    ["account_id"],
    ["accountId"],
    ["account", "id"],
    ["account", "account_id"],
    ["data", "account_id"],
    ["data", "accountId"],
  ]);
}

function extractEventType(payload: JsonObject): string {
  const rawType = getFirstString(payload, [
    ["event_type"],
    ["eventType"],
    ["event"],
    ["type"],
    ["name"],
    ["event", "type"],
    ["event", "name"],
    ["trigger"],
    ["action"],
  ]);

  return normalizeEventType(rawType);
}

function extractCounterpartIdentity(payload: JsonObject): {
  normalizedUrl: string | null;
  slug: string | null;
} {
  const urlCandidate = getFirstString(payload, [
    ["profile_url"],
    ["profileUrl"],
    ["linkedin_url"],
    ["linkedinUrl"],
    ["user", "profile_url"],
    ["user", "profileUrl"],
    ["contact", "profile_url"],
    ["contact", "profileUrl"],
    ["contact", "linkedin_url"],
    ["contact", "linkedinUrl"],
    ["relation", "profile_url"],
    ["relation", "profileUrl"],
    ["relation", "linkedin_url"],
    ["relation", "linkedinUrl"],
    ["counterpart", "profile_url"],
    ["counterpart", "profileUrl"],
    ["counterpart", "linkedin_url"],
    ["counterpart", "linkedinUrl"],
    ["attendee", "profile_url"],
    ["attendee", "profileUrl"],
    ["attendee", "linkedin_url"],
    ["attendee", "linkedinUrl"],
  ]);

  const slugCandidate = getFirstString(payload, [
    ["public_identifier"],
    ["publicIdentifier"],
    ["provider_id"],
    ["providerId"],
    ["contact", "public_identifier"],
    ["contact", "publicIdentifier"],
    ["contact", "provider_id"],
    ["contact", "providerId"],
    ["relation", "public_identifier"],
    ["relation", "publicIdentifier"],
    ["relation", "provider_id"],
    ["relation", "providerId"],
    ["counterpart", "public_identifier"],
    ["counterpart", "publicIdentifier"],
    ["counterpart", "provider_id"],
    ["counterpart", "providerId"],
  ]);

  return {
    normalizedUrl: normalizeLinkedInUrl(urlCandidate),
    slug: extractLinkedInProfileSlug(slugCandidate) ?? slugCandidate?.toLowerCase() ?? null,
  };
}

async function findLeadFromIdentity(params: {
  supabase: SupabaseClient;
  clientId: string;
  normalizedUrl: string | null;
  slug: string | null;
}): Promise<MatchResult> {
  const { supabase, clientId, normalizedUrl, slug } = params;

  if (!normalizedUrl && !slug) {
    return {
      leadId: null,
      strategy: "none",
      uncertain: true,
      matchedLinkedInUrl: null,
      matchedSlug: null,
    };
  }

  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, LinkedInURL")
    .eq("client_id", clientId)
    .not("LinkedInURL", "is", null);

  if (error || !Array.isArray(leads)) {
    console.error("UNIPILE_WEBHOOK_LEADS_LOOKUP_ERROR:", error);
    return {
      leadId: null,
      strategy: "none",
      uncertain: true,
      matchedLinkedInUrl: normalizedUrl,
      matchedSlug: slug,
    };
  }

  const leadRows = leads as LeadRow[];

  if (normalizedUrl) {
    const exact = leadRows.find(
      (lead) => normalizeLinkedInUrl(lead.LinkedInURL) === normalizedUrl
    );
    if (exact?.id !== undefined && exact?.id !== null) {
      return {
        leadId: exact.id,
        strategy: "url_exact",
        uncertain: false,
        matchedLinkedInUrl: normalizedUrl,
        matchedSlug: slug,
      };
    }
  }

  if (slug) {
    const bySlug = leadRows.find(
      (lead) => extractLinkedInProfileSlug(lead.LinkedInURL) === slug
    );
    if (bySlug?.id !== undefined && bySlug?.id !== null) {
      return {
        leadId: bySlug.id,
        strategy: "slug_match",
        uncertain: false,
        matchedLinkedInUrl: normalizedUrl,
        matchedSlug: slug,
      };
    }
  }

  return {
    leadId: null,
    strategy: "none",
    uncertain: true,
    matchedLinkedInUrl: normalizedUrl,
    matchedSlug: slug,
  };
}

async function markInvitationAccepted(params: {
  supabase: SupabaseClient;
  clientId: string;
  leadId: number | string;
  unipileAccountId: string;
  payload: JsonObject;
  match: MatchResult;
}) {
  const { supabase, clientId, leadId, unipileAccountId, payload, match } = params;
  const now = new Date().toISOString();
  const acceptanceRaw = {
    webhook_payload: payload,
    matching: {
      strategy: match.strategy,
      uncertain: match.uncertain,
      normalized_linkedin_url: match.matchedLinkedInUrl,
      profile_slug: match.matchedSlug,
    },
  };

  const { data: sentInvitation, error: sentLookupErr } = await supabase
    .from("linkedin_invitations")
    .select("id, raw")
    .eq("client_id", clientId)
    .eq("lead_id", leadId)
    .eq("unipile_account_id", unipileAccountId)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sentLookupErr) {
    console.error("UNIPILE_WEBHOOK_SENT_LOOKUP_ERROR:", sentLookupErr);
  }

  if (sentInvitation?.id !== undefined && sentInvitation?.id !== null) {
    const mergedRaw = {
      invitation: sentInvitation.raw ?? null,
      acceptance: acceptanceRaw,
    };

    const { error: updateErr } = await supabase
      .from("linkedin_invitations")
      .update({
        status: "accepted",
        accepted_at: now,
        raw: mergedRaw,
      })
      .eq("id", sentInvitation.id)
      .eq("client_id", clientId);

    if (updateErr) {
      console.error("UNIPILE_WEBHOOK_SENT_UPDATE_ERROR:", updateErr);
    }
    return;
  }

  const { data: acceptedInvitation, error: acceptedLookupErr } = await supabase
    .from("linkedin_invitations")
    .select("id")
    .eq("client_id", clientId)
    .eq("lead_id", leadId)
    .eq("unipile_account_id", unipileAccountId)
    .eq("status", "accepted")
    .limit(1)
    .maybeSingle();

  if (acceptedLookupErr) {
    console.error("UNIPILE_WEBHOOK_ACCEPTED_LOOKUP_ERROR:", acceptedLookupErr);
  }

  if (acceptedInvitation?.id) return;

  const { error: insertErr } = await supabase.from("linkedin_invitations").insert({
    client_id: clientId,
    lead_id: leadId,
    unipile_account_id: unipileAccountId,
    status: "accepted",
    accepted_at: now,
    raw: acceptanceRaw,
  });

  if (insertErr) {
    console.error("UNIPILE_WEBHOOK_ACCEPTED_INSERT_ERROR:", insertErr);
  }
}

async function fallbackAcceptLastSent(params: {
  supabase: SupabaseClient;
  clientId: string;
  unipileAccountId: string;
  payload: JsonObject;
  match: MatchResult;
}): Promise<number | string | null> {
  const { supabase, clientId, unipileAccountId, payload, match } = params;
  const now = new Date().toISOString();

  const { data: lastSent, error: lastSentErr } = await supabase
    .from("linkedin_invitations")
    .select("id, lead_id, raw")
    .eq("client_id", clientId)
    .eq("unipile_account_id", unipileAccountId)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastSentErr) {
    console.error("UNIPILE_WEBHOOK_LAST_SENT_LOOKUP_ERROR:", lastSentErr);
    return null;
  }

  if (!lastSent?.id || lastSent?.lead_id === null || lastSent?.lead_id === undefined) {
    return null;
  }

  const mergedRaw = {
    invitation: lastSent.raw ?? null,
    acceptance: {
      webhook_payload: payload,
      matching: {
        strategy: "fallback_last_sent",
        uncertain: true,
        normalized_linkedin_url: match.matchedLinkedInUrl,
        profile_slug: match.matchedSlug,
      },
    },
  };

  const { error: updateErr } = await supabase
    .from("linkedin_invitations")
    .update({
      status: "accepted",
      accepted_at: now,
      raw: mergedRaw,
    })
    .eq("id", lastSent.id)
    .eq("client_id", clientId);

  if (updateErr) {
    console.error("UNIPILE_WEBHOOK_LAST_SENT_UPDATE_ERROR:", updateErr);
    return null;
  }

  return lastSent.lead_id;
}

export async function POST(req: Request) {
  try {
    const webhookSecret = requireEnv("UNIPILE_WEBHOOK_SECRET");
    const receivedSecret = req.headers.get("x-unipile-secret");
    if (!receivedSecret || receivedSecret !== webhookSecret) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const payloadInput = await req.json().catch(() => ({}));
    const payload = toObject(payloadInput);
    const eventType = extractEventType(payload);
    const unipileAccountId = extractUnipileAccountId(payload);

    const supabase = createClient(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY")
    );

    let clientId: string | null = null;

    if (unipileAccountId) {
      const { data: account, error: accountErr } = await supabase
        .from("unipile_accounts")
        .select("client_id")
        .eq("provider", "linkedin")
        .eq("unipile_account_id", unipileAccountId)
        .limit(1)
        .maybeSingle();

      if (accountErr) {
        console.error("UNIPILE_WEBHOOK_ACCOUNT_LOOKUP_ERROR:", accountErr);
      } else if (account?.client_id) {
        clientId = String(account.client_id);
      }
    }

    const { error: eventLogErr } = await supabase.from("unipile_events").insert({
      provider: "linkedin",
      event_type: eventType,
      received_at: new Date().toISOString(),
      raw: payload,
      unipile_account_id: unipileAccountId,
      client_id: clientId,
    });

    if (eventLogErr) {
      console.error("UNIPILE_WEBHOOK_EVENT_LOG_ERROR:", eventLogErr);
    }

    if (!isNewRelationEvent(eventType, payload)) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    if (!clientId || !unipileAccountId) {
      console.error("UNIPILE_WEBHOOK_MISSING_ACCOUNT_OR_CLIENT", {
        eventType,
        unipileAccountId,
      });
      return NextResponse.json({ ok: true, mapped: false });
    }

    const identity = extractCounterpartIdentity(payload);
    let match = await findLeadFromIdentity({
      supabase,
      clientId,
      normalizedUrl: identity.normalizedUrl,
      slug: identity.slug,
    });

    if (match.leadId !== null) {
      await markInvitationAccepted({
        supabase,
        clientId,
        leadId: match.leadId,
        unipileAccountId,
        payload,
        match,
      });
      return NextResponse.json({ ok: true, mapped: true, strategy: match.strategy });
    }

    const fallbackLeadId = await fallbackAcceptLastSent({
      supabase,
      clientId,
      unipileAccountId,
      payload,
      match,
    });

    if (fallbackLeadId !== null) {
      match = {
        ...match,
        leadId: fallbackLeadId,
        strategy: "fallback_last_sent",
        uncertain: true,
      };
      return NextResponse.json({ ok: true, mapped: true, strategy: match.strategy });
    }

    return NextResponse.json({ ok: true, mapped: false });
  } catch (error: unknown) {
    console.error("UNIPILE_WEBHOOK_ERROR:", error);
    return NextResponse.json({ ok: true });
  }
}
