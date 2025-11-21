import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import TraiteCheckbox from "./TraiteCheckbox";

export default async function MapsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1️⃣ Récup client (pour obtenir son client_id)
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

  // 2️⃣ Récupération des leads Google Maps
  const { data: mapsLeads } = await supabase
    .from("maps_leads")
    .select(
      "id, title, address, website, phoneNumber, placeUrl, created_at, traite"
    )
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  const safeLeads = mapsLeads ?? [];

  // KPIs
  const total = safeLeads.length;

  const thisMonth =
    safeLeads.filter((l) => {
      const d = l.created_at ? new Date(l.created_at) : null;
      const now = new Date();
      return (
        d &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear()
      );
    }).length ?? 0;

  const treatedCount = safeLeads.filter((l) => l.traite === true).length;
  const remainingToTreat = total - treatedCount;

  const lastLead =
    safeLeads.length > 0 && safeLeads[0].created_at
      ? new Date(safeLeads[0].created_at).toLocaleString("fr-FR")
      : "—";

  // Prochaine importation automatique (8h00)
  const now = new Date();
  const nextImport = new Date();
  nextImport.setHours(8, 0, 0, 0);
  if (now > nextImport) nextImport.setDate(nextImport.getDate() + 1);

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
            Prospects Google Maps
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Tous vos prospects importés automatiquement depuis Google Maps.
          </p>
        </div>

        <a
          href="/dashboard/maps/export"
          className="px-4 py-2 text-xs rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 transition"
        >
          Exporter CSV
        </a>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <KPI title="Total lieux" value={total} text="Lieux importés" />
        <KPI
          title="À traiter"
          value={remainingToTreat}
          text={`${remainingToTreat} lieux restant à traiter`}
        />
        <KPI
          title="Prochaine importation"
          value={nextImportText}
          text="Tous les jours à 8h00"
        />
      </div>

      {/* TABLE CARD */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/90 shadow-md overflow-hidden">
        {/* TOP BAR */}
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center">
          <div>
            <h2 className="text-slate-100 text-sm font-medium">
              Liste des lieux Google Maps
            </h2>
            <p className="text-[11px] text-slate-500">
              Tous vos lieux triés du plus récent au plus ancien.
            </p>
          </div>
          <div className="text-[11px] text-slate-400">
            {safeLeads.length} lieu(x)
          </div>
        </div>

        {/* TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr className="bg-slate-900 text-slate-300 text-[11px] uppercase tracking-wide">
                <th className="py-3 px-4 border-b border-slate-800">Traité</th>
                <th className="py-3 px-4 border-b border-slate-800 text-left">
                  Nom
                </th>
                <th className="py-3 px-4 border-b border-slate-800 text-left">
                  Adresse
                </th>
                <th className="py-3 px-4 border-b border-slate-800 text-left">
                  Téléphone
                </th>
                <th className="py-3 px-4 border-b border-slate-800 text-left">
                  Site web
                </th>
                <th className="py-3 px-4 border-b border-slate-800 text-left">
                  Google Maps
                </th>
                <th className="py-3 px-4 border-b border-slate-800 text-center">
                  Date
                </th>
              </tr>
            </thead>

            <tbody>
              {safeLeads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    Aucun lieu pour le moment.
                  </td>
                </tr>
              ) : (
                safeLeads.map((lead) => (
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

                    {/* NOM DU LIEU */}
                    <td className="py-3 px-4 text-slate-50">
                      {lead.title || "—"}
                    </td>

                    {/* ADRESSE */}
                    <td className="py-3 px-4 text-slate-300">
                      {lead.address || "—"}
                    </td>

                    {/* TÉLÉPHONE */}
                    <td className="py-3 px-4 text-slate-300">
                      {lead.phoneNumber || "—"}
                    </td>

                    {/* SITE WEB */}
                    <td className="py-3 px-4">
                      {lead.website ? (
                        <a
                          href={lead.website}
                          target="_blank"
                          className="text-sky-400 hover:underline"
                        >
                          Voir site
                        </a>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>

                    {/* GOOGLE MAPS */}
                    <td className="py-3 px-4">
                      {lead.placeUrl ? (
                        <a
                          href={lead.placeUrl}
                          target="_blank"
                          className="text-green-400 hover:underline"
                        >
                          Ouvrir Map
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
                  </tr>
                ))
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
      <div className="text-[11px] text-slate-500 uppercase tracking-wide">
        {title}
      </div>
      <div className="text-3xl font-semibold text-slate-50 mt-1">{value}</div>
      <p className="text-[11px] text-slate-500 mt-1">{text}</p>
    </div>
  );
}
