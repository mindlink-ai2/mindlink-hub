import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/platform-auth";
import { createServiceSupabase } from "@/lib/inbox-server";
import { buildWorkflowJson, getTomorrowDate } from "@/lib/n8n-workflow-template";

export const runtime = "nodejs";
// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const adminCtx = await getAdminContext();
  if (!adminCtx) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  let body: {
    org_id: number;
    prompt_systeme?: string;
    google_sheet_id: string;
    tab_name: string;
    extraction_log_id?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const { org_id, prompt_systeme, google_sheet_id, tab_name, extraction_log_id } = body;
  if (!org_id || !google_sheet_id || !tab_name) {
    return NextResponse.json(
      { error: "org_id, google_sheet_id et tab_name sont requis" },
      { status: 400 }
    );
  }

  const n8nApiKey = process.env.N8N_API_KEY;
  const n8nBaseUrl = process.env.N8N_BASE_URL ?? "https://mindlink2.app.n8n.cloud";

  if (!n8nApiKey) {
    return NextResponse.json({ error: "N8N_API_KEY non configurée" }, { status: 500 });
  }

  const supabase = createServiceSupabase();

  // ── Récupérer les infos client ────────────────────────────────────────────
  const { data: clientRow, error: clientErr } = await supabase
    .from("clients")
    .select("id, company_name, quota, n8n_workflow_id")
    .eq("id", org_id)
    .single();

  if (clientErr || !clientRow) {
    return NextResponse.json({ error: "Client introuvable" }, { status: 404 });
  }

  // ── Récupérer le compte Unipile du client ─────────────────────────────────
  const { data: unipileRow } = await supabase
    .from("unipile_accounts")
    .select("unipile_account_id")
    .eq("client_id", org_id)
    .maybeSingle();

  const unipileAccountId = (unipileRow?.unipile_account_id as string | null) ?? "";
  if (!unipileAccountId) {
    console.warn(`[create-workflow] No unipile_account_id found for org_id=${org_id}`);
  }

  const clientName = (clientRow.company_name as string | null) || `Client ${org_id}`;
  const companyName = (clientRow.company_name as string | null) ?? "";
  const quotaPerDay = Number(clientRow.quota) || 10;
  const startDate = getTomorrowDate();
  const existingWorkflowId = (clientRow.n8n_workflow_id as string | null) ?? null;

  let workflowId = "";
  let updated = false;

  // ── Workflow existant ? Tenter une mise à jour ────────────────────────────
  if (existingWorkflowId) {
    console.log(`[create-workflow] Existing workflow detected: ${existingWorkflowId}`);

    // GET le workflow actuel depuis n8n
    let existingWorkflow: Record<string, unknown> | null = null;
    try {
      const getRes = await fetch(`${n8nBaseUrl}/api/v1/workflows/${existingWorkflowId}`, {
        headers: { "X-N8N-API-KEY": n8nApiKey },
      });

      if (getRes.status === 404) {
        console.warn(`[create-workflow] Workflow ${existingWorkflowId} not found in n8n — will create new`);
      } else if (!getRes.ok) {
        const errText = await getRes.text().catch(() => "");
        console.error(`[create-workflow] GET workflow failed ${getRes.status}: ${errText.slice(0, 200)}`);
      } else {
        existingWorkflow = (await getRes.json()) as Record<string, unknown>;
      }
    } catch (err) {
      console.error("[create-workflow] GET workflow error:", err);
    }

    // Si le workflow existe, mettre à jour tab_name + startDate
    if (existingWorkflow) {
      const nodes = existingWorkflow.nodes as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(nodes)) {
        return NextResponse.json(
          { error: "Format de workflow inattendu (nodes manquants)." },
          { status: 500 }
        );
      }

      let sheetUpdated = false;
      let dateUpdated = false;

      for (const node of nodes) {
        // Mettre à jour le Google Sheet ID + tab name dans "Get row(s) in sheet"
        if (node.id === "read-sheet" || node.name === "Get row(s) in sheet") {
          const params = node.parameters as Record<string, unknown> | undefined;
          if (params) {
            const docId = params.documentId as Record<string, unknown> | undefined;
            if (docId) {
              docId.value = google_sheet_id;
              sheetUpdated = true;
            }
            const sheetName = params.sheetName as Record<string, unknown> | undefined;
            if (sheetName) {
              sheetName.value = tab_name;
            }
          }
        }

        // Mettre à jour la startDate dans le jsCode "Leads/jour"
        if (node.id === "slice-per-day" || node.name === "Leads/jour") {
          const params = node.parameters as Record<string, unknown> | undefined;
          if (params && typeof params.jsCode === "string") {
            const updatedCode = params.jsCode.replace(
              /new Date\('[0-9]{4}-[0-9]{2}-[0-9]{2}'\)/,
              `new Date('${startDate}')`
            );
            if (updatedCode !== params.jsCode) {
              params.jsCode = updatedCode;
              dateUpdated = true;
            }
          }
        }
      }

      console.log(
        `[create-workflow] Update: sheetUpdated=${sheetUpdated} dateUpdated=${dateUpdated}`
      );

      // Retirer les propriétés read-only avant le PUT
      delete existingWorkflow.id;
      delete existingWorkflow.createdAt;
      delete existingWorkflow.updatedAt;
      delete existingWorkflow.active;
      delete existingWorkflow.tags;
      delete existingWorkflow.versionId;
      delete existingWorkflow.triggerCount;
      delete existingWorkflow.sharedWithProjects;
      delete existingWorkflow.homeProject;
      delete existingWorkflow.usedCredentials;

      // PUT le workflow mis à jour
      try {
        const putRes = await fetch(`${n8nBaseUrl}/api/v1/workflows/${existingWorkflowId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-N8N-API-KEY": n8nApiKey,
          },
          body: JSON.stringify(existingWorkflow),
        });

        if (!putRes.ok) {
          const errText = await putRes.text().catch(() => "");
          throw new Error(`n8n PUT ${putRes.status}: ${errText.slice(0, 300)}`);
        }

        console.log(`[create-workflow] Workflow ${existingWorkflowId} updated successfully`);
        workflowId = existingWorkflowId;
        updated = true;
      } catch (err) {
        console.error("[create-workflow] PUT error:", err);
        return NextResponse.json(
          { error: "Impossible de mettre à jour le workflow n8n." },
          { status: 502 }
        );
      }
    }
  }

  // ── Pas de workflow existant (ou supprimé) → créer un nouveau ─────────────
  if (!updated) {
    if (!prompt_systeme) {
      return NextResponse.json(
        { error: "prompt_systeme est requis pour créer un nouveau workflow." },
        { status: 400 }
      );
    }

    try {
      const workflowPayload = buildWorkflowJson({
        clientName,
        companyName,
        quotaPerDay,
        startDate,
        googleSheetId: google_sheet_id,
        tabName: tab_name,
        clientId: clientRow.id as number,
        unipileAccountId,
        promptSystems: prompt_systeme,
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
        throw new Error(
          `n8n workflow creation failed ${workflowRes.status}: ${errText.slice(0, 300)}`
        );
      }

      const workflowData = await workflowRes.json();
      workflowId = workflowData.id as string;
      console.log(`[create-workflow] Workflow created: ${workflowId}`);
    } catch (err) {
      console.error("[create-workflow] workflow error:", err);
      return NextResponse.json(
        { error: "Impossible de créer le workflow n8n." },
        { status: 502 }
      );
    }

    // Activer le nouveau workflow
    try {
      const activateRes = await fetch(`${n8nBaseUrl}/api/v1/workflows/${workflowId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-N8N-API-KEY": n8nApiKey,
        },
        body: JSON.stringify({ active: true }),
      });

      if (!activateRes.ok) {
        const errText = await activateRes.text().catch(() => "");
        console.warn(
          `[create-workflow] activation failed ${activateRes.status}: ${errText.slice(0, 200)}`
        );
      } else {
        console.log(`[create-workflow] Workflow ${workflowId} activated`);
      }
    } catch (err) {
      console.warn("[create-workflow] activation error (non-blocking):", err);
    }

    // Sauvegarder le nouveau workflow_id
    const { error: clientUpdateErr } = await supabase
      .from("clients")
      .update({
        n8n_workflow_id: workflowId,
        n8n_folder_id: null,
      })
      .eq("id", org_id);

    if (clientUpdateErr) {
      console.warn("[create-workflow] could not save n8n IDs to clients:", clientUpdateErr.message);
    }
  }

  if (extraction_log_id) {
    const { error: logUpdateErr } = await supabase
      .from("extraction_logs")
      .update({
        workflow_id: workflowId,
        folder_id: null,
      })
      .eq("id", extraction_log_id);

    if (logUpdateErr) {
      console.warn("[create-workflow] could not save workflow_id to extraction_logs:", logUpdateErr.message);
    }
  }

  const workflowUrl = `${n8nBaseUrl}/workflow/${workflowId}`;

  return NextResponse.json({
    workflow_id: workflowId,
    workflow_url: workflowUrl,
    updated,
  });
}
