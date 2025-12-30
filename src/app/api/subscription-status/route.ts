import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ subscription_status: null }, { status: 200 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from("clients")
    .select("subscription_status")
    .eq("clerk_user_id", userId)
    .single();

  if (error) {
    return NextResponse.json({ subscription_status: null }, { status: 200 });
  }

  return NextResponse.json(
    { subscription_status: data?.subscription_status ?? null },
    { status: 200 }
  );
}