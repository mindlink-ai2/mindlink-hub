import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_PAGE_SIZE = 1000;

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

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("clerk_user_id", userId)
    .single();

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const clientId = client.id;

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
      fetchPagedRows<InvitationMetricsRow>(async (from, to) => {
        const { data, error } = await supabase
          .from("linkedin_invitations")
          .select("id, lead_id, status")
          .eq("client_id", clientId)
          .in("status", ["pending", "sent", "accepted", "connected"])
          .order("id", { ascending: true })
          .range(from, to);
        return { data: data as InvitationMetricsRow[] | null, error };
      }),
    ]);
  } catch (statsErr) {
    console.error("Failed to load dashboard stats:", statsErr);
    return NextResponse.json({ error: "Failed to load dashboard stats" }, { status: 500 });
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

  const totalThreads = inboxThreads.length;

  const unreadMessages = inboxThreads.reduce((acc, row) => {
    const unreadCount = Number(row?.unread_count ?? 0);
    return acc + (Number.isFinite(unreadCount) && unreadCount > 0 ? unreadCount : 0);
  }, 0);

  const activeThreshold = new Date(now);
  activeThreshold.setDate(activeThreshold.getDate() - 30);

  const activeConversations = inboxThreads.filter((row) => {
    const lastMessageAt = parseIsoDate(row.last_message_at);
    return lastMessageAt !== null && lastMessageAt >= activeThreshold;
  }).length;

  const threadsWithInbound = new Set(
    inboundMessages
      .map((row) => String(row?.thread_db_id ?? "").trim())
      .filter(Boolean)
  ).size;

  const responseRate =
    totalThreads === 0 ? 0 : Math.round((threadsWithInbound / totalThreads) * 100);

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
    activeConversations,
    pendingLinkedinInvitations,
    responseRate,
  });
}
