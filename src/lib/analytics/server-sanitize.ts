import { createHash } from "crypto";

const SENSITIVE_KEY_PATTERN = /(email|phone|message|body|content|password|token|authorization)/i;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /\+?\d[\d\s().-]{7,}\d/g;

const MAX_VALUE_LENGTH = 300;
const MAX_DEPTH = 4;
const MAX_ITEMS_PER_LEVEL = 32;

type JsonLike = null | boolean | number | string | JsonLike[] | { [key: string]: JsonLike };

function sanitizeString(value: string): string {
  const withoutEmails = value.replace(EMAIL_PATTERN, "[redacted-email]");
  const withoutPhones = withoutEmails.replace(PHONE_PATTERN, "[redacted-phone]");
  if (withoutPhones.length <= MAX_VALUE_LENGTH) return withoutPhones;
  return `${withoutPhones.slice(0, MAX_VALUE_LENGTH - 1)}…`;
}

function sanitizeUnknown(value: unknown, depth = 0): JsonLike {
  if (value === null) return null;
  if (depth > MAX_DEPTH) return "[truncated]";

  if (typeof value === "string") return sanitizeString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ITEMS_PER_LEVEL).map((item) => sanitizeUnknown(item, depth + 1));
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const clean: Record<string, JsonLike> = {};

    entries.slice(0, MAX_ITEMS_PER_LEVEL).forEach(([key, item]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) return;
      clean[key] = sanitizeUnknown(item, depth + 1);
    });
    return clean;
  }

  return String(value);
}

export function sanitizeMetadata(
  value: Record<string, unknown> | undefined
): Record<string, JsonLike> | null {
  if (!value) return null;
  const sanitized = sanitizeUnknown(value);
  if (!sanitized || Array.isArray(sanitized) || typeof sanitized !== "object") return null;
  return sanitized as Record<string, JsonLike>;
}

export function sanitizeElement(
  value: Record<string, unknown> | undefined
): Record<string, JsonLike> | null {
  if (!value) return null;
  const sanitized = sanitizeMetadata(value);
  if (!sanitized) return null;
  return {
    type: typeof sanitized.type === "string" ? sanitized.type : null,
    id: typeof sanitized.id === "string" ? sanitized.id : null,
    text: typeof sanitized.text === "string" ? sanitized.text : null,
    href: typeof sanitized.href === "string" ? sanitized.href : null,
  };
}

export function withinMetadataLimit(
  value: Record<string, JsonLike> | null,
  maxBytes = 5 * 1024
): boolean {
  if (!value) return true;
  const bytes = Buffer.byteLength(JSON.stringify(value), "utf8");
  return bytes <= maxBytes;
}

export function sanitizePath(path: string | undefined): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed) return null;
  const noHash = trimmed.split("#")[0] ?? "";
  const noQuery = noHash.split("?")[0] ?? "";
  if (!noQuery) return null;
  return sanitizeString(noQuery);
}

export function hashIp(ip: string | null, salt: string | undefined): string | null {
  if (!ip) return null;
  const value = `${salt ?? "lidmeo"}:${ip}`;
  return createHash("sha256").update(value).digest("hex");
}

export function extractIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = headers.get("x-real-ip")?.trim();
  return realIp || null;
}
