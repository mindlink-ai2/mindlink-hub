import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/platform-auth";
import { createServiceSupabase } from "@/lib/inbox-server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ orgId: string }> };

export async function GET(_req: Request, context: RouteContext) {
  const adminCtx = await getAdminContext();
  if (!adminCtx) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const { orgId } = await context.params;
  const parsedOrgId = Number(orgId);
  if (!Number.isFinite(parsedOrgId) || parsedOrgId <= 0) {
    return NextResponse.json({ error: "org_id invalide" }, { status: 400 });
  }

  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("client_messages")
    .select(
      "id, org_id, message_linkedin, relance_linkedin, message_email, system_prompt, status, updated_at, created_at"
    )
    .eq("org_id", parsedOrgId)
    .maybeSingle();

  if (error) {
    console.error("[admin/messages GET] error:", error);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  return NextResponse.json({ messages: data ?? null });
}

type PatchBody = {
  message_linkedin?: unknown;
  relance_linkedin?: unknown;
  message_email?: unknown;
  system_prompt?: unknown;
  status?: unknown;
};

function safeStr(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  return v.slice(0, max);
}

export async function PATCH(req: Request, context: RouteContext) {
  const adminCtx = await getAdminContext();
  if (!adminCtx) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const { orgId } = await context.params;
  const parsedOrgId = Number(orgId);
  if (!Number.isFinite(parsedOrgId) || parsedOrgId <= 0) {
    return NextResponse.json({ error: "org_id invalide" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "corps invalide" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const ml = safeStr(body.message_linkedin, 2000);
  if (ml !== null) patch.message_linkedin = ml;
  const rl = safeStr(body.relance_linkedin, 2000);
  if (rl !== null) patch.relance_linkedin = rl;
  const me = safeStr(body.message_email, 4000);
  if (me !== null) patch.message_email = me;
  const sp = safeStr(body.system_prompt, 40000);
  if (sp !== null) patch.system_prompt = sp;
  if (typeof body.status === "string" && ["draft", "submitted", "active"].includes(body.status)) {
    patch.status = body.status;
  }

  if (Object.keys(patch).length <= 1) {
    return NextResponse.json({ error: "aucun champ à mettre à jour" }, { status: 400 });
  }

  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("client_messages")
    .update(patch)
    .eq("org_id", parsedOrgId)
    .select(
      "id, org_id, message_linkedin, relance_linkedin, message_email, system_prompt, status, updated_at"
    )
    .maybeSingle();

  if (error || !data) {
    console.error("[admin/messages PATCH] error:", error);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ messages: data });
}
