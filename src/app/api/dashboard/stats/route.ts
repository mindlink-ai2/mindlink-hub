import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

function normalizeInvitationStatus(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
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

  // 3️⃣ Leads + Maps leads + relances
  const [leads, maps, inboxThreads, inboundMessages, invitations] = await Promise.all([
    supabase
      .from("leads")
      .select("created_at, traite, next_followup_at")
      .eq("client_id", clientId),
    supabase
      .from("map_leads")
      .select("created_at, traite, next_followup_at")
      .eq("client_id", clientId),
    supabase
      .from("inbox_threads")
      .select("id, last_message_at, unread_count")
      .eq("client_id", clientId),
    supabase
      .from("inbox_messages")
      .select("thread_db_id")
      .eq("client_id", clientId)
      .eq("direction", "inbound"),
    supabase
      .from("linkedin_invitations")
      .select("id, lead_id, status")
      .eq("client_id", clientId)
      .in("status", ["pending", "sent", "accepted", "connected"]),
  ]);

  const all = [...(leads.data || []), ...(maps.data || [])];

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

  // 4️⃣ RELANCES : à venir + en retard

  const relances = all.filter((l) => l.next_followup_at != null);

  const relancesCount = relances.filter(
    (l) => new Date(l.next_followup_at) >= now
  ).length;

  const relancesLate = relances.filter(
    (l) => new Date(l.next_followup_at) < now
  ).length;

  // 5️⃣ MESSAGERIE
  const threadRows = Array.isArray(inboxThreads.data) ? inboxThreads.data : [];
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

  const inboundRows = Array.isArray(inboundMessages.data) ? inboundMessages.data : [];
  const threadsWithInbound = new Set(
    inboundRows
      .map((row) => String(row?.thread_db_id ?? "").trim())
      .filter(Boolean)
  ).size;

  const responseRate = totalThreads === 0 ? 0 : Math.round((threadsWithInbound / totalThreads) * 100);

  const invitationRows = Array.isArray(invitations.data) ? invitations.data : [];
  const invitationStatusByKey = new Map<string, "pending" | "connected">();

  invitationRows.forEach((row) => {
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
