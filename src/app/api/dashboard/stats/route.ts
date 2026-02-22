import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_PAGE_SIZE = 1000;
const ROUTE_NAME = "GET /api/dashboard/stats";
const SAFE_STATS_ERROR_MESSAGE = "Impossible de charger les statistiques pour le moment.";

type LeadMetricsRow = {
  created_at?: string | null;
  traite?: boolean | null;
  next_followup_at?: string | null;
};

type InboxThreadRow = {
  id?: number | string | null;
  last_message_at?: string | null;
  unread_count?: number | string | null;
};

type InboundMessageRow = {
  thread_db_id?: number | string | null;
};

type InvitationMetricsRow = {
  id?: number | string | null;
  lead_id?: number | string | null;
  status?: string | null;
  sent_at?: string | null;
  accepted_at?: string | null;
  created_at?: string | null;
};

type PostgrestErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

type ApiErrorPayload = {
  error: string;
  message: string;
  details?: unknown;
};

function normalizeInvitationStatus(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

async function fetchPagedRows<TRow>(
  queryRunner: (from: number, to: number) => Promise<{ data: TRow[] | null; error: unknown }>
): Promise<TRow[]> {
  const rows: TRow[] = [];
  let from = 0;

  while (true) {
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await queryRunner(from, to);
    if (error) throw error;

    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);

    if (batch.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }

  return rows;
}

function isMissingColumnError(error: unknown, column: string): boolean {
  if (!error || typeof error !== "object") return false;
  const pgErr = error as PostgrestErrorLike;
  const code = String(pgErr.code ?? "");
  const message = `${pgErr.message ?? ""} ${pgErr.details ?? ""} ${pgErr.hint ?? ""}`.toLowerCase();
  const col = column.toLowerCase();
  return code === "42703" && message.includes(col);
}

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const pgErr = error as PostgrestErrorLike;
  return String(pgErr.code ?? "") === "42P01";
}

function toErrorDetails(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  if (error && typeof error === "object") {
    return error;
  }
  return { message: String(error) };
}

function buildErrorResponse(params: {
  status: number;
  code: string;
  message?: string;
  context?: Record<string, unknown>;
  error?: unknown;
}) {
  const { status, code, message = SAFE_STATS_ERROR_MESSAGE, context, error } = params;

  console.error("DASHBOARD_STATS_ERROR", {
    route: ROUTE_NAME,
    status,
    code,
    context: context ?? {},
    error: toErrorDetails(error),
  });

  const payload: ApiErrorPayload = {
    error: code,
    message,
  };

  if (process.env.NODE_ENV !== "production" && error) {
    payload.details = toErrorDetails(error);
  }

  return NextResponse.json(payload, { status });
}

async function fetchInvitationMetricsRows(
  supabase: SupabaseClient,
  clientId: number
): Promise<InvitationMetricsRow[]> {
  const selectCandidates = [
    "id, lead_id, status, sent_at, accepted_at, created_at",
    "id, lead_id, status, sent_at, created_at",
    "id, lead_id, status, created_at",
  ];

  let lastError: unknown = null;

  for (const selectFields of selectCandidates) {
    try {
      return await fetchPagedRows<InvitationMetricsRow>(async (from, to) => {
        const { data, error } = await supabase
          .from("linkedin_invitations")
          .select(selectFields)
          .eq("client_id", clientId)
          .in("status", ["pending", "sent", "accepted", "connected"])
          .order("id", { ascending: true })
          .range(from, to);
        return { data: data as InvitationMetricsRow[] | null, error };
      });
    } catch (error) {
      lastError = error;
      if (isMissingRelationError(error)) {
        return [];
      }
      if (isMissingColumnError(error, "accepted_at") || isMissingColumnError(error, "sent_at")) {
        continue;
      }
      throw error;
    }
  }

  if (lastError) throw lastError;
  return [];
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return buildErrorResponse({
      status: 401,
      code: "unauthorized",
      message: "Authentification requise.",
      context: { userId: null },
    });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return buildErrorResponse({
      status: 500,
      code: "missing_env",
      context: {
        userId,
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasServiceRoleKey: Boolean(serviceRoleKey),
      },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("id")
    .eq("clerk_user_id", userId)
    .single();

  if (clientErr) {
    return buildErrorResponse({
      status: 500,
      code: "client_lookup_failed",
      context: { userId },
      error: clientErr,
    });
  }

  if (!client?.id) {
    return buildErrorResponse({
      status: 404,
      code: "client_not_found",
      message: "Client introuvable.",
      context: { userId },
    });
  }

  const clientId = Number(client.id);
  if (!Number.isFinite(clientId)) {
    return buildErrorResponse({
      status: 500,
      code: "invalid_client_id",
      context: { userId, rawClientId: client.id },
    });
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const weekAgo = new Date(todayStart);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const now = new Date();

  let leads: LeadMetricsRow[] = [];
  let maps: LeadMetricsRow[] = [];
  let inboxThreads: InboxThreadRow[] = [];
  let inboundMessages: InboundMessageRow[] = [];
  let invitations: InvitationMetricsRow[] = [];

  try {
    [leads, maps, inboxThreads, inboundMessages, invitations] = await Promise.all([
      fetchPagedRows<LeadMetricsRow>(async (from, to) => {
        const { data, error } = await supabase
          .from("leads")
          .select("created_at, traite, next_followup_at")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .range(from, to);
        return { data: data as LeadMetricsRow[] | null, error };
      }),
      fetchPagedRows<LeadMetricsRow>(async (from, to) => {
        const { data, error } = await supabase
          .from("map_leads")
          .select("created_at, traite, next_followup_at")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .range(from, to);
        return { data: data as LeadMetricsRow[] | null, error };
      }),
      fetchPagedRows<InboxThreadRow>(async (from, to) => {
        const { data, error } = await supabase
          .from("inbox_threads")
          .select("id, last_message_at, unread_count")
          .eq("client_id", clientId)
          .order("id", { ascending: true })
          .range(from, to);
        return { data: data as InboxThreadRow[] | null, error };
      }),
      fetchPagedRows<InboundMessageRow>(async (from, to) => {
        const { data, error } = await supabase
          .from("inbox_messages")
          .select("thread_db_id")
          .eq("client_id", clientId)
          .eq("direction", "inbound")
          .order("id", { ascending: true })
          .range(from, to);
        return { data: data as InboundMessageRow[] | null, error };
      }),
      fetchInvitationMetricsRows(supabase, clientId),
    ]);
  } catch (statsErr) {
    return buildErrorResponse({
      status: 500,
      code: "stats_load_failed",
      context: { userId, clientId },
      error: statsErr,
    });
  }

  const all = [...leads, ...maps];

  const leadsToday = all.filter((row) => {
    const createdAt = parseIsoDate(row.created_at);
    return createdAt !== null && createdAt >= todayStart;
  }).length;

  const leadsWeek = all.filter((row) => {
    const createdAt = parseIsoDate(row.created_at);
    return createdAt !== null && createdAt >= weekAgo;
  }).length;

  const total = all.length;
  const treated = all.filter((row) => row.traite === true).length;

  const traitementRate = total === 0 ? 0 : Math.round((treated / total) * 100);

  const relancesCount = all.filter((row) => {
    const followupAt = parseIsoDate(row.next_followup_at);
    return followupAt !== null && followupAt >= now;
  }).length;

  const relancesLate = all.filter((row) => {
    const followupAt = parseIsoDate(row.next_followup_at);
    return followupAt !== null && followupAt < now;
  }).length;

  const unreadMessages = inboxThreads.reduce((acc, row) => {
    const unreadCount = Number(row?.unread_count ?? 0);
    return acc + (Number.isFinite(unreadCount) && unreadCount > 0 ? unreadCount : 0);
  }, 0);

  const activeThreshold = new Date(now);
  activeThreshold.setDate(activeThreshold.getDate() - 30);

  const trackedAcceptedInvitationByKey = new Map<string, Date | null>();

  invitations.forEach((row) => {
    const status = normalizeInvitationStatus(row?.status);
    if (status !== "accepted" && status !== "connected") return;

    // "Tracké Hub" : invitation envoyée depuis le Hub => sent_at présent.
    const sentAt = parseIsoDate(row?.sent_at);
    if (!sentAt) return;

    const key =
      row?.lead_id === null || row?.lead_id === undefined
        ? `row:${String(row?.id ?? "")}`
        : `lead:${String(row.lead_id)}`;
    if (!key) return;

    const acceptedAt = parseIsoDate(row?.accepted_at) ?? parseIsoDate(row?.created_at);
    const current = trackedAcceptedInvitationByKey.get(key);

    if (!current || (acceptedAt !== null && acceptedAt > current)) {
      trackedAcceptedInvitationByKey.set(key, acceptedAt);
    }
  });

  const acceptedConnections = trackedAcceptedInvitationByKey.size;
  const acceptedConnections30d = Array.from(trackedAcceptedInvitationByKey.values()).filter(
    (acceptedAt) => acceptedAt !== null && acceptedAt >= activeThreshold
  ).length;

  const inboundMessagesCount = inboundMessages.length;
  const responseRate =
    acceptedConnections === 0
      ? 0
      : Math.round((inboundMessagesCount / acceptedConnections) * 100);

  const invitationStatusByKey = new Map<string, "pending" | "connected">();

  invitations.forEach((row) => {
    const key =
      row?.lead_id === null || row?.lead_id === undefined
        ? `row:${String(row?.id ?? "")}`
        : `lead:${String(row.lead_id)}`;
    if (!key) return;

    const status = normalizeInvitationStatus(row?.status);
    let mapped: "pending" | "connected" | null = null;

    if (status === "accepted" || status === "connected") {
      mapped = "connected";
    } else if (status === "pending" || status === "sent") {
      mapped = "pending";
    }

    if (!mapped) return;

    const current = invitationStatusByKey.get(key);
    if (mapped === "connected" || !current) {
      invitationStatusByKey.set(key, mapped);
    }
  });

  const pendingLinkedinInvitations = Array.from(invitationStatusByKey.values()).filter(
    (status) => status === "pending"
  ).length;

  return NextResponse.json({
    leadsToday,
    leadsWeek,
    traitementRate,
    relancesCount,
    relancesLate,
    unreadMessages,
    acceptedConnections30d,
    pendingLinkedinInvitations,
    responseRate,
  });
}
