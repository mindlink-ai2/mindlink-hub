"use client";

import { useEffect, useMemo, useState, ReactNode } from "react";
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
  // ➜ Tous les clients ont accès email + téléphone désormais
  const [emailOption, setEmailOption] = useState<boolean>(true);
  const [phoneOption, setPhoneOption] = useState<boolean>(true);

  // ✅ plan (on garde la logique existante côté API, mais plus de premium gating)
  const [plan, setPlan] = useState<string>("essential");
  const isPremium = false;

  // ✅ premium modal (désactivé — conservé nulle part)
  const [premiumModalOpen, setPremiumModalOpen] = useState(false);

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
      <div className="min-h-screen w-full px-4 sm:px-6 pt-10 pb-24">
        <div className="mx-auto w-full max-w-[1680px]">
          <div className="rounded-[28px] border border-[#dbe6ff] bg-white/90 p-6 shadow-[0_24px_55px_-38px_rgba(56,103,209,0.55)] sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="h-6 w-44 rounded-xl bg-[#dce6fb] animate-pulse" />
                <div className="mt-3 h-4 w-80 rounded-lg bg-[#e7eefc] animate-pulse" />
              </div>
              <div className="h-10 w-28 rounded-2xl bg-[#e0e9fd] animate-pulse" />
            </div>

            <div className="mt-6 h-12 rounded-2xl border border-[#dbe5fb] bg-[#f6f9ff] animate-pulse" />
            <div className="mt-4 h-72 rounded-2xl border border-[#dbe5fb] bg-[#f9fbff] animate-pulse" />
            <div className="mt-3 text-xs text-[#6f84aa]">Chargement des leads…</div>
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
        <div className="min-h-screen w-full px-4 sm:px-6 pt-8 pb-24">
          <div className="mx-auto w-full max-w-[1680px] space-y-6">
            {/* TOP / HEADER */}
            <div className="relative overflow-hidden rounded-[30px] border border-[#dbe6ff] bg-white/90 shadow-[0_28px_58px_-40px_rgba(53,102,205,0.55)]">
              <div className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(60%_55%_at_50%_0%,black,transparent)]">
                <div className="absolute -top-28 left-1/2 h-72 w-[740px] -translate-x-1/2 rounded-full bg-[#4d82ff]/18 blur-3xl" />
                <div className="absolute -top-16 left-1/2 h-44 w-[560px] -translate-x-1/2 rounded-full bg-[#7ba3ff]/15 blur-3xl" />
              </div>

              <div className="relative p-6 sm:p-7">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-2 rounded-full border border-[#d4e2ff] bg-[#f4f8ff] px-3 py-1 text-[11px] font-medium text-[#3e5a88]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#3a72eb]" />
                        Hub • Prospection
                      </span>

                      <span className="inline-flex items-center rounded-full border border-[#d9e5fb] bg-white px-3 py-1 text-[11px] text-[#47618e] tabular-nums">
                        {filteredLeads.length} affiché(s)
                      </span>

                      <span className="inline-flex items-center rounded-full border border-[#d9e5fb] bg-white px-3 py-1 text-[11px] text-[#47618e] whitespace-nowrap">
                        Essential
                      </span>
                    </div>

                    <h1 className="mt-3 text-4xl sm:text-5xl font-extrabold tracking-tight text-[#0f2448]">
                      Prospection
                    </h1>

                    <p className="mt-3 max-w-2xl text-sm text-[#5b7198]">
                      Tous vos prospects qualifiés, importés automatiquement par Lidmeo. Recherchez,
                      traitez, et ouvrez un lead pour préparer votre message.
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <div className="rounded-2xl border border-[#d9e5fb] bg-white px-4 py-3">
                        <div className="text-[10px] uppercase tracking-wide text-[#7690b8]">
                          Total leads
                        </div>
                        <div className="mt-1 text-3xl font-extrabold text-[#102a51] leading-none tabular-nums">
                          {total}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-[#d9e5fb] bg-white px-4 py-3">
                        <div className="text-[10px] uppercase tracking-wide text-[#7690b8]">
                          Traités
                        </div>
                        <div className="mt-1 text-3xl font-extrabold text-emerald-700 leading-none tabular-nums">
                          {treatedCount}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-[#d9e5fb] bg-white px-4 py-3">
                        <div className="text-[10px] uppercase tracking-wide text-[#7690b8]">
                          À traiter
                        </div>
                        <div className="mt-1 text-3xl font-extrabold text-amber-700 leading-none tabular-nums">
                          {remainingToTreat}
                        </div>
                      </div>
                    </div>

                    <div className="mt-5">
                      <div className="group flex items-center gap-3 rounded-2xl border border-[#d5e1f8] bg-white px-4 py-3 shadow-sm transition focus-within:ring-2 focus-within:ring-[#8fb0f7]">
                        <svg
                          className="h-4 w-4 text-[#7e93b7] group-focus-within:text-[#436299] transition"
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
                          className="w-full bg-transparent text-sm text-[#17345e] placeholder-[#7f95b9] focus:outline-none"
                          aria-label="Rechercher un lead"
                        />
                      </div>

                      <div className="mt-2 text-[11px] text-[#6f86ab]">
                        {filteredLeads.length} résultat(s) • {total} total
                        {` • ${selectedCount} sélectionné(s)`}
                      </div>
                    </div>
                  </div>

                  {/* Command center */}
                  <div className="w-full lg:w-[520px] shrink-0">
                    <div className="relative overflow-hidden rounded-[26px] border border-[#dce7fd] bg-[#f8faff] p-4 sm:p-5 shadow-[0_18px_38px_-28px_rgba(53,97,193,0.4)]">
                      <div className="pointer-events-none absolute inset-0">
                        <div className="absolute -top-24 right-[-120px] h-56 w-56 rounded-full bg-[#4a80ff]/16 blur-3xl" />
                        <div className="absolute -bottom-24 left-[-120px] h-56 w-56 rounded-full bg-[#8bb0ff]/15 blur-3xl" />
                        <div className="absolute inset-0 bg-gradient-to-b from-white/0 via-white/10 to-white/45" />
                      </div>

                      <div className="relative">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-[#d4e1fa] bg-white text-[#355b94]">
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

                              <div className="min-w-0">
                                <div className="text-[12px] font-semibold text-[#12305b] leading-none">
                                  Commandes
                                </div>
                                <div className="mt-1 text-[11px] text-[#6d83aa]">
                                  Export, sélection, suppression.
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0 flex flex-col items-end gap-2">
                            <span className="inline-flex items-center gap-2 rounded-full border border-[#d5e1fa] bg-white px-3 py-1 text-[11px] tabular-nums whitespace-nowrap text-[#47618e]">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#7f95b8]" />
                              Essential
                            </span>

                            <span className="inline-flex items-center gap-2 rounded-2xl border border-[#d5e1fa] bg-white px-3 py-2 text-[12px] text-[#375583] whitespace-nowrap tabular-nums">
                              <span className="text-[10px] uppercase tracking-wide text-[#7a8fb3]">
                                Prochain import
                              </span>
                              <span className="h-4 w-px bg-[#dbe5fb]" />
                              <span className="font-semibold text-[#12305b]">{nextImportText}</span>
                              <span className="text-[#8ea4c7]">•</span>
                              <span className="text-[#6780a7]">08:00</span>
                            </span>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-2">
                          <a
                            href="/dashboard/leads/export"
                            className="group inline-flex h-11 items-center justify-center whitespace-nowrap rounded-2xl border border-[#c9daf9] bg-white px-4 text-xs font-semibold text-[#21406c] shadow-sm transition hover:bg-[#f3f7ff] focus:outline-none focus:ring-2 focus:ring-[#8eaef4] sm:text-sm"
                          >
                            <span className="inline-flex items-center gap-2">
                              <svg
                                className="h-4 w-4 text-[#5f78a1] transition group-hover:text-[#2b4d80]"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                aria-hidden="true"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M12 3v12m0 0l4-4m-4 4l-4-4"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M4 17v3h16v-3"
                                />
                              </svg>
                              Exporter CSV
                            </span>
                          </a>

                        </div>

                        <div className="mt-2 rounded-2xl border border-[#d8e5ff] bg-white p-2">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={toggleSelectAllFiltered}
                              className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-2xl border border-[#cfdcf8] bg-[#f4f8ff] px-3 text-[12px] font-medium text-[#284a79] transition hover:bg-[#ecf3ff] focus:outline-none focus:ring-2 focus:ring-[#8daef4]"
                            >
                              {allFilteredSelected ? "Tout désélectionner" : "Tout sélectionner"}
                            </button>

                            <button
                              type="button"
                              onClick={handleExportSelected}
                              disabled={selectedCount === 0 || exportingSelected}
                              className={[
                                "inline-flex items-center justify-center h-10 px-3 text-[12px] rounded-2xl transition border whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-indigo-500/20",
                                selectedCount === 0 || exportingSelected
                                  ? "cursor-not-allowed border-[#d7e3fa] bg-white/60 text-[#9aaecf]"
                                  : "border-[#c9daf9] bg-[#edf3ff] text-[#2d4e80] hover:bg-[#e4edff]",
                              ].join(" ")}
                            >
                              {exportingSelected ? "Export..." : `Exporter (${selectedCount})`}
                            </button>

                            <button
                              type="button"
                              onClick={handleBulkDelete}
                              disabled={selectedCount === 0}
                              className={[
                                "inline-flex items-center justify-center h-10 px-3 text-[12px] rounded-2xl transition border whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-amber-500/20",
                                selectedCount === 0
                                  ? "cursor-not-allowed border-[#d7e3fa] bg-white/60 text-[#9aaecf]"
                                  : "border-amber-300/70 bg-amber-50 text-amber-700 hover:bg-amber-100",
                              ].join(" ")}
                            >
                              Supprimer ({selectedCount})
                            </button>
                          </div>

                          <div className="mt-2 flex items-center justify-end gap-3 px-1">
                            <span className="rounded-full border border-[#c9daf9] bg-[#f4f8ff] px-3 py-1 text-[11px] text-[#3f5b89] whitespace-nowrap tabular-nums">
                              {selectedCount} sélectionné(s)
                            </span>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between gap-3">
                          <div className="text-[11px] text-[#6f86ab]">
                            Astuce : filtrez avec la recherche, puis exportez ou sélectionnez.
                          </div>

                          <span className="rounded-full border border-[#c9daf9] bg-[#f4f8ff] px-3 py-1 text-[11px] text-[#3f5b89] whitespace-nowrap tabular-nums">
                            {selectedCount} sélectionné(s)
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-[#d8e5ff] bg-[#f5f9ff] px-4 py-3 text-[11px] text-[#54709b]">
                  Astuce : utilisez “Tout sélectionner” pour supprimer ou exporter en lot.
                </div>
              </div>
            </div>

            <div className="h-8 border-t border-[#dce7fd]/80 sm:h-10" />

            {/* TABLE CARD */}
            <div className="overflow-hidden rounded-[28px] border border-[#dbe6ff] bg-white/90 shadow-[0_28px_58px_-40px_rgba(53,102,205,0.55)]">
              <div className="flex items-center justify-between gap-3 border-b border-[#e1eafc] bg-[#f8faff] px-6 py-4">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-[#132d55]">Liste des leads</h2>
                  <p className="text-[11px] text-[#7086aa]">
                    Cliquez sur “Voir →” pour ouvrir la fiche lead.
                  </p>
                </div>

                <span className="rounded-full border border-[#c9daf9] bg-white px-3 py-1 text-[11px] text-[#3f5b89] whitespace-nowrap tabular-nums">
                  {selectedCount} sélectionné(s)
                </span>
              </div>

              <div className="w-full overflow-x-auto">
                <table className="w-full text-[13px] table-fixed min-w-[980px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-[#f6f9ff] text-[#5d749a] text-[11px] uppercase tracking-wide">
                      <th className="w-[44px] border-b border-[#dce7fc] py-3 px-2 text-center whitespace-nowrap">
                        Sel.
                      </th>

                      <th className="w-[126px] border-b border-[#dce7fc] py-3 px-2 text-center whitespace-nowrap">
                        Statut
                      </th>

                      <th className="w-[150px] border-b border-[#dce7fc] py-3 px-2 text-left whitespace-nowrap">
                        Nom
                      </th>
                      <th className="w-[150px] border-b border-[#dce7fc] py-3 px-2 text-left whitespace-nowrap">
                        Entreprise
                      </th>
                      <th className="w-[140px] border-b border-[#dce7fc] py-3 px-2 text-left whitespace-nowrap">
                        Localisation
                      </th>
                      <th className="w-[96px] border-b border-[#dce7fc] py-3 px-2 text-left whitespace-nowrap">
                        LinkedIn
                      </th>

                      {emailOption && (
                        <th className="w-[190px] border-b border-[#dce7fc] py-3 px-2 text-left whitespace-nowrap">
                          Email
                        </th>
                      )}
                      {phoneOption && (
                        <th className="w-[120px] border-b border-[#dce7fc] py-3 px-2 text-left whitespace-nowrap">
                          Téléphone
                        </th>
                      )}

                      <th className="w-[92px] border-b border-[#dce7fc] py-3 px-2 text-center whitespace-nowrap">
                        Date
                      </th>
                      <th className="w-[96px] border-b border-[#dce7fc] py-3 px-2 text-center whitespace-nowrap">
                        Supprimer
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredLeads.length === 0 ? (
                      <tr>
                        <td colSpan={colCount} className="py-14 text-center">
                          <div className="mx-auto max-w-md px-6">
                            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border border-[#d6e3fb] bg-white text-[#5f79a5]">
                              ⌕
                            </div>
                            <div className="font-medium text-[#1d3a67]">Aucun résultat</div>
                            <div className="mt-1 text-sm text-[#6f86ab]">
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
                            ? "En attente d'envoi"
                            : "À faire";

                        return (
                          <tr
                            key={lead.id}
                            className={[
                              "group border-b border-[#eef3fd] transition",
                              idx % 2 === 0 ? "bg-transparent" : "bg-[#f9fbff]",
                              "hover:bg-[#f2f7ff]",
                            ].join(" ")}
                          >
                            <td className="py-3 px-2 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelected(idStr)}
                                className="h-4 w-4 cursor-pointer accent-indigo-500"
                                aria-label={`Sélectionner le lead ${fullName}`}
                              />
                            </td>

                            <td className="py-3 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleStatusBadgeClick(lead)}
                                disabled={isSent || isStatusUpdating}
                                className={[
                                  "inline-flex items-center justify-center h-8 px-3 rounded-full text-[11px] font-medium border whitespace-nowrap transition focus:outline-none focus:ring-2",
                                  isSent
                                    ? "cursor-default border-emerald-300/70 bg-emerald-50 text-emerald-700 focus:ring-emerald-300/60"
                                    : isPending
                                      ? "border-amber-300/70 bg-amber-50 text-amber-700 hover:bg-amber-100 focus:ring-amber-300/60"
                                      : "border-[#cedbf8] bg-white text-[#31507f] hover:bg-[#f2f7ff] focus:ring-[#90aff3]",
                                  isStatusUpdating ? "opacity-70 cursor-wait" : "",
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

                            <td className="relative py-3 px-2 pr-14 text-[#102c54]">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-medium truncate">{fullName}</span>
                              </div>

                              <button
                                type="button"
                                onClick={() => setOpenLead(lead)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-xl bg-[#2f6df0] px-3 py-1.5 text-[11px] text-white opacity-0 shadow-sm transition hover:bg-[#245fdc] group-hover:opacity-100 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#90aff4]"
                              >
                                Voir →
                              </button>
                            </td>

                            <td className="py-3 px-2 truncate text-[#486287]">{lead.Company || "—"}</td>

                            <td className="py-3 px-2 truncate text-[#486287]">{lead.location || "—"}</td>

                            <td className="py-3 px-2">
                              {lead.LinkedInURL ? (
                                <a
                                  href={lead.LinkedInURL}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#cfe0f9] bg-white px-3 text-[12px] text-[#2a4f83] transition hover:bg-[#f3f7ff] focus:outline-none focus:ring-2 focus:ring-[#9eb8ef]"
                                >
                                  Profil <span className="text-[#7a8fb2]">↗</span>
                                </a>
                              ) : (
                                <span className="text-[#7a8fb2]">—</span>
                              )}
                            </td>

                            {emailOption && (
                              <td className="py-3 px-2 truncate text-[#2f4f7f]">{lead.email || "—"}</td>
                            )}

                            {phoneOption && (
                              <td className="py-3 px-2 truncate text-[#2f4f7f]">{lead.phone || "—"}</td>
                            )}

                            <td className="py-3 px-2 text-center text-[#6f84a8] whitespace-nowrap tabular-nums">
                              {lead.created_at ? new Date(lead.created_at).toLocaleDateString("fr-FR") : "—"}
                            </td>

                            <td className="py-3 px-2 text-center">
                              <DeleteLeadButton leadId={lead.id} />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e1eafc] px-6 py-3 text-[11px] text-[#6d84aa]">
                <div>Astuce : passez la souris sur une ligne pour afficher “Voir →”.</div>
                <div className="tabular-nums">
                  {treatedCount} traité(s) • {remainingToTreat} à traiter
                </div>
              </div>
            </div>
          </div>

          {/* --- SIDEBAR --- */}
          {openLead && (
            <>
              <div className="fixed inset-0 z-40 bg-[#0c1932]/35 backdrop-blur-[3px]" aria-hidden="true" />

              <div className="fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-[#dce7fd] bg-white/95 shadow-[0_0_55px_-16px_rgba(57,104,199,0.35)] backdrop-blur-2xl animate-slideLeft sm:w-[500px]">
                <div className="sticky top-0 z-10 border-b border-[#e2eafd] bg-white/90 p-6 pb-4 backdrop-blur-xl">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-2xl text-xs text-[#4a668f] transition hover:text-[#143864] focus:outline-none focus:ring-2 focus:ring-[#8eaef4]"
                      onClick={() => setOpenLead(null)}
                    >
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-[#d5e2fb] bg-white">
                        ✕
                      </span>
                      Fermer
                    </button>

                    <span className="rounded-full border border-[#d5e2fb] bg-white px-3 py-1 text-[11px] text-[#3e5a88] whitespace-nowrap">
                      Essential
                    </span>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-2xl font-semibold leading-tight text-[#102b53]">
                          {(openLead.FirstName ?? "")} {(openLead.LastName ?? "")}
                        </h2>
                        <p className="mt-1 truncate text-[12px] text-[#6780a7]">
                          {openLead.Company || "—"} • {openLead.location || "—"}
                        </p>
                      </div>

                      <div className="shrink-0">
                        {openLead.message_sent ? (
                          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-50 px-3 py-1 text-[11px] text-emerald-700 whitespace-nowrap">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Envoyé
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2 rounded-full border border-[#d4e1fa] bg-white px-3 py-1 text-[11px] text-[#49658f] whitespace-nowrap">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#86a0c5]" />
                            À faire
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex-1 space-y-6 overflow-y-auto p-6">
                  <div className="rounded-3xl border border-[#dce7fd] bg-[#f9fbff] p-4">
                    <div className="text-[11px] uppercase tracking-wide text-[#7087ac]">Informations</div>

                    <div className="mt-3 grid grid-cols-1 gap-3">
                      <InfoBlock title="LinkedIn">
                        {openLead.LinkedInURL ? (
                          <a
                            href={openLead.LinkedInURL}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 whitespace-nowrap rounded-2xl border border-[#cddcf8] bg-white px-3 py-2 text-[#2f5080] transition hover:bg-[#f3f7ff] focus:outline-none focus:ring-2 focus:ring-[#8eaef4]"
                          >
                            Ouvrir le profil <span className="opacity-80">↗</span>
                          </a>
                        ) : (
                          <span className="text-[#7d93b7]">—</span>
                        )}
                      </InfoBlock>

                      {emailOption && (
                        <InfoBlock title="Email">
                          <span className="text-[#16345f]">{openLead.email || "—"}</span>
                        </InfoBlock>
                      )}

                      {phoneOption && (
                        <InfoBlock title="Téléphone">
                          <span className="text-[#16345f]">{openLead.phone || "—"}</span>
                        </InfoBlock>
                      )}

                      <InfoBlock title="Créé le">
                        <span className="text-[#16345f]">
                          {openLead.created_at
                            ? new Date(openLead.created_at).toLocaleDateString("fr-FR")
                            : "—"}
                        </span>
                      </InfoBlock>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-[#dce7fd] bg-[#f9fbff] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-xs font-medium text-[#264873]">Message LinkedIn</label>
                      <span className="text-[11px] text-[#7187ac] whitespace-nowrap">Autosave</span>
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
                      className="mt-3 h-44 w-full rounded-2xl border border-[#d1def8] bg-white p-4 text-sm text-[#183a67] placeholder-[#8096ba] transition focus:outline-none focus:ring-2 focus:ring-[#8eaef4]"
                    />

                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={handleMessageSent}
                        disabled={openLead.message_sent}
                        className={[
                          "w-full px-4 py-3 rounded-2xl text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-indigo-500/35",
                          openLead.message_sent
                            ? "bg-emerald-600 text-white cursor-default"
                            : "bg-[#2f6df0] text-white hover:bg-[#245fdc]",
                        ].join(" ")}
                      >
                        {openLead.message_sent ? "Message envoyé ✓" : "Marquer comme envoyé"}
                      </button>
                    </div>

                    {openLead.next_followup_at && (
                      <p className="mt-2 text-xs text-[#6d83aa]">
                        Prochaine relance :{" "}
                        <span className="font-medium text-[#16345f]">
                          {new Date(openLead.next_followup_at).toLocaleDateString("fr-FR")}
                        </span>
                      </p>
                    )}
                  </div>

                  {/* Email (now for everyone) */}
                  <div className="rounded-3xl border border-[#dce7fd] bg-[#f9fbff] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-xs font-medium text-[#264873]">Message email</label>
                      <span className="text-[11px] text-[#7187ac] whitespace-nowrap">Autosave</span>
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
                      className="mt-3 h-44 w-full rounded-2xl border border-[#d1def8] bg-white p-4 text-sm text-[#183a67] placeholder-[#8096ba] transition focus:outline-none focus:ring-2 focus:ring-[#8eaef4]"
                    />

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
                                "w-full px-4 py-3 rounded-2xl text-sm font-semibold transition border cursor-pointer whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-indigo-500/25",
                                "border-[#ccdaf7] bg-white text-[#234772] hover:bg-[#f3f7ff]",
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
                                "flex-1 px-3 py-2.5 rounded-2xl text-[12px] font-semibold transition border cursor-pointer whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-indigo-500/25",
                                "border-[#ccdaf7] bg-white text-[#234772] hover:bg-[#f3f7ff]",
                                dimIfNoEmail,
                              ].join(" ")}
                            >
                              Gmail
                            </button>

                            <button
                              type="button"
                              onClick={openOutlookWeb}
                              className={[
                                "flex-1 px-3 py-2.5 rounded-2xl text-[12px] font-semibold transition border cursor-pointer whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-indigo-500/25",
                                "border-[#ccdaf7] bg-white text-[#234772] hover:bg-[#f3f7ff]",
                                dimIfNoEmail,
                              ].join(" ")}
                            >
                              Outlook
                            </button>
                          </div>

                          {!hasEmail && (
                            <p className="mt-2 text-[11px] text-[#7188ae]">Aucun email détecté pour ce lead.</p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ✅ premium modal supprimé (plus de gating) */}
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

function Metric({ title, value }: { title: string; value: any }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#dce7fd] bg-white px-3 py-3 shadow-sm">
      <div className="whitespace-nowrap text-[10px] uppercase tracking-wide text-[#7288ad]">
        {title}
      </div>
      <div className="mt-1 truncate whitespace-nowrap text-[15px] font-semibold leading-none tabular-nums text-[#15335f]">
        {value}
      </div>
    </div>
  );
}

function InfoBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#dce7fd] bg-white p-4">
      <div className="whitespace-nowrap text-[10px] uppercase tracking-wide text-[#7087ac]">
        {title}
      </div>
      <div className="mt-2 text-sm text-[#15335f]">{children}</div>
    </div>
  );
}
