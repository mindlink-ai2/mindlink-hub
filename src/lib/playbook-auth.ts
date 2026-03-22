import "server-only";

import { auth } from "@clerk/nextjs/server";
import { resolveClientIdForClerkUserId } from "@/lib/support-admin-auth";

export const PLAYBOOK_ALLOWED_CLIENT_IDS = [16, 18, 70] as const;
const PLAYBOOK_ALLOWED_SET = new Set<number>(PLAYBOOK_ALLOWED_CLIENT_IDS);

export type PlaybookContext = {
  userId: string;
  clientId: number;
};

export function isPlaybookAllowedClientId(clientId: number | null): boolean {
  if (clientId === null) return false;
  return PLAYBOOK_ALLOWED_SET.has(clientId);
}

export async function getPlaybookContext(): Promise<PlaybookContext | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const clientId = await resolveClientIdForClerkUserId(userId);
  if (!isPlaybookAllowedClientId(clientId)) return null;

  return { userId, clientId: clientId as number };
}
