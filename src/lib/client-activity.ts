import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type ClientActivityAction =
  | "sheet_created"
  | "leads_extracted"
  | "messages_validated"
  | "messages_updated"
  | "workflow_created"
  | "workflow_updated"
  | "icp_submitted"
  | "icp_modified";

export async function logClientActivity(
  supabase: SupabaseClient,
  orgId: number,
  action: ClientActivityAction,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    const { error } = await supabase.from("client_activity_logs").insert({
      org_id: orgId,
      action,
      details: details ?? null,
    });
    if (error) {
      console.warn(`[activity] failed to log ${action} for org ${orgId}:`, error.message);
    }
  } catch (err) {
    console.warn(`[activity] unexpected error logging ${action}:`, err);
  }
}
