import "server-only";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

type BadgeTone = "green" | "orange";

function layout({
  badgeLabel,
  badgeTone,
  headline,
  highlight,
  body,
  ctaLabel = "Accéder à Lidmeo Hub →",
  ctaUrl = "https://hub.lidmeo.com/dashboard",
}: {
  badgeLabel: string;
  badgeTone: BadgeTone;
  headline: string;
  highlight: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): string {
  const badgeBg = badgeTone === "green" ? "#DCFCE7" : "#FFEDD5";
  const badgeText = badgeTone === "green" ? "#15803D" : "#C2410C";

  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Lidmeo</title>
  </head>
  <body style="margin:0;padding:0;background-color:#F0F4F8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0b1c33;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F0F4F8;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(15,23,42,0.04);">
            <!-- Header -->
            <tr>
              <td style="padding:28px 40px;background-color:#ffffff;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font-size:22px;font-weight:700;color:#2563EB;letter-spacing:-0.01em;">Lidmeo</td>
                    <td align="right">
                      <span style="display:inline-block;padding:6px 14px;background-color:${badgeBg};color:${badgeText};border-radius:999px;font-size:12px;font-weight:600;">
                        ${escapeHtml(badgeLabel)}
                      </span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Main -->
            <tr>
              <td style="padding:40px 40px 8px 40px;background-color:#F0F4F8;" align="center">
                <h1 style="margin:0 0 8px 0;font-size:30px;line-height:1.15;font-weight:800;color:#0b1c33;text-align:center;">
                  ${escapeHtml(headline)}
                </h1>
                <p style="margin:8px 0 0 0;font-size:30px;line-height:1.15;font-weight:800;color:#2563EB;text-align:center;">
                  ${escapeHtml(highlight)}
                </p>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:24px 48px 40px 48px;background-color:#F0F4F8;" align="center">
                <p style="margin:0;font-size:15px;line-height:1.6;color:#334155;text-align:center;">
                  ${body}
                </p>
              </td>
            </tr>

            <!-- CTA -->
            <tr>
              <td style="padding:0 40px 40px 40px;background-color:#F0F4F8;" align="center">
                <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:16px 32px;background-color:#2563EB;color:#ffffff;text-decoration:none;border-radius:999px;font-size:15px;font-weight:600;">
                  ${escapeHtml(ctaLabel)}
                </a>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:18px 40px 28px 40px;background-color:#F0F4F8;" align="center">
                <p style="margin:0;font-size:13px;color:#2563EB;">
                  <a href="https://hub.lidmeo.com" style="color:#2563EB;text-decoration:none;">hub.lidmeo.com</a>
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0 0;font-size:12px;color:#94a3b8;">Vous recevez cet email car vous êtes client Lidmeo.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renewalLeadsEmail(clientName: string | null, leadsCount: number): {
  subject: string;
  html: string;
} {
  const name = (clientName ?? "").trim() || "Bonjour";
  const body = `
    Bonjour <strong>${escapeHtml(name)}</strong>,<br /><br />
    Nous avons sélectionné <strong>${leadsCount} leads</strong> pour les premiers jours ouvrés de votre nouveau mois de prospection.
    Connectez-vous à Lidmeo Hub pour les consulter dès maintenant.
  `;
  return {
    subject: `Vos nouveaux leads sont prêts — ${leadsCount} leads sélectionnés`,
    html: layout({
      badgeLabel: "✓ Leads sélectionnés",
      badgeTone: "green",
      headline: "Vos nouveaux leads",
      highlight: "sont prêts.",
      body,
    }),
  };
}

export function completionLeadsEmail(clientName: string | null, leadsCount: number): {
  subject: string;
  html: string;
} {
  const name = (clientName ?? "").trim() || "Bonjour";
  const body = `
    Bonjour <strong>${escapeHtml(name)}</strong>,<br /><br />
    Pour ne pas perdre de temps sur votre prospection, nous avons complété automatiquement votre sélection :
    <strong>${leadsCount} leads supplémentaires</strong> ont été ajoutés à votre liste du mois.
  `;
  return {
    subject: `Sélection complétée — ${leadsCount} leads ajoutés`,
    html: layout({
      badgeLabel: "✓ Sélection complétée",
      badgeTone: "green",
      headline: "Votre sélection",
      highlight: "est à jour.",
      body,
    }),
  };
}

export function reminderEmail(clientName: string | null, daysLeft: number): {
  subject: string;
  html: string;
} {
  const name = (clientName ?? "").trim() || "Bonjour";
  const dayLabel = daysLeft <= 1 ? "1 jour" : `${daysLeft} jours`;
  const body = `
    Bonjour <strong>${escapeHtml(name)}</strong>,<br /><br />
    Votre liste de prospects se termine dans <strong>${dayLabel}</strong>.<br /><br />
    Dès le début de votre prochain mois, vous pourrez soit sélectionner vos nouveaux prospects manuellement, soit nous laisser faire automatiquement pour vous.
  `;
  return {
    subject: `Votre liste de prospects se termine dans ${dayLabel} — Lidmeo`,
    html: layout({
      badgeLabel: "⏰ Rappel",
      badgeTone: "orange",
      headline: "Votre liste de prospects",
      highlight: `se termine dans ${dayLabel}.`,
      body,
    }),
  };
}

// ─── Admin notification (ciblage/messages client) ──────────────────────────────

type AdminChangeKind = "icp" | "messages";

export function adminClientChangeEmail(params: {
  kind: AdminChangeKind;
  clientName: string | null;
  clientEmail: string | null;
  orgId: number;
}): { subject: string; html: string } {
  const { kind, clientName, clientEmail, orgId } = params;
  const nameLabel = (clientName ?? "").trim() || `org #${orgId}`;
  const changeLabel = kind === "icp" ? "Ciblage modifié" : "Messages modifiés";
  const changeDetail = kind === "icp" ? "son ciblage (ICP)" : "ses messages de prospection";
  const subject = `🔔 [Lidmeo Hub] ${changeLabel} par ${nameLabel}`;
  const whenIso = new Date().toISOString();
  const whenLabel = new Date().toLocaleString("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  });
  const adminUrl = `https://hub.lidmeo.com/admin/clients?org=${orgId}`;

  const html = `<!DOCTYPE html>
<html lang="fr">
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0b1c33;padding:16px;">
    <p><strong>${escapeHtml(nameLabel)}</strong> vient de valider ${escapeHtml(changeDetail)}.</p>
    <ul>
      <li><strong>Client :</strong> ${escapeHtml(nameLabel)}</li>
      <li><strong>Email :</strong> ${escapeHtml(clientEmail ?? "—")}</li>
      <li><strong>Org ID :</strong> ${orgId}</li>
      <li><strong>Modification :</strong> ${escapeHtml(changeDetail)}</li>
      <li><strong>Date :</strong> ${escapeHtml(whenLabel)} (<code>${escapeHtml(whenIso)}</code>)</li>
    </ul>
    <p>
      <a href="${escapeHtml(adminUrl)}" style="color:#2563EB;">Ouvrir le panel admin →</a>
    </p>
  </body>
</html>`;

  return { subject, html };
}

// ─── Admin notification (workflow n8n) ────────────────────────────────────────

type AdminWorkflowKind = "created" | "updated";

export function adminClientWorkflowEmail(params: {
  kind: AdminWorkflowKind;
  clientName: string | null;
  clientEmail: string | null;
  orgId: number;
  workflowId: string | null;
  trigger?: string | null;
  activated?: boolean | null;
}): { subject: string; html: string } {
  const { kind, clientName, clientEmail, orgId, workflowId, trigger, activated } = params;
  const nameLabel = (clientName ?? "").trim() || `org #${orgId}`;
  const eventLabel = kind === "created" ? "Workflow n8n créé" : "Workflow n8n mis à jour";
  const subject = `🤖 [Lidmeo Hub] ${eventLabel} — ${nameLabel}`;
  const whenLabel = new Date().toLocaleString("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  });
  const adminUrl = `https://hub.lidmeo.com/admin/clients?org=${orgId}`;

  const html = `<!DOCTYPE html>
<html lang="fr">
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0b1c33;padding:16px;">
    <p><strong>${escapeHtml(nameLabel)}</strong> — ${escapeHtml(eventLabel.toLowerCase())}.</p>
    <ul>
      <li><strong>Client :</strong> ${escapeHtml(nameLabel)}</li>
      <li><strong>Email :</strong> ${escapeHtml(clientEmail ?? "—")}</li>
      <li><strong>Org ID :</strong> ${orgId}</li>
      <li><strong>Workflow ID :</strong> ${escapeHtml(workflowId ?? "—")}</li>
      <li><strong>Déclencheur :</strong> ${escapeHtml(trigger ?? "—")}</li>
      <li><strong>Activé :</strong> ${activated == null ? "—" : activated ? "oui" : "non"}</li>
      <li><strong>Date :</strong> ${escapeHtml(whenLabel)}</li>
    </ul>
    <p>
      <a href="${escapeHtml(adminUrl)}" style="color:#2563EB;">Ouvrir le panel admin →</a>
    </p>
  </body>
</html>`;

  return { subject, html };
}

// ─── Admin notification (export Google Sheet) ─────────────────────────────────

export function adminClientSheetExportEmail(params: {
  clientName: string | null;
  clientEmail: string | null;
  orgId: number;
  leadsCount: number;
  source: string;
  tabName?: string | null;
  sheetCreated?: boolean;
}): { subject: string; html: string } {
  const { clientName, clientEmail, orgId, leadsCount, source, tabName, sheetCreated } = params;
  const nameLabel = (clientName ?? "").trim() || `org #${orgId}`;
  const subject = `📄 [Lidmeo Hub] Export Sheet (${leadsCount} leads) — ${nameLabel}`;
  const whenLabel = new Date().toLocaleString("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  });
  const adminUrl = `https://hub.lidmeo.com/admin/clients?org=${orgId}`;

  const html = `<!DOCTYPE html>
<html lang="fr">
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0b1c33;padding:16px;">
    <p><strong>${escapeHtml(nameLabel)}</strong> — ${leadsCount} leads écrits dans le Google Sheet${
    sheetCreated ? " (onglet créé)" : ""
  }.</p>
    <ul>
      <li><strong>Client :</strong> ${escapeHtml(nameLabel)}</li>
      <li><strong>Email :</strong> ${escapeHtml(clientEmail ?? "—")}</li>
      <li><strong>Org ID :</strong> ${orgId}</li>
      <li><strong>Leads exportés :</strong> ${leadsCount}</li>
      <li><strong>Source :</strong> ${escapeHtml(source)}</li>
      <li><strong>Onglet :</strong> ${escapeHtml(tabName ?? "—")}</li>
      <li><strong>Date :</strong> ${escapeHtml(whenLabel)}</li>
    </ul>
    <p>
      <a href="${escapeHtml(adminUrl)}" style="color:#2563EB;">Ouvrir le panel admin →</a>
    </p>
  </body>
</html>`;

  return { subject, html };
}

// ─── Resend sender ─────────────────────────────────────────────────────────────

function getResendFrom(): string {
  return process.env.RESEND_FROM?.trim() || "Lidmeo <contact@lidmeo.com>";
}

export async function sendLidmeoEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY missing — skipping send");
    return { sent: false, error: "no_api_key" };
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: getResendFrom(),
        to: [params.to],
        subject: params.subject,
        html: params.html,
        reply_to: "contact@lidmeo.com",
      }),
    });
    if (!response.ok) {
      const details = await response.text().catch(() => "");
      return { sent: false, error: `${response.status}:${details.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}
