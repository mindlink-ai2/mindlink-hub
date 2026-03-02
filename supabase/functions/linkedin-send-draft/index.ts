import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  normalizeUnipileBase,
  requireEnv,
  sendUnipileMessage,
} from "../_shared/unipile.ts";

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function getPathValue(obj: JsonObject, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return null;
    current = (current as JsonObject)[key];
  }
  return current;
}

function firstString(obj: JsonObject, paths: string[][]): string | null {
  for (const path of paths) {
    const value = getPathValue(obj, path);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function truncatePreview(text: string | null | undefined, maxLength = 160): string | null {
  const value = String(text ?? "").trim();
  if (!value) return null;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

Deno.serve(async (req) => {
  try {
    const secret = requireEnv("LINKEDIN_SEND_SECRET");
    const provided = req.headers.get("x-internal-secret") ?? new URL(req.url).searchParams.get("secret");

    if (provided !== secret) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = asObject(await req.json().catch(() => ({})));
    const invitationId = String(body.invitation_id ?? body.invitationId ?? "").trim();
    if (!invitationId) {
      return new Response(JSON.stringify({ ok: false, error: "invitation_id_required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));

    const { data: invitation, error: invitationErr } = await supabase
      .from("linkedin_invitations")
      .select(
        "id, client_id, lead_id, unipile_account_id, status, dm_draft_text, dm_draft_status"
      )
      .eq("id", invitationId)
      .limit(1)
      .maybeSingle();

    if (invitationErr || !invitation?.id) {
      return new Response(JSON.stringify({ ok: false, error: "invitation_not_found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const clientId = String(invitation.client_id ?? "").trim();
    const leadId = String(invitation.lead_id ?? "").trim();
    const unipileAccountId = String(invitation.unipile_account_id ?? "").trim();
    const draftStatus = String(invitation.dm_draft_status ?? "none").trim().toLowerCase();
    const draftText = String(invitation.dm_draft_text ?? "").trim();

    if (!clientId || !leadId || !unipileAccountId) {
      return new Response(JSON.stringify({ ok: false, error: "invitation_identifiers_missing" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (draftStatus !== "draft") {
      return new Response(JSON.stringify({ ok: false, error: "draft_not_ready" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!draftText) {
      return new Response(JSON.stringify({ ok: false, error: "draft_text_empty" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: thread, error: threadErr } = await supabase
      .from("inbox_threads")
      .select("id, unipile_thread_id")
      .eq("client_id", clientId)
      .eq("lead_id", leadId)
      .eq("unipile_account_id", unipileAccountId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (threadErr || !thread?.id || !thread.unipile_thread_id) {
      await supabase
        .from("linkedin_invitations")
        .update({ last_error: "thread_not_found_for_lead" })
        .eq("id", invitationId);

      return new Response(JSON.stringify({ ok: false, error: "thread_not_found_for_lead" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const unipileBase = normalizeUnipileBase(requireEnv("UNIPILE_DSN"));
    const unipileApiKey = requireEnv("UNIPILE_API_KEY");

    const sendResult = await sendUnipileMessage({
      baseUrl: unipileBase,
      apiKey: unipileApiKey,
      accountId: unipileAccountId,
      threadId: String(thread.unipile_thread_id),
      text: draftText,
    });

    if (!sendResult.ok) {
      await supabase
        .from("linkedin_invitations")
        .update({ last_error: sendResult.error })
        .eq("id", invitationId);

      return new Response(
        JSON.stringify({ ok: false, error: sendResult.error, details: sendResult.details ?? null }),
        {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const payload = asObject(sendResult.payload);
    const sentAtCandidate =
      firstString(payload, [["sent_at"], ["timestamp"], ["created_at"], ["data", "sent_at"], ["data", "timestamp"]]) ??
      new Date().toISOString();
    const sentAt = Number.isNaN(new Date(sentAtCandidate).getTime())
      ? new Date().toISOString()
      : new Date(sentAtCandidate).toISOString();

    const messageId =
      firstString(payload, [["message_id"], ["id"], ["provider_id"], ["data", "message_id"], ["data", "id"]]) ??
      `edge-${Date.now()}`;

    const { data: existingMessage } = await supabase
      .from("inbox_messages")
      .select("id")
      .eq("client_id", clientId)
      .eq("unipile_account_id", unipileAccountId)
      .eq("unipile_message_id", messageId)
      .limit(1)
      .maybeSingle();

    if (!existingMessage?.id) {
      await supabase.from("inbox_messages").insert({
        client_id: clientId,
        provider: "linkedin",
        thread_db_id: String(thread.id),
        unipile_account_id: unipileAccountId,
        unipile_thread_id: String(thread.unipile_thread_id),
        unipile_message_id: messageId,
        direction: "outbound",
        sender_name: null,
        sender_linkedin_url: null,
        text: draftText,
        sent_at: sentAt,
        raw: sendResult.payload,
      });
    }

    await supabase
      .from("inbox_threads")
      .update({
        last_message_at: sentAt,
        last_message_preview: truncatePreview(draftText),
        updated_at: new Date().toISOString(),
      })
      .eq("id", thread.id)
      .eq("client_id", clientId);

    const nowIso = new Date().toISOString();
    await supabase
      .from("linkedin_invitations")
      .update({
        dm_draft_status: "sent",
        dm_sent_at: nowIso,
        last_error: null,
      })
      .eq("id", invitationId)
      .eq("client_id", clientId);

    await supabase
      .from("automation_logs")
      .insert({
        client_id: clientId,
        runner: "linkedin-send-draft",
        action: "send_draft_dm",
        status: "success",
        lead_id: leadId,
        unipile_account_id: unipileAccountId,
        details: {
          invitation_id: invitationId,
          message_id: messageId,
        },
      });

    return new Response(
      JSON.stringify({ ok: true, message_id: messageId, sent_at: sentAt, invitation_id: invitationId }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("LINKEDIN_SEND_DRAFT_EDGE_ERROR", error);
    return new Response(
      JSON.stringify({ ok: false, error: "server_error", details: String(error) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
