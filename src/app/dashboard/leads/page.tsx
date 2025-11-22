import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import TraiteCheckbox from "./TraiteCheckbox";
import DeleteLeadButton from "./DeleteLeadButton";

export default async function LeadsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1️⃣ Récup client
  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("clerk_user_id", userId)
    .single();

  if (!client) {
    return (
      <div className="text-red-400 text-sm">
        Impossible de récupérer votre profil client.
      </div>
    );
  }

  const clientId = client.id;

  // 2️⃣ Récup leads
  const { data: leads } = await supabase
    .from("leads")
    .select(
      "id, Name, FirstName, LastName, Company, LinkedInURL, location, created_at, traite"
    )
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  const safeLeads = leads ?? [];

  // KPIs
  const total = safeLeads.length;
  const treatedCount = safeLeads.filter((l) => l.traite === true).length;
  const remainingToTreat = total - treatedCount;

  // 🕒 PROCHAINE IMPORTATION – heure française (Europe/Paris)
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" })
  );

  const nextImport = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" })
  );
  nextImport.setHours(8, 0, 0, 0);

  if (now > nextImport) {
    nextImport.setDate(nextImport.getDate() + 1);
  }

  const diffMs = nextImport.getTime() - now.getTime();
  const diffMinutes = Math.floor(diffMs / 1000 / 60);
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;

  const nextImportText =
    hours <= 0 ? `Dans ${minutes} min` : `Dans ${hours}h ${minutes}min`;

  return (
    <div className="space-y-10">
      {/* HEADER */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-50">
            Leads générés
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Tous vos prospects qualifiés, importés automatiquement par Mindlink.
          </p>
        </div>

        <a
          href="/dashboard/leads/export"
          className="px-4 py-2 text-xs rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 transition"
        >
          Exporter CSV
        </a>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <KPI title="Total leads" value={total} text="Leads totaux générés" />

        <KPI
          title="À traiter"
          value={remainingToTreat}
          text={`${remainingToTreat} leads restant à traiter`}
        />

        <KPI
          title="Prochaine importation"
          value={nextImportText}
          text="Import automatique à 8h00"
        />
      </div>

      {/* TABLE CARD */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/90 shadow-md overflow-hidden">
        {/* TOP BAR */}
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center">
          <div>
            <h2 className="text-slate-100 text-sm font-medium">Liste des leads</h2>
            <p className="text-[11px] text-slate-500">
              Tous vos leads triés du plus récent au plus ancien.
            </p>
          </div>
          <div className="text-[11px] text-slate-400">
            {safeLeads.length} lead(s)
          </div>
        </div>

        {/* TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr className="bg-slate-900 text-slate-300 text-[11px] uppercase tracking-wide">
                <th className="py-3 px-4 border-b border-slate-800">Traité</th>
                <th className="py-3 px-4 border-b border-slate-800 text-left">Nom</th>
                <th className="py-3 px-4 border-b border-slate-800 text-left">Entreprise</th>
                <th className="py-3 px-4 border-b border-slate-800 text-left">Localisation</th>
                <th className="py-3 px-4 border-b border-slate-800 text-left">LinkedIn</th>
                <th className="py-3 px-4 border-b border-slate-800 text-center">Date</th>

                {/* 🗑️ Supprimer */}
                <th className="py-3 px-4 border-b border-slate-800 text-center">
                  Supprimer
                </th>
              </tr>
            </thead>

            <tbody>
              {safeLeads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    Aucun lead pour le moment.
                  </td>
                </tr>
              ) : (
                safeLeads.map((lead) => {
                  const fullName =
                    `${lead.FirstName ?? ""} ${lead.LastName ?? ""}`.trim() ||
                    lead.Name ||
                    "—";

                  return (
                    <tr
                      key={lead.id}
                      className="border-b border-slate-900 hover:bg-slate-900/70 transition"
                    >
                      {/* TRAITÉ */}
                      <td className="py-3 px-4 text-center">
                        <TraiteCheckbox
                          leadId={lead.id}
                          defaultChecked={Boolean(lead.traite)}
                        />
                      </td>

                      {/* NOM */}
                      <td className="py-3 px-4 text-slate-50">{fullName}</td>

                      {/* ENTREPRISE */}
                      <td className="py-3 px-4 text-slate-300">
                        {lead.Company || "—"}
                      </td>

                      {/* LOCALISATION */}
                      <td className="py-3 px-4 text-slate-300">
                        {lead.location || "—"}
                      </td>

                      {/* LINKEDIN */}
                      <td className="py-3 px-4">
                        {lead.LinkedInURL ? (
                          <a
                            href={lead.LinkedInURL}
                            target="_blank"
                            className="text-sky-400 hover:underline"
                          >
                            Voir profil
                          </a>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>

                      {/* DATE */}
                      <td className="py-3 px-4 text-center text-slate-400">
                        {lead.created_at
                          ? new Date(lead.created_at).toLocaleDateString("fr-FR")
                          : "—"}
                      </td>

                      {/* SUPPRIMER */}
                      <td className="py-3 px-4 text-center">
                        <DeleteLeadButton leadId={lead.id} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* 🔹 KPI Component */
function KPI({ title, value, text }: { title: string; value: any; text: string }) {
  return (
    <div className="rounded-2xl bg-slate-950 border border-slate-800 p-6 flex flex-col items-center text-center">
      <div className="text-[11px] text-slate-500 uppercase tracking-wide">{title}</div>
      <div className="text-3xl font-semibold text-slate-50 mt-1">{value}</div>
      <p className="text-[11px] text-slate-500 mt-1">{text}</p>
    </div>
  );
}
