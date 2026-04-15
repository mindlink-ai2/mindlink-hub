import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createServiceSupabase } from "@/lib/inbox-server";
import {
  markClientOnboardingIcpSubmitted,
  resolveClientContextForUser,
} from "@/lib/client-onboarding-state";

export const runtime = "nodejs";

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const user = await currentUser();
    const email =
      user?.primaryEmailAddress?.emailAddress ||
      user?.emailAddresses?.[0]?.emailAddress ||
      null;

    const supabase = createServiceSupabase();
    const clientContext = await resolveClientContextForUser(supabase, userId, email);
    if (!clientContext) {
      return NextResponse.json({ error: "client_not_found" }, { status: 404 });
    }

    await markClientOnboardingIcpSubmitted(supabase, clientContext.clientId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[onboarding/mark-icp-submitted] error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
