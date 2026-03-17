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

const PIE_COLORS = ["#1f5eff", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

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
        <circle cx="40" cy="40" r="36" fill="none" stroke="#e8f0fb" strokeWidth="6" />
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
        <span className="text-lg font-bold text-[#0b1c33]">{score}</span>
        <span className="text-[10px] text-[#94a3b8]">/ 100</span>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="hub-card p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-[#51627b]">{label}</div>
      <div className={`mt-2 text-3xl font-bold ${accent ?? "text-[#0b1c33]"}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-[#94a3b8]">{sub}</div>}
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

  const healthLabel = !data
    ? ""
    : data.health_score >= 70
      ? "Actif"
      : data.health_score >= 40
        ? "Modéré"
        : "Inactif";

  const healthBadgeClass = !data
    ? ""
    : data.health_score >= 70
      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
      : data.health_score >= 40
        ? "bg-amber-50 border-amber-200 text-amber-700"
        : "bg-red-50 border-red-200 text-red-700";

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f4f8ff_0%,#eef4ff_45%,#f7faff_100%)] px-4 pb-24 pt-8 sm:px-6">
      <div className="mx-auto w-full max-w-7xl space-y-8">

        {/* Back */}
        <div>
          <Link
            href="/admin/analytics"
            className="text-xs text-[#94a3b8] transition hover:text-[#1f5eff]"
          >
            ← Retour au tableau de bord
          </Link>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="text-sm text-[#94a3b8]">Chargement...</div>
          </div>
        )}

        {!loading && !data && (
          <div className="flex items-center justify-center py-24">
            <div className="text-sm text-[#94a3b8]">Client introuvable.</div>
          </div>
        )}

        {!loading && data && (
          <>
            {/* Header */}
            <section className="relative overflow-hidden rounded-3xl border border-[#d8e4f8] bg-white/90 p-6 shadow-[0_30px_60px_-42px_rgba(22,64,128,0.3)] md:p-8">
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute -left-28 -top-24 h-72 w-72 rounded-full bg-[#d9e8ff]/60 blur-3xl" />
                <div className="absolute -right-28 -top-28 h-80 w-80 rounded-full bg-[#d7f1ff]/50 blur-3xl" />
              </div>
              <div className="relative z-10 flex flex-wrap items-center gap-6">
                <HealthGauge score={data.health_score} />
                <div className="flex-1">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#cbdcf7] bg-[#f7fbff] px-3 py-1 text-xs font-medium text-[#35588a]">
                    <span className="h-2 w-2 rounded-full bg-[#1f5eff]" />
                    Admin
                  </div>
                  <h1 className="hub-page-title mt-2">{data.client_name}</h1>
                  <div className="mt-1 text-sm text-[#51627b]">ID #{data.client_id}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${healthBadgeClass}`}>
                      {healthLabel}
                    </span>
                    {data.last_login_at && (
                      <span className="text-xs text-[#94a3b8]">
                        Dernière connexion {relativeTime(data.last_login_at)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiCard
                label="Connexions ce mois"
                value={data.logins_month}
                accent="text-[#1f5eff]"
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
                accent="text-emerald-600"
              />
            </div>

            {/* Charts row */}
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Area chart */}
              <div className="hub-card p-6 lg:col-span-2">
                <h2 className="mb-5 text-sm font-semibold text-[#0b1c33]">
                  Activité — 30 derniers jours
                </h2>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={data.activity_chart}>
                    <defs>
                      <linearGradient id="colorEvents" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1f5eff" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#1f5eff" stopOpacity={0} />
                      </linearGradient>
                    </defs>
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
                    <Area
                      type="monotone"
                      dataKey="events"
                      stroke="#1f5eff"
                      strokeWidth={2}
                      fill="url(#colorEvents)"
                      name="Événements"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Donut chart */}
              <div className="hub-card p-6">
                <h2 className="mb-5 text-sm font-semibold text-[#0b1c33]">
                  Répartition par catégorie
                </h2>
                {data.category_breakdown.length === 0 ? (
                  <div className="flex h-[200px] items-center justify-center text-sm text-[#94a3b8]">
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
                            background: "#fff",
                            border: "1px solid #d8e4f8",
                            borderRadius: 10,
                            color: "#0b1c33",
                            fontSize: 12,
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
                          <span className="text-[#51627b]">
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
            <div className="hub-card p-6">
              <h2 className="mb-5 text-sm font-semibold text-[#0b1c33]">
                Funnel d&apos;engagement
              </h2>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={funnelData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8f0fb" />
                  <XAxis
                    type="number"
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: "#51627b", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    width={80}
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
                  <Bar dataKey="value" fill="#1f5eff" radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="value" position="right" style={{ fill: "#51627b", fontSize: 12 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Events Log */}
            <div className="hub-card overflow-hidden">
              <div className="border-b border-[#e8f0fb] px-6 py-4">
                <h2 className="text-sm font-semibold text-[#0b1c33]">
                  Événements récents
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#f0f4fb] text-xs text-[#94a3b8]">
                      <th className="px-6 py-3 text-left font-medium">Événement</th>
                      <th className="px-4 py-3 text-left font-medium">Catégorie</th>
                      <th className="px-4 py-3 text-left font-medium">Métadonnées</th>
                      <th className="px-4 py-3 text-right font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedEvents.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-sm text-[#94a3b8]">
                          Aucun événement
                        </td>
                      </tr>
                    )}
                    {paginatedEvents.map((e) => (
                      <tr
                        key={e.id}
                        className="border-b border-[#f7faff] transition hover:bg-[#f7fbff]"
                      >
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            <span>{CATEGORY_ICONS[e.event_category] ?? "•"}</span>
                            <span className="font-medium text-[#0b1c33]">
                              {EVENT_LABELS[e.event_type] ?? e.event_type}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[#51627b]">
                          {e.event_category}
                        </td>
                        <td className="max-w-xs truncate px-4 py-3 font-mono text-xs text-[#94a3b8]">
                          {Object.keys(e.metadata).length > 0
                            ? JSON.stringify(e.metadata)
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-[#94a3b8]">
                          {relativeTime(e.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-[#e8f0fb] px-6 py-3">
                  <span className="text-xs text-[#94a3b8]">
                    Page {page + 1} / {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="rounded-lg border border-[#d8e4f8] bg-[#f7fbff] px-3 py-1 text-xs font-medium text-[#35588a] transition hover:border-[#1f5eff] hover:text-[#1f5eff] disabled:opacity-40"
                    >
                      Précédent
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                      className="rounded-lg border border-[#d8e4f8] bg-[#f7fbff] px-3 py-1 text-xs font-medium text-[#35588a] transition hover:border-[#1f5eff] hover:text-[#1f5eff] disabled:opacity-40"
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
