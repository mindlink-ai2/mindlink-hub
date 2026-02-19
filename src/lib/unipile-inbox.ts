import { normalizeLinkedInUrl } from "@/lib/linkedin-url";

export type JsonObject = Record<string, unknown>;

export type InboxEventKind =
  | "new_message"
  | "message_edit"
  | "message_delete"
  | "message_reaction"
  | "message_delivered"
  | "message_read"
  | "new_relation"
  | "unknown";

export type ParsedUnipileMessage = {
  unipileThreadId: string | null;
  unipileMessageId: string | null;
  sentAtIso: string;
  text: string | null;
  direction: "inbound" | "outbound";
  senderName: string | null;
  senderLinkedInUrl: string | null;
};

export type ParsedUnipileEvent = ParsedUnipileMessage & {
  eventType: string;
  kind: InboxEventKind;
  unipileAccountId: string | null;
};

function getPathValue(obj: JsonObject, path: string[]): unknown {
  let current: unknown = obj;

  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return null;
    current = (current as JsonObject)[key];
  }

  return current;
}

export function toJsonObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

export function getFirstString(obj: JsonObject, paths: string[][]): string | null {
  for (const path of paths) {
    const value = getPathValue(obj, path);
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

export function getFirstBoolean(obj: JsonObject, paths: string[][]): boolean | null {
  for (const path of paths) {
    const value = getPathValue(obj, path);
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") return false;
    }
    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
    }
  }
  return null;
}

function normalizeEventType(rawEvent: string | null): string {
  if (!rawEvent) return "UNKNOWN";
  return rawEvent
    .trim()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_")
    .toUpperCase();
}

export function classifyInboxEvent(eventType: string): InboxEventKind {
  const e = eventType.toUpperCase();

  if (e.includes("NEW_RELATION")) return "new_relation";
  if (e.includes("MESSAGE_EDIT") || e.includes("EDIT_MESSAGE")) return "message_edit";
  if (e.includes("MESSAGE_DELETE") || e.includes("DELETE_MESSAGE")) return "message_delete";
  if (e.includes("MESSAGE_REACTION") || e.includes("NEW_REACTION") || e.includes("REACTION")) {
    return "message_reaction";
  }
  if (e.includes("MESSAGE_DELIVERED") || e.includes("DELIVERED")) return "message_delivered";
  if (e.includes("MESSAGE_READ") || e.includes("READ")) return "message_read";
  if (e.includes("NEW_MESSAGE") || e.includes("MESSAGE_NEW")) return "new_message";

  return "unknown";
}

function extractEventType(payload: JsonObject): string {
  return normalizeEventType(
    getFirstString(payload, [
      ["event_type"],
      ["eventType"],
      ["event"],
      ["type"],
      ["name"],
      ["event", "type"],
      ["event", "name"],
      ["trigger"],
      ["action"],
    ])
  );
}

function extractDirection(payload: JsonObject): "inbound" | "outbound" {
  const directionRaw = getFirstString(payload, [
    ["direction"],
    ["message", "direction"],
    ["data", "direction"],
    ["message_direction"],
    ["messageDirection"],
  ]);

  if (directionRaw) {
    const d = directionRaw.toLowerCase();
    if (d.includes("out")) return "outbound";
    if (d.includes("in")) return "inbound";
    if (d.includes("sent")) return "outbound";
    if (d.includes("received")) return "inbound";
  }

  const isSelf = getFirstBoolean(payload, [
    ["is_sender"],
    ["from_me"],
    ["is_from_me"],
    ["is_outbound"],
    ["message", "is_sender"],
    ["message", "from_me"],
    ["sender", "is_self"],
  ]);

  if (isSelf === true) return "outbound";
  return "inbound";
}

function extractTimestamp(payload: JsonObject): string {
  const value = getFirstString(payload, [
    ["sent_at"],
    ["sentAt"],
    ["timestamp"],
    ["occurred_at"],
    ["occurredAt"],
    ["created_at"],
    ["createdAt"],
    ["message", "sent_at"],
    ["message", "timestamp"],
    ["message", "created_at"],
    ["data", "sent_at"],
    ["data", "timestamp"],
  ]);

  if (!value) return new Date().toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function extractSenderLinkedInUrl(payload: JsonObject): string | null {
  const url = getFirstString(payload, [
    ["data", "sender", "profile_url"],
    ["data", "sender", "profileUrl"],
    ["data", "sender", "linkedin_url"],
    ["data", "sender", "linkedinUrl"],
    ["data", "attendee", "profile_url"],
    ["data", "attendee", "profileUrl"],
    ["data", "attendee", "linkedin_url"],
    ["data", "attendee", "linkedinUrl"],
    ["data", "contact", "profile_url"],
    ["data", "contact", "profileUrl"],
    ["data", "contact", "linkedin_url"],
    ["data", "contact", "linkedinUrl"],
    ["sender_linkedin_url"],
    ["senderLinkedInUrl"],
    ["sender", "linkedin_url"],
    ["sender", "linkedinUrl"],
    ["sender", "profile_url"],
    ["sender", "profileUrl"],
    ["author", "linkedin_url"],
    ["author", "profile_url"],
    ["from", "linkedin_url"],
    ["from", "profile_url"],
    ["contact", "linkedin_url"],
    ["contact", "profile_url"],
    ["participant", "linkedin_url"],
    ["participant", "profile_url"],
  ]);

  return normalizeLinkedInUrl(url);
}

export function parseUnipileMessage(payloadInput: unknown): ParsedUnipileMessage {
  const payload = toJsonObject(payloadInput);

  const text =
    getFirstString(payload, [
      ["text"],
      ["content"],
      ["body"],
      ["message"],
      ["message", "text"],
      ["message", "content"],
      ["message", "body"],
      ["data", "text"],
      ["data", "content"],
      ["data", "body"],
    ]) ?? null;

  return {
    unipileThreadId: getFirstString(payload, [
      ["thread_id"],
      ["threadId"],
      ["conversation_id"],
      ["conversationId"],
      ["chat_id"],
      ["chatId"],
      ["message", "thread_id"],
      ["message", "conversation_id"],
      ["data", "thread_id"],
      ["data", "conversation_id"],
    ]),
    unipileMessageId: getFirstString(payload, [
      ["message_id"],
      ["messageId"],
      ["id"],
      ["provider_id"],
      ["providerId"],
      ["message", "id"],
      ["message", "message_id"],
      ["message", "provider_id"],
      ["data", "message_id"],
      ["data", "id"],
    ]),
    sentAtIso: extractTimestamp(payload),
    text,
    direction: extractDirection(payload),
    senderName:
      getFirstString(payload, [
        ["data", "sender", "name"],
        ["data", "sender", "full_name"],
        ["data", "sender", "fullName"],
        ["data", "sender", "display_name"],
        ["data", "sender", "displayName"],
        ["data", "attendee", "name"],
        ["data", "attendee", "full_name"],
        ["data", "attendee", "fullName"],
        ["data", "contact", "name"],
        ["data", "contact", "full_name"],
        ["data", "contact", "fullName"],
        ["sender_name"],
        ["senderName"],
        ["sender", "name"],
        ["author", "name"],
        ["from", "name"],
        ["contact", "name"],
      ]) ?? null,
    senderLinkedInUrl: extractSenderLinkedInUrl(payload),
  };
}

export function parseUnipileEvent(payloadInput: unknown): ParsedUnipileEvent {
  const payload = toJsonObject(payloadInput);
  const eventType = extractEventType(payload);
  const parsedMessage = parseUnipileMessage(payload);

  return {
    ...parsedMessage,
    eventType,
    kind: classifyInboxEvent(eventType),
    unipileAccountId: getFirstString(payload, [
      ["account_id"],
      ["accountId"],
      ["account", "id"],
      ["account", "account_id"],
      ["data", "account_id"],
      ["data", "accountId"],
    ]),
  };
}

export function extractArrayCandidates(payloadInput: unknown): JsonObject[] {
  const payload = toJsonObject(payloadInput);

  const directArrays: unknown[] = [
    payload.items,
    payload.data,
    payload.results,
    payload.threads,
    payload.chats,
    payload.conversations,
    payload.messages,
  ];

  for (const candidate of directArrays) {
    if (Array.isArray(candidate)) {
      return candidate.map((item) => toJsonObject(item));
    }

    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const nested = toJsonObject(candidate);
      const nestedArrays: unknown[] = [
        nested.items,
        nested.data,
        nested.results,
        nested.threads,
        nested.chats,
        nested.conversations,
        nested.messages,
      ];
      for (const inner of nestedArrays) {
        if (Array.isArray(inner)) {
          return inner.map((item) => toJsonObject(item));
        }
      }
    }
  }

  if (Array.isArray(payloadInput)) {
    return payloadInput.map((item) => toJsonObject(item));
  }

  return [];
}

export function truncatePreview(text: string | null | undefined, max = 120): string | null {
  if (!text) return null;
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}
