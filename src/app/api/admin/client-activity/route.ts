import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/inbox-server";
import { getAdminContext } from "@/lib/platform-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const adminCtx = await getAdminContext();
  if (!adminCtx) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const orgIdRaw = url.searchParams.get("org_id");
  const orgId = orgIdRaw ? Number(orgIdRaw) : NaN;
  if (!Number.isFinite(orgId)) {
    return NextResponse.json({ error: "org_id required" }, { status: 400 });
  }

  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("client_activity_logs")
    .select("id, action, details, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data ?? [] });
}
