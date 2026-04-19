import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

function createServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function resolveFullActiveClient(userId: string) {
  const supabase = createServiceSupabase();
  const { data: client, error } = await supabase
    .from("clients")
    .select("id, plan, subscription_status, followup_delay_days")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (error || !client) return null;

  const plan = String(client.plan ?? "").trim().toLowerCase();
  const status = String(client.subscription_status ?? "").trim().toLowerCase();
  if (plan !== "full" || status !== "active") return null;

  return { supabase, client };
}

// GET /api/followups/settings
// Retourne { followup_delay_days } du client connecté.
// Bloqué si plan != 'full' + active.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const resolved = await resolveFullActiveClient(userId);
  if (!resolved) return NextResponse.json({ error: "Forbidden: full plan only" }, { status: 403 });

  const delayDays =
    typeof (resolved.client as Record<string, unknown>).followup_delay_days === "number"
      ? (resolved.client as Record<string, unknown>).followup_delay_days as number
      : 7;

  return NextResponse.json({ followup_delay_days: delayDays });
}

// PATCH /api/followups/settings
// Accepte { followup_delay_days: number }. Valide 1–365.
// Bloqué si plan != 'full' + active.
export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const resolved = await resolveFullActiveClient(userId);
  if (!resolved) return NextResponse.json({ error: "Forbidden: full plan only" }, { status: 403 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const raw = body.followup_delay_days;

  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1 || raw > 365) {
    return NextResponse.json(
      { error: "followup_delay_days doit être un entier entre 1 et 365" },
      { status: 400 }
    );
  }

  const { error } = await resolved.supabase
    .from("clients")
    .update({ followup_delay_days: raw })
    .eq("id", resolved.client.id);

  if (error) {
    console.error("FOLLOWUPS_SETTINGS_UPDATE_ERROR:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ followup_delay_days: raw });
}
