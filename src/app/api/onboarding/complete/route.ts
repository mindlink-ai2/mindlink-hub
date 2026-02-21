import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createServiceSupabase } from "@/lib/inbox-server";
import {
  getClientOnboardingStateRow,
  markClientOnboardingCompleted,
  resolveClientContextForUser,
} from "@/lib/client-onboarding-state";

export const runtime = "nodejs";

function getPrimaryEmail(user: Awaited<ReturnType<typeof currentUser>>): string | null {
  return (
    user?.emailAddresses?.find((entry) => entry.id === user.primaryEmailAddressId)
      ?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null
  );
}

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const user = await currentUser();
    const email = getPrimaryEmail(user);
    const supabase = createServiceSupabase();

    const clientContext = await resolveClientContextForUser(supabase, userId, email);
    if (!clientContext) {
      return NextResponse.json({ error: "client_not_found" }, { status: 404 });
    }

    const onboarding = await getClientOnboardingStateRow(supabase, clientContext.clientId);
    if (!onboarding) {
      return NextResponse.json({ error: "onboarding_not_found" }, { status: 404 });
    }

    await markClientOnboardingCompleted(supabase, clientContext.clientId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("ONBOARDING_COMPLETE_POST_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
