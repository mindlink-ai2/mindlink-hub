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
  PenLine,
  Pencil,
  RotateCcw,
  Send,
  Sparkles,
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

type SetupMode = "chat" | "manual";

const MANUAL_MESSAGE_PLACEHOLDER = `Hello "Claire",

Vous évoquiez récemment l'activation de votre partenariat sportif. La production du contenu autour de ce type de projet, c'est souvent ce qui fait la différence entre une activation qui marque et une qui passe inaperçue.

WHEESPER Prod. accompagne depuis 15 ans des marques comme Red Bull, Betclic et Renault dans la production de leurs contenus sportifs. De la stratégie à la post-production.

Ouvert à en parler 10 min ?`;

const MANUAL_RELANCE_PLACEHOLDER = `Hello "Claire", on m'a confirmé qu'aucune réponse n'était passée. Toujours pertinent d'en discuter 10 min ?`;

// "sans_post" versions are the ones the client validates.
// "avec_post" versions are display-only.
type MessageKind = "linkedin_sans_post" | "relance_sans_post";

const ASSISTANT_NAME = "Assistant Lidmeo";

const WELCOME_MESSAGE = `Bonjour ! Je vais t'aider à créer tes messages de prospection LinkedIn.

Question 1 — Douleur

Quel est le problème concret et précis que vivent tes clients idéaux en ce moment, et qui les pousserait à te répondre si tu leur en parlais ?

Prends quelques secondes, et essaie de me le formuler avec un moment précis, un chiffre, ou une situation que ton client pourrait raconter lui-même.`;

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

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 2) return "il y a quelques instants";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "hier";
  return `il y a ${days} jours`;
}

function restoreValidatedState(history: ChatMessage[]): {
  validatedLinkedin: string | null;
  validatedRelance: string | null;
} {
  let validatedLinkedin: string | null = null;
  let validatedRelance: string | null = null;

  const linkedinValIdx = history.findLastIndex(
    (m) => m.role === "user" && m.content.includes("je valide la version sans post")
  );
  if (linkedinValIdx > 0) {
    for (let i = linkedinValIdx - 1; i >= 0; i--) {
      if (history[i].role === "assistant") {
        const tag = extractTag(history[i].content, "MESSAGE_LINKEDIN_SANS_POST");
        if (tag) { validatedLinkedin = tag; break; }
      }
    }
  }

  const relanceValIdx = history.findLastIndex(
    (m) => m.role === "user" && m.content.includes("la relance me va aussi")
  );
  if (relanceValIdx > 0) {
    for (let i = relanceValIdx - 1; i >= 0; i--) {
      if (history[i].role === "assistant") {
        const tag = extractTag(history[i].content, "RELANCE_LINKEDIN_SANS_POST");
        if (tag) { validatedRelance = tag; break; }
      }
    }
  }

  return { validatedLinkedin, validatedRelance };
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
  return (
    <div className="rounded-2xl rounded-tl-sm border border-[#dde6f5] bg-[#f8faff] p-4">
      <div className="mb-2 flex items-center gap-1.5">
        <Eye className="h-4 w-4 text-[#7a9abf]" />
        <span className="text-xs font-semibold uppercase tracking-wide text-[#7a9abf]">
          {label}
        </span>
      </div>
      <div className="rounded-xl border border-[#e8eef8] bg-white/70 p-3">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#3a5070]">
          {content}
        </p>
      </div>
      <p className="mt-2 text-[11px] text-[#a0b8d0]">
        Cette version se déclenche automatiquement quand notre IA détecte un post récent pertinent chez le prospect. Tu la valides en validant la version 2 (les 2 vont ensemble).
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

  return (
    <div className="rounded-2xl rounded-tl-sm border border-[#c8d6ea] bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-1.5">
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
      <div className="rounded-xl border border-[#eef1f8] bg-[#fafcff] p-3">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#0b1c33]">
          {content}
        </p>
      </div>
      <div className="mt-2.5 flex flex-col gap-2">
        <p className="text-[11px] text-[#7a9abf]">
          En validant ce message, tu valides aussi la version du dessus. Les 2 versions partagent le même positionnement.
        </p>
        <div className="flex items-center justify-end">
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
    <div className="flex flex-col gap-2">
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
            avecPostLabel="Version utilisée si le prospect a un post pertinent"
            sansPostLabel="Version principale — à valider"
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

  // Manual mode state — kept independently of the chat state so that
  // switching tabs doesn't lose the work in progress in either mode.
  const [mode, setMode] = useState<SetupMode>("chat");
  const [manualMessage, setManualMessage] = useState("");
  const [manualRelance, setManualRelance] = useState("");
  const [generatingRelance, setGeneratingRelance] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const [draftDialog, setDraftDialog] = useState(false);
  const [draftHistory, setDraftHistory] = useState<ChatMessage[] | null>(null);
  const [draftUpdatedAt, setDraftUpdatedAt] = useState<string | null>(null);
  const [confirmRestart, setConfirmRestart] = useState(false);

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
          return;
        }

        // Check for an in-progress draft to offer resumption
        try {
          const draftRes = await fetch("/api/messages/draft", { cache: "no-store" });
          if (mounted && draftRes.ok) {
            const draftData = await draftRes.json();
            const draft = draftData?.draft as {
              conversation_history: ChatMessage[];
              updated_at: string;
            } | null;
            if (
              draft &&
              Array.isArray(draft.conversation_history) &&
              draft.conversation_history.length > 1
            ) {
              setDraftHistory(draft.conversation_history);
              setDraftUpdatedAt(draft.updated_at ?? null);
              setDraftDialog(true);
              setScreen("chat");
              return;
            }
          }
        } catch {
          // silent — fall through to fresh start
        }

        if (mounted) {
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
          mode: "chat",
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

  const handleResumeDraft = useCallback(() => {
    if (!draftHistory) return;
    const { validatedLinkedin: vl, validatedRelance: vr } = restoreValidatedState(draftHistory);
    setHistory(draftHistory);
    if (vl) setValidatedLinkedin(vl);
    if (vr) setValidatedRelance(vr);
    setDraftDialog(false);
  }, [draftHistory]);

  const handleDiscardDraft = useCallback(async () => {
    setDraftDialog(false);
    void fetch("/api/messages/draft", { method: "DELETE" });
    setHistory([{ role: "assistant", content: WELCOME_MESSAGE }]);
  }, []);

  const handleConfirmRestart = useCallback(async () => {
    setConfirmRestart(false);
    void fetch("/api/messages/draft", { method: "DELETE" });
    setHistory([{ role: "assistant", content: WELCOME_MESSAGE }]);
    setInput("");
    setError(null);
    setValidatedLinkedin(null);
    setValidatedRelance(null);
  }, []);

  const relaunchChat = useCallback(() => {
    setHistory([{ role: "assistant", content: WELCOME_MESSAGE }]);
    setInput("");
    setError(null);
    setValidatedLinkedin(null);
    setValidatedRelance(null);
    setScreen("chat");
  }, []);

  const handleGenerateRelance = useCallback(async () => {
    const trimmed = manualMessage.trim();
    if (trimmed.length < 30 || generatingRelance) return;
    setGeneratingRelance(true);
    setManualError(null);
    try {
      const res = await fetch("/api/messages/generate-relance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageLinkedin: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Erreur lors de la génération."
        );
      }
      const relance: string = typeof data?.relance === "string" ? data.relance : "";
      if (!relance) throw new Error("Relance vide.");
      setManualRelance(relance);
    } catch (err) {
      setManualError(
        err instanceof Error ? err.message : "Impossible de générer la relance."
      );
    } finally {
      setGeneratingRelance(false);
    }
  }, [manualMessage, generatingRelance]);

  const handleFinalizeManual = useCallback(async () => {
    const m = manualMessage.trim();
    const r = manualRelance.trim();
    if (!m || !r || saving) return;
    setSaving(true);
    setManualError(null);
    setError(null);
    try {
      const res = await fetch("/api/messages/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageLinkedin: m,
          relanceLinkedin: r,
          history: [],
          mode: "manual",
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
      setManualError(
        err instanceof Error ? err.message : "Impossible de valider les messages."
      );
    } finally {
      setSaving(false);
    }
  }, [manualMessage, manualRelance, saving, onboardingPending, router]);

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
          {screen === "chat" && (
            <button
              type="button"
              onClick={() => setConfirmRestart(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#c8d6ea] bg-white px-3 py-1.5 text-xs text-[#51627b] hover:border-[#a0b8d0] hover:text-[#0b1c33] transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Recommencer
            </button>
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

      {/* Draft resume dialog */}
      {draftDialog && draftHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-[#c8d6ea] bg-white p-6 shadow-xl">
            <h2 className="text-base font-bold text-[#0b1c33]">Conversation en cours</h2>
            <p className="mt-2 text-sm text-[#51627b]">
              Tu as un brouillon en cours
              {draftUpdatedAt ? ` (${formatRelativeTime(draftUpdatedAt)})` : ""}.
              Tu veux reprendre là où tu étais, ou recommencer depuis le début ?
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <HubButton variant="primary" onClick={handleResumeDraft} className="w-full justify-center">
                Reprendre
              </HubButton>
              <HubButton variant="secondary" onClick={() => void handleDiscardDraft()} className="w-full justify-center">
                Recommencer depuis le début
              </HubButton>
            </div>
          </div>
        </div>
      )}

      {/* Confirm restart dialog */}
      {confirmRestart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-[#c8d6ea] bg-white p-6 shadow-xl">
            <h2 className="text-base font-bold text-[#0b1c33]">Recommencer ?</h2>
            <p className="mt-2 text-sm text-[#51627b]">
              Tu vas perdre la conversation en cours. Cette action est irréversible.
            </p>
            <div className="mt-5 flex gap-2">
              <HubButton variant="secondary" onClick={() => setConfirmRestart(false)} className="flex-1 justify-center">
                Annuler
              </HubButton>
              <HubButton variant="primary" onClick={() => void handleConfirmRestart()} className="flex-1 justify-center">
                Oui, recommencer
              </HubButton>
            </div>
          </div>
        </div>
      )}

      {screen === "chat" && (
        <div className="mx-auto flex h-[calc(100vh-180px)] max-w-3xl flex-col px-4 py-6">
          <ModeTabs mode={mode} onChange={setMode} />

          {mode === "chat" ? (
            <>
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
                    disabled={sending || draftDialog}
                    className="flex-1 resize-none rounded-2xl border border-[#c8d6ea] bg-white px-4 py-3 text-sm text-[#0b1c33] placeholder:text-[#a0b0c0] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                  <button
                    type="button"
                    onClick={() => void sendMessage(input)}
                    disabled={sending || draftDialog || !input.trim()}
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
            </>
          ) : (
            <ManualEditor
              message={manualMessage}
              relance={manualRelance}
              onChangeMessage={setManualMessage}
              onChangeRelance={setManualRelance}
              onGenerateRelance={handleGenerateRelance}
              onSubmit={handleFinalizeManual}
              generatingRelance={generatingRelance}
              saving={saving}
              error={manualError}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Mode tabs ────────────────────────────────────────────────────────────────

function ModeTabs({
  mode,
  onChange,
}: {
  mode: SetupMode;
  onChange: (m: SetupMode) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Mode de configuration des messages"
      className="mb-3 inline-flex items-center gap-1 rounded-2xl border border-[#c8d6ea] bg-white p-1 shadow-sm self-start"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "chat"}
        onClick={() => onChange("chat")}
        className={cn(
          "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all",
          mode === "chat"
            ? "bg-[#2563EB] text-white shadow-sm"
            : "text-[#51627b] hover:bg-[#f1f5fb]"
        )}
      >
        <MessageSquare className="h-4 w-4" />
        Avec l&apos;assistant
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "manual"}
        onClick={() => onChange("manual")}
        className={cn(
          "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all",
          mode === "manual"
            ? "bg-[#2563EB] text-white shadow-sm"
            : "text-[#51627b] hover:bg-[#f1f5fb]"
        )}
      >
        <PenLine className="h-4 w-4" />
        J&apos;écris moi-même
      </button>
    </div>
  );
}

// ── Manual editor ────────────────────────────────────────────────────────────

const MANUAL_MESSAGE_MAX = 350;
const MANUAL_RELANCE_MAX = 200;

function ManualEditor({
  message,
  relance,
  onChangeMessage,
  onChangeRelance,
  onGenerateRelance,
  onSubmit,
  generatingRelance,
  saving,
  error,
}: {
  message: string;
  relance: string;
  onChangeMessage: (v: string) => void;
  onChangeRelance: (v: string) => void;
  onGenerateRelance: () => void;
  onSubmit: () => void;
  generatingRelance: boolean;
  saving: boolean;
  error: string | null;
}) {
  const messageReady = message.trim().length >= 30;
  const relanceReady = relance.trim().length >= 10;
  const canSubmit = messageReady && relanceReady && !saving;
  const messageOver = message.length > MANUAL_MESSAGE_MAX;
  const relanceOver = relance.length > MANUAL_RELANCE_MAX;

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto pr-1">
      <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-[#1e3a8a]">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#2563EB]" />
        <p>
          Écris toi-même ton message LinkedIn d&apos;ouverture et ta relance. Utilise un prénom
          et une entreprise concrets dans le texte (ex : <em>Hello &quot;Claire&quot;, chez
          &quot;Decathlon&quot;…</em>) — nous remplacerons automatiquement par les variables
          côté technique. L&apos;email sera généré pour toi.
        </p>
      </div>

      <ManualCard
        label="Message LinkedIn d'ouverture"
        sub="Premier contact envoyé au prospect."
        icon={<MessageSquare className="h-4 w-4 text-[#2563EB]" />}
        value={message}
        onChange={onChangeMessage}
        placeholder={MANUAL_MESSAGE_PLACEHOLDER}
        max={MANUAL_MESSAGE_MAX}
        rows={9}
        disabled={saving}
        warning={
          messageOver
            ? `Trop long (${message.length}/${MANUAL_MESSAGE_MAX} car. recommandés)`
            : null
        }
      />

      <ManualCard
        label="Relance LinkedIn"
        sub="Envoyée après le premier message si pas de réponse."
        icon={<MessageSquare className="h-4 w-4 text-[#7c3aed]" />}
        value={relance}
        onChange={onChangeRelance}
        placeholder={MANUAL_RELANCE_PLACEHOLDER}
        max={MANUAL_RELANCE_MAX}
        rows={4}
        disabled={saving}
        warning={
          relanceOver
            ? `Trop long (${relance.length}/${MANUAL_RELANCE_MAX} car. recommandés)`
            : null
        }
        rightAction={
          <button
            type="button"
            onClick={onGenerateRelance}
            disabled={!messageReady || generatingRelance || saving}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
              !messageReady
                ? "border-[#e1e8f5] bg-[#f8fafc] text-[#a0b0c0] cursor-not-allowed"
                : "border-[#c8d6ea] bg-white text-[#2563EB] hover:border-[#2563EB] hover:bg-[#edf4ff]"
            )}
            title={
              !messageReady
                ? "Écris d'abord ton message d'ouverture"
                : "Générer une relance cohérente avec ton message"
            }
          >
            {generatingRelance ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Génération…
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Générer ma relance
              </>
            )}
          </button>
        }
      />

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {saving && (
        <div className="flex items-center gap-2 rounded-xl border border-[#9cc0ff] bg-[#edf4ff] px-4 py-3 text-sm text-[#1f4f96]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Enregistrement, génération de l&apos;email et du prompt technique en cours…
        </div>
      )}

      <div className="sticky bottom-0 -mx-1 mt-1 flex items-center justify-between gap-3 rounded-xl border border-[#9cc0ff] bg-[#edf4ff] px-4 py-3">
        <p className="text-sm text-[#1f4f96]">
          {canSubmit
            ? "Tes deux messages sont prêts. L'email sera généré automatiquement."
            : !messageReady
            ? `Ton message d'ouverture doit faire au moins 30 caractères (actuellement ${message.trim().length}).`
            : `Ta relance doit faire au moins 10 caractères (actuellement ${relance.trim().length}). Tu peux aussi cliquer sur "Générer ma relance".`}
        </p>
        <HubButton
          variant="primary"
          onClick={onSubmit}
          className="gap-2 whitespace-nowrap"
          disabled={!canSubmit}
        >
          <CheckCircle2 className="h-4 w-4" />
          Valider mes messages
        </HubButton>
      </div>
    </div>
  );
}

function ManualCard({
  label,
  sub,
  icon,
  value,
  onChange,
  placeholder,
  max,
  rows,
  disabled,
  warning,
  rightAction,
}: {
  label: string;
  sub: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  max: number;
  rows: number;
  disabled: boolean;
  warning: string | null;
  rightAction?: React.ReactNode;
}) {
  const count = value.length;
  const overshoot = count > max;
  return (
    <div className="rounded-2xl border border-[#c8d6ea] bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <p className="text-sm font-bold text-[#0b1c33]">{label}</p>
            <p className="text-xs text-[#7a9abf]">{sub}</p>
          </div>
        </div>
        {rightAction}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className="w-full resize-y rounded-xl border border-[#e1e8f5] bg-[#fafcff] px-4 py-3 text-sm leading-relaxed text-[#0b1c33] placeholder:text-[#a0b0c0] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 disabled:opacity-60"
      />
      <div className="mt-2 flex items-center justify-between text-[11px]">
        <span className={overshoot ? "text-amber-600" : "text-[#7a9abf]"}>
          {count} / {max} car. recommandés
        </span>
        {warning && <span className="text-amber-600">{warning}</span>}
      </div>
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
