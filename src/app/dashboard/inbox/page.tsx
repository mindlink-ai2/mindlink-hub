"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import SubscriptionGate from "@/components/SubscriptionGate";
import { HubButton } from "@/components/ui/hub-button";
import { supabase } from "@/lib/supabase";

type InboxThread = {
  id: string;
  unipile_thread_id: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number | null;
  contact_name: string | null;
  contact_linkedin_url: string | null;
  contact_avatar_url: string | null;
  lead_linkedin_url: string | null;
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
  const [backfilling, setBackfilling] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [threadSearch, setThreadSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [threads, selectedThreadId]
  );

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
    setLoadingMessages(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/inbox/messages?threadDbId=${encodeURIComponent(threadDbId)}`,
        { cache: "no-store" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Impossible de charger les messages.");

      setMessages(Array.isArray(data?.messages) ? (data.messages as InboxMessage[]) : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement des messages.");
      setMessages([]);
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
    void loadMessages(selectedThreadId);
    void markThreadRead(selectedThreadId);
  }, [selectedThreadId]);

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
            const without = prev.filter((thread) => thread.id !== realtimeThread.id);
            return sortThreadsByLastMessage([...without, realtimeThread]);
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

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setError(null);

    try {
      const res = await fetch("/api/inbox/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error ?? "La synchronisation a échoué.");
      }

      await loadThreads({ keepSelected: true });
      if (selectedThreadId) {
        await loadMessages(selectedThreadId);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur pendant la synchronisation.");
    } finally {
      setSyncing(false);
    }
  };

  const handleBackfillNames = async () => {
    if (backfilling) return;
    setBackfilling(true);
    setError(null);

    try {
      const res = await fetch("/api/inbox/backfill-contact-names", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error ?? "Le backfill des noms a échoué.");
      }

      await loadThreads({ keepSelected: true });
      if (selectedThreadId) {
        await loadMessages(selectedThreadId);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur pendant le backfill des noms.");
    } finally {
      setBackfilling(false);
    }
  };

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

  return (
    <SubscriptionGate supportEmail="contact@lidmeo.com">
      <div className="min-h-screen px-4 pb-20 pt-8 sm:px-6">
        <div className="mx-auto w-full max-w-[1680px] space-y-6">
          <section className="hub-card-hero p-6 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-[#0b1c33] sm:text-4xl">
                  Inbox LinkedIn
                </h1>
                <p className="mt-2 text-sm text-[#51627b]">
                  Conversations synchronisées via Unipile. Les messages entrants et sortants
                  sont historisés automatiquement.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <HubButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleMarkAllRead}
                  disabled={markingAllRead || syncing || backfilling}
                >
                  {markingAllRead ? "Marquage..." : "Marquer tout comme lu"}
                </HubButton>
                <HubButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleBackfillNames}
                  disabled={backfilling || syncing || markingAllRead}
                >
                  {backfilling ? "Backfill..." : "Backfill names"}
                </HubButton>
                <HubButton
                  type="button"
                  variant="primary"
                  onClick={handleSync}
                  disabled={syncing || backfilling || markingAllRead}
                >
                  {syncing ? "Synchronisation..." : "Sync Inbox"}
                </HubButton>
              </div>
            </div>

            {error ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}
          </section>

          <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
            <div className="hub-card overflow-hidden">
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

              <div className="max-h-[70vh] overflow-y-auto p-3">
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
                          onClick={() => setSelectedThreadId(thread.id)}
                          className={[
                            "w-full rounded-xl border px-3 py-3 text-left transition",
                            active
                              ? "border-[#9cc0ff] bg-[#eef5ff]"
                              : "border-[#d7e3f4] bg-[#f7fbff] hover:border-[#b9d0f2]",
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
                                  <span className="rounded-full border border-[#9cc0ff] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#1f5eff]">
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

            <div className="hub-card overflow-hidden">
              <div className="border-b border-[#d7e3f4] bg-[#f8fbff] px-4 py-3">
                <h2 className="text-sm font-semibold text-[#0b1c33]">Messages</h2>
              </div>

              {!selectedThread ? (
                <div className="p-6 text-sm text-[#51627b]">
                  Sélectionne une conversation pour afficher l’historique.
                </div>
              ) : (
                <>
                  <div className="max-h-[58vh] overflow-y-auto p-4">
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
    </SubscriptionGate>
  );
}
