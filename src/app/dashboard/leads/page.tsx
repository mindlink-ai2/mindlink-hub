"use client";

import { useEffect, useMemo, useState, ReactNode } from "react";
import TraiteCheckbox from "./TraiteCheckbox";
import DeleteLeadButton from "./DeleteLeadButton";
import SubscriptionGate from "@/components/SubscriptionGate";

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

  // ✅ client options (email / phone enrichment)
  const [emailOption, setEmailOption] = useState<boolean>(false);
  const [phoneOption, setPhoneOption] = useState<boolean>(false);

  // ✅ plan
  const [plan, setPlan] = useState<string>("essential");
  const isPremium = plan === "premium";

  // ✅ premium modal
  const [premiumModalOpen, setPremiumModalOpen] = useState(false);

  // ✅ Selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedCount = selectedIds.size;

  // ✅ open lead from query param (?open=ID)
  const [openFromQuery, setOpenFromQuery] = useState<string | null>(null);

  // ✅ DERIVED filtered list (no state = no desync)
  const filteredLeads = useMemo(() => {
    return filterLeads(safeLeads, searchTerm);
  }, [safeLeads, searchTerm]);

  // ✅ Column count for empty state colSpan
  const baseCols = 7 + (emailOption ? 1 : 0) + (phoneOption ? 1 : 0);
  const colCount = (selectionMode ? 1 : 0) + baseCols;

  // ✅ Read query param once on mount
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const openId = url.searchParams.get("open");
      if (openId) setOpenFromQuery(openId);
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Load leads + options + plan
  useEffect(() => {
    (async () => {
      const res = await fetch("/api/get-leads");
      const data = await res.json();

      const leads = data.leads ?? [];
      setSafeLeads(leads);

      // ✅ client from API
      const client = data.client ?? data.options ?? null;
      const eo = client?.email_option;
      const po = client?.phone_option;

      setEmailOption(Boolean(eo));
      setPhoneOption(Boolean(po));

      // ✅ plan (fallback essential)
      setPlan(String(client?.plan ?? "essential").toLowerCase());

      setClientLoaded(true);
    })();
  }, []);

  // ✅ After leads loaded, open sidebar if query exists
  useEffect(() => {
    if (!clientLoaded) return;
    if (!openFromQuery) return;

    const target = safeLeads.find((l) => String(l.id) === String(openFromQuery));
    if (!target) return;

    setOpenLead(target);

    // ✅ clean URL (remove ?open=)
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("open");
      window.history.replaceState({}, "", url.pathname + url.search);
    } catch (e) {
      console.error(e);
    }

    setOpenFromQuery(null);
  }, [clientLoaded, openFromQuery, safeLeads]);

  // ✅ cleanup selection when list changes (ex: deleted)
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

  // SEARCH FUNCTION
  const handleSearch = (value: string) => {
    setSearchTerm(value);
  };

  // ✅ selection helpers
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

      if (allSelected) filteredIds.forEach((id) => next.delete(id));
      else filteredIds.forEach((id) => next.add(id));

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
      const res = await fetch("/dashboard/leads/bulk-delete", {
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
      setSafeLeads((prev: Lead[]) =>
        prev.filter((l) => !selectedIds.has(String(l.id)))
      );
      setSelectedIds(new Set());
      setOpenLead((prev: Lead | null) =>
        prev && selectedIds.has(String(prev.id)) ? null : prev
      );
    } catch (e) {
      console.error(e);
      alert("Erreur réseau pendant la suppression.");
    }
  };

  // ✅ LIVE UI UPDATE via events from child components
  useEffect(() => {
    const onTreated = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        leadId: number;
        traite: boolean;
      };
      if (!detail?.leadId) return;

      setSafeLeads((prev: Lead[]) =>
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

      setSafeLeads((prev: Lead[]) =>
        prev.filter((l) => String(l.id) !== detail.leadId)
      );
      setOpenLead((prev: Lead | null) =>
        prev && String(prev.id) === detail.leadId ? null : prev
      );

      // ✅ remove from selection if needed
      setSelectedIds((prev: Set<string>) => {
        if (!prev.has(detail.leadId)) return prev;
        const next = new Set(prev);
        next.delete(detail.leadId);
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

  // Auto-save internal message (LinkedIn)
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

      setSafeLeads((prev: Lead[]) =>
        prev.map((l) =>
          l.id === openLead.id
            ? { ...l, internal_message: openLead.internal_message }
            : l
        )
      );
    }, 300);

    return () => clearTimeout(delay);
  }, [openLead?.internal_message]);

  // ✅ Auto-save mail message (Email) — only when PREMIUM (plan)
  useEffect(() => {
    if (!openLead) return;
    if (!isPremium) return;

    const delay = setTimeout(async () => {
      await fetch("/api/update-mail-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: openLead.id,
          message: openLead.message_mail ?? "",
        }),
      });

      setSafeLeads((prev: Lead[]) =>
        prev.map((l) =>
          l.id === openLead.id
            ? { ...l, message_mail: openLead.message_mail }
            : l
        )
      );
    }, 300);

    return () => clearTimeout(delay);
  }, [openLead?.message_mail, isPremium]);

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

    setSafeLeads((prev: Lead[]) =>
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

  // ✅ Email actions (plan-gated) — uses message_mail
  const openPrefilledEmail = () => {
    if (!openLead) return;

    if (!isPremium) {
      setPremiumModalOpen(true);
      return;
    }

    const to = (openLead.email ?? "").trim();
    if (!to) {
      alert("Aucun email disponible pour ce prospect.");
      return;
    }

    const subject = `Lidmeo — ${openLead.FirstName ?? ""} ${
      openLead.LastName ?? ""
    }`.trim();
    const body = (openLead.message_mail ?? "").trim();

    const mailto = `mailto:${to}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;

    window.location.href = mailto;
  };

  const openGmailWeb = () => {
    if (!openLead) return;

    if (!isPremium) {
      setPremiumModalOpen(true);
      return;
    }

    const to = (openLead.email ?? "").trim();
    if (!to) {
      alert("Aucun email disponible pour ce prospect.");
      return;
    }

    const subject = `Lidmeo — ${openLead.FirstName ?? ""} ${
      openLead.LastName ?? ""
    }`.trim();
    const body = (openLead.message_mail ?? "").trim();

    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
      to
    )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openOutlookWeb = () => {
    if (!openLead) return;

    if (!isPremium) {
      setPremiumModalOpen(true);
      return;
    }

    const to = (openLead.email ?? "").trim();
    if (!to) {
      alert("Aucun email disponible pour ce prospect.");
      return;
    }

    const subject = `Lidmeo — ${openLead.FirstName ?? ""} ${
      openLead.LastName ?? ""
    }`.trim();
    const body = (openLead.message_mail ?? "").trim();

    const url = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(
      to
    )}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    window.open(url, "_blank", "noopener,noreferrer");
  };

  // UX-only: Escape close + scroll lock when sidebar open
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenLead(null);
    };
    window.addEventListener("keydown", onKeyDown);

    if (openLead) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [openLead]);

  if (!clientLoaded) {
    return (
      <div className="min-h-screen w-full px-6 pt-20 pb-32">
        <div className="mx-auto w-full max-w-6xl">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
            <div className="h-6 w-44 rounded-xl bg-slate-800/60 animate-pulse" />
            <div className="mt-3 h-4 w-80 rounded-lg bg-slate-800/50 animate-pulse" />
            <div className="mt-8 h-16 rounded-2xl bg-slate-900/50 border border-slate-800/70 animate-pulse" />
            <div className="mt-4 h-64 rounded-2xl bg-slate-900/40 border border-slate-800/60 animate-pulse" />
            <div className="mt-3 text-slate-500 text-xs">
              Chargement des leads…
            </div>
          </div>
        </div>
      </div>
    );
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

  const allFilteredSelected =
    filteredLeads.length > 0 &&
    filteredLeads.every((l) => selectedIds.has(String(l.id)));

  return (
    <SubscriptionGate supportEmail="contact@lidmeo.com">
      <>
        <div className="min-h-screen w-full px-6 pt-20 pb-32">
          <div className="mx-auto w-full max-w-6xl space-y-10">
            {/* HEADER */}
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-50">
                  Prospection
                </h1>
                <p className="text-slate-400 text-sm md:text-base mt-2 max-w-2xl">
                  Tous vos prospects qualifiés, importés automatiquement par
                  Lidmeo. Recherchez, traitez, et ouvrez un lead pour préparer
                  votre message.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <a
                  href="/dashboard/leads/export"
                  className="px-4 py-2 text-xs md:text-sm rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 transition text-slate-200"
                >
                  Exporter CSV
                </a>

                <button
                  type="button"
                  onClick={toggleSelectionMode}
                  className="px-4 py-2 text-xs md:text-sm rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 transition text-slate-200"
                >
                  {selectionMode ? "Annuler la sélection" : "Mode sélection"}
                </button>

                {selectionMode && (
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    disabled={selectedCount === 0}
                    className={[
                      "px-4 py-2 text-xs md:text-sm rounded-xl transition border",
                      selectedCount === 0
                        ? "bg-slate-900/40 border-slate-800 text-slate-500 cursor-not-allowed"
                        : "bg-amber-600/15 border-amber-500/30 text-amber-300 hover:bg-amber-600/25",
                    ].join(" ")}
                  >
                    Supprimer ({selectedCount})
                  </button>
                )}
              </div>
            </div>

            {/* SEARCH + META */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="w-full max-w-xl">
                <div className="flex items-center gap-3 bg-slate-900/60 border border-slate-700 rounded-2xl px-4 py-3 shadow-inner backdrop-blur-md focus-within:ring-2 focus-within:ring-indigo-500/50 transition">
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
                    placeholder="Rechercher (nom, entreprise, ville)…"
                    className="bg-transparent w-full text-sm text-slate-200 placeholder-slate-500 focus:outline-none"
                  />
                </div>

                <div className="mt-2 text-[11px] text-slate-500">
                  {filteredLeads.length} résultat(s) affiché(s)
                  {selectionMode ? ` • ${selectedCount} sélectionné(s)` : ""}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Chip title="Total leads" value={total} />
                <Chip title="À traiter" value={remainingToTreat} />
                <Chip title="Prochaine importation" value={nextImportText} />
              </div>
            </div>

            {/* TABLE CARD */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950/90 shadow-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-800 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-slate-100 text-sm font-semibold">
                    Liste des leads
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Cliquez sur “Voir →” pour ouvrir la fiche lead.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {selectionMode && (
                    <button
                      type="button"
                      onClick={toggleSelectAllFiltered}
                      className="px-3 py-2 text-[12px] rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 transition text-slate-200"
                    >
                      {allFilteredSelected
                        ? "Tout désélectionner"
                        : "Tout sélectionner"}
                    </button>
                  )}

                  <span className="text-[11px] px-2 py-1 rounded-full border border-slate-700 bg-slate-900/60 text-slate-200">
                    {filteredLeads.length} lead(s)
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm border-separate border-spacing-0">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-900 text-slate-300 text-[11px] uppercase tracking-wide">
                      {selectionMode && (
                        <th className="py-3 px-4 border-b border-slate-800 text-center">
                          Sel.
                        </th>
                      )}

                      <th className="py-3 px-4 border-b border-slate-800 text-center">
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

                      {emailOption && (
                        <th className="py-3 px-4 border-b border-slate-800 text-left">
                          Email
                        </th>
                      )}
                      {phoneOption && (
                        <th className="py-3 px-4 border-b border-slate-800 text-left">
                          Téléphone
                        </th>
                      )}

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
                          className="py-12 text-center text-slate-500"
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

                        const idStr = String(lead.id);
                        const isSelected = selectedIds.has(idStr);

                        return (
                          <tr
                            key={lead.id}
                            className="border-b border-slate-900 hover:bg-slate-900/60 transition group"
                          >
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

                            <td className="py-3 px-4 text-center">
                              <TraiteCheckbox
                                leadId={lead.id}
                                defaultChecked={Boolean(lead.traite)}
                              />
                            </td>

                            <td className="py-3 px-4 text-slate-50 relative pr-16">
                              <div className="flex items-center gap-2">
                                {lead.message_sent && (
                                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-sm" />
                                )}
                                <span className="font-medium">{fullName}</span>
                              </div>

                              <button
                                type="button"
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
                                  rel="noreferrer"
                                  className="text-sky-400 hover:underline"
                                >
                                  Voir profil
                                </a>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>

                            {emailOption && (
                              <td className="py-3 px-4 text-slate-300">
                                {lead.email || "—"}
                              </td>
                            )}
                            {phoneOption && (
                              <td className="py-3 px-4 text-slate-300">
                                {lead.phone || "—"}
                              </td>
                            )}

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

          {/* --- SIDEBAR --- */}
          {openLead && (
            <div className="fixed right-0 top-0 h-full w-full sm:w-[420px] bg-gradient-to-b from-slate-900/95 to-slate-900/80 backdrop-blur-2xl border-l border-slate-800 shadow-[0_0_40px_-10px_rgba(99,102,241,0.5)] z-50 flex flex-col">
              {/* Header sticky */}
              <div className="sticky top-0 z-10 p-6 pb-4 bg-slate-900/75 backdrop-blur-xl border-b border-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    className="text-slate-400 text-xs hover:text-slate-200 transition"
                    onClick={() => setOpenLead(null)}
                  >
                    ✕ Fermer
                  </button>

                  <span className="text-[11px] px-2 py-1 rounded-full border border-slate-700 bg-slate-900/60 text-slate-200">
                    {isPremium ? "Premium" : "Essential"}
                  </span>
                </div>

                <h2 className="text-2xl font-semibold text-slate-50 mt-3">
                  {(openLead.FirstName ?? "")} {(openLead.LastName ?? "")}
                </h2>
                <p className="text-[12px] text-slate-400 mt-1">
                  {openLead.Company || "—"} • {openLead.location || "—"}
                </p>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {/* Summary cards */}
                <div className="grid grid-cols-1 gap-3">
                  <InfoBlock title="LinkedIn">
                    {openLead.LinkedInURL ? (
                      <a
                        href={openLead.LinkedInURL}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-400 hover:underline"
                      >
                        Voir profil →
                      </a>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </InfoBlock>

                  {emailOption && (
                    <InfoBlock title="Email">
                      <span className="text-slate-200">
                        {openLead.email || "—"}
                      </span>
                    </InfoBlock>
                  )}

                  {phoneOption && (
                    <InfoBlock title="Téléphone">
                      <span className="text-slate-200">
                        {openLead.phone || "—"}
                      </span>
                    </InfoBlock>
                  )}

                  <InfoBlock title="Créé le">
                    <span className="text-slate-200">
                      {openLead.created_at
                        ? new Date(openLead.created_at).toLocaleDateString(
                            "fr-FR"
                          )
                        : "—"}
                    </span>
                  </InfoBlock>
                </div>

                {/* 1) Message LinkedIn */}
                <div>
                  <label className="text-xs text-slate-400 mb-2 block">
                    Message LinkedIn
                  </label>

                  <textarea
                    value={openLead.internal_message ?? ""}
                    onChange={(e) => {
                      const newMsg = e.target.value;
                      setOpenLead({ ...openLead, internal_message: newMsg });
                      setSafeLeads((prev: Lead[]) =>
                        prev.map((l) =>
                          l.id === openLead.id
                            ? { ...l, internal_message: newMsg }
                            : l
                        )
                      );
                    }}
                    placeholder="Écrivez votre message LinkedIn…"
                    className="w-full h-44 p-4 rounded-2xl bg-slate-800/60 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 transition"
                  />

                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={handleMessageSent}
                      disabled={openLead.message_sent}
                      className={[
                        "w-full px-4 py-3 rounded-2xl text-sm font-medium transition",
                        openLead.message_sent
                          ? "bg-emerald-600 text-white cursor-default"
                          : "bg-indigo-600 hover:bg-indigo-500 text-white",
                      ].join(" ")}
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
                        {new Date(openLead.next_followup_at).toLocaleDateString(
                          "fr-FR"
                        )}
                      </span>
                    </p>
                  )}
                </div>

                {/* 2) Email (Premium only) */}
                <div className="border-t border-slate-800 pt-6">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-xs text-slate-400 block">
                      Message email
                    </label>

                    {!isPremium && (
                      <button
                        type="button"
                        onClick={() => setPremiumModalOpen(true)}
                        className="text-[11px] px-2.5 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/15 transition"
                      >
                        Débloquer Premium
                      </button>
                    )}
                  </div>

                  <textarea
                    value={
                      isPremium
                        ? openLead.message_mail ?? ""
                        : "Fonctionnalité Premium : débloquez l’email personnalisé + les boutons d’envoi avec l’abonnement Premium."
                    }
                    onChange={(e) => {
                      if (!isPremium) return;

                      const newMsg = e.target.value;
                      setOpenLead({ ...openLead, message_mail: newMsg });
                      setSafeLeads((prev: Lead[]) =>
                        prev.map((l) =>
                          l.id === openLead.id
                            ? { ...l, message_mail: newMsg }
                            : l
                        )
                      );
                    }}
                    placeholder="Écrivez votre message email…"
                    className="mt-2 w-full h-44 p-4 rounded-2xl bg-slate-800/60 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 transition"
                    readOnly={!isPremium}
                  />

                  {/* Buttons (gated in handlers) */}
                  {(() => {
                    const hasEmail = Boolean((openLead.email ?? "").trim());
                    const dimIfNoEmail = hasEmail ? "" : "opacity-50";

                    return (
                      <>
                        <div className="mt-4">
                          <button
                            type="button"
                            onClick={openPrefilledEmail}
                            className={[
                              "w-full px-4 py-3 rounded-2xl text-sm font-medium transition border cursor-pointer",
                              "bg-slate-900 border-slate-700 text-slate-100 hover:bg-slate-800",
                              dimIfNoEmail,
                            ].join(" ")}
                          >
                            Ouvrir l’email pré-rempli
                          </button>
                        </div>

                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={openGmailWeb}
                            className={[
                              "flex-1 px-3 py-2 rounded-2xl text-[12px] font-medium transition border cursor-pointer",
                              "bg-slate-950 border-slate-700 text-slate-200 hover:bg-slate-900",
                              dimIfNoEmail,
                            ].join(" ")}
                          >
                            Gmail
                          </button>

                          <button
                            type="button"
                            onClick={openOutlookWeb}
                            className={[
                              "flex-1 px-3 py-2 rounded-2xl text-[12px] font-medium transition border cursor-pointer",
                              "bg-slate-950 border-slate-700 text-slate-200 hover:bg-slate-900",
                              dimIfNoEmail,
                            ].join(" ")}
                          >
                            Outlook
                          </button>
                        </div>

                        {!hasEmail && (
                          <p className="text-[11px] text-slate-500 mt-2">
                            Aucun email détecté pour ce lead.
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* ✅ premium modal */}
          {premiumModalOpen && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setPremiumModalOpen(false)}
              />
              <div className="relative w-[92%] max-w-md rounded-2xl border border-indigo-500/25 bg-slate-950 p-6 shadow-2xl">
                <div className="text-sm font-semibold text-slate-50">
                  Fonctionnalité Premium
                </div>
                <p className="mt-2 text-sm text-slate-300">
                  Cette fonctionnalité est disponible avec l’abonnement Premium.
                </p>
                <div className="mt-5 flex gap-2">
                  <a
                    href="/dashboard/hub/billing"
                    className="flex-1 text-center px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition"
                  >
                    Passer en Premium
                  </a>
                  <button
                    type="button"
                    onClick={() => setPremiumModalOpen(false)}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-sm font-medium transition"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

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
/* Small UI blocks           */
/* ------------------------- */

function Chip({ title, value }: { title: string; value: any }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-center shadow-inner min-w-[150px]">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">
        {title}
      </div>
      <div className="text-base font-semibold text-slate-100 mt-1">{value}</div>
    </div>
  );
}

function InfoBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">
        {title}
      </div>
      <div className="mt-2 text-sm text-slate-200">{children}</div>
    </div>
  );
}