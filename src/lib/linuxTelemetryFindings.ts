import type { ProposeActionInput } from "./actions";
import type { LinuxLiveEvent, LinuxSnapshot, TelemetrySeverity } from "./linuxTelemetry";

export type SourcePreset = "essential" | "web" | "docker" | "full";
export const SOURCE_PRESETS: Record<SourcePreset, string[]> = {
  essential: ["auth", "system", "firewall", "kernel"],
  web: ["nginx", "auth", "firewall"],
  docker: ["docker", "system", "kernel", "auth"],
  full: ["auth", "system", "kernel", "firewall", "nginx", "docker"]
};
export function sourcesForPreset(preset: SourcePreset, available: string[]) { const allowed = new Set(available); return SOURCE_PRESETS[preset].filter((source) => allowed.has(source)); }

export type LiveFinding = {
  id: string; severity: TelemetrySeverity; title: string; evidence: string[]; source: string; sourceIp?: string; port?: number; username?: string;
  firstSeen: string; lastSeen: string; count: number; recommendedFix: string; actionable: boolean;
};
const severityRank: Record<TelemetrySeverity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

function eventFinding(event: LinuxLiveEvent): Omit<LiveFinding, "firstSeen" | "lastSeen" | "count"> | null {
  const tag = event.tags.find((item) => item !== event.source && item !== "repeated") ?? "";
  const repeated = Number(event.parsed.repeated ?? 0);
  const sourceIp = typeof event.parsed.sourceIp === "string" ? event.parsed.sourceIp : undefined;
  const username = typeof event.parsed.username === "string" ? event.parsed.username : undefined;
  const port = Number(event.parsed.port) || undefined;
  const map: Record<string, [string, string]> = {
    auth_failure: [repeated >= 10 ? "Repeated SSH authentication failures" : "SSH authentication failure", "Review the source and create a temporary block proposal if it is hostile."],
    invalid_user: ["Invalid SSH user attempt", "Review the source IP and targeted account names."],
    root_login: ["Root login activity", "Validate the login and propose restricting direct root SSH access."],
    sudo_failure: ["Sudo authentication failure", "Review the account and privilege escalation attempt."],
    firewall_block: ["Firewall blocked traffic", "Review repeated sources and exposed destination ports."],
    web_denied: ["Nginx access-denial burst", "Review the source and propose blocking or rate limiting."],
    web_error: ["Nginx server-error burst", "Review upstream health and recent deployment changes."],
    docker_error: ["Docker daemon or container error", "Review the affected container and host service state."],
    system_warning: ["Kernel or process stability warning", "Investigate OOM, segmentation fault, or kernel evidence immediately."]
  };
  if (!event.suspicious && tag !== "auth_success") return null;
  if (tag === "auth_success") return null;
  const [title, recommendedFix] = map[tag] ?? [event.summary, "Review the evidence and affected resource."];
  return { id: `${tag || "signal"}:${sourceIp ?? username ?? port ?? event.source}`, severity: event.severity, title, evidence: [event.summary], source: event.source, sourceIp, username, port, recommendedFix, actionable: ["auth_failure", "invalid_user", "root_login", "sudo_failure", "web_denied", "firewall_block"].includes(tag) };
}

export function buildLiveFindings(events: LinuxLiveEvent[], snapshot: LinuxSnapshot | null): LiveFinding[] {
  const findings = new Map<string, LiveFinding>();
  for (const item of snapshot?.findings ?? []) findings.set(`snapshot:${item.id}`, { id: `snapshot:${item.id}`, severity: item.severity, title: item.title, evidence: item.evidence, source: "snapshot", firstSeen: snapshot!.collectedAt, lastSeen: snapshot!.collectedAt, count: 1, recommendedFix: item.recommendation, actionable: item.canCreateActionPlan });
  const failuresByIp = new Map<string, number>();
  for (const event of events) {
    const sourceIp = typeof event.parsed.sourceIp === "string" ? event.parsed.sourceIp : undefined;
    if (event.tags.includes("auth_failure") && sourceIp) failuresByIp.set(sourceIp, (failuresByIp.get(sourceIp) ?? 0) + 1);
    if (event.tags.includes("auth_success") && sourceIp && (failuresByIp.get(sourceIp) ?? 0) >= 5) {
      const id = `success-after-failures:${sourceIp}`; const existing = findings.get(id);
      findings.set(id, { id, severity: "critical", title: "Successful SSH login after repeated failures", evidence: [event.summary], source: event.source, sourceIp, username: typeof event.parsed.username === "string" ? event.parsed.username : undefined, firstSeen: existing?.firstSeen ?? event.timestamp, lastSeen: event.timestamp, count: (existing?.count ?? 0) + 1, recommendedFix: "Validate the login immediately and create a temporary block proposal for the source if unauthorized.", actionable: true });
    }
    const seed = eventFinding(event); if (!seed) continue;
    const existing = findings.get(seed.id);
    findings.set(seed.id, { ...seed, severity: existing && severityRank[existing.severity] > severityRank[seed.severity] ? existing.severity : seed.severity, evidence: Array.from(new Set([...(existing?.evidence ?? []), ...seed.evidence])).slice(-5), firstSeen: existing?.firstSeen ?? event.timestamp, lastSeen: event.timestamp, count: (existing?.count ?? 0) + 1 });
  }
  return Array.from(findings.values()).sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || b.count - a.count);
}

export function buildFixActionProposal(finding: LiveFinding, deviceId: string): ProposeActionInput {
  if (finding.sourceIp && /SSH|Nginx|authentication|user/i.test(finding.title)) return { source: "user", deviceId, actionType: "block_source_ip_temporary", riskLevel: "medium", parametersJson: { vendor: "linux", srcIp: finding.sourceIp, sourceIp: finding.sourceIp, durationMinutes: 60, findingId: finding.id, requestedOperation: `Temporarily block suspicious source ${finding.sourceIp}` } };
  return { source: "user", deviceId, actionType: "custom_vendor_action", riskLevel: finding.severity === "critical" ? "critical" : finding.severity === "high" ? "high" : "medium", parametersJson: { vendor: "linux", requestedOperation: finding.recommendedFix, operationCategory: /SSH|authentication|root/i.test(finding.title) ? "service_management" : /firewall|port/i.test(finding.title) ? "firewall" : "hardening", executionSupport: "manual_or_not_implemented", destructive: false, requiresExplicitReview: true, expectedImpact: `Mitigates finding: ${finding.title}.`, missingFields: [], suggestedPrechecks: ["Confirm the finding evidence and current service availability."], suggestedVerification: ["Verify the finding no longer recurs and required access remains available."], suggestedRollback: ["Restore the prior service or policy configuration if connectivity is affected."], findingId: finding.id } };
}

export function compactLiveFindingSummary(deviceId: string, findings: LiveFinding[], snapshot: LinuxSnapshot | null) { return { deviceId, riskScore: snapshot?.riskSummary.score ?? Math.min(100, findings.reduce((sum, item) => sum + severityRank[item.severity] * 8, 0)), topFindings: findings.slice(0, 8).map(({ title, severity, count, sourceIp, port, username, recommendedFix, evidence }) => ({ title, severity, count, sourceIp, port, username, recommendedFix, evidence: evidence.slice(0, 2) })), suspiciousIps: Array.from(new Set(findings.map((item) => item.sourceIp).filter(Boolean))), exposedPorts: snapshot?.network.exposedPorts ?? [], counts: { findings: findings.length, critical: findings.filter((item) => item.severity === "critical").length, high: findings.filter((item) => item.severity === "high").length } }; }
