import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceSupabase } from "@/lib/inbox-server";

export const runtime = "nodejs";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabase = createServiceSupabase();

  const { data: clientRow, error: clientErr } = await supabase
    .from("clients")
    .select("id")
    .eq("clerk_user_id", userId)
    .single();

  if (clientErr || !clientRow) {
    return NextResponse.json({ filters: null, status: "none" });
  }

  const { data: config } = await supabase
    .from("icp_configs")
    .select("filters, status, preview_profiles, submitted_at, updated_at")
    .eq("org_id", clientRow.id)
    .maybeSingle();

  if (!config) {
    return NextResponse.json({ filters: null, status: "none" });
  }

  return NextResponse.json({
    filters: config.filters ?? null,
    status: config.status ?? "none",
    preview_profiles: config.preview_profiles ?? [],
    submitted_at: config.submitted_at ?? null,
    updated_at: config.updated_at ?? null,
  });
}
