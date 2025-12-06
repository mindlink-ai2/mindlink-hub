import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  // Vérification de l'utilisateur via Clerk
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  // Connexion Supabase
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Lecture du body
  const body = await req.json();
  const { leadId } = body;

  if (!leadId)
    return NextResponse.json({ error: "leadId manquant" }, { status: 400 });

  // Génération dates (maintenant + prochaine relance J+7)
  const now = new Date();
  const next = new Date();
  next.setDate(now.getDate() + 7);

  // Mise à jour en BDD
  const { data, error } = await supabase
    .from("leads")
    .update({
      message_sent: true,
      message_sent_at: now.toISOString(),
      next_followup_at: next.toISOString(),
    })
    .eq("id", leadId)
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, lead: data });
}