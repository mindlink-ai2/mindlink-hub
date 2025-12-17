"use client";

import DeleteLeadButton from "./DeleteLeadButton";

type Lead = {
  id: number;
  Name: string | null;
  FirstName: string | null;
  LastName: string | null;
  Company: string | null;
  LinkedInURL: string | null;
  created_at: string | null;
  traite: boolean | null;

  message_sent: boolean | null;
  message_sent_at: string | null;
  next_followup_at: string | null;
};

export function LeadsTable({
  leads,
  onOpen,
}: {
  leads: Lead[];
  onOpen?: (lead: Lead) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-full flex justify-center">
        <table className="w-full max-w-5xl mx-auto text-xs md:text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th colSpan={6} className="pt-6 pb-3 px-6 text-center">
                <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  DÉTAILS DES LEADS
                </span>
              </th>
            </tr>

            <tr className="bg-slate-900/95 text-slate-100">
              <th className="w-[40px] py-4 px-4 text-center uppercase border-y border-slate-800">
                Traité
              </th>
              <th className="w-1/4 py-4 px-4 text-center uppercase border-y border-slate-800">
                Nom
              </th>
              <th className="w-1/4 py-4 px-4 text-center uppercase border border-slate-800">
                Entreprise
              </th>
              <th className="w-1/4 py-4 px-4 text-center uppercase border border-slate-800">
                LinkedIn
              </th>
              <th className="w-1/4 py-4 px-4 text-center uppercase border border-slate-800">
                Date
              </th>
              <th className="w-[60px] py-4 px-4 text-center uppercase border border-slate-800">
                —
              </th>
            </tr>
          </thead>

          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-slate-500">
                  Aucun lead pour l’instant 🚀
                </td>
              </tr>
            ) : (
              leads.map((lead, index) => {
                const isNew =
                  lead.created_at &&
                  Date.now() - new Date(lead.created_at).getTime() <
                    48 * 60 * 60 * 1000;

                const fullName =
                  `${lead.FirstName ?? ""} ${lead.LastName ?? ""}`.trim() ||
                  lead.Name ||
                  "—";

                const rowBg =
                  index % 2 === 0 ? "bg-slate-950/80" : "bg-slate-950/40";

                return (
                  <tr
                    key={lead.id}
                    className={`${rowBg} group border-b border-slate-900 hover:bg-slate-900/80 transition`}
                  >
                    {/* Traité */}
                    <td className="py-3 px-6 text-center border-r border-slate-900">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-700 bg-slate-900"
                        checked={!!lead.traite}
                        readOnly
                      />
                    </td>

                    {/* Nom + Ouvrir */}
                    <td className="py-3 px-6 text-center border-r border-slate-900 relative">
                      <div className="flex items-center justify-center gap-2">
                        <span className="truncate max-w-[260px]">
                          {fullName}
                        </span>

                        {isNew && (
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            Nouveau
                          </span>
                        )}

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpen?.(lead);
                          }}
                          className="
                            absolute right-0 top-1/2 -translate-y-1/2
                            opacity-0 group-hover:opacity-100
                            bg-indigo-600 hover:bg-indigo-500 
                            text-white text-[10px] px-2 py-1 rounded-md
                            transition
                          "
                        >
                          Ouvrir
                        </button>
                      </div>
                    </td>

                    {/* Entreprise */}
                    <td className="py-3 px-6 text-center border-r border-slate-900">
                      {lead.Company ?? "—"}
                    </td>

                    {/* LinkedIn */}
                    <td className="py-3 px-6 text-center border-r border-slate-900">
                      {lead.LinkedInURL ? (
                        <a
                          href={lead.LinkedInURL}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-400 hover:underline"
                        >
                          Voir le profil
                        </a>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>

                    {/* Date */}
                    <td className="py-3 px-6 text-center border-r border-slate-900">
                      {lead.created_at
                        ? new Date(lead.created_at).toLocaleDateString("fr-FR")
                        : "—"}
                    </td>

                    {/* Delete */}
                    <td className="py-3 px-6 text-center">
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
  );
}