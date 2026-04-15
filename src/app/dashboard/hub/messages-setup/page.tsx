"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mail,
  MessageSquare,
  Pencil,
  Send,
  Sparkles,
} from "lucide-react";
import { HubButton } from "@/components/ui/hub-button";
import { cn } from "@/lib/utils";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ParsedMessages = {
  message_linkedin: string;
  relance_linkedin: string;
  message_email: string;
};

type SavedMessages = {
  id: string;
  message_linkedin: string;
  relance_linkedin: string;
  message_email: string;
  status: "draft" | "submitted" | "active";
  updated_at: string | null;
};

type Screen = "loading" | "existing" | "chat" | "saved";

const WELCOME_MESSAGE =
  "Bonjour ! Je vais t'aider à créer tes messages de prospection LinkedIn et email. Je vais te poser quelques questions pour bien comprendre ton offre et ta cible. C'est parti ?";

function extractTag(raw: string, tag: string): string {
  const re = new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[/${tag}\\]`, "i");
  const m = raw.match(re);
  return m ? m[1].trim() : "";
}

function parseReply(raw: string): ParsedMessages | null {
  const linkedin = extractTag(raw, "MESSAGE_LINKEDIN");
  const relance = extractTag(raw, "RELANCE_LINKEDIN");
  const email = extractTag(raw, "EMAIL");
  if (!linkedin || !relance || !email) return null;
  return {
    message_linkedin: linkedin,
    relance_linkedin: relance,
    message_email: email,
  };
}

function stripTags(raw: string): string {
  return raw
    .replace(/\[MESSAGE_LINKEDIN\][\s\S]*?\[\/MESSAGE_LINKEDIN\]/gi, "")
    .replace(/\[RELANCE_LINKEDIN\][\s\S]*?\[\/RELANCE_LINKEDIN\]/gi, "")
    .replace(/\[EMAIL\][\s\S]*?\[\/EMAIL\]/gi, "")
    .trim();
}

function AiAvatar() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2563EB] to-[#1d4ed8] text-white shadow-sm">
      <Sparkles className="h-4 w-4" />
    </div>
  );
}

function MessageRow({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const parsed = !isUser ? parseReply(message.content) : null;
  const preamble = parsed ? stripTags(message.content) : message.content;

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-[#2563EB] px-4 py-2.5 text-sm text-white shadow-sm whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5">
      <AiAvatar />
      <div className="flex max-w-[85%] flex-col gap-2">
        {preamble ? (
          <div className="rounded-2xl rounded-tl-sm border border-[#e1e8f5] bg-white px-4 py-2.5 text-sm text-[#0b1c33] shadow-sm whitespace-pre-wrap">
            {preamble}
          </div>
        ) : null}
        {parsed ? <MessagesPreview parsed={parsed} /> : null}
      </div>
    </div>
  );
}

function MessagesPreview({ parsed }: { parsed: ParsedMessages }) {
  return (
    <div className="space-y-3 rounded-2xl rounded-tl-sm border border-[#c8d6ea] bg-white p-4 shadow-sm">
      <MessageBlock
        icon={<MessageSquare className="h-4 w-4 text-[#2563EB]" />}
        label="Message LinkedIn"
        sub={`${parsed.message_linkedin.length} car.`}
        content={parsed.message_linkedin}
      />
      <MessageBlock
        icon={<MessageSquare className="h-4 w-4 text-[#7c3aed]" />}
        label="Relance LinkedIn"
        sub={`${parsed.relance_linkedin.length} car.`}
        content={parsed.relance_linkedin}
      />
      <MessageBlock
        icon={<Mail className="h-4 w-4 text-[#0891b2]" />}
        label="Email de prospection"
        sub={`${parsed.message_email.length} car.`}
        content={parsed.message_email}
      />
    </div>
  );
}

function MessageBlock({
  icon,
  label,
  sub,
  content,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  content: string;
}) {
  return (
    <div className="rounded-xl border border-[#eef1f8] bg-[#fafcff] p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-xs font-semibold uppercase tracking-wide text-[#51627b]">
            {label}
          </span>
        </div>
        <span className="text-[11px] text-[#7a9abf]">{sub}</span>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#0b1c33]">
        {content}
      </p>
    </div>
  );
}

export default function MessagesSetupPage() {
  const router = useRouter();

  const [screen, setScreen] = useState<Screen>("loading");
  const [onboardingPending, setOnboardingPending] = useState(false);
  const [onboardingState, setOnboardingState] = useState<string | null>(null);
  const [existingMessages, setExistingMessages] = useState<SavedMessages | null>(null);

  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Charger l'état initial
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [msgRes, onbRes] = await Promise.all([
          fetch("/api/messages/get", { cache: "no-store" }),
          fetch("/api/onboarding/status", { cache: "no-store" }),
        ]);
        if (!mounted) return;

        let existing: SavedMessages | null = null;
        if (msgRes.ok) {
          const data = await msgRes.json();
          existing = (data?.messages ?? null) as SavedMessages | null;
          setExistingMessages(existing);
        }

        if (onbRes.ok) {
          const onbData = await onbRes.json();
          setOnboardingState(onbData?.state ?? null);
          const pending =
            onbData?.state === "linkedin_connected" ||
            onbData?.state === "icp_submitted";
          setOnboardingPending(Boolean(pending) && onbData?.completed !== true);
        }

        if (existing && existing.status === "submitted") {
          setScreen("existing");
        } else {
          setHistory([{ role: "assistant", content: WELCOME_MESSAGE }]);
          setScreen("chat");
        }
      } catch {
        setHistory([{ role: "assistant", content: WELCOME_MESSAGE }]);
        setScreen("chat");
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Auto-scroll vers le bas à chaque nouveau message
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [history, sending]);

  const latestAssistantWithMessages = useMemo(() => {
    for (let i = history.length - 1; i >= 0; i--) {
      const m = history[i];
      if (m.role !== "assistant") continue;
      const parsed = parseReply(m.content);
      if (parsed) return { index: i, parsed, raw: m.content };
    }
    return null;
  }, [history]);

  const sendMessage = useCallback(
    async (userText: string) => {
      setError(null);
      const trimmed = userText.trim();
      if (!trimmed || sending) return;

      const nextHistory: ChatMessage[] = [
        ...history,
        { role: "user", content: trimmed },
      ];
      setHistory(nextHistory);
      setInput("");
      setSending(true);

      try {
        const res = await fetch("/api/chat/messages-setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: nextHistory }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : "Erreur lors de la génération."
          );
        }
        const reply: string = typeof data?.reply === "string" ? data.reply : "";
        setHistory((prev) => [...prev, { role: "assistant", content: reply }]);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Impossible de contacter le serveur."
        );
      } finally {
        setSending(false);
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
    },
    [history, sending]
  );

  const handleValidate = useCallback(async () => {
    if (!latestAssistantWithMessages || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/messages/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistantReply: latestAssistantWithMessages.raw,
          history,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Erreur lors de la sauvegarde."
        );
      }
      if (onboardingPending) {
        router.replace("/");
        return;
      }
      setScreen("saved");
      // Refresh existing messages
      try {
        const refreshed = await fetch("/api/messages/get", { cache: "no-store" });
        if (refreshed.ok) {
          const d = await refreshed.json();
          setExistingMessages((d?.messages ?? null) as SavedMessages | null);
        }
      } catch {
        // silent
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossible de valider les messages."
      );
    } finally {
      setSaving(false);
    }
  }, [latestAssistantWithMessages, saving, onboardingPending, history, router]);

  const relaunchChat = useCallback(() => {
    setHistory([{ role: "assistant", content: WELCOME_MESSAGE }]);
    setInput("");
    setError(null);
    setScreen("chat");
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  const progressStep = useMemo(() => {
    if (!onboardingPending) return null;
    if (onboardingState === "icp_submitted") return 3;
    return 3;
  }, [onboardingPending, onboardingState]);

  return (
    <div className="min-h-screen bg-[#eef1f8]">
      {/* Header */}
      <div className="border-b border-[#c8d6ea] bg-white px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-[#0b1c33]">
              Configuration de vos messages
            </h1>
            <p className="mt-0.5 text-sm text-[#51627b]">
              Un échange avec l&apos;IA pour créer vos messages de prospection.
            </p>
          </div>
          {screen === "existing" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Validés
            </span>
          )}
        </div>

        {onboardingPending && progressStep && (
          <div className="mx-auto mt-4 max-w-3xl">
            <div className="mb-1.5 flex items-center justify-between text-xs text-[#51627b]">
              <span>Onboarding</span>
              <span>Étape {progressStep}/3</span>
            </div>
            <div className="flex gap-1.5">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-all",
                    i <= progressStep ? "bg-[#2563EB]" : "bg-[#c8d6ea]"
                  )}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Loading */}
      {screen === "loading" && (
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" />
        </div>
      )}

      {/* Saved confirmation */}
      {screen === "saved" && existingMessages && (
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-2xl border border-[#c8d6ea] bg-white p-8 text-center">
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-[#22c55e]" />
            <h2 className="text-xl font-bold text-[#0b1c33]">Messages enregistrés !</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-[#51627b]">
              Vos messages sont prêts. Notre équipe s&apos;en servira pour lancer votre
              prospection.
            </p>
          </div>
          <div className="mt-6">
            <SavedMessagesPanel messages={existingMessages} onEdit={relaunchChat} />
          </div>
        </div>
      )}

      {/* Existing messages — read mode with edit button */}
      {screen === "existing" && existingMessages && (
        <div className="mx-auto max-w-3xl px-4 py-8">
          <SavedMessagesPanel messages={existingMessages} onEdit={relaunchChat} />
        </div>
      )}

      {/* Chat */}
      {screen === "chat" && (
        <div className="mx-auto flex h-[calc(100vh-180px)] max-w-3xl flex-col px-4 py-6">
          <div
            ref={scrollRef}
            className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-[#c8d6ea] bg-[#f8fafc] p-5"
          >
            {history.map((m, i) => (
              <MessageRow key={i} message={m} />
            ))}
            {sending && (
              <div className="flex items-start gap-2.5">
                <AiAvatar />
                <div className="rounded-2xl rounded-tl-sm border border-[#e1e8f5] bg-white px-4 py-3 text-sm text-[#51627b] shadow-sm">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    L&apos;IA rédige…
                  </span>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {latestAssistantWithMessages && !saving && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[#9cc0ff] bg-[#edf4ff] px-4 py-3">
              <p className="text-sm text-[#1f4f96]">
                Les 3 messages sont prêts. Tu peux les ajuster en discutant, ou les
                valider maintenant.
              </p>
              <HubButton
                variant="primary"
                onClick={() => void handleValidate()}
                className="gap-2 whitespace-nowrap"
              >
                <CheckCircle2 className="h-4 w-4" />
                Valider mes messages
              </HubButton>
            </div>
          )}

          {saving && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#9cc0ff] bg-[#edf4ff] px-4 py-3 text-sm text-[#1f4f96]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Enregistrement en cours, génération du prompt technique…
            </div>
          )}

          <div className="mt-3 flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Écris ta réponse…"
              rows={2}
              disabled={sending}
              className="flex-1 resize-none rounded-2xl border border-[#c8d6ea] bg-white px-4 py-3 text-sm text-[#0b1c33] placeholder:text-[#a0b0c0] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
            />
            <HubButton
              variant="primary"
              onClick={() => void sendMessage(input)}
              disabled={sending || !input.trim()}
              className="h-11 w-11 shrink-0 p-0"
              aria-label="Envoyer"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </HubButton>
          </div>
        </div>
      )}
    </div>
  );
}

function SavedMessagesPanel({
  messages,
  onEdit,
}: {
  messages: SavedMessages;
  onEdit: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#c8d6ea] bg-white p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#0b1c33]">Vos messages actuels</h2>
            <p className="mt-0.5 text-xs text-[#51627b]">
              Utilisés pour votre prospection en cours.
            </p>
          </div>
          <HubButton variant="secondary" onClick={onEdit} className="gap-2">
            <Pencil className="h-4 w-4" />
            Modifier
          </HubButton>
        </div>
        <div className="space-y-3">
          <MessageBlock
            icon={<MessageSquare className="h-4 w-4 text-[#2563EB]" />}
            label="Message LinkedIn"
            sub={`${messages.message_linkedin.length} car.`}
            content={messages.message_linkedin}
          />
          <MessageBlock
            icon={<MessageSquare className="h-4 w-4 text-[#7c3aed]" />}
            label="Relance LinkedIn"
            sub={`${messages.relance_linkedin.length} car.`}
            content={messages.relance_linkedin}
          />
          <MessageBlock
            icon={<Mail className="h-4 w-4 text-[#0891b2]" />}
            label="Email de prospection"
            sub={`${messages.message_email.length} car.`}
            content={messages.message_email}
          />
        </div>
      </div>
    </div>
  );
}
