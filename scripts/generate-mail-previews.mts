import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Stub the "server-only" import (it would otherwise throw outside Next.js)
import { Module } from "node:module";
const originalResolve = Module.createRequire(import.meta.url).resolve;
const originalLoad = (Module as unknown as { _load: (...args: unknown[]) => unknown })._load;
(Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown })._load = function (
  request: string,
  ...rest: unknown[]
) {
  if (request === "server-only") return {};
  return originalLoad(request, ...rest);
};
void originalResolve;

const {
  welcomeSetupEmail,
  setupReminderJ3Email,
  firstProspectsEmail,
} = await import("../src/lib/email-templates-onboarding.ts");

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "mail-previews");

const PRENOM = "Marc";
const COUNT_FIRST_DAY = 12;

const previews = [
  {
    file: "1-welcome.html",
    label: "Mail #1 — Bienvenue",
    payload: welcomeSetupEmail(PRENOM),
  },
  {
    file: "2a-reminder-j3-all-missing.html",
    label: "Mail #2a — Rappel J+3 (rien fait : 3 étapes manquent)",
    payload: setupReminderJ3Email(PRENOM, { linkedin: true, icp: true, message: true }),
  },
  {
    file: "2b-reminder-j3-icp-and-message.html",
    label: "Mail #2b — Rappel J+3 (LinkedIn OK, ICP + message restent)",
    payload: setupReminderJ3Email(PRENOM, { linkedin: false, icp: true, message: true }),
  },
  {
    file: "2c-reminder-j3-message-only.html",
    label: "Mail #2c — Rappel J+3 (LinkedIn + ICP OK, juste message restant)",
    payload: setupReminderJ3Email(PRENOM, { linkedin: false, icp: false, message: true }),
  },
  {
    file: "3-first-prospects.html",
    label: `Mail #3 — Premiers prospects (${COUNT_FIRST_DAY})`,
    payload: firstProspectsEmail(PRENOM, COUNT_FIRST_DAY),
  },
];

for (const { file, label, payload } of previews) {
  const path = join(outDir, file);
  writeFileSync(path, payload.html, "utf-8");
  console.log(`[ok] ${label}\n     subject: ${payload.subject}\n     -> ${path}\n`);
}
