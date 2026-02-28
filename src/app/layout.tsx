import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { ClerkProvider, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import "./globals.css";
import DashboardContainer from "@/components/DashboardContainer";
import InboxBackgroundSync from "@/components/InboxBackgroundSync";
import RightHitboxDebug from "@/components/dev/RightHitboxDebug";
import InboxNavLink from "@/components/InboxNavLink";
import SupportWidgetLoader from "@/components/support/SupportWidgetLoader";
import AnalyticsBootstrap from "@/components/analytics/AnalyticsBootstrap";
import MobileBottomNav from "@/components/mobile/MobileBottomNav";
import { getSupportAdminContext } from "@/lib/support-admin-auth";
import { getAnalyticsAdminContext } from "@/lib/analytics/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lidmeo Hub",
  description: "Espace client",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

function PaywallOverlay() {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#081123]/45 p-6 backdrop-blur-sm">
      {/* Glow */}
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
  let showAnalyticsAdminLink = false;

  if (user && email) {
    const { data, error } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    hasAccess = !error && !!data;
  }

  if (user) {
    const adminContext = await getSupportAdminContext();
    showSupportAdminLink = Boolean(adminContext);

    const analyticsAdminContext = await getAnalyticsAdminContext();
    showAnalyticsAdminLink = Boolean(analyticsAdminContext);
  }

  const analyticsEnabled = process.env.ANALYTICS_ENABLED === "true";

  return (
    <ClerkProvider>
      <html lang="fr">
        <body className="bg-[#ecf2fa] text-[#0f213c]">
          <div className="min-h-screen flex flex-col relative">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -top-40 left-1/2 h-[500px] w-[1120px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(31,94,255,0.14),rgba(31,94,255,0.01)_62%,transparent_78%)]" />
              <div className="absolute -left-24 top-20 h-80 w-80 rounded-full bg-[#dfeaff]/80 blur-3xl" />
              <div className="absolute -right-24 top-12 h-96 w-96 rounded-full bg-[#d8f0ff]/70 blur-3xl" />
            </div>

            {/* 🔵 HEADER */}
            <header className="sticky top-0 z-20 border-b border-[#c8d6ea] bg-[#f4f8ff]/92 backdrop-blur-xl">
              {/* ✅ élargi pour laisser respirer les pages data-heavy */}
              <div className="mx-auto flex max-w-[1480px] items-center justify-between px-4 py-3">
                {/* 🔹 Logo + titre */}
                <div className="flex items-center gap-2">
                  <Link href="/" className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#1f5eff] bg-gradient-to-tr from-[#1f5eff] to-[#1254ec] text-xs font-bold tracking-tight text-white shadow-[0_14px_24px_-16px_rgba(31,94,255,0.92)]">
                      LM
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold leading-tight text-[#0b1c33]">
                        Lidmeo Hub
                      </span>
                      <span className="text-xs leading-tight text-[#51627b]">
                        Espace client
                      </span>
                    </div>
                  </Link>
                </div>

                {/* 🔹 Navigation + User */}
                <div className="flex items-center gap-4 text-xs">
                  <SignedIn>
                    <nav className="hidden items-center gap-2 text-[11px] text-[#51627b] sm:flex">
                      <Link
                        href="/dashboard"
                        className="rounded-full border border-transparent px-3 py-1.5 transition hover:border-[#d7e3f4] hover:bg-[#f3f8ff] hover:text-[#0b1c33]"
                      >
                        Dashboard
                      </Link>
                      <Link
                        href="/dashboard/leads"
                        className="rounded-full border border-transparent px-3 py-1.5 transition hover:border-[#d7e3f4] hover:bg-[#f3f8ff] hover:text-[#0b1c33]"
                      >
                        Prospection
                      </Link>
                      <Link
                        href="/dashboard/followups"
                        className="rounded-full border border-transparent px-3 py-1.5 transition hover:border-[#d7e3f4] hover:bg-[#f3f8ff] hover:text-[#0b1c33]"
                      >
                        Relances
                      </Link>
                      <InboxNavLink />
                      <Link
                        href="/dashboard/automation"
                        className="rounded-full border border-transparent px-3 py-1.5 transition hover:border-[#d7e3f4] hover:bg-[#f3f8ff] hover:text-[#0b1c33]"
                      >
                        Automation
                      </Link>
                      <Link
                        href="/dashboard/hub/billing"
                        className="rounded-full border border-transparent px-3 py-1.5 transition hover:border-[#d7e3f4] hover:bg-[#f3f8ff] hover:text-[#0b1c33]"
                      >
                        Abonnement
                      </Link>
                      {showSupportAdminLink ? (
                        <Link
                          href="/admin/support"
                          className="rounded-full border border-transparent px-3 py-1.5 transition hover:border-[#d7e3f4] hover:bg-[#f3f8ff] hover:text-[#0b1c33]"
                        >
                          Support Admin
                        </Link>
                      ) : null}
                      {showAnalyticsAdminLink ? (
                        <Link
                          href="/admin/analytics"
                          className="rounded-full border border-transparent px-3 py-1.5 transition hover:border-[#d7e3f4] hover:bg-[#f3f8ff] hover:text-[#0b1c33]"
                        >
                          Analytics Admin
                        </Link>
                      ) : null}
                    </nav>

                    <div className="flex items-center gap-3">
                      <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] text-emerald-700 sm:inline">
                        Connecté
                      </span>

                      <UserButton
                        afterSignOutUrl="/"
                        appearance={{
                          elements: {
                            avatarBox:
                              "h-8 w-8 ring-2 ring-[#d7e3f4] shadow-sm",
                          },
                        }}
                      />
                    </div>
                  </SignedIn>

                  <SignedOut>
                    <div className="flex items-center gap-3">
                      <Link
                        href="/sign-in"
                        className="rounded-full border border-[#d7e3f4] bg-white px-3 py-1 text-xs text-[#2c466d] transition hover:bg-[#f3f8ff]"
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
                  </SignedOut>
                </div>
              </div>
            </header>

            {/* 🔵 PAGE CONTENT */}
            <main className="flex min-h-0 flex-1">
              <DashboardContainer>{children}</DashboardContainer>
            </main>

            <MobileBottomNav />
            <InboxBackgroundSync />
            <SupportWidgetLoader />
            <AnalyticsBootstrap enabled={analyticsEnabled} />
            {process.env.NODE_ENV === "development" ? <RightHitboxDebug /> : null}

            {/* 🔵 FOOTER */}
            <footer className="hidden border-t border-[#c8d6ea] bg-[#f4f8ff]/75 text-xs text-[#3f5470] md:block">
              {/* ✅ aligné avec le header */}
              <div className="mx-auto flex max-w-[1480px] items-center justify-between px-4 py-4">
                <span>© Lidmeo</span>
                <div className="flex gap-4">
                  <button className="transition hover:text-[#0b1c33]">
                    Statut
                  </button>
                  <button className="transition hover:text-[#0b1c33]">
                    Mentions légales
                  </button>
                </div>
              </div>
            </footer>
          </div>

          {/* ✅ PAYWALL : si connecté mais email absent dans public.clients */}
          {user && !hasAccess ? <PaywallOverlay /> : null}
        </body>
      </html>
    </ClerkProvider>
  );
}
