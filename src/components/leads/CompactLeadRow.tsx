import { memo, type MouseEvent } from "react";
import { ChevronRight, Linkedin } from "lucide-react";

import { getLeadStatusKey, type LeadCardLead, type LeadCardStatusKey } from "./LeadCard";

function getStatusLabel(status: LeadCardStatusKey): string {
  if (status === "sent") return "Envoye";
  if (status === "connected") return "Connecte";
  if (status === "pending") return "En attente";
  return "A faire";
}

function getStatusClassName(status: LeadCardStatusKey): string {
  if (status === "sent" || status === "connected") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "pending") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-[#d7e3f4] bg-[#f5f9ff] text-[#4b647f]";
}

function formatCompactDate(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null;

  const createdDate = new Date(createdAt);
  if (Number.isNaN(createdDate.getTime())) return null;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfCreatedDay = new Date(
    createdDate.getFullYear(),
    createdDate.getMonth(),
    createdDate.getDate()
  );

  const diffDays = Math.floor(
    (startOfToday.getTime() - startOfCreatedDay.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays <= 0) return "Ajoute aujourd'hui";
  if (diffDays === 1) return "il y a 1 jour";
  if (diffDays <= 7) return `il y a ${diffDays} jours`;

  return `Ajoute le ${createdDate.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  })}`;
}

function safeExternalUrl(rawUrl: string): string {
  return /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
}

export type CompactLeadRowProps = {
  lead: LeadCardLead;
  onOpenLead: (lead: LeadCardLead) => void;
};

function CompactLeadRowComponent({ lead, onOpenLead }: CompactLeadRowProps) {
  const status = getLeadStatusKey(lead);
  const statusLabel = getStatusLabel(status);
  const displayName = `${lead.FirstName ?? ""} ${lead.LastName ?? ""}`.trim() || lead.Name || "Lead";
  const jobTitle = (lead.linkedinJobTitle ?? "").trim();
  const company = (lead.Company ?? "").trim();
  const subtitle = [jobTitle || "Poste non renseigne", company || "Entreprise non renseignee"]
    .filter(Boolean)
    .join(" - ");
  const dateLabel = formatCompactDate(lead.created_at);
  const linkedInUrl = (lead.LinkedInURL ?? "").trim()
    ? safeExternalUrl(String(lead.LinkedInURL))
    : null;

  const handleLinkedInClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!linkedInUrl) return;
    window.open(linkedInUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <article className="flex items-center gap-2 rounded-xl border border-[#d7e3f4] bg-white px-2.5 py-2 shadow-[0_10px_18px_-18px_rgba(18,43,86,0.68)] transition hover:bg-[#f9fbff]">
      <button
        type="button"
        onClick={() => onOpenLead(lead)}
        className="group flex min-w-0 flex-1 items-start justify-between gap-2 text-left focus:outline-none focus:ring-2 focus:ring-[#dce8ff]"
        aria-label={`Ouvrir la fiche de ${displayName}`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[14px] font-medium leading-tight text-[#0b1c33]">{displayName}</p>
            <span
              className={[
                "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
                getStatusClassName(status),
              ].join(" ")}
            >
              {statusLabel}
            </span>
          </div>

          <p className="mt-1 truncate text-[13px] text-[#5f7693]">{subtitle}</p>

          {dateLabel ? <p className="mt-0.5 truncate text-[11px] text-[#7a8fa9]">{dateLabel}</p> : null}
        </div>

        <span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[#90a3bb] transition group-hover:text-[#536f96]">
          <ChevronRight className="h-4 w-4" />
        </span>
      </button>

      <button
        type="button"
        onClick={handleLinkedInClick}
        disabled={!linkedInUrl}
        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-[#d7e3f4] bg-white px-2 text-[11px] text-[#4b647f] transition hover:bg-[#f5f9ff] focus:outline-none focus:ring-2 focus:ring-[#dce8ff] disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Se connecter sur LinkedIn"
        title="Se connecter sur LinkedIn"
      >
        <Linkedin className="h-3.5 w-3.5 text-[#0A66C2]" />
        <span>Se connecter</span>
      </button>
    </article>
  );
}

const CompactLeadRow = memo(CompactLeadRowComponent);

export default CompactLeadRow;
