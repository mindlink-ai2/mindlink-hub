"use client";

import { useState } from "react";
import { getOnboardingIntroSeenStorageKey } from "@/lib/onboarding";

type UseOnboardingIntroModalParams = {
  userId?: string;
  enabled: boolean;
};

export function useOnboardingIntroModal({
  userId,
  enabled,
}: UseOnboardingIntroModalParams) {
  const [dismissedInSession, setDismissedInSession] = useState<string | null>(null);

  const storageKey = userId ? getOnboardingIntroSeenStorageKey(userId) : null;

  const alreadySeen =
    typeof window === "undefined" || !storageKey
      ? true
      : window.localStorage.getItem(storageKey) === "1" ||
        dismissedInSession === storageKey;

  const open = Boolean(enabled && storageKey && !alreadySeen);

  function dismiss() {
    if (storageKey) {
      window.localStorage.setItem(storageKey, "1");
      setDismissedInSession(storageKey);
    }
  }

  return { open, dismiss };
}
