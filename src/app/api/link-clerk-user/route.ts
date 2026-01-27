import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await currentUser();
  const email =
    user?.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId)
      ?.emailAddress || user?.emailAddresses?.[0]?.emailAddress;

  if (!email) {
    return NextResponse.json({ error: "No email found on Clerk user" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ✅ Update la ligne existante (créée par Stripe webhook)
  // On lie juste clerk_user_id à l'email
  const { data, error } = await supabase
    .from("clients")
    .update({ clerk_user_id: userId })
    .eq("email", email)
    .select("id, clerk_user_id, email")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: "Client not found for this email (Stripe row not created yet)", email },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, client: data });
}