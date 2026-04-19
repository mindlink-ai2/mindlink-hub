export function requireEnv(name: string): string {
  const valueFromProcess =
    typeof process !== "undefined" && process?.env ? process.env[name] : undefined;
  const valueFromDeno = (
    globalThis as {
      Deno?: { env?: { get?: (key: string) => string | undefined } };
    }
  ).Deno?.env?.get?.(name);
  const value = valueFromProcess ?? valueFromDeno;

  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

export function normalizeUnipileBase(dsn: string): string {
  return dsn.replace(/\/+$/, "").replace(/\/api\/v1\/.*$/, "");
}

export function extractLinkedInProfileSlug(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const withoutProtocol = raw.replace(/^https?:\/\//i, "");
  const normalized = withoutProtocol.startsWith("www.")
    ? withoutProtocol.slice(4)
    : withoutProtocol;

  const fullMatch = normalized.match(/linkedin\.com\/(?:in|pub)\/([^/?#]+)/i);
  if (fullMatch?.[1]) return decodeURIComponent(fullMatch[1]).toLowerCase();

  const pathOnlyMatch = raw.match(/^(?:in|pub)\/([^/?#]+)/i);
  if (pathOnlyMatch?.[1]) return decodeURIComponent(pathOnlyMatch[1]).toLowerCase();

  const slugLike = raw.match(/^[-a-zA-Z0-9_%.]{3,120}$/);
  if (slugLike?.[0]) return decodeURIComponent(slugLike[0]).toLowerCase();

  return null;
}

export async function readResponseBody(
  response: Response
): Promise<Record<string, unknown> | string | null> {
  const text = await response.text().catch(() => "");
  if (!text) return null;

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return text;
  }
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractProviderId(payload: unknown): string | null {
  const root = toRecord(payload);
  const data = toRecord(root?.data);

  const direct =
    typeof root?.provider_id === "string" && root.provider_id.trim()
      ? root.provider_id.trim()
      : typeof root?.providerId === "string" && root.providerId.trim()
        ? root.providerId.trim()
        : null;
  if (direct) return direct;

  if (typeof data?.provider_id === "string" && data.provider_id.trim()) {
    return data.provider_id.trim();
  }
  if (typeof data?.providerId === "string" && data.providerId.trim()) {
    return data.providerId.trim();
  }

  return null;
}

export async function resolveUnipileProviderId(params: {
  baseUrl: string;
  apiKey: string;
  accountId: string;
  profileSlug: string;
}): Promise<{ ok: true; providerId: string } | { ok: false; error: string; details?: unknown }> {
  const { baseUrl, apiKey, accountId, profileSlug } = params;
  try {
    const response = await fetch(
      `${baseUrl}/api/v1/users/${encodeURIComponent(profileSlug)}?account_id=${encodeURIComponent(
        accountId
      )}`,
      {
        method: "GET",
        headers: {
          "X-API-KEY": apiKey,
          accept: "application/json",
        },
      }
    );

    const payload = await readResponseBody(response);
    if (!response.ok) {
      return { ok: false, error: "unipile_profile_lookup_failed", details: payload };
    }

    const providerId = extractProviderId(payload);
    if (!providerId) {
      return { ok: false, error: "unipile_provider_id_missing", details: payload };
    }

    return { ok: true, providerId };
  } catch (error) {
    return {
      ok: false,
      error: "unipile_profile_lookup_request_failed",
      details: String(error),
    };
  }
}

export async function sendUnipileInvitation(params: {
  baseUrl: string;
  apiKey: string;
  accountId: string;
  providerId: string;
}): Promise<{ ok: true; payload: unknown } | { ok: false; error: string; details?: unknown }> {
  const { baseUrl, apiKey, accountId, providerId } = params;
  try {
    const response = await fetch(`${baseUrl}/api/v1/users/invite`, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        account_id: accountId,
        provider_id: providerId,
      }),
    });

    const payload = await readResponseBody(response);
    if (!response.ok) {
      return { ok: false, error: "unipile_invite_failed", details: payload };
    }

    return { ok: true, payload };
  } catch (error) {
    return {
      ok: false,
      error: "unipile_invite_request_failed",
      details: String(error),
    };
  }
}

export async function createUnipileChatWithMessage(params: {
  baseUrl: string;
  apiKey: string;
  accountId: string;
  attendeeProviderId: string;
  text: string;
}): Promise<
  | { ok: true; threadId: string; messageId: string | null; sentAt: string | null; payload: unknown }
  | { ok: false; error: string; details?: unknown }
> {
  const { baseUrl, apiKey, accountId, attendeeProviderId, text } = params;

  const urls = [`${baseUrl}/api/v1/chats`, `${baseUrl}/api/v1/conversations`];

  for (const url of urls) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        account_id: accountId,
        provider: "LINKEDIN",
        attendees_ids: [attendeeProviderId],
        text,
      }),
    });

    const payload = await readResponseBody(response);
    if (!response.ok) continue;

    const obj = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    const data = obj.data && typeof obj.data === "object" ? (obj.data as Record<string, unknown>) : {};
    const msg = obj.message && typeof obj.message === "object" ? (obj.message as Record<string, unknown>) : {};

    const threadId =
      String(obj.thread_id ?? obj.threadId ?? obj.conversation_id ?? obj.id ?? data.thread_id ?? data.id ?? "").trim() || null;

    if (!threadId) continue;

    const messageId =
      String(msg.message_id ?? msg.id ?? obj.message_id ?? data.message_id ?? "").trim() || null;
    const sentAt =
      String(msg.sent_at ?? msg.created_at ?? obj.sent_at ?? data.sent_at ?? "").trim() || null;

    return { ok: true, threadId, messageId, sentAt, payload };
  }

  return { ok: false, error: "unipile_create_chat_failed" };
}

export async function sendUnipileMessage(params: {
  baseUrl: string;
  apiKey: string;
  accountId: string;
  threadId: string;
  text: string;
}): Promise<{ ok: true; payload: unknown } | { ok: false; error: string; details?: unknown }> {
  const { baseUrl, apiKey, accountId, threadId, text } = params;

  const urls = [
    `${baseUrl}/api/v1/chats/${encodeURIComponent(threadId)}/messages`,
    `${baseUrl}/api/v1/conversations/${encodeURIComponent(threadId)}/messages`,
    `${baseUrl}/api/v1/messages`,
  ];

  for (const url of urls) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        /\/api\/v1\/messages$/.test(url)
          ? {
              account_id: accountId,
              chat_id: threadId,
              text,
            }
          : {
              account_id: accountId,
              text,
            }
      ),
    });

    const payload = await readResponseBody(response);
    if (response.ok) {
      return { ok: true, payload };
    }
  }

  return { ok: false, error: "unipile_send_failed" };
}
