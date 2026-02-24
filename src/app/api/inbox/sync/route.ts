import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractLinkedInProfileSlug, normalizeLinkedInUrl } from "@/lib/linkedin-url";
import {
  createServiceSupabase,
  getClientIdFromClerkUser,
  getLinkedinUnipileAccountId,
  normalizeUnipileBase,
  readResponseBody,
  requireEnv,
} from "@/lib/inbox-server";
import {
  extractSenderAttendeeId,
  resolveAttendeeForMessage,
  resolveOtherAttendeeForChat,
  type ResolvedAttendee,
} from "@/lib/unipile-attendees";
import { saveAttendeeAvatarToStorage } from "@/lib/unipile-avatar-storage";
import {
  extractArrayCandidates,
  getFirstBoolean,
  getFirstString,
  parseUnipileMessage,
  truncatePreview,
  type JsonObject,
} from "@/lib/unipile-inbox";

type ParsedThread = {
  unipileThreadId: string;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  contactName: string | null;
  contactLinkedInUrl: string | null;
  contactAvatarUrl: string | null;
};

type ThreadParticipant = {
  name: string | null;
  linkedinUrl: string | null;
  avatarUrl: string | null;
  isSelf: boolean | null;
};

function parseIsoMs(value: string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return Number.NEGATIVE_INFINITY;
  return date.getTime();
}

function extractMessageSenderAvatar(payload: JsonObject): string | null {
  return (
    getFirstString(payload, [
      ["sender_avatar_url"],
      ["senderAvatarUrl"],
      ["sender", "avatar_url"],
      ["sender", "avatarUrl"],
      ["sender", "photo_url"],
      ["sender", "photoUrl"],
      ["sender", "profile_picture_url"],
      ["sender", "profilePictureUrl"],
      ["author", "avatar_url"],
      ["author", "photo_url"],
      ["data", "sender", "avatar_url"],
      ["data", "sender", "avatarUrl"],
      ["data", "sender", "photo_url"],
      ["data", "sender", "photoUrl"],
      ["data", "attendee", "avatar_url"],
      ["data", "attendee", "avatarUrl"],
      ["data", "contact", "avatar_url"],
      ["data", "contact", "avatarUrl"],
    ]) ?? null
  );
}

function extractMessageSentAtIso(payload: JsonObject): string | null {
  const rawTimestamp = getFirstString(payload, [
    ["timestamp"],
    ["sent_at"],
    ["sentAt"],
    ["created_at"],
    ["createdAt"],
    ["occurred_at"],
    ["occurredAt"],
    ["message", "timestamp"],
    ["message", "sent_at"],
    ["message", "created_at"],
    ["data", "timestamp"],
    ["data", "sent_at"],
    ["data", "created_at"],
  ]);

  if (!rawTimestamp) return null;
  const parsed = new Date(rawTimestamp);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function extractThreadParticipant(value: unknown): ThreadParticipant | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const participant = value as JsonObject;

  return {
    name:
      getFirstString(participant, [
        ["name"],
        ["full_name"],
        ["fullName"],
        ["display_name"],
        ["displayName"],
      ]) ?? null,
    linkedinUrl: normalizeLinkedInUrl(
      getFirstString(participant, [
        ["linkedin_url"],
        ["linkedinUrl"],
        ["profile_url"],
        ["profileUrl"],
        ["url"],
      ])
    ),
    avatarUrl:
      getFirstString(participant, [
        ["avatar_url"],
        ["avatarUrl"],
        ["photo_url"],
        ["photoUrl"],
        ["profile_picture_url"],
        ["profilePictureUrl"],
      ]) ?? null,
    isSelf: getFirstBoolean(participant, [
      ["is_self"],
      ["isSelf"],
      ["self"],
      ["from_me"],
      ["is_sender"],
      ["isSender"],
    ]),
  };
}

function extractOtherParticipant(item: JsonObject): ThreadParticipant | null {
  const arraysToCheck: unknown[] = [
    item.participants,
    item.members,
    item.recipients,
    item.counterparts,
    item.users,
    item.people,
  ];

  const parsedParticipants: ThreadParticipant[] = [];

  for (const entry of arraysToCheck) {
    if (!Array.isArray(entry)) continue;
    for (const candidate of entry) {
      const parsed = extractThreadParticipant(candidate);
      if (parsed) parsedParticipants.push(parsed);
    }
  }

  const nestedObjects: unknown[] = [
    item.participant,
    item.recipient,
    item.counterpart,
    item.contact,
    item.other,
  ];
  for (const entry of nestedObjects) {
    const parsed = extractThreadParticipant(entry);
    if (parsed) parsedParticipants.push(parsed);
  }

  const explicitOther = parsedParticipants.find((participant) => participant.isSelf === false);
  if (explicitOther) return explicitOther;

  const implicitOther = parsedParticipants.find(
    (participant) =>
      participant.isSelf !== true &&
      Boolean(participant.linkedinUrl || participant.name || participant.avatarUrl)
  );
  if (implicitOther) return implicitOther;

  return null;
}

function parseThreadFromItem(item: JsonObject): ParsedThread | null {
  const unipileThreadId = getFirstString(item, [
    ["thread_id"],
    ["threadId"],
    ["conversation_id"],
    ["conversationId"],
    ["chat_id"],
    ["chatId"],
    ["id"],
  ]);

  if (!unipileThreadId) return null;

  const lastMessageAtRaw = getFirstString(item, [
    ["last_message_at"],
    ["lastMessageAt"],
    ["updated_at"],
    ["updatedAt"],
    ["created_at"],
    ["createdAt"],
    ["last_message", "sent_at"],
    ["last_message", "created_at"],
  ]);

  const lastMessageAtDate = lastMessageAtRaw ? new Date(lastMessageAtRaw) : new Date();
  const lastMessageAt = Number.isNaN(lastMessageAtDate.getTime())
    ? new Date().toISOString()
    : lastMessageAtDate.toISOString();

  const preview = truncatePreview(
    getFirstString(item, [
      ["last_message_preview"],
      ["lastMessagePreview"],
      ["last_message", "text"],
      ["last_message", "content"],
      ["last_message", "body"],
      ["snippet"],
    ])
  );

  const otherParticipant = extractOtherParticipant(item);

  const contactLinkedInUrl =
    otherParticipant?.linkedinUrl ??
    normalizeLinkedInUrl(
      getFirstString(item, [
        ["contact_linkedin_url"],
        ["contactLinkedInUrl"],
        ["lead_linkedin_url"],
        ["leadLinkedInUrl"],
        ["contact", "linkedin_url"],
        ["contact", "linkedinUrl"],
        ["contact", "profile_url"],
        ["contact", "profileUrl"],
        ["participant", "linkedin_url"],
        ["participant", "linkedinUrl"],
        ["participant", "profile_url"],
        ["participant", "profileUrl"],
        ["counterpart", "linkedin_url"],
        ["counterpart", "linkedinUrl"],
        ["counterpart", "profile_url"],
        ["counterpart", "profileUrl"],
      ])
    );

  const contactName =
    otherParticipant?.name ??
    getFirstString(item, [
      ["contact_name"],
      ["contactName"],
      ["contact", "name"],
      ["participant", "name"],
      ["counterpart", "name"],
      ["recipient", "name"],
    ]) ??
    null;

  const contactAvatarUrl =
    otherParticipant?.avatarUrl ??
    getFirstString(item, [
      ["contact_avatar_url"],
      ["contactAvatarUrl"],
      ["contact", "avatar_url"],
      ["contact", "avatarUrl"],
      ["contact", "photo_url"],
      ["contact", "photoUrl"],
      ["contact", "profile_picture_url"],
      ["contact", "profilePictureUrl"],
      ["participant", "avatar_url"],
      ["participant", "avatarUrl"],
      ["participant", "photo_url"],
      ["participant", "photoUrl"],
      ["counterpart", "avatar_url"],
      ["counterpart", "avatarUrl"],
      ["counterpart", "photo_url"],
      ["counterpart", "photoUrl"],
    ]) ??
    null;

  return {
    unipileThreadId,
    lastMessageAt,
    lastMessagePreview: preview,
    contactName,
    contactLinkedInUrl,
    contactAvatarUrl,
  };
}

async function fetchFirstSuccessful(
  urls: string[],
  init: RequestInit
): Promise<{ payload: unknown; url: string } | null> {
  for (const url of urls) {
    const response = await fetch(url, init);
    const payload = await readResponseBody(response);
    if (response.ok) {
      return { payload, url };
    }
  }
  return null;
}

async function resolveLeadIdByUrl(
  supabase: SupabaseClient,
  clientId: string,
  linkedinUrl: string | null
): Promise<number | string | null> {
  if (!linkedinUrl) return null;

  const normalized = normalizeLinkedInUrl(linkedinUrl);
  const slug = extractLinkedInProfileSlug(linkedinUrl);
  if (!normalized && !slug) return null;

  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, LinkedInURL")
    .eq("client_id", clientId)
    .not("LinkedInURL", "is", null);

  if (error || !Array.isArray(leads)) {
    console.error("INBOX_SYNC_LEAD_LOOKUP_ERROR:", error);
    return null;
  }

  if (normalized) {
    const match = leads.find((lead) => {
      const rawUrl =
        lead && typeof lead === "object" && "LinkedInURL" in lead
          ? String((lead as Record<string, unknown>).LinkedInURL ?? "")
          : "";
      return normalizeLinkedInUrl(rawUrl) === normalized;
    });

    if (match && typeof match === "object" && "id" in match) {
      const id = (match as Record<string, unknown>).id;
      if (typeof id === "string" || typeof id === "number") return id;
    }
  }

  if (slug) {
    const match = leads.find((lead) => {
      const rawUrl =
        lead && typeof lead === "object" && "LinkedInURL" in lead
          ? String((lead as Record<string, unknown>).LinkedInURL ?? "")
          : "";
      return extractLinkedInProfileSlug(rawUrl) === slug;
    });

    if (match && typeof match === "object" && "id" in match) {
      const id = (match as Record<string, unknown>).id;
      if (typeof id === "string" || typeof id === "number") return id;
    }
  }

  return null;
}

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const supabase = createServiceSupabase();
    const clientId = await getClientIdFromClerkUser(supabase, userId);
    if (!clientId) {
      return NextResponse.json({ error: "client_not_found" }, { status: 404 });
    }

    const unipileAccountId = await getLinkedinUnipileAccountId(supabase, clientId);
    if (!unipileAccountId) {
      return NextResponse.json(
        { error: "linkedin_account_not_connected" },
        { status: 404 }
      );
    }

    const base = normalizeUnipileBase(requireEnv("UNIPILE_DSN"));
    const apiKey = requireEnv("UNIPILE_API_KEY");
    const unipileApiConfig = { base, apiKey };
    const attendeeResolutionCache = new Map<string, Promise<ResolvedAttendee | null>>();
    const avatarStorageCache = new Map<string, Promise<string | null>>();

    const threadResult = await fetchFirstSuccessful(
      [
        `${base}/api/v1/chats?account_id=${encodeURIComponent(unipileAccountId)}&limit=100`,
        `${base}/api/v1/conversations?account_id=${encodeURIComponent(
          unipileAccountId
        )}&limit=100`,
      ],
      {
        method: "GET",
        headers: {
          "X-API-KEY": apiKey,
          accept: "application/json",
        },
      }
    );

    if (!threadResult) {
      return NextResponse.json({ error: "unipile_threads_fetch_failed" }, { status: 502 });
    }

    const threadItems = extractArrayCandidates(threadResult.payload);
    let threadsSynced = 0;
    let messagesInserted = 0;

    for (const threadItem of threadItems) {
      const parsedThread = parseThreadFromItem(threadItem);
      if (!parsedThread) continue;

      const resolvedThreadAttendee = await resolveOtherAttendeeForChat({
        unipileAccountId,
        chatId: parsedThread.unipileThreadId,
        config: unipileApiConfig,
      }).catch((error: unknown) => {
        console.error("INBOX_SYNC_THREAD_ATTENDEE_RESOLVE_ERROR:", error);
        return null;
      });

      const threadContactName =
        parsedThread.contactName ?? resolvedThreadAttendee?.name ?? null;
      const threadContactLinkedInUrl =
        parsedThread.contactLinkedInUrl ?? resolvedThreadAttendee?.linkedinUrl ?? null;
      let threadContactAvatarUrl =
        parsedThread.contactAvatarUrl ?? resolvedThreadAttendee?.avatarUrl ?? null;

      const leadId = await resolveLeadIdByUrl(
        supabase,
        clientId,
        threadContactLinkedInUrl
      );

      const threadUpsertRecord: Record<string, unknown> = {
        client_id: clientId,
        provider: "linkedin",
        unipile_account_id: unipileAccountId,
        unipile_thread_id: parsedThread.unipileThreadId,
        updated_at: new Date().toISOString(),
      };

      if (leadId !== null) {
        threadUpsertRecord.lead_id = leadId;
      }

      if (threadContactLinkedInUrl) {
        threadUpsertRecord.lead_linkedin_url = threadContactLinkedInUrl;
        threadUpsertRecord.contact_linkedin_url = threadContactLinkedInUrl;
      }

      if (threadContactName) {
        threadUpsertRecord.contact_name = threadContactName;
      }

      if (threadContactAvatarUrl) {
        threadUpsertRecord.contact_avatar_url = threadContactAvatarUrl;
      }

      const { error: threadUpsertErr } = await supabase
        .from("inbox_threads")
        .upsert(threadUpsertRecord, {
          onConflict: "client_id,unipile_account_id,unipile_thread_id",
        });

      if (threadUpsertErr) {
        console.error("INBOX_SYNC_THREAD_UPSERT_ERROR:", threadUpsertErr);
        continue;
      }

      threadsSynced += 1;

      const { data: dbThread } = await supabase
        .from("inbox_threads")
        .select("id, unread_count, last_read_at, contact_name, contact_avatar_url")
        .eq("client_id", clientId)
        .eq("unipile_account_id", unipileAccountId)
        .eq("unipile_thread_id", parsedThread.unipileThreadId)
        .limit(1)
        .maybeSingle();

      if (!dbThread?.id) continue;
      const threadLastReadAtMs = parseIsoMs(
        typeof dbThread.last_read_at === "string" ? dbThread.last_read_at : null
      );
      const threadUnreadCount = Number(dbThread.unread_count ?? 0);
      let unreadIncrement = 0;

      const messagesResult = await fetchFirstSuccessful(
        [
          `${base}/api/v1/chats/${encodeURIComponent(
            parsedThread.unipileThreadId
          )}/messages?account_id=${encodeURIComponent(unipileAccountId)}&limit=30`,
          `${base}/api/v1/conversations/${encodeURIComponent(
            parsedThread.unipileThreadId
          )}/messages?account_id=${encodeURIComponent(unipileAccountId)}&limit=30`,
          `${base}/api/v1/messages?account_id=${encodeURIComponent(
            unipileAccountId
          )}&chat_id=${encodeURIComponent(parsedThread.unipileThreadId)}&limit=30`,
        ],
        {
          method: "GET",
          headers: {
            "X-API-KEY": apiKey,
            accept: "application/json",
          },
        }
      );

      if (!messagesResult) continue;

      const messageItems = extractArrayCandidates(messagesResult.payload);
      let latestMessageAtIso: string | null = null;
      let latestMessageAtMs = Number.NEGATIVE_INFINITY;
      let latestMessagePreview: string | null = null;
      const existingContactName =
        typeof dbThread.contact_name === "string" ? dbThread.contact_name.trim() : "";
      const existingContactAvatar =
        typeof dbThread.contact_avatar_url === "string"
          ? dbThread.contact_avatar_url.trim()
          : "";
      let backfillContactName: string | null = null;
      let backfillContactLinkedInUrl: string | null = null;
      let backfillContactAvatarUrl: string | null = null;
      let latestInboundWithNameAtMs = Number.NEGATIVE_INFINITY;

      if (!existingContactAvatar && !threadContactAvatarUrl && resolvedThreadAttendee?.attendeeId) {
        const avatarCacheKey = `${clientId}:${unipileAccountId}:${resolvedThreadAttendee.attendeeId}`;
        if (!avatarStorageCache.has(avatarCacheKey)) {
          avatarStorageCache.set(
            avatarCacheKey,
            saveAttendeeAvatarToStorage({
              clientId,
              unipileAccountId,
              attendeeId: resolvedThreadAttendee.attendeeId,
            }).catch((error: unknown) => {
              console.error("INBOX_SYNC_THREAD_AVATAR_STORAGE_ERROR:", error);
              return null;
            })
          );
        }
        const storedAvatarUrl = await avatarStorageCache.get(avatarCacheKey);
        if (storedAvatarUrl) {
          threadContactAvatarUrl = storedAvatarUrl;
          backfillContactAvatarUrl = storedAvatarUrl;
        }
      }

      for (const messageItem of messageItems) {
        const parsedMessage = parseUnipileMessage({
          ...messageItem,
          thread_id:
            getFirstString(messageItem, [["thread_id"], ["threadId"]]) ??
            parsedThread.unipileThreadId,
        });

        const strictSentAtIso = extractMessageSentAtIso(messageItem);
        const strictSentAtMs = parseIsoMs(strictSentAtIso);
        if (strictSentAtIso && strictSentAtMs > latestMessageAtMs) {
          latestMessageAtMs = strictSentAtMs;
          latestMessageAtIso = strictSentAtIso;
          latestMessagePreview = truncatePreview(parsedMessage.text);
        }

        if (!parsedMessage.unipileMessageId) continue;

        const senderAttendeeId = extractSenderAttendeeId(messageItem);
        let resolvedSenderAttendeeId = senderAttendeeId;
        let messageSenderName = parsedMessage.senderName;
        let messageSenderLinkedInUrl = parsedMessage.senderLinkedInUrl;
        let messageSenderAvatar = extractMessageSenderAvatar(messageItem);

        if (parsedMessage.direction === "outbound") {
          messageSenderName = null;
        }

        if (
          parsedMessage.direction === "inbound" &&
          (!messageSenderName || !messageSenderLinkedInUrl || !messageSenderAvatar) &&
          senderAttendeeId
        ) {
          const cacheKey = `${unipileAccountId}:${parsedThread.unipileThreadId}:${senderAttendeeId}`;
          if (!attendeeResolutionCache.has(cacheKey)) {
            attendeeResolutionCache.set(
              cacheKey,
              resolveAttendeeForMessage({
                supabase,
                clientId,
                unipileAccountId,
                senderAttendeeId,
                chatId: parsedThread.unipileThreadId,
                config: unipileApiConfig,
              }).catch((error: unknown) => {
                console.error("INBOX_SYNC_MESSAGE_ATTENDEE_RESOLVE_ERROR:", error);
                return null;
              })
            );
          }

          const resolvedAttendee = await attendeeResolutionCache.get(cacheKey);
          if (resolvedAttendee) {
            if (!resolvedSenderAttendeeId && resolvedAttendee.attendeeId) {
              resolvedSenderAttendeeId = resolvedAttendee.attendeeId;
            }
            if (!messageSenderName && resolvedAttendee.name) {
              messageSenderName = resolvedAttendee.name;
            }
            if (!messageSenderLinkedInUrl && resolvedAttendee.linkedinUrl) {
              messageSenderLinkedInUrl = resolvedAttendee.linkedinUrl;
            }
            if (!messageSenderAvatar && resolvedAttendee.avatarUrl) {
              messageSenderAvatar = resolvedAttendee.avatarUrl;
            }
          }
        }

        if (!messageSenderAvatar && !existingContactAvatar && resolvedSenderAttendeeId) {
          const avatarCacheKey = `${clientId}:${unipileAccountId}:${resolvedSenderAttendeeId}`;
          if (!avatarStorageCache.has(avatarCacheKey)) {
            avatarStorageCache.set(
              avatarCacheKey,
              saveAttendeeAvatarToStorage({
                clientId,
                unipileAccountId,
                attendeeId: resolvedSenderAttendeeId,
              }).catch((error: unknown) => {
                console.error("INBOX_SYNC_MESSAGE_AVATAR_STORAGE_ERROR:", error);
                return null;
              })
            );
          }
          const storedAvatarUrl = await avatarStorageCache.get(avatarCacheKey);
          if (storedAvatarUrl) messageSenderAvatar = storedAvatarUrl;
        }

        const messageSentAtMs = strictSentAtIso
          ? strictSentAtMs
          : parseIsoMs(parsedMessage.sentAtIso);

        if (!existingContactName && parsedMessage.direction === "inbound") {
          const senderName = (messageSenderName ?? "").trim();
          if (senderName && messageSentAtMs >= latestInboundWithNameAtMs) {
            latestInboundWithNameAtMs = messageSentAtMs;
            backfillContactName = senderName;
            backfillContactLinkedInUrl = messageSenderLinkedInUrl;
            backfillContactAvatarUrl = messageSenderAvatar;
          }
        }

        const resolvedSenderPatch: Record<string, unknown> = {};
        if (resolvedSenderAttendeeId) resolvedSenderPatch.attendee_id = resolvedSenderAttendeeId;
        if (messageSenderName) resolvedSenderPatch.name = messageSenderName;
        if (messageSenderLinkedInUrl) {
          resolvedSenderPatch.linkedin_url = messageSenderLinkedInUrl;
        }
        if (messageSenderAvatar) resolvedSenderPatch.avatar_url = messageSenderAvatar;
        const messageRaw =
          Object.keys(resolvedSenderPatch).length > 0
            ? ({
                ...messageItem,
                resolved_sender: resolvedSenderPatch,
              } satisfies Record<string, unknown>)
            : messageItem;

        const { data: existingMessage, error: existingMessageErr } = await supabase
          .from("inbox_messages")
          .select("id, sender_name, sender_linkedin_url, raw")
          .eq("client_id", clientId)
          .eq("unipile_account_id", unipileAccountId)
          .eq("unipile_message_id", parsedMessage.unipileMessageId)
          .limit(1)
          .maybeSingle();

        if (existingMessageErr) {
          console.error("INBOX_SYNC_MESSAGE_EXISTS_ERROR:", existingMessageErr);
          continue;
        }

        if (existingMessage?.id) {
          const existingSenderName =
            typeof existingMessage.sender_name === "string"
              ? existingMessage.sender_name.trim()
              : "";
          const existingSenderLinkedInUrl =
            typeof existingMessage.sender_linkedin_url === "string"
              ? existingMessage.sender_linkedin_url.trim()
              : "";

          const existingPatch: Record<string, unknown> = {};
          if (parsedMessage.direction === "outbound" && existingSenderName) {
            existingPatch.sender_name = null;
          }
          if (!existingSenderName && messageSenderName) {
            existingPatch.sender_name = messageSenderName;
          }
          if (!existingSenderLinkedInUrl && messageSenderLinkedInUrl) {
            existingPatch.sender_linkedin_url = messageSenderLinkedInUrl;
          }
          if (Object.keys(resolvedSenderPatch).length > 0) {
            const existingRaw =
              existingMessage.raw && typeof existingMessage.raw === "object"
                ? (existingMessage.raw as Record<string, unknown>)
                : {};
            existingPatch.raw = {
              ...existingRaw,
              resolved_sender: resolvedSenderPatch,
            };
          }

          if (Object.keys(existingPatch).length > 0) {
            const { error: existingUpdateErr } = await supabase
              .from("inbox_messages")
              .update(existingPatch)
              .eq("id", String(existingMessage.id))
              .eq("client_id", clientId);

            if (existingUpdateErr) {
              console.error("INBOX_SYNC_MESSAGE_ENRICH_UPDATE_ERROR:", existingUpdateErr);
            }
          }
          continue;
        }

        const { error: messageInsertErr } = await supabase.from("inbox_messages").insert({
          client_id: clientId,
          provider: "linkedin",
          thread_db_id: String(dbThread.id),
          unipile_account_id: unipileAccountId,
          unipile_thread_id: parsedMessage.unipileThreadId ?? parsedThread.unipileThreadId,
          unipile_message_id: parsedMessage.unipileMessageId,
          direction: parsedMessage.direction,
          sender_name: parsedMessage.direction === "outbound" ? null : messageSenderName,
          sender_linkedin_url: messageSenderLinkedInUrl,
          text: parsedMessage.text,
          sent_at: parsedMessage.sentAtIso,
          raw: messageRaw,
        });

        if (messageInsertErr) {
          console.error("INBOX_SYNC_MESSAGE_INSERT_ERROR:", messageInsertErr);
          continue;
        }

        const shouldIncrementUnread =
          parsedMessage.direction === "inbound" &&
          (threadLastReadAtMs === Number.NEGATIVE_INFINITY ||
            messageSentAtMs > threadLastReadAtMs);
        if (shouldIncrementUnread) {
          unreadIncrement += 1;
        }

        messagesInserted += 1;
      }

      const threadUpdatePayload: Record<string, unknown> = {};
      if (latestMessageAtIso && Number.isFinite(latestMessageAtMs)) {
        threadUpdatePayload.last_message_at = latestMessageAtIso;
        threadUpdatePayload.last_message_preview = latestMessagePreview;
      } else if (messageItems.length > 0) {
        console.warn(
          "INBOX_SYNC_INVALID_LAST_MESSAGE_AT:",
          parsedThread.unipileThreadId
        );
      }

      if (backfillContactName) {
        threadUpdatePayload.contact_name = backfillContactName;
        if (backfillContactLinkedInUrl) {
          threadUpdatePayload.contact_linkedin_url = backfillContactLinkedInUrl;
        }
      }

      if (!existingContactAvatar && backfillContactAvatarUrl) {
        threadUpdatePayload.contact_avatar_url = backfillContactAvatarUrl;
      }

      if (unreadIncrement > 0) {
        const safeThreadUnread = Number.isFinite(threadUnreadCount) ? threadUnreadCount : 0;
        threadUpdatePayload.unread_count = safeThreadUnread + unreadIncrement;
      }

      if (Object.keys(threadUpdatePayload).length === 0) {
        continue;
      }
      threadUpdatePayload.updated_at = new Date().toISOString();

      const { error: threadPostSyncErr } = await supabase
        .from("inbox_threads")
        .update(threadUpdatePayload)
        .eq("id", String(dbThread.id))
        .eq("client_id", clientId);

      if (threadPostSyncErr) {
        console.error("INBOX_SYNC_THREAD_POST_UPDATE_ERROR:", threadPostSyncErr);
      }
    }

    return NextResponse.json({ success: true, threadsSynced, messagesInserted });
  } catch (error: unknown) {
    console.error("INBOX_SYNC_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
