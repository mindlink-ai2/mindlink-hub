import "server-only";

type SupportConversationEmailContext = {
  id: string;
  ticket_number: number | null;
  user_name: string | null;
  user_email: string | null;
  status?: string | null;
};

type NotifySupportTeamTicketCreatedInput = {
  conversation: SupportConversationEmailContext;
};

type NotifySupportTeamClientMessageInput = {
  conversation: SupportConversationEmailContext;
  messageBody: string;
  isFirstMessageInTicket?: boolean;
};

type NotifyClientSupportReplyInput = {
  conversation: SupportConversationEmailContext;
  replyBody: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function getHubBaseUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL;
  if (!appUrl) return "https://lidmeo.com";
  return normalizeBaseUrl(appUrl);
}

function getSupportNotifyRecipients(): string[] {
  const raw =
    process.env.SUPPORT_NOTIFY_EMAIL ??
    process.env.ONBOARDING_NOTIFY_EMAIL ??
    "contact@lidmeo.com";

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getResendFrom(): string {
  const configured = process.env.RESEND_FROM?.trim();
  if (configured) return configured;
  return "Lidmeo Support <contact@lidmeo.com>";
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 1))}…`;
}

async function sendEmail(params: {
  to: string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("SUPPORT_EMAIL_SKIPPED: Missing RESEND_API_KEY.");
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getResendFrom(),
      to: params.to,
      subject: params.subject,
      html: params.html,
      reply_to: params.replyTo ?? "contact@lidmeo.com",
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`support_email_send_failed:${response.status}:${details}`);
  }
}

function formatTicketLabel(ticketNumber: number | null): string {
  return ticketNumber ? `#${ticketNumber}` : "(sans numéro)";
}

export async function notifySupportTeamTicketCreated(
  input: NotifySupportTeamTicketCreatedInput
): Promise<void> {
  const { conversation } = input;
  const hubBase = getHubBaseUrl();
  const ticketLabel = formatTicketLabel(conversation.ticket_number);
  const userName = conversation.user_name?.trim() || "Client";
  const userEmail = conversation.user_email?.trim() || "email indisponible";

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a">
      <h2 style="margin:0 0 12px">Nouveau ticket support ${escapeHtml(ticketLabel)}</h2>
      <p><strong>Client :</strong> ${escapeHtml(userName)}</p>
      <p><strong>Email :</strong> ${escapeHtml(userEmail)}</p>
      <p><strong>Statut :</strong> ${escapeHtml(conversation.status?.trim() || "open")}</p>
      <p style="margin-top:16px">
        <a href="${escapeHtml(`${hubBase}/admin/support`)}" target="_blank" rel="noopener noreferrer">
          Ouvrir le Support Admin
        </a>
      </p>
      <p style="margin-top:8px;font-size:12px;color:#64748b">
        Conversation ID: ${escapeHtml(conversation.id)}
      </p>
    </div>
  `;

  await sendEmail({
    to: getSupportNotifyRecipients(),
    subject: `🎫 Nouveau ticket ${ticketLabel} — ${userName}`,
    html,
    replyTo: conversation.user_email ?? "contact@lidmeo.com",
  });
}

export async function notifySupportTeamClientMessage(
  input: NotifySupportTeamClientMessageInput
): Promise<void> {
  const { conversation, messageBody, isFirstMessageInTicket } = input;
  const hubBase = getHubBaseUrl();
  const ticketLabel = formatTicketLabel(conversation.ticket_number);
  const userName = conversation.user_name?.trim() || "Client";
  const userEmail = conversation.user_email?.trim() || "email indisponible";
  const status = conversation.status?.trim() || "open";
  const snippet = truncate(messageBody.trim(), 220);

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a">
      <h2 style="margin:0 0 12px">
        ${isFirstMessageInTicket ? "Premier message client" : "Nouveau message client"}
        sur le ticket ${escapeHtml(ticketLabel)}
      </h2>
      <p><strong>Client :</strong> ${escapeHtml(userName)}</p>
      <p><strong>Email :</strong> ${escapeHtml(userEmail)}</p>
      <p><strong>Statut ticket :</strong> ${escapeHtml(status)}</p>
      <p><strong>Message :</strong></p>
      <div style="border:1px solid #d7e3f4;background:#f8fbff;border-radius:10px;padding:12px;white-space:pre-wrap">
        ${escapeHtml(snippet || "(message vide)")}
      </div>
      <p style="margin-top:16px">
        <a href="${escapeHtml(`${hubBase}/admin/support`)}" target="_blank" rel="noopener noreferrer">
          Ouvrir le Support Admin
        </a>
      </p>
      <p style="margin-top:8px;font-size:12px;color:#64748b">
        Conversation ID: ${escapeHtml(conversation.id)}
      </p>
    </div>
  `;

  await sendEmail({
    to: getSupportNotifyRecipients(),
    subject: `💬 ${isFirstMessageInTicket ? "Premier message" : "Nouveau message"} — ticket ${ticketLabel}`,
    html,
    replyTo: conversation.user_email ?? "contact@lidmeo.com",
  });
}

export async function notifyClientSupportReply(
  input: NotifyClientSupportReplyInput
): Promise<void> {
  const { conversation, replyBody } = input;
  const recipient = conversation.user_email?.trim();
  if (!recipient) return;

  const hubBase = getHubBaseUrl();
  const ticketLabel = formatTicketLabel(conversation.ticket_number);
  const userName = conversation.user_name?.trim() || "Bonjour";
  const snippet = truncate(replyBody.trim(), 300);

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a">
      <p>${escapeHtml(userName)},</p>
      <p>Vous avez reçu une nouvelle réponse sur votre ticket support ${escapeHtml(ticketLabel)}.</p>
      <div style="border:1px solid #d7e3f4;background:#f8fbff;border-radius:10px;padding:12px;white-space:pre-wrap">
        ${escapeHtml(snippet || "(réponse vide)")}
      </div>
      <p style="margin-top:16px">
        Accéder au Hub :
        <a href="${escapeHtml(`${hubBase}/dashboard`)}" target="_blank" rel="noopener noreferrer">
          ${escapeHtml(`${hubBase}/dashboard`)}
        </a>
      </p>
      <p style="margin-top:10px;font-size:12px;color:#64748b">
        Email automatique envoyé par Lidmeo Support.
      </p>
    </div>
  `;

  await sendEmail({
    to: [recipient],
    subject: `✅ Réponse sur votre ticket ${ticketLabel} — Lidmeo`,
    html,
    replyTo: "contact@lidmeo.com",
  });
}
