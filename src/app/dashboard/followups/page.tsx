"use client";

import { useEffect, useMemo, useState } from "react";
import SubscriptionGate from "@/components/SubscriptionGate";

type Lead = any;

export default function FollowupsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openLead, setOpenLead] = useState<Lead | null>(null);

  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc"); // prochaine relance la + proche par défaut

  // Fetch all leads with followups
  useEffect(() => {
    (async () => {
      try {
        const [res1, res2] = await Promise.all([
          fetch("/api/get-leads"),
          fetch("/api/get-map-leads"),
        ]);

        const data1 = await res1.json();
        const data2 = await res2.json();

        const merged = [...(data1.leads ?? []), ...(data2.leads ?? [])];

        // Only leads with next_followup_at
        const filtered = merged.filter((l) => l?.next_followup_at != null);

        setLeads(filtered);
      } catch (e) {
        console.error(e);
        setLeads([]);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // Paris timezone date
  const today = useMemo(() => {
    return new Date(
      new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" })
    );
  }, []);

  // ✅ Safe date parser (kept)
  const cleanDate = (d: any) => {
    if (!d || typeof d !== "string") return new Date("2100-01-01");
    return new Date(d.split("T")[0] + "T00:00:00");
  };

  const todayISO = useMemo(() => today.toISOString(), [today]);

  const filteredBySearch = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return leads;

    return leads.filter((l) => {
      const name = `${l?.FirstName ?? ""} ${l?.LastName ?? ""}`.toLowerCase();
      const company = String(l?.Company ?? "").toLowerCase();
      const title = String(l?.title ?? "").toLowerCase(); // maps
      return (
        name.includes(s) || company.includes(s) || title.includes(s)
      );
    });
  }, [leads, search]);

  const sorted = useMemo(() => {
    const copy = [...filteredBySearch];
    copy.sort((a, b) => {
      const da = cleanDate(a?.next_followup_at).getTime();
      const db = cleanDate(b?.next_followup_at).getTime();
      return sortDir === "asc" ? da - db : db - da;
    });
    return copy;
  }, [filteredBySearch, sortDir]);

  const overdue = useMemo(() => {
    return sorted.filter(
      (l) => cleanDate(l.next_followup_at) < cleanDate(todayISO)
    );
  }, [sorted, todayISO]);

  const todayList = useMemo(() => {
    return sorted.filter(
      (l) =>
        cleanDate(l.next_followup_at).getTime() ===
        cleanDate(todayISO).getTime()
    );
  }, [sorted, todayISO]);

  const upcoming = useMemo(() => {
    return sorted.filter(
      (l) => cleanDate(l.next_followup_at) > cleanDate(todayISO)
    );
  }, [sorted, todayISO]);

  // 🔵 Marquer comme répondu (LinkedIn OU Maps)
  const markAsResponded = async (leadId: string) => {
    const isMapLead = !!openLead?.placeUrl;

    const endpoint = isMapLead
      ? "/api/map-leads/responded"
      : "/api/leads/responded";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });

      if (!res.ok) return;

      setLeads((prev) => prev.filter((l) => String(l.id) !== String(leadId)));
      setOpenLead(null);
    } catch (e) {
      console.error(e);
    }
  };

  const total = leads.length;

  if (!loaded) {
    return (
      <div className="text-slate-400 text-sm px-6 pt-20">
        Chargement…
      </div>
    );
  }

  return (
    <SubscriptionGate supportEmail="contact@lidmeo.com">
      <>
        <div className="min-h-screen w-full px-6 pt-20 pb-32">
          <div className="mx-auto w-full max-w-6xl space-y-10">
            {/* HEADER */}
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-50">
                  Relances
                </h1>
                <p className="text-slate-400 text-sm md:text-base mt-2 max-w-2xl">
                  Suivez vos relances en retard, du jour et à venir. Ouvrez une fiche pour accéder au contact et marquer “répondu”.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <StatChip title="Total" value={total} />
                <StatChip title="En retard" value={overdue.length} />
                <StatChip title="Aujourd’hui" value={todayList.length} />
                <StatChip title="À venir" value={upcoming.length} />
              </div>
            </div>

            {/* SEARCH + SORT */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="w-full max-w-xl">
                <div
                  className="
                    flex items-center gap-3
                    bg-slate-900/60 border border-slate-700 rounded-2xl
                    px-4 py-3 shadow-inner backdrop-blur-md
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
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Rechercher (nom, entreprise)…"
                    className="
                      bg-transparent w-full text-sm text-slate-200 placeholder-slate-500
                      focus:outline-none
                    "
                  />
                </div>

                <div className="mt-2 text-[11px] text-slate-500">
                  {sorted.length} relance(s) affichée(s)
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSortDir((p) => (p === "asc" ? "desc" : "asc"))}
                  className="px-4 py-2 text-xs md:text-sm rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 transition text-slate-200"
                >
                  Trier : {sortDir === "asc" ? "plus proche" : "plus lointaine"}
                </button>
              </div>
            </div>

            {/* SECTIONS */}
            <Section
              title="🔥 En retard"
              subtitle="À traiter en priorité"
              empty="Aucune relance en retard."
              data={overdue}
              onOpen={setOpenLead}
            />

            <Section
              title="📅 Aujourd’hui"
              subtitle="Relances prévues aujourd’hui"
              empty="Aucune relance prévue aujourd’hui."
              data={todayList}
              onOpen={setOpenLead}
            />

            <Section
              title="⏳ À venir"
              subtitle="Relances à venir"
              empty="Aucune relance à venir."
              data={upcoming}
              onOpen={setOpenLead}
            />
          </div>
        </div>

        {/* SIDEBAR */}
        {openLead && (
          <div className="fixed inset-0 z-50">
            {/* overlay */}
            <div
              className="absolute inset-0 bg-black/55 backdrop-blur-sm"
              onClick={() => setOpenLead(null)}
            />

            {/* panel */}
            <div
              className="
                absolute right-0 top-0 h-full w-full sm:w-[420px]
                bg-slate-900/95 backdrop-blur-2xl
                border-l border-slate-800 p-6
                shadow-[0_0_40px_-10px_rgba(99,102,241,0.5)]
                animate-slideLeft
                flex flex-col
              "
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  onClick={() => setOpenLead(null)}
                  className="text-slate-400 text-xs hover:text-slate-200 transition"
                >
                  ✕ Fermer
                </button>

                <span className="text-[11px] px-2 py-1 rounded-full border border-slate-700 bg-slate-900/60 text-slate-200">
                  {openLead.placeUrl ? "Google Maps" : "LinkedIn"}
                </span>
              </div>

              <h2 className="text-2xl font-semibold text-slate-50 mt-4">
                {(openLead.FirstName || openLead.title || "—") as any}{" "}
                {(openLead.LastName || "") as any}
              </h2>

              <p className="text-slate-400 text-sm mt-1">
                Prochaine relance :{" "}
                <span className="text-indigo-300 font-medium">
                  {openLead.next_followup_at
                    ? new Date(openLead.next_followup_at).toLocaleDateString("fr-FR")
                    : "—"}
                </span>
              </p>

              {openLead.Company && (
                <p className="text-slate-500 text-sm mt-2">{openLead.Company}</p>
              )}

              <button
                onClick={() => markAsResponded(openLead.id)}
                className="
                  w-full text-center py-3 mt-6 rounded-2xl
                  bg-emerald-600 hover:bg-emerald-500
                  text-sm font-semibold text-white transition
                "
              >
                Marquer comme répondu ✓
              </button>

              <div className="border-t border-slate-800 mt-6 pt-5 space-y-3 text-sm text-slate-300">
                {openLead.email && (
                  <Row label="Email">
                    <span className="text-slate-200">{openLead.email}</span>
                  </Row>
                )}

                {openLead.phoneNumber && (
                  <Row label="Téléphone">
                    <span className="text-slate-200">{openLead.phoneNumber}</span>
                  </Row>
                )}

                {openLead.LinkedInURL && (
                  <Row label="LinkedIn">
                    <a
                      href={openLead.LinkedInURL}
                      className="text-sky-400 hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Voir →
                    </a>
                  </Row>
                )}

                {openLead.placeUrl && (
                  <Row label="Google Maps">
                    <a
                      href={openLead.placeUrl}
                      className="text-emerald-400 hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ouvrir →
                    </a>
                  </Row>
                )}
              </div>

              <div className="mt-auto pt-6 text-[11px] text-slate-500">
                Astuce : traite d’abord “🔥 En retard” pour garder ton pipeline propre.
              </div>
            </div>
          </div>
        )}

        {/* Anim */}
        <style jsx global>{`
          @keyframes slideLeft {
            from {
              transform: translateX(24px);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
          .animate-slideLeft {
            animation: slideLeft 180ms ease-out;
          }
        `}</style>
      </>
    </SubscriptionGate>
  );
}

/* ------------------------- */
/* UI blocks                 */
/* ------------------------- */

function StatChip({ title, value }: { title: string; value: any }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-center shadow-inner">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">
        {title}
      </div>
      <div className="text-base font-semibold text-slate-100 mt-1">{value}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function Section({
  title,
  subtitle,
  empty,
  data,
  onOpen,
}: {
  title: string;
  subtitle: string;
  empty: string;
  data: any[];
  onOpen: (lead: any) => void;
}) {
  return (
    <section>
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl md:text-2xl font-semibold text-slate-100">
            {title}
          </h2>
          <p className="text-slate-500 text-sm mt-1">{subtitle}</p>
        </div>

        <span className="text-[11px] px-2 py-1 rounded-full border border-slate-800 bg-slate-950/60 text-slate-200">
          {data.length} relance(s)
        </span>
      </div>

      {data.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6 text-slate-500 text-sm">
          {empty}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.map((lead: any) => {
            const name =
              `${lead.FirstName ?? ""} ${lead.LastName ?? ""}`.trim() ||
              lead.title ||
              "—";

            return (
              <button
                key={lead.id}
                type="button"
                onClick={() => onOpen(lead)}
                className="
                  text-left p-5 rounded-2xl
                  bg-slate-900/70 border border-slate-800
                  hover:border-indigo-500/60 hover:bg-slate-900
                  transition shadow-md hover:shadow-indigo-500/10
                "
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-slate-100 font-semibold">{name}</div>
                    {lead.Company && (
                      <div className="text-slate-500 text-xs mt-1">
                        {lead.Company}
                      </div>
                    )}
                  </div>

                  <span className="text-[11px] px-2 py-1 rounded-full border border-slate-700 bg-slate-900/60 text-slate-200">
                    {lead.placeUrl ? "Maps" : "Lead"}
                  </span>
                </div>

                <div className="mt-3 text-slate-400 text-sm">
                  Prochaine relance :{" "}
                  <span className="text-slate-200 font-semibold">
                    {lead.next_followup_at
                      ? new Date(lead.next_followup_at).toLocaleDateString("fr-FR")
                      : "—"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}