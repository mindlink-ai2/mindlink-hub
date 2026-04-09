import { NextResponse } from "next/server";
import { getSupportAdminContext } from "@/lib/support-admin-auth";
import { createServiceSupabase } from "@/lib/inbox-server";

export const runtime = "nodejs";

function getTomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

export async function POST(request: Request) {
  const adminCtx = await getSupportAdminContext();
  if (!adminCtx) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  let body: { org_id: number; google_sheet_id: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const { org_id, google_sheet_id } = body;
  if (!org_id || !google_sheet_id) {
    return NextResponse.json(
      { error: "org_id et google_sheet_id sont requis" },
      { status: 400 }
    );
  }

  const n8nApiKey = process.env.N8N_API_KEY;
  const n8nBaseUrl = process.env.N8N_BASE_URL ?? "https://mindlink2.app.n8n.cloud";

  if (!n8nApiKey) {
    return NextResponse.json({ error: "N8N_API_KEY non configurée" }, { status: 500 });
  }

  const supabase = createServiceSupabase();

  // Récupérer le workflow_id du client
  const { data: clientRow, error: clientErr } = await supabase
    .from("clients")
    .select("id, n8n_workflow_id")
    .eq("id", org_id)
    .single();

  if (clientErr || !clientRow) {
    return NextResponse.json({ error: "Client introuvable" }, { status: 404 });
  }

  const workflowId = (clientRow.n8n_workflow_id as string | null) ?? null;
  if (!workflowId) {
    return NextResponse.json(
      { error: "Aucun workflow n8n associé à ce client.", code: "NO_WORKFLOW" },
      { status: 404 }
    );
  }

  // ── Étape 1 : Récupérer le workflow actuel depuis n8n ─────────────────────
  let workflow: Record<string, unknown>;
  try {
    const getRes = await fetch(`${n8nBaseUrl}/api/v1/workflows/${workflowId}`, {
      headers: { "X-N8N-API-KEY": n8nApiKey },
    });

    if (getRes.status === 404) {
      return NextResponse.json(
        {
          error: "Le workflow n'existe plus dans n8n. Vous devez en créer un nouveau.",
          code: "WORKFLOW_NOT_FOUND",
        },
        { status: 404 }
      );
    }

    if (!getRes.ok) {
      const errText = await getRes.text().catch(() => "");
      throw new Error(`n8n GET ${getRes.status}: ${errText.slice(0, 200)}`);
    }

    workflow = (await getRes.json()) as Record<string, unknown>;
  } catch (err) {
    console.error("[update-workflow] GET error:", err);
    return NextResponse.json(
      { error: "Impossible de récupérer le workflow depuis n8n." },
      { status: 502 }
    );
  }

  // ── Étape 2 : Patcher les nodes cibles ───────────────────────────────────
  const nodes = workflow.nodes as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(nodes)) {
    return NextResponse.json(
      { error: "Format de workflow inattendu (nodes manquants)." },
      { status: 500 }
    );
  }

  const tomorrow = getTomorrowDate();
  let sheetUpdated = false;
  let dateUpdated = false;

  for (const node of nodes) {
    // Mettre à jour le Google Sheet ID dans "Get row(s) in sheet"
    if (node.id === "read-sheet" || node.name === "Get row(s) in sheet") {
      const params = node.parameters as Record<string, unknown> | undefined;
      if (params) {
        const docId = params.documentId as Record<string, unknown> | undefined;
        if (docId) {
          docId.value = google_sheet_id;
          sheetUpdated = true;
        }
      }
    }

    // Mettre à jour la startDate dans le jsCode "Leads/jour"
    if (node.id === "slice-per-day" || node.name === "Leads/jour") {
      const params = node.parameters as Record<string, unknown> | undefined;
      if (params && typeof params.jsCode === "string") {
        const updated = params.jsCode.replace(
          /new Date\('[0-9]{4}-[0-9]{2}-[0-9]{2}'\)/,
          `new Date('${tomorrow}')`
        );
        if (updated !== params.jsCode) {
          params.jsCode = updated;
          dateUpdated = true;
        }
      }
    }
  }

  console.log(
    `[update-workflow] org_id=${org_id} workflowId=${workflowId} sheetUpdated=${sheetUpdated} dateUpdated=${dateUpdated}`
  );

  if (!sheetUpdated) {
    console.warn("[update-workflow] Node 'Get row(s) in sheet' not found — sheet not updated");
  }

  // ── Étape 3 : Envoyer le workflow mis à jour ──────────────────────────────
  try {
    const putRes = await fetch(`${n8nBaseUrl}/api/v1/workflows/${workflowId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-N8N-API-KEY": n8nApiKey,
      },
      body: JSON.stringify(workflow),
    });

    if (!putRes.ok) {
      const errText = await putRes.text().catch(() => "");
      throw new Error(`n8n PUT ${putRes.status}: ${errText.slice(0, 300)}`);
    }

    console.log(`[update-workflow] Workflow ${workflowId} updated successfully`);
  } catch (err) {
    console.error("[update-workflow] PUT error:", err);
    return NextResponse.json(
      { error: "Impossible de mettre à jour le workflow n8n." },
      { status: 502 }
    );
  }

  const workflowUrl = `${n8nBaseUrl}/workflow/${workflowId}`;

  return NextResponse.json({
    workflow_id: workflowId,
    workflow_url: workflowUrl,
    sheet_updated: sheetUpdated,
    date_updated: dateUpdated,
  });
}
