import "server-only";

import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveClientIdForClerkUserId } from "@/lib/platform-auth";

export type PlaybookContext = {
  userId: string;
  clientId: number;
};

export async function isPlaybookEnabled(clientId: number | null): Promise<boolean> {
  if (clientId === null) return false;
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("playbook_enabled")
    .eq("id", clientId)
    .maybeSingle();
  if (error) {
    console.error("[playbook-auth] DB error fetching playbook_enabled", { clientId, error });
    return false;
  }
  return data?.playbook_enabled === true;
}

export async function getPlaybookContext(): Promise<PlaybookContext | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const clientId = await resolveClientIdForClerkUserId(userId);
  if (clientId === null) return null;
  if (!(await isPlaybookEnabled(clientId))) return null;

  return { userId, clientId };
}
