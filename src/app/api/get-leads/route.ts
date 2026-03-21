import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import {
  applyDerivedProspectionStateToLead,
  deriveProspectionStateFromInvitations,
  getProspectionStatusKey,
  type ProspectionInvitationRow,
  type ProspectionStatusKey,
} from "@/lib/prospection-status";

const SUPABASE_PAGE_SIZE = 1000;
const ID_CHUNK_SIZE = 400;
const PAGINATED_PAGE_SIZES = new Set([10, 25, 50]);
const LINKEDIN_ACTIVE_STATUSES = [
  "queued",
  "pending",
  "sent",
  "accepted",
  "connected",
] as const;

type LeadRow = Record<string, unknown> & {
  id?: number | string | null;
  Name?: string | null;
  FirstName?: string | null;
  LastName?: string | null;
  Company?: string | null;
  linkedinJobTitle?: string | null;
  LinkedInURL?: string | null;
  location?: string | null;
  created_at?: string | null;
  email?: string | null;
  phone?: string | null;
  traite?: boolean | null;
  message_sent?: boolean | null;
  message_sent_at?: string | null;
};

type InvitationRow = {
  id?: number | string | null;
  lead_id?: number | string | null;
  status?: string | null;
  sent_at?: string | null;
  accepted_at?: string | null;
  dm_sent_at?: string | null;
  dm_draft_status?: string | null;
};

type ClientRow = {
  id: string | number;
  plan?: string | null;
  subscription_status?: string | null;
  email_option?: boolean | null;
  phone_option?: boolean | null;
};

type ClientPayload = {
  id: string | number;
  plan: "full" | "essential";
  subscription_status: string;
  is_full: boolean;
  is_full_active: boolean;
  is_premium: boolean;
  email_option: boolean;
  phone_option: boolean;
};

type LeadsExactFilters = {
  search: string;
  contacts: Array<"email" | "phone">;
  datePreset: "all" | "7d" | "30d" | "90d" | "custom";
  customDate: string | null;
};

type PaginatedFilters = LeadsExactFilters & {
  segment: "all" | ProspectionStatusKey;
  page: number;
  pageSize: number;
};

function createServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function normalizePlan(plan: unknown): "full" | "essential" {
  return String(plan ?? "").trim().toLowerCase() === "full" ? "full" : "essential";
}

function buildClientPayload(client: ClientRow): ClientPayload {
  const plan = normalizePlan(client.plan);
  const subscriptionStatus = String(client.subscription_status ?? "")
    .trim()
    .toLowerCase();
  const isFull = plan === "full";

  return {
    id: client.id,
    plan,
    subscription_status: subscriptionStatus,
    is_full: isFull,
    is_full_active: isFull && subscriptionStatus === "active",
    is_premium: isFull,
    email_option: Boolean(client.email_option),
    phone_option: Boolean(client.phone_option),
  };
}

async function getAuthenticatedClient() {
  const { userId } = await auth();
  if (!userId) return null;

  const supabase = createServiceSupabase();
  const { data: client } = await supabase
    .from("clients")
    .select("id, plan, subscription_status, email_option, phone_option")
    .eq("clerk_user_id", userId)
    .single<ClientRow>();

  if (!client) return null;

  return {
    supabase,
    client,
    clientPayload: buildClientPayload(client),
  };
}

function appendContactFields(selectFields: string, clientPayload: ClientPayload): string {
  let next = selectFields;

  if (clientPayload.email_option) next += ", email";
  if (clientPayload.phone_option) next += ", phone";

  return next;
}

function getStartDateForPreset(preset: LeadsExactFilters["datePreset"]): Date | null {
  if (preset === "all" || preset === "custom") return null;

  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - days);
  return threshold;
}

type DateFilterQuery<TSelf> = {
  gte: (column: string, value: string) => TSelf;
  lte: (column: string, value: string) => TSelf;
};

function applyDateFilterToQuery<TQuery extends DateFilterQuery<TQuery>>(
  query: TQuery,
  preset: LeadsExactFilters["datePreset"],
  customDate: string | null
): TQuery {
  if (preset === "all") return query;

  if (preset === "custom") {
    if (!customDate) return query;
    const endDate = new Date(`${customDate}T23:59:59.999`);
    if (Number.isNaN(endDate.getTime())) return query;
    return query.lte("created_at", endDate.toISOString());
  }

  const threshold = getStartDateForPreset(preset);
  if (!threshold) return query;
  return query.gte("created_at", threshold.toISOString());
}

async function fetchAllLeadsForClient(params: {
  supabase: ReturnType<typeof createServiceSupabase>;
  clientId: string | number;
  selectFields: string;
  datePreset?: LeadsExactFilters["datePreset"];
  customDate?: string | null;
}): Promise<LeadRow[]> {
  const rows: LeadRow[] = [];
  let from = 0;

  while (true) {
    const to = from + SUPABASE_PAGE_SIZE - 1;
    let query = params.supabase
      .from("leads")
      .select(params.selectFields)
      .eq("client_id", params.clientId)
      .order("created_at", { ascending: false });

    query = applyDateFilterToQuery(
      query,
      params.datePreset ?? "all",
      params.customDate ?? null
    );

    const { data, error } = await query.range(from, to);
    if (error) throw error;

    const batch: LeadRow[] = Array.isArray(data)
      ? (data as unknown as LeadRow[])
      : [];
    rows.push(...batch);

    if (batch.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }

  return rows;
}

async function fetchLeadRowsByIds(params: {
  supabase: ReturnType<typeof createServiceSupabase>;
  clientId: string | number;
  selectFields: string;
  ids: Array<string | number>;
}): Promise<LeadRow[]> {
  if (params.ids.length === 0) return [];

  const rows: LeadRow[] = [];

  for (let index = 0; index < params.ids.length; index += ID_CHUNK_SIZE) {
    const batchIds = params.ids.slice(index, index + ID_CHUNK_SIZE);
    const { data, error } = await params.supabase
      .from("leads")
      .select(params.selectFields)
      .eq("client_id", params.clientId)
      .in("id", batchIds);

    if (error) throw error;
    if (Array.isArray(data)) rows.push(...(data as unknown as LeadRow[]));
  }

  return rows;
}

async function fetchInvitationRowsForLeadIds(params: {
  supabase: ReturnType<typeof createServiceSupabase>;
  clientId: string | number;
  leadIds: Array<string | number>;
}): Promise<InvitationRow[]> {
  if (params.leadIds.length === 0) return [];

  const rows: InvitationRow[] = [];

  for (let batchIndex = 0; batchIndex < params.leadIds.length; batchIndex += ID_CHUNK_SIZE) {
    const batchLeadIds = params.leadIds.slice(batchIndex, batchIndex + ID_CHUNK_SIZE);
    let from = 0;

    while (true) {
      const to = from + SUPABASE_PAGE_SIZE - 1;
      const { data, error } = await params.supabase
        .from("linkedin_invitations")
        .select("id, lead_id, status, sent_at, accepted_at, dm_sent_at, dm_draft_status")
        .eq("client_id", params.clientId)
        .in("lead_id", batchLeadIds)
        .in("status", [...LINKEDIN_ACTIVE_STATUSES])
        .order("id", { ascending: true })
        .range(from, to);

      if (error) throw error;

      const batch: InvitationRow[] = Array.isArray(data)
        ? (data as unknown as InvitationRow[])
        : [];
      rows.push(...batch);

      if (batch.length < SUPABASE_PAGE_SIZE) break;
      from += SUPABASE_PAGE_SIZE;
    }
  }

  return rows;
}

function matchesSearch(lead: LeadRow, term: string): boolean {
  const value = term.trim().toLowerCase();
  if (!value) return true;

  const name = `${lead.FirstName ?? ""} ${lead.LastName ?? ""}`.toLowerCase();
  return (
    name.includes(value) ||
    String(lead.Name ?? "").toLowerCase().includes(value) ||
    String(lead.Company ?? "").toLowerCase().includes(value) ||
    String(lead.location ?? "").toLowerCase().includes(value) ||
    String(lead.linkedinJobTitle ?? "").toLowerCase().includes(value) ||
    String(lead.email ?? "").toLowerCase().includes(value) ||
    String(lead.phone ?? "").toLowerCase().includes(value)
  );
}

function matchesContactFilters(
  lead: Pick<LeadRow, "email" | "phone">,
  contacts: Array<"email" | "phone">
): boolean {
  if (contacts.length === 0) return true;

  const hasEmail = Boolean(String(lead.email ?? "").trim());
  const hasPhone = Boolean(String(lead.phone ?? "").trim());
  const matchesEmail = contacts.includes("email") && hasEmail;
  const matchesPhone = contacts.includes("phone") && hasPhone;

  return matchesEmail || matchesPhone;
}

function matchesDatePreset(
  createdAt: string | null | undefined,
  preset: LeadsExactFilters["datePreset"],
  customDate: string | null
): boolean {
  if (preset === "all") return true;
  if (!createdAt) return false;

  const createdDate = new Date(createdAt);
  if (Number.isNaN(createdDate.getTime())) return false;

  if (preset === "custom") {
    if (!customDate) return true;
    const endDate = new Date(`${customDate}T23:59:59.999`);
    if (Number.isNaN(endDate.getTime())) return true;
    return createdDate <= endDate;
  }

  const threshold = getStartDateForPreset(preset);
  if (!threshold) return true;
  return createdDate >= threshold;
}

function applyExactFilters(leads: LeadRow[], filters: LeadsExactFilters): LeadRow[] {
  return leads.filter((lead) => {
    if (!matchesSearch(lead, filters.search)) return false;
    if (!matchesContactFilters(lead, filters.contacts)) return false;
    if (!matchesDatePreset(lead.created_at, filters.datePreset, filters.customDate)) return false;
    return true;
  });
}

function buildDecoratedLeadMaps(params: {
  leads: LeadRow[];
  invitations: InvitationRow[];
  plan: ClientPayload["plan"];
}) {
  const invitationRowsByLeadId = new Map<string, ProspectionInvitationRow[]>();
  const invitationStatusByLeadId = new Map<string, "sent" | "accepted">();

  params.invitations.forEach((invitation) => {
    const leadId = invitation.lead_id;
    if (leadId === null || leadId === undefined) return;

    const leadKey = String(leadId);
    const existing = invitationRowsByLeadId.get(leadKey);
    if (existing) existing.push(invitation);
    else invitationRowsByLeadId.set(leadKey, [invitation]);

    const normalizedStatus = String(invitation.status ?? "").trim().toLowerCase();
    if (
      normalizedStatus !== "queued" &&
      normalizedStatus !== "sent" &&
      normalizedStatus !== "accepted" &&
      normalizedStatus !== "connected"
    ) {
      return;
    }

    const mappedStatus =
      normalizedStatus === "connected"
        ? "accepted"
        : normalizedStatus === "queued"
          ? "sent"
          : (normalizedStatus as "sent" | "accepted");

    const current = invitationStatusByLeadId.get(leadKey);
    if (mappedStatus === "accepted" || !current) {
      invitationStatusByLeadId.set(leadKey, mappedStatus);
    }
  });

  const decoratedLeads = params.leads.map((lead) => {
    const leadId = String(lead.id);

    if (params.plan === "full") {
      const derivedState = deriveProspectionStateFromInvitations({
        invitations: invitationRowsByLeadId.get(leadId) ?? [],
        fallbackLead: {
          traite: lead.traite === true,
          message_sent: lead.message_sent === true,
          message_sent_at:
            typeof lead.message_sent_at === "string" ? lead.message_sent_at : null,
        },
      });

      return applyDerivedProspectionStateToLead(lead, derivedState);
    }

    return {
      ...lead,
      linkedin_invitation_status: invitationStatusByLeadId.get(leadId) ?? null,
      linkedin_invitation_sent: invitationStatusByLeadId.has(leadId),
    };
  });

  return {
    leads: decoratedLeads,
    byId: new Map(decoratedLeads.map((lead) => [String(lead.id), lead])),
  };
}

function getSegmentCounts(
  leads: Array<
    LeadRow & {
      linkedin_invitation_status?: "sent" | "accepted" | null;
      linkedin_invitation_sent?: boolean | null;
    }
  >
) {
  const counts = {
    all: leads.length,
    todo: 0,
    pending: 0,
    connected: 0,
    sent: 0,
  };

  leads.forEach((lead) => {
    const key = getProspectionStatusKey(lead);
    counts[key] += 1;
  });

  return counts;
}

function getSummaryStats(
  leads: Array<
    LeadRow & {
      linkedin_invitation_status?: "sent" | "accepted" | null;
      linkedin_invitation_sent?: boolean | null;
    }
  >
) {
  let treated = 0;
  let pending = 0;
  let connected = 0;
  let sent = 0;

  leads.forEach((lead) => {
    if (lead.traite === true) treated += 1;

    const status = getProspectionStatusKey(lead);
    if (status === "pending") pending += 1;
    if (status === "connected") connected += 1;
    if (status === "sent") sent += 1;
  });

  return {
    total: leads.length,
    treated,
    pending,
    connected,
    sent,
    remainingToTreat: Math.max(leads.length - treated, 0),
  };
}

function parseContacts(searchParams: URLSearchParams): Array<"email" | "phone"> {
  const raw = searchParams.get("contacts");
  if (!raw) return [];

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(
      (item): item is "email" | "phone" => item === "email" || item === "phone"
    );
}

function parseDatePreset(
  value: string | null
): LeadsExactFilters["datePreset"] {
  if (value === "7d" || value === "30d" || value === "90d" || value === "custom") {
    return value;
  }
  return "all";
}

function parseSegment(
  value: string | null
): PaginatedFilters["segment"] {
  if (value === "todo" || value === "pending" || value === "connected" || value === "sent") {
    return value;
  }
  return "all";
}

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

function parsePageSize(value: string | null): number {
  const parsed = parsePositiveInt(value, 25);
  return PAGINATED_PAGE_SIZES.has(parsed) ? parsed : 25;
}

function parsePaginatedFilters(searchParams: URLSearchParams): PaginatedFilters {
  return {
    search: String(searchParams.get("search") ?? ""),
    segment: parseSegment(searchParams.get("segment")),
    contacts: parseContacts(searchParams),
    datePreset: parseDatePreset(searchParams.get("datePreset")),
    customDate: searchParams.get("customDate"),
    page: parsePositiveInt(searchParams.get("page"), 1),
    pageSize: parsePageSize(searchParams.get("pageSize")),
  };
}

function buildEmptyDefaultResponse() {
  return NextResponse.json({ leads: [] });
}

export async function GET(request: NextRequest) {
  const authResult = await getAuthenticatedClient();
  if (!authResult) return buildEmptyDefaultResponse();

  const { supabase, client, clientPayload } = authResult;
  const mode = String(request.nextUrl.searchParams.get("mode") ?? "").trim().toLowerCase();

  if (mode === "summary") {
    try {
      const selectFields = appendContactFields(
        "id, created_at, traite, message_sent, message_sent_at",
        clientPayload
      );
      const leadRows = await fetchAllLeadsForClient({
        supabase,
        clientId: client.id,
        selectFields,
      });
      const invitations = await fetchInvitationRowsForLeadIds({
        supabase,
        clientId: client.id,
        leadIds: leadRows
          .map((lead) => lead.id)
          .filter((leadId): leadId is string | number => leadId !== null && leadId !== undefined),
      });
      const decorated = buildDecoratedLeadMaps({
        leads: leadRows,
        invitations,
        plan: clientPayload.plan,
      });

      return NextResponse.json({
        stats: getSummaryStats(decorated.leads),
        client: clientPayload,
      });
    } catch (error) {
      console.error("Failed to load leads summary:", error);
      return NextResponse.json(
        { error: "Failed to load leads summary" },
        { status: 500 }
      );
    }
  }

  if (mode === "lead") {
    const leadIdParam = request.nextUrl.searchParams.get("leadId");
    const parsedLeadId = Number(leadIdParam);
    if (!Number.isFinite(parsedLeadId)) {
      return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
    }

    try {
      const selectFields = appendContactFields(
        [
          "id",
          "Name",
          "FirstName",
          "LastName",
          "Company",
          "linkedinJobTitle",
          "LinkedInURL",
          "location",
          "created_at",
          "traite",
          "internal_message",
          "message_mail",
          "relance_linkedin",
          "message_sent",
          "message_sent_at",
          "next_followup_at",
          "website",
        ].join(", "),
        clientPayload
      );

      const { data: leadRow, error } = await supabase
        .from("leads")
        .select(selectFields)
        .eq("client_id", client.id)
        .eq("id", parsedLeadId)
        .maybeSingle<LeadRow>();

      if (error) throw error;
      if (!leadRow) {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      }

      const invitations = await fetchInvitationRowsForLeadIds({
        supabase,
        clientId: client.id,
        leadIds: [parsedLeadId],
      });
      const decorated = buildDecoratedLeadMaps({
        leads: [leadRow],
        invitations,
        plan: clientPayload.plan,
      });

      return NextResponse.json({
        lead: decorated.leads[0] ?? leadRow,
        client: clientPayload,
      });
    } catch (error) {
      console.error("Failed to load lead details:", error);
      return NextResponse.json({ error: "Failed to load lead details" }, { status: 500 });
    }
  }

  if (mode === "paginated") {
    const filters = parsePaginatedFilters(request.nextUrl.searchParams);

    try {
      const scopeSelectFields = appendContactFields(
        [
          "id",
          "Name",
          "FirstName",
          "LastName",
          "Company",
          "linkedinJobTitle",
          "LinkedInURL",
          "location",
          "created_at",
          "traite",
          "message_sent",
          "message_sent_at",
        ].join(", "),
        clientPayload
      );

      const scopeLeadRows = await fetchAllLeadsForClient({
        supabase,
        clientId: client.id,
        selectFields: scopeSelectFields,
        datePreset: filters.datePreset,
        customDate: filters.customDate,
      });

      const exactFilteredScopeRows = applyExactFilters(scopeLeadRows, filters);
      const scopeLeadIds = exactFilteredScopeRows
        .map((lead) => lead.id)
        .filter((leadId): leadId is string | number => leadId !== null && leadId !== undefined);
      const invitations = await fetchInvitationRowsForLeadIds({
        supabase,
        clientId: client.id,
        leadIds: scopeLeadIds,
      });
      const decoratedScope = buildDecoratedLeadMaps({
        leads: exactFilteredScopeRows,
        invitations,
        plan: clientPayload.plan,
      });

      const counts = getSegmentCounts(decoratedScope.leads);
      const segmentedRows =
        filters.segment === "all"
          ? decoratedScope.leads
          : decoratedScope.leads.filter(
              (lead) => getProspectionStatusKey(lead) === filters.segment
            );

      const total = segmentedRows.length;
      const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
      const currentPage = Math.min(filters.page, totalPages);
      const startIndex = (currentPage - 1) * filters.pageSize;
      const pageLeadIds = segmentedRows
        .slice(startIndex, startIndex + filters.pageSize)
        .map((lead) => lead.id)
        .filter((leadId): leadId is string | number => leadId !== null && leadId !== undefined);

      const pageSelectFields = appendContactFields(
        [
          "id",
          "Name",
          "FirstName",
          "LastName",
          "Company",
          "linkedinJobTitle",
          "LinkedInURL",
          "location",
          "created_at",
          "traite",
          "internal_message",
          "message_sent",
          "message_sent_at",
        ].join(", "),
        clientPayload
      );
      const pageRows = await fetchLeadRowsByIds({
        supabase,
        clientId: client.id,
        selectFields: pageSelectFields,
        ids: pageLeadIds,
      });
      const pageRowsById = new Map(pageRows.map((lead) => [String(lead.id), lead]));

      const leads = pageLeadIds
        .map((leadId) => {
          const rawLead = pageRowsById.get(String(leadId));
          const decoratedLead = decoratedScope.byId.get(String(leadId));
          if (!rawLead && !decoratedLead) return null;
          if (!rawLead) return decoratedLead ?? null;
          if (!decoratedLead) return rawLead;
          return {
            ...rawLead,
            traite: decoratedLead.traite,
            message_sent: decoratedLead.message_sent,
            message_sent_at: decoratedLead.message_sent_at,
            linkedin_invitation_status: decoratedLead.linkedin_invitation_status ?? null,
            linkedin_invitation_sent: decoratedLead.linkedin_invitation_sent ?? false,
          };
        })
        .filter((lead): lead is NonNullable<typeof lead> => lead !== null);

      return NextResponse.json({
        leads,
        counts,
        pagination: {
          page: currentPage,
          pageSize: filters.pageSize,
          total,
          totalPages,
        },
        client: clientPayload,
      });
    } catch (error) {
      console.error("Failed to load paginated leads:", error);
      return NextResponse.json(
        { error: "Failed to load paginated leads" },
        { status: 500 }
      );
    }
  }

  const baseSelect = `
      id,
      Name,
      FirstName,
      LastName,
      Company,
      linkedinJobTitle,
      LinkedInURL,
      location,
      created_at,
      traite,
      internal_message,
      message_mail,
      relance_linkedin,
      message_sent,
      message_sent_at,
      next_followup_at
  `;

  const selectFields = appendContactFields(baseSelect, clientPayload);

  let leadRows: LeadRow[] = [];
  try {
    leadRows = await fetchAllLeadsForClient({
      supabase,
      clientId: client.id,
      selectFields,
    });
  } catch (error) {
    console.error("Failed to load leads:", error);
    return NextResponse.json({ error: "Failed to load leads" }, { status: 500 });
  }

  try {
    const invitations = await fetchInvitationRowsForLeadIds({
      supabase,
      clientId: client.id,
      leadIds: leadRows
        .map((lead) => lead.id)
        .filter((leadId): leadId is string | number => leadId !== null && leadId !== undefined),
    });
    const decorated = buildDecoratedLeadMaps({
      leads: leadRows,
      invitations,
      plan: clientPayload.plan,
    });

    return NextResponse.json({
      leads: decorated.leads,
      client: clientPayload,
    });
  } catch (error) {
    console.error("Failed to load linkedin invitations:", error);
    return NextResponse.json({
      leads: leadRows,
      client: clientPayload,
    });
  }
}
