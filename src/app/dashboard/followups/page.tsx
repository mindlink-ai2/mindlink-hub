"use client";

import { useEffect, useMemo, useState } from "react";
import SubscriptionGate from "@/components/SubscriptionGate";

export default function FollowupsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openLead, setOpenLead] = useState<any>(null);

  // UI state (ajout UX uniquement)
  const [tab, setTab] = useState<"overdue" | "today" | "upcoming">("overdue");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"date" | "name" | "company">("date");
  const [compact, setCompact] = useState(true);

  // Fetch all leads with followups (LOGIQUE INCHANGÉE)
  useEffect(() => {
    (async () => {
      try {
        const res1 = await fetch("/api/get-leads");
        const res2 = await fetch("/api/get-map-leads");

        const data1 = res1.ok ? await res1.json() : { leads: [] };
        const data2 = res2.ok ? await res2.json() : { leads: [] };

        const merged = [...(data1.leads ?? []), ...(data2.leads ?? [])];

        // Only leads with next_followup_at
        const filtered = merged.filter((l) => l.next_followup_at != null);

        setLeads(filtered);
      } catch {
        // En cas d'erreur réseau/JSON, on évite le crash et on affiche une liste vide
        setLeads([]);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  if (!loaded)
    return (
      <div className="min-h-[60vh] w-full flex items-center justify-center">
        <div className="w-full max-w-xl px-6">
          <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/60 p-6 shadow-[0_20px_80px_-40px_rgba(2,6,23,0.6)]">
            <div className="relative">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center">
                  <div className="h-5 w-5 rounded-full border-2 border-slate-400 border-t-slate-200 animate-spin" />
                </div>
                <div>
                  <p className="text-slate-100 font-medium">
                    Chargement des relances…
                  </p>
                  <p className="text-slate-400 text-sm">
                    On prépare ta liste (LinkedIn + Google Maps).
                  </p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                <div className="h-16 rounded-2xl bg-slate-900/60 border border-slate-800 animate-pulse" />
                <div className="h-16 rounded-2xl bg-slate-900/60 border border-slate-800 animate-pulse" />
                <div className="h-16 rounded-2xl bg-slate-900/60 border border-slate-800 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );

  // ✅ Paris timezone day key (incassable) -> "YYYY-MM-DD"
  const todayKey = (() => {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Paris",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());

      const y = parts.find((p) => p.type === "year")?.value;
      const m = parts.find((p) => p.type === "month")?.value;
      const d = parts.find((p) => p.type === "day")?.value;

      if (y && m && d) return `${y}-${m}-${d}`;
    } catch {}
    return new Date().toISOString().split("T")[0];
  })();

  // 🔧 FIX 1 : éviter crash si la date n’est pas une string (LOGIQUE INCHANGÉE)
  const cleanDate = (d: any) => {
    if (!d || typeof d !== "string") return new Date("2100-01-01");
    const dt = new Date(d.split("T")[0] + "T00:00:00");
    if (isNaN(dt.getTime())) return new Date("2100-01-01");
    return dt;
  };

  const overdue = leads.filter(
    (l) => cleanDate(l.next_followup_at) < cleanDate(todayKey)
  );
  const todayList = leads.filter(
    (l) =>
      cleanDate(l.next_followup_at).getTime() === cleanDate(todayKey).getTime()
  );
  const upcoming = leads.filter(
    (l) => cleanDate(l.next_followup_at) > cleanDate(todayKey)
  );

  // 🔵 Fonction : marquer comme répondu (LinkedIn OU Maps) (LOGIQUE INCHANGÉE)
  const markAsResponded = async (leadId: string) => {
    // 🔧 FIX 2 : éviter crash si openLead est null
    const isMapLead = !!openLead?.placeUrl;

    const endpoint = isMapLead
      ? "/api/map-leads/responded"
      : "/api/leads/responded";

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId }),
    });

    if (res.ok) {
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
      setOpenLead(null);
    }
  };

  // UI helpers (SANS CHANGER LA LOGIQUE MÉTIER)
  const isMapLead = (lead: any) => !!lead?.placeUrl;
  const leadDisplayName = (lead: any) =>
    `${lead.FirstName || lead.title || "—"} ${lead.LastName || ""}`.trim();

  const safeFormatFR = (d: any) => {
    if (!d) return "—";
    const dt =
      typeof d === "string" ? new Date(d) : d instanceof Date ? d : null;
    if (!dt || isNaN(dt.getTime())) return "—";
    return dt.toLocaleDateString("fr-FR");
  };

  const stats = useMemo(() => {
    const total = leads.length;
    const mapCount = leads.filter((l) => isMapLead(l)).length;
    const liCount = total - mapCount;
    return { total, mapCount, liCount };
  }, [leads]);

  const activeList =
    tab === "overdue" ? overdue : tab === "today" ? todayList : upcoming;

  const filteredSorted = useMemo(() => {
    const needle = q.trim().toLowerCase();

    const base = !needle
      ? activeList
      : activeList.filter((l) => {
          const name = leadDisplayName(l).toLowerCase();
          const company = (l.Company ?? "").toLowerCase();
          const location = (l.location ?? "").toLowerCase();
          return (
            name.includes(needle) ||
            company.includes(needle) ||
            location.includes(needle)
          );
        });

    const byDate = (a: any, b: any) =>
      cleanDate(a.next_followup_at).getTime() -
      cleanDate(b.next_followup_at).getTime();

    const byName = (a: any, b: any) =>
      leadDisplayName(a).localeCompare(leadDisplayName(b));

    const byCompany = (a: any, b: any) =>
      String(a.Company ?? "").localeCompare(String(b.Company ?? ""));

    const sorted = [...base].sort(
      sort === "date" ? byDate : sort === "name" ? byName : byCompany
    );

    return sorted;
  }, [activeList, q, sort]); // cleanDate + leadDisplayName stables

  const TabButton = ({
    value,
    label,
    count,
    tone,
  }: {
    value: "overdue" | "today" | "upcoming";
    label: string;
    count: number;
    tone: string;
  }) => {
    const active = tab === value;
    return (
      <button
        type="button"
        onClick={() => setTab(value)}
        className={[
          "relative flex-1 rounded-2xl border px-4 py-3 text-left transition",
          active
            ? "border-slate-700 bg-slate-900/50 shadow-[0_20px_60px_-45px_rgba(2,6,23,0.8)]"
            : "border-slate-800 bg-slate-950/30 hover:bg-slate-950/50 hover:border-slate-700",
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-100">{label}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {value === "overdue"
                ? "À traiter en priorité"
                : value === "today"
                ? "À faire aujourd’hui"
                : "Planifiées plus tard"}
            </p>
          </div>

          <span
            className={[
              "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
              tone,
            ].join(" ")}
          >
            {count}
          </span>
        </div>
      </button>
    );
  };

  const Row = ({ lead }: { lead: any }) => {
    const name = leadDisplayName(lead);
    const company = lead.Company;
    const when = safeFormatFR(lead.next_followup_at);
    const map = isMapLead(lead);

    return (
      <button
        type="button"
        onClick={() => setOpenLead(lead)}
        className={[
          "group w-full text-left rounded-2xl border transition",
          "border-slate-800 bg-slate-950/25 hover:bg-slate-950/45 hover:border-slate-700",
          "focus:outline-none focus:ring-2 focus:ring-indigo-500/30",
          compact ? "px-4 py-3" : "px-5 py-4",
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex items-center gap-3">
            <div
              className={[
                "h-10 w-10 rounded-2xl border flex items-center justify-center shrink-0",
                "border-slate-800 bg-slate-900/30",
              ].join(" ")}
            >
              <span className={map ? "text-emerald-300" : "text-sky-300"}>
                {map ? "⌁" : "in"}
              </span>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-slate-100 font-semibold truncate">{name}</p>
                <span
                  className={[
                    "hidden sm:inline-flex items-center gap-2 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                    map
                      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
                      : "border-sky-500/25 bg-sky-500/10 text-sky-200",
                  ].join(" ")}
                >
                  <span
                    className={
                      map
                        ? "h-1.5 w-1.5 rounded-full bg-emerald-400"
                        : "h-1.5 w-1.5 rounded-full bg-sky-400"
                    }
                  />
                  {map ? "Maps" : "LinkedIn"}
                </span>
              </div>

              <div className="mt-0.5 flex items-center gap-2 min-w-0">
                {company && (
                  <p className="text-slate-400 text-xs truncate">{company}</p>
                )}
                {lead.location && (
                  <span className="text-slate-600 text-xs truncate hidden md:inline">
                    • {lead.location}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-xs text-slate-400">Relance</p>
            <p className="text-sm font-semibold text-slate-200">{when}</p>
            <p className="text-[11px] text-slate-500 group-hover:text-slate-400 mt-0.5">
              Ouvrir →
            </p>
          </div>
        </div>
      </button>
    );
  };

  return (
    <SubscriptionGate supportEmail="contact@mindlink.fr">
      <>
        {/* PAGE (pas de fond spécial, clean) */}
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          {/* Header */}
          <div className="flex flex-col gap-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/40 px-3 py-1 text-xs text-slate-300">
                  <span className="h-2 w-2 rounded-full bg-slate-400" />
                  Relances clients
                  <span className="text-slate-600">•</span>
                  <span className="text-slate-400">Europe/Paris</span>
                </div>

                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight text-slate-50">
                  Relances
                </h1>

                <p className="text-slate-400 text-sm sm:text-base max-w-2xl">
                  Une vue simple et scalable : filtre, recherche, ouvre, traite.
                </p>
              </div>

              <div className="hidden md:flex items-center gap-3">
                <div className="rounded-3xl border border-slate-800 bg-slate-950/30 px-4 py-3">
                  <p className="text-xs text-slate-400">Aujourd’hui</p>
                  <p className="text-sm font-semibold text-slate-100">
                    {safeFormatFR(todayKey)}
                  </p>
                </div>
              </div>
            </div>

            {/* Tabs + counts */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <TabButton
                value="overdue"
                label="🔥 En retard"
                count={overdue.length}
                tone="border-rose-500/30 bg-rose-500/10 text-rose-200"
              />
              <TabButton
                value="today"
                label="📅 Aujourd’hui"
                count={todayList.length}
                tone="border-amber-500/30 bg-amber-500/10 text-amber-200"
              />
              <TabButton
                value="upcoming"
                label="⏳ À venir"
                count={upcoming.length}
                tone="border-sky-500/30 bg-sky-500/10 text-sky-200"
              />
            </div>

            {/* Controls */}
            <div className="rounded-3xl border border-slate-800 bg-slate-950/25 p-4">
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-950/40 px-3 py-2">
                    <span className="text-slate-500">⌕</span>
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Rechercher (nom, entreprise, localisation)…"
                      className="w-full bg-transparent outline-none text-sm text-slate-200 placeholder:text-slate-600"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as any)}
                    className="rounded-2xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 outline-none"
                  >
                    <option value="date">Trier : date</option>
                    <option value="name">Trier : nom</option>
                    <option value="company">Trier : entreprise</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => setCompact((v) => !v)}
                    className="rounded-2xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 hover:bg-slate-950/70 transition"
                  >
                    {compact ? "Compact" : "Confort"}
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/40 px-2 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                  LinkedIn : {stats.liCount}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/40 px-2 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Maps : {stats.mapCount}
                </span>
                <span className="text-slate-600">•</span>
                <span>{filteredSorted.length} résultat(s)</span>
              </div>
            </div>
          </div>

          {/* List */}
          <div className="mt-6 space-y-2">
            {filteredSorted.length === 0 ? (
              <div className="rounded-3xl border border-slate-800 bg-slate-950/25 p-6">
                <p className="text-slate-400 text-sm">
                  Aucune relance à afficher pour ce filtre.
                </p>
              </div>
            ) : (
              filteredSorted.map((lead: any) => <Row key={lead.id} lead={lead} />)
            )}
          </div>

          {/* SIDEBAR PREMIUM (LOGIQUE INCHANGÉE) */}
          {openLead && (
            <>
              {/* overlay */}
              <button
                type="button"
                onClick={() => setOpenLead(null)}
                className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-[2px]"
                aria-label="Fermer"
              />

              <aside
                className="
                  fixed right-0 top-0 z-50 h-full w-full sm:w-[520px]
                  bg-slate-950/85 backdrop-blur-2xl
                  border-l border-slate-800
                  shadow-[0_0_80px_-20px_rgba(2,6,23,0.85)]
                  animate-slideLeft
                "
              >
                <div className="h-full flex flex-col">
                  {/* header */}
                  <div className="p-6 border-b border-slate-800">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={[
                              "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium",
                              openLead?.placeUrl
                                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
                                : "border-sky-500/25 bg-sky-500/10 text-sky-200",
                            ].join(" ")}
                          >
                            <span
                              className={[
                                "h-1.5 w-1.5 rounded-full",
                                openLead?.placeUrl
                                  ? "bg-emerald-400"
                                  : "bg-sky-400",
                              ].join(" ")}
                            />
                            {openLead?.placeUrl ? "Google Maps" : "LinkedIn"}
                          </span>
                        </div>

                        <h2 className="mt-3 text-xl sm:text-2xl font-semibold text-slate-50 truncate">
                          {openLead.FirstName || openLead.title}{" "}
                          {openLead.LastName || ""}
                        </h2>

                        <p className="mt-1 text-slate-300/80 text-sm">
                          Prochaine relance :{" "}
                          <span className="text-slate-100 font-semibold">
                            {safeFormatFR(openLead.next_followup_at)}
                          </span>
                        </p>
                      </div>

                      <button
                        onClick={() => setOpenLead(null)}
                        className="
                          shrink-0 rounded-2xl border border-slate-800
                          bg-slate-900/30 px-3 py-2 text-xs text-slate-300
                          hover:bg-slate-900/60 hover:text-slate-100 transition
                        "
                      >
                        ✕ Fermer
                      </button>
                    </div>

                    {/* primary action */}
                    <button
                      onClick={() => markAsResponded(openLead.id)}
                      className="
                        mt-5 w-full rounded-2xl py-3
                        bg-emerald-600 hover:bg-emerald-500
                        text-sm font-semibold text-white transition
                        shadow-[0_18px_50px_-30px_rgba(16,185,129,0.6)]
                        focus:outline-none focus:ring-2 focus:ring-emerald-400/40
                      "
                    >
                      Marquer comme répondu ✓
                    </button>

                    <p className="mt-2 text-xs text-slate-500">
                      Cela retirera le lead de la liste des relances.
                    </p>
                  </div>

                  {/* body */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    <div className="rounded-3xl border border-slate-800 bg-slate-950/25 p-5">
                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        Informations
                      </p>

                      <div className="mt-3 space-y-3 text-sm text-slate-200">
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
                  </div>

                  {/* footer */}
                  <div className="p-6 border-t border-slate-800">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Astuce : recherche + tri pour traiter vite.</span>
                      <span className="text-slate-600">LIDMEO</span>
                    </div>
                  </div>
                </div>
              </aside>
            </>
          )}
        </div>
      </>
    </SubscriptionGate>
  );
}