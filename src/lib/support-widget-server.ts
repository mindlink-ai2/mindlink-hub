import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceSupabase } from "@/lib/inbox-server";

export type SupportConversationRow = {
  id: string;
  ticket_number: number | null;
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

function isMissingTicketNumberColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const errorCode = String(error.code ?? "");
  const errorMessage = String(error.message ?? "");
  return (
    errorCode === "42703" ||
    errorCode === "PGRST204" ||
    errorMessage.includes("ticket_number")
  );
}

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
  let { data: existing, error: existingErr } = await supabase
    .from("support_conversations")
    .select(
      "id, ticket_number, user_id, user_email, user_name, status, last_message_at, unread_count, created_at, updated_at"
    )
    .eq("user_id", supportUser.userId)
    .maybeSingle();

  if (existingErr && isMissingTicketNumberColumn(existingErr)) {
    const fallback = await supabase
      .from("support_conversations")
      .select("id, user_id, user_email, user_name, status, last_message_at, unread_count, created_at, updated_at")
      .eq("user_id", supportUser.userId)
      .maybeSingle();

    existing = fallback.data
      ? ({ ...fallback.data, ticket_number: null } as SupportConversationRow)
      : null;
    existingErr = fallback.error;
  }

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
  let { data, error } = await supabase
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
      "id, ticket_number, user_id, user_email, user_name, status, last_message_at, unread_count, created_at, updated_at"
    )
    .single();

  if (error && isMissingTicketNumberColumn(error)) {
    const fallback = await supabase
      .from("support_conversations")
      .insert({
        user_id: supportUser.userId,
        user_email: supportUser.email,
        user_name: supportUser.displayName,
        status: "open",
        last_message_at: nowIso,
        updated_at: nowIso,
      })
      .select("id, user_id, user_email, user_name, status, last_message_at, unread_count, created_at, updated_at")
      .single();

    data = fallback.data
      ? ({ ...fallback.data, ticket_number: null } as SupportConversationRow)
      : null;
    error = fallback.error;
  }

  if (error || !data) {
    throw new Error("support_conversation_insert_failed");
  }

  return data as SupportConversationRow;
}

export async function listSupportConversations(
  supabase: SupabaseClient,
  userId: string
): Promise<SupportConversationRow[]> {
  let { data, error } = await supabase
    .from("support_conversations")
    .select(
      "id, ticket_number, user_id, user_email, user_name, status, last_message_at, unread_count, created_at, updated_at"
    )
    .eq("user_id", userId)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (error && isMissingTicketNumberColumn(error)) {
    const fallback = await supabase
      .from("support_conversations")
      .select("id, user_id, user_email, user_name, status, last_message_at, unread_count, created_at, updated_at")
      .eq("user_id", userId)
      .order("last_message_at", { ascending: false, nullsFirst: false });

    data = Array.isArray(fallback.data)
      ? fallback.data.map((row) => ({ ...row, ticket_number: null }))
      : [];
    error = fallback.error;
  }

  if (error) {
    throw new Error("support_conversations_list_failed");
  }

  return (Array.isArray(data) ? data : []) as SupportConversationRow[];
}

export async function createSupportConversation(
  supabase: SupabaseClient,
  supportUser: AuthenticatedSupportUser
): Promise<SupportConversationRow> {
  const nowIso = new Date().toISOString();
  let { data, error } = await supabase
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
      "id, ticket_number, user_id, user_email, user_name, status, last_message_at, unread_count, created_at, updated_at"
    )
    .single();

  if (error && isMissingTicketNumberColumn(error)) {
    const fallback = await supabase
      .from("support_conversations")
      .insert({
        user_id: supportUser.userId,
        user_email: supportUser.email,
        user_name: supportUser.displayName,
        status: "open",
        last_message_at: nowIso,
        updated_at: nowIso,
      })
      .select("id, user_id, user_email, user_name, status, last_message_at, unread_count, created_at, updated_at")
      .single();

    data = fallback.data
      ? ({ ...fallback.data, ticket_number: null } as SupportConversationRow)
      : null;
    error = fallback.error;
  }

  if (error || !data) {
    throw new Error("support_conversation_insert_failed");
  }

  return data as SupportConversationRow;
}

export async function refreshSupportConversationProfile(
  supabase: SupabaseClient,
  supportUser: AuthenticatedSupportUser
): Promise<void> {
  await supabase
    .from("support_conversations")
    .update({
      user_email: supportUser.email,
      user_name: supportUser.displayName,
    })
    .eq("user_id", supportUser.userId);
}

export async function assertConversationOwnership(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string
): Promise<SupportConversationRow> {
  let { data, error } = await supabase
    .from("support_conversations")
    .select(
      "id, ticket_number, user_id, user_email, user_name, status, last_message_at, unread_count, created_at, updated_at"
    )
    .eq("id", conversationId)
    .eq("user_id", userId)
    .single();

  if (error && isMissingTicketNumberColumn(error)) {
    const fallback = await supabase
      .from("support_conversations")
      .select("id, user_id, user_email, user_name, status, last_message_at, unread_count, created_at, updated_at")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .single();

    data = fallback.data
      ? ({ ...fallback.data, ticket_number: null } as SupportConversationRow)
      : null;
    error = fallback.error;
  }

  if (error || !data) {
    throw new Error("support_conversation_not_found");
  }

  return data as SupportConversationRow;
}
