import { currentUser } from "@clerk/nextjs/server";
import { supabase } from "@/lib/supabase";

export default async function DashboardPage() {
  const user = await currentUser();

  if (!user) {
    return (
      <div className="text-sm text-red-400">
        Accès non autorisé. Veuillez vous connecter.
      </div>
    );
  }

  const clerkUserId = user.id;
  const email = user.emailAddresses[0]?.emailAddress || "email-inconnu";
  const name = user.firstName || user.username || email;

  // 1) Récupération du client
  let { data: client, error } = await supabase
    .from("clients")
    .select("*")
    .eq("email", email)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 2) Création automatique s'il n'existe pas
  if (!client && !error) {
    const { data: newClient, error: insertError } = await supabase
      .from("clients")
      .insert({
        clerk_user_id: clerkUserId,
        email,
        company_name: name,
        airtable_dashboard_url: null,
      })
      .select()
      .single();

    if (!insertError) {
      client = newClient;
    }
  }

  const airtableUrl = client?.airtable_dashboard_url as string | null;

  // Debug (optionnel)
  console.log("DASHBOARD_CLIENT", { email, client, airtableUrl, error });

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">
          Bonjour{" "}
          <span className="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">
            {name}
          </span>
        </h1>

        <p className="text-sm text-slate-400">
        Accédez en un coup d’œil à vos données clés : performances, volumes automatisés et heures gagnées, mis à jour automatiquement.
        </p>
      </header>

      {/* CONTENU */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 md:p-5">
        <h2 className="text-sm font-medium text-slate-100 mb-3">
          Dashboard de votre activité
        </h2>

        {airtableUrl ? (
          // 🟦 Airtable vraiment agrandi (hauteur réelle forcée)
          <div
            className="w-full rounded-xl overflow-hidden border border-slate-800 bg-slate-950"
            style={{ height: "1200px" }} // ← augmente si tu veux + grand
          >
            <iframe
              src={airtableUrl}
              className="w-full h-full border-0"
              referrerPolicy="no-referrer"
            />
          </div>
        ) : (
          // 📌 Placeholder si aucun dashboard Airtable configuré
          <div className="h-[240px] rounded-xl border border-dashed border-slate-700 bg-slate-950/60 flex flex-col items-center justify-center text-center px-6">
            <p className="text-sm font-medium text-slate-100 mb-2">
              Dashboard Airtable en cours de configuration
            </p>

            <p className="text-xs text-slate-400 mb-4 max-w-md">
              Votre compte est bien relié à Mindlink. Nous allons connecter
              votre dashboard Airtable pour afficher vos leads, emails
              traités, contenus créés et heures gagnées.
            </p>

            <p className="text-[11px] text-slate-500">
              Une fois prêt, ce bloc affichera votre dashboard en temps réel.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
