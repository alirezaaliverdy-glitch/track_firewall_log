import { isIP } from "node:net";
import type { Finding, SecurityEvent } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { redactForPersistence, redactText } from "../security/redaction.js";
import { buildTrustedSourceMatcher } from "./trusted-source-ip.service.js";
import { VENDOR_DETECTION_RULES, deduplicateDetectionEvents } from "../security/vendor-detection-rule-library.js";

const CLOSED_FINDING_STATUSES = ["resolved", "false_positive", "accepted_risk", "suppressed"];
const SEVERITY_WEIGHT: Record<string, number> = { critical: 88, high: 70, medium: 48, low: 28, info: 12 };
const EVENT_SAMPLE_LIMIT = 5_000;
const FINDING_LIMIT = 2_000;

type FindingWithContext = Finding & {
  device: { id: string; name: string; vendor: string; host: string; type: string };
  asset: { id: string; name: string; managementIp: string | null; healthState: string } | null;
};

type EventWithContext = SecurityEvent & {
  device: { id: string; name: string; vendor: string; host: string; type: string } | null;
  asset: { id: string; name: string; managementIp: string | null } | null;
};

export type AttackerFilters = {
  query?: string;
  vendor?: string;
  deviceId?: string;
  severity?: string;
  scope?: string;
  includeResolved?: boolean;
};

function normalize(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => normalize(value)).filter(Boolean))];
}

function eventTime(event: SecurityEvent) {
  return event.timestamp ?? event.receivedAt ?? event.createdAt;
}

function ipScope(ip: string) {
  if (isIP(ip) === 6) {
    const lowered = ip.toLowerCase();
    if (lowered === "::1") return "loopback";
    if (lowered.startsWith("fe80:")) return "link_local";
    if (lowered.startsWith("fc") || lowered.startsWith("fd")) return "private";
    return "public";
  }
  const octets = ip.split(".").map(Number);
  if (octets[0] === 127) return "loopback";
  if (octets[0] === 169 && octets[1] === 254) return "link_local";
  if (octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168)) return "private";
  return "public";
}

function severityForScore(score: number) {
  if (score >= 85) return "critical";
  if (score >= 65) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function mapFinding(finding: FindingWithContext) {
  return {
    id: finding.id,
    title: finding.title,
    summary: finding.summary,
    severity: finding.severity,
    category: finding.category,
    status: finding.status,
    confidence: finding.confidence,
    source: finding.source,
    vendor: finding.vendor,
    firstSeen: finding.firstSeen,
    lastSeen: finding.lastSeen,
    count: finding.count,
    mitreTags: finding.mitreTags,
    affectedObject: finding.affectedObject,
    actor: finding.actor,
    dstIp: finding.dstIp,
    dstPort: finding.dstPort,
    evidence: redactForPersistence(finding.evidenceJson),
    device: finding.device,
    asset: finding.asset
  };
}

function mapEvidenceEvent(event: EventWithContext) {
  return {
    id: event.id,
    timestamp: eventTime(event),
    vendor: event.vendor,
    sourceType: event.sourceType,
    eventType: event.eventType,
    severity: event.severity,
    action: event.action,
    srcPort: event.srcPort,
    dstIp: event.dstIp,
    dstPort: event.dstPort,
    protocol: event.protocol,
    username: event.username,
    ruleName: event.ruleName,
    interfaceIn: event.interfaceIn,
    interfaceOut: event.interfaceOut,
    count: event.count,
    message: redactText(event.rawSnippet ?? event.rawMessage ?? "").slice(0, 500),
    device: event.device,
    asset: event.asset
  };
}

function isNewSourceAnomaly(finding: FindingWithContext) {
  return /login from new source/i.test(finding.title) || (finding.category === "general-detection" && /auth(?:entication)? success|login success/i.test(`${finding.summary} ${JSON.stringify(finding.evidenceJson)}`));
}

function isOperationalFinding(finding: FindingWithContext) {
  const text = `${finding.title} ${finding.summary} ${finding.category}`;
  return /configuration.?change|account.?management|administrator account changed|policy changed|host firewall disabled|audit trail tampering/i.test(text);
}

function isSuccessfulAccessOnly(finding: FindingWithContext) {
  return /remote root login|successful (?:remote )?login|login success/i.test(`${finding.title} ${finding.summary}`) && !/after (?:authentication )?failures|brute.?force/i.test(`${finding.title} ${finding.summary}`);
}

function normalizedStoredEvidenceMessage(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/^\s*\d{4}-\d{2}-\d{2}t\S+\s+/, "")
    .replace(/^\s*[a-z]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isAuthenticationFailureText(value: string) {
  return /auth_failed|auth_failure|admin_auth_failed|vpn_auth_failed|failed password|login fail(?:ed|ure)?|authentication fail(?:ed|ure)?|invalid user|pam_unix.*failure/i.test(value);
}

function isActionableFinding(finding: FindingWithContext) {
  if (isNewSourceAnomaly(finding) || isOperationalFinding(finding) || isSuccessfulAccessOnly(finding)) return false;
  const definition = VENDOR_DETECTION_RULES.find((rule) => rule.name === finding.title);
  if (definition?.logicalEventFamily !== "authentication_failure" || !Array.isArray(finding.evidenceJson)) return true;
  const messages = finding.evidenceJson
    .map((entry) => entry && typeof entry === "object" && "message" in entry ? normalizedStoredEvidenceMessage(entry.message) : "")
    .filter((message) => message && isAuthenticationFailureText(message));
  if (!messages.length) return false;
  return new Set(messages).size >= definition.threshold;
}

function hasFailureEvidence(event: EventWithContext) {
  return isAuthenticationFailureText(`${event.eventType} ${event.action ?? ""} ${event.rawMessage ?? ""} ${event.rawSnippet ?? ""}`);
}

function hasSuccessEvidence(event: EventWithContext) {
  return /auth_success|accepted (?:password|publickey)|login success/i.test(`${event.eventType} ${event.action ?? ""} ${event.rawMessage ?? ""} ${event.rawSnippet ?? ""}`);
}

function buildAssessment(findings: FindingWithContext[], events: EventWithContext[]) {
  const actionableFindings = findings.filter(isActionableFinding);
  const authFailureEvents = events.filter(hasFailureEvidence);
  const authSuccessEvents = events.filter(hasSuccessEvidence);
  const logicalAuthenticationFailures = [...new Set(authFailureEvents.map((event) => event.vendor ?? "unknown"))]
    .flatMap((vendor) => {
      const vendorEvents = authFailureEvents.filter((event) => (event.vendor ?? "unknown") === vendor);
      const rule = VENDOR_DETECTION_RULES.find((candidate) => candidate.vendor === vendor && candidate.logicalEventFamily === "authentication_failure");
      return rule ? deduplicateDetectionEvents(rule, vendorEvents) : vendorEvents;
    });
  const onlyNewSourceAnomaly = actionableFindings.length === 0;
  const confirmedThreat = actionableFindings.some((finding) => /threat-prevention|intrusion-detection|malware_threat/i.test(finding.category) && finding.confidence >= 0.8);
  const authThresholdReached = actionableFindings.some((finding) => {
    const rule = VENDOR_DETECTION_RULES.find((candidate) => candidate.name === finding.title && candidate.logicalEventFamily === "authentication_failure");
    return rule ? logicalAuthenticationFailures.length >= rule.threshold : false;
  });
  const correlationThresholdReached = actionableFindings.some((finding) => {
    const rule = VENDOR_DETECTION_RULES.find((candidate) => candidate.name === finding.title);
    return Boolean(rule && rule.logicalEventFamily !== "authentication_failure" && finding.count >= rule.threshold);
  });
  const blockedByVendor = confirmedThreat && events.some((event) => /block|deny|drop|reset|quarantine/i.test(event.action ?? ""));
  const verdict = onlyNewSourceAnomaly ? "activity_anomaly" : confirmedThreat ? "confirmed_threat" : authThresholdReached || correlationThresholdReached ? "likely_attack" : "needs_review";
  return {
    verdict,
    isConfirmedAttacker: confirmedThreat,
    containmentStatus: blockedByVendor ? "blocked_by_vendor" : confirmedThreat ? "detected_not_confirmed_blocked" : "not_contained",
    primaryReason: onlyNewSourceAnomaly ? "new_source_success_only" : confirmedThreat ? "vendor_security_engine_confirmed" : authThresholdReached ? "repeated_authentication_threshold" : correlationThresholdReached ? "correlated_detection_threshold" : "security_findings_require_review",
    actionableFindingCount: actionableFindings.length,
    informationalFindingCount: findings.length - actionableFindings.length,
    logicalAuthenticationFailures: logicalAuthenticationFailures.length,
    authenticationSuccesses: authSuccessEvents.length,
    normalSessionEvents: events.filter((event) => /disconnect|timeout|session (?:opened|closed)/i.test(`${event.eventType} ${event.rawMessage ?? ""}`)).length,
    notes: [
      ...(findings.some(isNewSourceAnomaly) ? ["successful_login_from_previously_unseen_source"] : []),
      ...(authFailureEvents.length > logicalAuthenticationFailures.length ? ["duplicate_authentication_log_lines_collapsed"] : []),
      ...(authSuccessEvents.length ? ["successful_authentication_also_observed"] : [])
    ]
  };
}

function buildAttacker(ip: string, findings: FindingWithContext[], events: EventWithContext[], includeDetails: boolean) {
  const assessment = buildAssessment(findings, events);
  const actionableFindings = findings.filter(isActionableFinding);
  const scoringFindings = actionableFindings.length ? actionableFindings : findings;
  const maxFindingWeight = scoringFindings.length ? Math.max(...scoringFindings.map((finding) => SEVERITY_WEIGHT[finding.severity.toLowerCase()] ?? 20)) : 15;
  const observationCount = scoringFindings.reduce((sum, finding) => sum + Math.max(1, finding.count), 0);
  const eventCount = events.reduce((sum, event) => sum + Math.max(1, event.count), 0);
  const deviceIds = unique([...findings.map((finding) => finding.deviceId), ...events.map((event) => event.deviceId)]);
  const vendors = unique([...findings.map((finding) => finding.vendor.toLowerCase()), ...events.map((event) => event.vendor?.toLowerCase())]);
  const confidence = findings.reduce((maximum, finding) => Math.max(maximum, finding.confidence), 0);
  const lastSeenMs = Math.max(...findings.map((finding) => finding.lastSeen.getTime()), ...events.map((event) => eventTime(event).getTime()));
  const firstSeenMs = Math.min(...findings.map((finding) => finding.firstSeen.getTime()), ...events.map((event) => eventTime(event).getTime()));
  const recentBonus = Date.now() - lastSeenMs <= 24 * 60 * 60 * 1000 ? 4 : 0;
  const volumeBonus = Math.min(8, Math.round(Math.log2(Math.max(1, observationCount + eventCount)) * 1.5));
  const spreadBonus = Math.min(6, Math.max(0, deviceIds.length - 1) * 2 + Math.max(0, vendors.length - 1) * 2);
  const confidenceAdjustment = confidence >= 0.9 ? 3 : confidence < 0.6 ? -5 : 0;
  const riskScore = Math.max(1, Math.min(100, maxFindingWeight + recentBonus + volumeBonus + spreadBonus + confidenceAdjustment));
  const scope = ipScope(ip);
  const devices = new Map<string, FindingWithContext["device"]>();
  const assets = new Map<string, NonNullable<FindingWithContext["asset"]>>();
  findings.forEach((finding) => {
    devices.set(finding.device.id, finding.device);
    if (finding.asset) assets.set(finding.asset.id, finding.asset);
  });
  events.forEach((event) => {
    if (event.device) devices.set(event.device.id, event.device);
    if (event.asset && !assets.has(event.asset.id)) assets.set(event.asset.id, { ...event.asset, healthState: "unknown" });
  });
  const latestEvents = [...events].sort((left, right) => eventTime(right).getTime() - eventTime(left).getTime());
  const families = new Map<string, { key: string; title: string; severity: string; count: number; blocked: boolean }>();
  for (const finding of actionableFindings) {
    const key = finding.category || "security";
    const previous = families.get(key);
    const blocked = events.some((event) => event.deviceId === finding.deviceId && /block|deny|drop|reset|quarantine/i.test(event.action ?? ""));
    const currentWeight = SEVERITY_WEIGHT[finding.severity.toLowerCase()] ?? 0;
    const previousWeight = SEVERITY_WEIGHT[previous?.severity.toLowerCase() ?? ""] ?? 0;
    families.set(key, {
      key,
      title: currentWeight >= previousWeight ? finding.title : previous?.title ?? finding.title,
      severity: currentWeight >= previousWeight ? finding.severity : previous?.severity ?? finding.severity,
      count: (previous?.count ?? 0) + Math.max(1, finding.count),
      blocked: Boolean(previous?.blocked || blocked)
    });
  }
  const responseReadiness = [...devices.values()].map((device) => {
    const vendor = device.vendor.toLowerCase();
    const deviceEvents = events.filter((event) => event.deviceId === device.id);
    const finding = actionableFindings.find((item) => item.deviceId === device.id);
    const interfaceIn = unique(deviceEvents.map((event) => event.interfaceIn))[0];
    const interfaceOut = unique(deviceEvents.map((event) => event.interfaceOut))[0];
    if (/forti/.test(vendor)) return { deviceId: device.id, deviceName: device.name, vendor: "fortigate", findingId: finding?.id ?? null, mode: interfaceIn && interfaceOut ? "ready" : "needs_parameters", missingParameters: [!interfaceIn ? "srcintf" : "", !interfaceOut ? "dstintf" : ""].filter(Boolean), interfaceIn: interfaceIn ?? null, interfaceOut: interfaceOut ?? null };
    if (/linux/.test(vendor) || device.type === "linux_edge") return { deviceId: device.id, deviceName: device.name, vendor: "linux", findingId: finding?.id ?? null, mode: "ready", missingParameters: [], interfaceIn: null, interfaceOut: null };
    if (/mikrotik|routeros/.test(vendor)) return { deviceId: device.id, deviceName: device.name, vendor: "mikrotik", findingId: finding?.id ?? null, mode: "ready", missingParameters: [], interfaceIn: null, interfaceOut: null };
    return { deviceId: device.id, deviceName: device.name, vendor, findingId: finding?.id ?? null, mode: "review_only", missingParameters: [], interfaceIn: null, interfaceOut: null };
  });

  return {
    ip,
    ipVersion: isIP(ip),
    scope,
    riskScore,
    severity: severityForScore(riskScore),
    confidence,
    status: assessment.containmentStatus === "blocked_by_vendor" ? "contained" : findings.some((finding) => finding.status === "investigating") ? "investigating" : "active",
    firstSeen: new Date(firstSeenMs),
    lastSeen: new Date(lastSeenMs),
    findingCount: findings.length,
    observationCount,
    eventCount,
    vendors,
    devices: [...devices.values()],
    assets: [...assets.values()],
    categories: unique(findings.map((finding) => finding.category)),
    sources: unique([...findings.map((finding) => finding.source), ...events.map((event) => event.sourceType)]),
    actions: unique(events.map((event) => event.action)),
    protocols: unique(events.map((event) => event.protocol)),
    targetedIps: unique([...findings.map((finding) => finding.dstIp), ...events.map((event) => event.dstIp)]),
    targetedPorts: [...new Set([...findings.map((finding) => finding.dstPort), ...events.map((event) => event.dstPort)].filter((port): port is number => typeof port === "number"))].sort((a, b) => a - b),
    usernames: unique([...findings.map((finding) => finding.actor), ...events.map((event) => event.username)]),
    eventTypes: unique(events.map((event) => event.eventType)),
    mitreTags: unique(findings.flatMap((finding) => finding.mitreTags)),
    assessment,
    attackFamilies: [...families.values()].sort((left, right) => (SEVERITY_WEIGHT[right.severity.toLowerCase()] ?? 0) - (SEVERITY_WEIGHT[left.severity.toLowerCase()] ?? 0)),
    responseReadiness,
    latestEvidence: latestEvents.slice(0, includeDetails ? 100 : 3).map(mapEvidenceEvent),
    enrichment: {
      status: "local_telemetry_only",
      geo: null,
      asn: null,
      networkOwner: null
    },
    ...(includeDetails ? { findings: findings.map(mapFinding) } : {})
  };
}

async function loadAttackers(filters: AttackerFilters, exactIp?: string) {
  const vendor = normalize(filters.vendor).toLowerCase();
  const deviceId = normalize(filters.deviceId);
  const findingWhere = {
    srcIp: exactIp ? exactIp : { not: null },
    ...(!filters.includeResolved ? { status: { notIn: CLOSED_FINDING_STATUSES } } : {}),
    ...(vendor ? { vendor: { equals: vendor, mode: "insensitive" as const } } : {}),
    ...(deviceId ? { deviceId } : {})
  };
  const candidateFindings = await prisma.finding.findMany({
    where: findingWhere,
    orderBy: { lastSeen: "desc" },
    take: FINDING_LIMIT,
    include: {
      device: { select: { id: true, name: true, vendor: true, host: true, type: true } },
      asset: { select: { id: true, name: true, managementIp: true, healthState: true } }
    }
  }) as FindingWithContext[];
  const candidateIps = unique(candidateFindings.map((finding) => finding.srcIp)).filter((ip) => isIP(ip) > 0);
  const isTrusted = await buildTrustedSourceMatcher(candidateIps);
  const findings = candidateFindings.filter((finding) => !isTrusted(finding.srcIp, finding.vendor));
  const findingsByIp = new Map<string, FindingWithContext[]>();
  for (const finding of findings) {
    if (!finding.srcIp || !isIP(finding.srcIp)) continue;
    const bucket = findingsByIp.get(finding.srcIp);
    if (bucket) bucket.push(finding);
    else findingsByIp.set(finding.srcIp, [finding]);
  }
  const ips = exactIp && findingsByIp.has(exactIp)
    ? [exactIp]
    : [...findingsByIp.entries()].filter(([, entries]) => entries.some(isActionableFinding)).map(([ip]) => ip);
  if (!ips.length) return { findings, events: [] as EventWithContext[], ips, findingsByIp };
  const candidateEvents = await prisma.securityEvent.findMany({
    where: {
      srcIp: { in: ips },
      ...(deviceId ? { deviceId } : {}),
      ...(vendor ? { vendor: { equals: vendor, mode: "insensitive" as const } } : {})
    },
    orderBy: [{ timestamp: "desc" }, { receivedAt: "desc" }],
    take: EVENT_SAMPLE_LIMIT,
    include: {
      device: { select: { id: true, name: true, vendor: true, host: true, type: true } },
      asset: { select: { id: true, name: true, managementIp: true } }
    }
  }) as EventWithContext[];
  const events = candidateEvents.filter((event) => !isTrusted(event.srcIp, event.vendor));
  return { findings, events, ips, findingsByIp };
}

export async function listAttackers(filters: AttackerFilters = {}) {
  const loaded = await loadAttackers(filters);
  const query = normalize(filters.query).toLowerCase();
  const severity = normalize(filters.severity).toLowerCase();
  const scope = normalize(filters.scope).toLowerCase();
  const eventsByIp = new Map<string, EventWithContext[]>();
  for (const event of loaded.events) {
    if (!event.srcIp) continue;
    const bucket = eventsByIp.get(event.srcIp);
    if (bucket) bucket.push(event);
    else eventsByIp.set(event.srcIp, [event]);
  }
  const attackers = loaded.ips.map((ip) => buildAttacker(ip, loaded.findingsByIp.get(ip) ?? [], eventsByIp.get(ip) ?? [], false)).filter((attacker) => {
    if (severity && attacker.severity !== severity) return false;
    if (scope && attacker.scope !== scope) return false;
    if (!query) return true;
    const searchable = [attacker.ip, ...attacker.vendors, ...attacker.categories, ...attacker.devices.map((device) => device.name), ...attacker.assets.map((asset) => asset.name)].join(" ").toLowerCase();
    return searchable.includes(query);
  }).sort((left, right) => right.riskScore - left.riskScore || right.lastSeen.getTime() - left.lastSeen.getTime());

  return {
    generatedAt: new Date(),
    qualification: "actionable_open_security_finding_with_valid_source_ip",
    summary: {
      total: attackers.length,
      critical: attackers.filter((attacker) => attacker.severity === "critical").length,
      high: attackers.filter((attacker) => attacker.severity === "high").length,
      public: attackers.filter((attacker) => attacker.scope === "public").length,
      private: attackers.filter((attacker) => attacker.scope === "private").length,
      affectedDevices: new Set(attackers.flatMap((attacker) => attacker.devices.map((device) => device.id))).size,
      affectedAssets: new Set(attackers.flatMap((attacker) => attacker.assets.map((asset) => asset.id))).size,
      vendors: unique(attackers.flatMap((attacker) => attacker.vendors)),
      confirmed: attackers.filter((attacker) => attacker.assessment.isConfirmedAttacker).length,
      contained: attackers.filter((attacker) => attacker.status === "contained").length,
      fortigate: attackers.filter((attacker) => attacker.vendors.includes("fortigate")).length,
      linux: attackers.filter((attacker) => attacker.vendors.includes("linux")).length
    },
    coverage: {
      findingsScanned: loaded.findings.length,
      eventsScanned: loaded.events.length,
      findingLimitReached: loaded.findings.length >= FINDING_LIMIT,
      eventSampleLimitReached: loaded.events.length >= EVENT_SAMPLE_LIMIT,
      enrichment: "local_telemetry_only"
    },
    attackers
  };
}

export async function getAttackerDetails(ip: string, filters: AttackerFilters = {}) {
  const normalizedIp = normalize(ip);
  if (!isIP(normalizedIp)) return null;
  const loaded = await loadAttackers(filters, normalizedIp);
  const findings = loaded.findings.filter((finding) => finding.srcIp === normalizedIp);
  if (!findings.length) return null;
  return {
    generatedAt: new Date(),
    qualification: "actionable_open_security_finding_with_valid_source_ip",
    attacker: buildAttacker(normalizedIp, findings, loaded.events.filter((event) => event.srcIp === normalizedIp), true)
  };
}
