import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import TraiteCheckbox from "./TraiteCheckbox"; // ✅ ajout

// ✅ Signature standard avec searchParams
export default async function LeadsPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1️⃣ Récup client
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("*")
    .eq("clerk_user_id", userId)
    .single();

  if (clientError || !client) {
    console.error("Client not found:", clientError);
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Leads générés</h1>
        <p className="text-sm text-red-400">
          Impossible de récupérer votre profil client.
        </p>
      </div>
    );
  }

  const clientId = client.id;

  // 2️⃣ Récup leads (ajout de "traite")
  const { data: leadsData, error: leadsError } = await supabase
    .from("leads")
    .select(
      "id, client_id, Name, FirstName, LastName, Company, LinkedInURL, created_at, traite"
    )
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  const leads = leadsData ?? [];

  if (leadsError) {
    console.error("Leads error:", leadsError);
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Leads générés</h1>
        <p className="text-sm text-red-400">
          Erreur lors du chargement des leads.
        </p>
      </div>
    );
  }

  // 3️⃣ KPIs globaux
  const total = leads.length;

  const thisMonth =
    leads.filter((l) => {
      if (!l.created_at) return false;
      const d = new Date(l.created_at);
      const now = new Date();
      return (
        d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      );
    }).length ?? 0;

  const lastLead =
    leads.length > 0 && leads[0].created_at
      ? new Date(leads[0].created_at).toLocaleString("fr-FR")
      : null;

  // 4️⃣ Filtrage / recherche
  const rawQ = searchParams?.q;
  const rawPeriod = searchParams?.period;

  const qRaw = Array.isArray(rawQ) ? rawQ[0] ?? "" : rawQ ?? "";
  const q = qRaw.toString().trim().toLowerCase();

  const periodRaw = Array.isArray(rawPeriod) ? rawPeriod[0] ?? "" : rawPeriod ?? "all";
  const period = periodRaw.toString() || "all";

  let filteredLeads = [...leads];

  if (q) {
    filteredLeads = filteredLeads.filter((l) => {
      const haystack = [
        l.FirstName ?? "",
        l.LastName ?? "",
        l.Name ?? "",
        l.Company ?? "",
        l.LinkedInURL ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }

  if (period !== "all") {
    const now = new Date();
    const days =
      period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : 0;
    if (days > 0) {
      const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      filteredLeads = filteredLeads.filter(
        (l) => l.created_at && new Date(l.created_at) >= since
      );
    }
  }

  // 5️⃣ UI
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Leads générés</h1>
          <p className="text-xs text-slate-400 mt-1">
            Vos leads issus des automatisations Mindlink.
          </p>
        </div>

        <a
          href="/api/leads/export"
          className="text-xs rounded-full border border-slate-700 px-4 py-2 hover:bg-slate-800/70 transition flex items-center gap-2 bg-slate-900/70"
        >
          Exporter en CSV
        </a>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950 to-slate-900 p-6 shadow-sm flex flex-col items-center justify-center text-center gap-1">
          <div className="text-[11px] uppercase tracking-wide text-slate-400">
            Total leads
          </div>
          <div className="text-3xl font-semibold text-slate-50">{total}</div>
          <p className="text-[11px] text-slate-500">
            Tous les leads générés par vos automatisations.
          </p>
        </div>

        <div className="rounded-2xl border border-slfate-800 bg-gradient-to-br from-slate-950 to-slate-900 p-6 shadow-sm flex flex-col items-center justify-center text-center gap-1">
          <div className="text-[11px] uppercase tracking-wide text-slate-400">
            Ce mois-ci
          </div>
          <div className="text-3xl font-semibold text-slate-50">
            {thisMonth}
          </div>
          <p className="text-[11px] text-slate-500">
            Leads générés sur le mois en cours.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950 to-slate-900 p-6 shadow-sm flex flex-col items-center justify-center text-center gap-1">
          <div className="text-[11px] uppercase tracking-wide text-slate-400">
            Dernier lead
          </div>
          <div className="text-sm text-slate-50">
            {lastLead ?? "Aucun lead pour le moment"}
          </div>
          <p className="text-[11px] text-slate-500">
            Date et heure du dernier lead reçu.
          </p>
        </div>
      </div>

      {/* Carte unique */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/90 overflow-hidden shadow-sm mt-8">
        {/* Header de la carte */}
        <div className="px-6 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-100">Liste des leads</p>
            <p className="text-[11px] text-slate-500">
              Tous les leads générés, du plus récent au plus ancien.
            </p>
          </div>
          <div className="text-[11px] text-slate-400 whitespace-nowrap">
            {filteredLeads.length} lead(s) affiché(s)
            {filteredLeads.length !== total && <> / {total} au total</>}
          </div>
        </div>

        {/* Filtres */}
        <form
          className="px-6 py-2 border-b border-slate-800 flex flex-wrap items-center gap-2"
          method="get"
        >
          <select
            name="period"
            defaultValue={period}
            className="rounded-full bg-slate-900 border border-slate-800 px-3 py-1 text-[11px] text-slate-100"
          >
            <option value="all">Toute la période</option>
            <option value="7d">7 jours</option>
            <option value="30d">30 jours</option>
            <option value="90d">90 jours</option>
          </select>

          <input
            type="text"
            name="q"
            placeholder="Nom, entreprise, LinkedIn..."
            defaultValue={q}
            className="flex-1 rounded-full bg-slate-900 border border-slate-800 px-3 py-1 text-[11px] text-slate-100"
          />

          <button
            type="submit"
            className="rounded-full bg-sky-500 px-3 py-1 text-[11px] font-medium text-slate-950"
          >
            Filtrer
          </button>
        </form>

        {/* Tableau */}
        <div className="overflow-x-auto">
          <div className="min-w-full flex justify-center">
            <table className="w-full max-w-5xl mx-auto text-xs md:text-sm border-separate border-spacing-0">
              <thead>
                <tr>
                  {/* colSpan passe à 5 avec la nouvelle colonne */}
                  <th
                    colSpan={5}
                    className="pt-6 pb-3 px-6 text-center"
                  >
                    <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      DÉTAILS DES LEADS
                    </span>
                  </th>
                </tr>

                <tr className="bg-slate-900/95 text-slate-100">
                  {/* Colonne cases à cocher */}
                  <th className="w-[40px] py-4 text-center uppercase border-t border-b border-slate-800">
                    {/* Traité */}
                  </th>

                  <th className="w-1/4 py-4 text-center uppercase border-t border-b border-slate-800">
                    Nom
                  </th>
                  <th className="w-1/4 py-4 text-center uppercase border-t border-b border-l border-slate-800">
                    Entreprise
                  </th>
                  <th className="w-1/4 py-4 text-center uppercase border-t border-b border-l border-slate-800">
                    LinkedIn
                  </th>
                  <th className="w-1/4 py-4 text-center uppercase border-t border-b border-l border-slate-800">
                    Date
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredLeads.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-10 text-center text-slate-500 text-sm"
                    >
                      Aucun lead pour l’instant 🚀
                    </td>
                  </tr>
                ) : (
                  filteredLeads.map((lead, index) => {
                    const isNew =
                      lead.created_at &&
                      new Date().getTime() -
                        new Date(lead.created_at).getTime() <
                        48 * 60 * 60 * 1000;

                    const rowBg =
                      index % 2 === 0 ? "bg-slate-950/80" : "bg-slate-950/40";

                    const fullName =
                      `${lead.FirstName ?? ""} ${lead.LastName ?? ""}`.trim();

                    return (
                      <tr
                        key={lead.id}
                        className={`${rowBg} border-b border-slate-900 hover:bg-slate-900/80`}
                      >
                        {/* ✅ Checkbox reliée à la colonne "traite" */}
                        <td className="py-3 text-center border-r border-slate-900">
                          <TraiteCheckbox
                            leadId={lead.id}
                            defaultChecked={Boolean(lead.traite)}
                          />
                        </td>

                        <td className="py-3 text-center border-r border-slate-900">
                          <div className="flex items-center justify-center gap-2">
                            <span className="truncate max-w-[260px] text-center">
                              {fullName || lead.Name || "—"}
                            </span>
                            {isNew && (
                              <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                Nouveau
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 text-center border-r border-slate-900">
                          {lead.Company ?? "—"}
                        </td>

                        <td className="py-3 text-center border-r border-slate-900">
                          {lead.LinkedInURL ? (
                            <a
                              href={lead.LinkedInURL}
                              className="text-xs text-sky-400 hover:underline"
                              target="_blank"
                            >
                              Voir le profil
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>

                        <td className="py-3 text-center">
                          {lead.created_at
                            ? new Date(
                                lead.created_at
                              ).toLocaleDateString("fr-FR")
                            : "—"}
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
    </div>
  );
}
