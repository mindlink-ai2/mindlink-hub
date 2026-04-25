import "server-only";

import { auth } from "@clerk/nextjs/server";
import { resolveClientIdForClerkUserId } from "@/lib/platform-auth";

export type AnalyticsClientContext = {
  userId: string;
  clientId: number;
};

export function isAnalyticsEnabled(): boolean {
  return process.env.ANALYTICS_ENABLED === "true";
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
