"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

export default function DashboardContainer({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoaded, isSignedIn } = useUser();
  const hasMobileBottomNav = pathname === "/" || pathname.startsWith("/dashboard");

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
      pathname.startsWith("/onboarding/form") ||
      pathname.startsWith("/sign-in") ||
      pathname.startsWith("/sign-up")
    ) {
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/onboarding/status", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!mounted || !res.ok) return;

        const state = data?.state;
        const completed = data?.completed === true || state === "completed";
        if (state && !completed) {
          router.replace("/onboarding");
        }
      } catch {
        // no-op
      }
    })();

    return () => {
      mounted = false;
    };
  }, [isLoaded, isSignedIn, pathname, router, user]);

  return (
    <div
      className={[
        "relative z-[1] mx-auto flex min-h-0 w-full max-w-[1560px] flex-1 flex-col overflow-y-auto px-4 pt-6 sm:px-6 sm:pt-8",
        hasMobileBottomNav
          ? "pb-[calc(env(safe-area-inset-bottom)+5.75rem)] sm:pb-8"
          : "pb-6 sm:pb-8",
      ].join(" ")}
    >
      {children}
    </div>
  );
}
