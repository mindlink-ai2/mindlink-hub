"use client";

import { useEffect, useMemo, useState } from "react";
import SubscriptionGate from "@/components/SubscriptionGate";
import { HubButton } from "@/components/ui/hub-button";

type FeedItem = {
  invitation_id: string;
  lead_id: string | null;
  person_name: string;
  company: string | null;
  linkedin_url: string | null;
  status: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  dm_sent_at: string | null;
  dm_draft_status: string | null;
  unipile_account_id: string | null;
  last_error: string | null;
};

type FeedResponse = {
  success?: boolean;
  error?: string;
  plan?: string;
  subscription_status?: string;
  stats?: {
    sent_invitations: number;
    accepted_invitations: number;
    auto_messages_sent: number;
  };
  sent_invitations?: FeedItem[];
  accepted_invitations?: FeedItem[];
  auto_messages_sent?: FeedItem[];
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(raw: string | null): string {
  const status = String(raw ?? "").trim().toLowerCase();
  if (status === "accepted" || status === "connected") return "Connectée";
  if (status === "sent" || status === "queued" || status === "pending") return "Envoyée";
  return "—";
}

function toExternalUrl(rawValue: string | null): string | null {
  const value = String(rawValue ?? "").trim();
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function EventListCard(props: {
  title: string;
  subtitle: string;
  items: FeedItem[];
  dateField: "sent_at" | "accepted_at" | "dm_sent_at";
  emptyLabel: string;
  kind: "sent" | "accepted" | "dm";
}) {
  const { title, subtitle, items, dateField, emptyLabel, kind } = props;

  return (
    <section className="hub-card flex min-h-0 flex-col overflow-hidden">
      <div className="border-b border-[#d7e3f4] bg-[#f8fbff] px-4 py-3">
        <h2 className="text-sm font-semibold text-[#0b1c33]">{title}</h2>
        <p className="mt-0.5 text-xs text-[#51627b]">{subtitle}</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#d1deef] bg-[#f8fbff] px-4 py-5 text-sm text-[#5b718f]">
            {emptyLabel}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const linkedinUrl = toExternalUrl(item.linkedin_url);

              return (
                <article
                  key={`${kind}-${item.invitation_id}`}
                  className="rounded-xl border border-[#d7e3f4] bg-white px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#0b1c33]">{item.person_name}</p>
                      <p className="truncate text-xs text-[#5d738f]">{item.company || "Entreprise non renseignée"}</p>
                    </div>
                    <span className="rounded-full border border-[#c8d6ea] bg-[#f7fbff] px-2.5 py-1 text-[11px] text-[#395577]">
                      {statusLabel(item.status)}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#51627b]">
                    <span>{formatDateTime(item[dateField])}</span>
                    {item.last_error ? (
                      <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] text-red-700">
                        Erreur: {item.last_error}
                      </span>
                    ) : null}
                  </div>

                  {linkedinUrl ? (
                    <div className="mt-2">
                      <HubButton asChild variant="ghost" size="sm">
                        <a href={linkedinUrl} target="_blank" rel="noreferrer">
                          Voir profil LinkedIn
                        </a>
                      </HubButton>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export default function LinkedinAutomationPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [planLabel, setPlanLabel] = useState<string>("full");
  const [sentInvitations, setSentInvitations] = useState<FeedItem[]>([]);
  const [acceptedInvitations, setAcceptedInvitations] = useState<FeedItem[]>([]);
  const [autoMessagesSent, setAutoMessagesSent] = useState<FeedItem[]>([]);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/linkedin/automation-feed", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as FeedResponse;

        if (!isMounted) return;

        if (res.status === 403) {
          setForbidden(true);
          setPlanLabel(`${data?.plan ?? "essential"} / ${data?.subscription_status ?? "inactive"}`);
          return;
        }

        if (!res.ok) {
          throw new Error(data?.error ?? "automation_feed_failed");
        }

        setForbidden(false);
        setPlanLabel(`${data?.plan ?? "full"} / ${data?.subscription_status ?? "active"}`);
        setSentInvitations(Array.isArray(data?.sent_invitations) ? data.sent_invitations : []);
        setAcceptedInvitations(Array.isArray(data?.accepted_invitations) ? data.accepted_invitations : []);
        setAutoMessagesSent(Array.isArray(data?.auto_messages_sent) ? data.auto_messages_sent : []);
      } catch (e: unknown) {
        if (!isMounted) return;
        setError(e instanceof Error ? e.message : "Impossible de charger l’activité.");
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const stats = useMemo(
    () => ({
      sent: sentInvitations.length,
      accepted: acceptedInvitations.length,
      dm: autoMessagesSent.length,
    }),
    [acceptedInvitations.length, autoMessagesSent.length, sentInvitations.length]
  );

  return (
    <SubscriptionGate supportEmail="contact@lidmeo.com">
      <div className="relative h-full min-h-0 w-full px-4 pb-20 pt-4 sm:px-6 sm:pt-5">
        <div className="mx-auto flex h-full min-h-0 w-full max-w-[1680px] flex-col gap-4">
          <section className="hub-card-hero p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="hub-page-title">Suivi automation LinkedIn</h1>
                <p className="mt-1 text-sm text-[#51627b]">
                  Vue claire des demandes envoyées, connexions acceptées et messages envoyés automatiquement.
                </p>
              </div>

              <span className="rounded-full border border-[#c8d6ea] bg-[#f7fbff] px-3 py-1 text-xs text-[#385472]">
                Plan: {planLabel}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-[#d7e3f4] bg-white px-3 py-2">
                <p className="text-[11px] text-[#6a7f9f]">Demandes envoyées</p>
                <p className="text-lg font-semibold text-[#0b1c33]">{stats.sent}</p>
              </div>
              <div className="rounded-xl border border-[#d7e3f4] bg-white px-3 py-2">
                <p className="text-[11px] text-[#6a7f9f]">Personnes acceptées</p>
                <p className="text-lg font-semibold text-[#0b1c33]">{stats.accepted}</p>
              </div>
              <div className="rounded-xl border border-[#d7e3f4] bg-white px-3 py-2">
                <p className="text-[11px] text-[#6a7f9f]">Messages auto envoyés</p>
                <p className="text-lg font-semibold text-[#0b1c33]">{stats.dm}</p>
              </div>
            </div>

            {forbidden ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Cette page est disponible uniquement pour les clients FULL actifs.
              </div>
            ) : null}

            {error ? (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}
          </section>

          {loading ? (
            <section className="hub-card p-5 text-sm text-[#51627b]">Chargement de l’activité…</section>
          ) : forbidden ? null : (
            <section className="grid min-h-0 flex-1 gap-3 lg:grid-cols-3">
              <EventListCard
                kind="sent"
                title="Demandes envoyées"
                subtitle="Invitations en cours"
                items={sentInvitations}
                dateField="sent_at"
                emptyLabel="Aucune demande envoyée pour le moment."
              />
              <EventListCard
                kind="accepted"
                title="Connexions acceptées"
                subtitle="Prospects qui ont accepté"
                items={acceptedInvitations}
                dateField="accepted_at"
                emptyLabel="Aucune connexion acceptée pour le moment."
              />
              <EventListCard
                kind="dm"
                title="Messages auto envoyés"
                subtitle="Messages LinkedIn envoyés automatiquement"
                items={autoMessagesSent}
                dateField="dm_sent_at"
                emptyLabel="Aucun message auto envoyé pour le moment."
              />
            </section>
          )}
        </div>
      </div>
    </SubscriptionGate>
  );
}
