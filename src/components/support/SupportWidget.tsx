"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { ArrowLeft, Loader2, MessageCircleMore, Plus, Send, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "lidmeo_support_widget_open";
const MARK_READ_MIN_INTERVAL_MS = 1600;

type SupportConversation = {
  id: string;
  ticket_number: number | null;
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

function formatDateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function sortConversations(conversations: SupportConversation[]): SupportConversation[] {
  return [...conversations].sort((a, b) => {
    const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return bTime - aTime;
  });
}

function normalizeConversation(raw: Partial<SupportConversation> | null | undefined): SupportConversation | null {
  if (!raw?.id) return null;

  const ticketNumberRaw = raw.ticket_number;
  const parsedTicketNumber = Number(ticketNumberRaw);
  const ticketNumber = Number.isFinite(parsedTicketNumber) ? parsedTicketNumber : null;

  return {
    id: String(raw.id),
    ticket_number: ticketNumber,
    user_id: String(raw.user_id ?? ""),
    user_email: typeof raw.user_email === "string" ? raw.user_email : null,
    user_name: typeof raw.user_name === "string" ? raw.user_name : null,
    status: typeof raw.status === "string" ? raw.status : "open",
    last_message_at:
      typeof raw.last_message_at === "string" ? raw.last_message_at : new Date().toISOString(),
    unread_count: Number(raw.unread_count ?? 0),
    created_at: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : new Date().toISOString(),
  };
}

function upsertConversation(
  conversations: SupportConversation[],
  nextConversation: SupportConversation
): SupportConversation[] {
  const nextRows = conversations.some((conversation) => conversation.id === nextConversation.id)
    ? conversations.map((conversation) =>
        conversation.id === nextConversation.id ? { ...conversation, ...nextConversation } : conversation
      )
    : [nextConversation, ...conversations];

  return sortConversations(nextRows);
}

function statusLabel(status: string): string {
  if (status === "closed") return "Ferme";
  if (status === "reopened") return "Reouvert";
  return "Ouvert";
}

function statusChipClass(status: string): string {
  if (status === "closed") return "border-slate-300 bg-slate-100 text-slate-700";
  if (status === "reopened") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export default function SupportWidget() {
  const pathname = usePathname();
  const { isLoaded, isSignedIn, user } = useUser();

  const [hasHydrated, setHasHydrated] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [conversations, setConversations] = useState<SupportConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLeadsSidebarOpen, setIsLeadsSidebarOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastMarkReadAtRef = useRef<number>(0);
  const pendingMarkReadRef = useRef<number | null>(null);

  const shouldRenderOnPage = pathname ? !pathname.startsWith("/admin/support") : true;

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId]
  );

  const firstName = useMemo(() => {
    const clerkFirstName = user?.firstName?.trim();
    if (clerkFirstName) return clerkFirstName;
    const fallback = selectedConversation?.user_name?.trim() || conversations[0]?.user_name?.trim() || "la";
    return fallback.split(/\s+/)[0] || "la";
  }, [user?.firstName, selectedConversation?.user_name, conversations]);

  const unreadCount = useMemo(
    () => conversations.reduce((accumulator, conversation) => accumulator + Number(conversation.unread_count ?? 0), 0),
    [conversations]
  );

  const clearMarkReadTimer = () => {
    if (pendingMarkReadRef.current !== null) {
      window.clearTimeout(pendingMarkReadRef.current);
      pendingMarkReadRef.current = null;
    }
  };

  const runMarkRead = useCallback(async () => {
    if (!selectedConversationId || !isSignedIn) return;

    const now = Date.now();
    if (now - lastMarkReadAtRef.current < MARK_READ_MIN_INTERVAL_MS) return;
    lastMarkReadAtRef.current = now;

    await fetch("/api/support/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: selectedConversationId }),
    }).catch(() => null);

    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === selectedConversationId ? { ...conversation, unread_count: 0 } : conversation
      )
    );

    setMessages((prev) =>
      prev.map((message) =>
        message.sender_type === "support" && !message.read_at
          ? { ...message, read_at: new Date().toISOString() }
          : message
      )
    );
  }, [selectedConversationId, isSignedIn]);

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

  const loadConversations = useCallback(async () => {
    if (!isSignedIn) {
      setConversations([]);
      setSelectedConversationId(null);
      setMessages([]);
      return;
    }

    setLoadingConversations(true);
    setError(null);

    try {
      const res = await fetch("/api/support/conversation", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? "Impossible de charger les tickets support.");
      }

      const nextRows = Array.isArray(data?.conversations)
        ? (data.conversations as Partial<SupportConversation>[])
            .map((row) => normalizeConversation(row))
            .filter((row): row is SupportConversation => Boolean(row))
        : [];

      const sortedRows = sortConversations(nextRows);
      setConversations(sortedRows);

      setSelectedConversationId((prev) => {
        if (!prev) return null;
        const exists = sortedRows.some((conversation) => conversation.id === prev);
        return exists ? prev : null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement.");
    } finally {
      setLoadingConversations(false);
    }
  }, [isSignedIn]);

  const loadMessages = useCallback(async (targetConversationId: string) => {
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
  }, []);

  const handleCreateTicket = async () => {
    if (!isSignedIn || creatingTicket) return;

    setCreatingTicket(true);
    setError(null);

    try {
      const res = await fetch("/api/support/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error ?? "Creation du ticket impossible.");
      }

      const createdConversation = normalizeConversation(data?.conversation as Partial<SupportConversation>);
      if (!createdConversation) {
        throw new Error("Ticket support indisponible.");
      }

      setConversations((prev) => upsertConversation(prev, createdConversation));
      setSelectedConversationId(createdConversation.id);
      setMessages([]);
      await loadMessages(createdConversation.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de creation du ticket.");
    } finally {
      setCreatingTicket(false);
    }
  };

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
    if (!hasHydrated || typeof document === "undefined") return;

    const sync = () => {
      setIsLeadsSidebarOpen(document.body.dataset.leadsSidebarOpen === "1");
    };

    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-leads-sidebar-open"],
    });

    return () => observer.disconnect();
  }, [hasHydrated]);

  useEffect(() => {
    if (isLeadsSidebarOpen) {
      setIsOpen(false);
    }
  }, [isLeadsSidebarOpen]);

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
    void loadConversations();
  }, [isLoaded, loadConversations]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedConversationId);
  }, [selectedConversationId, loadMessages]);

  useEffect(() => {
    if (!isOpen || !selectedConversation || !isSignedIn) return;
    if (Number(selectedConversation.unread_count ?? 0) <= 0) return;
    scheduleMarkRead(160);
  }, [selectedConversation, isOpen, isSignedIn, scheduleMarkRead]);

  useEffect(() => {
    if (!isSignedIn || !user?.id) return;

    const channel = supabase
      .channel(`support-widget-conversations-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "support_conversations",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const deletedId = String((payload.old as Partial<SupportConversation> | undefined)?.id ?? "");
            if (!deletedId) return;

            setConversations((prev) => prev.filter((conversation) => conversation.id !== deletedId));
            setSelectedConversationId((prev) => (prev === deletedId ? null : prev));
            return;
          }

          const nextConversation = normalizeConversation(
            (payload.new as Partial<SupportConversation> | undefined) ?? null
          );
          if (!nextConversation) return;

          setConversations((prev) => upsertConversation(prev, nextConversation));
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isSignedIn, user?.id]);

  useEffect(() => {
    if (!selectedConversationId || !isSignedIn) return;

    const channel = supabase
      .channel(`support-widget-messages-${selectedConversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "support_messages",
          filter: `conversation_id=eq.${selectedConversationId}`,
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

            if (nextMessage.sender_type === "support" && isOpen) {
              scheduleMarkRead(120);
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
      .subscribe();

    return () => {
      clearMarkReadTimer();
      void supabase.removeChannel(channel);
    };
  }, [selectedConversationId, isOpen, isSignedIn, scheduleMarkRead]);

  useEffect(() => {
    if (!isOpen) return;

    const onEsc = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        if (selectedConversationId) {
          setSelectedConversationId(null);
          return;
        }
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [isOpen, selectedConversationId]);

  useEffect(() => {
    if (!isOpen || !selectedConversationId) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isOpen, selectedConversationId]);

  useEffect(() => {
    if (!isOpen || !selectedConversationId) return;
    const timer = window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [isOpen, selectedConversationId]);

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
  };

  const handleSend = async () => {
    if (!selectedConversationId || !isSignedIn || sending) return;
    const body = draft.trim();
    if (!body) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/support/widget/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: selectedConversationId, body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error ?? "Envoi impossible.");
      }

      const nextMessage = data?.message as SupportMessage | undefined;
      if (nextMessage?.id) {
        setMessages((prev) => dedupeById([...prev, nextMessage]));
      }

      const nextConversation = normalizeConversation(data?.conversation as Partial<SupportConversation>);
      if (nextConversation) {
        setConversations((prev) => upsertConversation(prev, nextConversation));
      }

      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur pendant l'envoi.");
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
  if (pathname?.startsWith("/dashboard/leads") && isLeadsSidebarOpen) return null;

  return (
    <>
      <div className="fixed bottom-5 right-5 z-[70] sm:bottom-6 sm:right-6">
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

      {isOpen ? (
        <div className="fixed bottom-[5.25rem] left-3 right-3 z-[71] w-auto translate-y-0 opacity-100 sm:bottom-24 sm:left-auto sm:right-6 sm:w-[min(420px,calc(100vw-1.5rem))]">
          <section
            role="dialog"
            aria-label="Messagerie support Lidmeo"
            className="flex h-[min(76vh,680px)] flex-col overflow-hidden rounded-3xl border border-[#d9e5fb] bg-[#F8FAFC] shadow-[0_30px_80px_-40px_rgba(15,23,42,0.5)]"
          >
          <header className="border-b border-[#dce7fb] bg-white/90 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold text-[#0F172A]">
                  Hi {firstName} 👋 Comment on peut t&apos;aider ?
                </p>
                <p className="mt-1 text-[12px] text-[#4B5563]">
                  Nous repondons generalement en moins de 15 min.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setSelectedConversationId(null);
                }}
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
                <p className="text-sm font-medium text-[#0F172A]">Connecte-toi pour contacter le support.</p>
                <p className="mt-2 text-xs text-[#4B5563]">
                  On te repondra ici avec l&apos;historique de tous tes tickets.
                </p>
                <Link
                  href="/sign-in"
                  className="mt-4 inline-flex items-center justify-center rounded-xl border border-[#1f5eff] bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#1e56d4] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]"
                >
                  Se connecter
                </Link>
              </div>
            </div>
          ) : selectedConversation ? (
            <>
              <div className="border-b border-[#dce7fb] bg-white/95 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedConversationId(null)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#dbe5f8] bg-white px-2.5 py-1 text-[11px] text-[#475569] transition hover:bg-[#f8fafc]"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Tickets
                  </button>

                  <div className="text-right">
                    <p className="text-[12px] font-semibold text-[#0F172A]">
                      Ticket #{selectedConversation.ticket_number ?? "-"}
                    </p>
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                        statusChipClass(selectedConversation.status)
                      )}
                    >
                      {statusLabel(selectedConversation.status)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3">
                {loadingMessages ? (
                  <div className="space-y-3 py-1">
                    <div className="h-16 w-[82%] animate-pulse rounded-2xl bg-[#e7edf8]" />
                    <div className="ml-auto h-14 w-[65%] animate-pulse rounded-2xl bg-[#dbe7fb]" />
                    <div className="h-12 w-[70%] animate-pulse rounded-2xl bg-[#e7edf8]" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-full min-h-[220px] items-center justify-center">
                    <div className="max-w-[280px] rounded-2xl border border-[#dbe5f8] bg-white px-4 py-5 text-center">
                      <p className="text-sm font-medium text-[#0F172A]">Aucun message pour ce ticket.</p>
                    </div>
                  </div>
                ) : (
                  <div>
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
                {selectedConversation.status === "closed" ? (
                  <p className="mb-2 rounded-lg border border-[#cdd6e5] bg-[#f8fafc] px-2.5 py-1.5 text-[11px] text-[#475569]">
                    Ce ticket est ferme. Ton prochain message le reouvrira automatiquement.
                  </p>
                ) : null}
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
          ) : (
            <>
              <div className="border-b border-[#dce7fb] bg-white/95 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] font-semibold text-[#0F172A]">Mes tickets</p>
                  <button
                    type="button"
                    onClick={() => void handleCreateTicket()}
                    disabled={creatingTicket}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-lg border border-[#1f5eff] bg-[#2563EB] px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-[#1e56d4]",
                      creatingTicket && "cursor-not-allowed opacity-70"
                    )}
                  >
                    {creatingTicket ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    Nouveau ticket
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3">
                {error ? (
                  <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700">
                    {error}
                  </p>
                ) : null}

                {loadingConversations ? (
                  <div className="space-y-2 py-1">
                    <div className="h-14 animate-pulse rounded-2xl bg-[#e7edf8]" />
                    <div className="h-14 animate-pulse rounded-2xl bg-[#e7edf8]" />
                    <div className="h-14 animate-pulse rounded-2xl bg-[#e7edf8]" />
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="flex h-full min-h-[220px] items-center justify-center">
                    <div className="max-w-[280px] rounded-2xl border border-[#dbe5f8] bg-white px-4 py-5 text-center">
                      <p className="text-sm font-medium text-[#0F172A]">On est la 🙂</p>
                      <p className="mt-2 text-xs leading-relaxed text-[#4B5563]">
                        Cree ton premier ticket pour nous decrire ton besoin.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {conversations.map((conversation) => (
                      <button
                        key={conversation.id}
                        type="button"
                        onClick={() => setSelectedConversationId(conversation.id)}
                        className="w-full rounded-2xl border border-[#dbe5f8] bg-white px-3 py-2 text-left transition hover:bg-[#f8fbff]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold text-[#0F172A]">
                              Ticket #{conversation.ticket_number ?? "-"}
                            </p>
                            <p className="mt-0.5 text-[10px] text-[#64748b]">
                              Mis a jour le {formatDateLabel(conversation.last_message_at)}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {Number(conversation.unread_count ?? 0) > 0 ? (
                              <span className="inline-flex min-w-[1.2rem] items-center justify-center rounded-full border border-[#bfdbfe] bg-[#dbeafe] px-1 text-[10px] font-semibold text-[#1d4ed8]">
                                {Number(conversation.unread_count ?? 0) > 99
                                  ? "99+"
                                  : Number(conversation.unread_count ?? 0)}
                              </span>
                            ) : null}
                            <span
                              className={cn(
                                "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                statusChipClass(conversation.status)
                              )}
                            >
                              {statusLabel(conversation.status)}
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
          </section>
        </div>
      ) : null}
    </>
  );
}
