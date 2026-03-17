"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LabelList,
} from "recharts";

type ActivityPoint = { date: string; events: number };
type CategoryPoint = { category: string; count: number };
type Funnel = {
  prospects_received: number;
  prospects_viewed: number;
  messages_sent: number;
  replies: number;
};
type EventRow = {
  id: string;
  event_type: string;
  event_category: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

type ClientData = {
  client_id: number;
  client_name: string;
  health_score: number;
  last_login_at: string | null;
  logins_month: number;
  prospects_total: number;
  prospects_month: number;
  messages_total: number;
  messages_month: number;
  reply_rate: number;
  activity_chart: ActivityPoint[];
  category_breakdown: CategoryPoint[];
  funnel: Funnel;
  events: EventRow[];
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

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

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

function HealthGauge({ score }: { score: number }) {
  const color =
    score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";
  const circumference = 2 * Math.PI * 36;
  const dashOffset = circumference * (1 - score / 100);
  return (
    <div className="relative flex h-20 w-20 items-center justify-center">
      <svg width="80" height="80" className="-rotate-90">
        <circle cx="40" cy="40" r="36" fill="none" stroke="#222" strokeWidth="6" />
        <circle
          cx="40"
          cy="40"
          r="36"
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-lg font-bold text-white">{score}</span>
        <span className="text-[10px] text-[#666]">/ 100</span>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-[#222] bg-[#111] p-5">
      <div className="text-xs uppercase tracking-wider text-[#888]">{label}</div>
      <div className="mt-2 text-3xl font-bold text-white">{value}</div>
      {sub && <div className="mt-1 text-xs text-[#666]">{sub}</div>}
    </div>
  );
}

export default function ClientAnalyticsPage() {
  const params = useParams();
  const clientId = params?.clientId as string;
  const [data, setData] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  useEffect(() => {
    if (!clientId) return;
    fetch(`/api/admin/client-analytics/client/${clientId}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [clientId]);

  const paginatedEvents = data?.events.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) ?? [];
  const totalPages = Math.ceil((data?.events.length ?? 0) / PAGE_SIZE);

  const funnelData = data
    ? [
        { name: "Reçus", value: data.funnel.prospects_received },
        { name: "Vus", value: data.funnel.prospects_viewed },
        { name: "Messages", value: data.funnel.messages_sent },
        { name: "Réponses", value: data.funnel.replies },
      ]
    : [];

  const healthColor =
    !data
      ? "#555"
      : data.health_score >= 70
        ? "#10b981"
        : data.health_score >= 40
          ? "#f59e0b"
          : "#ef4444";

  return (
    <div className="min-h-screen bg-[#0A0A0B] p-6 text-white">
      <div className="mx-auto max-w-[1400px]">
        {/* Back */}
        <div className="mb-6">
          <Link
            href="/admin/analytics"
            className="text-xs text-[#555] transition hover:text-[#aaa]"
          >
            ← Retour au tableau de bord
          </Link>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24 text-[#666]">
            Chargement...
          </div>
        )}

        {!loading && !data && (
          <div className="flex items-center justify-center py-24 text-[#666]">
            Client introuvable.
          </div>
        )}

        {!loading && data && (
          <>
            {/* Header */}
            <div className="mb-8 flex flex-wrap items-center gap-6 rounded-xl border border-[#222] bg-[#111] p-6">
              <HealthGauge score={data.health_score} />
              <div className="flex-1">
                <h1 className="text-xl font-bold text-white">{data.client_name}</h1>
                <div className="mt-1 text-sm text-[#555]">ID #{data.client_id}</div>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                    style={{
                      background: `${healthColor}22`,
                      color: healthColor,
                    }}
                  >
                    {data.health_score >= 70
                      ? "Actif"
                      : data.health_score >= 40
                        ? "Modéré"
                        : "Inactif"}
                  </span>
                  {data.last_login_at && (
                    <span className="text-xs text-[#555]">
                      Dernière connexion {relativeTime(data.last_login_at)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* KPI Cards */}
            <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiCard
                label="Connexions ce mois"
                value={data.logins_month}
              />
              <KpiCard
                label="Prospects consultés"
                value={data.prospects_total}
                sub={`+${data.prospects_month} ce mois`}
              />
              <KpiCard
                label="Messages envoyés"
                value={data.messages_total}
                sub={`+${data.messages_month} ce mois`}
              />
              <KpiCard
                label="Taux de réponse"
                value={`${data.reply_rate}%`}
              />
            </div>

            {/* Charts row */}
            <div className="mb-8 grid gap-6 lg:grid-cols-3">
              {/* Area chart */}
              <div className="rounded-xl border border-[#222] bg-[#111] p-6 lg:col-span-2">
                <h2 className="mb-4 text-sm font-semibold text-[#ccc]">
                  Activité — 30 derniers jours
                </h2>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={data.activity_chart}>
                    <defs>
                      <linearGradient id="colorEvents" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
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
                    <Area
                      type="monotone"
                      dataKey="events"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fill="url(#colorEvents)"
                      name="Événements"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Donut chart */}
              <div className="rounded-xl border border-[#222] bg-[#111] p-6">
                <h2 className="mb-4 text-sm font-semibold text-[#ccc]">
                  Répartition par catégorie
                </h2>
                {data.category_breakdown.length === 0 ? (
                  <div className="flex h-[200px] items-center justify-center text-sm text-[#555]">
                    Aucune donnée
                  </div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie
                          data={data.category_breakdown}
                          dataKey="count"
                          nameKey="category"
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={70}
                        >
                          {data.category_breakdown.map((_, idx) => (
                            <Cell
                              key={idx}
                              fill={PIE_COLORS[idx % PIE_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: "#111",
                            border: "1px solid #333",
                            borderRadius: 8,
                            color: "#fff",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {data.category_breakdown.map((c, idx) => (
                        <div key={c.category} className="flex items-center gap-1 text-xs">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: PIE_COLORS[idx % PIE_COLORS.length] }}
                          />
                          <span className="text-[#888]">
                            {CATEGORY_ICONS[c.category] ?? ""} {c.category} ({c.count})
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Funnel */}
            <div className="mb-8 rounded-xl border border-[#222] bg-[#111] p-6">
              <h2 className="mb-4 text-sm font-semibold text-[#ccc]">
                Funnel d'engagement
              </h2>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={funnelData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                  <XAxis type="number" tick={{ fill: "#555", fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: "#888", fontSize: 12 }}
                    width={80}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#111",
                      border: "1px solid #333",
                      borderRadius: 8,
                      color: "#fff",
                    }}
                  />
                  <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="value" position="right" style={{ fill: "#888", fontSize: 12 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Events Log */}
            <div className="rounded-xl border border-[#222] bg-[#111]">
              <div className="border-b border-[#222] px-6 py-4">
                <h2 className="text-sm font-semibold text-[#ccc]">
                  Événements récents
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#1a1a1a] text-xs text-[#555]">
                      <th className="px-6 py-3 text-left">Événement</th>
                      <th className="px-4 py-3 text-left">Catégorie</th>
                      <th className="px-4 py-3 text-left">Métadonnées</th>
                      <th className="px-4 py-3 text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedEvents.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-[#555]">
                          Aucun événement
                        </td>
                      </tr>
                    )}
                    {paginatedEvents.map((e) => (
                      <tr
                        key={e.id}
                        className="border-b border-[#1a1a1a] hover:bg-[#151515]"
                      >
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            <span>
                              {CATEGORY_ICONS[e.event_category] ?? "•"}
                            </span>
                            <span className="text-white">
                              {EVENT_LABELS[e.event_type] ?? e.event_type}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[#666]">
                          {e.event_category}
                        </td>
                        <td className="px-4 py-3 max-w-xs truncate text-[#555] font-mono text-xs">
                          {Object.keys(e.metadata).length > 0
                            ? JSON.stringify(e.metadata)
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-[#555]">
                          {relativeTime(e.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-[#1a1a1a] px-6 py-3">
                  <span className="text-xs text-[#555]">
                    Page {page + 1} / {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="rounded-lg border border-[#333] px-3 py-1 text-xs text-[#888] transition hover:border-[#555] disabled:opacity-30"
                    >
                      Précédent
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                      className="rounded-lg border border-[#333] px-3 py-1 text-xs text-[#888] transition hover:border-[#555] disabled:opacity-30"
                    >
                      Suivant
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
