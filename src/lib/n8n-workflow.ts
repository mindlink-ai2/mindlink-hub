import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildWorkflowJson, getTomorrowDate } from "@/lib/n8n-workflow-template";

const AGENT_NODE_ID = "ai-enrichment";
const AGENT_NODE_NAME = "Enrichissement IA";

const READ_ONLY_KEYS = [
  "id",
  "createdAt",
  "updatedAt",
  "active",
  "tags",
  "versionId",
  "triggerCount",
  "sharedWithProjects",
  "homeProject",
  "usedCredentials",
];

export async function updateWorkflowSystemPrompt(
  workflowId: string,
  systemPrompt: string
): Promise<{ updated: boolean; error?: string }> {
  const n8nApiKey = process.env.N8N_API_KEY;
  const n8nBaseUrl = process.env.N8N_BASE_URL ?? "https://mindlink2.app.n8n.cloud";
  if (!n8nApiKey) {
    return { updated: false, error: "N8N_API_KEY missing" };
  }

  try {
    const getRes = await fetch(`${n8nBaseUrl}/api/v1/workflows/${workflowId}`, {
      headers: { "X-N8N-API-KEY": n8nApiKey },
    });
    if (!getRes.ok) {
      const body = await getRes.text().catch(() => "");
      return {
        updated: false,
        error: `GET ${getRes.status}: ${body.slice(0, 200)}`,
      };
    }

    const workflow = (await getRes.json()) as Record<string, unknown>;
    const nodes = workflow.nodes as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(nodes)) {
      return { updated: false, error: "workflow has no nodes" };
    }

    let patched = false;
    for (const node of nodes) {
      if (node.id !== AGENT_NODE_ID && node.name !== AGENT_NODE_NAME) continue;
      const params = (node.parameters as Record<string, unknown>) ?? {};
      const options = (params.options as Record<string, unknown>) ?? {};
      options.systemMessage = systemPrompt;
      params.options = options;
      node.parameters = params;
      patched = true;
      break;
    }

    if (!patched) {
      return { updated: false, error: "agent node not found" };
    }

    for (const key of READ_ONLY_KEYS) delete workflow[key];

    const putRes = await fetch(`${n8nBaseUrl}/api/v1/workflows/${workflowId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-N8N-API-KEY": n8nApiKey,
      },
      body: JSON.stringify(workflow),
    });

    if (!putRes.ok) {
      const body = await putRes.text().catch(() => "");
      return {
        updated: false,
        error: `PUT ${putRes.status}: ${body.slice(0, 200)}`,
      };
    }

    return { updated: true };
  } catch (err) {
    return {
      updated: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface CreateWorkflowResult {
  workflowId: string | null;
  workflowUrl: string | null;
  error?: string;
}

export async function createWorkflowForClient(
  supabase: SupabaseClient,
  orgId: number,
  opts: {
    systemPrompt: string;
    googleSheetId: string;
    tabName: string;
  }
): Promise<CreateWorkflowResult> {
  const n8nApiKey = process.env.N8N_API_KEY;
  const n8nBaseUrl = process.env.N8N_BASE_URL ?? "https://mindlink2.app.n8n.cloud";
  if (!n8nApiKey) {
    return { workflowId: null, workflowUrl: null, error: "N8N_API_KEY missing" };
  }

  const { data: clientRow, error: clientErr } = await supabase
    .from("clients")
    .select("id, company_name, quota")
    .eq("id", orgId)
    .single();

  if (clientErr || !clientRow) {
    return { workflowId: null, workflowUrl: null, error: "client not found" };
  }

  const { data: unipileRow } = await supabase
    .from("unipile_accounts")
    .select("unipile_account_id")
    .eq("client_id", orgId)
    .maybeSingle();

  const unipileAccountId = (unipileRow?.unipile_account_id as string | null) ?? "";
  const clientName = (clientRow.company_name as string | null) || `Client ${orgId}`;
  const companyName = (clientRow.company_name as string | null) ?? "";
  const quotaPerDay = Number(clientRow.quota) || 10;
  const startDate = getTomorrowDate();

  try {
    const workflowPayload = buildWorkflowJson({
      clientName,
      companyName,
      quotaPerDay,
      startDate,
      googleSheetId: opts.googleSheetId,
      tabName: opts.tabName,
      clientId: orgId,
      unipileAccountId,
      promptSystems: opts.systemPrompt,
    });

    const workflowRes = await fetch(`${n8nBaseUrl}/api/v1/workflows`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-N8N-API-KEY": n8nApiKey,
      },
      body: JSON.stringify(workflowPayload),
    });

    if (!workflowRes.ok) {
      const errText = await workflowRes.text().catch(() => "");
      return {
        workflowId: null,
        workflowUrl: null,
        error: `n8n POST ${workflowRes.status}: ${errText.slice(0, 200)}`,
      };
    }

    const workflowData = (await workflowRes.json()) as { id: string };
    const workflowId = workflowData.id;

    // Best-effort activation
    try {
      await fetch(`${n8nBaseUrl}/api/v1/workflows/${workflowId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-N8N-API-KEY": n8nApiKey,
        },
        body: JSON.stringify({ active: true }),
      });
    } catch (err) {
      console.warn("[n8n-workflow] activation failed (non-blocking):", err);
    }

    await supabase
      .from("clients")
      .update({ n8n_workflow_id: workflowId })
      .eq("id", orgId);

    return {
      workflowId,
      workflowUrl: `${n8nBaseUrl}/workflow/${workflowId}`,
    };
  } catch (err) {
    return {
      workflowId: null,
      workflowUrl: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
