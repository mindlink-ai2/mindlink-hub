import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const { userId } = await auth();

  // Si pas connecté → refuse
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { leadId } = await req.json();

  if (!leadId) {
    return NextResponse.json({ error: "Missing leadId" }, { status: 400 });
  }

  // On vérifie que le lead appartient au client Clerk
  const { data: lead, error: fetchError } = await supabase
    .from("leads")
    .select("id, client_id")
    .eq("id", leadId)
    .single();

  if (fetchError || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // On récupère le client via Clerk userId
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("clerk_user_id", userId)
    .single();

  if (!client || client.id !== lead.client_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Mise à jour → stop relance
  const { data: updated, error } = await supabase
    .from("leads")
    .update({
      responded: true,
      next_followup_at: null,
    })
    .eq("id", leadId)
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ lead: updated });
}