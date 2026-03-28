import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

function createServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// PATCH /api/leads/[id]/followup-delay
// Accepte { custom_followup_delay_days: number | null }
//   null  → revenir au délai global
//   1–365 → délai personnalisé
// Si le lead a next_followup_at dans le futur et relance_sent_at IS NULL
// → recalcule next_followup_at à partir de message_sent_at (ou created_at en fallback).
// Bloqué si plan != 'full' + active.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: leadIdParam } = await params;
  const leadId = Number(leadIdParam);
  if (!Number.isFinite(leadId)) {
    return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
  }

  const supabase = createServiceSupabase();

  // 1. Résoudre le client connecté + vérifier plan full
  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("id, plan, subscription_status, followup_delay_days")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (clientErr || !client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const plan = String(client.plan ?? "").trim().toLowerCase();
  const status = String(client.subscription_status ?? "").trim().toLowerCase();
  if (plan !== "full" || status !== "active") {
    return NextResponse.json({ error: "Forbidden: full plan only" }, { status: 403 });
  }

  // 2. Valider le body
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const raw = body.custom_followup_delay_days;

  let customDelay: number | null;
  if (raw === null || raw === undefined) {
    customDelay = null; // revenir au délai global
  } else if (typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= 365) {
    customDelay = raw;
  } else {
    return NextResponse.json(
      { error: "custom_followup_delay_days doit être null ou un entier entre 1 et 365" },
      { status: 400 }
    );
  }

  // 3. Vérifier que le lead appartient au client
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("id, client_id, next_followup_at, relance_sent_at, message_sent_at, created_at")
    .eq("id", leadId)
    .eq("client_id", client.id)
    .maybeSingle();

  if (leadErr || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const updatePayload: Record<string, unknown> = {
    custom_followup_delay_days: customDelay,
  };

  // 4. Si next_followup_at est dans le futur et relance pas encore envoyée
  //    → recalculer next_followup_at avec le nouveau délai effectif
  const now = Date.now();
  const nextFollowupAt =
    typeof (lead as Record<string, unknown>).next_followup_at === "string"
      ? new Date((lead as Record<string, unknown>).next_followup_at as string).getTime()
      : null;
  const relanceSentAt = (lead as Record<string, unknown>).relance_sent_at;

  if (nextFollowupAt !== null && nextFollowupAt > now && !relanceSentAt) {
    // Délai effectif : custom > global > 7
    const effectiveDelay =
      customDelay !== null
        ? customDelay
        : typeof (client as Record<string, unknown>).followup_delay_days === "number"
          ? (client as Record<string, unknown>).followup_delay_days as number
          : 7;

    // Base de calcul : message_sent_at > created_at > now
    const baseDateStr =
      typeof (lead as Record<string, unknown>).message_sent_at === "string"
        ? (lead as Record<string, unknown>).message_sent_at as string
        : typeof (lead as Record<string, unknown>).created_at === "string"
          ? (lead as Record<string, unknown>).created_at as string
          : new Date().toISOString();

    const base = new Date(baseDateStr);
    if (!Number.isNaN(base.getTime())) {
      base.setDate(base.getDate() + effectiveDelay);
      updatePayload.next_followup_at = base.toISOString();
    }
  }

  // 5. Appliquer la mise à jour
  const { data: updated, error: updateErr } = await supabase
    .from("leads")
    .update(updatePayload)
    .eq("id", leadId)
    .eq("client_id", client.id)
    .select("id, custom_followup_delay_days, next_followup_at")
    .single();

  if (updateErr) {
    console.error("LEADS_FOLLOWUP_DELAY_UPDATE_ERROR:", updateErr);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ lead: updated });
}
