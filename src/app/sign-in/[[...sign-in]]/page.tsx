import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-220px] h-[520px] w-[880px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(72,128,241,0.2),rgba(72,128,241,0.05)_58%,transparent_74%)]" />
        <div className="absolute -left-20 top-28 h-72 w-72 rounded-full bg-[#e4edff] blur-3xl" />
        <div className="absolute -right-24 bottom-20 h-80 w-80 rounded-full bg-[#dfeaff] blur-3xl" />
      </div>

      <div className="relative w-full max-w-md rounded-[28px] border border-[#dbe7ff] bg-white/95 p-6 shadow-[0_34px_70px_-46px_rgba(58,108,205,0.58)] sm:p-7">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#d4e1fb] bg-[#f5f9ff] px-3 py-1 text-[11px] font-medium text-[#3d5d8c]">
          <span className="h-2 w-2 rounded-full bg-[#3671ed]" />
          Lidmeo Hub
        </div>

        <h1 className="mb-2 mt-4 text-xl font-semibold text-[#132f58]">
          Connexion à Mindlink Hub
        </h1>
        <p className="mb-6 text-sm text-[#60789f]">
          Utilisez l’adresse email associée à votre compte Mindlink.
        </p>

        <SignIn
          appearance={{
            elements: {
              card: "shadow-none border-0 bg-transparent",
              rootBox: "w-full",
              formButtonPrimary:
                "bg-[#316ded] hover:bg-[#245dd9] text-white text-sm font-medium rounded-xl",
              socialButtonsBlockButton:
                "border-[#d4e2fb] text-[#2a4b79] hover:bg-[#f5f9ff]",
              formFieldInput:
                "border-[#d7e3fb] bg-[#f8fbff] text-[#14345f] focus:border-[#b8cdf5] focus:ring-[#8eaef4]/35",
              footerActionLink: "text-[#2e64d3] hover:text-[#2458c3]",
            },
          }}
        />
      </div>
    </div>
  );
}
