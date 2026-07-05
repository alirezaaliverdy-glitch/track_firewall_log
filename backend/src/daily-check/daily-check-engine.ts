import { getVendorDailyCheckProfile, type DailyCheckSectionProfile } from "./vendor-daily-check-profiles.js";

export type DailySeverity = "green" | "yellow" | "red" | "gray";
export type DailyStatus = "safe" | "needs_review" | "critical" | "not_supported";
export type DailyCheckOutput = { template: string; stdout: string; stderr?: string; exitCode?: number | null };

function assess(section: DailyCheckSectionProfile, outputs: DailyCheckOutput[]) {
  if (!section.commands.length) return { severity: "gray" as const, status: "not_supported" as const };
  const text = outputs.map((x) => `${x.stdout}\n${x.stderr ?? ""}`).join("\n").toLowerCase();
  if (outputs.some((x) => typeof x.exitCode === "number" && x.exitCode !== 0) || /\b(critical|panic|failed|failure)\b/.test(text)) return { severity: "red" as const, status: "critical" as const };
  if (/\b(warn|warning|degraded|inactive|error)\b/.test(text)) return { severity: "yellow" as const, status: "needs_review" as const };
  return { severity: "green" as const, status: "safe" as const };
}

export function buildDailyCheckResult(input: { deviceId: string; vendor: unknown; outputs?: DailyCheckOutput[] }) {
  const profile = getVendorDailyCheckProfile(input.vendor);
  if (!profile) throw new Error("DAILY_CHECK_VENDOR_UNSUPPORTED");
  const outputs = input.outputs ?? [];
  const sections = profile.sections.map((entry) => {
    const matching = outputs.filter((output) => entry.commands.some((command) => output.template.toLowerCase().includes(command.split("/")[0].toLowerCase())));
    const state = profile.implementationState === "implemented" ? assess(entry, matching.length ? matching : outputs) : { severity: "gray" as const, status: "not_supported" as const };
    return { key: entry.key, titleFa: entry.titleFa, ...state, items: entry.commands, evidence: matching.map((x) => x.stdout).filter(Boolean).slice(0, 20), suggestedActions: entry.suggestedActions };
  });
  const severities = sections.map((x) => x.severity);
  const overallStatus: DailyStatus = severities.includes("red") ? "critical" : severities.includes("yellow") ? "needs_review" : severities.every((x) => x === "gray") ? "not_supported" : "safe";
  const supported = sections.filter((x) => x.severity !== "gray");
  const score = supported.length ? Math.round(supported.reduce((sum, x) => sum + (x.severity === "green" ? 100 : x.severity === "yellow" ? 60 : 20), 0) / supported.length) : 0;
  return { deviceId: input.deviceId, vendor: profile.vendor, overallStatus, score, sections, rawOutputs: outputs, executedTemplates: outputs.map((x) => x.template), manualSections: profile.implementationState === "manualOnly" ? sections.map((x) => x.key) : [], unsupportedSections: profile.implementationState === "planned" ? sections.map((x) => x.key) : [] };
}
