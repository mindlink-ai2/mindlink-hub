"use client";

import { useEffect, useMemo, useState, ReactNode } from "react";
import DeleteLeadButton from "./DeleteLeadButton";
import SubscriptionGate from "@/components/SubscriptionGate";
import { HubButton } from "@/components/ui/hub-button";

type Lead = {
  id: number | string;
  Name?: string | null;
  FirstName?: string | null;
  LastName?: string | null;
  Company?: string | null;
  location?: string | null;
  email?: string | null;
  phone?: string | null;
  created_at?: string | null;
  traite?: boolean | null;
  message_sent?: boolean | null;
  message_sent_at?: string | null;
  next_followup_at?: string | null;
  internal_message?: string | null;
  message_mail?: string | null;
  LinkedInURL?: string | null;
  [key: string]: unknown;
};

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
  // ➜ Tous les clients ont accès email + téléphone désormais
  const [emailOption, setEmailOption] = useState<boolean>(true);
  const [phoneOption, setPhoneOption] = useState<boolean>(true);

  // ✅ plan (on garde la logique existante côté API, mais plus de premium gating)
  const [plan, setPlan] = useState<string>("essential");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportingSelected, setExportingSelected] = useState(false);
  const [updatingStatusIds, setUpdatingStatusIds] = useState<Set<string>>(new Set());
  const selectedCount = selectedIds.size;

  // ✅ open lead from query param (?open=ID)
  const [openFromQuery, setOpenFromQuery] = useState<string | null>(null);

  // ✅ DERIVED filtered list (no state = no desync)
  const filteredLeads = useMemo(() => {
    return filterLeads(safeLeads, searchTerm);
  }, [safeLeads, searchTerm]);

  // ✅ Column count for empty state colSpan
  const baseCols = 7 + (emailOption ? 1 : 0) + (phoneOption ? 1 : 0);
  const colCount = baseCols + 1;

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

      // ✅ client from API (on garde le parsing, mais email/phone sont forcés ON)
      const client = data.client ?? data.options ?? null;

      // ✅ plan (fallback essential)
      setPlan(String(client?.plan ?? "essential").toLowerCase());

      // ✅ Tout le monde a email + phone
      setEmailOption(true);
      setPhoneOption(true);

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
    const existing = new Set(safeLeads.map((l) => String(l.id)));
    setSelectedIds((prev: Set<string>) => {
      const next = new Set<string>();
      prev.forEach((id) => {
        if (existing.has(id)) next.add(id);
      });
      return next;
    });
  }, [safeLeads]);

  // SEARCH FUNCTION
  const handleSearch = (value: string) => {
    setSearchTerm(value);
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

    const ok = confirm(`Voulez-vous vraiment supprimer ${selectedIds.size} lead(s) ?`);
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
      setSafeLeads((prev: Lead[]) => prev.filter((l) => !selectedIds.has(String(l.id))));
      setSelectedIds(new Set());
      setOpenLead((prev: Lead | null) =>
        prev && selectedIds.has(String(prev.id)) ? null : prev
      );
    } catch (e) {
      console.error(e);
      alert("Erreur réseau pendant la suppression.");
    }
  };

  const handleExportSelected = async () => {
    if (selectedIds.size === 0 || exportingSelected) return;

    const ids = Array.from(selectedIds)
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n));

    if (ids.length === 0) {
      alert("Aucun lead valide à exporter.");
      return;
    }

    try {
      setExportingSelected(true);

      const res = await fetch("/dashboard/leads/export/selected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data?.error || "Impossible d'exporter ces leads. Réessayez.");
        return;
      }

      const blob = await res.blob();
      const contentDisposition = res.headers.get("content-disposition") ?? "";
      const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
      const filename = filenameMatch?.[1] ?? "leads-selection-mindlink.csv";

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Erreur réseau pendant l'export.");
    } finally {
      setExportingSelected(false);
    }
  };

  const handleStatusBadgeClick = async (lead: Lead) => {
    const idStr = String(lead.id);
    if (lead.message_sent || updatingStatusIds.has(idStr)) return;

    const previousTraite = Boolean(lead.traite);
    const nextTraite = !previousTraite;

    setUpdatingStatusIds((prev: Set<string>) => {
      const next = new Set(prev);
      next.add(idStr);
      return next;
    });

    // ✅ optimistic UI update
    setSafeLeads((prev: Lead[]) =>
      prev.map((l) =>
        String(l.id) === idStr
          ? {
              ...l,
              traite: nextTraite,
            }
          : l
      )
    );

    setOpenLead((prev: Lead | null) =>
      prev && String(prev.id) === idStr
        ? {
            ...prev,
            traite: nextTraite,
          }
        : prev
    );

    try {
      const res = await fetch("/api/leads/update-traite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: lead.id,
          traite: nextTraite,
        }),
      });

      if (!res.ok) throw new Error("Erreur mise à jour traite");
    } catch (e) {
      console.error(e);
      alert("Impossible de mettre à jour le statut.");

      // rollback si erreur
      setSafeLeads((prev: Lead[]) =>
        prev.map((l) =>
          String(l.id) === idStr
            ? {
                ...l,
                traite: previousTraite,
              }
            : l
        )
      );

      setOpenLead((prev: Lead | null) =>
        prev && String(prev.id) === idStr
          ? {
              ...prev,
              traite: previousTraite,
            }
          : prev
      );
    } finally {
      setUpdatingStatusIds((prev: Set<string>) => {
        if (!prev.has(idStr)) return prev;
        const next = new Set(prev);
        next.delete(idStr);
        return next;
      });
    }
  };

  // ✅ LIVE UI UPDATE via events from child components
  useEffect(() => {
    const onTreated = (e: Event) => {
      const detail = (e as CustomEvent).detail as { leadId: number; traite: boolean };
      if (!detail?.leadId) return;

      setSafeLeads((prev: Lead[]) =>
        prev.map((l) => (l.id === detail.leadId ? { ...l, traite: detail.traite } : l))
      );

      setOpenLead((prev: Lead | null) =>
        prev?.id === detail.leadId ? { ...prev, traite: detail.traite } : prev
      );
    };

    const onDeleted = (e: Event) => {
      const detail = (e as CustomEvent).detail as { leadId: string };
      if (!detail?.leadId) return;

      setSafeLeads((prev: Lead[]) => prev.filter((l) => String(l.id) !== detail.leadId));
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
      window.removeEventListener("mindlink:lead-treated", onTreated as EventListener);
      window.removeEventListener("mindlink:lead-deleted", onDeleted as EventListener);
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
          l.id === openLead.id ? { ...l, internal_message: openLead.internal_message } : l
        )
      );
    }, 300);

    return () => clearTimeout(delay);
  }, [openLead?.internal_message]);

  // ✅ Auto-save mail message (Email) — now for everyone (no premium gating)
  useEffect(() => {
    if (!openLead) return;

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
          l.id === openLead.id ? { ...l, message_mail: openLead.message_mail } : l
        )
      );
    }, 300);

    return () => clearTimeout(delay);
  }, [openLead?.message_mail]);

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

    setOpenLead((prev: Lead | null) =>
      prev
        ? {
            ...prev,
            message_sent: true,
            message_sent_at: data.lead?.message_sent_at,
            next_followup_at: data.lead?.next_followup_at,
          }
        : prev
    );

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

  // ✅ Email actions — now for everyone (no premium gating)
  const openPrefilledEmail = () => {
    if (!openLead) return;

    const to = (openLead.email ?? "").trim();
    if (!to) {
      alert("Aucun email disponible pour ce prospect.");
      return;
    }

    const subject = `Lidmeo — ${openLead.FirstName ?? ""} ${openLead.LastName ?? ""}`.trim();
    const body = (openLead.message_mail ?? "").trim();

    const mailto = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    window.location.href = mailto;
  };

  const openGmailWeb = () => {
    if (!openLead) return;

    const to = (openLead.email ?? "").trim();
    if (!to) {
      alert("Aucun email disponible pour ce prospect.");
      return;
    }

    const subject = `Lidmeo — ${openLead.FirstName ?? ""} ${openLead.LastName ?? ""}`.trim();
    const body = (openLead.message_mail ?? "").trim();

    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
      to
    )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openOutlookWeb = () => {
    if (!openLead) return;

    const to = (openLead.email ?? "").trim();
    if (!to) {
      alert("Aucun email disponible pour ce prospect.");
      return;
    }

    const subject = `Lidmeo — ${openLead.FirstName ?? ""} ${openLead.LastName ?? ""}`.trim();
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
      <div className="min-h-screen w-full px-4 pb-24 pt-10 sm:px-6">
        <div className="mx-auto w-full max-w-[1680px]">
          <div className="hub-card-hero p-6 sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="h-6 w-44 animate-pulse rounded-xl bg-[#e5edf8]" />
                <div className="mt-3 h-4 w-80 animate-pulse rounded-lg bg-[#edf3fb]" />
              </div>
              <div className="h-10 w-28 animate-pulse rounded-xl bg-[#edf3fb]" />
            </div>

            <div className="mt-6 h-12 animate-pulse rounded-xl border border-[#dbe5f3] bg-[#f8fbff]" />
            <div className="mt-4 h-72 animate-pulse rounded-xl border border-[#dbe5f3] bg-[#f8fbff]" />
            <div className="mt-3 text-xs text-[#4B5563]">Chargement des leads…</div>
          </div>
        </div>
      </div>
    );
  }

  const total = safeLeads.length;
  const treatedCount = safeLeads.filter((l) => l.traite === true).length;
  const remainingToTreat = total - treatedCount;

  // Next import (Paris)
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const nextImport = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  nextImport.setHours(8, 0, 0, 0);
  if (now > nextImport) nextImport.setDate(nextImport.getDate() + 1);
  const diffMs = nextImport.getTime() - now.getTime();
  const diffMinutes = Math.floor(diffMs / 1000 / 60);
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  const nextImportText = hours <= 0 ? `Dans ${minutes} min` : `Dans ${hours}h ${minutes}min`;

  const allFilteredSelected =
    filteredLeads.length > 0 && filteredLeads.every((l) => selectedIds.has(String(l.id)));

  return (
    <SubscriptionGate supportEmail="contact@lidmeo.com">
      <>
        <div className="relative min-h-screen w-full px-4 pb-24 pt-8 sm:px-6">
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[360px] bg-[radial-gradient(circle_at_20%_-10%,rgba(31,94,255,0.18),transparent_56%),radial-gradient(circle_at_80%_0%,rgba(35,196,245,0.14),transparent_48%)]" />

          <div className="mx-auto w-full max-w-[1680px] space-y-8">
            <section className="hub-card-hero relative overflow-hidden p-6 sm:p-7">
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute -left-16 top-[-120px] h-64 w-64 rounded-full bg-[#dce8ff]/70 blur-3xl" />
                <div className="absolute -right-20 top-[-140px] h-72 w-72 rounded-full bg-[#d8f4ff]/65 blur-3xl" />
              </div>

              <div className="relative grid gap-6 xl:grid-cols-[1.28fr_0.92fr]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="hub-chip border-[#d7e3f4] bg-white font-medium">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#1f5eff]" />
                      Hub Lidmeo
                    </span>

                    <span className="hub-chip border-[#d7e3f4] bg-white tabular-nums">
                      {filteredLeads.length} affiché(s)
                    </span>

                    <span className="hub-chip border-[#d7e3f4] bg-white whitespace-nowrap">
                      {plan || "essential"}
                    </span>
                  </div>

                  <h1 className="mt-4 text-4xl font-semibold tracking-tight text-[#0b1c33] sm:text-5xl">
                    Pipeline de prospection
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm text-[#51627b] sm:text-base">
                    Gérez vos leads dans une vue unique: recherche rapide, statuts opérationnels,
                    exports ciblés et actions batch.
                  </p>

                  <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Metric title="Total leads" value={total} tone="default" />
                    <Metric title="Traités" value={treatedCount} tone="success" />
                    <Metric title="À traiter" value={remainingToTreat} tone="warning" />
                  </div>

                  <div className="mt-6">
                    <div className="group flex items-center gap-3 rounded-xl border border-[#d7e3f4] bg-white px-4 py-3 shadow-[0_16px_28px_-26px_rgba(18,43,86,0.8)] transition focus-within:border-[#90b5ff] focus-within:ring-2 focus-within:ring-[#dce8ff]">
                      <svg
                        className="h-4 w-4 text-[#6a7f9f] transition group-focus-within:text-[#1f5eff]"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
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
                        className="w-full bg-transparent text-sm text-[#0b1c33] placeholder-[#93a6c1] focus:outline-none"
                        aria-label="Rechercher un lead"
                      />
                    </div>

                    <div className="mt-2 text-[11px] text-[#51627b]">
                      {filteredLeads.length} résultat(s) • {total} total • {selectedCount} sélectionné(s)
                    </div>
                  </div>
                </div>

                <div className="hub-card-soft relative overflow-hidden p-4 sm:p-5">
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(31,94,255,0.12),transparent_48%)]" />

                  <div className="relative">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#d7e3f4] bg-white text-[#51627b]">
                          <svg
                            className="h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M10 6H5a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                        </div>
                        <h2 className="mt-3 text-base font-semibold text-[#0b1c33]">Commandes rapides</h2>
                        <p className="mt-1 text-xs text-[#51627b]">Actions lot: sélection, export, suppression.</p>
                      </div>

                      <div className="rounded-full border border-[#d7e3f4] bg-white px-3 py-1 text-[11px] text-[#51627b] tabular-nums">
                        Import {nextImportText}
                      </div>
                    </div>

                    <div className="mt-4">
                      <HubButton asChild variant="secondary" size="lg" className="w-full">
                        <a href="/dashboard/leads/export">Exporter tout en CSV</a>
                      </HubButton>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <HubButton type="button" variant="ghost" onClick={toggleSelectAllFiltered}>
                        {allFilteredSelected ? "Tout désélectionner" : "Tout sélectionner"}
                      </HubButton>

                      <HubButton
                        type="button"
                        variant="secondary"
                        onClick={handleExportSelected}
                        disabled={selectedCount === 0 || exportingSelected}
                      >
                        {exportingSelected ? "Export..." : `Exporter (${selectedCount})`}
                      </HubButton>

                      <HubButton
                        type="button"
                        variant="danger"
                        onClick={handleBulkDelete}
                        disabled={selectedCount === 0}
                      >
                        Supprimer ({selectedCount})
                      </HubButton>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[#d7e3f4] bg-white px-3 py-2 text-[11px] text-[#51627b]">
                      <span>Astuce: filtrez puis déclenchez vos actions en lot.</span>
                      <span className="rounded-full border border-[#d7e3f4] bg-[#f8fbff] px-2.5 py-1 tabular-nums">
                        {selectedCount} sélectionné(s)
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="hub-card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d7e3f4] bg-[#f8fbff] px-6 py-4">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-[#0b1c33]">Table des leads</h2>
                  <p className="text-[11px] text-[#51627b]">
                    Cliquez sur “Voir” pour ouvrir le panneau de traitement.
                  </p>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-[#51627b]">
                  <span className="rounded-full border border-[#d7e3f4] bg-white px-3 py-1 tabular-nums">
                    {selectedCount} sélectionné(s)
                  </span>
                  <span className="rounded-full border border-[#d7e3f4] bg-white px-3 py-1 tabular-nums">
                    {treatedCount} traités
                  </span>
                </div>
              </div>

              <div className="w-full overflow-x-auto px-2 pb-2 pt-1">
                <table className="min-w-[1040px] w-full table-fixed border-separate [border-spacing:0_10px] text-[13px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="text-[11px] uppercase tracking-[0.06em] text-[#51627b]">
                      <th className="w-[54px] px-3 py-2 text-center whitespace-nowrap">
                        Sel.
                      </th>
                      <th className="w-[150px] px-3 py-2 text-center whitespace-nowrap">
                        Statut
                      </th>
                      <th className="w-[180px] px-3 py-2 text-left whitespace-nowrap">
                        Nom
                      </th>
                      <th className="w-[170px] px-3 py-2 text-left whitespace-nowrap">
                        Entreprise
                      </th>
                      <th className="w-[160px] px-3 py-2 text-left whitespace-nowrap">
                        Localisation
                      </th>
                      <th className="w-[110px] px-3 py-2 text-left whitespace-nowrap">
                        LinkedIn
                      </th>
                      {emailOption && (
                        <th className="w-[210px] px-3 py-2 text-left whitespace-nowrap">
                          Email
                        </th>
                      )}
                      {phoneOption && (
                        <th className="w-[140px] px-3 py-2 text-left whitespace-nowrap">
                          Téléphone
                        </th>
                      )}
                      <th className="w-[110px] px-3 py-2 text-center whitespace-nowrap">
                        Date
                      </th>
                      <th className="w-[110px] px-3 py-2 text-center whitespace-nowrap">
                        Supprimer
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredLeads.length === 0 ? (
                      <tr>
                        <td colSpan={colCount} className="py-16 text-center">
                          <div className="mx-auto max-w-md px-6">
                            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-[#dbe5f3] bg-white text-[#4B5563]">
                              ⌕
                            </div>
                            <div className="font-medium text-[#0F172A]">Aucun résultat</div>
                            <div className="mt-1 text-sm text-[#4B5563]">
                              Essayez un autre nom, une entreprise ou une ville.
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredLeads.map((lead, idx) => {
                        const fullName =
                          `${lead.FirstName ?? ""} ${lead.LastName ?? ""}`.trim() ||
                          lead.Name ||
                          "—";

                        const idStr = String(lead.id);
                        const isSelected = selectedIds.has(idStr);
                        const isStatusUpdating = updatingStatusIds.has(idStr);
                        const isSent = Boolean(lead.message_sent);
                        const isPending = !isSent && Boolean(lead.traite);
                        const statusLabel = isSent
                          ? "Envoyé"
                          : isPending
                            ? "En attente"
                            : "À faire";
                        const tone = idx % 4;
                        const rowTone = tone === 0 ? "blue" : tone === 1 ? "violet" : tone === 2 ? "mint" : "sand";
                        const toneDotClass =
                          tone === 0
                            ? "bg-[#4f8bff]"
                            : tone === 1
                              ? "bg-[#8d79ff]"
                              : tone === 2
                                ? "bg-[#15b88f]"
                                : "bg-[#de8a30]";
                        const baseCellClass = "border-y border-[#d7e3f4] px-3 py-4 align-middle";

                        return (
                          <tr
                            key={lead.id}
                            data-tone={rowTone}
                            className={[
                              "hub-table-row group",
                              isSelected ? "ring-2 ring-[#dce8ff]" : "",
                            ].join(" ")}
                          >
                            <td className={`${baseCellClass} rounded-l-2xl border-l border-[#d7e3f4] text-center`}>
                              <div className="flex items-center justify-center gap-2">
                                <span className={`h-2 w-2 rounded-full ${toneDotClass}`} />
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelected(idStr)}
                                  className="h-4 w-4 cursor-pointer rounded border-[#c7d5e7] text-[#1f5eff] focus:ring-[#dce8ff]"
                                  aria-label={`Sélectionner le lead ${fullName}`}
                                />
                              </div>
                            </td>

                            <td className={`${baseCellClass} text-center`}>
                              <button
                                type="button"
                                onClick={() => handleStatusBadgeClick(lead)}
                                disabled={isSent || isStatusUpdating}
                                className={[
                                  "inline-flex h-8 items-center justify-center rounded-full border px-3 text-[11px] font-medium transition focus:outline-none focus:ring-2",
                                  isSent
                                    ? "cursor-default border-emerald-200 bg-emerald-50 text-emerald-700 focus:ring-emerald-200"
                                    : isPending
                                      ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 focus:ring-amber-200"
                                      : "border-[#d6e2f2] bg-white text-[#334155] hover:border-[#9cc0ff] hover:bg-[#f3f8ff] focus:ring-[#dce8ff]",
                                  isStatusUpdating ? "cursor-wait opacity-70" : "",
                                ].join(" ")}
                                title={
                                  isSent
                                    ? "Message déjà envoyé"
                                    : isPending
                                      ? "Cliquer pour repasser À faire"
                                      : "Cliquer pour marquer en attente d'envoi"
                                }
                                aria-label={`Statut du lead ${fullName} : ${statusLabel}`}
                              >
                                {isStatusUpdating ? "Mise à jour..." : statusLabel}
                              </button>
                            </td>

                            <td className={`${baseCellClass} relative pr-16 text-[#0b1c33]`}>
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate font-medium">{fullName}</span>
                              </div>

                              <HubButton
                                type="button"
                                variant="primary"
                                size="sm"
                                onClick={() => setOpenLead(lead)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                              >
                                Voir
                              </HubButton>
                            </td>

                            <td className={`${baseCellClass} truncate text-[#51627b]`}>
                              {lead.Company || "—"}
                            </td>
                            <td className={`${baseCellClass} truncate text-[#51627b]`}>
                              {lead.location || "—"}
                            </td>
                            <td className={baseCellClass}>
                              {lead.LinkedInURL ? (
                                <a
                                  href={lead.LinkedInURL}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[#d7e3f4] bg-white px-3 text-[12px] font-medium text-[#334155] transition hover:border-[#9cc0ff] hover:bg-[#f3f8ff] focus:outline-none focus:ring-2 focus:ring-[#dce8ff]"
                                >
                                  Profil <span className="text-[#64748b]">↗</span>
                                </a>
                              ) : (
                                <span className="text-[#64748b]">—</span>
                              )}
                            </td>
                            {emailOption && (
                              <td className={`${baseCellClass} truncate text-[#334155]`}>
                                {lead.email || "—"}
                              </td>
                            )}
                            {phoneOption && (
                              <td className={`${baseCellClass} truncate text-[#334155]`}>
                                {lead.phone || "—"}
                              </td>
                            )}
                            <td className={`${baseCellClass} whitespace-nowrap text-center tabular-nums text-[#64748b]`}>
                              {lead.created_at ? new Date(lead.created_at).toLocaleDateString("fr-FR") : "—"}
                            </td>
                            <td className={`${baseCellClass} rounded-r-2xl border-r border-[#d7e3f4] text-center`}>
                              <DeleteLeadButton leadId={lead.id} />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#d7e3f4] bg-[#f8fbff] px-6 py-3 text-[11px] text-[#51627b]">
                <div>Survolez une ligne pour afficher l’action “Voir”.</div>
                <div className="tabular-nums">
                  {treatedCount} traité(s) • {remainingToTreat} à traiter
                </div>
              </div>
            </section>
          </div>

          {openLead && (
            <>
              <div
                className="fixed inset-0 z-40 bg-[#0F172A]/38 backdrop-blur-[3px]"
                aria-hidden="true"
                onClick={() => setOpenLead(null)}
              />

              <div className="animate-slideLeft fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-[#dbe5f3] bg-white shadow-[0_18px_42px_-22px_rgba(15,23,42,0.38)] sm:w-[520px]">
                <div className="sticky top-0 z-10 border-b border-[#e2e8f0] bg-white/95 p-6 pb-4 backdrop-blur-xl">
                  <div className="flex items-start justify-between gap-3">
                    <HubButton type="button" variant="ghost" size="sm" onClick={() => setOpenLead(null)}>
                      Fermer
                    </HubButton>
                    <span className="rounded-full border border-[#dbe5f3] bg-white px-3 py-1 text-[11px] text-[#4B5563] whitespace-nowrap">
                      {plan || "essential"}
                    </span>
                  </div>

                  <div className="mt-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-2xl font-semibold leading-tight text-[#0F172A]">
                        {(openLead.FirstName ?? "")} {(openLead.LastName ?? "")}
                      </h2>
                      <p className="mt-1 truncate text-[12px] text-[#4B5563]">
                        {openLead.Company || "—"} • {openLead.location || "—"}
                      </p>
                    </div>

                    <div className="shrink-0">
                      {openLead.message_sent ? (
                        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] text-emerald-700 whitespace-nowrap">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Envoyé
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2 rounded-full border border-[#dbe5f3] bg-white px-3 py-1 text-[11px] text-[#4B5563] whitespace-nowrap">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#94a3b8]" />
                          À faire
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex-1 space-y-5 overflow-y-auto p-6">
                  <div className="hub-card-soft p-4">
                    <div className="text-[11px] uppercase tracking-wide text-[#4B5563]">Informations</div>
                    <div className="mt-3 grid grid-cols-1 gap-3">
                      <InfoBlock title="LinkedIn">
                        {openLead.LinkedInURL ? (
                          <a
                            href={openLead.LinkedInURL}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-[#dbe5f3] bg-white px-3 py-2 text-[#334155] transition hover:border-[#bfdbfe] hover:bg-[#f8fbff] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]"
                          >
                            Ouvrir le profil <span className="opacity-80">↗</span>
                          </a>
                        ) : (
                          <span className="text-[#64748b]">—</span>
                        )}
                      </InfoBlock>

                      {emailOption && (
                        <InfoBlock title="Email">
                          <span className="text-[#0F172A]">{openLead.email || "—"}</span>
                        </InfoBlock>
                      )}

                      {phoneOption && (
                        <InfoBlock title="Téléphone">
                          <span className="text-[#0F172A]">{openLead.phone || "—"}</span>
                        </InfoBlock>
                      )}

                      <InfoBlock title="Créé le">
                        <span className="text-[#0F172A]">
                          {openLead.created_at
                            ? new Date(openLead.created_at).toLocaleDateString("fr-FR")
                            : "—"}
                        </span>
                      </InfoBlock>
                    </div>
                  </div>

                  <div className="hub-card-soft p-4">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-xs font-medium text-[#0F172A]">Message LinkedIn</label>
                      <span className="text-[11px] text-[#4B5563] whitespace-nowrap">Autosave</span>
                    </div>

                    <textarea
                      value={openLead.internal_message ?? ""}
                      onChange={(e) => {
                        const newMsg = e.target.value;
                        setOpenLead({ ...openLead, internal_message: newMsg });
                        setSafeLeads((prev: Lead[]) =>
                          prev.map((l) =>
                            l.id === openLead.id ? { ...l, internal_message: newMsg } : l
                          )
                        );
                      }}
                      placeholder="Écrivez votre message LinkedIn…"
                      className="mt-3 h-44 w-full rounded-xl border border-[#dbe5f3] bg-white p-4 text-sm text-[#0F172A] placeholder-[#94a3b8] transition focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]"
                    />

                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={handleMessageSent}
                        disabled={Boolean(openLead.message_sent)}
                        className={[
                          "w-full rounded-xl px-4 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2",
                          openLead.message_sent
                            ? "cursor-default bg-emerald-600 text-white focus:ring-emerald-200"
                            : "bg-[#2563EB] text-white hover:bg-[#1d4ed8] focus:ring-[#bfdbfe]",
                        ].join(" ")}
                      >
                        {openLead.message_sent ? "Message envoyé ✓" : "Marquer comme envoyé"}
                      </button>
                    </div>

                    {openLead.next_followup_at && (
                      <p className="mt-2 text-xs text-[#4B5563]">
                        Prochaine relance :{" "}
                        <span className="font-medium text-[#0F172A]">
                          {new Date(openLead.next_followup_at).toLocaleDateString("fr-FR")}
                        </span>
                      </p>
                    )}
                  </div>

                  <div className="hub-card-soft p-4">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-xs font-medium text-[#0F172A]">Message email</label>
                      <span className="text-[11px] text-[#4B5563] whitespace-nowrap">Autosave</span>
                    </div>

                    <textarea
                      value={openLead.message_mail ?? ""}
                      onChange={(e) => {
                        const newMsg = e.target.value;
                        setOpenLead({ ...openLead, message_mail: newMsg });
                        setSafeLeads((prev: Lead[]) =>
                          prev.map((l) => (l.id === openLead.id ? { ...l, message_mail: newMsg } : l))
                        );
                      }}
                      placeholder="Écrivez votre message email…"
                      className="mt-3 h-44 w-full rounded-xl border border-[#dbe5f3] bg-white p-4 text-sm text-[#0F172A] placeholder-[#94a3b8] transition focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]"
                    />

                    {(() => {
                      const hasEmail = Boolean((openLead.email ?? "").trim());
                      const dimIfNoEmail = hasEmail ? "" : "opacity-50";

                      return (
                        <>
                          <div className="mt-4">
                            <HubButton
                              type="button"
                              variant="secondary"
                              className={["w-full", dimIfNoEmail].join(" ")}
                              onClick={openPrefilledEmail}
                            >
                              Ouvrir l’email pré-rempli
                            </HubButton>
                          </div>

                          <div className="mt-2 flex gap-2">
                            <HubButton
                              type="button"
                              variant="secondary"
                              className={["flex-1", dimIfNoEmail].join(" ")}
                              onClick={openGmailWeb}
                            >
                              Gmail
                            </HubButton>
                            <HubButton
                              type="button"
                              variant="secondary"
                              className={["flex-1", dimIfNoEmail].join(" ")}
                              onClick={openOutlookWeb}
                            >
                              Outlook
                            </HubButton>
                          </div>

                          {!hasEmail && (
                            <p className="mt-2 text-[11px] text-[#4B5563]">
                              Aucun email détecté pour ce lead.
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

      </>
    </SubscriptionGate>
  );
}

function Metric({
  title,
  value,
  tone,
}: {
  title: string;
  value: ReactNode;
  tone: "default" | "success" | "warning";
}) {
  const valueColor =
    tone === "success" ? "text-emerald-700" : tone === "warning" ? "text-amber-700" : "text-[#0b1c33]";

  return (
    <div className="overflow-hidden rounded-xl border border-[#d7e3f4] bg-white px-4 py-3 shadow-[0_16px_26px_-24px_rgba(18,43,86,0.75)]">
      <div className="whitespace-nowrap text-[10px] uppercase tracking-wide text-[#51627b]">
        {title}
      </div>
      <div className={["mt-1 truncate whitespace-nowrap text-[28px] font-semibold leading-none tabular-nums", valueColor].join(" ")}>
        {value}
      </div>
    </div>
  );
}

function InfoBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[#d7e3f4] bg-white p-4">
      <div className="whitespace-nowrap text-[10px] uppercase tracking-wide text-[#51627b]">
        {title}
      </div>
      <div className="mt-2 text-sm text-[#0b1c33]">{children}</div>
    </div>
  );
}
