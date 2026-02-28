import { SearchX } from "lucide-react";

import CompactLeadRow from "./CompactLeadRow";
import LeadCard, { type LeadCardLead } from "./LeadCard";

export type MobileLeadsViewMode = "compact" | "comfort";

type LeadsCardsProps = {
  leads: LeadCardLead[];
  hasActiveFilters: boolean;
  viewMode: MobileLeadsViewMode;
  onOpenLead: (lead: LeadCardLead) => void;
  onToggleStatus: (lead: LeadCardLead) => void;
  onInviteLinkedIn: (lead: LeadCardLead) => void;
  updatingStatusIds: Set<string>;
  invitingLeadIds: Set<string>;
  inviteErrors: Record<string, string>;
  onResetFilters: () => void;
};

export function LeadsCardsSkeleton({
  count = 5,
  viewMode = "compact",
}: {
  count?: number;
  viewMode?: MobileLeadsViewMode;
}) {
  return (
    <div className={viewMode === "compact" ? "space-y-2" : "space-y-3"}>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-2xl border border-[#d7e3f4] bg-white p-4"
          aria-hidden="true"
        >
          {viewMode === "compact" ? (
            <>
              <div className="h-3.5 w-36 animate-pulse rounded bg-[#e9f1ff]" />
              <div className="mt-2 h-3 w-48 animate-pulse rounded bg-[#eef4fd]" />
              <div className="mt-2 h-2.5 w-28 animate-pulse rounded bg-[#eef4fd]" />
            </>
          ) : (
            <>
              <div className="h-4 w-40 animate-pulse rounded bg-[#e9f1ff]" />
              <div className="mt-2 h-3 w-52 animate-pulse rounded bg-[#eef4fd]" />
              <div className="mt-3 h-8 animate-pulse rounded-xl bg-[#f3f8ff]" />
              <div className="mt-2 h-8 animate-pulse rounded-xl bg-[#f3f8ff]" />
              <div className="mt-3 h-9 animate-pulse rounded-xl bg-[#e9f1ff]" />
            </>
          )}
        </div>
      ))}
    </div>
  );
}

export default function LeadsCards({
  leads,
  hasActiveFilters,
  viewMode,
  onOpenLead,
  onToggleStatus,
  onInviteLinkedIn,
  updatingStatusIds,
  invitingLeadIds,
  inviteErrors,
  onResetFilters,
}: LeadsCardsProps) {
  if (leads.length === 0) {
    return (
      <div className="rounded-2xl border border-[#d7e3f4] bg-white p-6 text-center shadow-[0_18px_30px_-24px_rgba(18,43,86,0.75)]">
        <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#d7e3f4] bg-[#f8fbff] text-[#607894]">
          <SearchX className="h-4 w-4" />
        </div>
        <h3 className="mt-3 text-[15px] font-semibold text-[#0b1c33]">Aucun prospect trouve</h3>
        <p className="mt-1 text-[13px] text-[#607894]">
          {hasActiveFilters
            ? "Ajustez votre recherche ou vos filtres pour afficher des leads."
            : "Vos leads apparaitront ici des qu'ils seront importes."}
        </p>
        <button
          type="button"
          onClick={onResetFilters}
          className="mt-4 inline-flex items-center justify-center rounded-xl border border-[#d7e3f4] bg-[#f8fbff] px-3 py-2 text-[12px] font-medium text-[#35547a] transition hover:bg-[#eef4fd] focus:outline-none focus:ring-2 focus:ring-[#dce8ff]"
        >
          Reinitialiser
        </button>
      </div>
    );
  }

  return (
    <div className={viewMode === "compact" ? "space-y-2" : "space-y-3"}>
      {leads.map((lead) => {
        const id = String(lead.id);

        if (viewMode === "compact") {
          return <CompactLeadRow key={id} lead={lead} onOpenLead={onOpenLead} />;
        }

        return (
          <LeadCard
            key={id}
            lead={lead}
            onOpenLead={onOpenLead}
            onToggleStatus={onToggleStatus}
            onInviteLinkedIn={onInviteLinkedIn}
            isStatusUpdating={updatingStatusIds.has(id)}
            isInviteLoading={invitingLeadIds.has(id)}
            inviteError={inviteErrors[id]}
          />
        );
      })}
    </div>
  );
}
