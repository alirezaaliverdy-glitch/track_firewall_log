import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const fa = JSON.parse(read("src/i18n/locales/fa/common.json"));
const en = JSON.parse(read("src/i18n/locales/en/common.json"));

const requiredKeys = [
  "assistant.controls.newRequest",
  "assistant.controls.clearChat",
  "assistant.controls.refreshSummary",
  "assistant.safetyBoundary",
  "assistant.aiProvider",
  "actionCenter.summary.executionMode",
  "actionCenter.summary.latestStatus",
  "actionCenter.summary.activeReview",
  "actionCenter.summary.plans",
  "shell.toggleNavigation",
  "shell.notifications",
  "auth.logout",
  "monitoring.presets.essential",
  "monitoring.presets.web",
  "monitoring.presets.docker",
  "monitoring.presets.full",
];

const failures = [];
for (const key of requiredKeys) {
  if (typeof fa[key] !== "string" || !fa[key].trim()) failures.push(`${key}: missing Persian copy`);
  if (fa[key] === en[key]) failures.push(`${key}: Persian copy matches English copy`);
}

const shell = read("src/components/layout/AppShell.tsx");
for (const key of ["shell.toggleNavigation", "shell.notifications", "auth.logout"]) {
  if (!shell.includes(`t("${key}")`)) failures.push(`${key}: AppShell does not use the dictionary`);
}
if (!/input disabled title=\{t\("shell\.searchUnavailable"\)\}/.test(shell)) failures.push("global search is not explicitly disabled and explained");
if (!/button type="button" className="icon-button" disabled title=\{t\("shell\.notificationsUnavailable"\)\}/.test(shell)) failures.push("notifications are not explicitly disabled and explained");

const actionCenter = read("src/components/actions/ActionCenterPanel.tsx");
for (const key of requiredKeys.filter((key) => key.startsWith("actionCenter."))) {
  if (!actionCenter.includes(`t("${key}")`)) failures.push(`${key}: Action Center does not use the dictionary`);
}

const assistant = read("src/components/ai/AiSecurityAssistantPanel.tsx");
for (const key of requiredKeys.filter((key) => key.startsWith("assistant."))) {
  if (!assistant.includes(`t("${key}")`)) failures.push(`${key}: Assistant does not use the dictionary`);
}

const monitoring = read("src/components/telemetry/LinuxTelemetryPanel.tsx");
for (const key of requiredKeys.filter((key) => key.startsWith("monitoring."))) {
  if (!monitoring.includes(key)) failures.push(`${key}: monitoring presets do not use the dictionary`);
}

if (failures.length) {
  console.error("Persian primary-route copy check failed:");
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(`Persian primary-route copy OK (${requiredKeys.length} required labels).`);
