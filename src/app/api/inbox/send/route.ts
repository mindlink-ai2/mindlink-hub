import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  createServiceSupabase,
  getClientIdFromClerkUser,
  normalizeUnipileBase,
  readResponseBody,
  requireEnv,
} from "@/lib/inbox-server";
import { parseUnipileMessage, toJsonObject, truncatePreview } from "@/lib/unipile-inbox";

async function postFirstSuccessful(
  urls: string[],
  initBuilder: (url: string) => RequestInit
): Promise<{ payload: unknown; url: string } | null> {
  for (const url of urls) {
    const response = await fetch(url, initBuilder(url));
    const payload = await readResponseBody(response);
    if (response.ok) {
      return { payload, url };
    }
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const threadDbId = String(body?.threadDbId ?? "").trim();
    const text = String(body?.text ?? "").trim();

    if (!threadDbId) {
      return NextResponse.json({ error: "threadDbId_required" }, { status: 400 });
    }
    if (!text) {
      return NextResponse.json({ error: "text_required" }, { status: 400 });
    }

    const supabase = createServiceSupabase();
    const clientId = await getClientIdFromClerkUser(supabase, userId);
    if (!clientId) {
      return NextResponse.json({ error: "client_not_found" }, { status: 404 });
    }

    const { data: thread, error: threadErr } = await supabase
      .from("inbox_threads")
      .select("id, unipile_account_id, unipile_thread_id")
      .eq("id", threadDbId)
      .eq("client_id", clientId)
      .limit(1)
      .maybeSingle();

    if (threadErr || !thread?.id) {
      return NextResponse.json({ error: "thread_not_found" }, { status: 404 });
    }

    const unipileAccountId = String(thread.unipile_account_id ?? "").trim();
    const unipileThreadId = String(thread.unipile_thread_id ?? "").trim();
    if (!unipileAccountId || !unipileThreadId) {
      return NextResponse.json(
        { error: "invalid_thread_unipile_identifiers" },
        { status: 400 }
      );
    }

    const base = normalizeUnipileBase(requireEnv("UNIPILE_DSN"));
    const apiKey = requireEnv("UNIPILE_API_KEY");

    const sendResult = await postFirstSuccessful(
      [
        `${base}/api/v1/chats/${encodeURIComponent(unipileThreadId)}/messages`,
        `${base}/api/v1/conversations/${encodeURIComponent(unipileThreadId)}/messages`,
        `${base}/api/v1/messages`,
      ],
      (url) => ({
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          /\/api\/v1\/messages$/.test(url)
            ? {
                account_id: unipileAccountId,
                chat_id: unipileThreadId,
                text,
              }
            : {
                account_id: unipileAccountId,
                text,
              }
        ),
      })
    );

    if (!sendResult) {
      return NextResponse.json({ error: "unipile_send_failed" }, { status: 502 });
    }

    const responseObject = toJsonObject(sendResult.payload);
    const parsedMessage = parseUnipileMessage({
      ...responseObject,
      ...(toJsonObject(responseObject.data)),
      ...(toJsonObject(responseObject.message)),
      direction: "outbound",
      thread_id: unipileThreadId,
      text,
    });

    if (!parsedMessage.unipileMessageId) {
      return NextResponse.json(
        { error: "unipile_message_id_missing", details: sendResult.payload },
        { status: 502 }
      );
    }

    const sentAt = parsedMessage.sentAtIso;
    const messageRecord = {
      client_id: clientId,
      provider: "linkedin",
      thread_db_id: String(thread.id),
      unipile_account_id: unipileAccountId,
      unipile_thread_id: unipileThreadId,
      unipile_message_id: parsedMessage.unipileMessageId,
      direction: "outbound",
      sender_name: null,
      sender_linkedin_url: parsedMessage.senderLinkedInUrl,
      text,
      sent_at: sentAt,
      raw: sendResult.payload,
    };

    const { data: existingMessage, error: existingMessageErr } = await supabase
      .from("inbox_messages")
      .select("id")
      .eq("client_id", clientId)
      .eq("unipile_account_id", unipileAccountId)
      .eq("unipile_message_id", parsedMessage.unipileMessageId)
      .limit(1)
      .maybeSingle();

    if (existingMessageErr) {
      return NextResponse.json({ error: "message_exists_lookup_failed" }, { status: 500 });
    }

    if (!existingMessage?.id) {
      const { error: messageInsertErr } = await supabase
        .from("inbox_messages")
        .insert(messageRecord);

      if (messageInsertErr) {
        return NextResponse.json({ error: "message_insert_failed" }, { status: 500 });
      }
    }

    const { error: threadUpdateErr } = await supabase
      .from("inbox_threads")
      .update({
        last_message_at: sentAt,
        last_message_preview: truncatePreview(text),
        updated_at: new Date().toISOString(),
      })
      .eq("id", thread.id)
      .eq("client_id", clientId);

    if (threadUpdateErr) {
      console.error("INBOX_SEND_THREAD_UPDATE_ERROR:", threadUpdateErr);
    }

    return NextResponse.json({
      success: true,
      message: {
        unipile_message_id: parsedMessage.unipileMessageId,
        text,
        sent_at: sentAt,
        direction: "outbound",
      },
    });
  } catch (error: unknown) {
    console.error("INBOX_SEND_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
