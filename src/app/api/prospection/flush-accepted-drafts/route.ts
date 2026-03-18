import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { processAcceptedInvitationAutoDm } from "@/lib/linkedin-auto-dm";
import {
  createServiceSupabase,
  getClientIdFromClerkUser,
  getLinkedinUnipileAccountId,
} from "@/lib/inbox-server";

export const maxDuration = 300;

type InvitationRow = {
  id: string;
  lead_id: number;
  accepted_at: string | null;
  last_error: string | null;
};

type SendResult =
  | { ok: true; invitation_id: string; lead_id: number; mode: string }
  | { ok: false; invitation_id: string; lead_id: number; error: string; details?: unknown; skipped?: boolean };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function flushClientDrafts(params: {
  supabase: SupabaseClient;
  clientId: string;
  unipileAccountId: string;
  delayMs: number;
  todayOnly: boolean;
  includeRecentRetryables?: boolean;
  retryableLookbackDays?: number;
}): Promise<{ total: number; sent: number; failed: number; skipped: number; results: SendResult[] }> {
  const {
    supabase,
    clientId,
    unipileAccountId,
    delayMs,
    todayOnly,
    includeRecentRetryables = false,
    retryableLookbackDays = 3,
  } = params;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();
  const retryableLookbackStartMs =
    Date.now() - Math.max(1, retryableLookbackDays) * 24 * 60 * 60 * 1000;

  let query = supabase
    .from("linkedin_invitations")
    .select("id, lead_id, accepted_at, last_error")
    .eq("client_id", clientId)
    .eq("status", "accepted")
    .not("dm_draft_status", "eq", "sent")
    .order("accepted_at", { ascending: true });

  if (todayOnly) {
    query = query.gte("accepted_at", todayStart.toISOString());
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const invitations = (Array.isArray(data) ? data : []) as InvitationRow[];
  const filteredInvitations = invitations.filter((invitation) => {
    if (!todayOnly) return true;

    const acceptedAtMs = invitation.accepted_at ? new Date(invitation.accepted_at).getTime() : Number.NaN;
    if (Number.isFinite(acceptedAtMs) && acceptedAtMs >= todayStartMs) {
      return true;
    }

    if (!includeRecentRetryables || !Number.isFinite(acceptedAtMs) || acceptedAtMs < retryableLookbackStartMs) {
      return false;
    }

    const lastError = String(invitation.last_error ?? "").trim().toLowerCase();
    return lastError.startsWith("auto_send:") && !lastError.includes("retry_limit_exceeded");
  });
  if (filteredInvitations.length === 0) {
    return { total: 0, sent: 0, failed: 0, skipped: 0, results: [] };
  }

  const results: SendResult[] = [];

  for (let i = 0; i < filteredInvitations.length; i++) {
    const inv = filteredInvitations[i];
    const sendResult = await processAcceptedInvitationAutoDm({
      supabase,
      clientId,
      invitationId: inv.id,
      leadId: inv.lead_id,
      unipileAccountId,
    });

    if (sendResult.ok) {
      results.push({
        ok: true,
        invitation_id: inv.id,
        lead_id: inv.lead_id,
        mode: sendResult.threadCreated ? "created_thread" : "existing_thread",
      });
    } else {
      results.push({
        ok: false,
        invitation_id: inv.id,
        lead_id: inv.lead_id,
        error: sendResult.status,
        details: {
          stage: sendResult.stage,
          retryable: sendResult.retryable,
          last_error: sendResult.lastError,
          details: sendResult.details ?? null,
        },
        skipped: sendResult.skipped,
      });
    }

    if (i < filteredInvitations.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  const sent = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok && !("skipped" in r && r.skipped)).length;
  const skipped = results.filter((r) => "skipped" in r && r.skipped).length;

  return { total: filteredInvitations.length, sent, failed, skipped, results };
}

export async function POST(req: Request) {
  // ── Cron auth (server-to-server, no Clerk needed) ───────────────────────────
  const cronSecret = process.env.LINKEDIN_CRON_SECRET;
  const providedCronSecret = req.headers.get("x-cron-secret");

  if (cronSecret && providedCronSecret === cronSecret) {
    // Enforce 9h–18h window (Europe/Paris)
    const now = new Date();
    const parisHour = Number(
      new Intl.DateTimeFormat("fr-FR", {
        timeZone: "Europe/Paris",
        hour: "numeric",
        hour12: false,
      }).format(now)
    );
    if (parisHour < 9 || parisHour >= 18) {
      return NextResponse.json({ ok: true, skipped: "outside_window" });
    }

    const supabase = createServiceSupabase();
    const { data: clients } = await supabase
      .from("clients")
      .select("id")
      .eq("plan", "full")
      .eq("subscription_status", "active");

    const allResults: Array<Record<string, unknown>> = [];

    for (const client of clients ?? []) {
      const clientId = String((client as { id: number | string }).id);
      const unipileAccountId = await getLinkedinUnipileAccountId(supabase, clientId);
      if (!unipileAccountId) continue;

      try {
        const result = await flushClientDrafts({
          supabase,
          clientId,
          unipileAccountId,
          delayMs: 2000,
          todayOnly: true,
          includeRecentRetryables: true,
          retryableLookbackDays: 3,
        });
        allResults.push({ clientId, ...result });
      } catch (err) {
        allResults.push({ clientId, error: String(err) });
      }
    }

    return NextResponse.json({ ok: true, cron: true, results: allResults });
  }

  // ── Clerk auth (manual / UI) ─────────────────────────────────────────────────
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceSupabase();
  const clientId = await getClientIdFromClerkUser(supabase, userId);
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 403 });
  }

  const unipileAccountId = await getLinkedinUnipileAccountId(supabase, clientId);
  if (!unipileAccountId) {
    return NextResponse.json({ ok: false, error: "linkedin_account_not_found" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const delayMs = typeof body.delay_ms === "number" ? Math.max(0, body.delay_ms) : 10_000;
  const allPending = body.all_pending === true;

  try {
    const result = await flushClientDrafts({
      supabase,
      clientId,
      unipileAccountId,
      delayMs,
      todayOnly: !allPending,
    });

    if (result.total === 0) {
      return NextResponse.json({
        ok: true,
        ...result,
        message: allPending
          ? "Aucune connexion acceptée sans message."
          : "Aucune connexion acceptée aujourd'hui sans message.",
      });
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "query_failed", details: String(err) },
      { status: 500 }
    );
  }
}
