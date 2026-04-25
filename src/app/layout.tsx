import type { Metadata } from "next";
import Link from "next/link";
import { ClerkProvider, SignedIn, SignedOut } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import "./globals.css";
import DashboardContainer from "@/components/DashboardContainer";
import InboxBackgroundSync from "@/components/InboxBackgroundSync";
import RightHitboxDebug from "@/components/dev/RightHitboxDebug";
import MobileBottomNav from "@/components/MobileBottomNav";
import SupportWidgetLoader from "@/components/support/SupportWidgetLoader";
import BusinessTracker from "@/components/analytics/BusinessTracker";
import Sidebar from "@/components/Sidebar";
import { getAdminContext } from "@/lib/platform-auth";
import { isPlaybookEnabled } from "@/lib/playbook-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import QueryProvider from "@/components/QueryProvider";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lidmeo Hub",
  description: "Espace client",
};

function PaywallOverlay() {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#081123]/45 p-6 backdrop-blur-sm">
      <div className="absolute inset-0 opacity-40">
        <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl bg-gradient-to-tr from-[#3b6ff6]/22 via-[#97b4fb]/12 to-[#e3e7ef]/20" />
      </div>

      <div className="relative w-full max-w-xl rounded-3xl border border-[#d7e3f4] bg-white/95 p-8 shadow-[0_26px_68px_-38px_rgba(21,55,120,0.65)]">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#d7e3f4] bg-[#f7faff] px-3 py-1 text-[11px] text-[#51627b]">
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          Accès en attente d’activation
        </div>

        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#0b1c33]">
          Active ton accès à Lidmeo
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-[#51627b]">
          Ton compte est bien créé, mais l’accès au Hub n’est pas encore activé.
          <br />
          Pour commencer à recevoir tes leads, il te suffit de choisir une offre.
        </p>

        <div className="mt-5 rounded-2xl border border-[#d7e3f4] bg-[#f8fbff] p-4">
          <div className="text-sm font-medium text-[#0b1c33]">
            Déjà souscrit ?
          </div>
          <div className="mt-1 text-sm leading-relaxed text-[#51627b]">
            Si tu viens de payer, l’activation se fait automatiquement en quelques
            minutes. Ensuite, recharge cette page.
          </div>
        </div>

        <div className="mt-7 flex flex-col gap-3">
          <Link
            href="https://lidmeo.com/offres-prospection-automatique"
            className="group inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[#1f5eff] bg-gradient-to-r from-[#1f5eff] via-[#2f70ff] to-[#1254ec] px-5 py-3.5 text-base font-semibold text-white shadow-[0_18px_28px_-18px_rgba(31,94,255,0.9)] transition hover:-translate-y-[1px]"
            style={{
              background:
                "linear-gradient(135deg, #1f5eff 0%, #2f70ff 55%, #1254ec 100%)",
            }}
          >
            Voir les offres
            <span className="opacity-80 transition group-hover:opacity-100">
              →
            </span>
          </Link>

          <div className="text-center text-xs text-[#51627b]">
            Accès généralement activé en{" "}
            <span className="text-[#0b1c33]">2 à 5 minutes</span> après paiement.
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();

  const email =
    user?.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId)
      ?.emailAddress || user?.emailAddresses?.[0]?.emailAddress;

  let hasAccess = false;
  let showSupportAdminLink = false;
  let showPlaybookLink = false;
  let isFullActivePlanClient = false;

  if (user && email) {
    const { data, error } = await supabaseAdmin
      .from("clients")
      .select("id, plan, subscription_status")
      .eq("email", email)
      .maybeSingle();

    hasAccess = !error && !!data;

    if (data) {
      const plan = String(data.plan ?? "").trim().toLowerCase();
      const subscriptionStatus = String(data.subscription_status ?? "").trim().toLowerCase();
      isFullActivePlanClient = plan === "full" && subscriptionStatus === "active";

      const clientId = Number(data.id);
      showPlaybookLink = await isPlaybookEnabled(clientId);
    }
  }

  const dashboardHref = isFullActivePlanClient ? "/dashboard/automation" : "/dashboard";

  if (user) {
    const adminContext = await getAdminContext();
    showSupportAdminLink = Boolean(adminContext);
  }

  return (
    <ClerkProvider>
      <html lang="fr">
        <body className="bg-[#F8FAFC] text-[#111827]">
          <QueryProvider>
            <SignedIn>
              <Sidebar
                dashboardHref={dashboardHref}
                showSupportAdminLink={showSupportAdminLink}
                showPlaybookLink={showPlaybookLink}
              />
            </SignedIn>

            <div
              className="relative flex min-h-screen flex-col transition-[padding-left] duration-300"
              style={
                user && hasAccess
                  ? { paddingLeft: "var(--app-shell-pl, 240px)" }
                  : undefined
              }
            >
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-40 left-1/2 h-[500px] w-[1120px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(31,94,255,0.08),rgba(31,94,255,0.01)_62%,transparent_78%)]" />
              </div>

              <SignedOut>
                <header className="sticky top-0 z-20 border-b border-[#E5E7EB] bg-white/92 backdrop-blur-xl">
                  <div className="mx-auto flex max-w-[1480px] items-center justify-between px-4 py-3">
                    <Link href="/" className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-[#1f5eff] to-[#1254ec] text-xs font-bold text-white shadow-[0_14px_24px_-16px_rgba(31,94,255,0.92)]">
                        LM
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold leading-tight text-[#111827]">
                          Lidmeo Hub
                        </span>
                        <span className="text-xs leading-tight text-[#6B7280]">
                          Espace client
                        </span>
                      </div>
                    </Link>
                    <div className="flex items-center gap-3">
                      <Link
                        href="/sign-in"
                        className="rounded-full border border-[#E5E7EB] bg-white px-3 py-1 text-xs text-[#374151] transition hover:bg-[#F3F4F6]"
                      >
                        Se connecter
                      </Link>
                      <Link
                        href="/sign-up"
                        className="hidden rounded-full border border-[#1f5eff] bg-gradient-to-r from-[#1f5eff] to-[#1254ec] px-3 py-1 text-xs font-medium text-white shadow-[0_12px_20px_-14px_rgba(31,94,255,0.9)] transition hover:-translate-y-[1px] sm:inline"
                      >
                        Créer un compte
                      </Link>
                    </div>
                  </div>
                </header>
              </SignedOut>

              <main className="flex min-h-0 flex-1">
                <DashboardContainer>{children}</DashboardContainer>
              </main>

              <MobileBottomNav dashboardHref={dashboardHref} />
              <InboxBackgroundSync />
              <SupportWidgetLoader />
              <BusinessTracker />
              {process.env.NODE_ENV === "development" ? <RightHitboxDebug /> : null}
            </div>

            {user && !hasAccess ? <PaywallOverlay /> : null}
          </QueryProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
