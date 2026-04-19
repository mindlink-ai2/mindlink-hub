import { auth, currentUser } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServiceSupabase } from "@/lib/inbox-server";
import {
  ensureClientOnboardingStateRow,
  getClientOnboardingStateRow,
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

  const hdrs = await headers();
  const pathname =
    hdrs.get("x-invoke-path") ??
    hdrs.get("x-pathname") ??
    hdrs.get("next-url") ??
    "";
  const isIcpBuilderRoute = pathname.startsWith("/dashboard/hub/icp-builder");
  const isMessagesSetupRoute = pathname.startsWith("/dashboard/hub/messages-setup");

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

    const onboarding = await getClientOnboardingStateRow(supabase, clientContext.clientId);
    const state = onboarding?.state ?? "created";

    // Onboarding sub-pages hosted under /dashboard/hub.
    // These routes ARE part of the onboarding flow — allow them even if
    // onboarding isn't completed, but only at the matching state.
    if (isIcpBuilderRoute) {
      if (state === "completed") {
        return <>{children}</>;
      }
      if (state === "linkedin_connected") {
        return <>{children}</>;
      }
      redirect("/onboarding");
    }

    if (isMessagesSetupRoute) {
      if (state === "completed") {
        return <>{children}</>;
      }
      if (state === "icp_submitted") {
        return <>{children}</>;
      }
      if (state === "linkedin_connected") {
        redirect("/dashboard/hub/icp-builder");
      }
      redirect("/onboarding");
    }

    // Any other dashboard route: must be fully completed.
    if (state !== "completed") {
      if (state === "linkedin_connected") {
        redirect("/dashboard/hub/icp-builder");
      }
      if (state === "icp_submitted") {
        redirect("/dashboard/hub/messages-setup");
      }
      redirect("/onboarding");
    }
  }

  return <>{children}</>;
}
