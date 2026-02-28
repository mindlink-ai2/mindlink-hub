"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SubscriptionGate from "@/components/SubscriptionGate";
import { HubButton } from "@/components/ui/hub-button";
import { supabase } from "@/lib/supabase";
import { ChevronRight, Linkedin, Search } from "lucide-react";
import MobileLayout from "@/components/mobile/MobileLayout";
import MobilePageHeader from "@/components/mobile/MobilePageHeader";
import MobileSheet from "@/components/mobile/MobileSheet";
import MobileSheetHeader from "@/components/mobile/MobileSheetHeader";
import MobileEmptyState from "@/components/mobile/MobileEmptyState";
import MobileSkeleton from "@/components/mobile/MobileSkeleton";

type InboxThread = {
  id: string;
  unipile_thread_id: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number | null;
  lead_id?: number | string | null;
  lead_exists?: boolean | null;
  contact_name: string | null;
  contact_linkedin_url: string | null;
  contact_avatar_url: string | null;
  lead_linkedin_url: string | null;
  dm_draft_invitation_id?: string | null;
  dm_draft_status?: "none" | "draft" | "sent" | string | null;
  dm_draft_text?: string | null;
};

type InboxMessage = {
  id: string;
  unipile_message_id: string;
  direction: "inbound" | "outbound" | string;
  sender_name: string | null;
  sender_linkedin_url: string | null;
  text: string | null;
  sent_at: string | null;
  raw: unknown;
};

type MobileThreadFilter = "all" | "unread";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function formatDateTime(date: string | null) {
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

function sortThreadsByLastMessage(threads: InboxThread[]) {
  return [...threads].sort((a, b) => {
    const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return bTime - aTime;
  });
}

function sortMessagesBySentAt(messages: InboxMessage[]) {
  return [...messages].sort((a, b) => {
    const aTime = a.sent_at ? new Date(a.sent_at).getTime() : 0;
    const bTime = b.sent_at ? new Date(b.sent_at).getTime() : 0;
    return aTime - bTime;
  });
}

function getContactInitials(name: string | null): string {
  const clean = (name ?? "").trim();
  if (!clean) return "CL";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function formatUnreadCount(value: number): string {
  if (value > 99) return "99+";
  return String(value);
}

function normalizeSearchValue(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function toExternalUrl(value: string | null | undefined): string | null {
  const clean = (value ?? "").trim();
  if (!clean) return null;
  return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
}

function threadFromRealtimePayload(payloadNew: Record<string, unknown>): InboxThread | null {
  const id = String(payloadNew.id ?? "").trim();
  const unipileThreadId = String(payloadNew.unipile_thread_id ?? "").trim();
  if (!id || !unipileThreadId) return null;

  return {
    id,
    unipile_thread_id: unipileThreadId,
    last_message_at:
      typeof payloadNew.last_message_at === "string" ? payloadNew.last_message_at : null,
    last_message_preview:
      typeof payloadNew.last_message_preview === "string"
        ? payloadNew.last_message_preview
        : null,
    unread_count:
      typeof payloadNew.unread_count === "number"
        ? payloadNew.unread_count
        : Number(payloadNew.unread_count ?? 0),
    lead_id:
      payloadNew.lead_id === null || payloadNew.lead_id === undefined
        ? null
        : String(payloadNew.lead_id),
    lead_exists:
      typeof payloadNew.lead_exists === "boolean"
        ? payloadNew.lead_exists
        : null,
    contact_name: typeof payloadNew.contact_name === "string" ? payloadNew.contact_name : null,
    contact_linkedin_url:
      typeof payloadNew.contact_linkedin_url === "string"
        ? payloadNew.contact_linkedin_url
        : null,
    contact_avatar_url:
      typeof payloadNew.contact_avatar_url === "string" ? payloadNew.contact_avatar_url : null,
    lead_linkedin_url:
      typeof payloadNew.lead_linkedin_url === "string" ? payloadNew.lead_linkedin_url : null,
  };
}

function messageFromRealtimePayload(payloadNew: Record<string, unknown>): InboxMessage | null {
  const id = String(payloadNew.id ?? "").trim();
  const unipileMessageId = String(payloadNew.unipile_message_id ?? "").trim();
  if (!id || !unipileMessageId) return null;

  return {
    id,
    unipile_message_id: unipileMessageId,
    direction: String(payloadNew.direction ?? "inbound"),
    sender_name: typeof payloadNew.sender_name === "string" ? payloadNew.sender_name : null,
    sender_linkedin_url:
      typeof payloadNew.sender_linkedin_url === "string"
        ? payloadNew.sender_linkedin_url
        : null,
    text: typeof payloadNew.text === "string" ? payloadNew.text : null,
    sent_at: typeof payloadNew.sent_at === "string" ? payloadNew.sent_at : null,
    raw: payloadNew.raw ?? null,
  };
}

export default function InboxPage() {
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [threadSearch, setThreadSearch] = useState("");
  const [mobileThreadFilter, setMobileThreadFilter] = useState<MobileThreadFilter>("all");
  const [mobileThreadSheetOpen, setMobileThreadSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [sendingDraft, setSendingDraft] = useState(false);
  const [availableHeight, setAvailableHeight] = useState<number | null>(null);
  const pageContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollToBottomRef = useRef(false);
  const loadedMessagesThreadIdRef = useRef<string | null>(null);
  const syncInFlightRef = useRef(false);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [threads, selectedThreadId]
  );
  const selectedThreadHasProspectionLead = Boolean(selectedThread?.lead_exists);
  const selectedThreadLinkedInUrl = useMemo(
    () => {
      if (!selectedThreadHasProspectionLead) return null;
      return toExternalUrl(
        selectedThread?.lead_linkedin_url ?? selectedThread?.contact_linkedin_url ?? null
      );
    },
    [
      selectedThreadHasProspectionLead,
      selectedThread?.contact_linkedin_url,
      selectedThread?.lead_linkedin_url,
    ]
  );
  const selectedThreadHasDraft =
    selectedThread?.dm_draft_status === "draft" &&
    Boolean((selectedThread?.dm_draft_text ?? "").trim());

  useEffect(() => {
    if (!selectedThreadId) {
      setMobileThreadSheetOpen(false);
    }
  }, [selectedThreadId]);

  const scrollMessagesToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const viewport = messagesViewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior });
  }, []);

  const updateAvailableHeight = useCallback(() => {
    const container = pageContainerRef.current;
    if (!container) return;

    const top = container.getBoundingClientRect().top;
    const nextHeight = Math.max(360, Math.floor(window.innerHeight - top - 8));

    setAvailableHeight((prev) => (prev === nextHeight ? prev : nextHeight));
  }, []);

  const handleOpenSelectedThreadLinkedInProfile = useCallback(() => {
    const url = selectedThreadLinkedInUrl;
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [selectedThreadLinkedInUrl]);

  const filteredThreads = useMemo(() => {
    const query = normalizeSearchValue(threadSearch);
    if (!query) return threads;

    return threads.filter((thread) => {
      const name = (thread.contact_name ?? "").trim();
      if (!name) return false;
      const normalizedName = normalizeSearchValue(name);
      const firstName = normalizeSearchValue(name.split(/\s+/)[0] ?? "");
      return normalizedName.includes(query) || firstName.includes(query);
    });
  }, [threads, threadSearch]);

  const mobileFilteredThreads = useMemo(() => {
    if (mobileThreadFilter === "all") return filteredThreads;
    return filteredThreads.filter((thread) => Number(thread.unread_count ?? 0) > 0);
  }, [filteredThreads, mobileThreadFilter]);

  const unreadThreadsCount = useMemo(
    () => threads.filter((thread) => Number(thread.unread_count ?? 0) > 0).length,
    [threads]
  );

  const filteredUnreadThreadsCount = useMemo(
    () => filteredThreads.filter((thread) => Number(thread.unread_count ?? 0) > 0).length,
    [filteredThreads]
  );

  const loadThreads = useCallback(async (options?: { keepSelected?: boolean }) => {
    setLoadingThreads(true);
    setError(null);

    try {
      const res = await fetch("/api/inbox/threads", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Impossible de charger les threads.");

      const nextThreads = Array.isArray(data?.threads)
        ? (data.threads as InboxThread[])
        : [];
      const sortedThreads = sortThreadsByLastMessage(nextThreads);
      setThreads(sortedThreads);

      if (sortedThreads.length === 0) {
        setSelectedThreadId(null);
        setMessages([]);
        return;
      }

      if (options?.keepSelected) {
        setSelectedThreadId((prev) => {
          if (!prev) return sortedThreads[0].id;
          const stillExists = sortedThreads.some((thread) => thread.id === prev);
          return stillExists ? prev : sortedThreads[0].id;
        });
      } else {
        setSelectedThreadId((prev) => prev ?? sortedThreads[0].id);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement des threads.");
    } finally {
      setLoadingThreads(false);
    }
  }, []);

  const loadMessages = async (threadDbId: string) => {
    loadedMessagesThreadIdRef.current = null;
    setLoadingMessages(true);
    setError(null);
    setMessages([]);

    try {
      const res = await fetch(
        `/api/inbox/messages?threadDbId=${encodeURIComponent(threadDbId)}`,
        { cache: "no-store" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Impossible de charger les messages.");

      const loadedMessages = Array.isArray(data?.messages)
        ? (data.messages as InboxMessage[])
        : [];
      setMessages(sortMessagesBySentAt(loadedMessages));
      loadedMessagesThreadIdRef.current = threadDbId;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement des messages.");
      setMessages([]);
      loadedMessagesThreadIdRef.current = threadDbId;
    } finally {
      setLoadingMessages(false);
    }
  };

  const markThreadRead = async (threadDbId: string) => {
    await fetch("/api/inbox/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadDbId }),
    });

    setThreads((prev) =>
      prev.map((thread) =>
        thread.id === threadDbId ? { ...thread, unread_count: 0 } : thread
      )
    );
  };

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/inbox/client", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.clientId) return;
        setClientId(String(data.clientId));
      } catch {
        // no-op
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedThreadId) return;
    loadedMessagesThreadIdRef.current = null;
    shouldScrollToBottomRef.current = true;
    void loadMessages(selectedThreadId);
    void markThreadRead(selectedThreadId);
  }, [selectedThreadId]);

  useEffect(() => {
    if (!selectedThreadId || loadingMessages) return;
    if (!shouldScrollToBottomRef.current) return;
    if (loadedMessagesThreadIdRef.current !== selectedThreadId) return;

    shouldScrollToBottomRef.current = false;
    window.requestAnimationFrame(() => {
      scrollMessagesToBottom("auto");
      window.setTimeout(() => scrollMessagesToBottom("auto"), 60);
    });
  }, [selectedThreadId, loadingMessages, messages, scrollMessagesToBottom]);

  useEffect(() => {
    updateAvailableHeight();

    window.addEventListener("resize", updateAvailableHeight);
    window.addEventListener("orientationchange", updateAvailableHeight);

    return () => {
      window.removeEventListener("resize", updateAvailableHeight);
      window.removeEventListener("orientationchange", updateAvailableHeight);
    };
  }, [updateAvailableHeight]);

  useEffect(() => {
    if (!clientId) return;

    const channel = supabase
      .channel(`inbox-threads-${clientId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inbox_threads",
          filter: `client_id=eq.${clientId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldRow = payload.old as Record<string, unknown> | undefined;
            const deletedId = String(oldRow?.id ?? "").trim();
            if (!deletedId) return;

            setThreads((prev) => prev.filter((thread) => thread.id !== deletedId));
            setSelectedThreadId((prev) => (prev === deletedId ? null : prev));
            return;
          }

          const nextRow = payload.new as Record<string, unknown> | undefined;
          if (!nextRow) return;
          const realtimeThread = threadFromRealtimePayload(nextRow);
          if (!realtimeThread) return;

          setThreads((prev) => {
            const previousThread =
              prev.find((thread) => thread.id === realtimeThread.id) ?? null;
            const mergedThread = previousThread
              ? {
                  ...previousThread,
                  ...realtimeThread,
                  lead_exists:
                    realtimeThread.lead_exists === null ||
                    realtimeThread.lead_exists === undefined
                      ? previousThread.lead_exists
                      : realtimeThread.lead_exists,
                }
              : realtimeThread;
            const without = prev.filter((thread) => thread.id !== realtimeThread.id);
            return sortThreadsByLastMessage([...without, mergedThread]);
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [clientId]);

  useEffect(() => {
    if (!selectedThreadId) return;

    const channel = supabase
      .channel(`inbox-messages-${selectedThreadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "inbox_messages",
          filter: `thread_db_id=eq.${selectedThreadId}`,
        },
        (payload) => {
          const nextRow = payload.new as Record<string, unknown> | undefined;
          if (!nextRow) return;
          const realtimeMessage = messageFromRealtimePayload(nextRow);
          if (!realtimeMessage) return;
          loadedMessagesThreadIdRef.current = selectedThreadId;
          shouldScrollToBottomRef.current = true;

          setMessages((prev) => {
            const exists = prev.some(
              (message) =>
                message.id === realtimeMessage.id ||
                message.unipile_message_id === realtimeMessage.unipile_message_id
            );
            if (exists) {
              return sortMessagesBySentAt(
                prev.map((message) =>
                  message.unipile_message_id === realtimeMessage.unipile_message_id ||
                  message.id === realtimeMessage.id
                    ? realtimeMessage
                    : message
                )
              );
            }
            return sortMessagesBySentAt([...prev, realtimeMessage]);
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "inbox_messages",
          filter: `thread_db_id=eq.${selectedThreadId}`,
        },
        (payload) => {
          const nextRow = payload.new as Record<string, unknown> | undefined;
          if (!nextRow) return;
          const realtimeMessage = messageFromRealtimePayload(nextRow);
          if (!realtimeMessage) return;

          setMessages((prev) =>
            sortMessagesBySentAt(
              prev.map((message) =>
                message.id === realtimeMessage.id ||
                message.unipile_message_id === realtimeMessage.unipile_message_id
                  ? { ...message, ...realtimeMessage }
                  : message
              )
            )
          );
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selectedThreadId]);

  const runSync = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent === true;
      if (syncInFlightRef.current) return;
      syncInFlightRef.current = true;

      if (!silent) {
        setSyncing(true);
        setError(null);
      }

      try {
        const res = await fetch("/api/inbox/sync", { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false) {
          throw new Error(data?.error ?? "La synchronisation a échoué.");
        }

        await loadThreads({ keepSelected: true });
        if (selectedThreadId) {
          shouldScrollToBottomRef.current = true;
          await loadMessages(selectedThreadId);
        }
      } catch (e: unknown) {
        if (!silent) {
          setError(e instanceof Error ? e.message : "Erreur pendant la synchronisation.");
        } else {
          console.error("INBOX_BACKGROUND_SYNC_ERROR:", e);
        }
      } finally {
        syncInFlightRef.current = false;
        if (!silent) setSyncing(false);
      }
    },
    [loadThreads, selectedThreadId]
  );

  const handleSync = async () => {
    if (syncing) return;
    await runSync({ silent: false });
  };

  useEffect(() => {
    const syncIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      void runSync({ silent: true });
    };

    // Premier refresh silencieux pour réduire le délai perçu à l'ouverture.
    syncIfVisible();

    const intervalId = window.setInterval(syncIfVisible, 45000);
    document.addEventListener("visibilitychange", syncIfVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", syncIfVisible);
    };
  }, [runSync]);

  const handleMarkAllRead = async () => {
    if (markingAllRead) return;
    setMarkingAllRead(true);
    setError(null);

    try {
      const res = await fetch("/api/inbox/mark-all-read", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error ?? "Impossible de marquer toutes les conversations comme lues.");
      }

      setThreads((prev) => prev.map((thread) => ({ ...thread, unread_count: 0 })));
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : "Erreur pendant le marquage de toutes les conversations."
      );
    } finally {
      setMarkingAllRead(false);
    }
  };

  const handleSend = async () => {
    if (!selectedThreadId || !draft.trim() || sending) return;
    setSending(true);
    setError(null);

    const text = draft.trim();

    try {
      const res = await fetch("/api/inbox/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadDbId: selectedThreadId, text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error ?? "Envoi impossible.");
      }

      const sentAt = String(data?.message?.sent_at ?? new Date().toISOString());
      loadedMessagesThreadIdRef.current = selectedThreadId;
      shouldScrollToBottomRef.current = true;

      setMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          unipile_message_id: String(data?.message?.unipile_message_id ?? ""),
          direction: "outbound",
          sender_name: null,
          sender_linkedin_url: null,
          text,
          sent_at: sentAt,
          raw: { delivery_status: "delivered" },
        },
      ]);

      setThreads((prev) => {
        const next = prev.map((thread) =>
          thread.id === selectedThreadId
            ? {
                ...thread,
                last_message_at: sentAt,
                last_message_preview: text,
              }
            : thread
        );
        return sortThreadsByLastMessage(next);
      });

      setDraft("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur pendant l’envoi.");
    } finally {
      setSending(false);
    }
  };

  const handleSendDraft = async () => {
    if (!selectedThreadId || !selectedThreadHasDraft || sendingDraft) return;
    setSendingDraft(true);
    setError(null);

    try {
      const res = await fetch("/api/inbox/send-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadDbId: selectedThreadId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success !== true) {
        throw new Error(data?.error ?? "send_draft_failed");
      }

      const sentAt = String(data?.message?.sent_at ?? new Date().toISOString());
      const text = String(data?.message?.text ?? selectedThread?.dm_draft_text ?? "").trim();

      if (text) {
        loadedMessagesThreadIdRef.current = selectedThreadId;
        shouldScrollToBottomRef.current = true;
        setMessages((prev) => [
          ...prev,
          {
            id: `local-draft-${Date.now()}`,
            unipile_message_id: String(data?.message?.unipile_message_id ?? ""),
            direction: "outbound",
            sender_name: null,
            sender_linkedin_url: null,
            text,
            sent_at: sentAt,
            raw: { delivery_status: "delivered", source: "draft_send" },
          },
        ]);
      }

      setThreads((prev) =>
        sortThreadsByLastMessage(
          prev.map((thread) =>
            thread.id === selectedThreadId
              ? {
                  ...thread,
                  last_message_at: sentAt,
                  last_message_preview: text || thread.last_message_preview,
                  dm_draft_status: "sent",
                }
              : thread
          )
        )
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur pendant l'envoi du draft.");
    } finally {
      setSendingDraft(false);
    }
  };

  return (
    <SubscriptionGate supportEmail="contact@lidmeo.com">
      <div className="flex h-full min-h-0 flex-col px-4 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-5">
        <div className="mx-auto flex min-h-0 w-full max-w-[1680px] flex-1 flex-col gap-3">
          <MobileLayout>
            <MobilePageHeader
              title="Messagerie LinkedIn"
              subtitle={`${threads.length} conversation(s) · ${unreadThreadsCount} non lue(s)`}
              actions={
                <button
                  type="button"
                  onClick={handleSync}
                  disabled={syncing}
                  className="inline-flex h-8 items-center rounded-lg border border-[#d7e3f4] bg-white px-2.5 text-[11px] font-medium text-[#4b647f] transition hover:bg-[#f7fbff] focus:outline-none focus:ring-2 focus:ring-[#dce8ff] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {syncing ? "Sync..." : "Sync"}
                </button>
              }
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileThreadFilter("all")}
                className={[
                  "inline-flex h-8 items-center rounded-full border px-3 text-[11px] font-medium transition focus:outline-none focus:ring-2 focus:ring-[#dce8ff]",
                  mobileThreadFilter === "all"
                    ? "border-[#9cc0ff] bg-[#edf4ff] text-[#1f4f96]"
                    : "border-[#d7e3f4] bg-white text-[#607894] hover:bg-[#f7fbff]",
                ].join(" ")}
                aria-pressed={mobileThreadFilter === "all"}
              >
                Tous ({filteredThreads.length})
              </button>

              <button
                type="button"
                onClick={() => setMobileThreadFilter("unread")}
                className={[
                  "inline-flex h-8 items-center rounded-full border px-3 text-[11px] font-medium transition focus:outline-none focus:ring-2 focus:ring-[#dce8ff]",
                  mobileThreadFilter === "unread"
                    ? "border-[#9cc0ff] bg-[#edf4ff] text-[#1f4f96]"
                    : "border-[#d7e3f4] bg-white text-[#607894] hover:bg-[#f7fbff]",
                ].join(" ")}
                aria-pressed={mobileThreadFilter === "unread"}
              >
                Non lus ({filteredUnreadThreadsCount})
              </button>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8aa0bb]" />
              <input
                value={threadSearch}
                onChange={(event) => setThreadSearch(event.target.value)}
                placeholder="Rechercher un prénom..."
                className="h-10 w-full rounded-xl border border-[#d7e3f4] bg-white pl-9 pr-3 text-sm text-[#0b1c33] placeholder-[#93a6c1] focus:border-[#9cc0ff] focus:outline-none focus:ring-2 focus:ring-[#dce8ff]"
              />
            </div>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
                {error}
              </div>
            ) : null}

            {loadingThreads ? (
              <MobileSkeleton rows={8} />
            ) : mobileFilteredThreads.length === 0 ? (
              <MobileEmptyState
                title="Aucune conversation"
                description={
                  threads.length === 0
                    ? "La synchronisation n'a encore ramené aucun thread."
                    : mobileThreadFilter === "unread"
                      ? "Aucune conversation non lue pour ce filtre."
                      : "Aucune conversation ne correspond à cette recherche."
                }
              />
            ) : (
              <div className="space-y-2">
                {mobileFilteredThreads.map((thread) => {
                  const unreadCount =
                    typeof thread.unread_count === "number" ? thread.unread_count : 0;

                  return (
                    <button
                      key={thread.id}
                      type="button"
                      onClick={() => {
                        shouldScrollToBottomRef.current = true;
                        setSelectedThreadId(thread.id);
                        setMobileThreadSheetOpen(true);
                      }}
                      className="w-full rounded-xl border border-[#d7e3f4] bg-white px-3 py-2 text-left shadow-[0_10px_18px_-18px_rgba(18,43,86,0.68)] transition hover:bg-[#f9fbff] focus:outline-none focus:ring-2 focus:ring-[#dce8ff]"
                    >
                      <div className="flex items-center gap-2">
                        {thread.contact_avatar_url ? (
                          <img
                            src={thread.contact_avatar_url}
                            alt={thread.contact_name || "Contact LinkedIn"}
                            className="h-9 w-9 shrink-0 rounded-full border border-[#d7e3f4] object-cover"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d7e3f4] bg-[#edf4ff] text-xs font-semibold text-[#325c95]">
                            {getContactInitials(thread.contact_name)}
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-[14px] font-medium text-[#0b1c33]">
                              {thread.contact_name || "Contact LinkedIn"}
                            </p>
                            {unreadCount > 0 ? (
                              <span className="rounded-full border border-[#9cc0ff] bg-[#edf4ff] px-2 py-0.5 text-[10px] font-semibold text-[#1f5eff]">
                                {formatUnreadCount(unreadCount)}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 truncate text-[12px] text-[#5f7693]">
                            {thread.last_message_preview || "Aucun aperçu"}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[#8093ad]">
                            {formatDateTime(thread.last_message_at)}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-[#9bb0c8]" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </MobileLayout>

          <MobileSheet
            open={mobileThreadSheetOpen && Boolean(selectedThread)}
            onClose={() => setMobileThreadSheetOpen(false)}
            panelClassName="top-0 rounded-none"
          >
            {selectedThread ? (
              <>
                <MobileSheetHeader
                  title={selectedThread.contact_name || "Conversation"}
                  subtitle="Fiche prospect"
                  onClose={() => setMobileThreadSheetOpen(false)}
                  rightSlot={
                    selectedThreadLinkedInUrl ? (
                      <button
                        type="button"
                        onClick={handleOpenSelectedThreadLinkedInProfile}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#d7e3f4] bg-white px-2 text-[11px] font-medium text-[#4b647f] transition hover:bg-[#f7fbff] focus:outline-none focus:ring-2 focus:ring-[#dce8ff]"
                      >
                        <Linkedin className="h-3.5 w-3.5 text-[#0A66C2]" />
                        Profil
                      </button>
                    ) : null
                  }
                />

                <div ref={messagesViewportRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                  {loadingMessages ? (
                    <div className="text-sm text-[#51627b]">Chargement des messages…</div>
                  ) : messages.length === 0 ? (
                    <MobileEmptyState
                      title="Aucun message"
                      description="Ce thread ne contient pas encore d'échange."
                    />
                  ) : (
                    <div className="space-y-3">
                      {messages.map((message) => {
                        const raw = asObject(message.raw);
                        const isDeleted = raw.deleted === true;
                        const deliveryStatus =
                          typeof raw.delivery_status === "string"
                            ? raw.delivery_status.toLowerCase()
                            : null;
                        const statusLabel =
                          deliveryStatus === "read"
                            ? "Lu"
                            : deliveryStatus === "delivered"
                              ? "Délivré"
                              : null;
                        const outbound = String(message.direction).toLowerCase() === "outbound";

                        return (
                          <div
                            key={message.id}
                            className={[
                              "max-w-[88%] rounded-2xl border px-3 py-2 text-sm",
                              outbound
                                ? "ml-auto border-[#9cc0ff] bg-[#edf5ff] text-[#14345e]"
                                : "mr-auto border-[#d7e3f4] bg-[#f7fbff] text-[#1e3551]",
                            ].join(" ")}
                          >
                            <div className="mb-1 text-[11px] text-[#6a7f9f]">
                              {message.sender_name || (outbound ? "Vous" : "Prospect")}
                            </div>
                            <div className="whitespace-pre-wrap">
                              {isDeleted ? "Message supprimé" : message.text || "—"}
                            </div>
                            <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-[#7a8ea9]">
                              <span>{formatDateTime(message.sent_at)}</span>
                              <span>{statusLabel ?? ""}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="border-t border-[#d7e3f4] bg-white px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)]">
                  <div className="flex items-end gap-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Écrire une réponse..."
                      className="min-h-[72px] w-full rounded-xl border border-[#c8d6ea] bg-[#f8fbff] px-3 py-2 text-sm text-[#0b1c33] placeholder-[#93a6c1] focus:border-[#9cc0ff] focus:outline-none focus:ring-2 focus:ring-[#dce8ff]"
                    />
                    <HubButton
                      type="button"
                      variant="primary"
                      onClick={handleSend}
                      disabled={sending || !draft.trim()}
                    >
                      {sending ? "Envoi..." : "Envoyer"}
                    </HubButton>
                  </div>
                </div>
              </>
            ) : null}
          </MobileSheet>

          <div className="hidden md:block">
            <section className="hub-card-hero p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="hub-page-title mt-1 text-3xl md:text-4xl">
                    Messagerie LinkedIn
                  </h1>
                  <p className="mt-1 text-xs text-[#51627b] sm:text-sm">
                    Vos conversations sont centralisées et à jour en temps réel.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <HubButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleMarkAllRead}
                    disabled={markingAllRead || syncing}
                  >
                    {markingAllRead ? "Marquage..." : "Marquer tout comme lu"}
                  </HubButton>
                  <HubButton
                    type="button"
                    variant="primary"
                    onClick={handleSync}
                    disabled={syncing || markingAllRead}
                  >
                    {syncing ? "Synchronisation..." : "Synchroniser"}
                  </HubButton>
                </div>
              </div>

              {error ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}
            </section>

            <section className="mt-3 grid min-h-0 flex-1 gap-3 md:grid-cols-[330px_minmax(0,1fr)]">
              <div className="hub-card flex min-h-0 flex-col overflow-hidden">
                <div className="border-b border-[#d7e3f4] bg-[#f8fbff] px-4 py-3">
                  <h2 className="text-sm font-semibold text-[#0b1c33]">Conversations</h2>
                </div>

                <div className="border-b border-[#d7e3f4] bg-[#f8fbff] p-3">
                  <input
                    value={threadSearch}
                    onChange={(event) => setThreadSearch(event.target.value)}
                    placeholder="Rechercher un prénom..."
                    className="h-9 w-full rounded-xl border border-[#c8d6ea] bg-white px-3 text-sm text-[#0b1c33] placeholder-[#93a6c1] focus:border-[#9cc0ff] focus:outline-none focus:ring-2 focus:ring-[#dce8ff]"
                  />
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  {loadingThreads ? (
                    <div className="p-3 text-sm text-[#51627b]">Chargement des threads…</div>
                  ) : threads.length === 0 ? (
                    <div className="p-3 text-sm text-[#51627b]">
                      Aucune conversation synchronisée pour le moment.
                    </div>
                  ) : filteredThreads.length === 0 ? (
                    <div className="p-3 text-sm text-[#51627b]">
                      Aucune conversation trouvée pour cette recherche.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredThreads.map((thread) => {
                        const active = thread.id === selectedThreadId;
                        const unreadCount =
                          typeof thread.unread_count === "number" ? thread.unread_count : 0;

                        return (
                          <button
                            key={thread.id}
                            type="button"
                            onClick={() => {
                              shouldScrollToBottomRef.current = true;
                              setSelectedThreadId(thread.id);
                            }}
                            className={[
                              "w-full rounded-xl border px-3 py-3 text-left transition-colors duration-150",
                              active ? "border-[#9cc0ff]" : "border-[#d7e3f4] hover:border-[#b9d0f2]",
                              unreadCount > 0
                                ? "bg-blue-50 hover:bg-blue-100"
                                : "bg-transparent hover:bg-gray-50",
                            ].join(" ")}
                          >
                            <div className="flex items-start gap-3">
                              {thread.contact_avatar_url ? (
                                <img
                                  src={thread.contact_avatar_url}
                                  alt={thread.contact_name || "Contact LinkedIn"}
                                  className="h-9 w-9 shrink-0 rounded-full border border-[#d7e3f4] object-cover"
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d7e3f4] bg-[#edf4ff] text-xs font-semibold text-[#325c95]">
                                  {getContactInitials(thread.contact_name)}
                                </div>
                              )}

                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="truncate text-sm font-medium text-[#0b1c33]">
                                    {thread.contact_name || "Contact LinkedIn"}
                                  </p>
                                  {unreadCount > 0 ? (
                                    <span className="rounded-full border border-[#9cc0ff] bg-white px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[#1f5eff]">
                                      {formatUnreadCount(unreadCount)}
                                    </span>
                                  ) : null}
                                </div>

                                <p className="mt-1 truncate text-xs text-[#51627b]">
                                  {thread.last_message_preview || "Aucun aperçu"}
                                </p>

                                <p className="mt-1 text-[11px] text-[#8093ad]">
                                  {formatDateTime(thread.last_message_at)}
                                </p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="hub-card flex min-h-0 flex-col overflow-hidden">
                <div className="border-b border-[#d7e3f4] bg-[#f8fbff] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold text-[#0b1c33]">Messages</h2>
                    <div className="flex items-center gap-2">
                      {selectedThread ? (
                        <button
                          type="button"
                          onClick={() => setSelectedThreadId(null)}
                          className="inline-flex h-8 items-center justify-center rounded-xl border border-[#d7e3f4] bg-white px-3 text-[12px] font-medium text-[#334155] transition hover:border-[#9cc0ff] hover:bg-[#f3f8ff] focus:outline-none focus:ring-2 focus:ring-[#dce8ff]"
                        >
                          Fermer
                        </button>
                      ) : null}

                      {selectedThreadLinkedInUrl ? (
                        <button
                          type="button"
                          onClick={handleOpenSelectedThreadLinkedInProfile}
                          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-[#d7e3f4] bg-white px-3 text-[12px] font-medium text-[#334155] transition hover:border-[#9cc0ff] hover:bg-[#f3f8ff] focus:outline-none focus:ring-2 focus:ring-[#dce8ff]"
                        >
                          <Linkedin className="h-3.5 w-3.5" />
                          Voir profil
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>

                {!selectedThread ? (
                  <div className="p-6 text-sm text-[#51627b]">
                    Sélectionne une conversation pour afficher l’historique.
                  </div>
                ) : (
                  <>
                    <div
                      ref={messagesViewportRef}
                      className="min-h-0 flex-1 overflow-y-auto p-4"
                    >
                      {loadingMessages ? (
                        <div className="text-sm text-[#51627b]">Chargement des messages…</div>
                      ) : messages.length === 0 ? (
                        <div className="text-sm text-[#51627b]">
                          Aucun message dans ce thread.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {messages.map((message) => {
                            const raw = asObject(message.raw);
                            const isDeleted = raw.deleted === true;
                            const deliveryStatus =
                              typeof raw.delivery_status === "string"
                                ? raw.delivery_status.toLowerCase()
                                : null;
                            const statusLabel =
                              deliveryStatus === "read"
                                ? "Lu"
                                : deliveryStatus === "delivered"
                                  ? "Délivré"
                                  : null;
                            const outbound = String(message.direction).toLowerCase() === "outbound";

                            return (
                              <div
                                key={message.id}
                                className={[
                                  "max-w-[82%] rounded-2xl border px-3 py-2 text-sm",
                                  outbound
                                    ? "ml-auto border-[#9cc0ff] bg-[#edf5ff] text-[#14345e]"
                                    : "mr-auto border-[#d7e3f4] bg-[#f7fbff] text-[#1e3551]",
                                ].join(" ")}
                              >
                                <div className="mb-1 text-[11px] text-[#6a7f9f]">
                                  {message.sender_name || (outbound ? "Vous" : "Prospect")}
                                </div>

                                <div className="whitespace-pre-wrap">
                                  {isDeleted ? "Message supprimé" : message.text || "—"}
                                </div>

                                <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-[#7a8ea9]">
                                  <span>{formatDateTime(message.sent_at)}</span>
                                  <span>{statusLabel ?? ""}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="border-t border-[#d7e3f4] bg-[#f8fbff] p-3">
                      <div className="flex items-end gap-2">
                        <textarea
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          placeholder="Écrire une réponse..."
                          className="min-h-[72px] w-full rounded-xl border border-[#c8d6ea] bg-white px-3 py-2 text-sm text-[#0b1c33] placeholder-[#93a6c1] focus:border-[#9cc0ff] focus:outline-none focus:ring-2 focus:ring-[#dce8ff]"
                        />
                        <HubButton
                          type="button"
                          variant="primary"
                          onClick={handleSend}
                          disabled={sending || !draft.trim()}
                        >
                          {sending ? "Envoi..." : "Envoyer"}
                        </HubButton>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </SubscriptionGate>
  );
}
