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
