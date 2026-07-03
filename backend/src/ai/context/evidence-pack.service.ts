import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { VENDOR_ANALYSIS_PROFILES, analyzeVendorDevice, normalizeAnalysisVendor, type AnalysisVendor } from "../../assessments/vendor-analysis-profiles.js";
import { VENDOR_COMMAND_CATALOG } from "../../actions/catalog/index.js";
import { getVendorTelemetryProfile } from "../../telemetry/vendor-telemetry-profiles.js";

const SECRET_KEY = /^(password|passwd|secret|token|api.?key|private.?key|passphrase|credential|authorization|cookie|.*Encrypted)$/i;
const RAW_KEY = /^(raw|raw(logs?|lines?|messages?|payload|text)|full(logs?|messages?))$/i;

export type EvidencePackLimits = {
  events: number; incidents: number; findings: number; actionPlans: number; evidenceLines: number; rawMessageChars: number; includeRawLogs: boolean;
};

export type EvidencePackSource = {
  selectedDevice?: Record<string, unknown> | null;
  devices?: Array<Record<string, unknown>>;
  snapshots?: Array<Record<string, unknown>>;
  events?: Array<Record<string, unknown>>;
  incidents?: Array<Record<string, unknown>>;
  findings?: Array<Record<string, unknown>>;
  actionPlans?: Array<Record<string, unknown>>;
};

export const defaultEvidencePackLimits = (): EvidencePackLimits => ({
  events: env.aiMaxContextEvents,
  incidents: env.aiMaxContextIncidents,
  findings: env.aiMaxContextFindings,
  actionPlans: env.aiMaxActionPlans,
  evidenceLines: env.aiMaxEvidenceLines,
  rawMessageChars: env.aiMaxRawMessageChars,
  includeRawLogs: env.aiIncludeRawLogs
});

function clean(value: unknown, limits: EvidencePackLimits, depth = 0, raw = false): unknown {
  if (depth > 5 || value === undefined) return undefined;
  if (typeof value === "string") return raw ? value.slice(0, limits.rawMessageChars) : value;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, limits.evidenceLines).map((item) => clean(item, limits, depth + 1, raw));
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !SECRET_KEY.test(key) && (limits.includeRawLogs || !RAW_KEY.test(key)))
    .map(([key, item]) => [key, clean(item, limits, depth + 1, RAW_KEY.test(key))])
    .filter(([, item]) => item !== undefined));
}

function vendorRelevantSnapshot(vendor: AnalysisVendor, snapshot: Record<string, unknown> | undefined, limits: EvidencePackLimits) {
  if (!snapshot) return null;
  const allowed: Record<AnalysisVendor, string[]> = {
    mikrotik: ["system", "routeros", "packages", "services", "firewall", "interfaces", "vpn", "dns", "dhcp", "routes", "findings", "riskSummary"],
    linux: ["host", "privilegeLevel", "ssh", "network", "firewall", "securityTools", "updates", "findings", "riskSummary"],
    fortigate: ["system", "firmware", "admin", "interfaces", "policies", "vip", "localIn", "vpn", "securityProfiles", "findings", "riskSummary"],
    pfsense: ["system", "version", "interfaces", "firewall", "nat", "vpn", "aliases", "services", "packages", "findings", "riskSummary"],
    cisco: ["system", "version", "aaa", "management", "acls", "interfaces", "routing", "snmp", "ntp", "syslog", "findings", "riskSummary"],
    generic: ["system", "connectivity", "services", "capabilities", "findings", "riskSummary"]
  };
  const data = (snapshot.dataJson && typeof snapshot.dataJson === "object" ? snapshot.dataJson : snapshot) as Record<string, unknown>;
  return clean(Object.fromEntries(allowed[vendor].filter((key) => data[key] !== undefined).map((key) => [key, data[key]])), limits);
}

export function composeEvidencePack(source: EvidencePackSource, limits = defaultEvidencePackLimits()) {
  const selected = source.selectedDevice ?? source.devices?.[0] ?? null;
  const vendor = normalizeAnalysisVendor(selected?.vendor ?? selected?.type);
  const deviceId = String(selected?.id ?? "");
  const relevantSnapshots = (source.snapshots ?? []).filter((item) => !deviceId || String(item.deviceId ?? "") === deviceId);
  const latestSnapshot = relevantSnapshots[0];
  const analysis = selected ? analyzeVendorDevice({
    id: deviceId || "selected", name: String(selected.name ?? "Selected device"), vendor, type: selected.type,
    status: selected.status, managementPort: selected.managementPort, protocol: selected.protocol, capabilities: selected.capabilities
  }, latestSnapshot ? [{ snapshotType: String(latestSnapshot.snapshotType ?? "snapshot"), dataJson: latestSnapshot.dataJson }] : []) : null;
  const scoped = (items: Array<Record<string, unknown>> = []) => items.filter((item) => !deviceId || !item.deviceId || String(item.deviceId) === deviceId);
  const events = scoped(source.events).slice(0, limits.events);
  const incidents = scoped(source.incidents).slice(0, limits.incidents);
  const findings = [...scoped(source.findings), ...(analysis?.findings ?? [])].slice(0, limits.findings);
  const actionPlans = scoped(source.actionPlans).slice(0, limits.actionPlans);
  const actionHints = Array.from(new Set([
    ...VENDOR_ANALYSIS_PROFILES[vendor].actionHints,
    ...VENDOR_COMMAND_CATALOG.filter((action) => action.vendor === vendor).map((action) => action.actionType)
  ])).slice(0, limits.evidenceLines);
  const telemetryProfile = getVendorTelemetryProfile(selected?.vendor, selected?.type);
  const contextTruncated = scoped(source.events).length > events.length || scoped(source.incidents).length > incidents.length ||
    scoped(source.findings).length + (analysis?.findings.length ?? 0) > findings.length || scoped(source.actionPlans).length > actionPlans.length;

  const pack = {
    mode: "compact_evidence",
    generatedAt: new Date().toISOString(),
    selectedDevice: selected ? { id: selected.id, name: selected.name, vendor, type: selected.type, status: selected.status, managementPort: selected.managementPort, protocol: selected.protocol, capabilities: selected.capabilities } : null,
    vendor,
    vendorAnalysisProfile: VENDOR_ANALYSIS_PROFILES[vendor],
    vendorTelemetryProfile: telemetryProfile ? { vendorId: telemetryProfile.vendorId, vendorName: telemetryProfile.vendorName, deviceRoles: telemetryProfile.roles, liveSources: telemetryProfile.liveSources, snapshotSources: telemetryProfile.snapshotSources, supportedActionIntents: telemetryProfile.recommendedRemediationIntents, findingRuleIds: telemetryProfile.findingRules.map(rule => rule.id) } : null,
    latestTelemetry: vendorRelevantSnapshot(vendor, latestSnapshot, limits),
    liveFindings: findings,
    recentHighCriticalEvents: events,
    incidents,
    hardeningRecommendations: scoped(source.findings).slice(0, limits.findings),
    recentActionPlans: actionPlans,
    availableActionHints: actionHints,
    metadata: { contextTruncated, rawLogsIncluded: limits.includeRawLogs, includedEventsCount: events.length, includedFindingsCount: findings.length, includedIncidentsCount: incidents.length, includedActionPlansCount: actionPlans.length }
  };
  return clean(pack, limits) as typeof pack;
}

export async function buildEvidencePack(input: { selectedDeviceId?: string; vendor?: string } = {}) {
  const limits = defaultEvidencePackLimits();
  const deviceWhere = input.selectedDeviceId ? { id: input.selectedDeviceId } : input.vendor ? { vendor: { contains: input.vendor, mode: "insensitive" as const } } : {};
  const [devices, snapshots, events, incidents, findings, actionPlans] = await Promise.all([
    prisma.device.findMany({ where: deviceWhere, orderBy: { updatedAt: "desc" }, take: 25, select: { id: true, name: true, vendor: true, type: true, status: true, managementPort: true, protocol: true, capabilities: true } }),
    prisma.deviceSnapshot.findMany({ where: input.selectedDeviceId ? { deviceId: input.selectedDeviceId } : {}, orderBy: { collectedAt: "desc" }, take: 25, select: { deviceId: true, vendor: true, snapshotType: true, dataJson: true, collectedAt: true } }),
    prisma.securityEvent.findMany({ where: { severity: { in: ["high", "critical"] }, ...(input.selectedDeviceId ? { deviceId: input.selectedDeviceId } : {}) }, orderBy: { receivedAt: "desc" }, take: limits.events + 1, select: { id: true, deviceId: true, eventType: true, severity: true, srcIp: true, dstIp: true, dstPort: true, action: true, receivedAt: true } }),
    prisma.incident.findMany({ where: input.selectedDeviceId ? { deviceId: input.selectedDeviceId } : {}, orderBy: { lastSeenAt: "desc" }, take: limits.incidents + 1, select: { id: true, deviceId: true, title: true, severity: true, status: true, eventCount: true, summaryJson: true, firstSeenAt: true, lastSeenAt: true } }),
    prisma.finding.findMany({ where: input.selectedDeviceId ? { deviceId: input.selectedDeviceId } : {}, orderBy: { lastSeen: "desc" }, take: limits.findings + 1, select: { id: true, deviceId: true, vendor: true, title: true, severity: true, category: true, summary: true, evidenceJson: true, recommendedActions: true, confidence: true, status: true, lastSeen: true, count: true, mitreTags: true } }),
    prisma.actionPlan.findMany({ where: input.selectedDeviceId ? { deviceId: input.selectedDeviceId } : {}, orderBy: { updatedAt: "desc" }, take: limits.actionPlans + 1, select: { id: true, deviceId: true, actionType: true, status: true, riskLevel: true, parametersJson: true, createdAt: true, updatedAt: true } })
  ]);
  return composeEvidencePack({ selectedDevice: devices[0], devices, snapshots, events, incidents, findings, actionPlans }, limits);
}
