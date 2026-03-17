export type ClientPlan = "essential" | "full";

export function normalizeClientPlan(value: unknown): ClientPlan {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "full" ? "full" : "essential";
}

export function isFullActivePlan(input: {
  plan: unknown;
  subscriptionStatus: unknown;
}): boolean {
  const plan = normalizeClientPlan(input.plan);
  const subscriptionStatus = String(input.subscriptionStatus ?? "")
    .trim()
    .toLowerCase();
  return plan === "full" && subscriptionStatus === "active";
}
