"use client";

import { useEffect, useMemo, useState } from "react";
import TraiteCheckbox from "./TraiteCheckbox";
import DeleteLeadButton from "./DeleteLeadButton";
import SubscriptionGate from "@/components/SubscriptionGate";

export default function MapsPage() {
  const [safeLeads, setSafeLeads] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [openLead, setOpenLead] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);

  // ✅ NEW: Selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedCount = selectedIds.size;

  // ✅ NEW: open lead from query param (?open=ID)
  const [openFromQuery, setOpenFromQuery] = useState<string | null>(null);

  /* --------------------------------------------
      ✅ Read query param once on mount
  -------------------------------------------- */
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const openId = url.searchParams.get("open");
      if (openId) setOpenFromQuery(openId);
    } catch (e) {
      console.error(e);
    }
  }, []);

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
      ✅ After leads loaded, open sidebar if query exists
  -------------------------------------------- */
  useEffect(() => {
    if (!loaded) return;
    if (!openFromQuery) return;

    const target = safeLeads.find((l) => String(l.id) === String(openFromQuery));
    if (target) {
      setOpenLead({
        ...target,
        message_sent: target.message_sent ?? false,
        message_sent_at: target.message_sent_at ?? null,
        next_followup_at: target.next_followup_at ?? null,
      });

      // ✅ clean URL (remove ?open=)
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("open");
        window.history.replaceState({}, "", url.pathname + url.search);
      } catch (e) {
        console.error(e);
      }

      setOpenFromQuery(null);
    }
  }, [loaded, openFromQuery, safeLeads]);

  /* --------------------------------------------
      SEARCH FUNCTION (same quality as LinkedIn)
      ✅ filteredLeads is derived (no setFilteredLeads)
  -------------------------------------------- */
  const handleSearch = (value: string) => {
    setSearchTerm(value);
  };

  const filteredLeads = useMemo(() => {
    const v = searchTerm.trim().toLowerCase();
    if (!v) return safeLeads;

    return safeLeads.filter((l) => {
      return (
        (l.title ?? "").toLowerCase().includes(v) ||
        (l.email ?? "").toLowerCase().includes(v) ||
        (l.phoneNumber ?? "").toLowerCase().includes(v) ||
        (l.website ?? "").toLowerCase().includes(v) ||
        (l.placeUrl ?? "").toLowerCase().includes(v)
      );
    });
  }, [safeLeads, searchTerm]);

  const colCount = selectionMode ? 9 : 8;

  // ✅ NEW: cleanup selection when list changes (ex: deleted)
  useEffect(() => {
    if (!selectionMode) return;

    const existing = new Set(safeLeads.map((l) => String(l.id)));
    setSelectedIds((prev: Set<string>) => {
      const next = new Set<string>();
      prev.forEach((id) => {
        if (existing.has(id)) next.add(id);
      });
      return next;
    });
  }, [safeLeads, selectionMode]);

  // ✅ NEW: selection helpers
  const toggleSelectionMode = () => {
    setSelectionMode((prev) => {
      const next = !prev;
      if (!next) setSelectedIds(new Set());
      return next;
    });
  };

  const toggleSelected = (leadId: string) => {
    setSelectedIds((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    const filteredIds = filteredLeads.map((l) => String(l.id));
    const allSelected = filteredIds.every((id) => selectedIds.has(id));

    setSelectedIds((prev: Set<string>) => {
      const next = new Set(prev);

      if (allSelected) {
        filteredIds.forEach((id) => next.delete(id));
      } else {
        filteredIds.forEach((id) => next.add(id));
      }

      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    const ok = confirm(
      `Voulez-vous vraiment supprimer ${selectedIds.size} lead(s) ?`
    );
    if (!ok) return;

    const ids = Array.from(selectedIds)
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n));

    try {
      const res = await fetch("/dashboard/maps/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data?.error || "Impossible de supprimer ces leads. Réessayez.");
        return;
      }

      // ✅ instant UI update
      setSafeLeads((prev: any[]) =>
        prev.filter((l) => !selectedIds.has(String(l.id)))
      );
      setSelectedIds(new Set());
      setOpenLead((prev: any) =>
        prev && selectedIds.has(String(prev.id)) ? null : prev
      );
    } catch (e) {
      console.error(e);
      alert("Erreur réseau pendant la suppression.");
    }
  };

  const allFilteredSelected =
    filteredLeads.length > 0 &&
    filteredLeads.every((l) => selectedIds.has(String(l.id)));

  /* --------------------------------------------
      ✅ LIVE UI UPDATE via events (Traité / Delete)
      (same pattern as LinkedIn)
  -------------------------------------------- */
  useEffect(() => {
    const onTreated = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        leadId: string | number;
        traite: boolean;
      };
      if (!detail?.leadId) return;

      const leadIdStr = String(detail.leadId);

      setSafeLeads((prev) =>
        prev.map((l) =>
          String(l.id) === leadIdStr ? { ...l, traite: detail.traite } : l
        )
      );

      setOpenLead((prev: any) =>
        prev && String(prev.id) === leadIdStr
          ? { ...prev, traite: detail.traite }
          : prev
      );
    };

    const onDeleted = (e: Event) => {
      const detail = (e as CustomEvent).detail as { leadId: string | number };
      if (!detail?.leadId) return;

      const leadIdStr = String(detail.leadId);

      setSafeLeads((prev) => prev.filter((l) => String(l.id) !== leadIdStr));
      setOpenLead((prev: any) =>
        prev && String(prev.id) === leadIdStr ? null : prev
      );

      // ✅ NEW: remove from selection if needed
      setSelectedIds((prev: Set<string>) => {
        if (!prev.has(leadIdStr)) return prev;
        const next = new Set(prev);
        next.delete(leadIdStr);
        return next;
      });
    };

    window.addEventListener("mindlink:lead-treated", onTreated as EventListener);
    window.addEventListener("mindlink:lead-deleted", onDeleted as EventListener);

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

  /* --------------------------------------------
      🟣 AJOUT — OUVRIR EMAIL PRÉ-REMPLI (ne l’envoie pas)
  -------------------------------------------- */
  const openPrefilledEmail = () => {
    if (!openLead) return;

    const to = (openLead.email ?? "").trim();
    if (!to) return;

    const subject = `Mindlink — ${openLead.title ?? "Contact"}`;
    const body = (openLead.internal_message ?? "").trim();

    const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;

    window.location.href = mailto;
  };

  /* --------------------------------------------
      🟣 AJOUT — FALLBACK GMAIL WEB
  -------------------------------------------- */
  const openGmailWeb = () => {
    if (!openLead) return;

    const to = (openLead.email ?? "").trim();
    if (!to) return;

    const subject = `Mindlink — ${openLead.title ?? "Contact"}`;
    const body = (openLead.internal_message ?? "").trim();

    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
      to
    )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    window.open(url, "_blank");
  };

  /* --------------------------------------------
      🟣 AJOUT — FALLBACK OUTLOOK WEB
  -------------------------------------------- */
  const openOutlookWeb = () => {
    if (!openLead) return;

    const to = (openLead.email ?? "").trim();
    if (!to) return;

    const subject = `Mindlink — ${openLead.title ?? "Contact"}`;
    const body = (openLead.internal_message ?? "").trim();

    const url = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(
      to
    )}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    window.open(url, "_blank");
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

  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" })
  );
  const nextImport = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" })
  );
  nextImport.setHours(8, 0, 0, 0);
  if (now > nextImport) nextImport.setDate(nextImport.getDate() + 1);
  const diff = nextImport.getTime() - now.getTime();
  const min = Math.floor(diff / 1000 / 60);
  const h = Math.floor(min / 60);
  const m = min % 60;
  const nextImportText = h <= 0 ? `Dans ${m} min` : `Dans ${h}h ${m}min`;

  return (
    <SubscriptionGate supportEmail="contact@mindlink.fr">
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

          {/* 🔍 SEARCH BAR — même design premium que LinkedIn */}
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
                placeholder="Rechercher un lead (nom, email, téléphone, site)…"
                className="
                bg-transparent w-full text-sm text-slate-200 placeholder-slate-500
                focus:outline-none
              "
              />
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <KPI
              title="Total leads"
              value={total}
              text="Importés depuis Google Maps"
            />
            <KPI
              title="À traiter"
              value={remainingToTreat}
              text={`${remainingToTreat} restants`}
            />
            <KPI
              title="Prochaine importation"
              value={nextImportText}
              text="Tous les jours à 8h00"
            />
          </div>

          {/* TABLE */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/90 shadow-xl overflow-hidden">
            {/* TOP BAR */}
            <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center">
              <div>
                <h2 className="text-slate-100 text-sm font-medium">
                  Liste des leads Google Maps
                </h2>
                <p className="text-[11px] text-slate-500">
                  Triés du plus récent au plus ancien
                </p>
              </div>

              <div className="flex items-center gap-3">
                {/* ✅ NEW: Selection controls */}
                <button
                  type="button"
                  onClick={toggleSelectionMode}
                  className="
                  px-3 py-1.5 text-[11px] rounded-xl
                  bg-slate-900 border border-slate-700
                  hover:bg-slate-800 transition
                "
                >
                  {selectionMode ? "Annuler" : "Sélection"}
                </button>

                {selectionMode && (
                  <>
                    <button
                      type="button"
                      onClick={toggleSelectAllFiltered}
                      className="
                      px-3 py-1.5 text-[11px] rounded-xl
                      bg-slate-900 border border-slate-700
                      hover:bg-slate-800 transition
                    "
                    >
                      {allFilteredSelected
                        ? "Tout désélectionner"
                        : "Tout sélectionner"}
                    </button>

                    <button
                      type="button"
                      onClick={handleBulkDelete}
                      disabled={selectedCount === 0}
                      className={[
                        "px-3 py-1.5 text-[11px] rounded-xl transition border",
                        selectedCount === 0
                          ? "bg-slate-900/40 border-slate-800 text-slate-500 cursor-not-allowed"
                          : "bg-red-600/15 border-red-500/30 text-red-300 hover:bg-red-600/25",
                      ].join(" ")}
                    >
                      Supprimer ({selectedCount})
                    </button>
                  </>
                )}

                <div className="text-[11px] text-slate-400">
                  {filteredLeads.length} lead(s)
                </div>
              </div>
            </div>

            {/* TABLE CONTENT */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-separate border-spacing-0">
                <thead>
                  <tr className="bg-slate-900 text-slate-300 text-[11px] uppercase tracking-wide">
                    {/* ✅ NEW: selection column */}
                    {selectionMode && (
                      <th className="py-3 px-4 border-b border-slate-800 text-center">
                        Sel.
                      </th>
                    )}

                    <th className="py-3 px-4 border-b border-slate-800">
                      Traité
                    </th>
                    <th className="py-3 px-4 border-b border-slate-800 text-left">
                      Nom
                    </th>
                    <th className="py-3 px-4 border-b border-slate-800 text-left">
                      Email
                    </th>
                    <th className="py-3 px-4 border-b border-slate-800 text-left">
                      Téléphone
                    </th>
                    <th className="py-3 px-4 border-b border-slate-800 text-left">
                      Site
                    </th>
                    <th className="py-3 px-4 border-b border-slate-800 text-left">
                      Google Maps
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
                        colSpan={colCount}
                        className="py-10 text-center text-slate-500"
                      >
                        Aucun résultat.
                      </td>
                    </tr>
                  ) : (
                    filteredLeads.map((lead) => {
                      const idStr = String(lead.id);
                      const isSelected = selectedIds.has(idStr);

                      return (
                        <tr
                          key={lead.id}
                          className="border-b border-slate-900 hover:bg-slate-900/60 transition group"
                        >
                          {/* ✅ NEW: selection checkbox */}
                          {selectionMode && (
                            <td className="py-3 px-4 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelected(idStr)}
                                className="h-4 w-4 cursor-pointer accent-indigo-500"
                              />
                            </td>
                          )}

                          {/* TRAITE */}
                          <td className="py-3 px-4 text-center">
                            <TraiteCheckbox
                              leadId={lead.id}
                              defaultChecked={Boolean(lead.traite)}
                            />
                          </td>

                          {/* NOM + pastille + bouton voir */}
                          <td className="py-3 px-4 text-slate-50 relative pr-14 flex items-center gap-2">
                            {lead.title || "—"}

                            {lead.message_sent && (
                              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
                            )}

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
                          <td className="py-3 px-4 text-slate-300">
                            {lead.email || "—"}
                          </td>

                          {/* PHONE */}
                          <td className="py-3 px-4 text-slate-300">
                            {lead.phoneNumber || "—"}
                          </td>

                          {/* WEBSITE */}
                          <td className="py-3 px-4">
                            {lead.website ? (
                              <a
                                href={lead.website}
                                target="_blank"
                                className="text-sky-400 hover:underline"
                              >
                                Voir site
                              </a>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>

                          {/* MAPS */}
                          <td className="py-3 px-4">
                            {lead.placeUrl ? (
                              <a
                                href={lead.placeUrl}
                                target="_blank"
                                className="text-green-400 hover:underline"
                              >
                                Ouvrir Map
                              </a>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>

                          {/* DATE */}
                          <td className="py-3 px-4 text-center text-slate-400">
                            {lead.created_at
                              ? new Date(lead.created_at).toLocaleDateString(
                                  "fr-FR"
                                )
                              : "—"}
                          </td>

                          {/* DELETE */}
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
              <p>
                <strong>Email :</strong> {openLead.email || "—"}
              </p>
              <p>
                <strong>Téléphone :</strong> {openLead.phoneNumber || "—"}
              </p>
              <p>
                <strong>Site :</strong>{" "}
                {openLead.website ? (
                  <a
                    href={openLead.website}
                    target="_blank"
                    className="text-sky-400 underline"
                  >
                    Voir site
                  </a>
                ) : (
                  "—"
                )}
              </p>
              <p>
                <strong>Google Maps :</strong>{" "}
                {openLead.placeUrl ? (
                  <a
                    href={openLead.placeUrl}
                    target="_blank"
                    className="text-green-400 underline"
                  >
                    Ouvrir map
                  </a>
                ) : (
                  "—"
                )}
              </p>
              <p>
                <strong>Créé le :</strong> {openLead.created_at?.slice(0, 10)}
              </p>
            </div>

            {/* Message interne */}
            <div className="mt-6">
              <label className="text-xs text-slate-400 mb-2 block">
                Message interne
              </label>

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
              />
            </div>

            {/* 🟣 AJOUT — bouton ouvrir email */}
            <div className="mt-5">
              <button
                onClick={openPrefilledEmail}
                disabled={!openLead.email}
                className={`
                w-full px-4 py-3 rounded-xl text-sm font-medium transition
                ${
                  !openLead.email
                    ? "bg-slate-800/60 border border-slate-700 text-slate-500 cursor-not-allowed"
                    : "bg-slate-900 border border-slate-700 text-slate-100 hover:bg-slate-800"
                }
              `}
              >
                Ouvrir l’email pré-rempli
              </button>
            </div>

            {/* 🟣 AJOUT — fallback Gmail / Outlook web */}
            <div className="mt-2 flex gap-2">
              <button
                onClick={openGmailWeb}
                disabled={!openLead.email}
                className={`
                flex-1 px-3 py-2 rounded-xl text-[12px] font-medium transition border
                ${
                  !openLead.email
                    ? "bg-slate-800/60 border-slate-700 text-slate-500 cursor-not-allowed"
                    : "bg-slate-950 border-slate-700 text-slate-200 hover:bg-slate-900"
                }
              `}
              >
                Gmail
              </button>

              <button
                onClick={openOutlookWeb}
                disabled={!openLead.email}
                className={`
                flex-1 px-3 py-2 rounded-xl text-[12px] font-medium transition border
                ${
                  !openLead.email
                    ? "bg-slate-800/60 border-slate-700 text-slate-500 cursor-not-allowed"
                    : "bg-slate-950 border-slate-700 text-slate-200 hover:bg-slate-900"
                }
              `}
              >
                Outlook
              </button>
            </div>

            {/* 🔵 AJOUT — bouton message envoyé */}
            <div className="mt-3">
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
                {openLead.message_sent
                  ? "Message envoyé ✓"
                  : "Marquer comme envoyé"}
              </button>
            </div>

            {/* 🔵 AJOUT — prochaine relance */}
            {openLead.next_followup_at && (
              <p className="text-xs text-slate-400 mt-2">
                Prochaine relance :{" "}
                <span className="text-slate-200 font-medium">
                  {new Date(openLead.next_followup_at).toLocaleDateString(
                    "fr-FR"
                  )}
                </span>
              </p>
            )}
          </div>
        )}
      </>
    </SubscriptionGate>
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