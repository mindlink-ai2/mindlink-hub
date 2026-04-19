import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createServiceSupabase } from "@/lib/inbox-server";
import {
  ensureClientOnboardingStateRow,
  getClientOnboardingStateRow,
  resolveClientContextForUser,
} from "@/lib/client-onboarding-state";
import OnboardingVideoStep from "@/components/onboarding/OnboardingVideoStep";

const VIDEO_URLS: Record<string, string> = {
  full: "https://assets.lidmeo.com/Pre%CC%81sentation%20lidmeo%20Full.mp4",
  essential: "https://assets.lidmeo.com/Video%20Pre%CC%81sentation%20essential.mp4",
};
const THUMBNAIL_URL = "https://assets.lidmeo.com/thumbnail-full.png";

function getPrimaryEmail(user: Awaited<ReturnType<typeof currentUser>>): string | null {
  return (
    user?.emailAddresses?.find((entry) => entry.id === user.primaryEmailAddressId)
      ?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null
  );
}

export default async function OnboardingVideoPage() {
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

  // Video is shown after messages-setup (state: completed) or the legacy
  // post-form step (state: icp_submitted). Earlier states → restart onboarding.
  if (onboarding.state !== "completed" && onboarding.state !== "icp_submitted") {
    redirect("/onboarding");
  }

  // Fetch client plan for video selection
  const { data: clientData } = await supabase
    .from("clients")
    .select("plan")
    .eq("id", clientContext.clientId)
    .maybeSingle();

  const plan = String(clientData?.plan ?? "essential").trim().toLowerCase();
  const videoUrl = VIDEO_URLS[plan] ?? VIDEO_URLS.essential;

  return <OnboardingVideoStep videoUrl={videoUrl} thumbnailUrl={THUMBNAIL_URL} />;
}
