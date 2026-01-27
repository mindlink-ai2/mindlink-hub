import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ✅ Récupère l’email Clerk (primary si possible)
  const user = await clerkClient.users.getUser(userId);
  const primaryEmail =
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ||
    user.emailAddresses[0]?.emailAddress;

  if (!primaryEmail) {
    return NextResponse.json({ error: "No email found on Clerk user" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ✅ On met à jour UNIQUEMENT si clerk_user_id est encore NULL
  const { data, error } = await supabase
    .from("clients")
    .update({ clerk_user_id: userId })
    .eq("email", primaryEmail)
    .is("clerk_user_id", null)
    .select("id, email, clerk_user_id")
    .single();

  if (error) {
    // Si aucune ligne ne match (email pas trouvé), Supabase renvoie souvent une erreur sur .single()
    return NextResponse.json(
      { error: "Client not found for this email (or already linked)", details: error.message },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, linked: data });
}