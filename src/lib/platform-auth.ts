import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// CACHE INVALIDATION: this cache is process-local with 5min TTL.
// If you UPDATE clients.platform_role in DB (via Supabase Dashboard),
// changes propagate within 5 minutes. To force immediate refresh, call
// invalidatePlatformRoleCache() or restart the server.
// Multi-instance: each Vercel function instance has its own cache. OK
// for our scale.

export type PlatformRole = "admin" | null;

export type AdminContext = {
  userId: string;
  clientId: number;
  role: "admin";
};

const TTL_MS = 5 * 60 * 1000;
type CacheEntry = { role: PlatformRole; expiresAt: number };
const roleCache = new Map<number, CacheEntry>();

export function invalidatePlatformRoleCache(clientId?: number): void {
  if (clientId === undefined) {
    roleCache.clear();
  } else {
    roleCache.delete(clientId);
  }
}

function normalizeClientId(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export function isPlatformAdmin(role: PlatformRole): boolean {
  return role === "admin";
}

export async function getPlatformRole(clientId: number): Promise<PlatformRole> {
  const now = Date.now();
  const cached = roleCache.get(clientId);
  if (cached && cached.expiresAt > now) {
    return cached.role;
  }

  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("id, platform_role")
    .eq("id", clientId)
    .maybeSingle();

  if (error) {
    console.error("[platform-auth] DB error fetching platform_role", { clientId, error });
    return null;
  }

  if (!data) {
    console.warn("[platform-auth] client not found", { clientId });
    roleCache.set(clientId, { role: null, expiresAt: now + TTL_MS });
    return null;
  }

  const role: PlatformRole = data.platform_role === "admin" ? "admin" : null;

  roleCache.set(clientId, { role, expiresAt: now + TTL_MS });
  return role;
}

export async function resolveClientIdForClerkUserId(userId: string): Promise<number | null> {
  const { data: byClerkRows } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("clerk_user_id", userId)
    .order("id", { ascending: true })
    .limit(1);

  const clerkClientId = normalizeClientId(byClerkRows?.[0]?.id);
  if (clerkClientId !== null) return clerkClientId;

  // TODO Phase 1: remove email fallback when organization_members is
  // populated and Clerk Organizations is the source of truth.
  const user = await currentUser();
  const email =
    user?.emailAddresses?.find((entry) => entry.id === user.primaryEmailAddressId)
      ?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null;

  if (!email) return null;

  const { data: byEmailRows } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("email", email)
    .order("id", { ascending: true })
    .limit(1);

  return normalizeClientId(byEmailRows?.[0]?.id);
}

export async function getAdminContext(): Promise<AdminContext | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const clientId = await resolveClientIdForClerkUserId(userId);
  if (clientId === null) return null;

  const role = await getPlatformRole(clientId);
  if (!isPlatformAdmin(role)) return null;

  return { userId, clientId, role: "admin" };
}
