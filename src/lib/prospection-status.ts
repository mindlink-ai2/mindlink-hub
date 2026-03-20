export type ProspectionStatusKey = "todo" | "pending" | "connected" | "sent";

export type ProspectionInvitationStatus = "sent" | "accepted" | null;

export type ProspectionLeadState = {
  traite?: boolean | null;
  message_sent?: boolean | null;
  message_sent_at?: string | null;
  linkedin_invitation_status?: ProspectionInvitationStatus;
  linkedin_invitation_sent?: boolean | null;
};

export type ProspectionInvitationRow = {
  id?: string | number | null;
  status?: string | null;
  sent_at?: string | null;
  accepted_at?: string | null;
  dm_sent_at?: string | null;
  dm_draft_status?: string | null;
};

export type DerivedProspectionState = {
  status: ProspectionStatusKey;
  traite: boolean;
  message_sent: boolean;
  message_sent_at: string | null;
  linkedin_invitation_status: ProspectionInvitationStatus;
  linkedin_invitation_sent: boolean;
};

export type AppliedProspectionLeadState = Omit<DerivedProspectionState, "status">;

type InvitationCandidate = DerivedProspectionState & {
  rank: number;
  relevantTimestampMs: number;
  tieBreakerId: string;
};

const STATUS_RANK: Record<ProspectionStatusKey, number> = {
  todo: 0,
  pending: 1,
  connected: 2,
  sent: 3,
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeIso(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseIsoMs(value: string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function compareCandidatePriority(a: InvitationCandidate, b: InvitationCandidate): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  if (a.relevantTimestampMs !== b.relevantTimestampMs) {
    return a.relevantTimestampMs - b.relevantTimestampMs;
  }
  return a.tieBreakerId.localeCompare(b.tieBreakerId);
}

export function getProspectionInvitationState(
  lead: Pick<ProspectionLeadState, "linkedin_invitation_status" | "linkedin_invitation_sent">
): ProspectionInvitationStatus {
  if (lead.linkedin_invitation_status === "accepted") return "accepted";
  if (lead.linkedin_invitation_status === "sent") return "sent";
  if (lead.linkedin_invitation_sent) return "sent";
  return null;
}

export function getProspectionStatusKey(
  lead: Pick<
    ProspectionLeadState,
    "traite" | "message_sent" | "linkedin_invitation_status" | "linkedin_invitation_sent"
  >
): ProspectionStatusKey {
  if (lead.message_sent) return "sent";
  if (getProspectionInvitationState(lead) === "accepted") return "connected";
  if (lead.traite) return "pending";
  return "todo";
}

export function getProspectionStatusLabel(status: ProspectionStatusKey): string {
  if (status === "sent") return "Envoye";
  if (status === "connected") return "Connecte";
  if (status === "pending") return "En attente";
  return "A faire";
}

export function getProspectionStatusClasses(
  status: ProspectionStatusKey,
  variant: "table" | "card" | "compact" | "sidebar"
): string {
  if (status === "sent") {
    if (variant === "table" || variant === "sidebar") {
      return "border-violet-200 bg-violet-50 text-violet-700";
    }
    return "border-violet-200 bg-violet-50 text-violet-700";
  }

  if (status === "connected") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "pending") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (variant === "table") {
    return "border-[#9cc0ff] bg-[#f2f7ff] text-[#1f4f96]";
  }

  if (variant === "card") {
    return "border-[#c8d6ea] bg-[#f4f8ff] text-[#34527a]";
  }

  if (variant === "sidebar") {
    return "border-[#dbe5f3] bg-[#f8fbff] text-[#64748b]";
  }

  return "border-[#d7e3f4] bg-[#f5f9ff] text-[#4b647f]";
}

export function getProspectionStatusDotClass(status: ProspectionStatusKey): string {
  if (status === "sent") return "bg-violet-500";
  if (status === "connected") return "bg-emerald-500";
  if (status === "pending") return "bg-amber-500";
  return "bg-[#6f85a6]";
}

function buildDerivedState(status: ProspectionStatusKey, messageSentAt: string | null): DerivedProspectionState {
  if (status === "sent") {
    return {
      status,
      traite: true,
      message_sent: true,
      message_sent_at: messageSentAt,
      linkedin_invitation_status: "accepted",
      linkedin_invitation_sent: true,
    };
  }

  if (status === "connected") {
    return {
      status,
      traite: true,
      message_sent: false,
      message_sent_at: null,
      linkedin_invitation_status: "accepted",
      linkedin_invitation_sent: true,
    };
  }

  if (status === "pending") {
    return {
      status,
      traite: true,
      message_sent: false,
      message_sent_at: null,
      linkedin_invitation_status: "sent",
      linkedin_invitation_sent: true,
    };
  }

  return {
    status,
    traite: false,
    message_sent: false,
    message_sent_at: null,
    linkedin_invitation_status: null,
    linkedin_invitation_sent: false,
  };
}

function buildInvitationCandidate(row: ProspectionInvitationRow): InvitationCandidate | null {
  const normalizedStatus = normalizeString(row.status);
  const dmDraftStatus = normalizeString(row.dm_draft_status);
  const dmSentAt = normalizeIso(row.dm_sent_at);
  const acceptedAt = normalizeIso(row.accepted_at);
  const sentAt = normalizeIso(row.sent_at);
  const tieBreakerId = String(row.id ?? "");

  if (dmSentAt || dmDraftStatus === "sent") {
    const relevantAt = dmSentAt ?? acceptedAt ?? sentAt;
    return {
      ...buildDerivedState("sent", dmSentAt ?? acceptedAt ?? sentAt),
      rank: STATUS_RANK.sent,
      relevantTimestampMs: parseIsoMs(relevantAt),
      tieBreakerId,
    };
  }

  if (acceptedAt || normalizedStatus === "accepted" || normalizedStatus === "connected") {
    const relevantAt = acceptedAt ?? sentAt;
    return {
      ...buildDerivedState("connected", null),
      rank: STATUS_RANK.connected,
      relevantTimestampMs: parseIsoMs(relevantAt),
      tieBreakerId,
    };
  }

  if (
    sentAt ||
    normalizedStatus === "queued" ||
    normalizedStatus === "pending" ||
    normalizedStatus === "sent"
  ) {
    return {
      ...buildDerivedState("pending", null),
      rank: STATUS_RANK.pending,
      relevantTimestampMs: parseIsoMs(sentAt),
      tieBreakerId,
    };
  }

  return null;
}

function buildLeadFallbackCandidate(lead: ProspectionLeadState | null | undefined): InvitationCandidate {
  const status = getProspectionStatusKey(lead ?? {});
  const messageSentAt = normalizeIso(lead?.message_sent_at);

  return {
    ...buildDerivedState(status, messageSentAt),
    rank: STATUS_RANK[status],
    relevantTimestampMs: parseIsoMs(messageSentAt),
    tieBreakerId: "lead_fallback",
  };
}

export function deriveProspectionStateFromInvitations(params: {
  invitations?: ProspectionInvitationRow[] | null;
  fallbackLead?: ProspectionLeadState | null;
}): DerivedProspectionState {
  const invitationRows = Array.isArray(params.invitations) ? params.invitations : [];

  let bestCandidate = buildLeadFallbackCandidate(params.fallbackLead);

  for (const invitation of invitationRows) {
    const candidate = buildInvitationCandidate(invitation);
    if (!candidate) continue;

    if (compareCandidatePriority(candidate, bestCandidate) > 0) {
      bestCandidate = candidate;
    }
  }

  return {
    status: bestCandidate.status,
    traite: bestCandidate.traite,
    message_sent: bestCandidate.message_sent,
    message_sent_at: bestCandidate.message_sent_at,
    linkedin_invitation_status: bestCandidate.linkedin_invitation_status,
    linkedin_invitation_sent: bestCandidate.linkedin_invitation_sent,
  };
}

export function applyDerivedProspectionStateToLead<T extends object>(
  lead: T,
  derivedState: DerivedProspectionState
): T & AppliedProspectionLeadState {
  return {
    ...lead,
    traite: derivedState.traite,
    message_sent: derivedState.message_sent,
    message_sent_at: derivedState.message_sent_at,
    linkedin_invitation_status: derivedState.linkedin_invitation_status,
    linkedin_invitation_sent: derivedState.linkedin_invitation_sent,
  };
}

export function mergeLeadWithInvitationUpdate<T extends ProspectionLeadState>(
  lead: T,
  invitation: ProspectionInvitationRow
): T & AppliedProspectionLeadState {
  const currentCandidate = buildLeadFallbackCandidate(lead);
  const invitationCandidate = buildInvitationCandidate(invitation);

  if (!invitationCandidate) {
    return applyDerivedProspectionStateToLead(lead, currentCandidate);
  }

  const nextCandidate =
    compareCandidatePriority(invitationCandidate, currentCandidate) > 0
      ? invitationCandidate
      : currentCandidate;

  return applyDerivedProspectionStateToLead(lead, nextCandidate);
}
