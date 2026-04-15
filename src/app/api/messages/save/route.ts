import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createServiceSupabase } from "@/lib/inbox-server";
import {
  markClientOnboardingCompleted,
  resolveClientContextForUser,
} from "@/lib/client-onboarding-state";
import {
  buildConversationDigest,
  buildIcpDigest,
  generateSystemPromptFromMessages,
  parseGeneratedMessages,
} from "@/lib/messages-prompt";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatMessage = { role: "user" | "assistant"; content: string };

function sanitizeHistory(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return [];
  const out: ChatMessage[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;
    const role = (entry as Record<string, unknown>).role;
    const content = (entry as Record<string, unknown>).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;
    if (!content.trim()) continue;
    out.push({ role, content: content.slice(0, 8000) });
  }
  return out.slice(-100);
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const user = await currentUser();
    const email =
      user?.primaryEmailAddress?.emailAddress ||
      user?.emailAddresses?.[0]?.emailAddress ||
      null;

    const supabase = createServiceSupabase();
    const clientContext = await resolveClientContextForUser(supabase, userId, email);
    if (!clientContext) {
      return NextResponse.json({ error: "client_not_found" }, { status: 404 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const rawAssistantReply = typeof body?.assistantReply === "string" ? body.assistantReply : "";
    const history = sanitizeHistory(body?.history);

    const parsed = parseGeneratedMessages(rawAssistantReply);
    if (!parsed.message_linkedin || !parsed.relance_linkedin || !parsed.message_email) {
      return NextResponse.json(
        { error: "messages_not_found_in_reply" },
        { status: 400 }
      );
    }

    const { data: clientRow } = await supabase
      .from("clients")
      .select("id, company_name")
      .eq("id", clientContext.clientId)
      .maybeSingle();

    const { data: icpConfig } = await supabase
      .from("icp_configs")
      .select("filters")
      .eq("org_id", clientContext.clientId)
      .in("status", ["submitted", "reviewed", "active"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Génération du prompt technique (synchrone, ~5-15s). Si ça échoue on sauvegarde
    // quand même les messages — l'admin pourra régénérer depuis le panel.
    let systemPrompt: string | null = null;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        systemPrompt = await generateSystemPromptFromMessages(apiKey, {
          companyName:
            (clientRow?.company_name as string | null) ??
            user?.firstName ??
            "Inconnue",
          messageLinkedin: parsed.message_linkedin,
          relanceLinkedin: parsed.relance_linkedin,
          messageEmail: parsed.message_email,
          conversationDigest: buildConversationDigest(history),
          icpDigest: buildIcpDigest(
            (icpConfig?.filters ?? null) as Record<string, unknown> | null
          ),
        });
      } catch (promptErr) {
        console.error("[messages/save] prompt generation failed:", promptErr);
      }
    }

    const nowIso = new Date().toISOString();
    const row = {
      org_id: clientContext.clientId,
      message_linkedin: parsed.message_linkedin,
      relance_linkedin: parsed.relance_linkedin,
      message_email: parsed.message_email,
      system_prompt: systemPrompt,
      status: "submitted" as const,
      conversation_history: history,
      updated_at: nowIso,
    };

    const { error: upsertErr } = await supabase
      .from("client_messages")
      .upsert(row, { onConflict: "org_id" });

    if (upsertErr) {
      console.error("[messages/save] upsert failed:", upsertErr);
      return NextResponse.json({ error: "save_failed" }, { status: 500 });
    }

    // Mark onboarding as completed (Option A: messages validation = final step)
    try {
      await markClientOnboardingCompleted(supabase, clientContext.clientId);
    } catch (stateErr) {
      console.error("[messages/save] unable to mark onboarding completed:", stateErr);
    }

    return NextResponse.json({
      ok: true,
      promptGenerated: Boolean(systemPrompt),
    });
  } catch (err) {
    console.error("[messages/save] error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
