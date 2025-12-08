import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1️⃣ Récup client_id
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("clerk_user_id", userId)
    .single();

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const clientId = client.id;

  // 2️⃣ Dates
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const weekAgo = new Date();
  weekAgo.setDate(todayStart.getDate() - 7);

  // 3️⃣ Leads + Maps leads
  const [leads, maps] = await Promise.all([
    supabase.from("leads").select("created_at, traite").eq("client_id", clientId),
    supabase.from("map_leads").select("created_at, traite").eq("client_id", clientId),
  ]);

  const all = [...(leads.data || []), ...(maps.data || [])];

  const leadsToday = all.filter((l) => new Date(l.created_at) >= todayStart).length;
  const leadsWeek = all.filter((l) => new Date(l.created_at) >= weekAgo).length;

  const total = all.length;
  const treated = all.filter((l) => l.traite === true).length;

  const traitementRate = total === 0 ? 0 : Math.round((treated / total) * 100);

  // ----------------------------------------------------------------------
  // 4️⃣ Emails triés — depuis ta table mail_trie
  // ----------------------------------------------------------------------

  // Total d’emails triés pour ce client
  const { count: emailsSortedTotal } = await supabase
    .from("mail_trie")
    .select("*", { count: "exact", head: true })
    .eq("client_id", clientId);

  // Emails triés aujourd'hui
  const { data: emailsTodayRows } = await supabase
    .from("mail_trie")
    .select("created_at")
    .eq("client_id", clientId);

  const emailsSortedToday =
    (emailsTodayRows || []).filter(
      (row) => new Date(row.created_at) >= todayStart
    ).length;

  // ----------------------------------------------------------------------

  return NextResponse.json({
    leadsToday,
    leadsWeek,
    traitementRate,
    emailsSortedToday,
    emailsSortedTotal,       // 🔥 envoyé au front
    relancesCount: 0,
    mindlinkScore: Math.round((traitementRate + leadsWeek) / 2),
  });
}
