"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const ONBOARDING_ALLOWED_PATHS = [
  "/dashboard/hub/icp-builder",
  "/dashboard/hub/messages-setup",
];

function isOnboardingAllowed(pathname: string | null): boolean {
  if (!pathname) return false;
  return ONBOARDING_ALLOWED_PATHS.some((p) => pathname.startsWith(p));
}

export default function DashboardGateClient({
  needsOnboarding,
  children,
}: {
  needsOnboarding: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (needsOnboarding && !isOnboardingAllowed(pathname)) {
      router.replace("/onboarding");
    }
  }, [needsOnboarding, pathname, router]);

  // While redirecting on non-allowed pages, don't flash protected content.
  if (needsOnboarding && !isOnboardingAllowed(pathname)) {
    return null;
  }

  return <>{children}</>;
}
