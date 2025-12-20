import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ items: [] });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");

  if (!type) {
    return NextResponse.json({ items: [] });
  }

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

  if (!client) return NextResponse.json({ items: [] });

  const clientId = client.id;

  // Dates Paris
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" })
  );

  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1); // lundi

  let items: any[] = [];

  /* --------------------------------------------
      LEADS AUJOURD'HUI
  -------------------------------------------- */
  if (type === "leads_today") {
    const [linkedin, maps] = await Promise.all([
      supabase
        .from("leads")
        .select("*")
        .eq("client_id", clientId)
        .gte("created_at", startOfDay.toISOString()),

      supabase
        .from("map_leads")
        .select("*")
        .eq("client_id", clientId)
        .gte("created_at", startOfDay.toISOString()),
    ]);

    items = [
      ...(linkedin.data ?? []).map((l) => ({ ...l, source: "linkedin" })),
      ...(maps.data ?? []).map((l) => ({ ...l, source: "maps" })),
    ];
  }

  /* --------------------------------------------
      LEADS CETTE SEMAINE
  -------------------------------------------- */
  if (type === "leads_week") {
    const [linkedin, maps] = await Promise.all([
      supabase
        .from("leads")
        .select("*")
        .eq("client_id", clientId)
        .gte("created_at", startOfWeek.toISOString()),

      supabase
        .from("map_leads")
        .select("*")
        .eq("client_id", clientId)
        .gte("created_at", startOfWeek.toISOString()),
    ]);

    items = [
      ...(linkedin.data ?? []).map((l) => ({ ...l, source: "linkedin" })),
      ...(maps.data ?? []).map((l) => ({ ...l, source: "maps" })),
    ];
  }

  /* --------------------------------------------
      LEADS TRAITÉS
  -------------------------------------------- */
  if (type === "treated") {
    const [linkedin, maps] = await Promise.all([
      supabase
        .from("leads")
        .select("*")
        .eq("client_id", clientId)
        .eq("traite", true),

      supabase
        .from("map_leads")
        .select("*")
        .eq("client_id", clientId)
        .eq("traite", true),
    ]);

    items = [
      ...(linkedin.data ?? []).map((l) => ({ ...l, source: "linkedin" })),
      ...(maps.data ?? []).map((l) => ({ ...l, source: "maps" })),
    ];
  }

  /* --------------------------------------------
      RELANCES À VENIR
  -------------------------------------------- */
  if (type === "followups_upcoming") {
    const { data } = await supabase
      .from("followups")
      .select("*")
      .eq("client_id", clientId)
      .gte("scheduled_date", startOfDay.toISOString())
      .neq("status", "done")
      .order("scheduled_date", { ascending: true });

    items = data ?? [];
  }

  /* --------------------------------------------
      RELANCES EN RETARD
  -------------------------------------------- */
  if (type === "followups_late") {
    const { data } = await supabase
      .from("followups")
      .select("*")
      .eq("client_id", clientId)
      .lt("scheduled_date", startOfDay.toISOString())
      .neq("status", "done")
      .order("scheduled_date", { ascending: true });

    items = data ?? [];
  }

  return NextResponse.json({ items });
}