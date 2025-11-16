import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl">
        <h1 className="text-sm font-semibold text-slate-100 mb-4">
          Connexion à Mindlink Hub
        </h1>
        <p className="text-xs text-slate-400 mb-6">
          Utilisez l’adresse email associée à votre compte Mindlink.
        </p>

        <SignIn
          appearance={{
            elements: {
              formButtonPrimary:
                "bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-medium",
            },
          }}
        />
      </div>
    </div>
  );
}
