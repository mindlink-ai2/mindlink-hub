import "server-only";

export function deriveSheetTabName(
  companyName: string | null,
  email: string | null,
  orgId: number
): string {
  const name = companyName ?? `Client ${orgId}`;
  const suffix = email ? ` — ${email}` : "";
  return `${name}${suffix}`
    .replace(/[\\/?*[\]:]/g, "-")
    .slice(0, 100);
}
