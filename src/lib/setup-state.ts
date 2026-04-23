import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SetupMissing } from "@/lib/email-templates-onboarding";

export type SetupState = {
  linkedin: boolean;
  icp: boolean;
  message: boolean;
};

export async function loadSetupState(
  supabase: SupabaseClient,
  orgId: number
): Promise<SetupState> {
  const [unipileRes, icpRes, msgRes] = await Promise.all([
    supabase
      .from("unipile_accounts")
      .select("unipile_account_id")
      .eq("client_id", orgId)
      .maybeSingle(),
    supabase
      .from("icp_configs")
      .select("filters, status")
      .eq("org_id", orgId)
      .in("status", ["submitted", "reviewed", "active"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("client_messages")
      .select("status")
      .eq("org_id", orgId)
      .maybeSingle(),
  ]);

  const linkedin = !!unipileRes.data?.unipile_account_id;

  const filters = (icpRes.data?.filters ?? {}) as Record<string, unknown>;
  const apolloFilters = filters.apollo_filters ?? filters;
  const icp =
    !!apolloFilters &&
    typeof apolloFilters === "object" &&
    Object.keys(apolloFilters as Record<string, unknown>).length > 0;

  const message = msgRes.data?.status === "submitted";

  return { linkedin, icp, message };
}

export function setupMissingFromState(state: SetupState): SetupMissing {
  return {
    linkedin: !state.linkedin,
    icp: !state.icp,
    message: !state.message,
  };
}

export function isSetupComplete(state: SetupState): boolean {
  return state.linkedin && state.icp && state.message;
}
