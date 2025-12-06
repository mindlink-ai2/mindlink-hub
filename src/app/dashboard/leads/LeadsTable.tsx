"use client";

import { useState } from "react";
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

  // 🔥 AJOUT EXCLUSIF : nouveaux champs pour la relance
  message_sent: boolean | null;
  message_sent_at: string | null;
  next_followup_at: string | null;
};

export function LeadsTable({
  leads,
  onOpen, // 🔵 AJOUT : callback pour ouvrir la sidebar
}: {
  leads: Lead[];
  onOpen?: (lead: Lead) => void; // 🔵 AJOUT
}) {
  const [rows, setRows] = useState<Lead[]>(leads);

  // 🟦 Toggle traité
  const toggleTraite = async (lead: Lead) => {
    const newValue = !lead.traite;

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
      // rollback
      setRows((prev) =>
        prev.map((l) => (l.id === lead.id ? { ...l, traite: !newValue } : l))
      );
    }
  };

  // 🗑️ Suppression locale après delete
  const handleDelete = (id: number) => {
    setRows((prev) => prev.filter((l) => l.id !== id));
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-full flex justify-center">
        <table className="w-full max-w-5xl mx-auto text-xs md:text-sm border-separate border-spacing-0">
          <thead>
            {/* Titre section */}
            <tr>
              <th colSpan={6} className="pt-6 pb-3 px-6 text-center align-middle">
                <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  DÉTAILS DES LEADS
                </span>
              </th>
            </tr>

            {/* En-têtes */}
            <tr className="bg-slate-900/95 text-slate-100">
              <th className="w-[40px] py-4 px-4 text-center align-middle text-sm md:text-base font-semibold tracking-[0.12em] uppercase border-t border-b border-slate-800">
                Traité
              </th>

              <th className="w-1/4 py-4 px-4 text-center align-middle text-sm md:text-base font-semibold tracking-[0.12em] uppercase border-t border-b border-slate-800">
                Nom
              </th>

              <th className="w-1/4 py-4 px-4 text-center align-middle text-sm md:text-base font-semibold tracking-[0.12em] uppercase border-t border-b border-l border-slate-800">
                Entreprise
              </th>

              <th className="w-1/4 py-4 px-4 text-center align-middle text-sm md:text-base font-semibold tracking-[0.12em] uppercase border-t border-b border-l border-slate-800">
                LinkedIn
              </th>

              <th className="w-1/4 py-4 px-4 text-center align-middle text-sm md:text-base font-semibold tracking-[0.12em] uppercase border-t border-b border-l border-slate-800">
                Date
              </th>

              {/* 🗑️ Nouvelle colonne */}
              <th className="w-[60px] py-4 px-4 text-center align-middle text-sm md:text-base font-semibold uppercase border-t border-b border-l border-slate-800">
                —
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 px-4 text-center text-slate-500 text-sm">
                  Aucun lead pour l’instant 🚀
                </td>
              </tr>
            ) : (
              rows.map((lead, index) => {
                const isNew =
                  lead.created_at &&
                  new Date().getTime() -
                    new Date(lead.created_at).getTime() <
                    48 * 60 * 60 * 1000;

                const fullName = `${lead.FirstName ?? ""} ${lead.LastName ?? ""}`.trim();

                const rowBg = index % 2 === 0 ? "bg-slate-950/80" : "bg-slate-950/40";

                return (
                  <tr
                    key={lead.id}
                    className={`${rowBg} group border-b border-slate-900 hover:bg-slate-900/80 transition-colors`}
                  >
                    {/* Traité */}
                    <td className="w-[40px] py-3 px-6 text-center border-r border-slate-900">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-700 bg-slate-900"
                        checked={!!lead.traite}
                        onChange={() => toggleTraite(lead)}
                      />
                    </td>

                    {/* NOM + 🔵 BOUTON OUVRIR */}
                    <td className="w-1/4 py-3 px-6 text-center border-r border-slate-900 relative">
                      <div className="flex items-center justify-center gap-2 relative">

                        {/* Nom */}
                        <span className="truncate max-w-[260px] text-center">
                          {fullName || lead.Name || "—"}
                        </span>

                        {/* Nouveau */}
                        {isNew && (
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            Nouveau
                          </span>
                        )}

                        {/* 🔵 AJOUT : bouton Ouvrir */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpen?.(lead);
                          }}
                          className="
                            absolute right-0 top-1/2 -translate-y-1/2
                            opacity-0 group-hover:opacity-100
                            transition-all duration-200
                            bg-indigo-600 hover:bg-indigo-500 
                            text-white text-[10px] px-2 py-1 rounded-md
                          "
                        >
                          Ouvrir
                        </button>
                      </div>
                    </td>

                    {/* Entreprise */}
                    <td className="w-1/4 py-3 px-6 text-center border-r border-slate-900">
                      <span className="truncate max-w-[260px] inline-block">
                        {lead.Company ?? "—"}
                      </span>
                    </td>

                    {/* LinkedIn */}
                    <td className="w-1/4 py-3 px-6 text-center border-r border-slate-900">
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
                    <td className="w-1/4 py-3 px-6 text-center border-r border-slate-900">
                      {lead.created_at ? (
                        <span
                          className="text-xs text-slate-100"
                          title={new Date(lead.created_at).toLocaleString("fr-FR")}
                        >
                          {new Date(lead.created_at).toLocaleDateString("fr-FR")}
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>

                    {/* Delete */}
                    <td className="w-[60px] py-3 px-6 text-center">
                      <DeleteLeadButton
                        leadId={lead.id}
                        onDeleted={() => handleDelete(lead.id)}
                      />
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