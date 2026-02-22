import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createServiceSupabase } from "@/lib/inbox-server";
import {
  ensureClientOnboardingStateRow,
  getClientOnboardingStateRow,
  isLinkedinConnectedInAccounts,
  markClientOnboardingLinkedinConnected,
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

export async function GET() {
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
      return NextResponse.json({ connected: false });
    }

    await ensureClientOnboardingStateRow(supabase, clientContext.clientId);

    const onboarding = await getClientOnboardingStateRow(supabase, clientContext.clientId);
    if (!onboarding) {
      return NextResponse.json({ connected: false });
    }

    const { data: accountRows, error: accountErr } = await supabase
      .from("unipile_accounts")
      .select("provider, connected, status")
      .eq("client_id", clientContext.clientId)
      .limit(25);

    if (accountErr) {
      return NextResponse.json({ error: "unipile_accounts_fetch_failed" }, { status: 500 });
    }

    const connected = isLinkedinConnectedInAccounts(
      Array.isArray(accountRows) ? (accountRows as Array<Record<string, unknown>>) : []
    );

    if (connected && onboarding.state !== "completed") {
      await markClientOnboardingLinkedinConnected(supabase, clientContext.clientId);
    }

    return NextResponse.json({ connected });
  } catch (error) {
    console.error("ONBOARDING_LINKEDIN_STATUS_GET_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
