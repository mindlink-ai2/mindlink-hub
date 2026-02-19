import "server-only";
import { createServiceSupabase, normalizeUnipileBase, requireEnv } from "@/lib/inbox-server";
import { getFirstString, toJsonObject } from "@/lib/unipile-inbox";

type DownloadedAvatar = {
  bytes: ArrayBuffer;
  contentType: string;
};

function isImageContentType(value: string | null): value is string {
  if (!value) return false;
  return value.toLowerCase().startsWith("image/");
}

async function readAvatarFromResponse(response: Response): Promise<DownloadedAvatar | null> {
  const contentType = response.headers.get("content-type");
  if (isImageContentType(contentType)) {
    const bytes = await response.arrayBuffer().catch(() => null);
    if (bytes && bytes.byteLength > 0) {
      return { bytes, contentType };
    }
    return null;
  }

  const payload = toJsonObject(await response.json().catch(() => ({})));
  const imageUrl = getFirstString(payload, [
    ["url"],
    ["avatar_url"],
    ["avatarUrl"],
    ["photo_url"],
    ["photoUrl"],
    ["picture_url"],
    ["pictureUrl"],
    ["data", "url"],
    ["data", "avatar_url"],
    ["data", "photo_url"],
  ]);

  if (!imageUrl) return null;
  const imageResponse = await fetch(imageUrl).catch(() => null);
  if (!imageResponse || !imageResponse.ok) return null;
  const externalContentType = imageResponse.headers.get("content-type");
  if (!isImageContentType(externalContentType)) return null;
  const bytes = await imageResponse.arrayBuffer().catch(() => null);
  if (!bytes || bytes.byteLength === 0) return null;
  return { bytes, contentType: externalContentType };
}

async function downloadAttendeeAvatar(params: {
  unipileAccountId: string;
  attendeeId: string;
}): Promise<DownloadedAvatar | null> {
  const { unipileAccountId, attendeeId } = params;
  const base = normalizeUnipileBase(requireEnv("UNIPILE_DSN"));
  const apiKey = requireEnv("UNIPILE_API_KEY");

  const accountId = encodeURIComponent(unipileAccountId);
  const attendee = encodeURIComponent(attendeeId);
  const endpoints = [
    `${base}/api/v1/attendees/${attendee}/picture?account_id=${accountId}`,
    `${base}/api/v1/attendees/${attendee}/avatar?account_id=${accountId}`,
    `${base}/api/v1/attendees/${attendee}/photo?account_id=${accountId}`,
    `${base}/api/v1/users/${attendee}/picture?account_id=${accountId}`,
    `${base}/api/v1/profiles/${attendee}/picture?account_id=${accountId}`,
  ];

  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "X-API-KEY": apiKey,
        accept: "application/json, image/*",
      },
      redirect: "follow",
    }).catch(() => null);

    if (!response || !response.ok) continue;
    const downloaded = await readAvatarFromResponse(response);
    if (downloaded) return downloaded;
  }

  return null;
}

export async function saveAttendeeAvatarToStorage(params: {
  clientId: string;
  unipileAccountId: string;
  attendeeId: string;
  contentType?: string;
}): Promise<string | null> {
  const { clientId, unipileAccountId, attendeeId, contentType } = params;
  const normalizedAttendeeId = attendeeId.trim();
  if (!normalizedAttendeeId) return null;

  const downloaded = await downloadAttendeeAvatar({
    unipileAccountId,
    attendeeId: normalizedAttendeeId,
  }).catch((error: unknown) => {
    console.error("UNIPILE_AVATAR_DOWNLOAD_ERROR:", error);
    return null;
  });

  if (!downloaded) return null;

  const supabase = createServiceSupabase();
  const path = `linkedin/${clientId}/${unipileAccountId}/${normalizedAttendeeId}.jpg`;
  const uploadContentType = downloaded.contentType || contentType || "image/jpeg";

  const { error: uploadErr } = await supabase.storage.from("avatars").upload(
    path,
    downloaded.bytes,
    {
      upsert: true,
      contentType: uploadContentType,
      cacheControl: "604800",
    }
  );

  if (uploadErr) {
    console.error("UNIPILE_AVATAR_UPLOAD_ERROR:", uploadErr);
    return null;
  }

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl || null;
}
