import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import {
  ensureClientOnboardingStateRow,
  resolveClientContextForUser,
} from "@/lib/client-onboarding-state";

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

  try {
    const context = await resolveClientContextForUser(supabase, userId, email);
    if (!context) {
      return NextResponse.json({
        ok: true,
        linked: false,
        reason: "not_found_or_already_linked",
        email,
      });
    }

    if (context.linkedNow) {
      await ensureClientOnboardingStateRow(supabase, context.clientId);
    }

    return NextResponse.json({
      ok: true,
      linked: context.linkedNow,
      client: {
        id: context.clientId,
        email,
        clerk_user_id: userId,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
