export default function ProspectionPage() {
    return (
      <div className="min-h-[75vh] w-full flex flex-col items-center justify-center text-center px-6">
  
        {/* 🔥 GRAND TITRE PREMIUM */}
        <h1 className="text-6xl sm:text-7xl md:text-8xl font-extrabold tracking-tight mb-6 leading-tight">
          Votre espace <span className="text-blue-500">prospection</span>
        </h1>
  
        {/* 📝 Sous-titre */}
        <p className="text-slate-300 text-lg sm:text-xl leading-relaxed max-w-2xl mb-12">
          Choisissez votre canal de prospection. Mindlink automatise vos tâches,
          organise vos leads et vous aide à ne plus perdre une seule opportunité.
        </p>
  
        {/* 🚀 Boutons */}
        <div className="flex flex-row gap-6">
  
          <a
            href="/dashboard/leads"
            className="
              px-8 py-4 rounded-xl border border-slate-700
              bg-black/40 backdrop-blur-sm
              text-white font-semibold text-lg
              transition-all duration-200
              hover:border-blue-500 hover:bg-blue-500/10 hover:shadow-[0_0_20px_rgba(0,102,255,0.3)]
            "
          >
            Prospection LinkedIn
          </a>
  
          <a
            href="/dashboard/maps"
            className="
              px-8 py-4 rounded-xl border border-slate-700
              bg-black/40 backdrop-blur-sm
              text-white font-semibold text-lg
              transition-all duration-200
              hover:border-blue-500 hover:bg-blue-500/10 hover:shadow-[0_0_20px_rgba(0,102,255,0.3)]
            "
          >
            Prospection Maps
          </a>
  
        </div>
  
      </div>
    );
  }
  