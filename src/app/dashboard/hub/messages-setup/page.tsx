"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  Loader2,
  Mail,
  MessageSquare,
  Pencil,
  Send,
} from "lucide-react";
import { HubButton } from "@/components/ui/hub-button";
import { cn } from "@/lib/utils";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
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

// "sans_post" versions are the ones the client validates.
// "avec_post" versions are display-only.
type MessageKind = "linkedin_sans_post" | "relance_sans_post";

const ASSISTANT_NAME = "Assistant Lidmeo";

const WELCOME_MESSAGE =
  "Bonjour ! Je vais t'aider à créer tes messages de prospection LinkedIn. On commence ?";

function extractTag(raw: string, tag: string): string {
  const re = new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[/${tag}\\]`, "i");
  const m = raw.match(re);
  return m ? m[1].trim() : "";
}

function stripTags(raw: string): string {
  return raw
    .replace(/\[MESSAGE_LINKEDIN_AVEC_POST\][\s\S]*?\[\/MESSAGE_LINKEDIN_AVEC_POST\]/gi, "")
    .replace(/\[MESSAGE_LINKEDIN_SANS_POST\][\s\S]*?\[\/MESSAGE_LINKEDIN_SANS_POST\]/gi, "")
    .replace(/\[RELANCE_LINKEDIN_AVEC_POST\][\s\S]*?\[\/RELANCE_LINKEDIN_AVEC_POST\]/gi, "")
    .replace(/\[RELANCE_LINKEDIN_SANS_POST\][\s\S]*?\[\/RELANCE_LINKEDIN_SANS_POST\]/gi, "")
    // Legacy tags kept for backward compatibility
    .replace(/\[MESSAGE_LINKEDIN\][\s\S]*?\[\/MESSAGE_LINKEDIN\]/gi, "")
    .replace(/\[RELANCE_LINKEDIN\][\s\S]*?\[\/RELANCE_LINKEDIN\]/gi, "")
    .replace(/\[EMAIL\][\s\S]*?\[\/EMAIL\]/gi, "")
    .trim();
}

function AssistantAvatar() {
  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#1f5eff] text-[10px] font-bold tracking-tight text-white shadow-[0_10px_18px_-12px_rgba(31,94,255,0.9)]"
      style={{
        background: "linear-gradient(135deg, #1f5eff 0%, #2f70ff 55%, #1254ec 100%)",
      }}
      aria-label="Assistant Lidmeo"
      title="Assistant Lidmeo"
    >
      LM
    </div>
  );
}

// ── Read-only card (version avec post) ──────────────────────────────────────

function ReadOnlyMessageCard({
  label,
  content,
  maxChars,
}: {
  label: string;
  content: string;
  maxChars: number;
}) {
  const overLimit = content.length > maxChars;
  return (
    <div className="rounded-2xl rounded-tl-sm border border-[#dde6f5] bg-[#f8faff] p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Eye className="h-4 w-4 text-[#7a9abf]" />
          <span className="text-xs font-semibold uppercase tracking-wide text-[#7a9abf]">
            {label}
          </span>
        </div>
        <span
          className={cn(
            "text-[11px]",
            overLimit ? "font-semibold text-red-500" : "text-[#a0b8d0]"
          )}
        >
          {content.length}/{maxChars} car.
        </span>
      </div>
      <div className="rounded-xl border border-[#e8eef8] bg-white/70 p-3">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#3a5070]">
          {content}
        </p>
      </div>
      <p className="mt-2 text-[11px] text-[#a0b8d0]">
        Utilisée automatiquement quand un post pertinent est détecté chez le prospect.
      </p>
    </div>
  );
}

// ── Validatable card (version sans post) ────────────────────────────────────

function ValidatableMessageCard({
  kind,
  label,
  content,
  maxChars,
  validatedText,
  onValidate,
  canValidate,
}: {
  kind: MessageKind;
  label: string;
  content: string;
  maxChars: number;
  validatedText: string | null;
  onValidate: (kind: MessageKind, text: string) => void;
  canValidate: boolean;
}) {
  const isValidated = validatedText === content;
  const overLimit = content.length > maxChars;

  return (
    <div className="rounded-2xl rounded-tl-sm border border-[#c8d6ea] bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <MessageSquare
            className={cn(
              "h-4 w-4",
              kind === "linkedin_sans_post" ? "text-[#2563EB]" : "text-[#7c3aed]"
            )}
          />
          <span className="text-xs font-semibold uppercase tracking-wide text-[#51627b]">
            {label}
          </span>
        </div>
        <span
          className={cn(
            "text-[11px]",
            overLimit ? "font-semibold text-red-600" : "text-[#7a9abf]"
          )}
        >
          {content.length}/{maxChars} car.
        </span>
      </div>
      <div className="rounded-xl border border-[#eef1f8] bg-[#fafcff] p-3">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#0b1c33]">
          {content}
        </p>
      </div>
      <div className="mt-2.5 flex items-center justify-between">
        <p className="text-[11px] text-[#7a9abf]">
          Version de référence principale.
        </p>
        {isValidated ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Validé
          </span>
        ) : canValidate ? (
          <HubButton
            variant="primary"
            size="sm"
            onClick={() => onValidate(kind, content)}
            className="gap-1.5"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Je valide ce message
          </HubButton>
        ) : null}
      </div>
    </div>
  );
}

// ── Message pair (avec post + sans post) ────────────────────────────────────

type MessagePairProps = {
  avecPostContent: string;
  sansPostContent: string;
  avecPostLabel: string;
  sansPostLabel: string;
  maxChars: number;
  kind: MessageKind;
  validatedText: string | null;
  onValidate: (kind: MessageKind, text: string) => void;
  canValidate: boolean;
};

function MessagePair({
  avecPostContent,
  sansPostContent,
  avecPostLabel,
  sansPostLabel,
  maxChars,
  kind,
  validatedText,
  onValidate,
  canValidate,
}: MessagePairProps) {
  return (
    <div className="flex flex-col gap-2 sm:grid sm:grid-cols-2">
      {avecPostContent ? (
        <ReadOnlyMessageCard
          label={avecPostLabel}
          content={avecPostContent}
          maxChars={maxChars}
        />
      ) : (
        // Placeholder column when avec-post is missing (keeps grid balanced)
        <div />
      )}
      {sansPostContent ? (
        <ValidatableMessageCard
          kind={kind}
          label={sansPostLabel}
          content={sansPostContent}
          maxChars={maxChars}
          validatedText={validatedText}
          onValidate={onValidate}
          canValidate={canValidate}
        />
      ) : null}
    </div>
  );
}

// ── Full message row ─────────────────────────────────────────────────────────

type MessageRowProps = {
  message: ChatMessage;
  onValidate: (kind: MessageKind, text: string) => void;
  validatedLinkedin: string | null;
  validatedRelance: string | null;
  isLatestAssistant: boolean;
  sending: boolean;
};

function MessageRow({
  message,
  onValidate,
  validatedLinkedin,
  validatedRelance,
  isLatestAssistant,
  sending,
}: MessageRowProps) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-[#2563EB] px-4 py-2.5 text-sm text-white shadow-sm whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  const linkedinAvecPost = extractTag(message.content, "MESSAGE_LINKEDIN_AVEC_POST");
  const linkedinSansPost = extractTag(message.content, "MESSAGE_LINKEDIN_SANS_POST");
  const relanceAvecPost = extractTag(message.content, "RELANCE_LINKEDIN_AVEC_POST");
  const relanceSansPost = extractTag(message.content, "RELANCE_LINKEDIN_SANS_POST");
  const preamble = stripTags(message.content);

  const hasLinkedinPair = linkedinAvecPost || linkedinSansPost;
  const hasRelancePair = relanceAvecPost || relanceSansPost;

  return (
    <div className="flex items-start gap-2.5">
      <AssistantAvatar />
      <div className="flex w-full max-w-[calc(100%-2.5rem)] flex-col gap-3">
        {preamble ? (
          <div className="rounded-2xl border border-[#e1e8f5] bg-white px-4 py-2.5 text-sm text-[#0b1c33] shadow-sm whitespace-pre-wrap">
            {preamble}
          </div>
        ) : null}

        {hasLinkedinPair ? (
          <MessagePair
            avecPostContent={linkedinAvecPost}
            sansPostContent={linkedinSansPost}
            avecPostLabel="Version 1 — Si le prospect a posté un contenu pertinent"
            sansPostLabel="Version 2 — Si le prospect n'a rien posté d'exploitable"
            maxChars={250}
            kind="linkedin_sans_post"
            validatedText={validatedLinkedin}
            onValidate={onValidate}
            canValidate={isLatestAssistant && !sending}
          />
        ) : null}

        {hasRelancePair ? (
          <MessagePair
            avecPostContent={relanceAvecPost}
            sansPostContent={relanceSansPost}
            avecPostLabel="Relance V1 — Si le prospect a posté"
            sansPostLabel="Relance V2 — Sans post exploitable"
            maxChars={150}
            kind="relance_sans_post"
            validatedText={validatedRelance}
            onValidate={onValidate}
            canValidate={isLatestAssistant && !sending}
          />
        ) : null}
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

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

  const [validatedLinkedin, setValidatedLinkedin] = useState<string | null>(null);
  const [validatedRelance, setValidatedRelance] = useState<string | null>(null);
  const [workflowJustCreated, setWorkflowJustCreated] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [history, sending]);

  const latestAssistantIndex = useMemo(() => {
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === "assistant") return i;
    }
    return -1;
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

  const handleValidateMessage = useCallback(
    (kind: MessageKind, text: string) => {
      if (kind === "linkedin_sans_post") {
        setValidatedLinkedin(text);
        void sendMessage(
          "Parfait, je valide la version sans post. Génère maintenant la relance."
        );
      } else {
        setValidatedRelance(text);
        void sendMessage("Parfait, la relance me va aussi.");
      }
    },
    [sendMessage]
  );

  const handleFinalize = useCallback(async () => {
    if (!validatedLinkedin || !validatedRelance || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/messages/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageLinkedin: validatedLinkedin,
          relanceLinkedin: validatedRelance,
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
      if (data?.workflowCreated === true) {
        setWorkflowJustCreated(true);
      }
      if (onboardingPending) {
        router.replace("/onboarding/video");
        return;
      }
      setScreen("saved");
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
  }, [validatedLinkedin, validatedRelance, saving, onboardingPending, history, router]);

  const relaunchChat = useCallback(() => {
    setHistory([{ role: "assistant", content: WELCOME_MESSAGE }]);
    setInput("");
    setError(null);
    setValidatedLinkedin(null);
    setValidatedRelance(null);
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

  const canFinalize = Boolean(validatedLinkedin && validatedRelance);

  return (
    <div className="min-h-screen bg-[#eef1f8]">
      <div className="border-b border-[#c8d6ea] bg-white px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-[#0b1c33]">
              {screen === "existing" || screen === "saved"
                ? "Vos messages LinkedIn"
                : "Créons vos messages de prospection"}
            </h1>
            <p className="mt-0.5 text-sm text-[#51627b]">
              {screen === "existing" || screen === "saved"
                ? "Vos messages validés pour la prospection."
                : "L\u2019Assistant Lidmeo vous aide à créer vos messages."}
            </p>
          </div>
          {(screen === "existing" || screen === "saved") && (
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

      {screen === "saved" && existingMessages && (
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-2xl border border-[#c8d6ea] bg-white p-8 text-center">
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-[#22c55e]" />
            <h2 className="text-xl font-bold text-[#0b1c33]">Messages enregistrés !</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-[#51627b]">
              Tes messages sont prêts. Notre équipe s&apos;en servira pour lancer ta
              prospection.
            </p>
            {workflowJustCreated && (
              <p className="mx-auto mt-3 max-w-md text-xs text-[#7a9abf]">
                Vos leads seront traités automatiquement entre 7h et 8h chaque matin.
              </p>
            )}
          </div>
          <div className="mt-6">
            <SavedMessagesPanel messages={existingMessages} onEdit={relaunchChat} />
          </div>
        </div>
      )}

      {screen === "existing" && existingMessages && (
        <div className="mx-auto max-w-3xl px-4 py-8">
          <SavedMessagesPanel messages={existingMessages} onEdit={relaunchChat} />
        </div>
      )}

      {screen === "chat" && (
        <div className="mx-auto flex h-[calc(100vh-180px)] max-w-3xl flex-col px-4 py-6">
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-[#1e3a8a]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#2563EB]" />
            <p>
              L&apos;Assistant Lidmeo vous aide à rédiger deux messages LinkedIn (premier contact
              et relance). L&apos;email de prospection sera généré automatiquement. Une fois validés,
              vos messages seront utilisés pour contacter les leads extraits.
            </p>
          </div>
          <div
            ref={scrollRef}
            className={cn(
              "flex-1 overflow-y-auto rounded-2xl border border-[#c8d6ea] bg-[#f8fafc] p-5",
              history.length <= 3 && !sending
                ? "flex flex-col justify-center space-y-4"
                : "space-y-4"
            )}
          >
            {history.map((m, i) => (
              <MessageRow
                key={i}
                message={m}
                onValidate={handleValidateMessage}
                validatedLinkedin={validatedLinkedin}
                validatedRelance={validatedRelance}
                isLatestAssistant={i === latestAssistantIndex}
                sending={sending}
              />
            ))}
            {sending && (
              <div className="flex items-start gap-2.5">
                <AssistantAvatar />
                <div className="rounded-2xl border border-[#e1e8f5] bg-white px-4 py-3 text-sm text-[#51627b] shadow-sm">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {ASSISTANT_NAME} rédige…
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

          {canFinalize && !saving && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[#9cc0ff] bg-[#edf4ff] px-4 py-3">
              <p className="text-sm text-[#1f4f96]">
                Tes deux messages sont validés. L&apos;email sera généré automatiquement.
              </p>
              <HubButton
                variant="primary"
                onClick={() => void handleFinalize()}
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
              Enregistrement, génération de l&apos;email et du prompt technique en cours…
            </div>
          )}

          <div className="mt-3">
            <div className="flex items-end gap-2">
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
              <button
                type="button"
                onClick={() => void sendMessage(input)}
                disabled={sending || !input.trim()}
                className="shrink-0 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2563EB] text-white disabled:opacity-40 hover:bg-[#1d4ed8] transition-colors"
                aria-label="Envoyer"
              >
                {sending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </button>
            </div>
            <p className="mt-1.5 text-center text-[11px] text-[#a0b0c0]">
              Appuyez sur Entrée pour envoyer
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Saved messages display ───────────────────────────────────────────────────

function SavedMessagesPanel({
  messages,
  onEdit,
}: {
  messages: SavedMessages;
  onEdit: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <SavedMessageBlock
          icon={<MessageSquare className="h-4 w-4 text-[#2563EB]" />}
          label="Message LinkedIn"
          sub={`${messages.message_linkedin.length} car.`}
          content={messages.message_linkedin}
          showBadge
        />
        <SavedMessageBlock
          icon={<MessageSquare className="h-4 w-4 text-[#7c3aed]" />}
          label="Relance LinkedIn"
          sub={`${messages.relance_linkedin.length} car.`}
          content={messages.relance_linkedin}
          showBadge
        />
        <SavedMessageBlock
          icon={<Mail className="h-4 w-4 text-[#0891b2]" />}
          label="Email de prospection (généré automatiquement)"
          sub={`${messages.message_email.length} car.`}
          content={messages.message_email}
          showBadge
        />
      </div>
      <div className="flex justify-center">
        <HubButton variant="secondary" onClick={onEdit} className="gap-2">
          <Pencil className="h-4 w-4" />
          Modifier mes messages
        </HubButton>
      </div>
    </div>
  );
}

function SavedMessageBlock({
  icon,
  label,
  sub,
  content,
  showBadge,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  content: string;
  showBadge?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[#c8d6ea] bg-white p-5 shadow-sm">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-xs font-semibold uppercase tracking-wide text-[#51627b]">
            {label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#7a9abf]">{sub}</span>
          {showBadge && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
              <CheckCircle2 className="h-3 w-3" />
              Validé
            </span>
          )}
        </div>
      </div>
      <div className="rounded-xl border border-[#eef1f8] bg-[#fafcff] p-3">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#0b1c33]">
          {content}
        </p>
      </div>
    </div>
  );
}
