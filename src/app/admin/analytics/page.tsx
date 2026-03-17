"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

type ActivityPoint = {
  date: string;
  logins: number;
  messages: number;
  connections: number;
};

type ClientRow = {
  client_id: number;
  client_name: string;
  last_login_at: string | null;
  prospects_total: number;
  prospects_week: number;
  messages_total: number;
  messages_week: number;
  reply_rate: number;
  health_score: number;
};

type RecentEvent = {
  client_id: number;
  client_name: string;
  event_type: string;
  event_category: string;
  created_at: string;
  metadata: Record<string, unknown>;
};

type GlobalData = {
  active_clients_7d: number;
  total_clients: number;
  total_prospects_delivered_week: number;
  total_prospects_delivered_prev_week: number;
  total_messages_week: number;
  total_messages_prev_week: number;
  avg_reply_rate: number;
  activity_chart: ActivityPoint[];
  clients_table: ClientRow[];
  recent_events: RecentEvent[];
  updated_at: string;
};

const CATEGORY_ICONS: Record<string, string> = {
  auth: "🔐",
  prospects: "👥",
  messaging: "💬",
  navigation: "🧭",
  crm: "📋",
};

const EVENT_LABELS: Record<string, string> = {
  login: "Connexion",
  logout: "Déconnexion",
  session_start: "Début de session",
  session_end: "Fin de session",
  page_viewed: "Page visitée",
  prospects_list_viewed: "Liste des prospects consultée",
  prospect_detail_viewed: "Prospect consulté",
  message_sent: "Message envoyé",
  connection_request_sent: "Invitation envoyée",
  reply_received: "Réponse reçue",
  dashboard_viewed: "Dashboard consulté",
  lead_status_changed: "Statut modifié",
  prospects_exported: "Export prospects",
  prospects_filtered: "Filtrage prospects",
  message_template_viewed: "Template consulté",
  message_template_edited: "Template modifié",
  settings_viewed: "Paramètres consultés",
  note_added: "Note ajoutée",
  lead_archived: "Lead archivé",
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `il y a ${diffD}j`;
}

function lastLoginBadge(iso: string | null) {
  if (!iso) return <span className="text-xs text-[#94a3b8]">Jamais</span>;
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);

  if (diffMin < 60)
    return (
      <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-700">
        En ligne
      </span>
    );
  if (diffD < 2)
    return (
      <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-medium text-amber-700">
        Hier
      </span>
    );
  return (
    <span className="rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-xs font-medium text-red-700">
      Il y a {diffD}j
    </span>
  );
}

function pct(a: number, b: number): string {
  if (b === 0) return "—";
  const diff = a - b;
  const sign = diff >= 0 ? "+" : "";
  const val = Math.round((diff / b) * 100);
  return `${sign}${val}%`;
}

function KpiCard({
  label,
  value,
  sub,
  trend,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  trend?: string;
  accent?: string;
}) {
  const isPositive = trend?.startsWith("+");
  const isNegative = trend?.startsWith("-");
  return (
    <div className="hub-card p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-[#51627b]">{label}</div>
      <div className={`mt-2 text-3xl font-bold ${accent ?? "text-[#0b1c33]"}`}>{value}</div>
      {(sub || trend) && (
        <div className="mt-1.5 flex items-center gap-2 text-xs">
          {sub && <span className="text-[#94a3b8]">{sub}</span>}
          {trend && (
            <span
              className={
                isPositive
                  ? "font-medium text-emerald-600"
                  : isNegative
                    ? "font-medium text-red-500"
                    : "text-[#94a3b8]"
              }
            >
              {trend}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<GlobalData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/client-analytics/global")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f4f8ff_0%,#eef4ff_45%,#f7faff_100%)] px-4 pb-24 pt-8 sm:px-6">
      <div className="mx-auto w-full max-w-7xl space-y-8">

        {/* Header */}
        <section className="relative overflow-hidden rounded-3xl border border-[#d8e4f8] bg-white/90 p-6 shadow-[0_30px_60px_-42px_rgba(22,64,128,0.3)] md:p-8">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-28 -top-24 h-72 w-72 rounded-full bg-[#d9e8ff]/60 blur-3xl" />
            <div className="absolute -right-28 -top-28 h-80 w-80 rounded-full bg-[#d7f1ff]/50 blur-3xl" />
          </div>
          <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#cbdcf7] bg-[#f7fbff] px-3 py-1 text-xs font-medium text-[#35588a]">
                <span className="h-2 w-2 rounded-full bg-[#1f5eff]" />
                Admin
              </div>
              <h1 className="hub-page-title mt-3">Analytics clients</h1>
              <p className="mt-2 text-sm text-[#51627b]">
                Suivi d'activité de tous les clients Lidmeo
              </p>
            </div>
            {data?.updated_at && (
              <p className="text-xs text-[#94a3b8]">
                Mis à jour {relativeTime(data.updated_at)}
              </p>
            )}
          </div>
        </section>

        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="text-sm text-[#94a3b8]">Chargement...</div>
          </div>
        )}

        {!loading && data && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiCard
                label="Clients actifs (7j)"
                value={data.active_clients_7d}
                sub={`/ ${data.total_clients} total`}
                accent="text-[#1f5eff]"
              />
              <KpiCard
                label="Prospects cette semaine"
                value={data.total_prospects_delivered_week}
                trend={pct(data.total_prospects_delivered_week, data.total_prospects_delivered_prev_week)}
                sub="vs semaine dernière"
              />
              <KpiCard
                label="Messages cette semaine"
                value={data.total_messages_week}
                trend={pct(data.total_messages_week, data.total_messages_prev_week)}
                sub="vs semaine dernière"
              />
              <KpiCard
                label="Taux de réponse moyen"
                value={`${data.avg_reply_rate}%`}
                accent="text-emerald-600"
              />
            </div>

            {/* Activity Chart */}
            <div className="hub-card p-6">
              <h2 className="mb-5 text-sm font-semibold text-[#0b1c33]">
                Activité — 30 derniers jours
              </h2>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.activity_chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8f0fb" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    tickFormatter={(v: string) => v.slice(5)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#fff",
                      border: "1px solid #d8e4f8",
                      borderRadius: 10,
                      color: "#0b1c33",
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ color: "#51627b", fontSize: 12 }} />
                  <Line type="monotone" dataKey="logins" stroke="#1f5eff" strokeWidth={2} dot={false} name="Connexions" />
                  <Line type="monotone" dataKey="messages" stroke="#10b981" strokeWidth={2} dot={false} name="Messages" />
                  <Line type="monotone" dataKey="connections" stroke="#f59e0b" strokeWidth={2} dot={false} name="Invitations envoyées" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Clients Table */}
            <div className="hub-card overflow-hidden">
              <div className="border-b border-[#e8f0fb] px-6 py-4">
                <h2 className="text-sm font-semibold text-[#0b1c33]">Clients</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#f0f4fb] text-xs text-[#94a3b8]">
                      <th className="px-6 py-3 text-left font-medium">Client</th>
                      <th className="px-4 py-3 text-left font-medium">Dernière connexion</th>
                      <th className="px-4 py-3 text-right font-medium">Prospects</th>
                      <th className="px-4 py-3 text-right font-medium">Messages</th>
                      <th className="px-4 py-3 text-right font-medium">Réponses</th>
                      <th className="px-4 py-3 text-left font-medium">Score santé</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.clients_table.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-6 py-8 text-center text-sm text-[#94a3b8]">
                          Aucune donnée
                        </td>
                      </tr>
                    )}
                    {data.clients_table.map((c) => (
                      <tr key={c.client_id} className="border-b border-[#f7faff] transition hover:bg-[#f7fbff]">
                        <td className="px-6 py-3">
                          <div className="font-medium text-[#0b1c33]">{c.client_name}</div>
                          <div className="text-xs text-[#94a3b8]">#{c.client_id}</div>
                        </td>
                        <td className="px-4 py-3">{lastLoginBadge(c.last_login_at)}</td>
                        <td className="px-4 py-3 text-right text-[#0b1c33]">
                          <div>{c.prospects_total}</div>
                          <div className="text-xs text-[#94a3b8]">+{c.prospects_week} ce sem.</div>
                        </td>
                        <td className="px-4 py-3 text-right text-[#0b1c33]">
                          <div>{c.messages_total}</div>
                          <div className="text-xs text-[#94a3b8]">+{c.messages_week} ce sem.</div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-[#0b1c33]">
                          {c.reply_rate}%
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 rounded-full bg-[#e8f0fb]">
                              <div
                                className="h-1.5 rounded-full transition-all"
                                style={{
                                  width: `${c.health_score}%`,
                                  background:
                                    c.health_score >= 70
                                      ? "#10b981"
                                      : c.health_score >= 40
                                        ? "#f59e0b"
                                        : "#ef4444",
                                }}
                              />
                            </div>
                            <span className="text-xs text-[#51627b]">{c.health_score}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/analytics/client/${c.client_id}`}
                            className="rounded-lg border border-[#d8e4f8] bg-[#f7fbff] px-3 py-1 text-xs font-medium text-[#35588a] transition hover:border-[#1f5eff] hover:text-[#1f5eff]"
                          >
                            Voir
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent Events */}
            <div className="hub-card overflow-hidden">
              <div className="border-b border-[#e8f0fb] px-6 py-4">
                <h2 className="text-sm font-semibold text-[#0b1c33]">Activité récente</h2>
              </div>
              <div className="divide-y divide-[#f7faff]">
                {data.recent_events.length === 0 && (
                  <div className="px-6 py-8 text-center text-sm text-[#94a3b8]">
                    Aucun événement récent
                  </div>
                )}
                {data.recent_events.map((e, i) => (
                  <div key={i} className="flex items-center gap-3 px-6 py-3 text-sm transition hover:bg-[#f7fbff]">
                    <span className="text-base">{CATEGORY_ICONS[e.event_category] ?? "•"}</span>
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-[#0b1c33]">{e.client_name}</span>
                      <span className="text-[#94a3b8]"> — </span>
                      <span className="text-[#51627b]">{EVENT_LABELS[e.event_type] ?? e.event_type}</span>
                    </div>
                    <span className="shrink-0 text-xs text-[#94a3b8]">{relativeTime(e.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
