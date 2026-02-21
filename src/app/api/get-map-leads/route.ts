import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_PAGE_SIZE = 1000;

async function fetchAllMapLeadsForClient(
  supabase: ReturnType<typeof createClient>,
  clientId: number | string
) {
  const rows: Record<string, unknown>[] = [];
  let from = 0;

  while (true) {
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("map_leads")
      .select(`
        id,
        title,
        email,
        phoneNumber,
        website,
        placeUrl,
        created_at,
        traite,
        internal_message,
        message_sent,
        message_sent_at,
        next_followup_at
      `)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);

    if (batch.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }

  return rows;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ leads: [] });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("clerk_user_id", userId)
    .single();

  if (!client) return NextResponse.json({ leads: [] });

  let leads: Record<string, unknown>[] = [];
  try {
    leads = await fetchAllMapLeadsForClient(supabase, client.id);
  } catch (leadsErr) {
    console.error("Failed to load map leads:", leadsErr);
    return NextResponse.json({ error: "Failed to load map leads" }, { status: 500 });
  }

  return NextResponse.json({ leads: leads ?? [] });
}
