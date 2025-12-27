import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from("clients")
    .select("plan, subscription_status, current_period_end")
    .eq("clerk_user_id", userId)
    .single();

  if (error || !data) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  return NextResponse.json({
    plan: data.plan ?? null,
    subscription_status: data.subscription_status ?? null,
    current_period_end: data.current_period_end ?? null,
  });
}