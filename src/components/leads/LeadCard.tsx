import { memo } from "react";
import { Building2, ExternalLink, Linkedin, Mail, MapPin, MoveRight, Phone } from "lucide-react";

import { HubButton } from "@/components/ui/hub-button";

export type LeadCardLead = {
  id: number | string;
  Name?: string | null;
  FirstName?: string | null;
  LastName?: string | null;
  Company?: string | null;
  location?: string | null;
  email?: string | null;
  phone?: string | null;
  created_at?: string | null;
  traite?: boolean | null;
  message_sent?: boolean | null;
  linkedinJobTitle?: string | null;
  LinkedInURL?: string | null;
  linkedin_invitation_status?: "sent" | "accepted" | null;
  linkedin_invitation_sent?: boolean | null;
};

export type LeadCardStatusKey = "todo" | "pending" | "connected" | "sent";

function getLinkedInInviteState(lead: LeadCardLead): "sent" | "accepted" | null {
  if (lead.linkedin_invitation_status === "accepted") return "accepted";
  if (lead.linkedin_invitation_status === "sent") return "sent";
  if (lead.linkedin_invitation_sent) return "sent";
  return null;
}

export function getLeadStatusKey(lead: LeadCardLead): LeadCardStatusKey {
  if (lead.message_sent) return "sent";
  if (getLinkedInInviteState(lead) === "accepted") return "connected";
  if (lead.traite) return "pending";
  return "todo";
}

function getStatusLabel(status: LeadCardStatusKey): string {
  if (status === "sent") return "Envoye";
  if (status === "connected") return "Connecte";
  if (status === "pending") return "En attente";
  return "A faire";
}

function getStatusClasses(status: LeadCardStatusKey): string {
  if (status === "sent" || status === "connected") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "pending") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-[#c8d6ea] bg-[#f4f8ff] text-[#34527a]";
}

function safeExternalUrl(rawUrl: string): string {
  return /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
}

function formatRecencyLabel(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null;

  const createdDate = new Date(createdAt);
  if (Number.isNaN(createdDate.getTime())) return null;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfCreatedDate = new Date(
    createdDate.getFullYear(),
    createdDate.getMonth(),
    createdDate.getDate()
  );

  const dayDiff = Math.floor(
    (startOfToday.getTime() - startOfCreatedDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (dayDiff <= 0) return "Ajoute aujourd'hui";
  if (dayDiff === 1) return "Ajoute hier";
  if (dayDiff < 7) return `Ajoute il y a ${dayDiff}j`;

  return `Ajoute le ${createdDate.toLocaleDateString("fr-FR")}`;
}

export type LeadCardProps = {
  lead: LeadCardLead;
  onOpenLead: (lead: LeadCardLead) => void;
  onToggleStatus: (lead: LeadCardLead) => void;
  onInviteLinkedIn: (lead: LeadCardLead) => void;
  isStatusUpdating: boolean;
  isInviteLoading: boolean;
  inviteError?: string;
};

function LeadCardComponent({
  lead,
  onOpenLead,
  onToggleStatus,
  onInviteLinkedIn,
  isStatusUpdating,
  isInviteLoading,
  inviteError,
}: LeadCardProps) {
  const displayName = `${lead.FirstName ?? ""} ${lead.LastName ?? ""}`.trim() || lead.Name || "Lead";
  const status = getLeadStatusKey(lead);
  const statusLabel = getStatusLabel(status);
  const recency = formatRecencyLabel(lead.created_at);
  const jobTitle = (lead.linkedinJobTitle ?? "").trim();
  const company = (lead.Company ?? "").trim();
  const subtitle = [jobTitle || "Poste non renseigne", company].filter(Boolean).join(" - ");

  const infoItems = [
    lead.email
      ? {
          key: "email",
          label: lead.email,
          href: `mailto:${lead.email}`,
          icon: Mail,
        }
      : null,
    lead.phone
      ? {
          key: "phone",
          label: lead.phone,
          href: `tel:${lead.phone}`,
          icon: Phone,
        }
      : null,
    lead.LinkedInURL
      ? {
          key: "linkedin",
          label: lead.LinkedInURL,
          href: safeExternalUrl(lead.LinkedInURL),
          icon: Linkedin,
          external: true,
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  const inviteState = getLinkedInInviteState(lead);
  const canToggleStatus = status !== "sent" && status !== "connected";
  const canInvite =
    Boolean(lead.LinkedInURL) &&
    inviteState !== "accepted" &&
    inviteState !== "sent" &&
    !isInviteLoading;

  return (
    <article className="rounded-2xl border border-[#d7e3f4] bg-white p-4 shadow-[0_16px_28px_-24px_rgba(18,43,86,0.72)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold leading-tight text-[#0b1c33]">{displayName}</h3>
          <p className="mt-1 truncate text-[12px] text-[#546b89]">{subtitle}</p>
        </div>
        <span
          className={[
            "inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-medium",
            getStatusClasses(status),
          ].join(" ")}
        >
          {statusLabel}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[#58708f]">
        {company ? (
          <span className="inline-flex max-w-full items-center gap-1">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{company}</span>
          </span>
        ) : null}
        {lead.location ? (
          <span className="inline-flex max-w-full items-center gap-1">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{lead.location}</span>
          </span>
        ) : null}
      </div>

      {infoItems.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {infoItems.slice(0, 3).map((item) => {
            const Icon = item.icon;

            return (
              <a
                key={item.key}
                href={item.href}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noreferrer" : undefined}
                className="inline-flex w-full items-center gap-2 rounded-xl border border-[#d7e3f4] bg-[#f8fbff] px-2.5 py-2 text-[12px] text-[#344b69]"
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </a>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-[#8093ad]">Aucune information de contact.</p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-[11px] text-[#607894]">{recency ?? "Date indisponible"}</p>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onToggleStatus(lead)}
            disabled={!canToggleStatus || isStatusUpdating}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#d7e3f4] bg-white text-[#3f5675] transition hover:bg-[#f4f8ff] focus:outline-none focus:ring-2 focus:ring-[#dce8ff] disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={canToggleStatus ? `Basculer le statut de ${displayName}` : `Statut verrouille pour ${displayName}`}
            title={canToggleStatus ? "Basculer le statut" : "Statut verrouille"}
          >
            <MoveRight className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => onInviteLinkedIn(lead)}
            disabled={!canInvite}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#d7e3f4] bg-white text-[#3f5675] transition hover:bg-[#f4f8ff] focus:outline-none focus:ring-2 focus:ring-[#dce8ff] disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`Envoyer une invitation LinkedIn a ${displayName}`}
            title="Inviter sur LinkedIn"
          >
            <Linkedin className="h-4 w-4" />
          </button>

          {lead.LinkedInURL ? (
            <a
              href={safeExternalUrl(lead.LinkedInURL)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#d7e3f4] bg-white text-[#3f5675] transition hover:bg-[#f4f8ff] focus:outline-none focus:ring-2 focus:ring-[#dce8ff]"
              aria-label={`Ouvrir le profil LinkedIn de ${displayName}`}
              title="Ouvrir LinkedIn"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}
        </div>
      </div>

      {inviteError ? <p className="mt-2 text-[11px] text-red-600">{inviteError}</p> : null}

      <div className="mt-3">
        <HubButton
          type="button"
          variant="primary"
          size="sm"
          className="w-full"
          onClick={() => onOpenLead(lead)}
          aria-label={`Voir la fiche de ${displayName}`}
        >
          Voir fiche
        </HubButton>
      </div>
    </article>
  );
}

const LeadCard = memo(LeadCardComponent);

export default LeadCard;
