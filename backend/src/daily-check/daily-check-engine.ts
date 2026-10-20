import { getVendorDailyCheckProfile, type DailyCheckSectionProfile } from "./vendor-daily-check-profiles.js";

export type DailyStatus = "safe" | "needs_review" | "critical" | "not_checked" | "not_supported";

export type DailyCheckOutput = {
  template: string;
  stdout: string;
  stderr?: string;
  exitCode?: number | null;
};

type DailySectionResult = {
  key: string;
  titleFa: string;
  status: DailyStatus;
  severity: DailyStatus;
  summaryFa: string;
  items: string[];
  evidence: string[];
  suggestedActions: string[];
};

function normalizeText(outputs: DailyCheckOutput[]) {
  return outputs
    .map((output) => `${output.stdout}\n${output.stderr ?? ""}`)
    .join("\n")
    .toLowerCase();
}

function summarize(section: DailyCheckSectionProfile, status: DailyStatus, evidenceCount: number) {
  if (status === "critical") return `در بخش ${section.titleFa} مورد بحرانی دیده شد.`;
  if (status === "needs_review") return `بخش ${section.titleFa} نیازمند بررسی بیشتر است.`;
  if (status === "not_supported") return `برای بخش ${section.titleFa} اجرای واقعی در دسترس نیست.`;
  if (status === "not_checked") return `وضعیت بخش ${section.titleFa} از خروجی قابل تشخیص نبود.`;
  return evidenceCount > 0 ? `بخش ${section.titleFa} بدون هشدار جدی ثبت شد.` : `برای بخش ${section.titleFa} داده مستقیمی ثبت نشد.`;
}

function assessSection(section: DailyCheckSectionProfile, outputs: DailyCheckOutput[]): DailyStatus {
  if (outputs.length === 0) return "not_checked";
  const text = normalizeText(outputs);
  if (/command (?:not found|fail)|unknown command|not supported/.test(text)) return "not_supported";
  // A failed collector is missing evidence, not proof of a critical device fault.
  const collectionError = outputs.map(output => output.stderr ?? "").join("\n").toLowerCase();
  if (outputs.some((output) => typeof output.exitCode === "number" && output.exitCode !== 0) || /permission denied|authentication failed|connection timed out/.test(collectionError)) return "not_checked";
  if (/kernel panic|no space left on device|out of memory/.test(text)) return "critical";
  if (section.key === "resources") {
    const percentages = [...text.matchAll(/^\S+\s+\S+\s+\S+\s+\S+\s+(\d{1,3})%\s+\S+/gm)].map(match => Number(match[1])).filter(value => value <= 100);
    const cpu = Number(text.match(/cpu-load:\s*(\d+)%/)?.[1] ?? 0);
    if (cpu >= 95 || percentages.some(value => value >= 95)) return "critical";
    if (cpu >= 85 || percentages.some(value => value >= 85)) return "needs_review";
  }
  if (section.key === "license" && /\b(expired|invalid|unlicensed|not licensed)\b/.test(text)) return "needs_review";
  if (section.key === "management" && /set\s+allowaccess\s+.*\b(?:telnet|http)\b/.test(text)) return "critical";
  if (section.key === "system_health") {
    const memory = Number(text.match(/memory:\s*(\d+)%/)?.[1] ?? 0);
    const cpu = Number(text.match(/cpu states:\s*(\d+)%\s*user/)?.[1] ?? 0);
    if (memory >= 90 || cpu >= 90) return "critical";
    if (memory >= 75 || cpu >= 75) return "needs_review";
  }
  if ((section.key === "route_dns" && !/(?:0\.0\.0\.0\/0|\bs\*\b|primary\s*:)/.test(text)) ||
      (section.key === "admins" && /set\s+accprofile\s+"?super_admin"?/.test(text) && !/set\s+trusthost\d+/.test(text))) return "needs_review";
  const meaningful = text.replace(/\b(?:0|no)\s+(?:errors?|failures?|failed(?:\s+units?)?)\b/g, "");
  if (/\b(warn|warning|degraded|inactive|disabled|refused|failed|failure|error|critical)\b/.test(meaningful)) return "needs_review";
  if (!text.trim() || /\b(unknown|unparsed|not checked)\b/.test(text)) return "not_checked";
  const recognizable: Record<string, RegExp> = {
    overall: /uptime|load average|version|hostname|cpu-load|cpu states|memory:/,
    resources: /mem:|memtotal|free-memory|total-memory|cpu-load|filesystem|\/dev\/|tmpfs|memory:/,
    services: /active|running|loaded units|\bname\b|\bport\b/,
    network: /default via|inet|route|interface|ether|link|address|\d+\.\d+\.\d+\.\d+/,
    firewall: /status:\s*active|chain|input|forward|filter|drop|accept|allow|deny/,
    vpn_ha: /wireguard|ipsec|l2tp|peer|allowed-address|interface/,
    logs: /sshd|system|account|firewall|journal|no entries|login|error|warning/,
  };
  if (recognizable[section.key] && !recognizable[section.key].test(text)) return "not_checked";
  return "safe";
}

function matchingOutputs(section: DailyCheckSectionProfile, outputs: DailyCheckOutput[], vendor: string) {
  const linux: Record<string, string[]> = { overall: ["daily check: system"], resources: ["daily check: system"], services: ["daily check: services"], network: ["daily check: network"], firewall: ["daily check: firewall"], logs: ["daily check: logs"] };
  const mikrotik: Record<string, string[]> = { overall: ["/system resource", "/system package"], resources: ["/system resource"], services: ["/ip service"], network: ["/interface print", "/ip route", "/ip dhcp-server"], firewall: ["/ip firewall"], vpn_ha: ["/interface wireguard", "/ip ipsec"], logs: ["/log print"] };
  const exact = vendor === "linux" ? linux[section.key] : vendor === "mikrotik" ? mikrotik[section.key] : undefined;
  if (["linux", "mikrotik"].includes(vendor)) return outputs.filter(output => exact?.some(template => output.template.toLowerCase().includes(template)));
  if (section.templates.length === 0) return [];
  return outputs.filter((output) => section.templates.some((template) => output.template.toLowerCase().includes(template.toLowerCase())));
}

export function buildDailyCheckResult(input: { deviceId: string; vendor: unknown; outputs?: DailyCheckOutput[] }) {
  const profile = getVendorDailyCheckProfile(input.vendor);
  if (!profile) throw new Error("DAILY_CHECK_VENDOR_UNSUPPORTED");

  const outputs = input.outputs ?? [];
  const sections: DailySectionResult[] = profile.sections.map((section) => {
    const evidenceOutputs = matchingOutputs(section, outputs, profile.vendor);
    const status = profile.implementationState === "implemented" ? assessSection(section, evidenceOutputs) : "not_supported";

    return {
      key: section.key,
      titleFa: section.titleFa,
      status,
      severity: status,
      summaryFa: summarize(section, status, evidenceOutputs.length),
      items: section.parserRules,
      evidence: evidenceOutputs.flatMap((output) => [output.stdout, output.stderr ?? ""]).filter(Boolean).slice(0, 8),
      suggestedActions: section.suggestedActions,
    };
  });

  const overallStatus: DailyStatus = sections.some((section) => section.status === "critical")
    ? "critical"
    : sections.some((section) => section.status === "needs_review")
      ? "needs_review"
    : sections.every((section) => section.status === "not_supported")
      ? "not_supported"
      : sections.some((section) => section.status === "not_checked") ? "needs_review" : "safe";

  const scored = sections.filter((section) => section.status !== "not_supported");
  const score = scored.length === 0
    ? 0
    : Math.round(scored.reduce((sum, section) => sum + (section.status === "safe" ? 100 : section.status === "needs_review" ? 60 : section.status === "not_checked" ? 40 : 20), 0) / scored.length);

  return {
    deviceId: input.deviceId,
    vendor: profile.vendor,
    status: overallStatus,
    summaryFa: overallStatus === "safe" ? "بررسی روزانه بدون هشدار جدی تکمیل شد." : overallStatus === "critical" ? "در بررسی روزانه مورد بحرانی تأیید شد." : "بررسی روزانه شامل موارد نیازمند بازبینی یا داده‌های بررسی‌نشده است.",
    evidence: sections.flatMap((section) => section.evidence).slice(0, 40),
    recommendationsFa: sections.flatMap((section) => section.suggestedActions).slice(0, 20),
    commands: outputs.map((output) => output.template),
    rawOutput: outputs.map((output) => output.stdout).filter(Boolean).join("\n"),
    confidence: sections.filter(section => !["not_checked", "not_supported"].includes(section.status)).length / sections.length * 0.9,
    overallStatus,
    score,
    sections,
    rawOutputs: outputs,
    executedTemplates: outputs.map((output) => output.template),
    manualSections: profile.implementationState === "manualOnly" ? sections.map((section) => section.key) : [],
    unsupportedSections: profile.implementationState === "planned" ? sections.map((section) => section.key) : [],
  };
}
