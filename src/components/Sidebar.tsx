"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  ChevronLeft,
  CreditCard,
  Crosshair,
  Headphones,
  LayoutDashboard,
  LucideIcon,
  Menu,
  MessageSquare,
  PenLine,
  RefreshCw,
  Shield,
  Target,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  INBOX_GLOBAL_SYNC_EVENT,
  INBOX_SYNC_INTERVAL_MS,
} from "@/lib/inbox-events";
import { queryKeys } from "@/lib/query-keys";
import { supabase } from "@/lib/supabase";
import { hasAckedPostTrial, POST_TRIAL_ACK_EVENT } from "@/lib/trial-events";

const STORAGE_KEY = "lidmeo.sidebarOpen";
const WIDTH_OPEN = 240;
const WIDTH_CLOSED = 64;

type SidebarProps = {
  dashboardHref: string;
  showSupportAdminLink: boolean;
  showPlaybookLink: boolean;
};

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: "inbox" | "icp";
};

type NavSection = {
  label: string;
  items: NavItem[];
};

function formatUnread(total: number): string {
  return total > 99 ? "99+" : String(total);
}

function useInboxUnread(): number {
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState<string | null>(null);
  const [totalUnread, setTotalUnread] = useState(0);

  const loadUnreadCount = useCallback(async () => {
    try {
      const data = await queryClient.fetchQuery({
        queryKey: queryKeys.inboxUnreadCount(),
        queryFn: async () => {
          const res = await fetch("/api/inbox/unread-count");
          if (!res.ok) return { total: 0 };
          return res.json();
        },
        staleTime: 10 * 1000,
      });
      const n = Number(data?.total ?? 0);
      setTotalUnread(Number.isFinite(n) && n > 0 ? n : 0);
    } catch {
      setTotalUnread(0);
    }
  }, [queryClient]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadUnreadCount();
    }, 0);
    return () => window.clearTimeout(t);
  }, [loadUnreadCount]);

  useEffect(() => {
    void (async () => {
      try {
        const data = await queryClient.fetchQuery({
          queryKey: queryKeys.inboxClientId(),
          queryFn: async () => {
            const res = await fetch("/api/inbox/client");
            if (!res.ok) return null;
            return res.json();
          },
          staleTime: 30 * 60 * 1000,
        });
        if (!data?.clientId) return;
        setClientId(String(data.clientId));
      } catch {
        // no-op
      }
    })();
  }, [queryClient]);

  useEffect(() => {
    if (!clientId) return;
    const channel = supabase
      .channel(`inbox-unread-nav-${clientId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inbox_threads",
          filter: `client_id=eq.${clientId}`,
        },
        () => {
          void loadUnreadCount();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [clientId, loadUnreadCount]);

  useEffect(() => {
    if (!clientId) return;
    const handler = () => {
      void loadUnreadCount();
    };
    window.addEventListener(INBOX_GLOBAL_SYNC_EVENT, handler);
    return () => window.removeEventListener(INBOX_GLOBAL_SYNC_EVENT, handler);
  }, [clientId, loadUnreadCount]);

  useEffect(() => {
    if (!clientId) return;
    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      void loadUnreadCount();
    };
    refreshIfVisible();
    const id = window.setInterval(refreshIfVisible, INBOX_SYNC_INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [clientId, loadUnreadCount]);

  return totalUnread;
}

function useIcpTrialBadge(): boolean {
  const [show, setShow] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/leads/quota", { cache: "no-store" });
      if (!res.ok) {
        setShow(false);
        return;
      }
      const data = await res.json().catch(() => ({}));
      const essential = Boolean(data?.is_essential);
      const trialActive = Boolean(data?.is_trial_active);
      const trialEnds =
        typeof data?.trial_ends_at === "string" ? data.trial_ends_at : null;
      setShow(
        essential && !trialActive && !!trialEnds && !hasAckedPostTrial(trialEnds)
      );
    } catch {
      setShow(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handler = () => setShow(false);
    window.addEventListener(POST_TRIAL_ACK_EVENT, handler);
    return () => window.removeEventListener(POST_TRIAL_ACK_EVENT, handler);
  }, []);

  return show;
}

export default function Sidebar({
  dashboardHref,
  showSupportAdminLink,
  showPlaybookLink,
}: SidebarProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved !== null) setIsOpen(saved === "true");
    } catch {
      // no-op
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const width = isOpen ? WIDTH_OPEN : WIDTH_CLOSED;
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => {
      const pl = mq.matches ? `${width}px` : "0px";
      document.documentElement.style.setProperty("--app-shell-pl", pl);
      document.documentElement.style.setProperty(
        "--sidebar-width",
        `${width}px`
      );
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [isOpen, hydrated]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // no-op
      }
      return next;
    });
  }, []);

  const unread = useInboxUnread();
  const trialBadge = useIcpTrialBadge();

  const sections: NavSection[] = [
    {
      label: "Prospection",
      items: [
        { href: dashboardHref, label: "Dashboard", icon: LayoutDashboard },
        { href: "/dashboard/leads", label: "Prospection", icon: Target },
        { href: "/dashboard/followups", label: "Relances", icon: RefreshCw },
        {
          href: "/dashboard/inbox",
          label: "Messagerie",
          icon: MessageSquare,
          badge: "inbox",
        },
      ],
    },
    {
      label: "Configuration",
      items: [
        {
          href: "/dashboard/hub/icp-builder",
          label: "Mon ciblage",
          icon: Crosshair,
          badge: "icp",
        },
        {
          href: "/dashboard/hub/messages-setup",
          label: "Mes messages",
          icon: PenLine,
        },
      ],
    },
    {
      label: "Compte",
      items: [
        { href: "/dashboard/hub/billing", label: "Abonnement", icon: CreditCard },
      ],
    },
  ];

  if (showSupportAdminLink) {
    sections.push({
      label: "Admin",
      items: [
        { href: "/admin/clients", label: "Panel Admin", icon: Shield },
        { href: "/admin/support", label: "Support Admin", icon: Headphones },
      ],
    });
  }

  if (showPlaybookLink) {
    sections.push({
      label: "Commercial",
      items: [{ href: "/playbook", label: "Playbook", icon: BookOpen }],
    });
  }

  const isActiveHref = (href: string): boolean => {
    if (!pathname) return false;
    if (href === dashboardHref && pathname === dashboardHref) return true;
    if (pathname === href) return true;
    return pathname.startsWith(href + "/");
  };

  const renderBadge = (badge?: "inbox" | "icp") => {
    if (badge === "inbox" && unread > 0) {
      return (
        <span className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#2563EB] px-1.5 text-[10px] font-semibold leading-none text-white">
          {formatUnread(unread)}
        </span>
      );
    }
    if (badge === "icp" && trialBadge) {
      return (
        <span className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-none text-white">
          1
        </span>
      );
    }
    return null;
  };

  const renderCollapsedBadge = (badge?: "inbox" | "icp") => {
    if (badge === "inbox" && unread > 0) {
      return (
        <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#2563EB] ring-2 ring-white" />
      );
    }
    if (badge === "icp" && trialBadge) {
      return (
        <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
      );
    }
    return null;
  };

  const sidebarInner = (
    <>
      {/* Header */}
      <div
        className={`flex items-center border-b border-[#E5E7EB] px-3 ${
          isOpen ? "h-16 justify-between" : "h-16 flex-col gap-1 justify-center"
        }`}
      >
        <Link href="/" className="flex items-center gap-2 overflow-hidden">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-[#1f5eff] to-[#1254ec] text-xs font-bold text-white shadow-[0_6px_14px_-6px_rgba(31,94,255,0.8)]">
            LM
          </div>
          <AnimatePresence initial={false}>
            {isOpen ? (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col overflow-hidden whitespace-nowrap"
              >
                <span className="text-sm font-semibold leading-tight text-[#111827]">
                  Lidmeo Hub
                </span>
                <span className="text-[11px] leading-tight text-[#6B7280]">
                  Espace client
                </span>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </Link>
        {isOpen ? (
          <button
            type="button"
            onClick={toggle}
            aria-label="Réduire le menu"
            className="hidden rounded-lg p-1.5 text-[#6B7280] transition hover:bg-[#F3F4F6] hover:text-[#111827] md:inline-flex"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3">
        {sections.map((section, sIdx) => (
          <div key={section.label} className={sIdx === 0 ? "" : "mt-4"}>
            <AnimatePresence initial={false}>
              {isOpen ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="px-5 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]"
                >
                  {section.label}
                </motion.div>
              ) : (
                <div className="mx-3 mb-2 border-t border-[#E5E7EB]" />
              )}
            </AnimatePresence>
            <ul className="flex flex-col gap-0.5 px-2">
              {section.items.map((item) => {
                const active = isActiveHref(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href} className="relative group">
                    <Link
                      href={item.href}
                      className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ${
                        active
                          ? "bg-[#EBF5FF] text-[#2563EB] font-medium"
                          : "text-[#374151] hover:bg-[#F3F4F6]"
                      } ${isOpen ? "" : "justify-center"}`}
                    >
                      {active && isOpen ? (
                        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[#2563EB]" />
                      ) : null}
                      <span className="relative flex-shrink-0">
                        <Icon
                          className={`h-5 w-5 ${
                            active ? "text-[#2563EB]" : "text-[#6B7280]"
                          }`}
                        />
                        {!isOpen ? renderCollapsedBadge(item.badge) : null}
                      </span>
                      <AnimatePresence initial={false}>
                        {isOpen ? (
                          <motion.span
                            key="label"
                            initial={{ opacity: 0, width: 0 }}
                            animate={{ opacity: 1, width: "auto" }}
                            exit={{ opacity: 0, width: 0 }}
                            transition={{ duration: 0.15 }}
                            className="flex flex-1 items-center gap-2 overflow-hidden whitespace-nowrap"
                          >
                            <span className="flex-1">{item.label}</span>
                            {renderBadge(item.badge)}
                          </motion.span>
                        ) : null}
                      </AnimatePresence>
                    </Link>
                    {!isOpen ? (
                      <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-[#111827] px-2.5 py-1.5 text-xs text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
                        {item.label}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer: user + collapse toggle */}
      <div className="flex flex-col gap-2 border-t border-[#E5E7EB] p-3">
        <div
          className={`flex items-center gap-3 ${
            isOpen ? "" : "justify-center"
          }`}
        >
          <UserButton
            afterSignOutUrl="/"
            appearance={{
              elements: { avatarBox: "h-9 w-9 ring-2 ring-[#E5E7EB]" },
            }}
          />
          <AnimatePresence initial={false}>
            {isOpen ? (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="flex min-w-0 flex-1 flex-col overflow-hidden"
              >
                <span className="truncate text-xs font-semibold text-[#111827]">
                  Mon compte
                </span>
                <span className="text-[10px] text-[#6B7280]">Connecté</span>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
        {!isOpen ? (
          <button
            type="button"
            onClick={toggle}
            aria-label="Étendre le menu"
            className="hidden items-center justify-center rounded-lg p-2 text-[#6B7280] transition hover:bg-[#F3F4F6] hover:text-[#111827] md:inline-flex"
          >
            <ChevronLeft className="h-4 w-4 rotate-180" />
          </button>
        ) : null}
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger trigger */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Ouvrir le menu"
        className="fixed left-3 top-3 z-30 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white text-[#374151] shadow-sm md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Desktop sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: isOpen ? WIDTH_OPEN : WIDTH_CLOSED }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="fixed left-0 top-0 z-30 hidden h-dvh flex-col border-r border-[#E5E7EB] bg-white md:flex"
      >
        {sidebarInner}
      </motion.aside>

      {/* Mobile overlay + drawer */}
      <AnimatePresence>
        {mobileOpen ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 bg-black/50 md:hidden"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="fixed left-0 top-0 z-50 flex h-dvh w-[260px] flex-col border-r border-[#E5E7EB] bg-white md:hidden"
              style={{ ["--sidebar-width" as string]: "260px" }}
            >
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Fermer le menu"
                className="absolute right-2 top-2 z-10 inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#6B7280] transition hover:bg-[#F3F4F6]"
              >
                <X className="h-5 w-5" />
              </button>
              <MobileSidebarInner
                sections={sections}
                pathname={pathname}
                dashboardHref={dashboardHref}
                renderBadge={renderBadge}
                isActiveHref={isActiveHref}
              />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function MobileSidebarInner({
  sections,
  pathname: _pathname,
  dashboardHref: _dashboardHref,
  renderBadge,
  isActiveHref,
}: {
  sections: NavSection[];
  pathname: string | null;
  dashboardHref: string;
  renderBadge: (b?: "inbox" | "icp") => React.ReactNode;
  isActiveHref: (href: string) => boolean;
}) {
  return (
    <>
      <div className="flex h-16 items-center border-b border-[#E5E7EB] px-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-[#1f5eff] to-[#1254ec] text-xs font-bold text-white">
            LM
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-[#111827]">
              Lidmeo Hub
            </span>
            <span className="text-[11px] text-[#6B7280]">Espace client</span>
          </div>
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto py-3">
        {sections.map((section, sIdx) => (
          <div key={section.label} className={sIdx === 0 ? "" : "mt-4"}>
            <div className="px-5 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              {section.label}
            </div>
            <ul className="flex flex-col gap-0.5 px-2">
              {section.items.map((item) => {
                const active = isActiveHref(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                        active
                          ? "bg-[#EBF5FF] font-medium text-[#2563EB]"
                          : "text-[#374151] hover:bg-[#F3F4F6]"
                      }`}
                    >
                      <Icon
                        className={`h-5 w-5 ${
                          active ? "text-[#2563EB]" : "text-[#6B7280]"
                        }`}
                      />
                      <span className="flex-1">{item.label}</span>
                      {renderBadge(item.badge)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="flex items-center gap-3 border-t border-[#E5E7EB] p-3">
        <UserButton
          afterSignOutUrl="/"
          appearance={{
            elements: { avatarBox: "h-9 w-9 ring-2 ring-[#E5E7EB]" },
          }}
        />
        <span className="text-xs font-semibold text-[#111827]">Mon compte</span>
      </div>
    </>
  );
}
