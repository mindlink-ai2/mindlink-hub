import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

type ReprogramSource = "linkedin" | "maps";

function toIsoStartOfDay(dateValue: string): string | null {
  const clean = dateValue.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return null;

  const parsed = new Date(`${clean}T08:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await req.json().catch(() => ({}));
  const leadId = body?.leadId;
  const source = (body?.source ?? "linkedin") as ReprogramSource;
  const nextFollowupDate = typeof body?.nextFollowupDate === "string" ? body.nextFollowupDate : "";

  if (!leadId) {
    return NextResponse.json({ error: "Missing leadId" }, { status: 400 });
  }

  const nextFollowupAt = toIsoStartOfDay(nextFollowupDate);
  if (!nextFollowupAt) {
    return NextResponse.json({ error: "Date invalide" }, { status: 400 });
  }

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id")
    .eq("clerk_user_id", userId)
    .single();

  if (clientError || !client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const table = source === "maps" ? "map_leads" : "leads";

  const { data, error } = await supabase
    .from(table)
    .update({ next_followup_at: nextFollowupAt })
    .eq("id", leadId)
    .eq("client_id", client.id)
    .select("id, next_followup_at")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Impossible de reprogrammer la relance." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    id: data.id,
    next_followup_at:
      typeof data.next_followup_at === "string" ? data.next_followup_at : nextFollowupAt,
  });
}
