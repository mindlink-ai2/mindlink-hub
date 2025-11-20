"use client";

import { useState } from "react";

type Lead = {
  id: number;
  Name: string | null;
  FirstName: string | null;
  LastName: string | null;
  Company: string | null;
  LinkedInURL: string | null;
  created_at: string | null;
  traite: boolean | null; // bool Supabase
};

export function LeadsTable({ leads }: { leads: Lead[] }) {
  const [rows, setRows] = useState<Lead[]>(leads);

  const toggleTraite = async (lead: Lead) => {
    const newValue = !lead.traite;

    // UI optimiste
    setRows((prev) =>
      prev.map((l) => (l.id === lead.id ? { ...l, traite: newValue } : l))
    );

    try {
      await fetch("/api/leads/traite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, value: newValue }),
      });
    } catch (e) {
      console.error(e);
      // si erreur → rollback
      setRows((prev) =>
        prev.map((l) => (l.id === lead.id ? { ...l, traite: !newValue } : l))
      );
    }
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-full flex justify-center">
        <table className="w-full max-w-5xl mx-auto text-xs md:text-sm border-separate border-spacing-0">
          <thead>
            {/* Bandeau titre section */}
            <tr>
              <th
                colSpan={5}
                className="pt-6 pb-3 px-6 text-center align-middle"
              >
                <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  DÉTAILS DES LEADS
                </span>
              </th>
            </tr>

            {/* Titres colonnes : EXACTEMENT ton design */}
            <tr className="bg-slate-900/95 text-slate-100">
              <th className="w-[40px] py-4 px-4 text-center align-middle text-sm md:text-base font-semibold tracking-[0.12em] uppercase border-t border-b border-slate-800 first:rounded-l-xl">
                Traité
              </th>

              <th className="w-1/4 py-4 px-4 text-center align-middle text-sm md:text-base font-semibold tracking-[0.12em] uppercase border-t border-b border-slate-800 first:rounded-l-xl last:rounded-r-xl">
                Nom
              </th>
              <th className="w-1/4 py-4 px-4 text-center align-middle text-sm md:text-base font-semibold tracking-[0.12em] uppercase border-t border-b border-l border-slate-800">
                Entreprise
              </th>
              <th className="w-1/4 py-4 px-4 text-center align-middle text-sm md:text-base font-semibold tracking-[0.12em] uppercase border-t border-b border-l border-slate-800">
                LinkedIn
              </th>
              <th className="w-1/4 py-4 px-4 text-center align-middle text-sm md:text-base font-semibold tracking-[0.12em] uppercase border-t border-b border-l border-slate-800 last:rounded-r-xl">
                Date
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="py-10 px-4 text-center text-slate-500 text-sm"
                >
                  Aucun lead pour l’instant. Ils apparaîtront ici dès que vos
                  automatisations commenceront à tourner 🚀
                </td>
              </tr>
            ) : (
              rows.map((lead, index) => {
                const isNew =
                  lead.created_at &&
                  new Date().getTime() -
                    new Date(lead.created_at).getTime() <
                    48 * 60 * 60 * 1000; // < 48h

                const fullName = `${lead.FirstName ?? ""} ${
                  lead.LastName ?? ""
                }`.trim();

                const rowBg =
                  index % 2 === 0
                    ? "bg-slate-950/80"
                    : "bg-slate-950/40";

                return (
                  <tr
                    key={lead.id}
                    className={`${rowBg} border-b border-slate-900 hover:bg-slate-900/80 transition-colors`}
                  >
                    {/* ✅ case liée à Supabase */}
                    <td className="w-[40px] py-3 px-6 align-middle border-r border-slate-900 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-700 bg-slate-900"
                        checked={!!lead.traite}
                        onChange={() => toggleTraite(lead)}
                      />
                    </td>

                    {/* Nom */}
                    <td className="w-1/4 py-3 px-6 align-middle border-r border-slate-900">
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

                    {/* Entreprise */}
                    <td className="w-1/4 py-3 px-6 align-middle border-r border-slate-900 text-center">
                      <span className="truncate max-w-[260px] inline-block">
                        {lead.Company ?? "—"}
                      </span>
                    </td>

                    {/* LinkedIn */}
                    <td className="w-1/4 py-3 px-6 align-middle border-r border-slate-900 text-center">
                      {lead.LinkedInURL ? (
                        <a
                          href={lead.LinkedInURL}
                          className="text-xs text-sky-400 hover:underline truncate inline-block max-w-[260px]"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Voir le profil
                        </a>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>

                    {/* Date */}
                    <td className="w-1/4 py-3 px-6 align-middle text-center">
                      {lead.created_at ? (
                        <span
                          className="text-xs text-slate-100"
                          title={new Date(
                            lead.created_at
                          ).toLocaleString("fr-FR")}
                        >
                          {new Date(
                            lead.created_at
                          ).toLocaleDateString("fr-FR")}
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
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
