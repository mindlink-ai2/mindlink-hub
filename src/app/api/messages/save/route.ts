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
  finalizeMessagesFromChat,
  generateSystemPromptFromMessages,
  type DapsAnswers,
} from "@/lib/messages-prompt";
import { extractDapsFromManualMessages } from "@/lib/messages-manual-daps";
import { createWorkflowForClient, updateWorkflowSystemPrompt } from "@/lib/n8n-workflow";
import { adminClientChangeEmail, sendLidmeoEmail } from "@/lib/email-templates";
import { logClientActivity } from "@/lib/client-activity";
import { deriveSheetTabName } from "@/lib/sheet-tab-name";

type SetupMode = "chat" | "manual";

function sanitizeMode(input: unknown): SetupMode {
  return input === "manual" ? "manual" : "chat";
}

const ADMIN_NOTIFY_EMAIL = "contact@lidmeo.com";

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

function safeString(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
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
    const validatedLinkedin = safeString(body?.messageLinkedin, 2000);
    const validatedRelance = safeString(body?.relanceLinkedin, 2000);
    const mode = sanitizeMode(body?.mode);
    // In manual mode the chat history is empty by design.
    const history = mode === "manual" ? [] : sanitizeHistory(body?.history);

    if (!validatedLinkedin || !validatedRelance) {
      return NextResponse.json(
        { error: "missing_validated_messages" },
        { status: 400 }
      );
    }

    const { data: clientRow } = await supabase
      .from("clients")
      .select("id, company_name, email, n8n_workflow_id")
      .eq("id", clientContext.clientId)
      .maybeSingle();

    const { data: existingMessages } = await supabase
      .from("client_messages")
      .select("org_id")
      .eq("org_id", clientContext.clientId)
      .maybeSingle();
    const isFirstMessageSave = !existingMessages;

    const { data: icpConfig } = await supabase
      .from("icp_configs")
      .select("filters")
      .eq("org_id", clientContext.clientId)
      .in("status", ["submitted", "reviewed", "active"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const companyName =
      (clientRow?.company_name as string | null) ?? user?.firstName ?? "Inconnue";
    const clientFirstName = user?.firstName ?? "";
    const conversationDigest = buildConversationDigest(history);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY_missing" },
        { status: 500 }
      );
    }

    // 1) Remplace les exemples concrets par les variables + génère l'email
    let finalizedLinkedin = validatedLinkedin;
    let finalizedRelance = validatedRelance;
    let finalizedEmail = "";
    try {
      const finalized = await finalizeMessagesFromChat(apiKey, {
        companyName,
        clientFirstName,
        validatedLinkedin,
        validatedRelance,
        conversationDigest,
      });
      finalizedLinkedin = finalized.message_linkedin;
      finalizedRelance = finalized.relance_linkedin;
      finalizedEmail = finalized.message_email;
    } catch (finalizeErr) {
      console.error("[messages/save] finalize failed:", finalizeErr);
      return NextResponse.json(
        { error: "finalize_failed" },
        { status: 502 }
      );
    }

    // 2) Génère le prompt technique (best-effort)
    const icpDigest = buildIcpDigest(
      (icpConfig?.filters ?? null) as Record<string, unknown> | null
    );

    // Manual mode: pre-compute DAPS via the dedicated extractor so the
    // n8n prompt is rich even without a chat history.
    let preComputedDaps: DapsAnswers | undefined;
    if (mode === "manual") {
      try {
        preComputedDaps = await extractDapsFromManualMessages(apiKey, {
          messageLinkedin: validatedLinkedin,
          relanceLinkedin: validatedRelance,
          icpDigest,
          companyName,
        });
      } catch (extractErr) {
        console.warn(
          "[messages/save] manual DAPS extract failed, falling back to ICP:",
          extractErr
        );
      }
    }

    let systemPrompt: string | null = null;
    try {
      systemPrompt = await generateSystemPromptFromMessages(apiKey, {
        companyName,
        messageLinkedin: finalizedLinkedin,
        relanceLinkedin: finalizedRelance,
        messageEmail: finalizedEmail,
        conversationDigest,
        conversationHistory: mode === "chat" ? history : undefined,
        preComputedDaps,
        icpDigest,
      });
    } catch (promptErr) {
      console.error("[messages/save] prompt generation failed:", promptErr);
    }

    const nowIso = new Date().toISOString();
    const row = {
      org_id: clientContext.clientId,
      message_linkedin: finalizedLinkedin,
      relance_linkedin: finalizedRelance,
      message_email: finalizedEmail,
      system_prompt: systemPrompt,
      status: "submitted" as const,
      mode,
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

    try {
      await markClientOnboardingCompleted(supabase, clientContext.clientId);
    } catch (stateErr) {
      console.error("[messages/save] unable to mark onboarding completed:", stateErr);
    }

    // Activity log: messages_validated (first save) or messages_updated
    await logClientActivity(
      supabase,
      clientContext.clientId,
      isFirstMessageSave ? "messages_validated" : "messages_updated",
      { mode }
    );

    // n8n workflow: update existing, or auto-create if conditions are met
    const existingWorkflowId = (clientRow?.n8n_workflow_id as string | null) ?? null;
    let workflowJustCreated = false;

    if (existingWorkflowId && systemPrompt) {
      try {
        const res = await updateWorkflowSystemPrompt(existingWorkflowId, systemPrompt);
        if (res.updated) {
          console.log(
            "[messages/save] n8n workflow updated for org_id:",
            clientContext.clientId,
            "activated:",
            res.activated ?? false
          );
          await logClientActivity(
            supabase,
            clientContext.clientId,
            "workflow_updated",
            {
              reason: "messages_updated",
              workflow_id: existingWorkflowId,
              mode,
              activated: res.activated ?? false,
              activation_error: res.activationError ?? null,
            }
          );
        } else {
          console.warn(
            "[messages/save] n8n workflow NOT updated for org_id:",
            clientContext.clientId,
            res.error
          );
        }
      } catch (n8nErr) {
        console.error("[messages/save] n8n update error:", n8nErr);
      }
    } else if (!existingWorkflowId && systemPrompt) {
      // Auto-create workflow if an extraction has already happened
      const { data: extractionLog } = await supabase
        .from("extraction_logs")
        .select("google_sheet_id")
        .eq("org_id", clientContext.clientId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const googleSheetId =
        (extractionLog?.google_sheet_id as string | null) ?? null;

      if (googleSheetId) {
        const tabName = deriveSheetTabName(
          (clientRow?.company_name as string | null) ?? null,
          (clientRow?.email as string | null) ?? null,
          clientContext.clientId
        );
        const result = await createWorkflowForClient(
          supabase,
          clientContext.clientId,
          { systemPrompt, googleSheetId, tabName }
        );
        if (result.workflowId) {
          workflowJustCreated = true;
          console.log(
            "[messages/save] Workflow n8n créé automatiquement pour org_id:",
            clientContext.clientId,
            "workflow_id:",
            result.workflowId
          );
          await logClientActivity(
            supabase,
            clientContext.clientId,
            "workflow_created",
            {
              workflow_id: result.workflowId,
              trigger: "messages_save",
              activated: result.activated ?? false,
              activation_error: result.activationError ?? null,
            }
          );
        } else {
          console.warn(
            "[messages/save] Auto workflow creation failed for org_id:",
            clientContext.clientId,
            result.error
          );
        }
      }
    }

    // Notify admin by email (best-effort)
    try {
      const { subject, html } = adminClientChangeEmail({
        kind: "messages",
        clientName: (clientRow?.company_name as string | null) ?? null,
        clientEmail: (clientRow?.email as string | null) ?? null,
        orgId: clientContext.clientId,
      });
      await sendLidmeoEmail({ to: ADMIN_NOTIFY_EMAIL, subject, html });
    } catch (emailErr) {
      console.error("[messages/save] admin email failed:", emailErr);
    }

    return NextResponse.json({
      ok: true,
      promptGenerated: Boolean(systemPrompt),
      workflowCreated: workflowJustCreated,
    });
  } catch (err) {
    console.error("[messages/save] error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
