import "server-only";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const LOGO_SVG_PATHS = `
<path fill="#2563EB" d="M1080.28,446.79v230.59c-222,0-402.62,180.63-402.62,402.62h-2.52c0-101.74-22.22-199.63-65.96-290.89-3.91-8.25-8.04-16.49-12.44-24.6-6.57-12.44-13.56-24.67-20.89-36.54-3.35-5.45-6.78-10.83-10.27-16.21,40.39-56.39,89.86-105.86,146.25-146.32,12.37-8.94,25.09-17.4,38.15-25.43,18.45-11.39,37.52-21.8,57.23-31.23,82.73-39.69,175.39-61.98,273.08-61.98Z"/>
<path fill="#2563EB" d="M1080.28,403.75h0c0,.62-.5,1.11-1.11,1.11-101.41.16-199,22.38-290.06,66.1-8.25,3.98-16.42,8.11-24.53,12.44-12.51,6.57-24.74,13.56-36.55,20.89-5.23,3.22-10.4,6.5-15.56,9.85-.39.25-.9.24-1.28-.03-56.13-40.3-105.38-89.62-145.62-145.8-8.94-12.37-17.4-25.09-25.43-38.15-11.39-18.52-21.8-37.66-31.23-57.37-39.46-82.34-61.67-174.46-61.84-271.65C447.07.52,447.58,0,448.21,0h228.32c0,222.98,180.76,403.75,403.75,403.75Z"/>
<path fill="#2563EB" d="M633.22,1080h-230.59c0-222-180.63-402.62-402.63-402.62v-2.24c101.95,0,199.99-22.22,291.17-66.1,8.24-3.91,16.42-8.11,24.53-12.44,12.44-6.57,24.67-13.56,36.55-20.89,5.45-3.35,10.83-6.78,16.21-10.27,56.39,40.46,105.86,89.93,146.25,146.32,9.01,12.37,17.47,25.09,25.43,38.15,11.39,18.52,21.8,37.59,31.23,57.3,39.62,82.66,61.84,175.18,61.84,272.79Z"/>
<path fill="#2563EB" d="M514.71,368.32c-40.39,56.39-89.86,105.86-146.25,146.25-12.37,8.94-25.09,17.4-38.15,25.43-18.45,11.39-37.52,21.8-57.23,31.23-82.73,39.76-175.39,61.98-273.08,61.98v-230.59c222,0,402.63-180.63,402.63-402.62h2.52c0,101.74,22.22,199.64,65.96,290.89,3.98,8.25,8.1,16.42,12.44,24.53,6.57,12.51,13.56,24.81,20.89,36.68,3.35,5.45,6.78,10.83,10.27,16.21Z"/>
`.trim();

function logoSvg(size: number): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 1080.28 1080" xmlns="http://www.w3.org/2000/svg" style="display:block;">${LOGO_SVG_PATHS}</svg>`;
}

const EMAIL_HEAD_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
body { margin: 0; padding: 0; background-color: #eef1f8; }
table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
img { border: 0; outline: none; text-decoration: none; display: block; }
a { text-decoration: none; }
@media (prefers-color-scheme: dark) {
  .wrapper-bg { background-color: #151929 !important; }
  .email-card { background-color: #ffffff !important; }
  .header-td  { background-color: #ffffff !important; border-bottom-color: #eef0f6 !important; }
  .hero-td    { background-color: #edf2ff !important; }
  .section-td { background-color: #ffffff !important; }
  .footer-td  { background-color: #f8faff !important; }
  .feat-card  { background-color: #f8faff !important; border-color: #e4ecfa !important; }
  .pill-td    { background-color: #ffffff !important; border-color: #dce8ff !important; }
  .stat-td    { background-color: #ffffff !important; border-color: #e0e8f8 !important; }
  .check-td   { background-color: #ffffff !important; border-color: #e4ecfa !important; }
  .step-num   { background-color: #EEF3FF !important; }
  .call-card  { background-color: #eef3ff !important; border-color: #dce8ff !important; }
  .c-dark     { color: #0f1728 !important; }
  .c-body     { color: #6b7280 !important; }
  .c-blue     { color: #2563EB !important; }
  .c-strong   { color: #374151 !important; }
  .c-muted    { color: #9ca3af !important; }
  .c-faint    { color: #c4c9d4 !important; }
  .c-white    { color: #ffffff !important; }
  .c-green    { color: #059669 !important; }
  .c-orange   { color: #C2410C !important; }
}
`.trim();

function commonHead(title: string): string {
  return `<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${escapeHtml(title)}</title>
  <style type="text/css">${EMAIL_HEAD_STYLES}</style>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { font-family: Arial, sans-serif !important; }
  </style>
  <![endif]-->
</head>`;
}

function header(badgeLabel: string, badgeBg: string, badgeColor: string): string {
  return `<tr>
  <td style="background-color:#ffffff;border-bottom:1px solid #eef0f6;padding:22px 40px;" class="header-td">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td valign="middle">
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td valign="middle" width="32">${logoSvg(32)}</td>
              <td style="padding-left:9px;font-family:'Inter',Arial,sans-serif;font-size:22px;font-weight:700;color:#2563EB;letter-spacing:-0.4px;" class="c-blue">Lidmeo</td>
            </tr>
          </table>
        </td>
        <td align="right">
          <span style="font-family:'Inter',Arial,sans-serif;background-color:${badgeBg};color:${badgeColor};font-size:13px;font-weight:600;padding:6px 14px;border-radius:100px;display:inline-block;">${escapeHtml(badgeLabel)}</span>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}

function footer(): string {
  return `<tr>
  <td align="center" style="background-color:#f8faff;border-top:1px solid #eef0f6;padding:28px 40px 34px 40px;" class="footer-td">
    <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
      <tr>
        <td valign="middle" width="22">${logoSvg(22)}</td>
        <td style="padding-left:8px;font-family:'Inter',Arial,sans-serif;font-size:17px;font-weight:700;color:#2563EB;" class="c-blue">Lidmeo</td>
      </tr>
    </table>
    <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
      <tr>
        <td style="padding:0 10px;"><a href="https://lidmeo.com" style="font-family:'Inter',Arial,sans-serif;font-size:13px;color:#9ca3af;text-decoration:none;font-weight:500;" class="c-muted">Site web</a></td>
        <td style="padding:0 10px;"><a href="https://lidmeo.com/offres-prospection-automatique" style="font-family:'Inter',Arial,sans-serif;font-size:13px;color:#9ca3af;text-decoration:none;font-weight:500;" class="c-muted">Offres</a></td>
        <td style="padding:0 10px;"><a href="https://lidmeo.com/blog" style="font-family:'Inter',Arial,sans-serif;font-size:13px;color:#9ca3af;text-decoration:none;font-weight:500;" class="c-muted">Blog</a></td>
        <td style="padding:0 10px;"><a href="https://lidmeo.com/demander-devis" style="font-family:'Inter',Arial,sans-serif;font-size:13px;color:#9ca3af;text-decoration:none;font-weight:500;" class="c-muted">Contact</a></td>
      </tr>
    </table>
    <p style="font-family:'Inter',Arial,sans-serif;font-size:12px;color:#c4c9d4;line-height:1.7;margin:0;" class="c-faint">
      Vous recevez cet email car vous utilisez Lidmeo.<br/>
      <a href="https://hub.lidmeo.com" style="color:#9ca3af;text-decoration:none;" class="c-muted">Accéder au Hub</a>
    </p>
  </td>
</tr>`;
}

function teamBlock(intro: string): string {
  return `<tr>
  <td style="padding:0 40px 44px 40px;background-color:#ffffff;" class="section-td">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef3ff;border:1.5px solid #dce8ff;border-radius:16px;" class="call-card">
      <tr>
        <td align="center" style="padding:34px;">
          <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px;">
            <tr>
              <td width="50" height="50" align="center" valign="middle" style="background-color:#2563EB;border-radius:50%;border:3px solid #ffffff;font-family:'Inter',Arial,sans-serif;font-size:17px;font-weight:800;color:#ffffff;" class="c-white">L</td>
              <td width="8">&nbsp;</td>
              <td width="50" height="50" align="center" valign="middle" style="background-color:#7c3aed;border-radius:50%;border:3px solid #ffffff;font-family:'Inter',Arial,sans-serif;font-size:17px;font-weight:800;color:#ffffff;" class="c-white">D</td>
            </tr>
          </table>
          <h3 style="font-family:'Inter',Arial,sans-serif;font-size:19px;font-weight:800;color:#0f1728;letter-spacing:-0.4px;margin:0 0 12px 0;text-align:center;" class="c-dark">Bienvenue dans la team 👋</h3>
          <p style="font-family:'Inter',Arial,sans-serif;font-size:15.5px;line-height:1.75;color:#6b7280;margin:0;text-align:center;" class="c-body">
            ${intro}<br/><br/>
            <strong style="color:#374151;font-weight:600;" class="c-strong">Lilian &amp; Dorian</strong>, fondateurs de Lidmeo
          </p>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}

function pillBadge(label: string): string {
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
  <tr>
    <td style="background-color:#ffffff;border:1.5px solid #dce8ff;border-radius:100px;padding:7px 18px;" class="pill-td">
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td valign="middle" width="18">${logoSvg(18)}</td>
          <td style="padding-left:8px;font-family:'Inter',Arial,sans-serif;font-size:14px;font-weight:500;color:#2563EB;" class="c-blue">${escapeHtml(label)}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

function stepCard(num: number, title: string, body: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8faff;border:1.5px solid #e4ecfa;border-radius:14px;margin-bottom:12px;" class="feat-card">
  <tr>
    <td style="padding:20px 22px;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td valign="middle" width="32" height="32" align="center" style="background-color:#EEF3FF;border-radius:8px;font-family:'Inter',Arial,sans-serif;font-size:14px;font-weight:800;color:#2563EB;min-width:32px;" class="step-num c-blue">${num}</td>
          <td style="padding-left:16px;" valign="middle">
            <p style="font-family:'Inter',Arial,sans-serif;font-size:15.5px;font-weight:700;color:#0f1728;margin:0 0 4px 0;" class="c-dark">${escapeHtml(title)}</p>
            <p style="font-family:'Inter',Arial,sans-serif;font-size:14px;color:#6b7280;margin:0;line-height:1.65;" class="c-body">${escapeHtml(body)}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

function greeting(prenom: string): string {
  const safe = escapeHtml(prenom.trim());
  return safe ? `Bonjour <strong style="color:#374151;font-weight:600;" class="c-strong">${safe}</strong>,` : `Bonjour,`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIL 1 — Bienvenue + invitation à configurer ICP et message
// ─────────────────────────────────────────────────────────────────────────────

export function welcomeSetupEmail(prenom: string): { subject: string; html: string } {
  const subject = "Bienvenue chez Lidmeo 👋";
  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="fr">
${commonHead("Lidmeo — Configurez votre prospection")}
<body style="margin:0;padding:0;background-color:#eef1f8;" class="wrapper-bg">

<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;color:transparent;">
  Votre abonnement est confirmé. Configurez votre ciblage et votre message pour lancer votre prospection.
</div>

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef1f8;" class="wrapper-bg">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table width="620" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;width:100%;background-color:#ffffff;border-radius:20px;overflow:hidden;" class="email-card">

        ${header("✅ Abonnement confirmé", "#ecfdf5", "#059669")}

        <tr>
          <td align="center" style="background-color:#edf2ff;padding:52px 40px 48px;background-image:linear-gradient(170deg,#f5f7ff 0%,#edf2ff 100%);" class="hero-td">
            ${pillBadge("Bienvenue sur Lidmeo")}
            <h1 style="font-family:'Inter',Arial,sans-serif;font-size:40px;font-weight:900;line-height:1.1;letter-spacing:-1.5px;color:#0f1728;margin:0 0 20px 0;text-align:center;" class="c-dark">
              Merci pour votre<br/>
              <span style="color:#2563EB;" class="c-blue">abonnement. ✅</span>
            </h1>
            <p style="font-family:'Inter',Arial,sans-serif;font-size:17px;font-weight:400;line-height:1.7;color:#6b7280;margin:0 0 38px 0;text-align:center;max-width:480px;" class="c-body">
              ${greeting(prenom)} votre compte est créé. Pour démarrer votre prospection, il reste <strong style="color:#374151;font-weight:600;" class="c-strong">3 étapes rapides</strong> à compléter dans votre Hub.
            </p>
            <a href="https://hub.lidmeo.com" style="display:inline-block;background-color:#2563EB;color:#ffffff;text-decoration:none;font-family:'Inter',Arial,sans-serif;font-size:16px;font-weight:700;letter-spacing:-0.3px;padding:18px 48px;border-radius:100px;text-align:center;" class="c-white">
              Configurer ma prospection →
            </a>
            <p style="font-family:'Inter',Arial,sans-serif;font-size:13px;color:#9ca3af;margin:14px 0 0 0;text-align:center;" class="c-muted">
              hub.lidmeo.com
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:48px 40px 0 40px;background-color:#ffffff;" class="section-td">
            <p style="font-family:'Inter',Arial,sans-serif;font-size:17px;line-height:1.8;color:#6b7280;margin:0;" class="c-body">
              Votre abonnement est confirmé et votre compte est créé. Pour que nous puissions extraire vos premiers prospects qualifiés et envoyer vos messages depuis votre LinkedIn, nous avons besoin que vous complétiez <strong style="color:#374151;font-weight:600;" class="c-strong">3 étapes</strong> dans votre Hub. Tout se fait en quelques minutes.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:36px 40px;background-color:#ffffff;" class="section-td">
            <p style="font-family:'Inter',Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#2563EB;margin:0 0 7px 0;" class="c-blue">Les prochaines étapes</p>
            <h2 style="font-family:'Inter',Arial,sans-serif;font-size:24px;font-weight:800;color:#0f1728;letter-spacing:-0.5px;margin:0 0 24px 0;" class="c-dark">3 étapes pour démarrer</h2>
            ${stepCard(1, "Connectez votre compte LinkedIn", "C'est depuis votre profil LinkedIn que les messages partent. La connexion se fait en un clic via notre partenaire sécurisé Unipile, vous gardez la main sur votre compte.")}
            ${stepCard(2, "Définissez votre ciblage (ICP)", "Indiquez-nous le profil de vos clients idéaux : poste, secteur, taille d'entreprise, géographie. C'est ce qui nous permet de sélectionner les bons prospects pour vous.")}
            ${stepCard(3, "Validez votre message de prospection", "Notre assistant IA vous aide à rédiger un message qui convertit. Vous le validez en quelques échanges, et c'est ce message qui sera envoyé à vos prospects.")}
            <p style="font-family:'Inter',Arial,sans-serif;font-size:14px;color:#9ca3af;margin:18px 0 0 0;text-align:center;" class="c-muted">
              Une fois ces 3 étapes faites, vos prospects arrivent automatiquement chaque jour dans votre dashboard.
            </p>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:0 40px 36px 40px;background-color:#ffffff;" class="section-td">
            <a href="https://hub.lidmeo.com" style="display:inline-block;background-color:#2563EB;color:#ffffff;text-decoration:none;font-family:'Inter',Arial,sans-serif;font-size:16px;font-weight:700;letter-spacing:-0.3px;padding:18px 44px;border-radius:100px;text-align:center;" class="c-white">
              Accéder à mon Hub →
            </a>
          </td>
        </tr>

        ${teamBlock("On est ravis de vous avoir avec nous. Si vous avez la moindre question avant de configurer, répondez simplement à cet email — on vous répond rapidement.")}

        ${footer()}

      </table>
    </td>
  </tr>
</table>

</body>
</html>`;
  return { subject, html };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIL 2 — Rappel J+3 ouvrés si ICP ou message non configuré
// ─────────────────────────────────────────────────────────────────────────────

export type SetupMissing = {
  linkedin: boolean;
  icp: boolean;
  message: boolean;
};

const SETUP_STEP_DEFS = {
  linkedin: {
    title: "Connectez votre LinkedIn",
    body: "Connexion sécurisée en un clic via Unipile. C'est depuis votre profil que les messages partent.",
  },
  icp: {
    title: "Définissez votre ciblage (ICP)",
    body: "Le profil de vos clients idéaux : poste, secteur, taille d'entreprise, géographie. Notre assistant vous guide.",
  },
  message: {
    title: "Validez votre message de prospection",
    body: "Notre assistant IA vous aide à le rédiger en quelques échanges. Vous validez et c'est en place.",
  },
} as const;

function buildMissingStepsBlock(missing: SetupMissing): string {
  const order: Array<keyof SetupMissing> = ["linkedin", "icp", "message"];
  const pending = order.filter((k) => missing[k]);
  return pending.map((key, idx) => stepCard(idx + 1, SETUP_STEP_DEFS[key].title, SETUP_STEP_DEFS[key].body)).join("\n");
}

function buildReminderCopy(missing: SetupMissing): {
  subject: string;
  heroLineOne: string;
  heroLineTwo: string;
  introSentence: string;
  sectionTitle: string;
  pillLabel: string;
} {
  // L'onboarding est strictement séquentiel : LinkedIn → ICP → Message.
  // Un client ne peut pas valider une étape sans avoir validé les précédentes,
  // donc seuls 3 états "missing" sont possibles :
  //   - juste message  (LinkedIn + ICP faits)
  //   - ICP + message  (LinkedIn fait)
  //   - les 3          (rien fait, ou état incohérent qu'on traite par défaut)

  if (!missing.linkedin && !missing.icp && missing.message) {
    return {
      subject: "Plus qu'une étape : validez votre message 👋",
      heroLineOne: "Il vous reste à",
      heroLineTwo: `<span style="color:#2563EB;" class="c-blue">valider votre message.</span>`,
      introSentence:
        "Votre LinkedIn est connecté et votre ciblage est défini. Il ne manque plus que votre message de prospection, à rédiger avec notre assistant IA.",
      sectionTitle: "Plus qu'une étape, 3 minutes",
      pillLabel: "Plus qu'une étape",
    };
  }

  if (!missing.linkedin && missing.icp && missing.message) {
    return {
      subject: "Plus que 2 étapes pour démarrer votre prospection 👋",
      heroLineOne: "Votre prospection est",
      heroLineTwo: `<span style="color:#2563EB;" class="c-blue">presque prête. 👋</span>`,
      introSentence:
        "Votre LinkedIn est connecté. Il reste 2 étapes rapides — votre ciblage et votre message — pour que nous puissions lancer votre prospection.",
      sectionTitle: "2 étapes restantes",
      pillLabel: "Presque prêt",
    };
  }

  return {
    subject: "On vous attend pour démarrer votre prospection 👋",
    heroLineOne: "Votre prospection",
    heroLineTwo: `<span style="color:#2563EB;" class="c-blue">vous attend. 👋</span>`,
    introSentence:
      "Pour que nous puissions extraire vos prospects et démarrer votre prospection, il faut compléter les 3 étapes de configuration. Sans elles, votre quota mensuel court sans rien produire.",
    sectionTitle: "3 étapes, 5 minutes",
    pillLabel: "Petit rappel amical",
  };
}

export function setupReminderJ3Email(
  prenom: string,
  missing: SetupMissing
): { subject: string; html: string } {
  const copy = buildReminderCopy(missing);
  const stepsHtml = buildMissingStepsBlock(missing);

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="fr">
${commonHead("Lidmeo — Configurez votre prospection")}
<body style="margin:0;padding:0;background-color:#eef1f8;" class="wrapper-bg">

<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;color:transparent;">
  Votre abonnement Lidmeo est actif mais votre prospection n'a pas encore démarré. Quelques minutes suffisent.
</div>

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef1f8;" class="wrapper-bg">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table width="620" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;width:100%;background-color:#ffffff;border-radius:20px;overflow:hidden;" class="email-card">

        ${header("⏰ À configurer", "#fff7ed", "#C2410C")}

        <tr>
          <td align="center" style="background-color:#edf2ff;padding:52px 40px 48px;background-image:linear-gradient(170deg,#f5f7ff 0%,#edf2ff 100%);" class="hero-td">
            ${pillBadge(copy.pillLabel)}
            <h1 style="font-family:'Inter',Arial,sans-serif;font-size:40px;font-weight:900;line-height:1.1;letter-spacing:-1.5px;color:#0f1728;margin:0 0 20px 0;text-align:center;" class="c-dark">
              ${copy.heroLineOne}<br/>
              ${copy.heroLineTwo}
            </h1>
            <p style="font-family:'Inter',Arial,sans-serif;font-size:17px;font-weight:400;line-height:1.7;color:#6b7280;margin:0 0 38px 0;text-align:center;max-width:480px;" class="c-body">
              ${greeting(prenom)} votre abonnement est actif depuis quelques jours. Quelques minutes suffisent pour finaliser votre setup.
            </p>
            <a href="https://hub.lidmeo.com" style="display:inline-block;background-color:#2563EB;color:#ffffff;text-decoration:none;font-family:'Inter',Arial,sans-serif;font-size:16px;font-weight:700;letter-spacing:-0.3px;padding:18px 48px;border-radius:100px;text-align:center;" class="c-white">
              Terminer ma configuration →
            </a>
            <p style="font-family:'Inter',Arial,sans-serif;font-size:13px;color:#9ca3af;margin:14px 0 0 0;text-align:center;" class="c-muted">
              hub.lidmeo.com
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:48px 40px 0 40px;background-color:#ffffff;" class="section-td">
            <p style="font-family:'Inter',Arial,sans-serif;font-size:17px;line-height:1.8;color:#6b7280;margin:0;" class="c-body">
              ${copy.introSentence}
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:36px 40px;background-color:#ffffff;" class="section-td">
            <p style="font-family:'Inter',Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#2563EB;margin:0 0 7px 0;" class="c-blue">Ce qui reste à faire</p>
            <h2 style="font-family:'Inter',Arial,sans-serif;font-size:24px;font-weight:800;color:#0f1728;letter-spacing:-0.5px;margin:0 0 24px 0;" class="c-dark">${copy.sectionTitle}</h2>
            ${stepsHtml}
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:0 40px 36px 40px;background-color:#ffffff;" class="section-td">
            <a href="https://hub.lidmeo.com" style="display:inline-block;background-color:#2563EB;color:#ffffff;text-decoration:none;font-family:'Inter',Arial,sans-serif;font-size:16px;font-weight:700;letter-spacing:-0.3px;padding:18px 44px;border-radius:100px;text-align:center;" class="c-white">
              Configurer maintenant →
            </a>
            <p style="font-family:'Inter',Arial,sans-serif;font-size:13px;color:#9ca3af;margin:14px 0 0 0;text-align:center;" class="c-muted">
              hub.lidmeo.com
            </p>
          </td>
        </tr>

        ${teamBlock("Une question, un blocage, une hésitation ? Répondez simplement à cet email, on est là pour ça.")}

        ${footer()}

      </table>
    </td>
  </tr>
</table>

</body>
</html>`;
  return { subject: copy.subject, html };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIL 3 — Premiers prospects arrivés (1 fois à vie)
// ─────────────────────────────────────────────────────────────────────────────

export function firstProspectsEmail(prenom: string, count: number): { subject: string; html: string } {
  const subject = "🎉 Vos prospects sont arrivés sur Lidmeo !";
  const safeCount = Math.max(0, Math.floor(count));
  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="fr">
${commonHead("Lidmeo — Vos prospects sont arrivés")}
<body style="margin:0;padding:0;background-color:#eef1f8;" class="wrapper-bg">

<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;color:transparent;">
  Vos premiers prospects qualifiés sont disponibles dans votre tableau de bord Lidmeo.
</div>

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef1f8;" class="wrapper-bg">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table width="620" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;width:100%;background-color:#ffffff;border-radius:20px;overflow:hidden;" class="email-card">

        ${header("🎉 Vos prospects sont là", "#ecfdf5", "#059669")}

        <tr>
          <td align="center" style="background-color:#edf2ff;padding:52px 40px 48px;background-image:linear-gradient(170deg,#f5f7ff 0%,#edf2ff 100%);" class="hero-td">
            ${pillBadge("Votre prospection vient de démarrer")}
            <h1 style="font-family:'Inter',Arial,sans-serif;font-size:40px;font-weight:900;line-height:1.1;letter-spacing:-1.5px;color:#0f1728;margin:0 0 20px 0;text-align:center;" class="c-dark">
              ${safeCount > 0 ? `<span style="color:#2563EB;" class="c-blue">${safeCount} prospect${safeCount > 1 ? "s" : ""}</span><br/>vous attendent. 🎉` : `Vos prospects sont<br/><span style="color:#2563EB;" class="c-blue">arrivés sur Lidmeo. 🎉</span>`}
            </h1>
            <p style="font-family:'Inter',Arial,sans-serif;font-size:17px;font-weight:400;line-height:1.7;color:#6b7280;margin:0 0 38px 0;text-align:center;max-width:480px;" class="c-body">
              ${greeting(prenom)} Lidmeo a sélectionné vos premiers prospects qualifiés selon votre cible. Ils sont dans votre tableau de bord, prêts à être travaillés.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="32%" align="center" style="background-color:#ffffff;border:1.5px solid #e0e8f8;border-radius:14px;padding:20px 10px;" class="stat-td">
                  <span style="font-size:26px;display:block;margin-bottom:8px;">🎯</span>
                  <span style="font-family:'Inter',Arial,sans-serif;font-size:12px;color:#9ca3af;font-weight:500;line-height:1.5;" class="c-muted">Prospects<br/>qualifiés</span>
                </td>
                <td width="4%">&nbsp;</td>
                <td width="32%" align="center" style="background-color:#ffffff;border:1.5px solid #e0e8f8;border-radius:14px;padding:20px 10px;" class="stat-td">
                  <span style="font-size:26px;display:block;margin-bottom:8px;">✅</span>
                  <span style="font-family:'Inter',Arial,sans-serif;font-size:12px;color:#9ca3af;font-weight:500;line-height:1.5;" class="c-muted">Correspondant<br/>à votre cible</span>
                </td>
                <td width="4%">&nbsp;</td>
                <td width="32%" align="center" style="background-color:#ffffff;border:1.5px solid #e0e8f8;border-radius:14px;padding:20px 10px;" class="stat-td">
                  <span style="font-size:26px;display:block;margin-bottom:8px;">🚀</span>
                  <span style="font-family:'Inter',Arial,sans-serif;font-size:12px;color:#9ca3af;font-weight:500;line-height:1.5;" class="c-muted">Prêts à être<br/>contactés</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:48px 40px 0 40px;background-color:#ffffff;" class="section-td">
            <p style="font-family:'Inter',Arial,sans-serif;font-size:17px;line-height:1.8;color:#6b7280;margin:0;" class="c-body">
              Bonne nouvelle : vos premiers prospects sont disponibles sur votre dashboard Lidmeo. Ils ont été sélectionnés selon vos critères et n'attendent plus que vous.<br/><br/>
              Prenez quelques minutes pour les parcourir, et n'hésitez pas à nous faire un retour si vous souhaitez affiner la sélection. On est là pour ça.
            </p>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:36px 40px;background-color:#ffffff;" class="section-td">
            <a href="https://hub.lidmeo.com" style="display:inline-block;background-color:#2563EB;color:#ffffff;text-decoration:none;font-family:'Inter',Arial,sans-serif;font-size:16px;font-weight:700;letter-spacing:-0.3px;padding:18px 44px;border-radius:100px;text-align:center;" class="c-white">
              Voir mes prospects →
            </a>
          </td>
        </tr>

        <tr>
          <td style="padding:0 40px;background-color:#ffffff;" class="section-td">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td height="1" style="background-color:#f0f3fa;font-size:0;line-height:0;">&nbsp;</td></tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:44px 40px;background-color:#ffffff;" class="section-td">
            <p style="font-family:'Inter',Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#2563EB;margin:0 0 7px 0;" class="c-blue">Offert pour chaque nouveau client</p>
            <h2 style="font-family:'Inter',Arial,sans-serif;font-size:24px;font-weight:800;color:#0f1728;letter-spacing:-0.5px;margin:0 0 12px 0;" class="c-dark">Réservez votre call d'onboarding</h2>
            <p style="font-family:'Inter',Arial,sans-serif;font-size:15.5px;line-height:1.75;color:#6b7280;margin:0 0 30px 0;" class="c-body">
              On vous propose <strong style="color:#374151;font-weight:600;" class="c-strong">15 minutes en visio</strong> avec notre équipe pour vous présenter la plateforme et vous partager les techniques qui donnent les meilleurs résultats chez nos clients.
            </p>
            ${stepCard(1, "Prise en main de votre dashboard", "On vous guide pas à pas pour que vous soyez à l'aise sur la plateforme dès le premier jour.")}
            ${stepCard(2, "Les techniques qui convertissent", "Messages d'accroche, timing des relances, bons réflexes : on partage ce qui fonctionne vraiment chez nos clients.")}
            ${stepCard(3, "Vos questions, nos réponses", "On répond à tout pour que vous repartiez avec une stratégie claire et actionnée dès le lendemain.")}
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef3ff;border:1.5px solid #dce8ff;border-radius:16px;margin-top:18px;" class="call-card">
              <tr>
                <td align="center" style="padding:34px 28px;">
                  <p style="font-family:'Inter',Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#2563EB;margin:0 0 10px 0;" class="c-blue">Call d'onboarding offert</p>
                  <h3 style="font-family:'Inter',Arial,sans-serif;font-size:23px;font-weight:900;color:#0f1728;letter-spacing:-0.6px;margin:0 0 10px 0;text-align:center;" class="c-dark">15 minutes pour bien démarrer</h3>
                  <p style="font-family:'Inter',Arial,sans-serif;font-size:15px;color:#6b7280;line-height:1.65;margin:0 0 28px 0;text-align:center;" class="c-body">
                    Choisissez directement le créneau qui vous convient.<br/>Rapide, sans engagement, 100% utile.
                  </p>
                  <a href="https://zcal.co/lidmeo/Onboarding" style="display:inline-block;background-color:#2563EB;color:#ffffff;text-decoration:none;font-family:'Inter',Arial,sans-serif;font-size:16px;font-weight:700;letter-spacing:-0.3px;padding:18px 44px;border-radius:100px;text-align:center;" class="c-white">
                    Réserver mon créneau de 15 min →
                  </a>
                  <p style="font-family:'Inter',Arial,sans-serif;font-size:13px;color:#9ca3af;margin:14px 0 0 0;text-align:center;" class="c-muted">📅 Choisissez l'horaire qui vous convient</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        ${teamBlock("On a hâte de voir vos premiers résultats. Si vous avez la moindre question avant le call, répondez simplement à cet email, on vous répond rapidement.")}

        <tr>
          <td align="center" style="padding:0 40px 40px 40px;background-color:#ffffff;" class="section-td">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background-color:#ffffff;border:1.5px solid #e4ecfa;border-radius:100px;padding:7px 16px;font-family:'Inter',Arial,sans-serif;font-size:13px;font-weight:500;color:#374151;" class="check-td c-strong">✓ 15 minutes chrono</td>
                <td width="8">&nbsp;</td>
                <td style="background-color:#ffffff;border:1.5px solid #e4ecfa;border-radius:100px;padding:7px 16px;font-family:'Inter',Arial,sans-serif;font-size:13px;font-weight:500;color:#374151;" class="check-td c-strong">✓ 100% gratuit</td>
                <td width="8">&nbsp;</td>
                <td style="background-color:#ffffff;border:1.5px solid #e4ecfa;border-radius:100px;padding:7px 16px;font-family:'Inter',Arial,sans-serif;font-size:13px;font-weight:500;color:#374151;" class="check-td c-strong">✓ Sans engagement</td>
              </tr>
            </table>
          </td>
        </tr>

        ${footer()}

      </table>
    </td>
  </tr>
</table>

</body>
</html>`;
  return { subject, html };
}
