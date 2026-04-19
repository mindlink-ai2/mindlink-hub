"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Crosshair,
  Headphones,
  LayoutDashboard,
  LogOut,
  LucideIcon,
  Menu,
  MessageSquare,
  PenLine,
  RefreshCw,
  Settings,
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
  href?: string;
  onClick?: () => void;
  label: string;
  icon: LucideIcon;
  badge?: "inbox" | "icp";
  key?: string;
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

type InboxBadgeProps = { count: number; collapsed?: boolean };

function InboxBadge({ count, collapsed }: InboxBadgeProps) {
  if (count <= 0) return null;
  const text = formatUnread(count);
  return (
    <motion.span
      animate={{ scale: [1, 1.1, 1] }}
      transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 1.8, ease: "easeInOut" }}
      className={
        collapsed
          ? "absolute -right-0.5 -top-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#EF4444] px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white"
          : "ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#EF4444] px-1.5 text-[10px] font-semibold leading-none text-white"
      }
    >
      {text}
    </motion.span>
  );
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
  const [logoHover, setLogoHover] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const pendingTimerRef = useRef<number | null>(null);

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
    setPendingHref(null);
    if (pendingTimerRef.current !== null) {
      window.clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
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

  const openSidebar = useCallback(() => {
    setIsOpen(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // no-op
    }
  }, []);

  const handleLinkClick = useCallback((href: string) => {
    setPendingHref(href);
    if (pendingTimerRef.current !== null) {
      window.clearTimeout(pendingTimerRef.current);
    }
    pendingTimerRef.current = window.setTimeout(() => {
      setPendingHref(null);
    }, 2000);
  }, []);

  const unread = useInboxUnread();
  const trialBadge = useIcpTrialBadge();
  const { openUserProfile, signOut } = useClerk();
  const { user: clerkUser } = useUser();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!profileMenuRef.current) return;
      if (!profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [profileMenuOpen]);

  const displayName =
    clerkUser?.fullName ||
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") ||
    clerkUser?.username ||
    "Mon compte";
  const displayEmail =
    clerkUser?.primaryEmailAddress?.emailAddress ||
    clerkUser?.emailAddresses?.[0]?.emailAddress ||
    "";
  const initials = (() => {
    const base =
      [clerkUser?.firstName, clerkUser?.lastName]
        .filter(Boolean)
        .map((s) => (s as string).charAt(0))
        .join("") ||
      displayName.slice(0, 2) ||
      "?";
    return base.toUpperCase().slice(0, 2);
  })();
  const avatarUrl = clerkUser?.imageUrl;

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
        {
          key: "user-profile",
          onClick: () => openUserProfile(),
          label: "Mon compte",
          icon: Settings,
        },
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

  const isPathActive = (href: string): boolean => {
    if (!pathname) return false;
    if (pathname === href) return true;
    return pathname.startsWith(href + "/");
  };

  const isItemActive = (href: string): boolean => {
    if (pendingHref === href) return true;
    if (pendingHref && pendingHref !== href) return false;
    return isPathActive(href);
  };

  // Determine ID for layout animation scope (desktop vs mobile to avoid conflicts)
  const activeIndicatorId = "sidebar-active-indicator";

  const renderNavItem = (
    item: NavItem,
    collapsed: boolean,
    keyPrefix: string
  ) => {
    const Icon = item.icon;
    const active = item.href ? isItemActive(item.href) : false;

    const inboxCount = item.badge === "inbox" ? unread : 0;
    const showIcpBadge = item.badge === "icp" && trialBadge;
    const key = item.key ?? item.href ?? item.label;

    const commonClassName = `relative flex items-center gap-3 rounded-lg px-2.5 py-[8px] text-[13px] leading-none cursor-pointer ${
      collapsed ? "justify-center" : ""
    } ${
      active
        ? "text-[#2563EB] font-medium"
        : "text-[#374151] font-normal hover:bg-[#F1F5F9] hover:text-[#111827]"
    }`;
    const commonStyle = {
      transition: "color 100ms ease, background-color 100ms ease",
    };

    const innerContent = (
      <>
        {active ? (
          <motion.span
            layoutId={activeIndicatorId}
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
            className="absolute inset-0 rounded-lg bg-gradient-to-b from-[#EBF5FF] to-[#F2F8FF] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),inset_0_0_0_1px_rgba(37,99,235,0.08)]"
          />
        ) : null}
        {active && !collapsed ? (
          <motion.span
            layoutId={`${activeIndicatorId}-bar`}
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
            className="absolute left-[-8px] top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-[2px] bg-[#2563EB]"
          />
        ) : null}
        <span className="relative z-10 flex-shrink-0">
          <Icon
            className={`h-[18px] w-[18px] transition-colors duration-100 ${
              active
                ? "text-[#2563EB]"
                : "text-[#6B7280] group-hover:text-[#2563EB]"
            }`}
          />
          {collapsed ? (
            <>
              {item.badge === "inbox" ? (
                <InboxBadge count={inboxCount} collapsed />
              ) : null}
              {showIcpBadge ? (
                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#EF4444] ring-2 ring-white" />
              ) : null}
            </>
          ) : null}
        </span>
        {!collapsed ? (
          <span
            className={`relative z-10 flex flex-1 items-center gap-2 overflow-hidden whitespace-nowrap text-left transition-transform duration-150 ${
              active ? "" : "group-hover:translate-x-[2px]"
            }`}
          >
            <span className="flex-1">{item.label}</span>
            {item.badge === "inbox" ? (
              <InboxBadge count={inboxCount} />
            ) : null}
            {showIcpBadge ? (
              <span className="ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#EF4444] px-1.5 text-[10px] font-bold leading-none text-white">
                1
              </span>
            ) : null}
          </span>
        ) : null}
      </>
    );

    return (
      <li key={`${keyPrefix}:${key}`} className="relative group">
        <motion.div whileTap={{ scale: 0.98 }} transition={{ duration: 0.1 }}>
          {item.href ? (
            <Link
              href={item.href}
              prefetch
              onClick={() => handleLinkClick(item.href!)}
              className={commonClassName}
              style={commonStyle}
            >
              {innerContent}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => item.onClick?.()}
              className={`${commonClassName} w-full text-left`}
              style={commonStyle}
            >
              {innerContent}
            </button>
          )}
        </motion.div>
        {collapsed ? (
          <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 opacity-0 transition-opacity duration-[80ms] group-hover:opacity-100">
            <div className="relative rounded-md bg-[#1F2937] px-3 py-1.5 text-xs font-medium text-white shadow-lg whitespace-nowrap">
              {item.label}
              <span className="absolute left-0 top-1/2 -ml-1 h-0 w-0 -translate-y-1/2 border-y-4 border-r-4 border-y-transparent border-r-[#1F2937]" />
            </div>
          </div>
        ) : null}
      </li>
    );
  };

  const desktopInner = (
    <>
      {/* Header */}
      <div
        className={`group/header flex h-16 items-center border-b border-[#E5E7EB] px-3 ${
          isOpen ? "justify-between" : "justify-center"
        }`}
      >
        {isOpen ? (
          <Link href="/" prefetch className="flex items-center gap-2 overflow-hidden">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-[#1f5eff] to-[#1254ec] text-xs font-bold text-white shadow-[0_6px_14px_-6px_rgba(31,94,255,0.8)]">
              LM
            </div>
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
              <span className="text-[11px] leading-tight text-[#9CA3AF]">
                Espace client
              </span>
            </motion.div>
          </Link>
        ) : (
          <button
            type="button"
            onClick={openSidebar}
            onMouseEnter={() => setLogoHover(true)}
            onMouseLeave={() => setLogoHover(false)}
            aria-label="Ouvrir le menu"
            className="group relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-[#1f5eff] to-[#1254ec] text-xs font-bold text-white shadow-[0_6px_14px_-6px_rgba(31,94,255,0.8)] cursor-pointer"
          >
            <span className={`transition-opacity duration-[100ms] ${logoHover ? "opacity-0" : "opacity-100"}`}>
              LM
            </span>
            <AnimatePresence>
              {logoHover ? (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1 }}
                  className="absolute inset-0 flex items-center justify-center rounded-xl bg-gradient-to-tr from-[#1f5eff] to-[#1254ec]"
                >
                  <ChevronRight className="h-4 w-4 text-white" />
                </motion.span>
              ) : null}
            </AnimatePresence>
          </button>
        )}
        {isOpen ? (
          <button
            type="button"
            onClick={toggle}
            aria-label="Réduire le menu"
            className="hidden rounded-lg p-1.5 text-[#6B7280] transition-colors duration-150 hover:bg-[#F3F4F6] hover:text-[#111827] md:inline-flex cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3">
        {sections.map((section, sIdx) => (
          <div
            key={section.label}
            className={sIdx === 0 ? "" : "mt-5"}
          >
            {isOpen ? (
              <div className="px-5 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[1px] text-[#9CA3AF]">
                {section.label}
              </div>
            ) : sIdx === 0 ? null : (
              <div className="mx-4 mb-2 border-t border-[#E5E7EB]" />
            )}
            <ul className="flex flex-col gap-0.5 px-2">
              {section.items.map((item) =>
                renderNavItem(item, !isOpen, "d")
              )}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="flex flex-col gap-2 border-t border-[#E5E7EB] p-3">
        <div className="relative" ref={profileMenuRef}>
          <button
            type="button"
            onClick={() => setProfileMenuOpen((v) => !v)}
            className={`flex w-full items-center gap-3 rounded-lg p-2 text-left transition hover:bg-[#F1F5F9] cursor-pointer ${
              isOpen ? "" : "justify-center"
            }`}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="h-9 w-9 flex-shrink-0 rounded-full object-cover ring-2 ring-[#E5E7EB]"
              />
            ) : (
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#1f5eff] to-[#1254ec] text-[11px] font-semibold text-white ring-2 ring-[#E5E7EB]">
                {initials}
              </div>
            )}
            {isOpen ? (
              <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <span className="truncate text-[13px] font-medium text-[#111827]">
                  {displayName}
                </span>
                {displayEmail ? (
                  <span className="truncate text-[11px] text-[#9CA3AF]">
                    {displayEmail}
                  </span>
                ) : null}
              </div>
            ) : null}
          </button>
          <AnimatePresence>
            {profileMenuOpen ? (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.12 }}
                className={`absolute bottom-full z-50 mb-2 ${
                  isOpen ? "left-0 right-0" : "left-full ml-2 w-52"
                } overflow-hidden rounded-lg border border-[#E5E7EB] bg-white shadow-lg`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    openUserProfile();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#374151] hover:bg-[#F1F5F9] cursor-pointer"
                >
                  <Settings className="h-4 w-4 text-[#6B7280]" />
                  <span>Mon compte</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    void signOut({ redirectUrl: "/" });
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#DC2626] hover:bg-[#FEF2F2] cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Déconnexion</span>
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
        {!isOpen ? (
          <button
            type="button"
            onClick={toggle}
            aria-label="Étendre le menu"
            className="hidden items-center justify-center rounded-lg p-2 text-[#6B7280] transition hover:bg-[#F3F4F6] hover:text-[#111827] md:inline-flex cursor-pointer"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Ouvrir le menu"
        className="fixed left-3 top-3 z-30 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white text-[#374151] shadow-sm md:hidden cursor-pointer"
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
        {desktopInner}
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
            >
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Fermer le menu"
                className="absolute right-2 top-2 z-10 inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#6B7280] transition hover:bg-[#F3F4F6] cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="flex h-16 items-center border-b border-[#E5E7EB] px-4">
                <Link href="/" prefetch className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-[#1f5eff] to-[#1254ec] text-xs font-bold text-white">
                    LM
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-[#111827]">
                      Lidmeo Hub
                    </span>
                    <span className="text-[11px] text-[#6B7280]">
                      Espace client
                    </span>
                  </div>
                </Link>
              </div>
              <nav className="flex-1 overflow-y-auto py-3">
                {sections.map((section, sIdx) => (
                  <div key={section.label} className={sIdx === 0 ? "" : "mt-5"}>
                    <div className="px-5 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[1px] text-[#9CA3AF]">
                      {section.label}
                    </div>
                    <ul className="flex flex-col gap-0.5 px-2">
                      {section.items.map((item) =>
                        renderNavItem(item, false, "m")
                      )}
                    </ul>
                  </div>
                ))}
              </nav>
              <div className="flex flex-col gap-1 border-t border-[#E5E7EB] p-3">
                <div className="flex items-center gap-3 rounded-lg p-2">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt=""
                      className="h-9 w-9 flex-shrink-0 rounded-full object-cover ring-2 ring-[#E5E7EB]"
                    />
                  ) : (
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#1f5eff] to-[#1254ec] text-[11px] font-semibold text-white ring-2 ring-[#E5E7EB]">
                      {initials}
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-xs font-semibold text-[#111827]">
                      {displayName}
                    </span>
                    {displayEmail ? (
                      <span className="truncate text-[10px] text-[#6B7280]">
                        {displayEmail}
                      </span>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    openUserProfile();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[#374151] hover:bg-[#F1F5F9] cursor-pointer"
                >
                  <Settings className="h-4 w-4 text-[#6B7280]" />
                  <span>Mon compte</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    void signOut({ redirectUrl: "/" });
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[#DC2626] hover:bg-[#FEF2F2] cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Déconnexion</span>
                </button>
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
