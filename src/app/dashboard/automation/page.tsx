"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, CheckCircle2, Clock, ExternalLink, MessageSquare, RefreshCw, Send, TrendingUp, Users, Zap } from "lucide-react";
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

function LeadCard(props: {
  item: FeedItem;
  dateLabel: string;
  dateValue: string | null;
  badge: React.ReactNode;
}) {
  const { item, dateLabel, dateValue, badge } = props;
  const linkedinUrl = toExternalUrl(item.linkedin_url);
  const ini = initials(item.person_name);
  const color = avatarColor(item.person_name);

  return (
    <article className="group flex items-start gap-3 rounded-xl border border-[#dce8ff] bg-white px-3 py-3 transition hover:border-[#b8d0f8] hover:shadow-[0_4px_12px_-6px_rgba(31,94,255,0.12)]">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${color}`}>
        {ini}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#0b1c33]">{item.person_name}</p>
            <p className="truncate text-[11px] text-[#5d738f]">{item.company || "Entreprise non renseignée"}</p>
          </div>
          <div className="shrink-0">{badge}</div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-[#8093ad]" title={formatDate(dateValue)}>
            {dateLabel} · {relativeTime(dateValue)}
          </span>
          {linkedinUrl ? (
            <a
              href={linkedinUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-[#d7e3f4] bg-[#f7fbff] px-1.5 py-0.5 text-[10px] text-[#395577] transition hover:border-[#9cc0ff] hover:bg-[#edf4fd]"
            >
              <ExternalLink className="h-3 w-3" />
              Profil
            </a>
          ) : null}
          {item.last_error ? (
            <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] text-red-700">
              ⚠ {item.last_error}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function EmptyState(props: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#d1deef] bg-[#f8fbff] px-4 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d7e3f4] bg-white text-[#8093ad]">
        {props.icon}
      </div>
      <p className="text-sm text-[#5b718f]">{props.label}</p>
    </div>
  );
}

function PanelCard(props: {
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
  accentClass: string;
}) {
  const { icon, title, count, children, accentClass } = props;
  return (
    <section className="hub-card flex min-h-0 flex-col overflow-hidden">
      <div className={`flex items-center justify-between gap-2 border-b border-[#d7e3f4] px-4 py-3 ${accentClass}`}>
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-semibold text-[#0b1c33]">{title}</h2>
        </div>
        <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] font-medium text-[#395577] border border-[#d7e3f4]">
          {count}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="space-y-2">{children}</div>
      </div>
    </section>
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

      if (feedRes.status === 403) {
        setForbidden(true);
        return;
      }
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

            {/* KPI row */}
            {!forbidden && !loading ? (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard
                  accent="blue"
                  icon={<Send className="h-4 w-4" />}
                  label="Invitations envoyées"
                  value={stats.sent}
                  sub="Total cumulé"
                />
                <StatCard
                  accent="green"
                  icon={<Users className="h-4 w-4" />}
                  label="Connexions acceptées"
                  value={stats.accepted}
                  sub="Total cumulé"
                />
                <StatCard
                  accent="violet"
                  icon={<MessageSquare className="h-4 w-4" />}
                  label="Messages envoyés"
                  value={stats.dm}
                  sub="Automatiquement"
                />
                <StatCard
                  accent="amber"
                  icon={<TrendingUp className="h-4 w-4" />}
                  label="Taux d'acceptation"
                  value={`${stats.rate}%`}
                  sub={stats.sent > 0 ? `${stats.accepted} sur ${stats.sent}` : "Aucune donnée"}
                />
              </div>
            ) : null}

            {/* Today quota bar */}
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
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}
          </section>

          {/* Panels */}
          {loading ? (
            <section className="hub-card flex items-center justify-center p-10 text-sm text-[#51627b]">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Chargement de l'activité…
            </section>
          ) : forbidden ? null : (
            <section className="grid min-h-0 flex-1 gap-3 lg:grid-cols-3">

              {/* Invitations envoyées */}
              <PanelCard
                icon={<Send className="h-4 w-4 text-[#1f5eff]" />}
                title="Invitations envoyées"
                count={sentInvitations.length}
                accentClass="bg-[#f4f8ff]"
              >
                {sentInvitations.length === 0 ? (
                  <EmptyState
                    icon={<Send className="h-5 w-5" />}
                    label="Aucune invitation en attente de réponse."
                  />
                ) : sentInvitations.map((item) => (
                  <LeadCard
                    key={`sent-${item.invitation_id}`}
                    item={item}
                    dateLabel="Envoyée"
                    dateValue={item.sent_at}
                    badge={
                      <span className="rounded-full border border-[#c8d9ff] bg-[#eef4ff] px-2 py-0.5 text-[10px] font-medium text-[#2b5be8]">
                        En attente
                      </span>
                    }
                  />
                ))}
              </PanelCard>

              {/* Connexions acceptées */}
              <PanelCard
                icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                title="Connexions acceptées"
                count={acceptedInvitations.length}
                accentClass="bg-emerald-50/60"
              >
                {acceptedInvitations.length === 0 ? (
                  <EmptyState
                    icon={<Users className="h-5 w-5" />}
                    label="Aucune connexion acceptée pour le moment."
                  />
                ) : acceptedInvitations.map((item) => (
                  <LeadCard
                    key={`accepted-${item.invitation_id}`}
                    item={item}
                    dateLabel="Acceptée"
                    dateValue={item.accepted_at}
                    badge={
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                        Connecté
                      </span>
                    }
                  />
                ))}
              </PanelCard>

              {/* Messages envoyés */}
              <PanelCard
                icon={<MessageSquare className="h-4 w-4 text-violet-600" />}
                title="Messages envoyés"
                count={autoMessagesSent.length}
                accentClass="bg-violet-50/60"
              >
                {autoMessagesSent.length === 0 ? (
                  <EmptyState
                    icon={<MessageSquare className="h-5 w-5" />}
                    label="Aucun message automatique envoyé pour le moment."
                  />
                ) : autoMessagesSent.map((item) => (
                  <LeadCard
                    key={`dm-${item.invitation_id}`}
                    item={item}
                    dateLabel="Envoyé"
                    dateValue={item.dm_sent_at}
                    badge={
                      <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700">
                        Message ✓
                      </span>
                    }
                  />
                ))}
              </PanelCard>

            </section>
          )}
        </div>
      </div>
    </SubscriptionGate>
  );
}
