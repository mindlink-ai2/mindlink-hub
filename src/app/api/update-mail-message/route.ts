import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await req.json();
  const { leadId, message } = body;

  if (!leadId)
    return NextResponse.json({ error: "leadId manquant" }, { status: 400 });

  // Mise à jour dans Supabase
  const { error } = await supabase
    .from("leads")
    .update({ message_mail: message })
    .eq("id", leadId);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}