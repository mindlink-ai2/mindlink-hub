"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, CheckCircle2, ChevronLeft, ChevronRight, Clock, ExternalLink, MessageSquare, RefreshCw, Search, Send, TrendingUp, Users, Zap } from "lucide-react";
import SubscriptionGate from "@/components/SubscriptionGate";

type FeedItem = {
  invitation_id: string;
  lead_id: string | null;
  person_name: string;
  company: string | null;
  linkedin_url: string | null;
  status: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  dm_sent_at: string | null;
  dm_draft_status: string | null;
  unipile_account_id: string | null;
  last_error: string | null;
};

type FeedResponse = {
  success?: boolean;
  error?: string;
  plan?: string;
  subscription_status?: string;
  sent_invitations?: FeedItem[];
  accepted_invitations?: FeedItem[];
  auto_messages_sent?: FeedItem[];
};

type SettingsResponse = {
  is_full_active?: boolean;
  settings?: {
    daily_invite_quota: number;
    timezone: string;
  };
  stats?: {
    sent_today: number;
    accepted_today: number;
  };
};

type Tab = "sent" | "accepted" | "dm";

const PER_PAGE = 20;

function relativeTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "hier";
  if (diffD < 30) return `il y a ${diffD}j`;
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase() || "??";
}

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function toExternalUrl(rawValue: string | null): string | null {
  const value = String(rawValue ?? "").trim();
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function StatCard(props: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accent?: "blue" | "green" | "violet" | "amber";
}) {
  const { icon, label, value, sub, accent = "blue" } = props;
  const accentMap = {
    blue: "border-[#dce8ff] bg-gradient-to-br from-[#f2f7ff] to-white text-[#1f5eff]",
    green: "border-emerald-100 bg-gradient-to-br from-emerald-50 to-white text-emerald-600",
    violet: "border-violet-100 bg-gradient-to-br from-violet-50 to-white text-violet-600",
    amber: "border-amber-100 bg-gradient-to-br from-amber-50 to-white text-amber-600",
  };
  return (
    <div className={`rounded-2xl border px-4 py-4 ${accentMap[accent]}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[#6a7f9f]">{label}</p>
          <p className="mt-1 text-2xl font-bold text-[#0b1c33] tabular-nums">{value}</p>
          {sub ? <p className="mt-0.5 text-[11px] text-[#8093ad]">{sub}</p> : null}
        </div>
        <div className={`mt-0.5 rounded-xl p-2 ${accentMap[accent]}`}>{icon}</div>
      </div>
    </div>
  );
}

function TableRow(props: {
  item: FeedItem;
  dateValue: string | null;
  badge: React.ReactNode;
}) {
  const { item, dateValue, badge } = props;
  const linkedinUrl = toExternalUrl(item.linkedin_url);
  const ini = initials(item.person_name);
  const color = avatarColor(item.person_name);

  return (
    <tr className="group border-b border-[#edf2fb] transition hover:bg-[#f8fbff]">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${color}`}>
            {ini}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-[#0b1c33]">{item.person_name}</p>
            <p className="truncate text-[11px] text-[#7a8fa9]">{item.company || "—"}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-2.5">
        {linkedinUrl ? (
          <a
            href={linkedinUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-[#d7e3f4] bg-[#f7fbff] px-2 py-1 text-[11px] text-[#395577] transition hover:border-[#9cc0ff] hover:bg-[#edf4fd]"
          >
            <ExternalLink className="h-3 w-3" />
            Profil
          </a>
        ) : (
          <span className="text-[11px] text-[#b0bfd1]">—</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        <span className="text-[12px] text-[#6a7f9f]" title={formatDate(dateValue)}>
          {relativeTime(dateValue)}
        </span>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {badge}
          {item.last_error ? (
            <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] text-red-700">
              ⚠ Erreur
            </span>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function EmptyState(props: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d7e3f4] bg-[#f8fbff] text-[#8093ad]">
        {props.icon}
      </div>
      <p className="text-sm text-[#5b718f]">{props.label}</p>
    </div>
  );
}

function Pagination(props: {
  page: number;
  total: number;
  perPage: number;
  onPage: (p: number) => void;
}) {
  const { page, total, perPage, onPage } = props;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if (totalPages <= 1) return null;

  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  return (
    <div className="flex items-center justify-between border-t border-[#edf2fb] px-4 py-2.5">
      <span className="text-[12px] text-[#7a8fa9]">
        {from}–{to} sur {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#d7e3f4] bg-white text-[#395577] transition hover:border-[#9cc0ff] hover:bg-[#f3f8ff] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
          .reduce<(number | "…")[]>((acc, p, i, arr) => {
            if (i > 0 && (arr[i - 1] as number) < p - 1) acc.push("…");
            acc.push(p);
            return acc;
          }, [])
          .map((p, i) =>
            p === "…" ? (
              <span key={`ellipsis-${i}`} className="px-1 text-[12px] text-[#8093ad]">…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPage(p as number)}
                className={[
                  "flex h-7 min-w-[28px] items-center justify-center rounded-lg border px-1.5 text-[12px] font-medium transition",
                  p === page
                    ? "border-[#1f5eff] bg-[#1f5eff] text-white"
                    : "border-[#d7e3f4] bg-white text-[#395577] hover:border-[#9cc0ff] hover:bg-[#f3f8ff]",
                ].join(" ")}
              >
                {p}
              </button>
            )
          )}
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#d7e3f4] bg-white text-[#395577] transition hover:border-[#9cc0ff] hover:bg-[#f3f8ff] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function LinkedinAutomationPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [sentInvitations, setSentInvitations] = useState<FeedItem[]>([]);
  const [acceptedInvitations, setAcceptedInvitations] = useState<FeedItem[]>([]);
  const [autoMessagesSent, setAutoMessagesSent] = useState<FeedItem[]>([]);
  const [quota, setQuota] = useState<number>(10);
  const [sentToday, setSentToday] = useState<number>(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>("sent");
  const [search, setSearch] = useState("");
  const [pages, setPages] = useState<Record<Tab, number>>({ sent: 1, accepted: 1, dm: 1 });

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [feedRes, settingsRes] = await Promise.all([
        fetch("/api/linkedin/automation-feed", { cache: "no-store" }),
        fetch("/api/linkedin/settings", { cache: "no-store" }),
      ]);

      const feed = (await feedRes.json().catch(() => ({}))) as FeedResponse;
      const settings = (await settingsRes.json().catch(() => ({}))) as SettingsResponse;

      if (feedRes.status === 403) { setForbidden(true); return; }
      if (!feedRes.ok) throw new Error(feed?.error ?? "automation_feed_failed");

      setForbidden(false);
      setSentInvitations(Array.isArray(feed?.sent_invitations) ? feed.sent_invitations : []);
      setAcceptedInvitations(Array.isArray(feed?.accepted_invitations) ? feed.accepted_invitations : []);
      setAutoMessagesSent(Array.isArray(feed?.auto_messages_sent) ? feed.auto_messages_sent : []);

      if (settings?.settings?.daily_invite_quota) setQuota(settings.settings.daily_invite_quota);
      if (typeof settings?.stats?.sent_today === "number") setSentToday(settings.stats.sent_today);
      setLastUpdated(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Impossible de charger l'activité.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const sent = sentInvitations.length + acceptedInvitations.length + autoMessagesSent.length;
    const accepted = acceptedInvitations.length + autoMessagesSent.length;
    const dm = autoMessagesSent.length;
    const rate = sent > 0 ? Math.round((accepted / sent) * 100) : 0;
    return { sent, accepted, dm, rate };
  }, [sentInvitations, acceptedInvitations, autoMessagesSent]);

  const quotaPercent = Math.min(100, Math.round((sentToday / quota) * 100));

  const filterItems = useCallback((items: FeedItem[]) => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (it) =>
        it.person_name.toLowerCase().includes(term) ||
        (it.company ?? "").toLowerCase().includes(term)
    );
  }, [search]);

  const filteredSent = useMemo(() => filterItems(sentInvitations), [filterItems, sentInvitations]);
  const filteredAccepted = useMemo(() => filterItems(acceptedInvitations), [filterItems, acceptedInvitations]);
  const filteredDm = useMemo(() => filterItems(autoMessagesSent), [filterItems, autoMessagesSent]);

  const currentItems = activeTab === "sent" ? filteredSent : activeTab === "accepted" ? filteredAccepted : filteredDm;
  const currentPage = pages[activeTab];
  const pagedItems = currentItems.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  function setPage(tab: Tab, p: number) {
    setPages((prev) => ({ ...prev, [tab]: p }));
  }

  function switchTab(tab: Tab) {
    setActiveTab(tab);
    setSearch("");
  }

  const tabs: { key: Tab; label: string; count: number; icon: React.ReactNode; accent: string }[] = [
    {
      key: "sent",
      label: "Invitations envoyées",
      count: sentInvitations.length,
      icon: <Send className="h-3.5 w-3.5" />,
      accent: "text-[#1f5eff]",
    },
    {
      key: "accepted",
      label: "Connexions acceptées",
      count: acceptedInvitations.length,
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      accent: "text-emerald-600",
    },
    {
      key: "dm",
      label: "Messages envoyés",
      count: autoMessagesSent.length,
      icon: <MessageSquare className="h-3.5 w-3.5" />,
      accent: "text-violet-600",
    },
  ];

  const badgeForTab = (tab: Tab): React.ReactNode => {
    if (tab === "sent")
      return <span className="rounded-full border border-[#c8d9ff] bg-[#eef4ff] px-2 py-0.5 text-[10px] font-medium text-[#2b5be8]">En attente</span>;
    if (tab === "accepted")
      return <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">Connecté</span>;
    return <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700">Message ✓</span>;
  };

  const dateValueFor = (tab: Tab, item: FeedItem): string | null =>
    tab === "sent" ? item.sent_at : tab === "accepted" ? item.accepted_at : item.dm_sent_at;

  return (
    <SubscriptionGate supportEmail="contact@lidmeo.com">
      <div className="relative h-full min-h-0 w-full px-4 pb-20 pt-4 sm:px-6 sm:pt-5">
        <div className="mx-auto flex h-full min-h-0 w-full max-w-[1680px] flex-col gap-4">

          {/* Hero */}
          <section className="hub-card-hero p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1f5eff]/10 text-[#1f5eff]">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="hub-page-title">Automation LinkedIn</h1>
                  <p className="mt-0.5 text-sm text-[#51627b]">Suivi en temps réel de votre prospection automatisée</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {lastUpdated ? (
                  <span className="text-[11px] text-[#8093ad]">
                    Mis à jour {relativeTime(lastUpdated.toISOString())}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => load(true)}
                  disabled={refreshing}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#d7e3f4] bg-white px-3 py-1.5 text-[12px] font-medium text-[#395577] transition hover:border-[#9cc0ff] hover:bg-[#f3f8ff] disabled:opacity-60"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                  Actualiser
                </button>
              </div>
            </div>

            {!forbidden && !loading ? (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard accent="blue" icon={<Send className="h-4 w-4" />} label="Invitations envoyées" value={stats.sent} sub="Total cumulé" />
                <StatCard accent="green" icon={<Users className="h-4 w-4" />} label="Connexions acceptées" value={stats.accepted} sub="Total cumulé" />
                <StatCard accent="violet" icon={<MessageSquare className="h-4 w-4" />} label="Messages envoyés" value={stats.dm} sub="Automatiquement" />
                <StatCard accent="amber" icon={<TrendingUp className="h-4 w-4" />} label="Taux d'acceptation" value={`${stats.rate}%`} sub={stats.sent > 0 ? `${stats.accepted} sur ${stats.sent}` : "Aucune donnée"} />
              </div>
            ) : null}

            {!forbidden && !loading ? (
              <div className="mt-4 rounded-xl border border-[#d7e3f4] bg-white px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-[#1f5eff]" />
                    <span className="text-sm font-medium text-[#0b1c33]">
                      Aujourd'hui : <span className="text-[#1f5eff]">{sentToday}</span>
                      <span className="text-[#8093ad]">/{quota}</span> invitations
                    </span>
                    {quotaPercent >= 100 ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                        Quota atteint ✓
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-[#8093ad]">
                    <Clock className="h-3.5 w-3.5" />
                    Lun–Ven · 9h–18h · toutes les 5 min
                  </div>
                </div>
                <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[#e8f0fd]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#1f5eff] to-[#5b8fff] transition-all duration-500"
                    style={{ width: `${quotaPercent}%` }}
                  />
                </div>
              </div>
            ) : null}

            {forbidden ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Cette page est disponible uniquement pour les clients Plan Full actifs.
              </div>
            ) : null}

            {error ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            ) : null}
          </section>

          {/* Table section */}
          {loading ? (
            <section className="hub-card flex items-center justify-center p-10 text-sm text-[#51627b]">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Chargement de l'activité…
            </section>
          ) : forbidden ? null : (
            <section className="hub-card flex min-h-0 flex-1 flex-col overflow-hidden">

              {/* Tabs + search */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#dce8ff] px-4 pt-3 pb-0">
                <div className="flex items-center gap-0">
                  {tabs.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => switchTab(tab.key)}
                      className={[
                        "flex items-center gap-1.5 border-b-2 px-4 pb-2.5 pt-1 text-[12px] font-medium transition",
                        activeTab === tab.key
                          ? `border-[#1f5eff] ${tab.accent}`
                          : "border-transparent text-[#7a8fa9] hover:text-[#395577]",
                      ].join(" ")}
                    >
                      <span className={activeTab === tab.key ? tab.accent : ""}>{tab.icon}</span>
                      <span className="hidden sm:inline">{tab.label}</span>
                      <span className={[
                        "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                        activeTab === tab.key
                          ? "bg-[#eef4ff] text-[#1f5eff]"
                          : "bg-[#f0f4fa] text-[#7a8fa9]",
                      ].join(" ")}>
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8093ad]" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setPage(activeTab, 1); }}
                      placeholder="Rechercher par nom, entreprise…"
                      className="h-8 w-[220px] rounded-lg border border-[#d7e3f4] bg-[#f8fbff] pl-8 pr-3 text-[12px] text-[#0b1c33] placeholder:text-[#8093ad] focus:border-[#90b5ff] focus:outline-none focus:ring-2 focus:ring-[#dce8ff]"
                    />
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="min-h-0 flex-1 overflow-auto">
                {currentItems.length === 0 ? (
                  <EmptyState
                    icon={
                      activeTab === "sent" ? <Send className="h-5 w-5" /> :
                      activeTab === "accepted" ? <Users className="h-5 w-5" /> :
                      <MessageSquare className="h-5 w-5" />
                    }
                    label={
                      search
                        ? "Aucun résultat pour cette recherche."
                        : activeTab === "sent" ? "Aucune invitation en attente de réponse."
                        : activeTab === "accepted" ? "Aucune connexion acceptée pour le moment."
                        : "Aucun message automatique envoyé pour le moment."
                    }
                  />
                ) : (
                  <table className="w-full border-separate border-spacing-0 text-sm">
                    <thead className="sticky top-0 z-10 bg-[#f8fbff]">
                      <tr className="text-[11px] uppercase tracking-wide text-[#6a7f9f]">
                        <th className="border-b border-[#dce8ff] px-4 py-2.5 text-left font-medium">Prospect</th>
                        <th className="border-b border-[#dce8ff] px-4 py-2.5 text-left font-medium">Profil</th>
                        <th className="border-b border-[#dce8ff] px-4 py-2.5 text-left font-medium">Date</th>
                        <th className="border-b border-[#dce8ff] px-4 py-2.5 text-left font-medium">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedItems.map((item) => (
                        <TableRow
                          key={`${activeTab}-${item.invitation_id}`}
                          item={item}
                          dateValue={dateValueFor(activeTab, item)}
                          badge={badgeForTab(activeTab)}
                        />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Pagination */}
              <Pagination
                page={currentPage}
                total={currentItems.length}
                perPage={PER_PAGE}
                onPage={(p) => setPage(activeTab, p)}
              />

            </section>
          )}
        </div>
      </div>
    </SubscriptionGate>
  );
}
