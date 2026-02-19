import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceSupabase } from "@/lib/inbox-server";
import { getSupportAdminContext } from "@/lib/support-admin-auth";

export const runtime = "nodejs";

const querySchema = z.object({
  status: z.enum(["open", "closed", "all"]).default("open"),
  search: z.string().trim().max(120).optional().default(""),
  unread: z
    .string()
    .optional()
    .transform((value) => value === "1" || value === "true"),
  limit: z.coerce.number().int().min(1).max(120).optional().default(60),
});

type ConversationRow = {
  id: string;
  user_name: string | null;
  user_email: string | null;
  status: string;
  last_message_at: string | null;
  unread_count: number | null;
};

type MessageRow = {
  conversation_id: string;
  body: string;
  created_at: string;
  read_by_support_at: string | null;
};

function truncate(value: string, length: number): string {
  if (value.length <= length) return value;
  return `${value.slice(0, length - 1)}…`;
}

export async function GET(request: Request) {
  try {
    const adminContext = await getSupportAdminContext();
    if (!adminContext) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const params = new URL(request.url).searchParams;
    const parsedQuery = querySchema.safeParse({
      status: params.get("status") ?? undefined,
      search: params.get("search") ?? undefined,
      unread: params.get("unread") ?? undefined,
      limit: params.get("limit") ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json({ error: "invalid_query" }, { status: 400 });
    }

    const { status, search, unread, limit } = parsedQuery.data;
    const supabase = createServiceSupabase();

    let query = supabase
      .from("support_conversations")
      .select("id, user_name, user_email, status, last_message_at, unread_count")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (status !== "all") {
      query = query.eq("status", status);
    }

    if (search.length > 0) {
      query = query.or(`user_name.ilike.%${search}%,user_email.ilike.%${search}%`);
    }

    const { data: conversationData, error: conversationErr } = await query;
    if (conversationErr) {
      console.error("ADMIN_SUPPORT_CONVERSATIONS_FETCH_ERROR:", conversationErr);
      return NextResponse.json({ error: "conversations_fetch_failed" }, { status: 500 });
    }

    const conversations = Array.isArray(conversationData)
      ? (conversationData as ConversationRow[])
      : [];

    if (conversations.length === 0) {
      return NextResponse.json({ conversations: [] });
    }

    const conversationIds = conversations.map((row) => row.id);

    const { data: messageData, error: messageErr } = await supabase
      .from("support_messages")
      .select("conversation_id, body, created_at")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false });

    let unreadRows: MessageRow[] = [];
    const { data: unreadData, error: unreadErr } = await supabase
      .from("support_messages")
      .select("conversation_id, read_by_support_at")
      .in("conversation_id", conversationIds)
      .eq("sender_type", "user")
      .is("read_by_support_at", null);

    if (messageErr) {
      console.error("ADMIN_SUPPORT_LAST_MESSAGE_FETCH_ERROR:", messageErr);
      return NextResponse.json({ error: "messages_fetch_failed" }, { status: 500 });
    }

    if (unreadErr) {
      const errorCode = String(unreadErr.code ?? "");
      const errorMessage = String(unreadErr.message ?? "");
      const hasMissingReadBySupportColumn =
        errorCode === "42703" ||
        errorCode === "PGRST204" ||
        errorMessage.includes("read_by_support_at");

      if (!hasMissingReadBySupportColumn) {
        console.error("ADMIN_SUPPORT_UNREAD_FETCH_ERROR:", unreadErr);
        return NextResponse.json({ error: "unread_fetch_failed" }, { status: 500 });
      }

      console.warn(
        "ADMIN_SUPPORT_UNREAD_FALLBACK: read_by_support_at missing, unread_for_support set to 0."
      );
    } else if (Array.isArray(unreadData)) {
      unreadRows = unreadData as MessageRow[];
    }

    const previewByConversationId = new Map<
      string,
      { preview: string; createdAt: string | null }
    >();
    (Array.isArray(messageData) ? (messageData as MessageRow[]) : []).forEach((message) => {
      if (previewByConversationId.has(message.conversation_id)) return;
      previewByConversationId.set(message.conversation_id, {
        preview: truncate(String(message.body ?? ""), 120),
        createdAt: message.created_at ?? null,
      });
    });

    const unreadByConversationId = new Map<string, number>();
    unreadRows.forEach((row) => {
      unreadByConversationId.set(
        row.conversation_id,
        (unreadByConversationId.get(row.conversation_id) ?? 0) + 1
      );
    });

    const payload = conversations
      .map((conversation) => {
        const lastMessage = previewByConversationId.get(conversation.id);
        const unreadForSupport = unreadByConversationId.get(conversation.id) ?? 0;

        return {
          id: conversation.id,
          user_name: conversation.user_name,
          user_email: conversation.user_email,
          status: conversation.status,
          last_message_at: conversation.last_message_at ?? lastMessage?.createdAt ?? null,
          unread_count: Number(conversation.unread_count ?? 0),
          unread_for_support: unreadForSupport,
          last_message_preview: lastMessage?.preview ?? "",
        };
      })
      .filter((conversation) => (unread ? conversation.unread_for_support > 0 : true));

    return NextResponse.json({ conversations: payload });
  } catch (error) {
    console.error("ADMIN_SUPPORT_CONVERSATIONS_GET_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
