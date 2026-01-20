"use client";

import { useEffect, useMemo, useState } from "react";
import SubscriptionGate from "@/components/SubscriptionGate";

export default function FollowupsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openLead, setOpenLead] = useState<any>(null);

  // Fetch all leads with followups (LOGIQUE INCHANGÉE)
  useEffect(() => {
    (async () => {
      const res1 = await fetch("/api/get-leads");
      const res2 = await fetch("/api/get-map-leads");

      const data1 = await res1.json();
      const data2 = await res2.json();

      const merged = [...(data1.leads ?? []), ...(data2.leads ?? [])];

      // Only leads with next_followup_at
      const filtered = merged.filter((l) => l.next_followup_at != null);

      setLeads(filtered);
      setLoaded(true);
    })();
  }, []);

  if (!loaded)
    return (
      <div className="min-h-[60vh] w-full flex items-center justify-center">
        <div className="w-full max-w-xl px-6">
          <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/60 p-6 shadow-[0_20px_80px_-40px_rgba(99,102,241,0.35)]">
            <div className="absolute inset-0 bg-[radial-gradient(800px_circle_at_20%_10%,rgba(99,102,241,0.18),transparent_55%),radial-gradient(700px_circle_at_90%_70%,rgba(16,185,129,0.14),transparent_55%)]" />
            <div className="relative">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center">
                  <div className="h-5 w-5 rounded-full border-2 border-slate-400 border-t-slate-200 animate-spin" />
                </div>
                <div>
                  <p className="text-slate-100 font-medium">Chargement des relances…</p>
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

  // Paris timezone date (LOGIQUE INCHANGÉE)
  const today = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" })
  );

  // 🔧 FIX 1 : éviter crash si la date n’est pas une string (LOGIQUE INCHANGÉE)
  const cleanDate = (d: any) => {
    if (!d || typeof d !== "string") return new Date("2100-01-01");
    return new Date(d.split("T")[0] + "T00:00:00");
  };

  const overdue = leads.filter(
    (l) => cleanDate(l.next_followup_at) < cleanDate(today.toISOString())
  );
  const todayList = leads.filter(
    (l) =>
      cleanDate(l.next_followup_at).getTime() ===
      cleanDate(today.toISOString()).getTime()
  );
  const upcoming = leads.filter(
    (l) => cleanDate(l.next_followup_at) > cleanDate(today.toISOString())
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

  const stats = useMemo(() => {
    const total = leads.length;
    const mapCount = leads.filter((l) => isMapLead(l)).length;
    const liCount = total - mapCount;
    return { total, mapCount, liCount };
  }, [leads]);

  const formatFR = (d: any) => new Date(d).toLocaleDateString("fr-FR");

  const badgeTone = (kind: "overdue" | "today" | "upcoming") => {
    if (kind === "overdue")
      return "border-rose-500/30 bg-rose-500/10 text-rose-200";
    if (kind === "today")
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    return "border-sky-500/30 bg-sky-500/10 text-sky-200";
  };

  const Section = ({
    title,
    data,
    kind,
  }: any) => (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg sm:text-xl font-semibold text-slate-100">
            {title}
          </h2>
          <span
            className={[
              "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
              badgeTone(kind),
            ].join(" ")}
          >
            {data.length} {data.length > 1 ? "relances" : "relance"}
          </span>
        </div>

        <div className="hidden md:flex items-center gap-2 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-800 bg-slate-900/50 px-2 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
            LinkedIn / CRM
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-800 bg-slate-900/50 px-2 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Google Maps
          </span>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="rounded-3xl border border-slate-800 bg-slate-950/40 p-6">
          <p className="text-slate-400 text-sm">
            Rien à traiter ici pour le moment.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {data.map((lead: any) => {
            const name = leadDisplayName(lead);
            const company = lead.Company;
            const when = lead.next_followup_at ? formatFR(lead.next_followup_at) : "—";
            const map = isMapLead(lead);

            return (
              <button
                key={lead.id}
                type="button"
                onClick={() => setOpenLead(lead)}
                className={[
                  "group text-left rounded-3xl border p-5 transition",
                  "bg-slate-950/35 border-slate-800 hover:border-indigo-500/50 hover:bg-slate-950/55",
                  "shadow-[0_20px_60px_-45px_rgba(99,102,241,0.35)]",
                  "focus:outline-none focus:ring-2 focus:ring-indigo-500/40",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div
                        className={[
                          "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium",
                          map
                            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
                            : "border-sky-500/25 bg-sky-500/10 text-sky-200",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "h-1.5 w-1.5 rounded-full",
                            map ? "bg-emerald-400" : "bg-sky-400",
                          ].join(" ")}
                        />
                        {map ? "Google Maps" : "LinkedIn"}
                      </div>

                      {company && (
                        <span className="hidden sm:inline text-xs text-slate-400 truncate">
                          {company}
                        </span>
                      )}
                    </div>

                    <h3 className="mt-2 text-slate-100 font-semibold text-base sm:text-lg leading-snug truncate">
                      {name}
                    </h3>

                    {company && (
                      <p className="sm:hidden mt-1 text-slate-400 text-xs truncate">
                        {company}
                      </p>
                    )}

                    <div className="mt-3 flex items-center gap-2 text-sm">
                      <span className="text-slate-400">Prochaine relance</span>
                      <span className="text-slate-200 font-semibold">
                        {when}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className="h-12 w-12 rounded-2xl border border-slate-800 bg-slate-900/40 flex items-center justify-center">
                      <span className="text-slate-200 text-lg">↗</span>
                    </div>

                    <span className="text-[11px] text-slate-500 group-hover:text-slate-400">
                      Ouvrir
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    {lead.location && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-slate-800 bg-slate-900/40 px-2 py-1">
                        <span className="text-slate-400">📍</span>
                        <span className="truncate max-w-[210px]">{lead.location}</span>
                      </span>
                    )}
                  </div>

                  <span className="text-xs text-slate-500 group-hover:text-slate-300">
                    Voir détails →
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );

  return (
    <SubscriptionGate supportEmail="contact@mindlink.fr">
      <>
        {/* Background */}
        <div className="relative">
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute inset-0 bg-[radial-gradient(1100px_circle_at_15%_0%,rgba(99,102,241,0.16),transparent_55%),radial-gradient(1000px_circle_at_90%_30%,rgba(16,185,129,0.12),transparent_55%),radial-gradient(900px_circle_at_50%_100%,rgba(56,189,248,0.10),transparent_55%)]" />
            <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-950/85 to-slate-950" />
          </div>

          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
            {/* Header */}
            <div className="flex flex-col gap-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/40 px-3 py-1 text-xs text-slate-300">
                    <span className="h-2 w-2 rounded-full bg-indigo-400" />
                    Relances & suivi
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-400">
                      Fuseau : Europe/Paris
                    </span>
                  </div>

                  <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight text-slate-50">
                    Relances clients
                  </h1>
                  <p className="text-slate-300/80 text-sm sm:text-base max-w-2xl">
                    Priorise ce qui est en retard, traite aujourd’hui, et anticipe
                    le reste. Tout au même endroit (LinkedIn + Google Maps).
                  </p>
                </div>

                <div className="hidden md:flex items-center gap-3">
                  <div className="rounded-3xl border border-slate-800 bg-slate-950/35 px-4 py-3">
                    <p className="text-xs text-slate-400">Aujourd’hui</p>
                    <p className="text-sm font-semibold text-slate-100">
                      {today.toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Stats cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-3xl border border-slate-800 bg-slate-950/35 p-4">
                  <p className="text-xs text-slate-400">Total relances</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-100">
                    {stats.total}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Leads avec <span className="text-slate-300">next_followup_at</span>
                  </p>
                </div>

                <div className="rounded-3xl border border-slate-800 bg-slate-950/35 p-4">
                  <p className="text-xs text-slate-400">En retard</p>
                  <p className="mt-1 text-2xl font-semibold text-rose-200">
                    {overdue.length}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    À traiter en priorité
                  </p>
                </div>

                <div className="rounded-3xl border border-slate-800 bg-slate-950/35 p-4">
                  <p className="text-xs text-slate-400">Sources</p>
                  <p className="mt-1 text-sm font-semibold text-slate-100">
                    <span className="text-sky-200">{stats.liCount}</span>{" "}
                    LinkedIn{" "}
                    <span className="text-slate-600">•</span>{" "}
                    <span className="text-emerald-200">{stats.mapCount}</span>{" "}
                    Maps
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    Même workflow, deux canaux.
                  </p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="mt-8 space-y-10">
              <Section title="🔥 En retard" data={overdue} kind="overdue" />
              <Section title="📅 Aujourd’hui" data={todayList} kind="today" />
              <Section title="⏳ À venir" data={upcoming} kind="upcoming" />
            </div>
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
                  shadow-[0_0_80px_-20px_rgba(99,102,241,0.45)]
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
                                openLead?.placeUrl ? "bg-emerald-400" : "bg-sky-400",
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
                          <span className="text-indigo-300 font-semibold">
                            {new Date(openLead.next_followup_at).toLocaleDateString(
                              "fr-FR"
                            )}
                          </span>
                        </p>
                      </div>

                      <button
                        onClick={() => setOpenLead(null)}
                        className="
                          shrink-0 rounded-2xl border border-slate-800
                          bg-slate-900/40 px-3 py-2 text-xs text-slate-300
                          hover:bg-slate-900/70 hover:text-slate-100 transition
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
                        shadow-[0_18px_50px_-30px_rgba(16,185,129,0.65)]
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
                    <div className="rounded-3xl border border-slate-800 bg-slate-950/35 p-5">
                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        Informations
                      </p>

                      <div className="mt-3 space-y-3 text-sm text-slate-200">
                        {openLead.Company && (
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-slate-400">Entreprise</p>
                            <p className="text-right font-medium">{openLead.Company}</p>
                          </div>
                        )}

                        {openLead.email && (
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-slate-400">Email</p>
                            <p className="text-right font-medium break-all">
                              {openLead.email}
                            </p>
                          </div>
                        )}

                        {openLead.phoneNumber && (
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-slate-400">Téléphone</p>
                            <p className="text-right font-medium">
                              {openLead.phoneNumber}
                            </p>
                          </div>
                        )}

                        {openLead.location && (
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-slate-400">Localisation</p>
                            <p className="text-right font-medium">{openLead.location}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-slate-800 bg-slate-950/35 p-5">
                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        Liens
                      </p>

                      <div className="mt-4 grid grid-cols-1 gap-3">
                        {openLead.LinkedInURL && (
                          <a
                            href={openLead.LinkedInURL}
                            className="
                              group flex items-center justify-between rounded-2xl
                              border border-slate-800 bg-slate-900/40 px-4 py-3
                              hover:bg-slate-900/70 hover:border-sky-500/40 transition
                            "
                            target="_blank"
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-2xl border border-slate-800 bg-slate-950/40 flex items-center justify-center">
                                <span className="text-sky-300 text-lg">in</span>
                              </div>
                              <div>
                                <p className="text-slate-100 font-medium text-sm">
                                  LinkedIn
                                </p>
                                <p className="text-slate-500 text-xs">
                                  Ouvrir le profil
                                </p>
                              </div>
                            </div>
                            <span className="text-slate-400 group-hover:text-slate-200">
                              →
                            </span>
                          </a>
                        )}

                        {openLead.placeUrl && (
                          <a
                            href={openLead.placeUrl}
                            className="
                              group flex items-center justify-between rounded-2xl
                              border border-slate-800 bg-slate-900/40 px-4 py-3
                              hover:bg-slate-900/70 hover:border-emerald-500/40 transition
                            "
                            target="_blank"
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-2xl border border-slate-800 bg-slate-950/40 flex items-center justify-center">
                                <span className="text-emerald-300 text-lg">⌁</span>
                              </div>
                              <div>
                                <p className="text-slate-100 font-medium text-sm">
                                  Google Maps
                                </p>
                                <p className="text-slate-500 text-xs">
                                  Ouvrir la fiche établissement
                                </p>
                              </div>
                            </div>
                            <span className="text-slate-400 group-hover:text-slate-200">
                              →
                            </span>
                          </a>
                        )}

                        {!openLead.LinkedInURL && !openLead.placeUrl && (
                          <p className="text-slate-500 text-sm">
                            Aucun lien disponible pour ce lead.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* footer */}
                  <div className="p-6 border-t border-slate-800">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Astuce : clique sur une carte pour ouvrir les détails.</span>
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