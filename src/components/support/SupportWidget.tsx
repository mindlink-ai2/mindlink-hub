"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { Loader2, MessageCircleMore, Send, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "lidmeo_support_widget_open";
const MARK_READ_MIN_INTERVAL_MS = 1600;

type SupportConversation = {
  id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  status: string;
  last_message_at: string;
  unread_count: number;
  created_at: string;
  updated_at: string;
};

type SupportMessage = {
  id: string;
  conversation_id: string;
  sender_type: "user" | "support";
  body: string;
  created_at: string;
  read_at: string | null;
};

function formatTimeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function sortByCreatedAtAsc(messages: SupportMessage[]): SupportMessage[] {
  return [...messages].sort((a, b) => {
    const aTime = new Date(a.created_at).getTime();
    const bTime = new Date(b.created_at).getTime();
    return aTime - bTime;
  });
}

function dedupeById(messages: SupportMessage[]): SupportMessage[] {
  const map = new Map<string, SupportMessage>();
  messages.forEach((message) => {
    map.set(message.id, message);
  });
  return sortByCreatedAtAsc(Array.from(map.values()));
}

export default function SupportWidget() {
  const pathname = usePathname();
  const { isLoaded, isSignedIn, user } = useUser();

  const [hasHydrated, setHasHydrated] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [conversation, setConversation] = useState<SupportConversation | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastMarkReadAtRef = useRef<number>(0);
  const pendingMarkReadRef = useRef<number | null>(null);

  const shouldRenderOnPage = pathname?.startsWith("/dashboard");
  const conversationId = conversation?.id ?? null;

  const firstName = useMemo(() => {
    const clerkFirstName = user?.firstName?.trim();
    if (clerkFirstName) return clerkFirstName;
    const fallback = conversation?.user_name?.trim() || "là";
    return fallback.split(/\s+/)[0] || "là";
  }, [user?.firstName, conversation?.user_name]);

  const clearMarkReadTimer = () => {
    if (pendingMarkReadRef.current !== null) {
      window.clearTimeout(pendingMarkReadRef.current);
      pendingMarkReadRef.current = null;
    }
  };

  const runMarkRead = useCallback(async () => {
    if (!conversationId || !isSignedIn) return;

    const now = Date.now();
    if (now - lastMarkReadAtRef.current < MARK_READ_MIN_INTERVAL_MS) return;
    lastMarkReadAtRef.current = now;

    await fetch("/api/support/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId }),
    }).catch(() => null);

    setUnreadCount(0);
    setMessages((prev) =>
      prev.map((message) =>
        message.sender_type === "support" && !message.read_at
          ? { ...message, read_at: new Date().toISOString() }
          : message
      )
    );
  }, [conversationId, isSignedIn]);

  const scheduleMarkRead = useCallback(
    (delayMs = 280) => {
      clearMarkReadTimer();
      pendingMarkReadRef.current = window.setTimeout(() => {
        pendingMarkReadRef.current = null;
        void runMarkRead();
      }, delayMs);
    },
    [runMarkRead]
  );

  const loadConversation = useCallback(async () => {
    if (!isSignedIn) {
      setConversation(null);
      setMessages([]);
      setUnreadCount(0);
      return;
    }

    setLoadingConversation(true);
    setError(null);

    try {
      const res = await fetch("/api/support/conversation", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? "Impossible de charger la conversation support.");
      }

      const nextConversation = data?.conversation as SupportConversation | undefined;
      if (!nextConversation?.id) {
        throw new Error("Conversation support indisponible.");
      }

      setConversation(nextConversation);
      setUnreadCount(Number(nextConversation.unread_count ?? 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement.");
    } finally {
      setLoadingConversation(false);
    }
  }, [isSignedIn]);

  const loadMessages = useCallback(
    async (targetConversationId: string) => {
      setLoadingMessages(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/support/messages?conversationId=${encodeURIComponent(targetConversationId)}`,
          { cache: "no-store" }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error ?? "Impossible de charger les messages.");
        }

        const nextMessages = Array.isArray(data?.messages)
          ? (data.messages as SupportMessage[])
          : [];
        setMessages(sortByCreatedAtAsc(nextMessages));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur de chargement des messages.");
        setMessages([]);
      } finally {
        setLoadingMessages(false);
      }
    },
    []
  );

  useEffect(() => {
    setHasHydrated(true);
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "1") setIsOpen(true);
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, isOpen ? "1" : "0");
    } catch {
      // no-op
    }
  }, [isOpen, hasHydrated]);

  useEffect(() => {
    if (!isLoaded) return;
    void loadConversation();
  }, [isLoaded, loadConversation]);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    void loadMessages(conversationId);
  }, [conversationId, loadMessages]);

  useEffect(() => {
    if (!isOpen || !conversationId || !isSignedIn) return;
    scheduleMarkRead(160);
  }, [conversationId, isOpen, isSignedIn, scheduleMarkRead]);

  useEffect(() => {
    if (!conversationId || !isSignedIn) return;

    // Realtime requires support tables to be in publication supabase_realtime.
    const channel = supabase
      .channel(`support-widget-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "support_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const next = payload.new as Partial<SupportMessage>;
            if (!next?.id || !next?.conversation_id || !next?.sender_type || !next?.body) return;

            const nextMessage = {
              id: String(next.id),
              conversation_id: String(next.conversation_id),
              sender_type:
                next.sender_type === "support" || next.sender_type === "user"
                  ? next.sender_type
                  : "support",
              body: String(next.body),
              created_at: String(next.created_at ?? new Date().toISOString()),
              read_at: typeof next.read_at === "string" ? next.read_at : null,
            } satisfies SupportMessage;

            setMessages((prev) => dedupeById([...prev, nextMessage]));
            setConversation((prev) =>
              prev
                ? {
                    ...prev,
                    last_message_at: nextMessage.created_at,
                  }
                : prev
            );

            if (nextMessage.sender_type === "support") {
              if (isOpen) {
                scheduleMarkRead(120);
              } else {
                setUnreadCount((prev) => prev + 1);
              }
            }
          }

          if (payload.eventType === "UPDATE") {
            const next = payload.new as Partial<SupportMessage>;
            if (!next?.id) return;

            setMessages((prev) =>
              sortByCreatedAtAsc(
                prev.map((message) =>
                  message.id === String(next.id)
                    ? {
                        ...message,
                        body: typeof next.body === "string" ? next.body : message.body,
                        read_at: typeof next.read_at === "string" ? next.read_at : message.read_at,
                      }
                    : message
                )
              )
            );
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "support_conversations",
          filter: `id=eq.${conversationId}`,
        },
        (payload) => {
          const next = payload.new as Partial<SupportConversation>;
          if (!next?.id) return;

          setConversation((prev) =>
            prev
              ? {
                  ...prev,
                  unread_count: Number(next.unread_count ?? prev.unread_count ?? 0),
                  last_message_at: String(next.last_message_at ?? prev.last_message_at),
                }
              : prev
          );

          if (!isOpen) {
            setUnreadCount((prev) => Number(next.unread_count ?? prev));
          }
        }
      )
      .subscribe();

    return () => {
      clearMarkReadTimer();
      void supabase.removeChannel(channel);
    };
  }, [conversationId, isOpen, isSignedIn, scheduleMarkRead]);

  useEffect(() => {
    if (!isOpen) return;

    const onEsc = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
  };

  const handleSend = async () => {
    if (!conversationId || !isSignedIn || sending) return;
    const body = draft.trim();
    if (!body) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/support/widget/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error ?? "Envoi impossible.");
      }

      const nextMessage = data?.message as SupportMessage | undefined;
      if (nextMessage?.id) {
        setMessages((prev) => dedupeById([...prev, nextMessage]));
        setConversation((prev) =>
          prev
            ? {
                ...prev,
                last_message_at: nextMessage.created_at,
              }
            : prev
        );
      }

      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur pendant l’envoi.");
    } finally {
      setSending(false);
    }
  };

  const onComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  if (!shouldRenderOnPage || !hasHydrated) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[70]">
      <div className="pointer-events-auto fixed bottom-5 right-5 sm:bottom-6 sm:right-6">
        <button
          type="button"
          onClick={handleToggle}
          aria-label={isOpen ? "Fermer la messagerie support" : "Ouvrir la messagerie support"}
          className={cn(
            "group relative inline-flex h-14 w-14 items-center justify-center rounded-full border border-[#1f4fcf] bg-[#2563EB] text-white",
            "shadow-[0_20px_38px_-20px_rgba(37,99,235,0.9)] transition-all duration-200",
            "hover:-translate-y-[1px] hover:bg-[#1e56d4] focus:outline-none focus:ring-4 focus:ring-[#bfdbfe]"
          )}
        >
          {isOpen ? <X className="h-5 w-5" /> : <MessageCircleMore className="h-5 w-5" />}
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full border border-white bg-[#ef4444] px-1 text-[10px] font-semibold leading-5 text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </button>
      </div>

      <div
        className={cn(
          "fixed bottom-[5.25rem] left-3 right-3 z-[71] w-auto transition-all duration-200 sm:bottom-24 sm:left-auto sm:right-6 sm:w-[min(420px,calc(100vw-1.5rem))]",
          isOpen ? "pointer-events-auto" : "pointer-events-none",
          isOpen ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        )}
      >
        <section
          role="dialog"
          aria-label="Messagerie support Lidmeo"
          className="pointer-events-auto flex h-[min(76vh,680px)] flex-col overflow-hidden rounded-3xl border border-[#d9e5fb] bg-[#F8FAFC] shadow-[0_30px_80px_-40px_rgba(15,23,42,0.5)]"
        >
          <header className="border-b border-[#dce7fb] bg-white/90 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold text-[#0F172A]">
                  Hi {firstName} 👋 Comment on peut t’aider ?
                </p>
                <p className="mt-1 text-[12px] text-[#4B5563]">
                  Nous repondons generalement en moins de 15 min.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#dbe5f8] text-[#64748b] transition hover:bg-[#f1f5f9] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          {!isSignedIn ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
              <div className="rounded-2xl border border-[#dbe5f8] bg-white p-5">
                <p className="text-sm font-medium text-[#0F172A]">
                  Connecte-toi pour contacter le support.
                </p>
                <p className="mt-2 text-xs text-[#4B5563]">
                  On te repondra directement ici avec l’historique de tes messages.
                </p>
                <Link
                  href="/sign-in"
                  className="mt-4 inline-flex items-center justify-center rounded-xl border border-[#1f5eff] bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#1e56d4] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]"
                >
                  Se connecter
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-4 py-3">
                {loadingConversation || loadingMessages ? (
                  <div className="space-y-3 py-1">
                    <div className="h-4 w-24 animate-pulse rounded bg-[#e4eaf5]" />
                    <div className="h-16 w-[82%] animate-pulse rounded-2xl bg-[#e7edf8]" />
                    <div className="ml-auto h-14 w-[65%] animate-pulse rounded-2xl bg-[#dbe7fb]" />
                    <div className="h-12 w-[70%] animate-pulse rounded-2xl bg-[#e7edf8]" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-full min-h-[220px] items-center justify-center">
                    <div className="max-w-[280px] rounded-2xl border border-[#dbe5f8] bg-white px-4 py-5 text-center">
                      <p className="text-sm font-medium text-[#0F172A]">
                        On est la 🙂
                      </p>
                      <p className="mt-2 text-xs leading-relaxed text-[#4B5563]">
                        Decris ton besoin et on te repond vite.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[#64748b]">
                      Messages recents
                    </p>
                    <div className="space-y-2">
                      {messages.map((message) => {
                        const isUser = message.sender_type === "user";
                        return (
                          <div
                            key={message.id}
                            className={cn(
                              "max-w-[88%] rounded-2xl border px-3 py-2",
                              isUser
                                ? "ml-auto border-[#9bc1ff] bg-[#EAF2FF] text-[#0f2f61]"
                                : "mr-auto border-[#dce5f5] bg-white text-[#0F172A]"
                            )}
                          >
                            <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{message.body}</p>
                            <p className="mt-1 text-right text-[10px] text-[#64748b]">
                              {formatTimeLabel(message.created_at)}
                            </p>
                          </div>
                        );
                      })}
                      <div ref={bottomRef} />
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-[#dce7fb] bg-white/95 p-3">
                {error ? (
                  <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700">
                    {error}
                  </p>
                ) : null}
                <div className="flex items-end gap-2">
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={onComposerKeyDown}
                    rows={2}
                    placeholder="Ecris ton message..."
                    className="max-h-28 min-h-[44px] flex-1 resize-y rounded-xl border border-[#d3def4] bg-[#F8FAFC] px-3 py-2 text-sm text-[#0F172A] placeholder:text-[#64748b] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={sending || !draft.trim()}
                    className={cn(
                      "inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#1f5eff] bg-[#2563EB] text-white transition",
                      "hover:bg-[#1e56d4] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]",
                      (sending || !draft.trim()) && "cursor-not-allowed opacity-60"
                    )}
                    aria-label="Envoyer"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
