"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bell,
  CheckCheck,
  Loader2,
  Search,
  Send,
  Sparkles,
  UserCircle2,
} from "lucide-react";
import { HubButton } from "@/components/ui/hub-button";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type ConversationStatus = "open" | "closed" | "reopened" | "all";

type AdminSupportConversation = {
  id: string;
  ticket_number: number | null;
  user_name: string | null;
  user_email: string | null;
  status: "open" | "closed" | "reopened";
  last_message_at: string | null;
  unread_count: number;
  unread_for_support: number;
  last_message_preview: string;
};

type AdminSupportMessage = {
  id: string;
  conversation_id: string;
  sender_type: "user" | "support";
  body: string;
  created_at: string;
  read_at: string | null;
  read_by_support_at: string | null;
};

type LiveNotice = {
  tone: "info" | "ticket";
  text: string;
};

const QUICK_REPLIES = ["Bien reçu", "On regarde", "Peux-tu préciser ?"] as const;

function sortConversations(conversations: AdminSupportConversation[]): AdminSupportConversation[] {
  return [...conversations].sort((a, b) => {
    const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return bTime - aTime;
  });
}

function formatRelative(date: string | null): string {
  if (!date) return "—";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatConversationName(conversation: AdminSupportConversation): string {
  const clean = (conversation.user_name ?? "").trim();
  if (clean) return clean;
  const emailPrefix = (conversation.user_email ?? "").split("@")[0]?.trim();
  return emailPrefix || "Utilisateur";
}

function dedupeMessages(messages: AdminSupportMessage[]): AdminSupportMessage[] {
  const map = new Map<string, AdminSupportMessage>();
  messages.forEach((message) => {
    map.set(message.id, message);
  });
  return [...map.values()].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

export default function AdminSupportPage() {
  const [statusFilter, setStatusFilter] = useState<ConversationStatus>("open");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const [conversations, setConversations] = useState<AdminSupportConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AdminSupportMessage[]>([]);

  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveNotice, setLiveNotice] = useState<LiveNotice | null>(null);

  const [draft, setDraft] = useState("");
  const [isMobileThreadOpen, setIsMobileThreadOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const conversationsRef = useRef<AdminSupportConversation[]>([]);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId]
  );

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const clearLiveNoticeTimer = useCallback(() => {
    if (noticeTimerRef.current === null) return;
    window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = null;
  }, []);

  const pushLiveNotice = useCallback(
    (notice: LiveNotice) => {
      setLiveNotice(notice);
      clearLiveNoticeTimer();
      noticeTimerRef.current = window.setTimeout(() => {
        setLiveNotice(null);
        noticeTimerRef.current = null;
      }, 4500);

      if (typeof window === "undefined" || !("Notification" in window)) return;
      if (document.visibilityState === "visible") return;
      if (Notification.permission === "granted") {
        try {
          new Notification("Lidmeo Support", { body: notice.text });
        } catch {
          // no-op
        }
      }
    },
    [clearLiveNoticeTimer]
  );

  const loadConversations = useCallback(
    async (options?: { keepSelection?: boolean; silent?: boolean }) => {
      if (!options?.silent) {
        setLoadingConversations(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams({
          status: statusFilter,
          search: searchQuery,
          unread: unreadOnly ? "1" : "0",
        });

        const res = await fetch(`/api/admin/support/conversations?${params.toString()}`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error ?? "Impossible de charger les conversations.");
        }

        const nextRows = Array.isArray(data?.conversations)
          ? (data.conversations as AdminSupportConversation[])
          : [];
        const sorted = sortConversations(nextRows);
        setConversations(sorted);

        if (sorted.length === 0) {
          setSelectedConversationId(null);
          setMessages([]);
          setIsMobileThreadOpen(false);
          return;
        }

        setSelectedConversationId((previous) => {
          if (options?.keepSelection && previous) {
            const stillExists = sorted.some((row) => row.id === previous);
            if (stillExists) return previous;
          }
          return sorted[0].id;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur de chargement.");
      } finally {
        if (!options?.silent) {
          setLoadingConversations(false);
        }
      }
    },
    [searchQuery, statusFilter, unreadOnly]
  );

  const loadMessages = useCallback(async (conversationId: string, silent = false) => {
    if (!conversationId) return;
    if (!silent) {
      setLoadingMessages(true);
    }
    setError(null);

    try {
      const params = new URLSearchParams({
        conversationId,
        limit: "50",
      });
      const res = await fetch(`/api/admin/support/messages?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? "Impossible de charger les messages.");
      }

      const nextMessages = Array.isArray(data?.messages)
        ? (data.messages as AdminSupportMessage[])
        : [];
      setMessages(dedupeMessages(nextMessages));
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, unread_for_support: 0 }
            : conversation
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement des messages.");
      setMessages([]);
    } finally {
      if (!silent) {
        setLoadingMessages(false);
      }
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 260);
    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedConversationId) return;
    void loadMessages(selectedConversationId);
  }, [selectedConversationId, loadMessages]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      void Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("admin-support-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "support_messages",
        },
        (payload) => {
          const newRow = payload.new as Partial<AdminSupportMessage> | undefined;
          const oldRow = payload.old as Partial<AdminSupportMessage> | undefined;
          const targetConversationId = String(
            newRow?.conversation_id ?? oldRow?.conversation_id ?? ""
          ).trim();
          if (!targetConversationId) return;

          if (payload.eventType === "INSERT" && newRow?.sender_type === "user") {
            const messageId = String(newRow.id ?? "").trim();
            if (messageId && seenMessageIdsRef.current.has(messageId)) {
              return;
            }
            if (messageId) {
              seenMessageIdsRef.current.add(messageId);
            }

            const currentConversation = conversationsRef.current.find(
              (conversation) => conversation.id === targetConversationId
            );
            const ticketLabel = currentConversation?.ticket_number
              ? `#${currentConversation.ticket_number}`
              : "";
            pushLiveNotice({
              tone: "info",
              text: ticketLabel
                ? `Nouveau message client sur le ticket ${ticketLabel}.`
                : "Nouveau message client reçu.",
            });
          }

          void loadConversations({ keepSelection: true, silent: true });

          if (selectedConversationId === targetConversationId) {
            void loadMessages(targetConversationId, true);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_conversations",
        },
        (payload) => {
          const row = payload.new as Partial<AdminSupportConversation> | undefined;
          const ticketLabel = row?.ticket_number ? `#${row.ticket_number}` : "";
          pushLiveNotice({
            tone: "ticket",
            text: ticketLabel
              ? `Nouveau ticket ${ticketLabel} créé.`
              : "Nouveau ticket créé.",
          });
          void loadConversations({ keepSelection: true, silent: true });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadConversations, loadMessages, pushLiveNotice, selectedConversationId]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadConversations({ keepSelection: true, silent: true });
      if (selectedConversationId) {
        void loadMessages(selectedConversationId, true);
      }
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, [loadConversations, loadMessages, selectedConversationId]);

  useEffect(
    () => () => {
      clearLiveNoticeTimer();
    },
    [clearLiveNoticeTimer]
  );

  useEffect(() => {
    if (!isMobileThreadOpen) return;
    const onEsc = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileThreadOpen(false);
      }
    };

    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [isMobileThreadOpen]);

  useEffect(() => {
    if (!selectedConversationId) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, selectedConversationId]);

  const handleConversationOpen = (conversationId: string) => {
    setSelectedConversationId(conversationId);
    setIsMobileThreadOpen(true);
  };

  const handleSend = async (bodyOverride?: string) => {
    if (!selectedConversationId || sending) return;
    const body = (bodyOverride ?? draft).trim();
    if (!body) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/support/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: selectedConversationId, body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error ?? "Impossible d’envoyer la réponse.");
      }

      const newMessage = data?.message as AdminSupportMessage | undefined;
      if (newMessage?.id) {
        setMessages((prev) => dedupeMessages([...prev, newMessage]));
      }

      setConversations((prev) =>
        sortConversations(
          prev.map((conversation) =>
            conversation.id === selectedConversationId
              ? {
                  ...conversation,
                  last_message_at: newMessage?.created_at ?? new Date().toISOString(),
                  last_message_preview: body,
                  status: "open",
                }
              : conversation
          )
        )
      );

      setDraft("");
      textareaRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur pendant l’envoi.");
    } finally {
      setSending(false);
    }
  };

  const handleStatusToggle = async () => {
    if (!selectedConversation || updatingStatus) return;
    const nextStatus = selectedConversation.status === "closed" ? "open" : "closed";
    setUpdatingStatus(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/support/set-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          status: nextStatus,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error ?? "Impossible de mettre à jour le statut.");
      }

      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === selectedConversation.id
            ? { ...conversation, status: nextStatus }
            : conversation
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de mise à jour du statut.");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const onDraftKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="relative min-h-screen w-full px-4 pb-24 pt-8 sm:px-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[440px] bg-[radial-gradient(circle_at_22%_-12%,rgba(31,94,255,0.12),transparent_58%),radial-gradient(circle_at_82%_0%,rgba(35,196,245,0.1),transparent_52%),linear-gradient(180deg,rgba(69,121,214,0.09),rgba(69,121,214,0)_78%)]" />

      <div className="mx-auto w-full max-w-[1680px] space-y-6">
        <section className="hub-card-hero relative overflow-hidden px-6 py-6 sm:px-7">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-16 top-[-120px] h-64 w-64 rounded-full bg-[#dce8ff]/70 blur-3xl" />
            <div className="absolute -right-20 top-[-140px] h-72 w-72 rounded-full bg-[#d8f4ff]/65 blur-3xl" />
          </div>

          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="hub-chip border-[#c8d6ea] bg-[#f7fbff] font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-[#1f5eff]" />
                Support Admin
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1c33] sm:text-4xl">
                Messagerie support
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-[#51627b] sm:text-base">
                Traitez les conversations clients en temps reel, avec une vue premium type SaaS.
              </p>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        {liveNotice ? (
          <div
            className={cn(
              "flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm",
              liveNotice.tone === "ticket"
                ? "border-[#9cc0ff] bg-[#edf4ff] text-[#1f4f96]"
                : "border-[#c8d6ea] bg-[#f8fbff] text-[#334155]"
            )}
            role="status"
            aria-live="polite"
          >
            <Bell className="h-4 w-4 shrink-0" />
            <span>{liveNotice.text}</span>
          </div>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[330px_minmax(0,1fr)]">
          <div
            className={cn(
              "hub-card overflow-hidden",
              isMobileThreadOpen ? "hidden lg:block" : "block"
            )}
          >
            <div className="border-b border-[#d7e3f4] bg-[#f8fbff] px-4 py-3">
              <h2 className="text-sm font-semibold text-[#0b1c33]">Conversations</h2>
            </div>

            <div className="space-y-3 border-b border-[#d7e3f4] bg-[#f8fbff] p-3">
              <label
                htmlFor="admin-support-search"
                className="text-[11px] font-medium uppercase tracking-wide text-[#6b7f99]"
              >
                Recherche
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6b7f99]" />
                <input
                  id="admin-support-search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Nom ou email..."
                  className="h-9 w-full rounded-xl border border-[#c8d6ea] bg-white pl-9 pr-3 text-sm text-[#0b1c33] placeholder-[#93a6c1] focus:border-[#9cc0ff] focus:outline-none focus:ring-2 focus:ring-[#dce8ff]"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {(["open", "reopened", "closed", "all"] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-[11px] transition",
                      statusFilter === status
                        ? "border-[#9cc0ff] bg-[#edf4ff] text-[#1f4f96]"
                        : "border-[#d7e3f4] bg-white text-[#51627b] hover:bg-[#f3f8ff]"
                    )}
                  >
                    {status === "open"
                      ? "Open"
                      : status === "reopened"
                        ? "Reouvert"
                        : status === "closed"
                          ? "Closed"
                          : "All"}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setUnreadOnly((prev) => !prev)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[11px] transition",
                    unreadOnly
                      ? "border-[#9cc0ff] bg-[#edf4ff] text-[#1f4f96]"
                      : "border-[#d7e3f4] bg-white text-[#51627b] hover:bg-[#f3f8ff]"
                  )}
                >
                  Unread
                </button>
              </div>
            </div>

            <div className="max-h-[68vh] overflow-y-auto p-3">
              {loadingConversations ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div
                      key={`skeleton-conv-${index}`}
                      className="h-16 animate-pulse rounded-xl border border-[#d7e3f4] bg-[#f5f9ff]"
                    />
                  ))}
                </div>
              ) : conversations.length === 0 ? (
                <div className="rounded-xl border border-[#d7e3f4] bg-[#f8fbff] p-4 text-sm text-[#51627b]">
                  Aucune conversation pour ces filtres.
                </div>
              ) : (
                <div className="space-y-2">
                  {conversations.map((conversation) => {
                    const isActive = conversation.id === selectedConversationId;
                    return (
                      <button
                        key={conversation.id}
                        type="button"
                        onClick={() => handleConversationOpen(conversation.id)}
                        className={cn(
                          "w-full rounded-xl border px-3 py-2.5 text-left transition",
                          isActive
                            ? "border-[#9cc0ff] bg-[#edf4ff]"
                            : "border-[#d7e3f4] bg-white hover:border-[#b9d0f2] hover:bg-[#f8fbff]"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#0b1c33]">
                              {formatConversationName(conversation)}
                            </p>
                            <p className="truncate text-[11px] text-[#1f4f96]">
                              Ticket #{conversation.ticket_number ?? "—"}
                            </p>
                            <p className="truncate text-[11px] text-[#64748b]">
                              {conversation.user_email || "Email indisponible"}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-[10px] text-[#6b7f99]">
                              {formatRelative(conversation.last_message_at)}
                            </span>
                            {conversation.unread_for_support > 0 ? (
                              <span className="rounded-full border border-[#9cc0ff] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#1f5eff]">
                                {conversation.unread_for_support > 99
                                  ? "99+"
                                  : conversation.unread_for_support}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <p className="mt-1 truncate text-[11px] text-[#51627b]">
                          {conversation.last_message_preview || "Aucun message"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div
            className={cn(
              "hub-card flex min-h-[66vh] flex-col overflow-hidden",
              isMobileThreadOpen ? "flex" : "hidden lg:flex"
            )}
          >
            {!selectedConversation ? (
              <div className="flex flex-1 items-center justify-center p-8 text-center">
                <div className="max-w-sm space-y-2">
                  <Sparkles className="mx-auto h-8 w-8 text-[#6b7f99]" />
                  <p className="text-sm font-medium text-[#0b1c33]">
                    Sélectionne une conversation
                  </p>
                  <p className="text-sm text-[#51627b]">
                    Choisis un thread à gauche pour répondre rapidement.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="border-b border-[#d7e3f4] bg-[#f8fbff] px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsMobileThreadOpen(false)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#d7e3f4] bg-white text-[#51627b] transition hover:bg-[#f3f8ff] lg:hidden"
                        aria-label="Retour à la liste des conversations"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </button>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#0b1c33]">
                          {formatConversationName(selectedConversation)}
                        </p>
                        <p className="truncate text-[11px] text-[#1f4f96]">
                          Ticket #{selectedConversation.ticket_number ?? "—"}
                        </p>
                        <p className="truncate text-[11px] text-[#64748b]">
                          {selectedConversation.user_email || "Email indisponible"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
                          selectedConversation.status === "open"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : selectedConversation.status === "reopened"
                              ? "border-blue-200 bg-blue-50 text-blue-700"
                              : "border-slate-300 bg-slate-100 text-slate-700"
                        )}
                      >
                        {selectedConversation.status}
                      </span>
                      <HubButton
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleStatusToggle}
                        disabled={updatingStatus}
                      >
                        {updatingStatus
                          ? "Mise à jour..."
                          : selectedConversation.status === "closed"
                            ? "Reopen"
                            : "Close"}
                      </HubButton>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-3">
                  {loadingMessages ? (
                    <div className="space-y-2">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <div
                          key={`skeleton-msg-${index}`}
                          className={cn(
                            "h-14 animate-pulse rounded-2xl",
                            index % 2 === 0 ? "w-[78%] bg-[#e8eef8]" : "ml-auto w-[62%] bg-[#dce8ff]"
                          )}
                        />
                      ))}
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="rounded-xl border border-[#d7e3f4] bg-[#f8fbff] p-4 text-sm text-[#51627b]">
                      Aucun message pour cette conversation.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {messages.map((message) => {
                        const isSupport = message.sender_type === "support";
                        return (
                          <article
                            key={message.id}
                            className={cn(
                              "max-w-[84%] rounded-2xl border px-3 py-2",
                              isSupport
                                ? "ml-auto border-[#9cc0ff] bg-[#edf4ff] text-[#163a6a]"
                                : "mr-auto border-[#d7e3f4] bg-white text-[#0b1c33]"
                            )}
                          >
                            <div className="mb-1 flex items-center gap-1 text-[10px] text-[#64748b]">
                              {isSupport ? (
                                <CheckCheck className="h-3 w-3" />
                              ) : (
                                <UserCircle2 className="h-3 w-3" />
                              )}
                              <span>{isSupport ? "Support Lidmeo" : "Client"}</span>
                            </div>
                            <p className="whitespace-pre-wrap text-[13px] leading-relaxed">
                              {message.body}
                            </p>
                            <p className="mt-1 text-right text-[10px] text-[#7b8da6]">
                              {formatRelative(message.created_at)}
                            </p>
                          </article>
                        );
                      })}
                      <div ref={bottomRef} />
                    </div>
                  )}
                </div>

                <div className="space-y-3 border-t border-[#d7e3f4] bg-[#f8fbff] p-3">
                  <div className="flex flex-wrap gap-2">
                    {QUICK_REPLIES.map((reply) => (
                      <button
                        key={reply}
                        type="button"
                        onClick={() => void handleSend(reply)}
                        className="rounded-full border border-[#d7e3f4] bg-white px-3 py-1 text-[11px] text-[#51627b] transition hover:bg-[#eef4ff]"
                      >
                        {reply}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-end gap-2">
                    <textarea
                      ref={textareaRef}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={onDraftKeyDown}
                      rows={2}
                      placeholder="Ecrire une reponse..."
                      className="max-h-36 min-h-[44px] flex-1 resize-y rounded-xl border border-[#c8d6ea] bg-white px-3 py-2 text-sm text-[#0b1c33] placeholder-[#93a6c1] focus:border-[#9cc0ff] focus:outline-none focus:ring-2 focus:ring-[#dce8ff]"
                      aria-label="Composer une réponse support"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSend()}
                      disabled={sending || !draft.trim()}
                      className={cn(
                        "inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#1f5eff] bg-[#2563EB] text-white transition",
                        "hover:bg-[#1d4ed8] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]",
                        (sending || !draft.trim()) && "cursor-not-allowed opacity-60"
                      )}
                      aria-label="Envoyer la réponse"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
