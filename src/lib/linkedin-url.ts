export function normalizeLinkedInUrl(value: string | null | undefined): string | null {
  if (!value) return null;

  const raw = value.trim();
  if (!raw) return null;

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");

    let path = parsed.pathname.trim();
    if (!path.startsWith("/")) path = `/${path}`;
    path = path.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
    if (!path) path = "/";

    return `https://${host}${path}`.toLowerCase();
  } catch {
    return null;
  }
}

export function normalizeTextForComparison(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeLinkedInHost(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  if (!host.endsWith("linkedin.com")) return null;
  return "linkedin.com";
}

function normalizeLinkedInPathForMatching(pathname: string): string {
  const safePath = pathname || "/";
  const decoded = (() => {
    try {
      return decodeURIComponent(safePath);
    } catch {
      return safePath;
    }
  })();

  const cleaned = decoded.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
  const parts = cleaned.split("/").filter(Boolean);
  if (parts.length >= 2 && normalizeTextForComparison(parts[0]) === "in") {
    const slug = normalizeTextForComparison(parts[1]) ?? parts[1].toLowerCase();
    return `/in/${slug}`;
  }

  return `/${parts.map((part) => normalizeTextForComparison(part) ?? part.toLowerCase()).join("/")}`;
}

export function normalizeLinkedInUrlForMatching(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const decodedRaw = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })();

  const withProtocol = /^https?:\/\//i.test(decodedRaw)
    ? decodedRaw
    : `https://${decodedRaw}`;

  try {
    const parsed = new URL(withProtocol);
    const host = normalizeLinkedInHost(parsed.hostname);
    if (!host) return null;

    const normalizedPath = normalizeLinkedInPathForMatching(parsed.pathname);
    return `https://${host}${normalizedPath}`.toLowerCase();
  } catch {
    return null;
  }
}

export function extractLinkedInProfileSlug(value: string | null | undefined): string | null {
  const normalized = normalizeLinkedInUrl(value);
  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    const match = parsed.pathname.match(/^\/in\/([^/?#]+)/i);
    if (match?.[1]) return decodeURIComponent(match[1]).toLowerCase();

    const singleSegment = parsed.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
    if (singleSegment && !singleSegment.includes("/")) {
      return decodeURIComponent(singleSegment).toLowerCase();
    }

    return null;
  } catch {
    return null;
  }
}

export function extractLinkedInProfileSlugForMatching(
  value: string | null | undefined
): string | null {
  const normalized = normalizeLinkedInUrlForMatching(value);
  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    const match = parsed.pathname.match(/^\/in\/([^/?#]+)/i);
    if (match?.[1]) return normalizeTextForComparison(match[1]);
    return null;
  } catch {
    return null;
  }
}
