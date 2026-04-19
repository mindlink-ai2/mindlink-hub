import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceSupabase } from "@/lib/inbox-server";
import { adminClientChangeEmail, sendLidmeoEmail } from "@/lib/email-templates";
import { logClientActivity } from "@/lib/client-activity";

const ADMIN_NOTIFY_EMAIL = "contact@lidmeo.com";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: { filters: Record<string, unknown>; preview_profiles?: unknown[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  if (!body.filters || typeof body.filters !== "object") {
    return NextResponse.json({ error: "Filtres manquants" }, { status: 400 });
  }

  const supabase = createServiceSupabase();

  const { data: clientRow, error: clientErr } = await supabase
    .from("clients")
    .select("id, email, company_name")
    .eq("clerk_user_id", userId)
    .single();

  if (clientErr || !clientRow) {
    return NextResponse.json({ error: "Client introuvable" }, { status: 404 });
  }
  const orgId: number = clientRow.id;

  // Upsert de la config ICP avec statut "submitted"
  const { data: existing } = await supabase
    .from("icp_configs")
    .select("id")
    .eq("org_id", orgId)
    .maybeSingle();

  let configId: string;

  if (existing?.id) {
    const { data: updated, error: updateErr } = await supabase
      .from("icp_configs")
      .update({
        filters: body.filters,
        preview_profiles: body.preview_profiles ?? [],
        status: "submitted",
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("id")
      .single();

    if (updateErr || !updated) {
      console.error("[icp/submit] update error", updateErr);
      return NextResponse.json({ error: "Erreur lors de la sauvegarde" }, { status: 500 });
    }
    configId = updated.id;
  } else {
    const { data: inserted, error: insertErr } = await supabase
      .from("icp_configs")
      .insert({
        org_id: orgId,
        filters: body.filters,
        preview_profiles: body.preview_profiles ?? [],
        status: "submitted",
        submitted_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertErr || !inserted) {
      console.error("[icp/submit] insert error", insertErr);
      return NextResponse.json({ error: "Erreur lors de la sauvegarde" }, { status: 500 });
    }
    configId = inserted.id;
  }

  await logClientActivity(supabase, orgId, existing?.id ? "icp_modified" : "icp_submitted");

  // Notifier les admins (tableau interne)
  await supabase.from("admin_notifications").insert({
    type: "icp_submitted",
    org_id: orgId,
    message: `Le client ${clientRow.email ?? `org #${orgId}`} a validé son ciblage ICP.`,
    read: false,
  });

  // Notifier les admins par email
  try {
    const { subject, html } = adminClientChangeEmail({
      kind: "icp",
      clientName: (clientRow.company_name as string | null) ?? null,
      clientEmail: (clientRow.email as string | null) ?? null,
      orgId,
    });
    await sendLidmeoEmail({ to: ADMIN_NOTIFY_EMAIL, subject, html });
  } catch (emailErr) {
    console.error("[icp/submit] admin email failed:", emailErr);
  }

  return NextResponse.json({ success: true, config_id: configId });
}
