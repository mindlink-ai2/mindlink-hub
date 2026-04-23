import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendLidmeoEmail } from "@/lib/email-templates";

export type EmailKind =
  | "welcome"
  | "setup_reminder_j3"
  | "first_prospects"
  | "renewal_d3"
  | "renewal_leads"
  | "completion_leads";

export type EmailStatus = "sent" | "failed" | "skipped";

export async function hasSentEmail(
  supabase: SupabaseClient,
  orgId: number,
  kind: EmailKind
): Promise<boolean> {
  const { data, error } = await supabase
    .from("email_log")
    .select("id")
    .eq("org_id", orgId)
    .eq("kind", kind)
    .eq("status", "sent")
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn(`[email-tracking] check failed (${kind}, org ${orgId}):`, error.message);
    return false;
  }
  return !!data;
}

export async function recordEmailSent(
  supabase: SupabaseClient,
  params: {
    orgId: number;
    kind: EmailKind;
    recipient: string | null;
    subject: string | null;
    status: EmailStatus;
    error?: string | null;
    metadata?: Record<string, unknown> | null;
  }
): Promise<void> {
  try {
    const { error } = await supabase.from("email_log").insert({
      org_id: params.orgId,
      kind: params.kind,
      recipient: params.recipient,
      subject: params.subject,
      status: params.status,
      error: params.error ?? null,
      metadata: params.metadata ?? null,
    });
    if (error) {
      console.warn(
        `[email-tracking] insert failed (${params.kind}, org ${params.orgId}):`,
        error.message
      );
    }
  } catch (err) {
    console.warn(`[email-tracking] unexpected error logging ${params.kind}:`, err);
  }
}

export async function sendAndLogEmail(
  supabase: SupabaseClient,
  params: {
    orgId: number;
    kind: EmailKind;
    to: string;
    subject: string;
    html: string;
    metadata?: Record<string, unknown> | null;
  }
): Promise<{ sent: boolean; error?: string }> {
  const result = await sendLidmeoEmail({
    to: params.to,
    subject: params.subject,
    html: params.html,
  });

  await recordEmailSent(supabase, {
    orgId: params.orgId,
    kind: params.kind,
    recipient: params.to,
    subject: params.subject,
    status: result.sent ? "sent" : "failed",
    error: result.error ?? null,
    metadata: params.metadata ?? null,
  });

  return result;
}
