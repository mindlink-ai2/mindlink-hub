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

async function fetchAllClientRows(
  supabase: ReturnType<typeof createClient>,
  table: string,
  selectFields: string,
  clientId: number | string,
  options?: {
    orderBy?: string;
    ascending?: boolean;
    applyFilters?: <T>(query: T) => T;
  }
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let from = 0;

  while (true) {
    const to = from + SUPABASE_PAGE_SIZE - 1;
    let query = supabase.from(table).select(selectFields).eq("client_id", clientId);

    if (options?.applyFilters) query = options.applyFilters(query);
    if (options?.orderBy) {
      query = query.order(options.orderBy, { ascending: options.ascending ?? true });
    }

    const { data, error } = await query.range(from, to);
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

  // 1️⃣ Récup client_id
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("clerk_user_id", userId)
    .single();

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const clientId = client.id;

  // 2️⃣ Dates
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const weekAgo = new Date();
  weekAgo.setDate(todayStart.getDate() - 7);

  const now = new Date();

  // 3️⃣ Leads + Maps leads + next_followup_at
  let leads: LeadMetricsRow[] = [];
  let maps: LeadMetricsRow[] = [];
  let inboxThreads: InboxThreadRow[] = [];
  let inboundMessages: InboundMessageRow[] = [];
  let invitations: InvitationMetricsRow[] = [];

  try {
    const [leadsRows, mapsRows, inboxThreadRows, inboundMessageRows, invitationRows] =
      await Promise.all([
        fetchAllClientRows(supabase, "leads", "created_at, traite, next_followup_at", clientId, {
          orderBy: "created_at",
          ascending: false,
        }),
        fetchAllClientRows(
          supabase,
          "map_leads",
          "created_at, traite, next_followup_at",
          clientId,
          { orderBy: "created_at", ascending: false }
        ),
        fetchAllClientRows(supabase, "inbox_threads", "id, last_message_at, unread_count", clientId, {
          orderBy: "id",
          ascending: true,
        }),
        fetchAllClientRows(supabase, "inbox_messages", "thread_db_id", clientId, {
          orderBy: "id",
          ascending: true,
          applyFilters: (query) => query.eq("direction", "inbound"),
        }),
        fetchAllClientRows(supabase, "linkedin_invitations", "id, lead_id, status", clientId, {
          orderBy: "id",
          ascending: true,
          applyFilters: (query) =>
            query.in("status", ["pending", "sent", "accepted", "connected"]),
        }),
      ]);

    leads = leadsRows as LeadMetricsRow[];
    maps = mapsRows as LeadMetricsRow[];
    inboxThreads = inboxThreadRows as InboxThreadRow[];
    inboundMessages = inboundMessageRows as InboundMessageRow[];
    invitations = invitationRows as InvitationMetricsRow[];
  } catch (statsErr) {
    console.error("Failed to load dashboard stats:", statsErr);
    return NextResponse.json({ error: "Failed to load dashboard stats" }, { status: 500 });
  }

  const all = [...leads, ...maps];

  const leadsToday = all.filter(
    (l) => new Date(l.created_at) >= todayStart
  ).length;

  const leadsWeek = all.filter(
    (l) => new Date(l.created_at) >= weekAgo
  ).length;

  const total = all.length;
  const treated = all.filter((l) => l.traite === true).length;

  const traitementRate =
    total === 0 ? 0 : Math.round((treated / total) * 100);

  // ----------------------------------------------------------------------
  // 4️⃣ RELANCES : à venir + en retard
  // ----------------------------------------------------------------------

  const relances = all.filter((l) => l.next_followup_at != null);

  const relancesCount = relances.filter(
    (l) => new Date(l.next_followup_at) >= now
  ).length;

  const relancesLate = relances.filter(
    (l) => new Date(l.next_followup_at) < now
  ).length;

  // ----------------------------------------------------------------------
  // 5️⃣ MESSAGERIE
  // ----------------------------------------------------------------------

  const threadRows = inboxThreads;
  const totalThreads = threadRows.length;

  const unreadMessages = threadRows.reduce((acc, row) => {
    const unreadCount = Number(row?.unread_count ?? 0);
    return acc + (Number.isFinite(unreadCount) && unreadCount > 0 ? unreadCount : 0);
  }, 0);

  const activeThreshold = new Date(now);
  activeThreshold.setDate(activeThreshold.getDate() - 30);

  const activeConversations = threadRows.filter((row) => {
    if (!row?.last_message_at) return false;
    const parsed = new Date(row.last_message_at);
    return !Number.isNaN(parsed.getTime()) && parsed >= activeThreshold;
  }).length;

  const inboundRows = inboundMessages;
  const threadsWithInbound = new Set(
    inboundRows
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
