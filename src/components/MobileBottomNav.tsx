"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { BellRing, CreditCard, Home, Inbox, Users } from "lucide-react";

type MobileNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  isActive: (pathname: string) => boolean;
};

function getMobileNavItems(dashboardHref: string): MobileNavItem[] {
  return [
    {
      href: dashboardHref,
      label: "Accueil",
      icon: Home,
      isActive: (pathname) =>
        pathname === "/" ||
        pathname === "/dashboard" ||
        pathname === "/dashboard/automation",
    },
    {
      href: "/dashboard/leads",
      label: "Prospects",
      icon: Users,
      isActive: (pathname) =>
        pathname.startsWith("/dashboard/leads") ||
        pathname.startsWith("/dashboard/prospection") ||
        pathname.startsWith("/dashboard/maps"),
    },
    {
      href: "/dashboard/inbox",
      label: "Messagerie",
      icon: Inbox,
      isActive: (pathname) => pathname.startsWith("/dashboard/inbox"),
    },
    {
      href: "/dashboard/followups",
      label: "Relances",
      icon: BellRing,
      isActive: (pathname) => pathname.startsWith("/dashboard/followups"),
    },
    {
      href: "/dashboard/hub/billing",
      label: "Abonnement",
      icon: CreditCard,
      isActive: (pathname) => pathname.startsWith("/dashboard/hub/billing"),
    },
  ];
}

export default function MobileBottomNav({ dashboardHref = "/dashboard" }: { dashboardHref?: string }) {
  const pathname = usePathname();
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded || !isSignedIn) return null;

  const showOnPath = pathname === "/" || pathname.startsWith("/dashboard");
  if (!showOnPath) return null;

  const navItems = getMobileNavItems(dashboardHref);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-[65] border-t border-[#c8d6ea] bg-[#f4f8ff]/98 backdrop-blur-xl sm:hidden">
      <div className="mx-auto grid max-w-[1560px] grid-cols-5 gap-1 px-2 pb-[calc(env(safe-area-inset-bottom)+0.45rem)] pt-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.isActive(pathname);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={[
                "flex min-h-[4.25rem] flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-[10px] font-medium transition",
                active
                  ? "border-[#9cc0ff] bg-white text-[#1f5eff]"
                  : "border-transparent text-[#5b6f8d] hover:border-[#d7e3f4] hover:bg-white/80",
              ].join(" ")}
            >
              <Icon className="h-4 w-4" />
              <span className="leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
