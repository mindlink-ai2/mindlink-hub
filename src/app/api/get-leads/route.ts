import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ leads: [] });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("clerk_user_id", userId)
    .single();

  if (!client) return NextResponse.json({ leads: [] });

  const clientId = client.id;

  const { data: leads } = await supabase
    .from("leads")
    .select(
      "id, Name, FirstName, LastName, Company, LinkedInURL, location, created_at, traite"
    )
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  return NextResponse.json({ leads: leads ?? [] });
}
