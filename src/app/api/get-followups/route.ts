import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ followups: [] });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Récup client
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("clerk_user_id", userId)
    .single();

  if (!client) return NextResponse.json({ followups: [] });

  // Récup followups
  const { data: followups } = await supabase
    .from("followups")
    .select(`
      id,
      lead_id,
      type,
      status,
      created_at,
      scheduled_date
    `)
    .eq("client_id", client.id)
    .order("scheduled_date", { ascending: true });

  return NextResponse.json({ followups: followups ?? [] });
}