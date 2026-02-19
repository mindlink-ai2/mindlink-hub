"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import SubscriptionGate from "@/components/SubscriptionGate";
import { HubButton } from "@/components/ui/hub-button";

type InboxThread = {
  id: string;
  unipile_thread_id: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number | null;
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

export default function InboxPage() {
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [threads, selectedThreadId]
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
      setThreads(nextThreads);

      if (nextThreads.length === 0) {
        setSelectedThreadId(null);
        setMessages([]);
        return;
      }

      if (options?.keepSelected) {
        setSelectedThreadId((prev) => {
          if (!prev) return nextThreads[0].id;
          const stillExists = nextThreads.some((thread) => thread.id === prev);
          return stillExists ? prev : nextThreads[0].id;
        });
      } else {
        setSelectedThreadId((prev) => prev ?? nextThreads[0].id);
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
    if (!selectedThreadId) return;
    void loadMessages(selectedThreadId);
    void markThreadRead(selectedThreadId);
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

        return [...next].sort((a, b) => {
          const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
          const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
          return bTime - aTime;
        });
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

              <HubButton
                type="button"
                variant="primary"
                onClick={handleSync}
                disabled={syncing}
              >
                {syncing ? "Synchronisation..." : "Sync Inbox"}
              </HubButton>
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

              <div className="max-h-[70vh] overflow-y-auto p-3">
                {loadingThreads ? (
                  <div className="p-3 text-sm text-[#51627b]">Chargement des threads…</div>
                ) : threads.length === 0 ? (
                  <div className="p-3 text-sm text-[#51627b]">
                    Aucune conversation synchronisée pour le moment.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {threads.map((thread) => {
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
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate text-sm font-medium text-[#0b1c33]">
                              {thread.lead_linkedin_url
                                ? thread.lead_linkedin_url.replace(/^https?:\/\//, "")
                                : `Thread ${thread.unipile_thread_id}`}
                            </p>
                            {unreadCount > 0 ? (
                              <span className="rounded-full border border-[#9cc0ff] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#1f5eff]">
                                {unreadCount}
                              </span>
                            ) : null}
                          </div>

                          <p className="mt-1 truncate text-xs text-[#51627b]">
                            {thread.last_message_preview || "Aucun aperçu"}
                          </p>

                          <p className="mt-1 text-[11px] text-[#8093ad]">
                            {formatDateTime(thread.last_message_at)}
                          </p>
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
