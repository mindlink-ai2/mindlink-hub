export function getPlaybookHtml(): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sales Playbook – Lidmeo</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--blue:#2563EB;--blue-dark:#1d4ed8;--blue-light:#eff6ff;--blue-pale:#dbeafe;--blue-border:#bfdbfe;--text-primary:#0f172a;--text-secondary:#475569;--text-muted:#94a3b8;--bg:#f8fafc;--white:#ffffff;--border:#e2e8f0;--border-light:#f1f5f9;--green:#059669;--green-light:#ecfdf5;--green-border:#a7f3d0;--amber:#d97706;--amber-light:#fffbeb;--amber-border:#fde68a;--red:#dc2626;--red-light:#fef2f2;--red-border:#fecaca;--sidebar-w:256px;--r:10px;--r-lg:14px}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Plus Jakarta Sans',sans-serif;background:var(--bg);color:var(--text-primary);display:flex;min-height:100vh;font-size:14px;line-height:1.6;-webkit-font-smoothing:antialiased}
.sidebar{width:var(--sidebar-w);background:var(--white);border-right:1px solid var(--border);position:fixed;top:0;left:0;bottom:0;display:flex;flex-direction:column;z-index:100;overflow-y:auto;transition:transform .28s ease}
.sb-top{padding:20px 16px 8px}
.brand{display:flex;align-items:center;gap:10px;padding:4px;margin-bottom:22px}
.brand-logo{width:34px;height:34px;background:var(--blue);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.brand-name{font-size:15px;font-weight:700;color:var(--text-primary)}
.brand-sub{font-size:11px;color:var(--text-muted);font-weight:500}
.nav-lbl{font-size:10px;font-weight:700;color:var(--text-muted);letter-spacing:.08em;text-transform:uppercase;padding:10px 12px 4px}
.nb{display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;border-radius:8px;border:none;background:none;color:var(--text-secondary);font-family:'Plus Jakarta Sans',sans-serif;font-size:13.5px;font-weight:500;cursor:pointer;transition:all .15s;text-align:left;margin-bottom:1px;position:relative}
.nb:hover{background:var(--bg);color:var(--text-primary)}
.nb.active{background:var(--blue-light);color:var(--blue-dark);font-weight:600}
.nb.active::before{content:'';position:absolute;left:0;top:22%;bottom:22%;width:3px;background:var(--blue);border-radius:0 3px 3px 0}
.ni{font-size:14px;width:18px;text-align:center;flex-shrink:0}
.sb-foot{margin-top:auto;padding:16px;border-top:1px solid var(--border-light)}
.vtag{display:inline-flex;align-items:center;gap:5px;background:var(--blue-light);color:var(--blue);font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px;border:1px solid var(--blue-border)}
.main{margin-left:var(--sidebar-w);flex:1;min-height:100vh;display:flex;flex-direction:column}
.topbar{height:56px;background:rgba(255,255,255,.95);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;padding:0 32px;position:sticky;top:0;z-index:50}
.tb-left{display:flex;align-items:center;gap:12px}
.menu-btn{display:none;background:none;border:none;cursor:pointer;padding:6px;border-radius:6px;color:var(--text-secondary)}
.crumb{font-size:13px;color:var(--text-muted)}
.crumb b{color:var(--text-primary);font-weight:600}
.srch{position:relative;display:flex;align-items:center}
.srch svg{position:absolute;left:10px;color:var(--text-muted);pointer-events:none;width:14px;height:14px}
#si{font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:7px 12px 7px 32px;outline:none;width:210px;color:var(--text-primary)}
.content{flex:1;overflow-y:auto}
.sec{display:none;padding:36px 40px;max-width:860px}
.sec.on{display:block}
.hero{background:linear-gradient(135deg,#2563EB 0%,#1d4ed8 55%,#1e3a8a 100%);border-radius:var(--r-lg);padding:36px 40px;margin-bottom:26px;position:relative;overflow:hidden}
.hero::before{content:'';position:absolute;right:-50px;top:-50px;width:220px;height:220px;background:rgba(255,255,255,.06);border-radius:50%}
.hero-chip{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.9);font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:4px 12px;border-radius:20px;margin-bottom:14px}
.hero-title{font-size:26px;font-weight:700;color:#fff;letter-spacing:-.4px;line-height:1.25;margin-bottom:10px}
.hero-sub{font-size:14px;color:rgba(255,255,255,.75);max-width:480px;line-height:1.65}
h2{font-size:18px;font-weight:700;color:var(--text-primary);letter-spacing:-.3px;margin:32px 0 4px}
h2:first-child{margin-top:0}
.sdesc{font-size:13.5px;color:var(--text-secondary);margin-bottom:18px;line-height:1.65}
h3{font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin:28px 0 12px}
hr.dv{border:none;border-top:1px solid var(--border);margin:32px 0}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:22px}
.card{background:var(--white);border:1px solid var(--border);border-radius:var(--r);padding:18px 20px;transition:border-color .15s}
.card:hover{border-color:var(--blue-border)}
.ci{width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:17px;margin-bottom:12px}
.ci.b{background:var(--blue-light)}.ci.g{background:var(--green-light)}.ci.a{background:var(--amber-light)}
.ct{font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:5px}
.cb{font-size:12.5px;color:var(--text-secondary);line-height:1.6}
.co{display:flex;gap:12px;padding:14px 16px;border-radius:var(--r);margin:14px 0;font-size:13.5px;line-height:1.65}
.co-ic{font-size:16px;flex-shrink:0;margin-top:1px}.co-c{flex:1}.co-t{font-size:12.5px;font-weight:700;margin-bottom:2px}
.co.b{background:var(--blue-light);color:#1e40af;border:1px solid var(--blue-border)}.co.b .co-t{color:var(--blue-dark)}
.co.g{background:var(--green-light);color:#065f46;border:1px solid var(--green-border)}.co.g .co-t{color:var(--green)}
.co.a{background:var(--amber-light);color:#92400e;border:1px solid var(--amber-border)}.co.r{background:var(--red-light);color:#991b1b;border:1px solid var(--red-border)}
.steps{margin:14px 0}
.sr{display:flex;gap:14px;align-items:flex-start;margin-bottom:12px}
.sn{width:24px;height:24px;border-radius:50%;background:var(--blue);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}
.sn.d{background:var(--red)}.sn.s{background:var(--green)}
.st{font-size:13.5px;color:var(--text-secondary);line-height:1.65}
.st strong{color:var(--text-primary);font-weight:600}
.tags{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}
.tag{font-size:12px;font-weight:500;padding:4px 11px;border-radius:20px;background:var(--white);color:var(--text-secondary);border:1px solid var(--border)}
.tag.d{background:var(--red-light);color:var(--red);border-color:var(--red-border)}
.tag.s{background:var(--green-light);color:var(--green);border-color:var(--green-border)}
.tag.b{background:var(--blue-light);color:var(--blue);border-color:var(--blue-border)}
.tw{border:1px solid var(--border);border-radius:var(--r);overflow:hidden;margin:14px 0 22px}
table{width:100%;border-collapse:collapse;font-size:13px;background:var(--white)}
th{background:var(--bg);color:var(--text-secondary);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:10px 16px;text-align:left;border-bottom:1px solid var(--border)}
td{padding:11px 16px;color:var(--text-secondary);border-bottom:1px solid var(--border-light);vertical-align:top;font-size:13px}
td strong{color:var(--text-primary);font-weight:600}
tr:last-child td{border-bottom:none}
tr:hover td{background:var(--blue-light)}
.tg{color:var(--green);font-weight:700}
.mb{background:var(--white);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;margin:10px 0 22px}
.mh{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:var(--bg);border-bottom:1px solid var(--border)}
.mt{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:700;color:var(--text-muted);letter-spacing:.05em;text-transform:uppercase}
.md{width:6px;height:6px;border-radius:50%;background:var(--blue)}
.cbtn{display:flex;align-items:center;gap:5px;font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;font-weight:600;color:var(--blue);background:var(--blue-light);border:1px solid var(--blue-border);border-radius:6px;padding:5px 12px;cursor:pointer;transition:all .15s}
.cbtn:hover{background:var(--blue-pale)}
.cbtn.ok{color:var(--green);background:var(--green-light);border-color:var(--green-border)}
.cbtn svg{width:12px;height:12px}
.mbody{padding:18px 20px;font-size:13.5px;line-height:1.9;color:var(--text-primary);white-space:pre-wrap}
.ai{background:var(--white);border:1px solid var(--border);border-radius:var(--r);margin-bottom:6px;overflow:hidden;transition:border-color .15s}
.ai:hover{border-color:var(--blue-border)}
.ai.on{border-color:var(--blue-border)}
.ab{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:15px 18px;border:none;background:none;font-family:'Plus Jakarta Sans',sans-serif;font-size:13.5px;font-weight:600;color:var(--text-primary);cursor:pointer;text-align:left;transition:background .15s}
.ab:hover{background:var(--bg)}
.ai.on .ab{background:var(--blue-light);color:var(--blue-dark)}
.ach{width:22px;height:22px;border-radius:50%;background:var(--bg);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--text-muted);transition:transform .2s;font-size:10px}
.ai.on .ach{transform:rotate(180deg);background:var(--blue);border-color:var(--blue);color:#fff}
.ac{display:none;padding:0 18px 18px;border-top:1px solid var(--border-light)}
.ai.on .ac{display:block}
.actx{font-size:12px;color:var(--text-muted);font-style:italic;margin:12px 0 10px}
.ares{background:var(--bg);border-left:3px solid var(--blue);border-radius:0 8px 8px 0;padding:14px 16px;font-size:13.5px;color:var(--text-primary);line-height:1.85;white-space:pre-wrap}
.pg{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0 24px}
.pc{background:var(--white);border:1px solid var(--border);border-radius:var(--r-lg);padding:24px;position:relative}
.pc.ft{border:2px solid var(--blue)}
.fpill{position:absolute;top:-13px;left:50%;transform:translateX(-50%);background:var(--blue);color:#fff;font-size:11px;font-weight:700;padding:4px 14px;border-radius:20px;white-space:nowrap}
.pn{font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:3px}
.pd{font-size:12px;color:var(--text-muted);margin-bottom:16px}
.pp{font-size:28px;font-weight:700;color:var(--text-primary);letter-spacing:-.5px}
.pp sub{font-size:14px;font-weight:400;color:var(--text-muted);vertical-align:baseline}
.pr{margin:14px 0}
.prr{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border-light);font-size:12.5px}
.prr:last-child{border-bottom:none}
.prl{color:var(--text-secondary)}.prv{font-weight:700;color:var(--text-primary)}
.pf{list-style:none;margin-top:14px}
.pf li{font-size:12.5px;color:var(--text-secondary);padding:4px 0;display:flex;align-items:flex-start;gap:8px}
.pf li::before{content:'';width:5px;height:5px;border-radius:50%;background:var(--blue);flex-shrink:0;margin-top:7px}
.cbox{background:var(--green-light);border:1px solid var(--green-border);border-radius:var(--r-lg);padding:22px 24px;margin:16px 0}
.cbox h3{color:var(--green);margin-top:0}
.cn{font-size:13px;color:#065f46;margin-bottom:16px;line-height:1.65}
.wac{background:var(--white);border:1px solid var(--border);border-radius:var(--r);padding:16px 18px;margin-bottom:8px;display:flex;gap:14px;align-items:flex-start}
.wac:hover{border-color:var(--blue-border)}
.wai{width:40px;height:40px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
.wan{font-size:13.5px;font-weight:700;color:var(--text-primary);margin-bottom:3px}
.wad{font-size:12.5px;color:var(--text-secondary);line-height:1.6}
kbd{font-family:monospace;font-size:11.5px;background:var(--bg);border:1px solid var(--border);border-bottom-width:2px;border-radius:5px;padding:1px 7px;color:var(--text-primary)}
mark{background:#fef08a;border-radius:2px;padding:0 2px}
.overlay{display:none;position:fixed;inset:0;background:rgba(15,23,42,.4);z-index:99}
.sc-tab{display:flex;align-items:center;gap:12px;padding:14px 16px;background:var(--white);border:1px solid var(--border);border-radius:var(--r);cursor:pointer;text-align:left;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;color:var(--text-primary)}
.sc-tab:hover{border-color:var(--blue-border);background:var(--blue-light)}
.sc-tab.active{border:2px solid var(--blue);background:var(--blue-light);color:var(--blue-dark)}
.scenario{display:none}
.scenario.on{display:block}
.sc-context{display:flex;gap:12px;align-items:flex-start;background:var(--amber-light);border:1px solid var(--amber-border);border-radius:var(--r);padding:14px 16px;margin-bottom:20px;font-size:13px;color:#78350f;line-height:1.65}
.sc-ctx-icon{font-size:18px;flex-shrink:0;margin-top:1px}
.conv-thread{background:var(--white);border:1px solid var(--border);border-radius:var(--r-lg);padding:20px 22px}
.conv-prospect{background:var(--bg);border:1px solid var(--border);border-radius:12px 12px 12px 4px;padding:11px 16px;font-size:13.5px;color:var(--text-secondary);font-style:italic;display:inline-block;margin-bottom:16px;max-width:90%}
.conv-step-label{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:700;color:var(--text-muted);letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px}
.step-pill{padding:2px 9px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.04em}
.step-1{background:var(--blue-light);color:var(--blue-dark)}
.step-2{background:var(--amber-light);color:var(--amber)}
.step-3{background:var(--green-light);color:var(--green)}
.conv-you{background:var(--blue-light);border-radius:4px 12px 12px 12px;padding:14px 16px;margin-bottom:6px;position:relative;border:1px solid var(--blue-border)}
.conv-you-text{font-size:13.5px;color:#1e3a8a;line-height:1.85;white-space:pre-wrap;padding-right:70px}
.conv-copy{position:absolute;top:10px;right:10px;display:flex;align-items:center;gap:4px;font-family:'Plus Jakarta Sans',sans-serif;font-size:11px;font-weight:600;color:var(--blue);background:rgba(255,255,255,.8);border:1px solid var(--blue-border);border-radius:6px;padding:4px 9px;cursor:pointer;transition:all .15s}
.conv-copy:hover{background:var(--white)}
.conv-copy.ok{color:var(--green);border-color:var(--green-border)}
.conv-copy svg{width:11px;height:11px}
.sc-goal{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--text-muted);margin-bottom:16px;font-weight:500}
.goal-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.goal-dot.qualify{background:var(--blue)}.goal-dot.essai{background:var(--green)}.goal-dot.close{background:#f59e0b}.goal-dot.neutral{background:var(--text-muted)}
.conv-branch-label{font-size:12px;font-weight:600;color:var(--text-muted);text-align:center;padding:8px 0;border-top:1px dashed var(--border);border-bottom:1px dashed var(--border);margin:4px 0 16px}
.conv-branches{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px}
.conv-branch-block{background:var(--bg);border-radius:var(--r);padding:14px}
.conv-prospect-sub{font-size:12px;font-style:italic;color:var(--text-secondary);background:var(--white);border:1px solid var(--border);border-radius:6px 6px 4px 4px;padding:8px 12px;margin-bottom:10px;border-left:3px solid var(--border)}
@keyframes spin{to{transform:rotate(360deg)}}
.spin{width:14px;height:14px;border:2px solid var(--border);border-top-color:var(--blue);border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0}
@media(max-width:768px){.sidebar{transform:translateX(-100%)}.sidebar.open{transform:translateX(0)}.overlay.open{display:block}.main{margin-left:0}.sec{padding:24px 18px}.g2,.pg,.conv-branches{grid-template-columns:1fr}.menu-btn{display:flex}.topbar{padding:0 16px}#si{width:150px}}
</style>
</head>
<body>
<div class="overlay" id="ov" onclick="closeSB()"></div>
<aside class="sidebar" id="sb">
  <div class="sb-top">
    <div class="brand">
      <div class="brand-logo"><svg viewBox="0 0 20 20" fill="none" width="20" height="20"><path d="M10 2L18 6.5V13.5L10 18L2 13.5V6.5L10 2Z" stroke="white" stroke-width="1.6"/><circle cx="10" cy="10" r="3" fill="white" opacity=".9"/></svg></div>
      <div><div class="brand-name">Lidmeo</div><div class="brand-sub">Sales Playbook</div></div>
    </div>
    <div class="nav-lbl">Démarrer</div>
    <button class="nb active" id="nav-intro" onclick="show('intro',this)"><span class="ni">🏠</span>Bienvenue</button>
    <button class="nb" id="nav-produit" onclick="show('produit',this)"><span class="ni">📦</span>Le produit</button>
    <button class="nb" id="nav-icp" onclick="show('icp',this)"><span class="ni">🎯</span>Notre ICP</button>
    <div class="nav-lbl">Vendre</div>
    <button class="nb" id="nav-scripts" onclick="show('scripts',this)"><span class="ni">💬</span>Scripts</button>
    <button class="nb" id="nav-iacoach" onclick="show('iacoach',this)"><span class="ni">🤖</span>IA Coach</button>
    <button class="nb" id="nav-objections" onclick="show('objections',this)"><span class="ni">🛡️</span>Objections</button>
    <button class="nb" id="nav-closing" onclick="show('closing',this)"><span class="ni">✅</span>Quand ça dit oui</button>
    <div class="nav-lbl">Infos</div>
    <button class="nb" id="nav-pricing" onclick="show('pricing',this)"><span class="ni">💰</span>Prix &amp; commissions</button>
    <button class="nb" id="nav-reporting" onclick="show('reporting',this)"><span class="ni">📊</span>Reporting</button>
    <button class="nb" id="nav-faq" onclick="show('faq',this)"><span class="ni">❓</span>FAQ interne</button>
  </div>
  <div class="sb-foot"><div class="vtag">v1.0 · mars 2026</div></div>
</aside>

<div class="main">
  <div class="topbar">
    <div class="tb-left">
      <button class="menu-btn" id="menu-btn" onclick="toggleSB()"><svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
      <div class="crumb">Sales Playbook · <b id="crumb">Bienvenue</b></div>
    </div>
    <div class="srch">
      <svg viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.2" stroke="currentColor" stroke-width="1.4"/><path d="M9.2 9.2L12 12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
      <input id="si" type="text" placeholder="Rechercher..." oninput="doSearch(this.value)">
    </div>
  </div>

  <div class="content" id="main-content">

  <!-- BIENVENUE -->
  <div class="sec on" id="s-intro">
    <div class="hero">
      <div class="hero-chip">Lidmeo · Sales Playbook</div>
      <div class="hero-title">Bienvenue 👋</div>
      <div class="hero-sub">Ce doc est là pour t'aider à avoir de bonnes conversations avec les prospects. Garde-le ouvert et navigue selon ce dont tu as besoin.</div>
    </div>

    <div style="background:var(--white);border:1px solid var(--border);border-radius:var(--r-lg);padding:24px 28px;margin-bottom:28px;display:flex;gap:20px;align-items:flex-start;">
      <div style="width:44px;height:44px;border-radius:12px;background:var(--blue-light);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 2L18 6.5V13.5L10 18L2 13.5V6.5L10 2Z" stroke="#2563EB" stroke-width="1.6"/><circle cx="10" cy="10" r="3" fill="#2563EB" opacity=".7"/></svg>
      </div>
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:6px;">C'est quoi Lidmeo ?</div>
        <div style="font-size:14px;color:var(--text-secondary);line-height:1.75;">Lidmeo automatise la prospection LinkedIn pour les fondateurs d'agences. Chaque matin, des messages personnalisés sont envoyés à des prospects qualifiés en leur nom. Le fondateur ne gère que les réponses.</div>
      </div>
    </div>

    <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:14px;">Comment ça marche de ton côté</div>
    <div style="position:relative;margin-bottom:28px;">
      <div style="position:absolute;left:17px;top:28px;bottom:28px;width:1px;background:var(--border);"></div>
      <div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:4px;">
        <div style="width:34px;height:34px;border-radius:50%;background:var(--bg);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--text-muted);flex-shrink:0;z-index:1;">1</div>
        <div style="background:var(--white);border:1px solid var(--border);border-radius:var(--r);padding:14px 18px;flex:1;margin-bottom:6px;"><div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:3px;">Lidmeo envoie le 1er message</div><div style="font-size:12.5px;color:var(--text-secondary);line-height:1.65;">Un message automatique est envoyé à un prospect LinkedIn ciblé. Tu n'as rien à faire à cette étape.</div></div>
      </div>
      <div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:4px;">
        <div style="width:34px;height:34px;border-radius:50%;background:var(--bg);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--text-muted);flex-shrink:0;z-index:1;">2</div>
        <div style="background:var(--white);border:1px solid var(--border);border-radius:var(--r);padding:14px 18px;flex:1;margin-bottom:6px;"><div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:3px;">Le prospect répond</div><div style="font-size:12.5px;color:var(--text-secondary);line-height:1.65;">La conversation t'est attribuée. C'est là que tu entres en jeu.</div></div>
      </div>
      <div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:4px;">
        <div style="width:34px;height:34px;border-radius:50%;background:var(--blue);border:1px solid var(--blue-dark);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:white;flex-shrink:0;z-index:1;">3</div>
        <div style="background:var(--blue-light);border:1px solid var(--blue-border);border-radius:var(--r);padding:14px 18px;flex:1;margin-bottom:6px;"><div style="font-size:13px;font-weight:700;color:var(--blue-dark);margin-bottom:3px;">Tu prends la conversation → ton rôle</div><div style="font-size:12.5px;color:#1e40af;line-height:1.65;">Tu contactes le prospect par message ou par appel. Tu lui expliques Lidmeo et tu le closes sur l'essai gratuit de 7 jours. Peu importe comment tu travailles, l'essentiel c'est qu'il s'inscrive via ton lien affilié.</div></div>
      </div>
      <div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:4px;">
        <div style="width:34px;height:34px;border-radius:50%;background:var(--bg);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--text-muted);flex-shrink:0;z-index:1;">4</div>
        <div style="background:var(--white);border:1px solid var(--border);border-radius:var(--r);padding:14px 18px;flex:1;margin-bottom:6px;"><div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:3px;">Il s'inscrit via ton lien</div><div style="font-size:12.5px;color:var(--text-secondary);line-height:1.65;">L'équipe Lidmeo configure tout à sa place et gère l'onboarding. Tu n'as plus rien à faire.</div></div>
      </div>
      <div style="display:flex;gap:16px;align-items:flex-start;">
        <div style="width:34px;height:34px;border-radius:50%;background:var(--green-light);border:1px solid var(--green-border);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--green);flex-shrink:0;z-index:1;">5</div>
        <div style="background:var(--green-light);border:1px solid var(--green-border);border-radius:var(--r);padding:14px 18px;flex:1;"><div style="font-size:13px;font-weight:700;color:#065f46;margin-bottom:3px;">Ta commission tombe 💰</div><div style="font-size:12.5px;color:#065f46;line-height:1.65;">Comptabilisée automatiquement dès son inscription, et chaque mois qu'il reste client.</div></div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:28px;">
      <div style="background:var(--white);border:1px solid var(--border);border-radius:var(--r-lg);padding:20px 22px;">
        <div style="font-size:12px;font-weight:700;color:var(--text-primary);letter-spacing:.04em;text-transform:uppercase;margin-bottom:14px;display:flex;align-items:center;gap:7px;"><div style="width:6px;height:6px;border-radius:50%;background:var(--blue)"></div>Tu fais</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div style="display:flex;align-items:center;gap:9px;font-size:13px;color:var(--text-secondary);"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l4 4 6-6" stroke="#2563EB" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>Contacter le prospect, par message ou appel</div>
          <div style="display:flex;align-items:center;gap:9px;font-size:13px;color:var(--text-secondary);"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l4 4 6-6" stroke="#2563EB" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>Comprendre sa situation et expliquer Lidmeo</div>
          <div style="display:flex;align-items:center;gap:9px;font-size:13px;color:var(--text-secondary);"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l4 4 6-6" stroke="#2563EB" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>Le closer sur l'essai gratuit</div>
          <div style="display:flex;align-items:center;gap:9px;font-size:13px;color:var(--text-secondary);"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l4 4 6-6" stroke="#2563EB" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>Lui envoyer ton lien affilié</div>
        </div>
      </div>
      <div style="background:var(--white);border:1px solid var(--border);border-radius:var(--r-lg);padding:20px 22px;">
        <div style="font-size:12px;font-weight:700;color:var(--text-primary);letter-spacing:.04em;text-transform:uppercase;margin-bottom:14px;display:flex;align-items:center;gap:7px;"><div style="width:6px;height:6px;border-radius:50%;background:var(--text-muted)"></div>Pas ton rôle</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div style="display:flex;align-items:center;gap:9px;font-size:13px;color:var(--text-muted);"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/></svg>Envoyer le 1er message</div>
          <div style="display:flex;align-items:center;gap:9px;font-size:13px;color:var(--text-muted);"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/></svg>Choisir les prospects</div>
          <div style="display:flex;align-items:center;gap:9px;font-size:13px;color:var(--text-muted);"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/></svg>Onboarder le client</div>
          <div style="display:flex;align-items:center;gap:9px;font-size:13px;color:var(--text-muted);"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/></svg>Gérer le support technique</div>
        </div>
      </div>
    </div>

    <div style="background:var(--bg);border-left:3px solid var(--blue);border-radius:0 var(--r) var(--r) 0;padding:18px 22px;margin-bottom:28px;">
      <div style="font-size:13px;color:var(--text-primary);line-height:1.75;">Pas besoin de convaincre à tout prix. L'essai est gratuit et sans engagement. La plupart des gens qui hésitent ont juste besoin de comprendre, pas d'être poussés.</div>
    </div>

    <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:12px;">Ce que tu trouveras dans ce doc</div>
    <div class="g2">
      <div class="card" style="cursor:pointer;display:flex;gap:14px;align-items:flex-start;" onclick="show('scripts',document.getElementById('nav-scripts'))"><div style="width:36px;height:36px;border-radius:9px;background:var(--blue-light);display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;">💬</div><div><div class="ct">Scripts</div><div class="cb">Messages prêts selon la réponse du prospect.</div></div></div>
      <div class="card" style="cursor:pointer;display:flex;gap:14px;align-items:flex-start;" onclick="show('iacoach',document.getElementById('nav-iacoach'))"><div style="width:36px;height:36px;border-radius:9px;background:var(--green-light);display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;">🤖</div><div><div class="ct">IA Coach</div><div class="cb">L'IA génère une réponse sur mesure en 10 secondes.</div></div></div>
      <div class="card" style="cursor:pointer;display:flex;gap:14px;align-items:flex-start;" onclick="show('objections',document.getElementById('nav-objections'))"><div style="width:36px;height:36px;border-radius:9px;background:var(--amber-light);display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;">🛡️</div><div><div class="ct">Objections</div><div class="cb">Réponses aux hésitations et questions fréquentes.</div></div></div>
      <div class="card" style="cursor:pointer;display:flex;gap:14px;align-items:flex-start;" onclick="show('pricing',document.getElementById('nav-pricing'))"><div style="width:36px;height:36px;border-radius:9px;background:var(--green-light);display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;">💰</div><div><div class="ct">Prix &amp; commissions</div><div class="cb">Tarifs et détail de tes commissions récurrentes.</div></div></div>
    </div>
  </div>

  <!-- PRODUIT -->
  <div class="sec" id="s-produit">
    <h2>Le produit Lidmeo</h2>
    <div class="sdesc">Lidmeo automatise toute la prospection LinkedIn. Chaque matin du lundi au vendredi, de nouveaux prospects qualifiés reçoivent un message personnalisé en nom du client. Le client ne gère que les réponses.</div>
    <div class="co b"><span class="co-ic">⚡</span><div class="co-c"><div class="co-t">À retenir par coeur</div>Les clients Lidmeo gagnent en moyenne <strong>10h par semaine</strong> et maintiennent un flux régulier de conversations qualifiées, même quand ils sont à 100% sur un projet client.</div></div>
    <h3>Les deux offres</h3>
    <div class="pg">
      <div class="pc">
        <div class="pn">Essential</div><div class="pd">Vous envoyez les messages</div>
        <div class="pr">
          <div class="prr"><span class="prl">10 prospects/jour · lundi au vendredi</span><span class="prv">49€/mois</span></div>
          <div class="prr"><span class="prl">20 prospects/jour · lundi au vendredi</span><span class="prv">69€/mois</span></div>
          <div class="prr"><span class="prl">30 prospects/jour · lundi au vendredi</span><span class="prv">89€/mois</span></div>
        </div>
        <ul class="pf"><li>Profil LinkedIn complet de chaque prospect</li><li>Email professionnel vérifié</li><li>Téléphone si disponible</li><li>Dashboard de suivi</li></ul>
      </div>
      <div class="pc ft">
        <div class="fpill">⭐ Le plus populaire</div>
        <div class="pn">Full Automatisé</div><div class="pd">On s'occupe de tout</div>
        <div class="pp">199€ <sub>/mois</sub></div>
        <ul class="pf" style="margin-top:16px"><li>100% automatisé, vous ne faites rien</li><li>Jusqu'à 330 prospects/mois (15/jour ouvré)</li><li>Demandes de connexion automatiques</li><li>Premier message personnalisé auto</li><li>Relances automatiques si pas de réponse</li><li>Gain estimé : <strong>10h/semaine</strong></li></ul>
      </div>
    </div>
    <h3>Ce qu'ils reçoivent concrètement</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
      <div style="background:var(--white);border:1px solid var(--border);border-radius:var(--r);padding:16px 18px;"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;"><div style="width:32px;height:32px;border-radius:8px;background:var(--blue-light);display:flex;align-items:center;justify-content:center;font-size:16px;">🎯</div><div style="font-size:13px;font-weight:700;color:var(--text-primary);">Leads qualifiés chaque matin</div></div><div style="font-size:12.5px;color:var(--text-secondary);line-height:1.7;">Des prospects ciblés selon le secteur d'activité choisi, livrés tous les jours du lundi au vendredi.</div></div>
      <div style="background:var(--white);border:1px solid var(--border);border-radius:var(--r);padding:16px 18px;"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;"><div style="width:32px;height:32px;border-radius:8px;background:var(--blue-light);display:flex;align-items:center;justify-content:center;font-size:16px;">🤝</div><div style="font-size:13px;font-weight:700;color:var(--text-primary);">Fiche complète de chaque prospect</div></div><div style="font-size:12.5px;color:var(--text-secondary);line-height:1.7;">Profil LinkedIn, email professionnel vérifié et numéro de téléphone si disponible.</div></div>
      <div style="background:var(--white);border:1px solid var(--border);border-radius:var(--r);padding:16px 18px;"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;"><div style="width:32px;height:32px;border-radius:8px;background:var(--green-light);display:flex;align-items:center;justify-content:center;font-size:16px;">✍️</div><div style="font-size:13px;font-weight:700;color:var(--text-primary);">Message prêt à envoyer</div></div><div style="font-size:12.5px;color:var(--text-secondary);line-height:1.7;">Pour chaque prospect, un message personnalisé est déjà rédigé. Il envoie en un clic.</div></div>
      <div style="background:var(--white);border:1px solid var(--border);border-radius:var(--r);padding:16px 18px;"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;"><div style="width:32px;height:32px;border-radius:8px;background:var(--amber-light);display:flex;align-items:center;justify-content:center;font-size:16px;">💬</div><div style="font-size:13px;font-weight:700;color:var(--text-primary);">Conversations LinkedIn intégrées</div></div><div style="font-size:12.5px;color:var(--text-secondary);line-height:1.7;">Les échanges LinkedIn sont directement intégrés dans la plateforme Lidmeo.</div></div>
    </div>
    <div style="background:var(--blue-light);border:1px solid var(--blue-border);border-radius:var(--r);padding:14px 18px;display:flex;align-items:center;gap:12px;"><div style="width:32px;height:32px;border-radius:8px;background:var(--blue);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">📊</div><div><div style="font-size:13px;font-weight:700;color:var(--blue-dark);margin-bottom:2px;">Dashboard de suivi centralisé</div><div style="font-size:12.5px;color:#1e40af;line-height:1.65;">Tout est regroupé dans la plateforme : les prospects du jour, les messages envoyés, les réponses reçues et l'historique des conversations.</div></div></div>
  </div>

  <!-- ICP -->
  <div class="sec" id="s-icp">
    <h2>Notre client idéal (ICP)</h2>
    <h3>Profil cible</h3>
    <div class="tw"><table><tr><th>Critère</th><th>Détail</th></tr><tr><td>Qui</td><td><strong>Fondateur(trice) d'agence digitale B2B</strong></td></tr><tr><td>Taille</td><td>3 à 12 personnes</td></tr><tr><td>Type d'agence</td><td>Communication, marketing, dev, SEO, conseil</td></tr><tr><td>Modèle</td><td>B2B, vend à des entreprises</td></tr><tr><td>Commercial dédié</td><td>Aucun, c'est le fondateur qui prospecte</td></tr><tr><td>Niveau LinkedIn</td><td>Actif ou voudrait l'être</td></tr></table></div>
    <h3>Leurs douleurs</h3>
    <div class="steps">
      <div class="sr"><div class="sn d">!</div><div class="st">Passe des heures chaque semaine à chercher des prospects manuellement sur LinkedIn</div></div>
      <div class="sr"><div class="sn d">!</div><div class="st">Prospection irrégulière : quand il a des clients, il arrête de prospecter et se retrouve sans pipeline 3 mois plus tard</div></div>
      <div class="sr"><div class="sn d">!</div><div class="st">Pas de scalabilité : impossible de prospecter plus sans embaucher quelqu'un</div></div>
      <div class="sr"><div class="sn d">!</div><div class="st">Messages trop génériques qui ne convertissent pas</div></div>
    </div>
    <h3>Ce qui les convainc de tester</h3>
    <div class="steps">
      <div class="sr"><div class="sn s">+</div><div class="st">Gain de temps immédiat, <strong>10h/semaine récupérées</strong></div></div>
      <div class="sr"><div class="sn s">+</div><div class="st">Pipeline prévisible, des prospects arrivent chaque jour ouvré même pendant les projets</div></div>
      <div class="sr"><div class="sn s">+</div><div class="st">Aucun engagement, ils testent sans risque</div></div>
      <div class="sr"><div class="sn s">+</div><div class="st">On configure tout à leur place, zéro effort technique de leur côté</div></div>
    </div>
    <hr class="dv">
    <h3>Signaux qu'un prospect est chaud</h3>
    <div class="tags"><span class="tag b">Répond rapidement</span><span class="tag b">Pose des questions précises</span><span class="tag b">Dit "j'ai exactement ce problème"</span><span class="tag b">Compare les deux offres</span><span class="tag b">Demande le prix</span><span class="tag b">Parle au présent</span><span class="tag b">Dit "je vais en parler à mon associé"</span></div>
  </div>

  <!-- SCRIPTS -->
  <div class="sec" id="s-scripts">
    <h2>Scripts &amp; arbre de décision</h2>
    <div class="sdesc">Sélectionne la réponse du prospect pour voir exactement quoi écrire.</div>

    <div style="margin-bottom:24px;">
      <h3>Message automatique envoyé</h3>
      <div style="background:var(--blue-light);border:1px solid var(--blue-border);border-radius:var(--r);overflow:hidden;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:rgba(37,99,235,.06);border-bottom:1px solid var(--blue-border);">
          <div style="display:flex;align-items:center;gap:8px;font-size:11px;font-weight:700;color:var(--blue-dark);letter-spacing:.05em;text-transform:uppercase;"><div style="width:6px;height:6px;border-radius:50%;background:var(--blue)"></div>Envoyé automatiquement par Lidmeo</div>
          <button class="cbtn" onclick="copyEl('auto-msg',this)"><svg viewBox="0 0 12 12" fill="none"><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M2 8V2h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>Copier</button>
        </div>
        <div id="auto-msg" style="padding:16px 20px;font-size:13.5px;line-height:1.9;color:#1e3a8a;white-space:pre-wrap;">Bonjour {prénom},

J'ai vu que tu dirigeais {nom_agence}, du coup je me permets de te contacter directement.

On travaille avec des fondateurs d'agences digitales pour automatiser leur prospection LinkedIn. Concrètement, pendant qu'ils sont à fond sur leurs projets clients, on s'occupe de trouver de nouveaux prospects en leur nom, d'envoyer les messages et de faire les relances. Ils n'ont plus qu'à gérer les conversations avec les gens qui répondent.

Tu serais partant pour en discuter 10 minutes ?</div>
      </div>
    </div>

    <h3>Le prospect répond, clique sur sa réponse</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;">
      <button class="sc-tab active" onclick="selectSc('curious',this)"><span style="font-size:16px;">💬</span><div><div style="font-weight:700;font-size:13px;">"C'est quoi exactement ?"</div><div style="font-size:11px;opacity:.7;margin-top:2px;">Curieux, veut comprendre</div></div></button>
      <button class="sc-tab" onclick="selectSc('how',this)"><span style="font-size:16px;">⚙️</span><div><div style="font-weight:700;font-size:13px;">"Comment ça marche ?"</div><div style="font-size:11px;opacity:.7;margin-top:2px;">Intéressé, veut des détails</div></div></button>
      <button class="sc-tab" onclick="selectSc('price',this)"><span style="font-size:16px;">💰</span><div><div style="font-weight:700;font-size:13px;">"C'est combien ?"</div><div style="font-size:11px;opacity:.7;margin-top:2px;">Signal d'intérêt fort</div></div></button>
      <button class="sc-tab" onclick="selectSc('no',this)"><span style="font-size:16px;">🚫</span><div><div style="font-weight:700;font-size:13px;">"Pas intéressé"</div><div style="font-size:11px;opacity:.7;margin-top:2px;">Refus ou on gère déjà</div></div></button>
    </div>

    <div class="scenario on" id="sc-curious">
      <div class="sc-context"><div class="sc-ctx-icon">💡</div><div><strong>Contexte :</strong> Il n'a pas bien saisi le 1er message. C'est une ouverture, ne pas pitcher tout de suite. Répondre court et retourner une question de qualification.</div></div>
      <div class="conv-thread">
        <div class="conv-prospect">"C'est quoi exactement ?"</div>
        <div class="conv-step-label">Tu réponds <span class="step-pill step-1">Étape 1</span></div>
        <div class="conv-you"><div class="conv-you-text" id="sc1-m1">On s'occupe de ta prospection LinkedIn à ta place. Tu continues de bosser sur tes projets, on envoie des messages à des prospects qui correspondent à ta cible, et toi tu gères uniquement ceux qui répondent.

Tu prospectes comment en ce moment ?</div><button class="conv-copy" onclick="copyEl('sc1-m1',this)"><svg viewBox="0 0 12 12" fill="none"><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M2 8V2h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>Copier</button></div>
        <div class="sc-goal"><span class="goal-dot qualify"></span>Objectif : qualifier avant de pitcher</div>
        <div class="conv-branch-label">Selon sa réponse →</div>
        <div class="conv-branches">
          <div class="conv-branch-block">
            <div class="conv-prospect-sub">Il prospecte manuellement</div>
            <div class="conv-step-label">Tu réponds <span class="step-pill step-2">Étape 2a</span></div>
            <div class="conv-you"><div class="conv-you-text" id="sc1-m2a">C'est exactement ce qu'on règle. Au lieu que ce soit toi qui cherches et envoies les messages, on le fait en ton nom tous les matins.

Les agences avec qui on travaille récupèrent facilement 10h par semaine. On a un essai gratuit de 7 jours si tu veux voir ce que ça donne.</div><button class="conv-copy" onclick="copyEl('sc1-m2a',this)"><svg viewBox="0 0 12 12" fill="none"><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M2 8V2h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>Copier</button></div>
            <div class="sc-goal"><span class="goal-dot essai"></span>Objectif : proposer l'essai</div>
          </div>
          <div class="conv-branch-block">
            <div class="conv-prospect-sub">Il ne prospecte pas encore</div>
            <div class="conv-step-label">Tu réponds <span class="step-pill step-2">Étape 2b</span></div>
            <div class="conv-you"><div class="conv-you-text" id="sc1-m2b">C'est le bon moment pour démarrer sans avoir à y passer du temps toi-même. On configure tout, tu vois les résultats sur 7 jours, et tu décides après.</div><button class="conv-copy" onclick="copyEl('sc1-m2b',this)"><svg viewBox="0 0 12 12" fill="none"><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M2 8V2h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>Copier</button></div>
            <div class="sc-goal"><span class="goal-dot essai"></span>Objectif : proposer l'essai</div>
          </div>
        </div>
        <div class="conv-branch-label">Il dit oui →</div>
        <div class="conv-step-label">Tu envoies <span class="step-pill step-3">Clôture</span></div>
        <div class="conv-you"><div class="conv-you-text" id="sc1-close">Super, voici ton lien pour démarrer l'essai gratuit de 7 jours : [TON LIEN AFFILIÉ]

On s'occupe de la configuration de ton côté dès que tu es inscrit.</div><button class="conv-copy" onclick="copyEl('sc1-close',this)"><svg viewBox="0 0 12 12" fill="none"><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M2 8V2h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>Copier</button></div>
      </div>
    </div>

    <div class="scenario" id="sc-how">
      <div class="sc-context"><div class="sc-ctx-icon">💡</div><div><strong>Contexte :</strong> Il est intéressé et curieux du fonctionnement. Ne pas tout détailler, répondre en 3 lignes puis qualifier sa cible.</div></div>
      <div class="conv-thread">
        <div class="conv-prospect">"Comment ça marche ?"</div>
        <div class="conv-step-label">Tu réponds <span class="step-pill step-1">Étape 1</span></div>
        <div class="conv-you"><div class="conv-you-text" id="sc2-m1">On identifie chaque jour des profils LinkedIn qui correspondent à ta cible, on envoie un message personnalisé en ton nom, et on relance si pas de réponse. Toi tu vois arriver uniquement les gens qui ont répondu.

C'est quoi ta cible en ce moment ? Le type de clients que tu cherches à développer ?</div><button class="conv-copy" onclick="copyEl('sc2-m1',this)"><svg viewBox="0 0 12 12" fill="none"><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M2 8V2h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>Copier</button></div>
        <div class="sc-goal"><span class="goal-dot qualify"></span>Objectif : qualifier la cible</div>
        <div class="conv-branch-label">Selon sa réponse →</div>
        <div class="conv-branches">
          <div class="conv-branch-block">
            <div class="conv-prospect-sub">Il décrit sa cible</div>
            <div class="conv-step-label">Tu réponds <span class="step-pill step-2">Étape 2a</span></div>
            <div class="conv-you"><div class="conv-you-text" id="sc2-m2a">C'est exactement ce qu'on sait cibler. On te configure ça et on lance un essai de 7 jours, tu vois concrètement les profils qu'on t'amène et tu juges par toi-même. Ça te dit ?</div><button class="conv-copy" onclick="copyEl('sc2-m2a',this)"><svg viewBox="0 0 12 12" fill="none"><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M2 8V2h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>Copier</button></div>
            <div class="sc-goal"><span class="goal-dot essai"></span>Objectif : proposer l'essai</div>
          </div>
          <div class="conv-branch-block">
            <div class="conv-prospect-sub">Il pose des questions techniques</div>
            <div class="conv-step-label">Tu réponds <span class="step-pill step-2">Étape 2b</span></div>
            <div class="conv-you"><div class="conv-you-text" id="sc2-m2b">Ça passe par ton compte LinkedIn, les messages sont écrits dans ton style donc rien ne ressemble à quelque chose d'automatisé. Le mieux c'est de voir en pratique, un essai de 7 jours et tu vois exactement ce que reçoivent tes prospects.</div><button class="conv-copy" onclick="copyEl('sc2-m2b',this)"><svg viewBox="0 0 12 12" fill="none"><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M2 8V2h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>Copier</button></div>
            <div class="sc-goal"><span class="goal-dot essai"></span>Objectif : proposer l'essai</div>
          </div>
        </div>
        <div class="conv-branch-label">Il dit oui →</div>
        <div class="conv-step-label">Tu envoies <span class="step-pill step-3">Clôture</span></div>
        <div class="conv-you"><div class="conv-you-text" id="sc2-close">Super, voici ton lien pour démarrer l'essai gratuit de 7 jours : [TON LIEN AFFILIÉ]

On s'occupe de la configuration de ton côté dès que tu es inscrit.</div><button class="conv-copy" onclick="copyEl('sc2-close',this)"><svg viewBox="0 0 12 12" fill="none"><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M2 8V2h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>Copier</button></div>
      </div>
    </div>

    <div class="scenario" id="sc-price">
      <div class="sc-context"><div class="sc-ctx-icon">🔥</div><div><strong>Contexte :</strong> Signal d'intérêt fort, il pense déjà à acheter. Donner les prix clairement et proposer l'essai dans le même message.</div></div>
      <div class="conv-thread">
        <div class="conv-prospect">"C'est combien ?"</div>
        <div class="conv-step-label">Tu réponds <span class="step-pill step-1">Message direct</span></div>
        <div class="conv-you"><div class="conv-you-text" id="sc3-m1">Deux formules.

Essential à 49€/mois, on te livre chaque matin des profils qualifiés et c'est toi qui envoies les messages.

Full Automatisé à 199€/mois, on gère tout de bout en bout et tu reçois uniquement les réponses des gens intéressés.

Dans les deux cas il y a un essai gratuit de 7 jours. Tu veux qu'on démarre ?</div><button class="conv-copy" onclick="copyEl('sc3-m1',this)"><svg viewBox="0 0 12 12" fill="none"><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M2 8V2h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>Copier</button></div>
        <div class="sc-goal"><span class="goal-dot close"></span>Objectif : closer direct</div>
        <div class="conv-branch-label">Selon sa réaction →</div>
        <div class="conv-branches">
          <div class="conv-branch-block">
            <div class="conv-prospect-sub">Il hésite ou dit "c'est cher"</div>
            <div class="conv-step-label">Tu réponds <span class="step-pill step-2">Étape 2a</span></div>
            <div class="conv-you"><div class="conv-you-text" id="sc3-m2a">C'est pour ça que l'essai existe. Tu vois d'abord ce que ça t'apporte concrètement, et tu décides après. Aucun engagement.</div><button class="conv-copy" onclick="copyEl('sc3-m2a',this)"><svg viewBox="0 0 12 12" fill="none"><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M2 8V2h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>Copier</button></div>
            <div class="sc-goal"><span class="goal-dot essai"></span>Objectif : lever la friction prix</div>
          </div>
          <div class="conv-branch-block">
            <div class="conv-prospect-sub">Il ne sait pas quelle formule choisir</div>
            <div class="conv-step-label">Tu réponds <span class="step-pill step-2">Étape 2b</span></div>
            <div class="conv-you"><div class="conv-you-text" id="sc3-m2b">Si tu veux garder la main sur les messages toi-même, prends l'Essential. Si tu veux que tout tourne sans y toucher, le Full Automatisé est fait pour toi.</div><button class="conv-copy" onclick="copyEl('sc3-m2b',this)"><svg viewBox="0 0 12 12" fill="none"><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M2 8V2h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>Copier</button></div>
            <div class="sc-goal"><span class="goal-dot qualify"></span>Objectif : orienter vers la bonne offre</div>
          </div>
        </div>
        <div class="conv-branch-label">Il dit oui →</div>
        <div class="conv-step-label">Tu envoies <span class="step-pill step-3">Clôture</span></div>
        <div class="conv-you"><div class="conv-you-text" id="sc3-close">Super, voici ton lien pour démarrer l'essai gratuit de 7 jours : [TON LIEN AFFILIÉ]

On s'occupe de la configuration de ton côté dès que tu es inscrit.</div><button class="conv-copy" onclick="copyEl('sc3-close',this)"><svg viewBox="0 0 12 12" fill="none"><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M2 8V2h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>Copier</button></div>
      </div>
    </div>

    <div class="scenario" id="sc-no">
      <div class="sc-context"><div class="sc-ctx-icon">🎯</div><div><strong>Contexte :</strong> Ne pas lâcher sans poser une question. "On gère déjà" = souvent le fondateur prospecte lui-même.</div></div>
      <div class="conv-thread">
        <div class="conv-prospect">"Pas intéressé" / "On gère déjà"</div>
        <div class="conv-step-label">Tu réponds <span class="step-pill step-1">Étape 1</span></div>
        <div class="conv-you"><div class="conv-you-text" id="sc4-m1">Pas de souci. Juste par curiosité, vous faites comment pour développer de nouveaux clients en ce moment ? C'est toi qui t'en occupes ?</div><button class="conv-copy" onclick="copyEl('sc4-m1',this)"><svg viewBox="0 0 12 12" fill="none"><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M2 8V2h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>Copier</button></div>
        <div class="sc-goal"><span class="goal-dot qualify"></span>Objectif : comprendre avant de lâcher</div>
        <div class="conv-branch-label">Selon sa réponse →</div>
        <div class="conv-branches">
          <div class="conv-branch-block">
            <div class="conv-prospect-sub">Il prospecte lui-même</div>
            <div class="conv-step-label">Tu réponds <span class="step-pill step-2">Étape 2a</span></div>
            <div class="conv-you"><div class="conv-you-text" id="sc4-m2a">C'est exactement ce qu'on peut t'enlever. Tu gardes le contrôle sur qui tu cibles mais tu arrêtes d'y passer du temps. Ça vaut le coup de tester 7 jours, on configure tout de notre côté.</div><button class="conv-copy" onclick="copyEl('sc4-m2a',this)"><svg viewBox="0 0 12 12" fill="none"><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M2 8V2h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>Copier</button></div>
            <div class="sc-goal"><span class="goal-dot essai"></span>Objectif : retourner l'objection</div>
          </div>
          <div class="conv-branch-block">
            <div class="conv-prospect-sub">Ça marche bien / il a quelqu'un</div>
            <div class="conv-step-label">Tu réponds <span class="step-pill step-2">Étape 2b</span></div>
            <div class="conv-you"><div class="conv-you-text" id="sc4-m2b">Très bien, bonne continuation. Si jamais ça devient un sujet à un moment n'hésite pas à revenir.</div><button class="conv-copy" onclick="copyEl('sc4-m2b',this)"><svg viewBox="0 0 12 12" fill="none"><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M2 8V2h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>Copier</button></div>
            <div class="sc-goal"><span class="goal-dot neutral"></span>Porte ouverte, on lâche proprement</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- IA COACH -->
  <div class="sec" id="s-iacoach">
    <h2>IA Coach</h2>
    <div class="sdesc">Colle le message du prospect ici. L'IA génère 3 réponses adaptées au contexte Lidmeo, que tu peux copier-coller directement.</div>
    <div style="background:var(--white);border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden;margin-bottom:16px;">
      <div style="padding:12px 16px;background:var(--bg);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;"><div style="width:8px;height:8px;border-radius:50%;background:var(--text-muted)"></div><span style="font-size:11px;font-weight:700;color:var(--text-muted);letter-spacing:.06em;text-transform:uppercase;">Message du prospect</span></div>
      <textarea id="prospect-input" placeholder='Ex : "C\'est quoi exactement ? On gère déjà notre prospection mais je suis curieux"' style="width:100%;padding:16px 18px;font-family:'Plus Jakarta Sans',sans-serif;font-size:13.5px;line-height:1.8;color:var(--text-primary);background:transparent;border:none;outline:none;resize:vertical;min-height:100px;"></textarea>
      <div style="padding:10px 16px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:12px;color:var(--text-muted);">L'IA connaît Lidmeo, les prix et l'objectif.</span>
        <button id="gen-btn" onclick="generateReplies()" style="display:flex;align-items:center;gap:7px;font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;font-weight:700;color:white;background:var(--blue);border:none;border-radius:8px;padding:9px 18px;cursor:pointer;">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="white" stroke-width="1.8" stroke-linecap="round"/></svg>Générer les réponses
        </button>
      </div>
    </div>
    <div id="coach-loading" style="display:none;text-align:center;padding:32px;color:var(--text-muted);"><div style="display:flex;align-items:center;justify-content:center;gap:8px;font-size:13px;"><div class="spin"></div>L'IA prépare les réponses…</div></div>
    <div id="coach-results" style="display:none;"><div style="font-size:11px;font-weight:700;color:var(--text-muted);letter-spacing:.06em;text-transform:uppercase;margin-bottom:12px;">3 réponses suggérées</div><div id="replies-container" style="display:flex;flex-direction:column;gap:12px;"></div><button onclick="resetCoach()" style="margin-top:16px;font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;font-weight:600;color:var(--text-muted);background:none;border:1px solid var(--border);border-radius:8px;padding:7px 16px;cursor:pointer;">↩ Nouveau message</button></div>
    <div id="coach-error" style="display:none;" class="co r"><span class="co-ic">⚠️</span><div class="co-c"><div class="co-t">Erreur</div><span id="error-msg"></span></div></div>
  </div>

  <!-- OBJECTIONS -->
  <div class="sec" id="s-objections">
    <h2>Réponses aux objections</h2>
    <div class="sdesc">Clique sur une objection pour voir le contexte et la réponse suggérée.</div>
    <div class="ai"><button class="ab" onclick="toggleAcc(this)"><span>"C'est quoi exactement Lidmeo ?"</span><span class="ach">&#9662;</span></button><div class="ac"><div class="actx">Il n'a pas bien saisi le premier message. Répondre simplement, sans jargon.</div><div class="ares">On s'occupe de la prospection LinkedIn à ta place. Chaque matin on envoie des messages à des profils qui correspondent à ta cible, en ton nom. Toi tu gères uniquement les gens qui répondent. C'est tout.</div></div></div>
    <div class="ai"><button class="ab" onclick="toggleAcc(this)"><span>"J'ai pas le temps de gérer ça"</span><span class="ach">&#9662;</span></button><div class="ac"><div class="actx">Il pense que c'est un outil qu'il faut piloter lui-même.</div><div class="ares">C'est justement fait pour ça. Tu n'as rien à configurer ni à gérer au quotidien, on s'occupe de tout. La seule chose que tu fais c'est répondre aux gens qui ont montré de l'intérêt, et ça prend 10 minutes par jour grand max.</div></div></div>
    <div class="ai"><button class="ab" onclick="toggleAcc(this)"><span>"On fait déjà de la prospection"</span><span class="ach">&#9662;</span></button><div class="ac"><div class="actx">Creuse pour comprendre qui fait quoi. Souvent c'est le fondateur lui-même.</div><div class="ares">C'est bien. C'est toi qui t'en occupes ou tu as quelqu'un dédié à ça ?

Si c'est lui : on peut te libérer de ça complètement. Tu gardes le contrôle sur qui tu cibles mais tu arrêtes d'y passer du temps toi-même.</div></div></div>
    <div class="ai"><button class="ab" onclick="toggleAcc(this)"><span>"C'est combien ?"</span><span class="ach">&#9662;</span></button><div class="ac"><div class="actx">Signal d'intérêt fort. Donner les prix clairement et enchaîner sur l'essai.</div><div class="ares">Deux formules.

Essential à 49€/mois, on te livre chaque matin des profils qualifiés et c'est toi qui envoies les messages.

Full Automatisé à 199€/mois, on gère tout de bout en bout et tu reçois uniquement les réponses des gens intéressés.

Dans les deux cas il y a un essai gratuit de 7 jours. Tu veux qu'on démarre ?</div></div></div>
    <div class="ai"><button class="ab" onclick="toggleAcc(this)"><span>"Je vais en parler à mon associé"</span><span class="ach">&#9662;</span></button><div class="ac"><div class="actx">Signal d'intérêt. Il a besoin d'un appui interne. Faciliter sans bloquer.</div><div class="ares">Bien sûr, c'est normal. Je peux te préparer un résumé rapide que tu lui transmets directement si tu veux, ça t'évite de tout réexpliquer.</div></div></div>
    <div class="ai"><button class="ab" onclick="toggleAcc(this)"><span>"Envoyez-moi plus d'infos"</span><span class="ach">&#9662;</span></button><div class="ac"><div class="actx">Souvent une façon polie de temporiser. Qualifier avant d'envoyer quoi que ce soit.</div><div class="ares">Bien sûr. Pour t'envoyer ce qui est vraiment utile pour toi, c'est quoi ton enjeu principal là ? Gagner du temps sur la prospection ou avoir plus de volume de prospects contactés ?</div></div></div>
    <div class="ai"><button class="ab" onclick="toggleAcc(this)"><span>"J'ai essayé des outils comme ça, ça marchait pas"</span><span class="ach">&#9662;</span></button><div class="ac"><div class="actx">Il a été déçu par un outil self-service. Lidmeo c'est un service accompagné, pas un outil à piloter seul.</div><div class="ares">Je comprends. La plupart des outils te donnent accès à une base de données et te laissent te débrouiller. Nous c'est différent, on configure tout à ta place, on choisit les profils, on rédige les messages. C'est plus proche d'un service que d'un logiciel.

Et comme il y a un essai gratuit, tu peux juger par toi-même sans rien risquer.</div></div></div>
    <div class="ai"><button class="ab" onclick="toggleAcc(this)"><span>"On cherche plutôt des clients entrants"</span><span class="ach">&#9662;</span></button><div class="ac"><div class="actx">Il pense que c'est l'un ou l'autre. Montrer que les deux se complètent.</div><div class="ares">C'est une bonne stratégie sur le long terme. Lidmeo c'est ce qui te génère du business pendant que ton inbound se construit, ou qui prend le relais dans les périodes creuses. Les deux marchent bien ensemble.</div></div></div>
    <div class="ai"><button class="ab" onclick="toggleAcc(this)"><span>"C'est pas le bon moment"</span><span class="ach">&#9662;</span></button><div class="ac"><div class="actx">Il n'est pas contre, juste pas disponible. Garder la porte ouverte sans forcer.</div><div class="ares">Pas de problème. C'est quoi qui fait que c'est pas le bon moment là ? Je me note de revenir vers toi si tu préfères.</div></div></div>
    <div class="ai"><button class="ab" onclick="toggleAcc(this)"><span>"J'ai peur que ça fasse trop de prospects à gérer"</span><span class="ach">&#9662;</span></button><div class="ac"><div class="actx">Il a peur d'être débordé. Rassurer sur le contrôle du volume.</div><div class="ares">C'est une vraie question. Tu choisis ton volume toi-même, on peut commencer à 10 profils par jour et augmenter à ton rythme. Et pendant l'essai tu vois exactement le débit que ça génère avant de t'engager sur quoi que ce soit.</div></div></div>
  </div>

  <!-- CLOSING -->
  <div class="sec" id="s-closing">
    <h2>Quand la personne dit oui</h2>
    <div class="sdesc">La personne est partante pour démarrer l'essai gratuit. Voici exactement quoi faire.</div>
    <div style="background:var(--white);border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden;margin-bottom:20px;">
      <div style="display:flex;gap:16px;align-items:flex-start;padding:18px 20px;border-bottom:1px solid var(--border-light);">
        <div style="width:32px;height:32px;border-radius:50%;background:var(--blue);color:white;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">1</div>
        <div><div style="font-size:13.5px;font-weight:600;color:var(--text-primary);margin-bottom:4px;">Tu lui envoies ton lien affilié</div><div style="font-size:13px;color:var(--text-secondary);line-height:1.65;">Envoie-lui simplement ton lien personnalisé. C'est lui qui lui donne accès à l'essai gratuit de 7 jours et qui t'attribue la commission automatiquement.</div>
        <div style="margin-top:10px;background:var(--blue-light);border-radius:var(--r);padding:12px 16px;font-size:13px;color:#1e3a8a;line-height:1.8;">Super, voici le lien pour démarrer ton essai gratuit de 7 jours : [TON LIEN AFFILIÉ]

On s'occupe de tout configurer à ta place dès que tu es inscrit.</div></div>
      </div>
      <div style="display:flex;gap:16px;align-items:flex-start;padding:18px 20px;border-bottom:1px solid var(--border-light);">
        <div style="width:32px;height:32px;border-radius:50%;background:var(--bg);border:1px solid var(--border);color:var(--text-muted);font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">2</div>
        <div><div style="font-size:13.5px;font-weight:600;color:var(--text-primary);margin-bottom:4px;">Il s'inscrit via le lien</div><div style="font-size:13px;color:var(--text-secondary);line-height:1.65;">Il choisit sa formule et crée son compte. Ça prend 2 minutes de son côté.</div></div>
      </div>
      <div style="display:flex;gap:16px;align-items:flex-start;padding:18px 20px;border-bottom:1px solid var(--border-light);">
        <div style="width:32px;height:32px;border-radius:50%;background:var(--bg);border:1px solid var(--border);color:var(--text-muted);font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">3</div>
        <div><div style="font-size:13.5px;font-weight:600;color:var(--text-primary);margin-bottom:4px;">L'équipe Lidmeo prend le relais</div><div style="font-size:13px;color:var(--text-secondary);line-height:1.65;">Lilian ou Dorian configurent tout à sa place dans les 24h ouvrées. Toi tu as terminé.</div></div>
      </div>
      <div style="display:flex;gap:16px;align-items:flex-start;padding:18px 20px;">
        <div style="width:32px;height:32px;border-radius:50%;background:var(--green-light);border:1px solid var(--green-border);color:var(--green);font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">4</div>
        <div><div style="font-size:13.5px;font-weight:700;color:#065f46;margin-bottom:4px;">Ta commission tombe 💰</div><div style="font-size:13px;color:#065f46;line-height:1.65;">Dès son inscription via ton lien, ta commission est enregistrée. Tu la touches chaque mois tant qu'il reste client.</div></div>
      </div>
    </div>
    <div class="co b"><span class="co-ic">🔗</span><div class="co-c">Chaque commercial a son propre lien affilié. Ne partage jamais le lien d'un autre, c'est ce lien qui te permet de toucher ta commission.</div></div>
  </div>

  <!-- PRICING -->
  <div class="sec" id="s-pricing">
    <h2>Offres, tarifs &amp; commissions</h2>
    <h3>Essential</h3>
    <div class="tw"><table><tr><th>Volume</th><th>Prix barré</th><th>Prix actuel</th><th>Ta commission / mois</th></tr><tr><td>10 prospects/jour · lundi au vendredi</td><td><s style="color:var(--text-muted)">69€</s></td><td><strong>49€/mois</strong></td><td class="tg">14,70€</td></tr><tr><td>20 prospects/jour · lundi au vendredi</td><td><s style="color:var(--text-muted)">99€</s></td><td><strong>69€/mois</strong></td><td class="tg">20,70€</td></tr><tr><td>30 prospects/jour · lundi au vendredi</td><td><s style="color:var(--text-muted)">129€</s></td><td><strong>89€/mois</strong></td><td class="tg">26,70€</td></tr></table></div>
    <h3>Full Automatisé</h3>
    <div class="tw"><table><tr><th>Volume</th><th>Prix</th><th>Ta commission / mois</th></tr><tr><td>330 prospects/mois · 15/jour ouvré</td><td><strong>199€/mois</strong></td><td class="tg" style="font-size:15px">59,70€</td></tr></table></div>

    <div class="cbox">
      <h3>💰 Tes commissions récurrentes</h3>
      <div class="cn">Tu touches <strong>30% du montant mensuel</strong> payé par chaque client que tu closes, <strong>tant qu'il reste abonné</strong>. Chaque nouveau client s'ajoute aux précédents. Plus tu cumules, plus le récurrent grossit sans que tu aies à refaire le travail.</div>
      <div class="tw" style="margin:0 0 16px"><table style="background:transparent"><tr><th style="background:rgba(5,150,105,.08)">Offre</th><th style="background:rgba(5,150,105,.08)">Commission/mois</th><th style="background:rgba(5,150,105,.08)">Sur 6 mois</th><th style="background:rgba(5,150,105,.08)">Sur 12 mois</th></tr><tr><td>Essential 49€</td><td><strong>14,70€</strong></td><td>88€</td><td><strong style="color:var(--green)">176€</strong></td></tr><tr><td>Essential 69€</td><td><strong>20,70€</strong></td><td>124€</td><td><strong style="color:var(--green)">248€</strong></td></tr><tr><td>Essential 89€</td><td><strong>26,70€</strong></td><td>160€</td><td><strong style="color:var(--green)">320€</strong></td></tr><tr><td>Full Auto 199€</td><td><strong>59,70€</strong></td><td>358€</td><td><strong style="color:var(--green);font-size:15px">716€</strong></td></tr></table></div>

      <div style="background:white;border-radius:var(--r);padding:18px 20px;border:1px solid var(--green-border);">
        <div style="font-size:13px;font-weight:700;color:#065f46;margin-bottom:14px;">Simulateur de revenus récurrents</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
          <div>
            <label style="font-size:11px;font-weight:700;color:#065f46;letter-spacing:.05em;text-transform:uppercase;display:block;margin-bottom:6px;">Clients Essential</label>
            <div style="display:flex;align-items:center;gap:8px;">
              <button onclick="adjSim('ess',-1)" style="width:28px;height:28px;border-radius:6px;border:1px solid var(--green-border);background:var(--green-light);color:var(--green);font-size:16px;font-weight:700;cursor:pointer;line-height:1;">-</button>
              <span id="ess-val" style="font-size:18px;font-weight:700;color:#065f46;min-width:28px;text-align:center;">0</span>
              <button onclick="adjSim('ess',1)" style="width:28px;height:28px;border-radius:6px;border:1px solid var(--green-border);background:var(--green-light);color:var(--green);font-size:16px;font-weight:700;cursor:pointer;line-height:1;">+</button>
              <span style="font-size:11px;color:#065f46;opacity:.7;">× 20,70€ moy.</span>
            </div>
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;color:#065f46;letter-spacing:.05em;text-transform:uppercase;display:block;margin-bottom:6px;">Clients Full Auto</label>
            <div style="display:flex;align-items:center;gap:8px;">
              <button onclick="adjSim('full',-1)" style="width:28px;height:28px;border-radius:6px;border:1px solid var(--green-border);background:var(--green-light);color:var(--green);font-size:16px;font-weight:700;cursor:pointer;line-height:1;">-</button>
              <span id="full-val" style="font-size:18px;font-weight:700;color:#065f46;min-width:28px;text-align:center;">0</span>
              <button onclick="adjSim('full',1)" style="width:28px;height:28px;border-radius:6px;border:1px solid var(--green-border);background:var(--green-light);color:var(--green);font-size:16px;font-weight:700;cursor:pointer;line-height:1;">+</button>
              <span style="font-size:11px;color:#065f46;opacity:.7;">× 59,70€</span>
            </div>
          </div>
        </div>
        <div style="background:var(--green-light);border-radius:var(--r);padding:16px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;text-align:center;">
          <div><div style="font-size:11px;font-weight:700;color:#065f46;opacity:.7;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Par mois</div><div id="sim-month" style="font-size:22px;font-weight:700;color:#065f46;">0€</div></div>
          <div style="border-left:1px solid var(--green-border);border-right:1px solid var(--green-border);"><div style="font-size:11px;font-weight:700;color:#065f46;opacity:.7;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Sur 6 mois</div><div id="sim-6" style="font-size:22px;font-weight:700;color:#065f46;">0€</div></div>
          <div><div style="font-size:11px;font-weight:700;color:#065f46;opacity:.7;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Sur 12 mois</div><div id="sim-12" style="font-size:24px;font-weight:700;color:var(--green);">0€</div></div>
        </div>
        <div id="sim-msg" style="margin-top:12px;font-size:12.5px;color:#065f46;text-align:center;min-height:18px;font-style:italic;"></div>
      </div>
    </div>
  </div>

  <!-- REPORTING -->
  <div class="sec" id="s-reporting">
    <h2>Suivi &amp; reporting</h2>
    <div class="sdesc">Trois groupes WhatsApp sont créés pour l'équipe. Chacun a un rôle précis — ne mélange pas les usages.</div>

    <h3>Les 3 groupes WhatsApp</h3>

    <div class="wac" style="margin-bottom:10px;">
      <div class="wai" style="background:var(--blue-light)">📢</div>
      <div style="flex:1;">
        <div class="wan">Lidmeo Sales — Général</div>
        <div class="wad" style="margin-bottom:8px;">Toute l'équipe + Lilian + Dorian. C'est le groupe des annonces importantes : nouveau script validé, update produit, changement de tarif, célébration d'un close. On ne pollue pas ce groupe avec des questions opérationnelles.</div>
        <div style="font-size:11px;font-weight:700;color:var(--blue);letter-spacing:.04em;text-transform:uppercase;">Ce qu'on y poste</div>
        <div style="font-size:12.5px;color:var(--text-secondary);margin-top:4px;">Annonces d'équipe · Updates produit · Célébrations de closes · Nouvelles ressources</div>
      </div>
    </div>

    <div class="wac" style="margin-bottom:10px;">
      <div class="wai" style="background:var(--amber-light)">🔥</div>
      <div style="flex:1;">
        <div class="wan">Lidmeo Sales — Cas chauds &amp; objections</div>
        <div class="wad" style="margin-bottom:8px;">Le groupe le plus actif au quotidien. Tu reçois une réponse bizarre d'un prospect ? Tu bloques sur une objection ? Tu colles la conversation ici et l'équipe te répond en live. C'est aussi là que tu partages les formulations qui ont bien converti pour que tout le monde en profite.</div>
        <div style="font-size:11px;font-weight:700;color:var(--amber);letter-spacing:.04em;text-transform:uppercase;">Ce qu'on y poste</div>
        <div style="font-size:12.5px;color:var(--text-secondary);margin-top:4px;">Conversations en cours · Objections difficiles · Formules qui convertissent · Demandes d'aide en live</div>
      </div>
    </div>

    <div class="wac" style="margin-bottom:10px;">
      <div class="wai" style="background:var(--green-light)">📈</div>
      <div style="flex:1;">
        <div class="wan">Lidmeo Sales — Résultats du jour</div>
        <div class="wad" style="margin-bottom:8px;">Tu postes dans ce groupe quand il se passe quelque chose de concret : un prospect chaud qui montre un vrai intérêt, ou un close confirmé. Pas besoin de résumé quotidien si t'as rien à signaler. L'idée c'est que toute l'équipe voit les avancées en temps réel et reste motivée.</div>
        <div style="font-size:11px;font-weight:700;color:var(--green);letter-spacing:.04em;text-transform:uppercase;">Ce qu'on y poste</div>
        <div style="font-size:12.5px;color:var(--text-secondary);margin-top:4px;">Prospect chaud identifié · Essai gratuit closé · Close confirmé</div>
      </div>
    </div>

    <h3>Tes statistiques</h3>
    <div class="sdesc">Toutes tes stats sont disponibles directement sur le hub Lidmeo : conversions, clics sur ton lien affilié, essais démarrés, clients actifs. Pas besoin de tracker quoi que ce soit manuellement.</div>
    <div class="co b"><span class="co-ic">📊</span><div class="co-c">Connecte-toi au hub pour voir tes résultats en temps réel. Si tu as une question sur tes chiffres, envoie un message dans le groupe "Cas chauds".</div></div>
  </div>

  <!-- FAQ -->
  <div class="sec" id="s-faq">
    <h2>FAQ interne</h2>
    <div class="sdesc">Les questions que tu poseras forcément, avec les réponses rapides.</div>
    <div class="ai"><button class="ab" onclick="toggleAcc(this)"><span>Je ne sais pas quoi répondre, que faire ?</span><span class="ach">&#9662;</span></button><div class="ac"><div class="ares">Poste la conversation dans le groupe WhatsApp "Cas chauds &amp; objections". L'équipe t'aide en quelques minutes. Ne laisse jamais une conversation attendre plus d'une heure sans réponse.</div></div></div>
    <div class="ai"><button class="ab" onclick="toggleAcc(this)"><span>Le prospect demande des références ou cas clients ?</span><span class="ach">&#9662;</span></button><div class="ac"><div class="ares">Explique que Lidmeo est jeune et que vous construisez vos premiers cas clients ensemble. L'essai gratuit est justement là pour ça, voir les résultats sans risque. C'est souvent plus convaincant qu'une référence.</div></div></div>
    <div class="ai"><button class="ab" onclick="toggleAcc(this)"><span>Le prospect veut savoir qui envoie les messages à sa place ?</span><span class="ach">&#9662;</span></button><div class="ac"><div class="ares">C'est notre système qui envoie les messages via son compte LinkedIn (Full Auto) ou qui lui prépare des prospects à contacter lui-même (Essential). Dans les deux cas, les messages sont personnalisés et envoyés en son nom.</div></div></div>
    <div class="ai"><button class="ab" onclick="toggleAcc(this)"><span>Un prospect demande si c'est risqué pour son compte LinkedIn ?</span><span class="ach">&#9662;</span></button><div class="ac"><div class="ares">On respecte les limites de LinkedIn pour éviter tout risque. C'est un point qu'on gère de notre côté, le client n'a pas à s'en préoccuper.</div></div></div>
    <div class="ai"><button class="ab" onclick="toggleAcc(this)"><span>Le prospect ne sait pas quelle offre choisir ?</span><span class="ach">&#9662;</span></button><div class="ac"><div class="ares">Pose-lui cette question : "Tu préfères contrôler toi-même l'envoi des messages, ou tu veux que ça tourne tout seul sans y toucher ?" Sa réponse te guide directement vers Essential ou Full Auto.</div></div></div>
    <div class="ai"><button class="ab" onclick="toggleAcc(this)"><span>Combien de temps entre le "oui" et le démarrage de l'essai ?</span><span class="ach">&#9662;</span></button><div class="ac"><div class="ares">L'équipe configure l'essai en général dans les 24h ouvrées suivant l'inscription. Préviens le prospect que c'est rapide et qu'on revient vers lui dès que c'est prêt.</div></div></div>
  </div>

  </div>
</div>

<script>
var L = {intro:'Bienvenue',produit:'Le produit',icp:'Notre ICP',scripts:'Scripts',iacoach:'IA Coach',objections:'Objections',closing:'Quand \u00e7a dit oui',pricing:'Prix & commissions',reporting:'Reporting',faq:'FAQ interne'};

function show(k, btn) {
  var secs = document.querySelectorAll('.sec');
  for (var i = 0; i < secs.length; i++) secs[i].classList.remove('on');
  var nbs = document.querySelectorAll('.nb');
  for (var i = 0; i < nbs.length; i++) nbs[i].classList.remove('active');
  var sec = document.getElementById('s-' + k);
  if (sec) sec.classList.add('on');
  if (btn && btn.classList) btn.classList.add('active');
  var crumb = document.getElementById('crumb');
  if (crumb) crumb.textContent = L[k] || k;
  var content = document.getElementById('main-content');
  if (content) content.scrollTop = 0;
  closeSB();
}

function toggleAcc(btn) {
  var item = btn.parentElement;
  var wasOn = item.classList.contains('on');
  var items = document.querySelectorAll('.ai');
  for (var i = 0; i < items.length; i++) items[i].classList.remove('on');
  if (!wasOn) item.classList.add('on');
}

function selectSc(key, btn) {
  var tabs = document.querySelectorAll('.sc-tab');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
  var scenarios = document.querySelectorAll('.scenario');
  for (var i = 0; i < scenarios.length; i++) scenarios[i].classList.remove('on');
  if (btn) btn.classList.add('active');
  var sc = document.getElementById('sc-' + key);
  if (sc) sc.classList.add('on');
}

function copyEl(id, btn) {
  var el = document.getElementById(id);
  if (!el) return;
  var text = el.innerText;
  navigator.clipboard.writeText(text).then(function() {
    var orig = btn.innerHTML;
    btn.innerHTML = '<svg viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Copié !';
    btn.classList.add('ok');
    setTimeout(function() { btn.innerHTML = orig; btn.classList.remove('ok'); }, 1800);
  }).catch(function() {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    var orig = btn.innerHTML;
    btn.innerHTML = 'Copié !';
    btn.classList.add('ok');
    setTimeout(function() { btn.innerHTML = orig; btn.classList.remove('ok'); }, 1800);
  });
}

function toggleSB() {
  document.getElementById('sb').classList.toggle('open');
  document.getElementById('ov').classList.toggle('open');
}
function closeSB() {
  document.getElementById('sb').classList.remove('open');
  document.getElementById('ov').classList.remove('open');
}

var simEss = 0, simFull = 0;
function adjSim(type, delta) {
  if (type === 'ess') { simEss = Math.max(0, simEss + delta); document.getElementById('ess-val').textContent = simEss; }
  else { simFull = Math.max(0, simFull + delta); document.getElementById('full-val').textContent = simFull; }
  var monthly = Math.round((simEss * 20.70 + simFull * 59.70) * 100) / 100;
  var total = simEss + simFull;
  document.getElementById('sim-month').textContent = monthly.toFixed(2).replace('.', ',') + '\u20ac';
  document.getElementById('sim-6').textContent = Math.round(monthly * 6) + '\u20ac';
  document.getElementById('sim-12').textContent = Math.round(monthly * 12) + '\u20ac';
  var msg = '';
  if (total === 0) msg = 'Ajoute des clients pour voir ta simulation.';
  else if (total <= 3) msg = 'Bon d\u00e9but. Chaque client s\'ajoute au r\u00e9current d\u00e9j\u00e0 en place.';
  else if (total <= 6) msg = total + ' clients actifs, ton r\u00e9current tourne tout seul chaque mois.';
  else if (total <= 10) msg = total + ' clients actifs, c\'est un vrai revenu passif qui s\'accumule.';
  else msg = 'Au-del\u00e0 de 10 clients, le r\u00e9current d\u00e9passe souvent un salaire partiel.';
  document.getElementById('sim-msg').textContent = msg;
}

async function generateReplies() {
  var msg = document.getElementById('prospect-input').value.trim();
  if (!msg) { document.getElementById('prospect-input').focus(); return; }
  document.getElementById('coach-loading').style.display = 'block';
  document.getElementById('coach-results').style.display = 'none';
  document.getElementById('coach-error').style.display = 'none';
  document.getElementById('gen-btn').disabled = true;
  document.getElementById('gen-btn').style.opacity = '.6';
  try {
    var res = await fetch('/api/playbook/generate', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({message: msg})
    });
    if (!res.ok) throw new Error('Erreur serveur ' + res.status);
    var parsed = await res.json();
    var replies = parsed.replies || [];
    var cfg = [
      {bg:'#eff6ff',border:'#bfdbfe',text:'#1e3a8a',badge:'#2563EB'},
      {bg:'#ecfdf5',border:'#a7f3d0',text:'#065f46',badge:'#059669'},
      {bg:'#fffbeb',border:'#fde68a',text:'#78350f',badge:'#d97706'}
    ];
    var container = document.getElementById('replies-container');
    container.innerHTML = '';
    for (var i = 0; i < replies.length; i++) {
      var r = replies[i];
      var c = cfg[i % 3];
      var id = 'reply-' + i;
      var div = document.createElement('div');
      div.style.cssText = 'background:' + c.bg + ';border:1px solid ' + c.border + ';border-radius:14px;overflow:hidden;';
      div.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid ' + c.border + '">'
        + '<div style="display:flex;align-items:center;gap:8px;"><span style="background:' + c.badge + ';color:white;font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;">' + (r.label || 'Option ' + (i+1)) + '</span>'
        + '<span style="font-size:11px;color:' + c.text + ';opacity:.7;">' + (r.tone || '') + '</span></div>'
        + '<button onclick="copyEl(\'' + id + '\',this)" style="display:flex;align-items:center;gap:5px;font-family:inherit;font-size:12px;font-weight:600;color:' + c.badge + ';background:white;border:1px solid ' + c.border + ';border-radius:6px;padding:5px 12px;cursor:pointer;">Copier</button></div>'
        + '<div id="' + id + '" style="padding:16px 18px;font-size:13.5px;line-height:1.9;color:' + c.text + ';white-space:pre-wrap;">' + (r.text || '') + '</div>';
      container.appendChild(div);
    }
    document.getElementById('coach-loading').style.display = 'none';
    document.getElementById('coach-results').style.display = 'block';
  } catch(err) {
    document.getElementById('coach-loading').style.display = 'none';
    document.getElementById('coach-error').style.display = 'flex';
    document.getElementById('error-msg').textContent = err.message || 'Une erreur est survenue.';
  }
  document.getElementById('gen-btn').disabled = false;
  document.getElementById('gen-btn').style.opacity = '1';
}

function resetCoach() {
  document.getElementById('prospect-input').value = '';
  document.getElementById('coach-results').style.display = 'none';
  document.getElementById('coach-error').style.display = 'none';
  document.getElementById('prospect-input').focus();
}

function doSearch(q) {
  var s = document.querySelector('.sec.on');
  if (!s) return;
  var marks = s.querySelectorAll('mark');
  for (var i = 0; i < marks.length; i++) {
    var t = document.createTextNode(marks[i].textContent);
    marks[i].parentNode.replaceChild(t, marks[i]);
  }
  if (!q.trim()) return;
  var escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var re = new RegExp('(' + escaped + ')', 'gi');
  var walker = document.createTreeWalker(s, NodeFilter.SHOW_TEXT, null, false);
  var nodes = [];
  var n;
  while ((n = walker.nextNode())) {
    if (n.parentElement.tagName !== 'MARK' && re.test(n.textContent)) nodes.push(n);
  }
  for (var i = 0; i < nodes.length; i++) {
    var sp = document.createElement('span');
    sp.innerHTML = nodes[i].textContent.replace(re, '<mark>$1</mark>');
    nodes[i].parentNode.replaceChild(sp, nodes[i]);
  }
}
</script>
</body>
</html>`;
}
