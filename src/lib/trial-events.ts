export const POST_TRIAL_ACK_KEY = "lidmeo.icpPostTrialAck";
export const POST_TRIAL_ACK_EVENT = "lidmeo:icp-post-trial-ack";

export function hasAckedPostTrial(trialEndsAtIso: string | null): boolean {
  if (!trialEndsAtIso || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(POST_TRIAL_ACK_KEY) === trialEndsAtIso;
  } catch {
    return false;
  }
}

export function ackPostTrial(trialEndsAtIso: string | null): void {
  if (!trialEndsAtIso || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(POST_TRIAL_ACK_KEY, trialEndsAtIso);
    window.dispatchEvent(new CustomEvent(POST_TRIAL_ACK_EVENT));
  } catch {
    // no-op
  }
}
