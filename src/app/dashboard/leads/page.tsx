"use client";

import { useEffect, useMemo, useState } from "react";
import TraiteCheckbox from "./TraiteCheckbox";
import DeleteLeadButton from "./DeleteLeadButton";

type Lead = any;

function filterLeads(leads: Lead[], term: string) {
  const v = term.trim().toLowerCase();
  if (!v) return leads;

  return leads.filter((l) => {
    const name = `${l.FirstName ?? ""} ${l.LastName ?? ""}`.toLowerCase();
    return (
      name.includes(v) ||
      (l.Company ?? "").toLowerCase().includes(v) ||
      (l.location ?? "").toLowerCase().includes(v)
    );
  });
}

export default function LeadsPage() {
  const [safeLeads, setSafeLeads] = useState<Lead[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [clientLoaded, setClientLoaded] = useState(false);

  // ✅ DERIVED filtered list (no state = no desync)
  const filteredLeads = useMemo(() => {
    return filterLeads(safeLeads, searchTerm);
  }, [safeLeads, searchTerm]);

  // Load leads
  useEffect(() => {
    (async () => {
      const res = await fetch("/api/get-leads");
      const data = await res.json();

      const leads = data.leads ?? [];
      setSafeLeads(leads);
      setClientLoaded(true);
    })();
  }, []);

  // SEARCH FUNCTION
  const handleSearch = (value: string) => {
    setSearchTerm(value);
  };

  // ✅ LIVE UI UPDATE via events from child components
  useEffect(() => {
    const onTreated = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        leadId: number;
        traite: boolean;
      };
      if (!detail?.leadId) return;

      setSafeLeads((prev) =>
        prev.map((l) =>
          l.id === detail.leadId ? { ...l, traite: detail.traite } : l
        )
      );

      setOpenLead((prev: Lead | null) =>
        prev?.id === detail.leadId ? { ...prev, traite: detail.traite } : prev
      );
    };

    const onDeleted = (e: Event) => {
      const detail = (e as CustomEvent).detail as { leadId: string };
      if (!detail?.leadId) return;
    
      setSafeLeads((prev) => prev.filter((l) => String(l.id) !== detail.leadId));
      setOpenLead((prev: Lead | null) =>
        prev && String(prev.id) === detail.leadId ? null : prev
      );
    };

    window.addEventListener(
      "mindlink:lead-treated",
      onTreated as EventListener
    );
    window.addEventListener(
      "mindlink:lead-deleted",
      onDeleted as EventListener
    );

    return () => {
      window.removeEventListener(
        "mindlink:lead-treated",
        onTreated as EventListener
      );
      window.removeEventListener(
        "mindlink:lead-deleted",
        onDeleted as EventListener
      );
    };
  }, []);

  // Auto-save internal message
  useEffect(() => {
    if (!openLead) return;

    const delay = setTimeout(async () => {
      await fetch("/api/update-internal-message", {
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

  // 🔵 Fonction pour marquer "Message envoyé"
  const handleMessageSent = async () => {
    if (!openLead) return;

    const res = await fetch("/api/leads/message-sent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: openLead.id }),
    });

    const data = await res.json();

    if (data.error) {
      alert("Erreur lors de l'envoi.");
      return;
    }

    setOpenLead((prev: any) => ({
      ...prev,
      message_sent: true,
      message_sent_at: data.lead?.message_sent_at,
      next_followup_at: data.lead?.next_followup_at,
    }));

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

  if (!clientLoaded) {
    return <div className="text-slate-400 text-sm">Chargement des leads...</div>;
  }

  const total = safeLeads.length;
  const treatedCount = safeLeads.filter((l) => l.traite === true).length;
  const remainingToTreat = total - treatedCount;

  // Next import (Paris)
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
              Tous vos prospects qualifiés, importés automatiquement par
              Mindlink.
            </p>
          </div>

          <a
            href="/dashboard/leads/export"
            className="px-4 py-2 text-xs rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 transition"
          >
            Exporter CSV
          </a>
        </div>

        {/* SEARCH BAR */}
        <div className="w-full max-w-md">
          <div
            className="
              flex items-center gap-3
              bg-slate-900/60 border border-slate-700 rounded-xl
              px-4 py-2.5 shadow-inner backdrop-blur-md
              focus-within:ring-2 focus-within:ring-indigo-500/50
              transition
            "
          >
            <svg
              className="w-4 h-4 text-slate-500"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1010.5 18a7.5 7.5 0 006.15-3.35z"
              />
            </svg>

            <input
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Rechercher un lead (nom, entreprise, ville)…"
              className="
                bg-transparent w-full text-sm text-slate-200 placeholder-slate-500
                focus:outline-none
              "
            />
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <KPI title="Total leads" value={total} text="Leads totaux générés" />
          <KPI
            title="À traiter"
            value={remainingToTreat}
            text={`${remainingToTreat} restants`}
          />
          <KPI
            title="Prochaine importation"
            value={nextImportText}
            text="À 8h00 automatique"
          />
        </div>

        {/* TABLE CARD */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/90 shadow-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center">
            <div>
              <h2 className="text-slate-100 text-sm font-medium">
                Liste des leads
              </h2>
              <p className="text-[11px] text-slate-500">
                Triés du plus récent au plus ancien
              </p>
            </div>
            <div className="text-[11px] text-slate-400">
              {filteredLeads.length} lead(s)
            </div>
          </div>

          {/* TABLE */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr className="bg-slate-900 text-slate-300 text-[11px] uppercase tracking-wide">
                  <th className="py-3 px-4 border-b border-slate-800">
                    Traité
                  </th>
                  <th className="py-3 px-4 border-b border-slate-800 text-left">
                    Nom
                  </th>
                  <th className="py-3 px-4 border-b border-slate-800 text-left">
                    Entreprise
                  </th>
                  <th className="py-3 px-4 border-b border-slate-800 text-left">
                    Localisation
                  </th>
                  <th className="py-3 px-4 border-b border-slate-800 text-left">
                    LinkedIn
                  </th>
                  <th className="py-3 px-4 border-b border-slate-800 text-center">
                    Date
                  </th>
                  <th className="py-3 px-4 border-b border-slate-800 text-center">
                    Supprimer
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredLeads.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-10 text-center text-slate-500"
                    >
                      Aucun résultat.
                    </td>
                  </tr>
                ) : (
                  filteredLeads.map((lead) => {
                    const fullName =
                      `${lead.FirstName ?? ""} ${lead.LastName ?? ""}`.trim() ||
                      lead.Name ||
                      "—";

                    return (
                      <tr
                        key={lead.id}
                        className="border-b border-slate-900 hover:bg-slate-900/60 transition group"
                      >
                        <td className="py-3 px-4 text-center">
                          <TraiteCheckbox
                            leadId={lead.id}
                            defaultChecked={Boolean(lead.traite)}
                          />
                        </td>

                        <td className="py-3 px-4 text-slate-50 relative pr-14">
                          <div className="flex items-center gap-2">
                            {lead.message_sent && (
                              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-sm" />
                            )}
                            <span>{fullName}</span>
                          </div>

                          <button
                            onClick={() => setOpenLead(lead)}
                            className="opacity-0 group-hover:opacity-100 absolute right-3 top-1/2 -translate-y-1/2 text-[11px] px-3 py-1.5 rounded-lg bg-indigo-600/70 hover:bg-indigo-500 backdrop-blur-md text-white transition shadow-sm hover:shadow-md"
                          >
                            Voir →
                          </button>
                        </td>

                        <td className="py-3 px-4 text-slate-300">
                          {lead.Company || "—"}
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          {lead.location || "—"}
                        </td>

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

                        <td className="py-3 px-4 text-center text-slate-400">
                          {lead.created_at
                            ? new Date(lead.created_at).toLocaleDateString(
                                "fr-FR"
                              )
                            : "—"}
                        </td>

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

      {/* --- PREMIUM SIDEBAR --- */}
      {openLead && (
        <div
          className="
            fixed right-0 top-0 h-full w-[420px]
            bg-gradient-to-b from-slate-900/95 to-slate-900/80
            backdrop-blur-2xl border-l border-slate-800
            shadow-[0_0_40px_-10px_rgba(99,102,241,0.5)]
            p-6 z-50 animate-slideLeft
          "
        >
          <div className="sticky top-0 pb-3 bg-slate-900/80 backdrop-blur-xl">
            <button
              className="text-slate-400 text-xs mb-4 hover:text-slate-200 transition"
              onClick={() => setOpenLead(null)}
            >
              ✕ Fermer
            </button>

            <h2 className="text-2xl font-semibold text-slate-50 mb-2">
              {openLead.FirstName} {openLead.LastName}
            </h2>
          </div>

          <div className="mt-4 space-y-4 text-sm text-slate-300 border-b border-slate-800 pb-6">
            <div>
              <span className="text-slate-500 text-xs uppercase tracking-wide">
                Entreprise
              </span>
              <p className="text-slate-200 mt-1">{openLead.Company || "—"}</p>
            </div>

            <div>
              <span className="text-slate-500 text-xs uppercase tracking-wide">
                Localisation
              </span>
              <p className="text-slate-200 mt-1">{openLead.location || "—"}</p>
            </div>

            <div>
              <span className="text-slate-500 text-xs uppercase tracking-wide">
                LinkedIn
              </span>
              <p className="mt-1">
                {openLead.LinkedInURL ? (
                  <a
                    href={openLead.LinkedInURL}
                    target="_blank"
                    className="text-indigo-400 hover:underline"
                  >
                    Voir profil →
                  </a>
                ) : (
                  "—"
                )}
              </p>
            </div>

            <div>
              <span className="text-slate-500 text-xs uppercase tracking-wide">
                Créé le
              </span>
              <p className="text-slate-200 mt-1">
                {openLead.created_at?.slice(0, 10)}
              </p>
            </div>
          </div>

          <div className="mt-6">
            <label className="text-xs text-slate-400 mb-2 block">
              Message interne
            </label>

            <textarea
              value={openLead.internal_message ?? ""}
              onChange={(e) => {
                const newMsg = e.target.value;
                setOpenLead({ ...openLead, internal_message: newMsg });
                setSafeLeads((prev) =>
                  prev.map((l) =>
                    l.id === openLead.id
                      ? { ...l, internal_message: newMsg }
                      : l
                  )
                );
              }}
              placeholder="Écris une note interne…"
              className="
                w-full h-44 p-4 rounded-xl
                bg-slate-800/60 border border-slate-700
                text-sm text-slate-200
                focus:outline-none focus:ring-2 focus:ring-indigo-500/60
                transition
              "
            ></textarea>
          </div>

          <div className="mt-4">
            <button
              onClick={handleMessageSent}
              disabled={openLead.message_sent}
              className={`
                w-full px-4 py-3 rounded-xl text-sm font-medium transition
                ${
                  openLead.message_sent
                    ? "bg-emerald-600 text-white cursor-default"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white"
                }
              `}
            >
              {openLead.message_sent
                ? "Message envoyé ✓"
                : "Marquer comme envoyé"}
            </button>
          </div>

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
function KPI({
  title,
  value,
  text,
}: {
  title: string;
  value: any;
  text: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-950 border border-slate-800 p-6 flex flex-col items-center text-center shadow-inner">
      <div className="text-[11px] text-slate-500 uppercase tracking-wide">
        {title}
      </div>
      <div className="text-3xl font-semibold text-slate-50 mt-1">{value}</div>
      <p className="text-[11px] text-slate-500 mt-1">{text}</p>
    </div>
  );
}