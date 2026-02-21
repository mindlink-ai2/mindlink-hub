import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type ClientOnboardingState = "created" | "linkedin_connected" | "completed";

export type ClientOnboardingRow = {
  id: number;
  client_id: number;
  state: ClientOnboardingState;
  created_at: string;
  linkedin_connected_at: string | null;
  completed_at: string | null;
};

export type ResolvedClientContext = {
  clientId: number;
  linkedNow: boolean;
};

function isUniqueViolation(error: { code?: string } | null): boolean {
  if (!error) return false;
  return String(error.code ?? "") === "23505";
}

export async function resolveClientContextForUser(
  supabase: SupabaseClient,
  userId: string,
  email?: string | null
): Promise<ResolvedClientContext | null> {
  const { data: byClerk } = await supabase
    .from("clients")
    .select("id")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (byClerk?.id) {
    return { clientId: Number(byClerk.id), linkedNow: false };
  }

  const normalizedEmail = String(email ?? "").trim();
  if (!normalizedEmail) return null;

  const { data: linkedRow, error: linkError } = await supabase
    .from("clients")
    .update({ clerk_user_id: userId })
    .eq("email", normalizedEmail)
    .is("clerk_user_id", null)
    .select("id")
    .maybeSingle();

  if (linkError) {
    throw new Error(`client_link_failed:${linkError.message}`);
  }

  if (linkedRow?.id) {
    return { clientId: Number(linkedRow.id), linkedNow: true };
  }

  const { data: byEmail } = await supabase
    .from("clients")
    .select("id")
    .eq("email", normalizedEmail)
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (!byEmail?.id) return null;
  return { clientId: Number(byEmail.id), linkedNow: false };
}

export async function ensureClientOnboardingStateRow(
  supabase: SupabaseClient,
  clientId: number
): Promise<void> {
  const { error } = await supabase
    .from("client_onboarding_state")
    .insert({ client_id: clientId, state: "created" });

  if (error && !isUniqueViolation(error)) {
    throw new Error(`client_onboarding_insert_failed:${error.message}`);
  }
}

export async function getClientOnboardingStateRow(
  supabase: SupabaseClient,
  clientId: number
): Promise<ClientOnboardingRow | null> {
  const { data, error } = await supabase
    .from("client_onboarding_state")
    .select("id, client_id, state, created_at, linkedin_connected_at, completed_at")
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) {
    throw new Error(`client_onboarding_fetch_failed:${error.message}`);
  }

  if (!data) return null;
  return data as ClientOnboardingRow;
}

export async function markClientOnboardingLinkedinConnected(
  supabase: SupabaseClient,
  clientId: number
): Promise<void> {
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("client_onboarding_state")
    .update({
      state: "linkedin_connected",
      linkedin_connected_at: nowIso,
    })
    .eq("client_id", clientId)
    .neq("state", "completed");

  if (error) {
    throw new Error(`client_onboarding_mark_linkedin_failed:${error.message}`);
  }
}

export async function markClientOnboardingCompleted(
  supabase: SupabaseClient,
  clientId: number
): Promise<void> {
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("client_onboarding_state")
    .update({
      state: "completed",
      completed_at: nowIso,
    })
    .eq("client_id", clientId);

  if (error) {
    throw new Error(`client_onboarding_mark_completed_failed:${error.message}`);
  }
}

export function isLinkedinConnectedInAccounts(
  rows: Array<Record<string, unknown>>
): boolean {
  return rows.some((row) => {
    const provider = String(row.provider ?? "").trim().toLowerCase();
    if (provider !== "linkedin") return false;

    const connected = String(row.connected ?? "").trim().toLowerCase() === "true";
    const status = String(row.status ?? "").trim().toLowerCase();
    return connected || status === "creation_success";
  });
}
