import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

export async function POST() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ✅ IMPORTANT : clerkClient est async dans ta version -> il faut l'appeler
  const client = await clerkClient();

  const user = await client.users.getUser(userId);

  const email =
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
      ?.emailAddress || user.emailAddresses?.[0]?.emailAddress;

  if (!email) {
    return NextResponse.json({ error: "No email found on Clerk user" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ✅ update uniquement si clerk_user_id est NULL (ça évite d’écraser)
  const { data, error } = await supabase
    .from("clients")
    .update({ clerk_user_id: userId })
    .eq("email", email)
    .is("clerk_user_id", null)
    .select("id, email, clerk_user_id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    // soit email pas trouvé, soit déjà lié
    return NextResponse.json({ ok: true, linked: false, reason: "not_found_or_already_linked", email });
  }

  return NextResponse.json({ ok: true, linked: true, client: data });
}