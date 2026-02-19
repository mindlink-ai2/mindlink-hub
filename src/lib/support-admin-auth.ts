import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { createServiceSupabase } from "@/lib/inbox-server";

export const SUPPORT_ADMIN_CLIENT_IDS = [16, 18, 24] as const;
const SUPPORT_ADMIN_SET = new Set<number>(SUPPORT_ADMIN_CLIENT_IDS);

export type SupportAdminContext = {
  userId: string;
  clientId: number;
};

function normalizeClientId(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export function isSupportAdminClientId(clientId: number | null): boolean {
  if (clientId === null) return false;
  return SUPPORT_ADMIN_SET.has(clientId);
}

export async function resolveClientIdForClerkUserId(userId: string): Promise<number | null> {
  const supabase = createServiceSupabase();

  const { data: byClerk } = await supabase
    .from("clients")
    .select("id")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  const clerkClientId = normalizeClientId(byClerk?.id);
  if (clerkClientId !== null) return clerkClientId;

  const user = await currentUser();
  const email =
    user?.emailAddresses?.find((entry) => entry.id === user.primaryEmailAddressId)
      ?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null;

  if (!email) return null;

  const { data: byEmail } = await supabase
    .from("clients")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  return normalizeClientId(byEmail?.id);
}

export async function getSupportAdminContext(): Promise<SupportAdminContext | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const clientId = await resolveClientIdForClerkUserId(userId);
  if (!isSupportAdminClientId(clientId)) return null;

  return {
    userId,
    clientId: clientId as number,
  };
}
