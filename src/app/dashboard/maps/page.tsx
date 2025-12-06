"use client";

import { useState, useEffect } from "react";
import TraiteCheckbox from "./TraiteCheckbox";
import DeleteLeadButton from "./DeleteLeadButton";

export default function MapsPage() {
  const [safeLeads, setSafeLeads] = useState<any[]>([]);
  const [openLead, setOpenLead] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);

  /* --------------------------------------------
      FETCH LEADS
  -------------------------------------------- */
  useEffect(() => {
    (async () => {
      const res = await fetch("/api/get-map-leads");
      const data = await res.json();
      setSafeLeads(data.leads ?? []);
      setLoaded(true);
    })();
  }, []);

  /* --------------------------------------------
      AUTO-SAVE INTERNAL MESSAGE
  -------------------------------------------- */
  useEffect(() => {
    if (!openLead) return;

    const delay = setTimeout(async () => {
      await fetch("/api/update-map-internal-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: openLead.id,
          message: openLead.internal_message ?? "",
        }),
      });

      setSafeLeads((prev) =>
        prev.map((l) =>
          l.id === openLead.id
            ? { ...l, internal_message: openLead.internal_message }
            : l
        )
      );
    }, 300);

    return () => clearTimeout(delay);
  }, [openLead?.internal_message]);


  /* --------------------------------------------
      🔵 AJOUT — MARQUER MESSAGE ENVOYÉ
  -------------------------------------------- */
  const handleMessageSent = async () => {
    if (!openLead) return;

    const res = await fetch("/api/map-leads/message-sent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: openLead.id }),
    });

    const data = await res.json();
    if (data.error) {
      alert("Erreur lors de l'enregistrement.");
      return;
    }

    // Mise à jour sidebar
    setOpenLead((prev: any) => ({
      ...prev,
      message_sent: true,
      message_sent_at: data.lead?.message_sent_at,
      next_followup_at: data.lead?.next_followup_at,
    }));

    // Mise à jour tableau
    setSafeLeads((prev) =>
      prev.map((l) =>
        l.id === openLead.id
          ? {
              ...l,
              message_sent: true,
              message_sent_at: data.lead?.message_sent_at,
              next_followup_at: data.lead?.next_followup_at,
            }
          : l
      )
    );
  };

  if (!loaded) {
    return <div className="text-slate-400 text-sm">Chargement des leads…</div>;
  }

  /* --------------------------------------------
      KPIs
  -------------------------------------------- */
  const total = safeLeads.length;
  const treatedCount = safeLeads.filter((l) => l.traite).length;
  const remainingToTreat = total - treatedCount;

  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const nextImport = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  nextImport.setHours(8, 0, 0, 0);
  if (now > nextImport) nextImport.setDate(nextImport.getDate() + 1);
  const diff = nextImport.getTime() - now.getTime();
  const min = Math.floor(diff / 1000 / 60);
  const h = Math.floor(min / 60);
  const m = min % 60;
  const nextImportText = h <= 0 ? `Dans ${m} min` : `Dans ${h}h ${m}min`;

  return (
    <>
      <div className="space-y-10">
        {/* HEADER */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-50">
              Leads Google Maps
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Tous vos leads importés automatiquement depuis Google Maps.
            </p>
          </div>

          <a
            href="/dashboard/maps/export"
            className="
              px-4 py-2 text-xs rounded-xl
              bg-slate-900 border border-slate-700 
              hover:bg-slate-800 transition
            "
          >
            Exporter CSV
          </a>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <KPI title="Total leads" value={total} text="Importés depuis Google Maps" />
          <KPI title="À traiter" value={remainingToTreat} text={`${remainingToTreat} restants`} />
          <KPI title="Prochaine importation" value={nextImportText} text="Tous les jours à 8h00" />
        </div>

        {/* TABLE */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/90 shadow-xl overflow-hidden">

          {/* TOP BAR */}
          <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center">
            <div>
              <h2 className="text-slate-100 text-sm font-medium">
                Liste des leads Google Maps
              </h2>
              <p className="text-[11px] text-slate-500">Triés du plus récent au plus ancien</p>
            </div>
            <div className="text-[11px] text-slate-400">{safeLeads.length} lead(s)</div>
          </div>

          {/* TABLE CONTENT */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr className="bg-slate-900 text-slate-300 text-[11px] uppercase tracking-wide">
                  <th className="py-3 px-4 border-b border-slate-800">Traité</th>
                  <th className="py-3 px-4 border-b border-slate-800 text-left">Nom</th>
                  <th className="py-3 px-4 border-b border-slate-800 text-left">Email</th>
                  <th className="py-3 px-4 border-b border-slate-800 text-left">Téléphone</th>
                  <th className="py-3 px-4 border-b border-slate-800 text-left">Site</th>
                  <th className="py-3 px-4 border-b border-slate-800 text-left">Google Maps</th>
                  <th className="py-3 px-4 border-b border-slate-800 text-center">Date</th>
                  <th className="py-3 px-4 border-b border-slate-800 text-center">Supprimer</th>
                </tr>
              </thead>

              <tbody>
                {safeLeads.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-500">
                      Aucun lead pour le moment.
                    </td>
                  </tr>
                ) : (
                  safeLeads.map((lead) => (
                    <tr
                      key={lead.id}
                      className="border-b border-slate-900 hover:bg-slate-900/60 transition group"
                    >
                      {/* TRAITE */}
                      <td className="py-3 px-4 text-center">
                        <TraiteCheckbox leadId={lead.id} defaultChecked={Boolean(lead.traite)} />
                      </td>

                      {/* NOM + pastille + bouton voir */}
                      <td className="py-3 px-4 text-slate-50 relative pr-14 flex items-center gap-2">
                        {lead.title || "—"}

                        {/* pastille verte */}
                        {lead.message_sent && (
                          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
                        )}

                        {/* 🔵 FIX ICI — ON FORCE LES CHAMPS */}
                        <button
                          onClick={() =>
                            setOpenLead({
                              ...lead,
                              message_sent: lead.message_sent ?? false,
                              message_sent_at: lead.message_sent_at ?? null,
                              next_followup_at: lead.next_followup_at ?? null,
                            })
                          }
                          className="
                            opacity-0 group-hover:opacity-100
                            absolute right-3 top-1/2 -translate-y-1/2
                            text-[11px] px-3 py-1.5 rounded-lg
                            bg-indigo-600/70 hover:bg-indigo-500
                            text-white shadow-sm hover:shadow-md transition
                          "
                        >
                          Voir →
                        </button>
                      </td>

                      {/* EMAIL */}
                      <td className="py-3 px-4 text-slate-300">{lead.email || "—"}</td>

                      {/* PHONE */}
                      <td className="py-3 px-4 text-slate-300">{lead.phoneNumber || "—"}</td>

                      {/* WEBSITE */}
                      <td className="py-3 px-4">
                        {lead.website ? (
                          <a href={lead.website} target="_blank" className="text-sky-400 hover:underline">
                            Voir site
                          </a>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>

                      {/* MAPS */}
                      <td className="py-3 px-4">
                        {lead.placeUrl ? (
                          <a href={lead.placeUrl} target="_blank" className="text-green-400 hover:underline">
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

                      {/* DELETE */}
                      <td className="py-3 px-4 text-center">
                        <DeleteLeadButton leadId={lead.id} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* SIDEBAR PREMIUM */}
      {openLead && (
        <div
          className="
            fixed right-0 top-0 h-full w-[420px]
            bg-slate-900/95 backdrop-blur-xl
            border-l border-slate-800
            shadow-[0_0_30px_-6px_rgba(79,70,229,0.4)]
            p-6 z-50 animate-slideLeft
          "
        >
          <button
            className="text-slate-400 text-xs mb-4 hover:text-slate-200 transition"
            onClick={() => setOpenLead(null)}
          >
            ✕ Fermer
          </button>

          <h2 className="text-xl font-semibold text-slate-50 mb-4">
            {openLead.title}
          </h2>

          <div className="text-sm text-slate-300 space-y-2 mb-6">
            <p><strong>Email :</strong> {openLead.email || "—"}</p>
            <p><strong>Téléphone :</strong> {openLead.phoneNumber || "—"}</p>
            <p>
              <strong>Site :</strong>{" "}
              {openLead.website ? (
                <a href={openLead.website} target="_blank" className="text-sky-400 underline">
                  Voir site
                </a>
              ) : "—"}
            </p>
            <p>
              <strong>Google Maps :</strong>{" "}
              {openLead.placeUrl ? (
                <a href={openLead.placeUrl} target="_blank" className="text-green-400 underline">
                  Ouvrir map
                </a>
              ) : "—"}
            </p>
            <p><strong>Créé le :</strong> {openLead.created_at?.slice(0, 10)}</p>
          </div>

          {/* Message interne */}
          <div className="mt-6">
            <label className="text-xs text-slate-400 mb-2 block">Message interne</label>

            <textarea
              value={openLead.internal_message ?? ""}
              onChange={(e) => {
                const msg = e.target.value;
                setOpenLead({ ...openLead, internal_message: msg });

                setSafeLeads((prev) =>
                  prev.map((l) =>
                    l.id === openLead.id ? { ...l, internal_message: msg } : l
                  )
                );
              }}
              placeholder="Écris une note interne…"
              className="
                w-full h-40 p-4 rounded-xl
                bg-slate-800/60 border border-slate-700
                text-sm text-slate-200
                focus:outline-none focus:ring-2 focus:ring-indigo-500/60
                transition
              "
            ></textarea>
          </div>

          {/* 🔵 AJOUT — bouton message envoyé */}
          <div className="mt-5">
            <button
              onClick={handleMessageSent}
              disabled={openLead.message_sent}
              className={`
                w-full px-4 py-3 rounded-xl text-sm font-medium transition
                ${
                  openLead.message_sent
                    ? "bg-emerald-600 cursor-default text-white"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white"
                }
              `}
            >
              {openLead.message_sent ? "Message envoyé ✓" : "Marquer comme envoyé"}
            </button>
          </div>

          {/* 🔵 AJOUT — prochaine relance */}
          {openLead.next_followup_at && (
            <p className="text-xs text-slate-400 mt-2">
              Prochaine relance :{" "}
              <span className="text-slate-200 font-medium">
                {new Date(openLead.next_followup_at).toLocaleDateString("fr-FR")}
              </span>
            </p>
          )}
        </div>
      )}
    </>
  );
}

/* KPI Component */
function KPI({ title, value, text }: { title: string; value: any; text: string }) {
  return (
    <div className="rounded-2xl bg-slate-950 border border-slate-800 p-6 flex flex-col items-center text-center shadow-inner">
      <div className="text-[11px] text-slate-500 uppercase tracking-wide">{title}</div>
      <div className="text-3xl font-semibold text-slate-50 mt-1">{value}</div>
      <p className="text-[11px] text-slate-500 mt-1">{text}</p>
    </div>
  );
}