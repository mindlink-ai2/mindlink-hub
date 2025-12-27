import type { Metadata } from "next";
import Link from "next/link";
import { ClerkProvider, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import "./globals.css";
import DashboardContainer from "@/components/DashboardContainer";

export const metadata: Metadata = {
  title: "Mindlink Hub",
  description: "Espace client pour agences & freelances",
};

/* 🔹 Menu Compte */
function AccountMenu() {
  return (
    <div className="relative group">
      <button className="text-[11px] text-slate-400 hover:text-slate-100 transition">
        Compte ▾
      </button>

      <div className="absolute right-0 mt-2 w-44 rounded-xl border border-slate-800 bg-slate-900 shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition">
        <div className="flex flex-col py-2 text-xs">
          <Link
            href="/dashboard"
            className="px-4 py-2 hover:bg-slate-800 transition"
          >
            Tableau de bord
          </Link>
          <Link
            href="/dashboard/prospection"
            className="px-4 py-2 hover:bg-slate-800 transition"
          >
            Prospection
          </Link>
          <Link
            href="/dashboard/followups"
            className="px-4 py-2 hover:bg-slate-800 transition"
          >
            Relances
          </Link>

          <div className="my-1 border-t border-slate-800" />

          <Link
            href="/dashboard/hub/billing"
            className="px-4 py-2 hover:bg-slate-800 transition"
          >
            Facturation
          </Link>
          <Link
            href="/dashboard/support"
            className="px-4 py-2 hover:bg-slate-800 transition"
          >
            Support
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="fr">
        <body className="bg-slate-950 text-slate-50">
          <div className="min-h-screen flex flex-col">
            {/* 🔵 HEADER */}
            <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-20">
              <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
                {/* 🔹 Logo + titre */}
                <div className="flex items-center gap-2">
                  <Link href="/" className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-500 flex items-center justify-center text-xs font-bold tracking-tight">
                      ML
                    </div>
                    <div className="flex flex-col">
                      <span className="font-semibold text-sm leading-tight">
                        Mindlink Hub
                      </span>
                      <span className="text-xs text-slate-400 leading-tight">
                        Espace client • Agences & freelances
                      </span>
                    </div>
                  </Link>
                </div>

                {/* 🔹 Navigation + User */}
                <div className="flex items-center gap-4 text-xs">
                  <SignedIn>
                    <nav className="hidden sm:flex items-center gap-3 text-[11px] text-slate-400">
                      <Link href="/dashboard" className="hover:text-slate-100 transition">
                        Dashboard
                      </Link>
                      <Link href="/dashboard/prospection" className="hover:text-slate-100 transition">
                        Prospection
                      </Link>
                      <Link href="/dashboard/followups" className="hover:text-slate-100 transition">
                        Relances
                      </Link>
                      <Link href="/dashboard/support" className="hover:text-slate-100 transition">
                        Support
                      </Link>
                    </nav>

                    <div className="flex items-center gap-4">
                      <AccountMenu />

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
              <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
                <span>© Mindlink</span>
                <div className="flex gap-4">
                  <button className="hover:text-slate-300 transition">Statut</button>
                  <button className="hover:text-slate-300 transition">Mentions légales</button>
                </div>
              </div>
            </footer>
          </div>
        </body>
      </html>
    </ClerkProvider>
  );
}