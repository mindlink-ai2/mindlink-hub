import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

export function normalizeUnipileBase(dsn: string): string {
  return dsn.replace(/\/+$/, "").replace(/\/api\/v1\/.*$/, "");
}

export function createServiceSupabase(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  );
}

export async function getClientIdFromClerkUser(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data: client, error } = await supabase
    .from("clients")
    .select("id")
    .eq("clerk_user_id", userId)
    .single();

  if (error || !client?.id) return null;
  return String(client.id);
}

export async function getLinkedinUnipileAccountId(
  supabase: SupabaseClient,
  clientId: string
): Promise<string | null> {
  const { data: settings, error: settingsError } = await supabase
    .from("client_linkedin_settings")
    .select("unipile_account_id")
    .eq("client_id", clientId)
    .limit(1)
    .maybeSingle();

  const settingsAccountId = String(settings?.unipile_account_id ?? "").trim();
  if (!settingsError && settingsAccountId) {
    return settingsAccountId;
  }

  const { data: account, error } = await supabase
    .from("unipile_accounts")
    .select("unipile_account_id")
    .eq("client_id", clientId)
    .eq("provider", "linkedin")
    .order("connected_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error || !account?.unipile_account_id) return null;
  return String(account.unipile_account_id);
}

export async function readResponseBody(
  res: Response
): Promise<Record<string, unknown> | string | null> {
  const text = await res.text().catch(() => "");
  if (!text) return null;

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return text;
  }
}
