import type { Metadata } from "next";
import Link from "next/link";
import { ClerkProvider, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import "./globals.css";
import DashboardContainer from "@/components/DashboardContainer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lidmeo Hub",
  description: "Espace client",
};

function PaywallOverlay() {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 p-7 shadow-2xl">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-50">
          Accès non activé
        </h2>

        <p className="mt-3 text-sm text-slate-300 leading-relaxed">
          Pour utiliser Lidmeo, tu dois souscrire à une offre.
          <br />
          Si tu viens de payer, ton accès sera disponible dans quelques minutes.
        </p>

        <div className="mt-6">
          <Link
            href="https://lidmeo.com/offres-prospection-automatique"
            className="inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-base font-medium text-slate-950 shadow-lg shadow-sky-500/20 hover:opacity-95 transition"
            style={{
              background:
                "linear-gradient(135deg, #38BDF8 0%, #6366F1 55%, #8B5CF6 100%)",
            }}
          >
            Voir les offres & activer mon accès
          </Link>

          <p className="mt-3 text-xs text-slate-400 text-center">
            Une fois activé, recharge cette page.
          </p>
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

  if (user && email) {
    const { data, error } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    hasAccess = !error && !!data;
  }

  return (
    <ClerkProvider>
      <html lang="fr">
        <body className="bg-slate-950 text-slate-50">
          <div className="min-h-screen flex flex-col">
            {/* 🔵 HEADER */}
            <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-20">
              {/* ✅ élargi pour laisser respirer les pages data-heavy */}
              <div className="max-w-[1480px] mx-auto flex items-center justify-between px-4 py-3">
                {/* 🔹 Logo + titre */}
                <div className="flex items-center gap-2">
                  <Link href="/" className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-500 flex items-center justify-center text-xs font-bold tracking-tight">
                      LM
                    </div>
                    <div className="flex flex-col">
                      <span className="font-semibold text-sm leading-tight">
                        Lidmeo Hub
                      </span>
                      <span className="text-xs text-slate-400 leading-tight">
                        Espace client
                      </span>
                    </div>
                  </Link>
                </div>

                {/* 🔹 Navigation + User */}
                <div className="flex items-center gap-4 text-xs">
                  <SignedIn>
                    <nav className="hidden sm:flex items-center gap-3 text-[11px] text-slate-400">
                      <Link
                        href="/dashboard"
                        className="hover:text-slate-100 transition"
                      >
                        Dashboard
                      </Link>
                      <Link
                        href="/dashboard/leads"
                        className="hover:text-slate-100 transition"
                      >
                        Prospection
                      </Link>
                      <Link
                        href="/dashboard/followups"
                        className="hover:text-slate-100 transition"
                      >
                        Relances
                      </Link>
                      <Link
                        href="/dashboard/hub/billing"
                        className="hover:text-slate-100 transition"
                      >
                        Abonnement
                      </Link>
                      <Link
                        href="/dashboard/support"
                        className="hover:text-slate-100 transition"
                      >
                        Support
                      </Link>
                    </nav>

                    <div className="flex items-center gap-3">
                      <span className="hidden sm:inline text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-full">
                        Connecté
                      </span>

                      <UserButton
                        afterSignOutUrl="/"
                        appearance={{ elements: { avatarBox: "h-8 w-8" } }}
                      />
                    </div>
                  </SignedIn>

                  <SignedOut>
                    <div className="flex items-center gap-3">
                      <Link
                        href="/sign-in"
                        className="rounded-full border border-slate-700 px-3 py-1 text-xs hover:bg-slate-800 transition"
                      >
                        Se connecter
                      </Link>
                      <Link
                        href="/sign-up"
                        className="hidden sm:inline rounded-full bg-sky-500 px-3 py-1 text-xs font-medium text-slate-950 hover:bg-sky-400 transition shadow-lg shadow-sky-500/30"
                      >
                        Créer un compte
                      </Link>
                    </div>
                  </SignedOut>
                </div>
              </div>
            </header>

            {/* 🔵 PAGE CONTENT */}
            <main className="flex-1">
              <DashboardContainer>{children}</DashboardContainer>
            </main>

            {/* 🔵 FOOTER */}
            <footer className="border-t border-slate-900 text-xs text-slate-500">
              {/* ✅ aligné avec le header */}
              <div className="max-w-[1480px] mx-auto px-4 py-4 flex items-center justify-between">
                <span>© Lidmeo</span>
                <div className="flex gap-4">
                  <button className="hover:text-slate-300 transition">
                    Statut
                  </button>
                  <button className="hover:text-slate-300 transition">
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