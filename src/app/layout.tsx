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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0a1428]/45 backdrop-blur-sm p-6">
      {/* Glow */}
      <div className="absolute inset-0 opacity-60">
        <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl bg-gradient-to-tr from-[#3d78ff]/30 via-[#7fa2ff]/20 to-[#dbe7ff]/15" />
      </div>

      <div className="relative w-full max-w-xl rounded-3xl border border-[#d9e5ff] bg-white/95 p-8 shadow-2xl shadow-[#3d78ff]/20">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#d7e3ff] bg-[#f3f7ff] px-3 py-1 text-[11px] text-[#304a80]">
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          Accès en attente d’activation
        </div>

        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#0f1f3d]">
          Active ton accès à Lidmeo
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-[#4d6188]">
          Ton compte est bien créé, mais l’accès au Hub n’est pas encore activé.
          <br />
          Pour commencer à recevoir tes leads, il te suffit de choisir une offre.
        </p>

        <div className="mt-5 rounded-2xl border border-[#dce7ff] bg-[#f7faff] p-4">
          <div className="text-sm font-medium text-[#102546]">
            Déjà souscrit ?
          </div>
          <div className="mt-1 text-sm text-[#50658d] leading-relaxed">
            Si tu viens de payer, l’activation se fait automatiquement en quelques
            minutes. Ensuite, recharge cette page.
          </div>
        </div>

        <div className="mt-7 flex flex-col gap-3">
          <Link
            href="https://lidmeo.com/offres-prospection-automatique"
            className="group inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-base font-semibold text-white shadow-lg shadow-[#3d78ff]/30 transition hover:opacity-95"
            style={{
              background:
                "linear-gradient(135deg, #3E74F4 0%, #2D66E8 55%, #2553D6 100%)",
            }}
          >
            Voir les offres
            <span className="opacity-80 transition group-hover:opacity-100">
              →
            </span>
          </Link>

          <div className="text-center text-xs text-[#5a6f94]">
            Accès généralement activé en{" "}
            <span className="text-[#17325e]">2 à 5 minutes</span> après paiement.
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
        <body className="bg-[#f5f7fc] text-[#102242]">
          <div className="min-h-screen flex flex-col relative">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -top-36 left-1/2 h-[420px] w-[980px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(64,122,255,0.16),rgba(64,122,255,0.03)_58%,transparent_75%)]" />
              <div className="absolute -left-24 top-32 h-72 w-72 rounded-full bg-[#e9f0ff]/80 blur-3xl" />
              <div className="absolute -right-24 top-24 h-80 w-80 rounded-full bg-[#dfe9ff]/70 blur-3xl" />
            </div>

            {/* 🔵 HEADER */}
            <header className="sticky top-0 z-20 border-b border-[#dce5f8] bg-white/75 backdrop-blur-xl">
              {/* ✅ élargi pour laisser respirer les pages data-heavy */}
              <div className="max-w-[1480px] mx-auto flex items-center justify-between px-4 py-3">
                {/* 🔹 Logo + titre */}
                <div className="flex items-center gap-2">
                  <Link href="/" className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-[#4d83ff] to-[#2855cf] flex items-center justify-center text-xs font-bold tracking-tight text-white shadow-lg shadow-[#3972ea]/25">
                      LM
                    </div>
                    <div className="flex flex-col">
                      <span className="font-semibold text-sm leading-tight text-[#12284b]">
                        Lidmeo Hub
                      </span>
                      <span className="text-xs text-[#5f7398] leading-tight">
                        Espace client
                      </span>
                    </div>
                  </Link>
                </div>

                {/* 🔹 Navigation + User */}
                <div className="flex items-center gap-4 text-xs">
                  <SignedIn>
                    <nav className="hidden sm:flex items-center gap-2 text-[11px] text-[#50658d]">
                      <Link
                        href="/dashboard"
                        className="rounded-full border border-transparent px-3 py-1.5 hover:border-[#d6e2ff] hover:bg-[#f4f7ff] hover:text-[#173664] transition"
                      >
                        Dashboard
                      </Link>
                      <Link
                        href="/dashboard/leads"
                        className="rounded-full border border-transparent px-3 py-1.5 hover:border-[#d6e2ff] hover:bg-[#f4f7ff] hover:text-[#173664] transition"
                      >
                        Prospection
                      </Link>
                      <Link
                        href="/dashboard/followups"
                        className="rounded-full border border-transparent px-3 py-1.5 hover:border-[#d6e2ff] hover:bg-[#f4f7ff] hover:text-[#173664] transition"
                      >
                        Relances
                      </Link>
                      <Link
                        href="/dashboard/hub/billing"
                        className="rounded-full border border-transparent px-3 py-1.5 hover:border-[#d6e2ff] hover:bg-[#f4f7ff] hover:text-[#173664] transition"
                      >
                        Abonnement
                      </Link>
                      <Link
                        href="/dashboard/support"
                        className="rounded-full border border-transparent px-3 py-1.5 hover:border-[#d6e2ff] hover:bg-[#f4f7ff] hover:text-[#173664] transition"
                      >
                        Support
                      </Link>
                    </nav>

                    <div className="flex items-center gap-3">
                      <span className="hidden sm:inline text-[11px] text-emerald-700 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                        Connecté
                      </span>

                      <UserButton
                        afterSignOutUrl="/"
                        appearance={{
                          elements: {
                            avatarBox:
                              "h-8 w-8 ring-2 ring-[#dbe6ff] shadow-sm",
                          },
                        }}
                      />
                    </div>
                  </SignedIn>

                  <SignedOut>
                    <div className="flex items-center gap-3">
                      <Link
                        href="/sign-in"
                        className="rounded-full border border-[#d5e0f8] bg-white/80 px-3 py-1 text-xs text-[#26426f] hover:bg-[#f3f7ff] transition"
                      >
                        Se connecter
                      </Link>
                      <Link
                        href="/sign-up"
                        className="hidden sm:inline rounded-full bg-[#316dee] px-3 py-1 text-xs font-medium text-white hover:bg-[#245edd] transition shadow-lg shadow-[#3b73eb]/30"
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
            <footer className="border-t border-[#dce5f8] text-xs text-[#5d7296] bg-white/40">
              {/* ✅ aligné avec le header */}
              <div className="max-w-[1480px] mx-auto px-4 py-4 flex items-center justify-between">
                <span>© Lidmeo</span>
                <div className="flex gap-4">
                  <button className="hover:text-[#2b4f82] transition">
                    Statut
                  </button>
                  <button className="hover:text-[#2b4f82] transition">
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
