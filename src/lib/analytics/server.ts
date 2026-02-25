import "server-only";

import { auth } from "@clerk/nextjs/server";
import { resolveClientIdForClerkUserId } from "@/lib/support-admin-auth";

export const ANALYTICS_ADMIN_CLIENT_IDS = [16, 18] as const;
const ANALYTICS_ADMIN_SET = new Set<number>(ANALYTICS_ADMIN_CLIENT_IDS);

export type AnalyticsClientContext = {
  userId: string;
  clientId: number;
};

export function isAnalyticsEnabled(): boolean {
  return process.env.ANALYTICS_ENABLED === "true";
}

export function isAnalyticsAdminClientId(clientId: number | null): boolean {
  if (clientId === null) return false;
  return ANALYTICS_ADMIN_SET.has(clientId);
}

export async function getAuthenticatedAnalyticsClientContext(): Promise<AnalyticsClientContext | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const clientId = await resolveClientIdForClerkUserId(userId);
  if (clientId === null) return null;

  return {
    userId,
    clientId,
  };
}

export async function getAnalyticsAdminContext(): Promise<AnalyticsClientContext | null> {
  const context = await getAuthenticatedAnalyticsClientContext();
  if (!context) return null;
  if (!isAnalyticsAdminClientId(context.clientId)) return null;
  return context;
}
