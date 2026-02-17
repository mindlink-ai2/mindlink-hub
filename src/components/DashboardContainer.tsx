"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  getOnboardingCompletedStorageKey,
  getOnboardingState,
} from "@/lib/onboarding";

export default function DashboardContainer({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoaded, isSignedIn } = useUser();

  useEffect(() => {
    if (!isSignedIn) return;

    fetch("/api/link-clerk-user", {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  }, [isSignedIn, user?.id]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) return;
    if (
      pathname.startsWith("/onboarding") ||
      pathname.startsWith("/sign-in") ||
      pathname.startsWith("/sign-up")
    ) {
      return;
    }

    const onboarding = getOnboardingState(
      user.publicMetadata,
      user.unsafeMetadata
    );
    const completedInBrowser =
      typeof window !== "undefined" &&
      window.localStorage.getItem(getOnboardingCompletedStorageKey(user.id)) === "1";

    if (onboarding.required && !completedInBrowser) {
      router.replace("/onboarding");
    }
  }, [isLoaded, isSignedIn, pathname, router, user]);

  return (
    <div className="mx-auto w-full max-w-[1480px] px-4 sm:px-6 py-8">
      {children}
    </div>
  );
}
