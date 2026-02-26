export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
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

export async function resolveUnipileProviderId(params: {
  baseUrl: string;
  apiKey: string;
  accountId: string;
  profileSlug: string;
}): Promise<{ ok: true; providerId: string } | { ok: false; error: string; details?: unknown }> {
  const { baseUrl, apiKey, accountId, profileSlug } = params;

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

  const providerId =
    payload && typeof payload === "object" && "provider_id" in payload
      ? String(payload.provider_id ?? "").trim()
      : "";

  if (!providerId) {
    return { ok: false, error: "unipile_provider_id_missing", details: payload };
  }

  return { ok: true, providerId };
}

export async function sendUnipileInvitation(params: {
  baseUrl: string;
  apiKey: string;
  accountId: string;
  providerId: string;
}): Promise<{ ok: true; payload: unknown } | { ok: false; error: string; details?: unknown }> {
  const { baseUrl, apiKey, accountId, providerId } = params;

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
