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
  prospects: number;
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
  if (!iso) return <span className="text-xs text-[#666]">Jamais</span>;
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);

  if (diffMin < 60)
    return (
      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400">
        En ligne
      </span>
    );
  if (diffD < 2)
    return (
      <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-xs text-orange-400">
        Hier
      </span>
    );
  return (
    <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-400">
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
}: {
  label: string;
  value: string | number;
  sub?: string;
  trend?: string;
}) {
  const isPositive = trend?.startsWith("+");
  const isNegative = trend?.startsWith("-");
  return (
    <div className="rounded-xl border border-[#222] bg-[#111] p-5">
      <div className="text-xs text-[#888] uppercase tracking-wider">{label}</div>
      <div className="mt-2 text-3xl font-bold text-white">{value}</div>
      {(sub || trend) && (
        <div className="mt-1 flex items-center gap-2 text-xs">
          {sub && <span className="text-[#666]">{sub}</span>}
          {trend && (
            <span
              className={
                isPositive
                  ? "text-emerald-400"
                  : isNegative
                    ? "text-red-400"
                    : "text-[#888]"
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
    <div className="min-h-screen bg-[#0A0A0B] p-6 text-white">
      <div className="mx-auto max-w-[1400px]">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Analytics</h1>
            <p className="mt-1 text-sm text-[#666]">
              Tableau de bord d'activité clients
            </p>
          </div>
          {data?.updated_at && (
            <div className="text-xs text-[#555]">
              Mis à jour {relativeTime(data.updated_at)}
            </div>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="text-[#666]">Chargement...</div>
          </div>
        )}

        {!loading && data && (
          <>
            {/* KPI Cards */}
            <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiCard
                label="Clients actifs (7j)"
                value={data.active_clients_7d}
                sub={`/ ${data.total_clients} total`}
              />
              <KpiCard
                label="Prospects cette semaine"
                value={data.total_prospects_delivered_week}
                trend={pct(
                  data.total_prospects_delivered_week,
                  data.total_prospects_delivered_prev_week
                )}
                sub="vs semaine dernière"
              />
              <KpiCard
                label="Messages cette semaine"
                value={data.total_messages_week}
                trend={pct(
                  data.total_messages_week,
                  data.total_messages_prev_week
                )}
                sub="vs semaine dernière"
              />
              <KpiCard
                label="Taux de réponse moyen"
                value={`${data.avg_reply_rate}%`}
              />
            </div>

            {/* Activity Chart */}
            <div className="mb-8 rounded-xl border border-[#222] bg-[#111] p-6">
              <h2 className="mb-4 text-sm font-semibold text-[#ccc]">
                Activité — 30 derniers jours
              </h2>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data.activity_chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#555", fontSize: 11 }}
                    tickFormatter={(v: string) => v.slice(5)}
                  />
                  <YAxis tick={{ fill: "#555", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "#111",
                      border: "1px solid #333",
                      borderRadius: 8,
                      color: "#fff",
                    }}
                  />
                  <Legend wrapperStyle={{ color: "#888", fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="logins"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    name="Connexions"
                  />
                  <Line
                    type="monotone"
                    dataKey="messages"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                    name="Messages"
                  />
                  <Line
                    type="monotone"
                    dataKey="prospects"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={false}
                    name="Prospects"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Clients Table */}
            <div className="mb-8 rounded-xl border border-[#222] bg-[#111]">
              <div className="border-b border-[#222] px-6 py-4">
                <h2 className="text-sm font-semibold text-[#ccc]">Clients</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#1a1a1a] text-xs text-[#555]">
                      <th className="px-6 py-3 text-left">Client</th>
                      <th className="px-4 py-3 text-left">Dernière connexion</th>
                      <th className="px-4 py-3 text-right">Prospects</th>
                      <th className="px-4 py-3 text-right">Messages</th>
                      <th className="px-4 py-3 text-right">Réponses</th>
                      <th className="px-4 py-3 text-left">Score santé</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.clients_table.length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-6 py-8 text-center text-[#555]"
                        >
                          Aucune donnée
                        </td>
                      </tr>
                    )}
                    {data.clients_table.map((c) => (
                      <tr
                        key={c.client_id}
                        className="border-b border-[#1a1a1a] hover:bg-[#151515]"
                      >
                        <td className="px-6 py-3">
                          <div className="font-medium text-white">
                            {c.client_name}
                          </div>
                          <div className="text-xs text-[#555]">
                            #{c.client_id}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {lastLoginBadge(c.last_login_at)}
                        </td>
                        <td className="px-4 py-3 text-right text-[#ccc]">
                          <div>{c.prospects_total}</div>
                          <div className="text-xs text-[#555]">
                            +{c.prospects_week} ce sem.
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-[#ccc]">
                          <div>{c.messages_total}</div>
                          <div className="text-xs text-[#555]">
                            +{c.messages_week} ce sem.
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-[#ccc]">
                          {c.reply_rate}%
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 rounded-full bg-[#222]">
                              <div
                                className="h-1.5 rounded-full"
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
                            <span className="text-xs text-[#888]">
                              {c.health_score}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/analytics/client/${c.client_id}`}
                            className="rounded-lg border border-[#333] bg-[#1a1a1a] px-3 py-1 text-xs text-[#aaa] transition hover:border-[#555] hover:text-white"
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
            <div className="rounded-xl border border-[#222] bg-[#111]">
              <div className="border-b border-[#222] px-6 py-4">
                <h2 className="text-sm font-semibold text-[#ccc]">
                  Activité récente
                </h2>
              </div>
              <div className="divide-y divide-[#1a1a1a]">
                {data.recent_events.length === 0 && (
                  <div className="px-6 py-8 text-center text-sm text-[#555]">
                    Aucun événement récent
                  </div>
                )}
                {data.recent_events.map((e, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-6 py-3 text-sm"
                  >
                    <span className="text-base">
                      {CATEGORY_ICONS[e.event_category] ?? "•"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="text-[#aaa]">
                        {e.client_name}
                      </span>
                      <span className="text-[#555]"> — </span>
                      <span className="text-white">
                        {EVENT_LABELS[e.event_type] ?? e.event_type}
                      </span>
                    </div>
                    <span className="shrink-0 text-xs text-[#555]">
                      {relativeTime(e.created_at)}
                    </span>
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
