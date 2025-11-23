import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1️⃣ Récup client
  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("clerk_user_id", userId)
    .single();

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const clientId = client.id;

  // Dates
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekAgo = new Date();
  weekAgo.setDate(today.getDate() - 7);

  // Leads Today (LinkedIn + Map)
  const { count: leadsTodayLinkedin } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("client_id", clientId)
    .gte("created_at", today.toISOString());

  const { count: leadsTodayMaps } = await supabase
    .from("map_leads")
    .select("*", { count: "exact", head: true })
    .eq("client_id", clientId)
    .gte("created_at", today.toISOString());

  // Leads Week
  const { count: leadsWeekLinkedin } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("client_id", clientId)
    .gte("created_at", weekAgo.toISOString());

  const { count: leadsWeekMaps } = await supabase
    .from("map_leads")
    .select("*", { count: "exact", head: true })
    .eq("client_id", clientId)
    .gte("created_at", weekAgo.toISOString());

  // Traitement Rate
  const { count: totalLeads } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("client_id", clientId);

  const { count: treatedLeads } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("traite", true);

  const traitementRate =
    totalLeads && totalLeads > 0
      ? Math.round((treatedLeads! / totalLeads!) * 100)
      : 0;

  // Score Mindlink
  const mindlinkScore = Math.min(
    100,
    Math.round(
      traitementRate * 0.6 +
        ((leadsWeekLinkedin! + leadsWeekMaps!) > 0 ? 40 : 10)
    )
  );

  return NextResponse.json({
    leadsToday: (leadsTodayLinkedin || 0) + (leadsTodayMaps || 0),
    leadsWeek: (leadsWeekLinkedin || 0) + (leadsWeekMaps || 0),
    traitementRate,
    emailsSortedToday: 0,
    relancesCount: 0,
    mindlinkScore,
  });
}
