const ONBOARDING_COMPLETED_KEY = "onboardingCompleted";
const ONBOARDING_COMPLETED_AT_KEY = "onboardingCompletedAt";
const ONBOARDING_REQUIRED_KEY = "onboardingRequired";
const ONBOARDING_INTRO_SEEN_KEY_PREFIX = "mindlink:onboarding:intro-seen";
const ONBOARDING_COMPLETED_KEY_PREFIX = "mindlink:onboarding:completed";

type MetaRecord = Record<string, unknown> | null;

function toRecord(value: unknown): MetaRecord {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function getOnboardingState(
  publicMetadata: unknown,
  unsafeMetadata: unknown
) {
  const publicMeta = toRecord(publicMetadata);
  const unsafeMeta = toRecord(unsafeMetadata);

  const completed = publicMeta?.[ONBOARDING_COMPLETED_KEY] === true;
  const required = unsafeMeta?.[ONBOARDING_REQUIRED_KEY] === true && !completed;

  return { completed, required };
}

export function getOnboardingMetadataForCompletion() {
  return {
    publicMetadata: {
      [ONBOARDING_COMPLETED_KEY]: true,
      [ONBOARDING_COMPLETED_AT_KEY]: new Date().toISOString(),
    },
    unsafeMetadata: {
      [ONBOARDING_REQUIRED_KEY]: false,
    },
  };
}

export function getOnboardingUnsafeMetadataForSignup() {
  return {
    [ONBOARDING_REQUIRED_KEY]: true,
  };
}

export function getOnboardingIntroSeenStorageKey(userId: string) {
  return `${ONBOARDING_INTRO_SEEN_KEY_PREFIX}:${userId}`;
}

export function getOnboardingCompletedStorageKey(userId: string) {
  return `${ONBOARDING_COMPLETED_KEY_PREFIX}:${userId}`;
}
