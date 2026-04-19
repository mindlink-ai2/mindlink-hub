import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createServiceSupabase } from "@/lib/inbox-server";
import {
  ensureClientOnboardingStateRow,
  isLinkedinConnectedInAccounts,
  resolveClientContextForUser,
} from "@/lib/client-onboarding-state";

function getPrimaryEmail(user: Awaited<ReturnType<typeof currentUser>>): string | null {
  return (
    user?.emailAddresses?.find((entry) => entry.id === user.primaryEmailAddressId)
      ?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null
  );
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const user = await currentUser();
  const email = getPrimaryEmail(user);
  const supabase = createServiceSupabase();

  const clientContext = await resolveClientContextForUser(supabase, userId, email);
  if (!clientContext) {
    return <>{children}</>;
  }

  await ensureClientOnboardingStateRow(supabase, clientContext.clientId);

  const { data: accountRows, error: accountErr } = await supabase
    .from("unipile_accounts")
    .select("provider, connected, status")
    .eq("client_id", clientContext.clientId)
    .limit(25);

  if (!accountErr) {
    const linkedinConnected = isLinkedinConnectedInAccounts(
      Array.isArray(accountRows) ? (accountRows as Array<Record<string, unknown>>) : []
    );

    if (!linkedinConnected) {
      redirect("/onboarding");
    }
  }

  return <>{children}</>;
}
