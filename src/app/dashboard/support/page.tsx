"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { ArrowLeft, Loader2, Plus, Send } from "lucide-react";

import SubscriptionGate from "@/components/SubscriptionGate";
import MobileLayout from "@/components/mobile/MobileLayout";
import MobilePageHeader from "@/components/mobile/MobilePageHeader";
import MobileEmptyState from "@/components/mobile/MobileEmptyState";
import MobileSkeleton from "@/components/mobile/MobileSkeleton";
import { cn } from "@/lib/utils";

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

function sortConversations(conversations: SupportConversation[]): SupportConversation[] {
  return [...conversations].sort((a, b) => {
    const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return bTime - aTime;
  });
}

function sortMessages(messages: SupportMessage[]): SupportMessage[] {
  return [...messages].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return aTime - bTime;
  });
}

function statusLabel(status: string): string {
  if (status === "closed") return "Fermé";
  if (status === "reopened") return "Réouvert";
  return "Ouvert";
}

function statusChipClass(status: string): string {
  if (status === "closed") return "border-slate-300 bg-slate-100 text-slate-700";
  if (status === "reopened") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
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

function normalizeConversation(raw: Partial<SupportConversation> | null | undefined): SupportConversation | null {
  if (!raw?.id) return null;

  const parsedTicketNumber = Number(raw.ticket_number);
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

export default function SupportPage() {
  const { isLoaded, isSignedIn } = useUser();

  const [conversations, setConversations] = useState<SupportConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId]
  );

  const unreadCount = useMemo(
    () => conversations.reduce((accumulator, conversation) => accumulator + Number(conversation.unread_count ?? 0), 0),
    [conversations]
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
        if (!prev) return sortedRows[0]?.id ?? null;
        const exists = sortedRows.some((conversation) => conversation.id === prev);
        return exists ? prev : sortedRows[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement.");
    } finally {
      setLoadingConversations(false);
    }
  }, [isSignedIn]);

  const markConversationRead = useCallback(
    async (conversationId: string) => {
      await fetch("/api/support/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      }).catch(() => null);

      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId ? { ...conversation, unread_count: 0 } : conversation
        )
      );

      setMessages((prev) =>
        prev.map((message) =>
          message.sender_type === "support" && !message.read_at
            ? { ...message, read_at: new Date().toISOString() }
            : message
        )
      );
    },
    []
  );

  const loadMessages = useCallback(
    async (conversationId: string) => {
      setLoadingMessages(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/support/messages?conversationId=${encodeURIComponent(conversationId)}`,
          { cache: "no-store" }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error ?? "Impossible de charger les messages.");
        }

        const nextMessages = Array.isArray(data?.messages)
          ? (data.messages as SupportMessage[])
          : [];
        setMessages(sortMessages(nextMessages));
        await markConversationRead(conversationId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur de chargement des messages.");
        setMessages([]);
      } finally {
        setLoadingMessages(false);
      }
    },
    [markConversationRead]
  );

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
        throw new Error(data?.error ?? "Création du ticket impossible.");
      }

      const createdConversation = normalizeConversation(data?.conversation as Partial<SupportConversation>);
      if (!createdConversation) {
        throw new Error("Ticket support indisponible.");
      }

      setConversations((prev) => sortConversations([createdConversation, ...prev]));
      setSelectedConversationId(createdConversation.id);
      setMessages([]);
      await loadMessages(createdConversation.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de création du ticket.");
    } finally {
      setCreatingTicket(false);
    }
  };

  const handleSend = async () => {
    if (!selectedConversationId || sending) return;
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
        throw new Error(data?.error ?? "Impossible d’envoyer le message.");
      }

      const nextMessage = data?.message as SupportMessage | undefined;
      if (nextMessage) {
        setMessages((prev) => sortMessages([...prev, nextMessage]));
      }

      const nextConversation = normalizeConversation(data?.conversation as Partial<SupportConversation>);
      if (nextConversation) {
        setConversations((prev) =>
          sortConversations(
            prev.some((conversation) => conversation.id === nextConversation.id)
              ? prev.map((conversation) =>
                  conversation.id === nextConversation.id
                    ? { ...conversation, ...nextConversation }
                    : conversation
                )
              : [nextConversation, ...prev]
          )
        );
      }

      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur pendant l’envoi.");
    } finally {
      setSending(false);
    }
  };

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
    if (!selectedConversationId || !isSignedIn) return;

    const intervalId = window.setInterval(() => {
      void loadConversations();
      void loadMessages(selectedConversationId);
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [isSignedIn, loadConversations, loadMessages, selectedConversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  if (!isLoaded) {
    return (
      <SubscriptionGate supportEmail="contact@lidmeo.com">
        <div className="px-4 py-4 sm:px-6">
          <MobileLayout>
            <MobilePageHeader title="Support" subtitle="Chargement..." />
            <MobileSkeleton rows={7} />
          </MobileLayout>
        </div>
      </SubscriptionGate>
    );
  }

  return (
    <SubscriptionGate supportEmail="contact@lidmeo.com">
      <div className="h-full min-h-0 w-full px-4 py-4 sm:px-6">
        <MobileLayout className="gap-2">
          <MobilePageHeader
            title="Support"
            subtitle={
              selectedConversation
                ? `Ticket #${selectedConversation.ticket_number ?? "-"}`
                : `${conversations.length} ticket(s) · ${unreadCount} non lu(s)`
            }
          />

          {!isSignedIn ? (
            <MobileEmptyState
              title="Connexion requise"
              description="Connectez-vous pour échanger avec le support."
              action={
                <Link
                  href="/sign-in"
                  className="inline-flex items-center justify-center rounded-xl border border-[#1f5eff] bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#1e56d4]"
                >
                  Se connecter
                </Link>
              }
            />
          ) : selectedConversation ? (
            <>
              <div className="flex items-center justify-between gap-2 rounded-xl border border-[#d7e3f4] bg-white px-3 py-2">
                <button
                  type="button"
                  onClick={() => setSelectedConversationId(null)}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#d7e3f4] bg-[#f8fbff] px-2.5 text-[12px] text-[#4b647f]"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Fermer
                </button>
                <span
                  className={cn(
                    "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                    statusChipClass(selectedConversation.status)
                  )}
                >
                  {statusLabel(selectedConversation.status)}
                </span>
              </div>

              {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl border border-[#d7e3f4] bg-white px-3 py-3">
                {loadingMessages ? (
                  <MobileSkeleton rows={5} />
                ) : messages.length === 0 ? (
                  <MobileEmptyState
                    title="Aucun message"
                    description="Envoyez le premier message de ce ticket."
                  />
                ) : (
                  messages.map((message) => {
                    const isUser = message.sender_type === "user";
                    const senderLabel = isUser ? "Vous" : "Lidmeo Support";
                    return (
                      <div
                        key={message.id}
                        className={cn(
                          "max-w-[88%] rounded-2xl border px-3 py-2",
                          isUser
                            ? "ml-auto border-[#9bc1ff] bg-[#EAF2FF] text-[#0f2f61]"
                            : "mr-auto border-[#dce5f5] bg-[#f8fbff] text-[#0F172A]"
                        )}
                      >
                        <p className="mb-1 text-[11px] font-medium text-[#5f7693]">{senderLabel}</p>
                        <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{message.body}</p>
                        <p className="mt-1 text-right text-[10px] text-[#64748b]">
                          {formatDateLabel(message.created_at)}
                        </p>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              <div className="rounded-xl border border-[#d7e3f4] bg-white px-3 py-3 pb-[max(env(safe-area-inset-bottom),12px)]">
                <div className="flex items-end gap-2">
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    rows={2}
                    placeholder="Écrire votre message..."
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
                    title="Envoyer"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 rounded-xl border border-[#d7e3f4] bg-white px-3 py-2">
                <p className="text-[13px] font-medium text-[#0b1c33]">Mes tickets</p>
                <button
                  type="button"
                  onClick={() => void handleCreateTicket()}
                  disabled={creatingTicket}
                  className={cn(
                    "inline-flex h-8 items-center gap-1 rounded-lg border border-[#1f5eff] bg-[#2563EB] px-2.5 text-[11px] font-semibold text-white transition hover:bg-[#1e56d4]",
                    creatingTicket && "cursor-not-allowed opacity-70"
                  )}
                >
                  {creatingTicket ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Nouveau
                </button>
              </div>

              {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="space-y-2">
                {loadingConversations ? (
                  <MobileSkeleton rows={6} />
                ) : conversations.length === 0 ? (
                  <MobileEmptyState
                    title="Aucun ticket"
                    description="Créez un ticket pour discuter avec l&apos;équipe support."
                  />
                ) : (
                  conversations.map((conversation) => (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => setSelectedConversationId(conversation.id)}
                      className="w-full rounded-xl border border-[#d7e3f4] bg-white px-3 py-2 text-left shadow-[0_10px_18px_-18px_rgba(18,43,86,0.68)] transition hover:bg-[#f9fbff] focus:outline-none focus:ring-2 focus:ring-[#dce8ff]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-[#0b1c33]">
                            Ticket #{conversation.ticket_number ?? "-"}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[#64748b]">
                            Mis à jour le {formatDateLabel(conversation.last_message_at)}
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
                  ))
                )}
              </div>
            </>
          )}
        </MobileLayout>

        <div className="hidden md:block">
          <div className="mx-auto max-w-3xl rounded-2xl border border-[#d7e3f4] bg-white p-6 text-sm text-[#51627b]">
            Le widget support reste disponible sur desktop. Cette page est dédiée à l&apos;expérience mobile.
          </div>
        </div>
      </div>
    </SubscriptionGate>
  );
}
