"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
  XCircle,
} from "lucide-react";

type SetupState = { linkedin: boolean; icp: boolean; message: boolean };

type ClientDetail = {
  id: number;
  email: string | null;
  company_name: string | null;
  plan: string | null;
  quota: string | null;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  created_at: string | null;
  n8n_workflow_id: string | null;
  clerk_user_id: string | null;
};

type OnboardingRow = {
  state: string;
  created_at: string;
  linkedin_connected_at: string | null;
  icp_submitted_at: string | null;
  completed_at: string | null;
};

type EmailRow = {
  id: number;
  kind: string;
  recipient: string | null;
  subject: string | null;
  status: string;
  error: string | null;
  metadata: Record<string, unknown> | null;
  sent_at: string;
};

type ActivityRow = {
  id: number;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

type ExtractionRow = {
  id: string;
  source: string | null;
  status: string | null;
  leads_count: number | null;
  created_at: string;
  completed_at: string | null;
  google_sheet_url: string | null;
  error_message: string | null;
};

type ApiResponse = {
  client: ClientDetail;
  setup: SetupState;
  onboarding: OnboardingRow | null;
  emails: EmailRow[];
  activity: ActivityRow[];
  leads: { total: number; last_added_at: string | null };
  extractions: ExtractionRow[];
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

const EMAIL_KIND_LABEL: Record<string, string> = {
  welcome: "Bienvenue",
  setup_reminder_j3: "Rappel J+3 setup",
  first_prospects: "Premiers prospects",
  renewal_d3: "Rappel J-3 renouvellement",
  renewal_leads: "Leads renouvellement",
  completion_leads: "Leads complétion",
};

const ACTIVITY_ACTION_LABEL: Record<string, string> = {
  sheet_created: "Onglet Google Sheet créé",
  leads_extracted: "Extraction de leads",
  messages_validated: "Messages validés",
  messages_updated: "Messages modifiés",
  workflow_created: "Workflow n8n créé",
  workflow_updated: "Workflow n8n mis à jour",
  icp_submitted: "ICP validé",
  icp_modified: "ICP modifié",
  credits_consumed: "Crédit consommé",
};

function SetupCard({
  label,
  done,
  hint,
}: {
  label: string;
  done: boolean;
  hint: string;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        done ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
      }`}
    >
      <div className="flex items-center gap-2">
        {done ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
        ) : (
          <XCircle className="w-5 h-5 text-amber-600" />
        )}
        <span className="font-semibold text-slate-900">{label}</span>
      </div>
      <p className="mt-2 text-xs text-slate-600">{hint}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === "sent")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold px-2 py-0.5">
        Envoyé
      </span>
    );
  if (s === "failed")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-700 text-xs font-semibold px-2 py-0.5">
        Échec
      </span>
    );
  if (s === "skipped")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 text-xs font-medium px-2 py-0.5">
        Non envoyé (setup OK)
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 text-xs font-medium px-2 py-0.5">
      {status}
    </span>
  );
}

export default function ClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = use(params);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/client-detail/${clientId}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) {
            setError(res.status === 403 ? "Accès refusé" : "Client introuvable");
          }
          return;
        }
        const json = (await res.json()) as ApiResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("Erreur de chargement");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (error) {
    return (
      <div className="p-10 max-w-3xl mx-auto">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 flex items-center gap-3 text-rose-800">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-10 flex items-center gap-2 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        Chargement…
      </div>
    );
  }

  const { client, setup, onboarding, emails, activity, leads, extractions } = data;

  const createdAt = client.created_at ? new Date(client.created_at) : null;
  const nextReminderJ3 = createdAt ? addBusinessDays(createdAt, 3) : null;
  const periodEnd = client.current_period_end
    ? new Date(client.current_period_end)
    : null;
  const nextRenewalD3 = periodEnd ? new Date(periodEnd.getTime() - 3 * 86400000) : null;

  const setupComplete = setup.linkedin && setup.icp && setup.message;
  const workflowOk = !!client.n8n_workflow_id;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <Link
        href="/admin/clients"
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="w-4 h-4" /> Retour à la liste
      </Link>

      {/* Header */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {client.company_name || `Client #${client.id}`}
            </h1>
            <p className="text-sm text-slate-600 mt-1">{client.email ?? "—"}</p>
            <p className="text-xs text-slate-400 mt-1">
              Org #{client.id} · inscrit le {fmtDate(client.created_at)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-100 text-slate-700 text-xs font-medium px-3 py-1">
              Plan : {client.plan ?? "—"}
            </span>
            <span className="rounded-full bg-slate-100 text-slate-700 text-xs font-medium px-3 py-1">
              Quota : {client.quota ?? "—"}/jour
            </span>
            <span
              className={`rounded-full text-xs font-semibold px-3 py-1 ${
                client.subscription_status === "active"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              Stripe : {client.subscription_status ?? "—"}
            </span>
          </div>
        </div>
      </section>

      {/* Onboarding */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Onboarding</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SetupCard
            label="LinkedIn connecté"
            done={setup.linkedin}
            hint={
              setup.linkedin
                ? `Connecté le ${fmtDate(onboarding?.linkedin_connected_at ?? null)}`
                : "Le client doit connecter son LinkedIn via Unipile"
            }
          />
          <SetupCard
            label="ICP configuré"
            done={setup.icp}
            hint={
              setup.icp
                ? "Filtres Apollo renseignés"
                : "ICP non soumis ou filtres Apollo vides"
            }
          />
          <SetupCard
            label="Message validé"
            done={setup.message}
            hint={
              setup.message
                ? "client_messages.status = submitted"
                : "Messages non validés dans l'assistant"
            }
          />
          <SetupCard
            label="Workflow n8n"
            done={workflowOk}
            hint={
              workflowOk
                ? `ID : ${client.n8n_workflow_id}`
                : "Aucun workflow créé"
            }
          />
        </div>
        {!setupComplete && (
          <p className="mt-4 text-sm text-amber-700">
            Setup incomplet — le cron d&apos;extraction journalière skippe ce client.
          </p>
        )}
      </section>

      {/* Emails envoyés */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Emails envoyés ({emails.length})
        </h2>
        {emails.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun email envoyé.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Sujet</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Erreur</th>
                </tr>
              </thead>
              <tbody>
                {emails.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-600 whitespace-nowrap">
                      {fmtDate(e.sent_at)}
                    </td>
                    <td className="py-2 pr-4 font-medium text-slate-900">
                      {EMAIL_KIND_LABEL[e.kind] ?? e.kind}
                    </td>
                    <td className="py-2 pr-4 text-slate-700">{e.subject ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <StatusPill status={e.status} />
                    </td>
                    <td className="py-2 text-xs text-rose-600">{e.error ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Prospects + extractions */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Prospects</h2>
          <p className="text-3xl font-bold text-slate-900">{leads.total}</p>
          <p className="text-xs text-slate-500 mt-1">total</p>
          <p className="text-xs text-slate-500 mt-3">
            Dernier ajouté : {fmtDate(leads.last_added_at)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">
            Dates clés (crons)
          </h2>
          <ul className="text-sm text-slate-700 space-y-1">
            <li>
              Prochain rappel J+3 :{" "}
              <span className="text-slate-500">
                {nextReminderJ3 ? fmtDate(nextReminderJ3.toISOString()) : "—"}
              </span>
            </li>
            <li>
              Fin de période Stripe :{" "}
              <span className="text-slate-500">{fmtDate(client.current_period_end)}</span>
            </li>
            <li>
              Rappel J-3 renouvellement :{" "}
              <span className="text-slate-500">
                {nextRenewalD3 ? fmtDate(nextRenewalD3.toISOString()) : "—"}
              </span>
            </li>
          </ul>
        </div>
      </section>

      {/* Extractions */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Extractions récentes ({extractions.length})
        </h2>
        {extractions.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune extraction.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Source</th>
                  <th className="py-2 pr-4">Leads</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Sheet</th>
                </tr>
              </thead>
              <tbody>
                {extractions.map((ex) => (
                  <tr key={ex.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-600 whitespace-nowrap">
                      {fmtDate(ex.created_at)}
                    </td>
                    <td className="py-2 pr-4 text-slate-700">{ex.source ?? "—"}</td>
                    <td className="py-2 pr-4 font-medium text-slate-900">
                      {ex.leads_count ?? 0}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-flex rounded-full text-xs font-semibold px-2 py-0.5 ${
                          ex.status === "completed"
                            ? "bg-emerald-50 text-emerald-700"
                            : ex.status === "failed"
                            ? "bg-rose-50 text-rose-700"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {ex.status ?? "—"}
                      </span>
                    </td>
                    <td className="py-2">
                      {ex.google_sheet_url ? (
                        <a
                          href={ex.google_sheet_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                        >
                          Ouvrir <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Activity timeline */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Activité client ({activity.length})
        </h2>
        {activity.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune activité enregistrée.</p>
        ) : (
          <ul className="space-y-3">
            {activity.map((a) => (
              <li
                key={a.id}
                className="border-l-2 border-slate-200 pl-4 py-1 text-sm"
              >
                <div className="text-slate-900 font-medium">
                  {ACTIVITY_ACTION_LABEL[a.action] ?? a.action}
                </div>
                <div className="text-xs text-slate-500">{fmtDate(a.created_at)}</div>
                {a.details && Object.keys(a.details).length > 0 && (
                  <pre className="mt-1 text-xs text-slate-600 bg-slate-50 rounded p-2 overflow-x-auto">
                    {JSON.stringify(a.details, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
