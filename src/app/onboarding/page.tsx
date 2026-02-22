import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import OnboardingActivationWizard from "@/components/onboarding/OnboardingActivationWizard";
import { createServiceSupabase } from "@/lib/inbox-server";
import {
  ensureClientOnboardingStateRow,
  getClientOnboardingStateRow,
  isLinkedinConnectedInAccounts,
  resolveClientContextForUser,
} from "@/lib/client-onboarding-state";

type WizardInitialState = {
  state: "created" | "linkedin_connected" | "completed" | null;
  linkedinConnected: boolean;
  completed: boolean;
};

function getPrimaryEmail(user: Awaited<ReturnType<typeof currentUser>>): string | null {
  return (
    user?.emailAddresses?.find((entry) => entry.id === user.primaryEmailAddressId)
      ?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null
  );
}

export default async function OnboardingWizardPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const user = await currentUser();
  const email = getPrimaryEmail(user);
  const supabase = createServiceSupabase();

  const clientContext = await resolveClientContextForUser(supabase, userId, email);
  if (!clientContext) {
    redirect("/dashboard");
  }

  await ensureClientOnboardingStateRow(supabase, clientContext.clientId);

  const onboarding = await getClientOnboardingStateRow(supabase, clientContext.clientId);
  if (!onboarding) {
    redirect("/dashboard");
  }

  const { data: accountRows } = await supabase
    .from("unipile_accounts")
    .select("provider, connected, status")
    .eq("client_id", clientContext.clientId)
    .limit(25);

  const linkedinConnected = isLinkedinConnectedInAccounts(
    Array.isArray(accountRows) ? (accountRows as Array<Record<string, unknown>>) : []
  );

  if (onboarding.state === "completed" && linkedinConnected) {
    redirect("/");
  }

  const initialStatus: WizardInitialState = {
    state: linkedinConnected ? onboarding.state : "created",
    linkedinConnected,
    completed: false,
  };

  return <OnboardingActivationWizard initialStatus={initialStatus} />;
}
