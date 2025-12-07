"use client";

import { useEffect, useState } from "react";

export default function FollowupsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openLead, setOpenLead] = useState<any>(null);

  // Fetch all leads with followups
  useEffect(() => {
    (async () => {
      const res1 = await fetch("/api/get-leads");
      const res2 = await fetch("/api/get-map-leads");

      const data1 = await res1.json();
      const data2 = await res2.json();

      const merged = [...(data1.leads ?? []), ...(data2.leads ?? [])];

      // filtre safe (évite les crash)
      const filtered = merged.filter(
        (l) => l.next_followup_at !== null && l.next_followup_at !== undefined
      );

      setLeads(filtered);
      setLoaded(true);
    })();
  }, []);

  if (!loaded) return <p className="text-slate-400">Chargement…</p>;

  // TZ Paris
  const today = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" })
  );

  // Clean date SAFE (évite le crash split/T)
  const cleanDate = (d: any) => {
    if (!d) return new Date("1970-01-01");
    const str = typeof d === "string" ? d : d.toString();
    const day = str.split("T")[0];
    return new Date(day + "T00:00:00");
  };

  const t = cleanDate(today.toISOString());
  const overdue = leads.filter((l) => cleanDate(l.next_followup_at) < t);
  const todayList = leads.filter(
    (l) => cleanDate(l.next_followup_at).getTime() === t.getTime()
  );
  const upcoming = leads.filter((l) => cleanDate(l.next_followup_at) > t);

  // 🔵 MARQUER COMME RÉPONDU
  const markAsResponded = async (leadId: string) => {
    const isMapLead = openLead.placeUrl !== undefined; // Maps lead

    const endpoint = isMapLead
      ? "/api/map-leads/responded"
      : "/api/leads/responded"; // prépare LinkedIn (à créer)

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });

      if (!res.ok) {
        console.error("API responded with error");
        return;
      }

      // retire immédiatement le lead
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
      setOpenLead(null);
    } catch (e) {
      console.error(e);
    }
  };

  const Section = ({ title, data }: any) => (
    <div>
      <h2 className="text-xl font-semibold text-slate-100 mb-4 mt-10">{title}</h2>

      {data.length === 0 ? (
        <p className="text-slate-600 text-sm">Aucune relance</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.map((lead: any) => (
            <div
              key={lead.id}
              onClick={() => setOpenLead(lead)}
              className="
                p-5 rounded-xl bg-slate-900/70 border border-slate-800 
                hover:border-indigo-500/60 hover:bg-slate-900 
                transition cursor-pointer shadow-md hover:shadow-indigo-500/10
              "
            >
              <h3 className="text-slate-100 font-medium">
                {lead.FirstName || lead.title || "—"} {lead.LastName || ""}
              </h3>

              <p className="text-slate-400 text-sm mt-1">
                Prochaine relance :{" "}
                <span className="text-slate-200 font-semibold">
                  {new Date(lead.next_followup_at).toLocaleDateString("fr-FR")}
                </span>
              </p>

              {lead.Company && (
                <p className="text-slate-500 text-xs mt-2">{lead.Company}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="space-y-10">
        <div>
          <h1 className="text-3xl font-semibold text-slate-50">Relances clients</h1>
          <p className="text-slate-400 text-sm mt-1">
            Suivi des relances en retard, du jour et à venir.
          </p>
        </div>

        <Section title="🔥 En retard" data={overdue} />
        <Section title="📅 Aujourd’hui" data={todayList} />
        <Section title="⏳ À venir" data={upcoming} />
      </div>

      {/* SIDEBAR */}
      {openLead && (
        <div
          className="
            fixed right-0 top-0 h-full w-[420px]
            bg-slate-900/95 backdrop-blur-xl
            border-l border-slate-800 z-50 p-6
            shadow-[0_0_40px_-10px_rgba(99,102,241,0.5)]
            animate-slideLeft
          "
        >
          <button
            onClick={() => setOpenLead(null)}
            className="text-slate-400 text-xs mb-4 hover:text-slate-200"
          >
            ✕ Fermer
          </button>

          <h2 className="text-2xl font-semibold text-slate-50">
            {openLead.FirstName || openLead.title} {openLead.LastName || ""}
          </h2>

          <p className="text-slate-400 text-sm mt-1 mb-4">
            Prochaine relance :{" "}
            <span className="text-indigo-400 font-medium">
              {new Date(openLead.next_followup_at).toLocaleDateString("fr-FR")}
            </span>
          </p>

          {/* ⭐️ BOUTON */}
          <button
            onClick={() => markAsResponded(openLead.id)}
            className="
              w-full text-center py-2 mt-4 rounded-lg 
              bg-emerald-600 hover:bg-emerald-500 
              text-sm font-medium text-white transition
            "
          >
            Marquer comme répondu ✓
          </button>

          <div className="border-t border-slate-800 mt-4 pt-4 space-y-3 text-sm text-slate-300">
            {openLead.Company && (
              <p>
                <strong>Entreprise :</strong> {openLead.Company}
              </p>
            )}
            {openLead.email && (
              <p>
                <strong>Email :</strong> {openLead.email}
              </p>
            )}
            {openLead.phoneNumber && (
              <p>
                <strong>Téléphone :</strong> {openLead.phoneNumber}
              </p>
            )}
            {openLead.LinkedInURL && (
              <p>
                <strong>LinkedIn :</strong>{" "}
                <a
                  href={openLead.LinkedInURL}
                  className="text-sky-400 underline"
                  target="_blank"
                >
                  Voir →
                </a>
              </p>
            )}
            {openLead.placeUrl && (
              <p>
                <strong>Google Maps :</strong>{" "}
                <a
                  href={openLead.placeUrl}
                  className="text-green-400 underline"
                  target="_blank"
                >
                  Ouvrir →
                </a>
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}