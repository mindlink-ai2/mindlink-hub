"use client";

import { useState, useEffect } from "react";
import TraiteCheckbox from "./TraiteCheckbox";
import DeleteLeadButton from "./DeleteLeadButton";

export default function LeadsPage() {
  const [safeLeads, setSafeLeads] = useState<any[]>([]);
  const [openLead, setOpenLead] = useState<any>(null);
  const [clientLoaded, setClientLoaded] = useState(false);

  // Chargement côté client SANS auth() direct
  useEffect(() => {
    (async () => {
      const res = await fetch("/api/get-leads");
      const data = await res.json();

      setSafeLeads(data.leads ?? []);
      setClientLoaded(true);
    })();
  }, []);

  if (!clientLoaded) {
    return (
      <div className="text-slate-400 text-sm">
        Chargement des leads...
      </div>
    );
  }

  // KPIs
  const total = safeLeads.length;
  const treatedCount = safeLeads.filter((l) => l.traite === true).length;
  const remainingToTreat = total - treatedCount;

  // Prochaine importation
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" })
  );

  const nextImport = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" })
  );
  nextImport.setHours(8, 0, 0, 0);

  if (now > nextImport) nextImport.setDate(nextImport.getDate() + 1);

  const diffMs = nextImport.getTime() - now.getTime();
  const diffMinutes = Math.floor(diffMs / 1000 / 60);
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;

  const nextImportText =
    hours <= 0 ? `Dans ${minutes} min` : `Dans ${hours}h ${minutes}min`;

  return (
    <>
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
                  <th className="py-3 px-4 border-b border-slate-800 text-center">Supprimer</th>
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
                        className="border-b border-slate-900 hover:bg-slate-900/70 transition group"
                      >
                        {/* TRAITE */}
                        <td className="py-3 px-4 text-center">
                          <TraiteCheckbox
                            leadId={lead.id}
                            defaultChecked={Boolean(lead.traite)}
                          />
                        </td>

                        {/* NOM + bouton OUVRIR */}
                        <td className="py-3 px-4 text-slate-50 relative">
                          {fullName}

                          <button
                            onClick={() => setOpenLead(lead)}
                            className="
                              opacity-0 group-hover:opacity-100
                              absolute right-0 top-1/2 -translate-y-1/2
                              text-[10px] px-2 py-1
                              bg-indigo-600 hover:bg-indigo-500
                              text-white rounded-md transition
                            "
                          >
                            Ouvrir
                          </button>
                        </td>

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

      {/* SIDEBAR DROITE */}
      {openLead && (
        <div
          className="
            fixed right-0 top-0 h-full w-[380px]
            bg-slate-900 border-l border-slate-800
            shadow-2xl p-6 z-50 animate-slideLeft
          "
        >
          <button
            className="text-slate-400 text-xs mb-4 hover:text-slate-200"
            onClick={() => setOpenLead(null)}
          >
            ✕ Fermer
          </button>

          <h2 className="text-lg font-semibold text-slate-50 mb-4">
            {openLead.FirstName} {openLead.LastName}
          </h2>

          <div className="text-sm text-slate-300 space-y-2">
            <p><strong>Entreprise :</strong> {openLead.Company || "—"}</p>
            <p><strong>Localisation :</strong> {openLead.location || "—"}</p>
            <p>
              <strong>LinkedIn :</strong>{" "}
              {openLead.LinkedInURL ? (
                <a
                  href={openLead.LinkedInURL}
                  target="_blank"
                  className="text-sky-400 underline"
                >
                  Voir profil
                </a>
              ) : (
                "—"
              )}
            </p>
            <p><strong>Créé le :</strong> {openLead.created_at?.slice(0, 10)}</p>
          </div>

          {/* Message interne */}
          <div className="mt-6">
            <textarea
              placeholder="Message interne…"
              className="
                w-full h-32 p-3 rounded-lg
                bg-slate-800 border border-slate-700
                text-sm text-slate-200
              "
            ></textarea>
          </div>
        </div>
      )}
    </>
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
