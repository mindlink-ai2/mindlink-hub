import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceSupabase } from "@/lib/inbox-server";

export type SupportConversationRow = {
  id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  status: string;
  last_message_at: string;
  unread_count: number;
  created_at: string;
  updated_at: string;
};

export type AuthenticatedSupportUser = {
  userId: string;
  email: string | null;
  firstName: string | null;
  displayName: string | null;
};

export function createSupportSupabase(): SupabaseClient {
  // Uses existing server env vars: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
  return createServiceSupabase();
}

export async function getAuthenticatedSupportUser(): Promise<AuthenticatedSupportUser | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const user = await currentUser();
  const email =
    user?.emailAddresses?.find((entry) => entry.id === user.primaryEmailAddressId)
      ?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null;

  const firstName = user?.firstName ?? null;
  const fallbackName =
    user?.fullName ??
    (email ? email.split("@")[0] : null) ??
    null;

  return {
    userId,
    email,
    firstName,
    displayName: firstName ?? fallbackName,
  };
}

export async function getOrCreateSupportConversation(
  supabase: SupabaseClient,
  supportUser: AuthenticatedSupportUser
): Promise<SupportConversationRow> {
  const { data: existing, error: existingErr } = await supabase
    .from("support_conversations")
    .select(
      "id, user_id, user_email, user_name, status, last_message_at, unread_count, created_at, updated_at"
    )
    .eq("user_id", supportUser.userId)
    .maybeSingle();

  if (existingErr) {
    throw new Error("support_conversation_fetch_failed");
  }

  if (existing) {
    const needsProfileRefresh =
      existing.user_email !== supportUser.email || existing.user_name !== supportUser.displayName;

    if (needsProfileRefresh) {
      await supabase
        .from("support_conversations")
        .update({
          user_email: supportUser.email,
          user_name: supportUser.displayName,
        })
        .eq("id", existing.id)
        .eq("user_id", supportUser.userId);
    }

    return existing as SupportConversationRow;
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("support_conversations")
    .insert({
      user_id: supportUser.userId,
      user_email: supportUser.email,
      user_name: supportUser.displayName,
      status: "open",
      last_message_at: nowIso,
      updated_at: nowIso,
    })
    .select(
      "id, user_id, user_email, user_name, status, last_message_at, unread_count, created_at, updated_at"
    )
    .single();

  if (error || !data) {
    throw new Error("support_conversation_insert_failed");
  }

  return data as SupportConversationRow;
}

export async function assertConversationOwnership(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string
): Promise<SupportConversationRow> {
  const { data, error } = await supabase
    .from("support_conversations")
    .select(
      "id, user_id, user_email, user_name, status, last_message_at, unread_count, created_at, updated_at"
    )
    .eq("id", conversationId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new Error("support_conversation_not_found");
  }

  return data as SupportConversationRow;
}
