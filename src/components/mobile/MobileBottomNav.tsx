"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox, LifeBuoy, MessageSquare, Settings2, UsersRound } from "lucide-react";

import { cn } from "@/lib/utils";

type MobileNavItem = {
  key: string;
  label: string;
  href?: string;
  match: (pathname: string) => boolean;
  icon: typeof UsersRound;
};

export default function MobileBottomNav() {
  const pathname = usePathname();
  const isDashboardRoute = pathname.startsWith("/dashboard");

  if (!isDashboardRoute) return null;

  const items: MobileNavItem[] = [
    {
      key: "prospects",
      label: "Prospects",
      href: "/dashboard/leads",
      match: (current) =>
        current.startsWith("/dashboard/leads") ||
        current.startsWith("/dashboard/prospection") ||
        current.startsWith("/dashboard/maps"),
      icon: UsersRound,
    },
    {
      key: "followups",
      label: "Relances",
      href: "/dashboard/followups",
      match: (current) => current.startsWith("/dashboard/followups"),
      icon: MessageSquare,
    },
    {
      key: "inbox",
      label: "Messagerie",
      href: "/dashboard/inbox",
      match: (current) => current.startsWith("/dashboard/inbox"),
      icon: Inbox,
    },
    {
      key: "support",
      label: "Support",
      href: "/dashboard/support",
      match: (current) => current.startsWith("/dashboard/support"),
      icon: LifeBuoy,
    },
    {
      key: "settings",
      label: "Abonnement",
      href: "/dashboard/hub/billing",
      match: (current) => current.startsWith("/dashboard/hub/billing"),
      icon: Settings2,
    },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[95] border-t border-[#d7e3f4] bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),10px)] pt-2 shadow-[0_-12px_24px_-22px_rgba(15,23,42,0.6)] backdrop-blur-sm md:hidden"
      aria-label="Navigation mobile"
    >
      <ul className="mx-auto grid max-w-[520px] grid-cols-5 gap-1">
        {items.map((item) => {
          const isActive = item.match(pathname);
          const Icon = item.icon;

          const content = (
            <>
              <Icon
                className={cn(
                  "h-4 w-4",
                  isActive ? "text-[#1f5eff]" : "text-[#6e86a5]"
                )}
              />
              <span
                className={cn(
                  "mt-1 text-[11px] leading-none",
                  isActive ? "text-[#1f4f96]" : "text-[#607894]"
                )}
              >
                {item.label}
              </span>
            </>
          );

          if (item.href) {
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className={cn(
                    "inline-flex h-[52px] w-full flex-col items-center justify-center rounded-xl border transition focus:outline-none focus:ring-2 focus:ring-[#dce8ff]",
                    isActive
                      ? "border-[#9cc0ff] bg-[#edf4ff]"
                      : "border-transparent bg-transparent hover:border-[#d7e3f4] hover:bg-[#f7fbff]"
                  )}
                >
                  {content}
                </Link>
              </li>
            );
          }

          return null;
        })}
      </ul>
    </nav>
  );
}
