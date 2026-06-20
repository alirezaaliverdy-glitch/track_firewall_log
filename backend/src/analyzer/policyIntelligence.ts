import type { NormalizedLog, PolicyFreqEntry, PolicyReview, Severity } from "./types.js";

type Accumulator = Omit<PolicyReview, "uniqueSourceIps" | "uniqueDestinationIps" | "topDestinationPorts" | "topServices" | "topSourceIps" | "topDestinationIps" | "riskScore" | "riskLevel" | "recommendation"> & {
  srcIps: Set<string>;
  dstIps: Set<string>;
  dstPortFreq: Map<string, number>;
  serviceFreq: Map<string, number>;
  srcIpFreq: Map<string, number>;
  dstIpFreq: Map<string, number>;
};

const MAX_RELATED_LOGS = 100;

function inc(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function topN(map: Map<string, number>, count = 5): PolicyFreqEntry[] {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, count).map(([value, entryCount]) => ({ value, count: entryCount }));
}

function isAllowed(log: NormalizedLog): boolean {
  return ["allow", "accept", "pass", "permit"].includes(log.action?.toLowerCase() ?? "");
}

function isBlocked(log: NormalizedLog): boolean {
  return ["deny", "drop", "block"].includes(log.action?.toLowerCase() ?? "");
}

export function hasPolicyFields(logs: NormalizedLog[]): boolean {
  return logs.some((log) => Boolean(log.policyId || log.policyName || log.ruleName || (log.ruleDisplayName && log.ruleDisplayName !== "Unknown Policy")));
}

function getPolicyDisplayName(log: NormalizedLog): string {
  return log.policyName ?? log.ruleName ?? log.ruleDisplayName ?? log.policyId ?? "Unknown Policy";
}

function getPolicyKey(log: NormalizedLog): string {
  const id = log.policyId?.trim();
  const name = getPolicyDisplayName(log).trim();
  return id ? `id:${id}` : `name:${name.toLowerCase()}`;
}

function riskLevel(score: number): Severity {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  if (score >= 15) return "low";
  return "info";
}

function calculatePolicyRiskScore(policy: PolicyReview): number {
  let score = 0;
  if (policy.allowedEvents > 0 && policy.inboundEvents > 0 && policy.managementTrafficEvents > 0) score += 30;
  if (policy.allowedEvents > 0 && policy.inboundEvents > 0 && policy.databaseTrafficEvents > 0) score += 35;
  if (policy.allowedEvents > 0 && policy.sensitivePortEvents > 0) score += 25;
  if (policy.deniedEvents + policy.droppedEvents >= 50) score += 15;
  if (policy.unknownDirectionEvents > 0) score += 10;
  if (policy.uniqueSourceIps >= 20 && policy.uniqueDestinationIps <= 3) score += 10;
  return Math.min(score, 100);
}

function recommendation(policy: PolicyReview): string {
  if (policy.allowedEvents > 0 && policy.inboundEvents > 0 && policy.databaseTrafficEvents > 0) return "Review immediately: this policy appears to allow inbound database traffic. Restrict to trusted sources or private networks.";
  if (policy.allowedEvents > 0 && policy.inboundEvents > 0 && policy.managementTrafficEvents > 0) return "Review remote access exposure. Keep management services behind VPN, bastion, or trusted source IPs.";
  if (policy.allowedEvents > 0 && policy.sensitivePortEvents > 0) return "Validate every allowed sensitive port and remove broad access that is not required.";
  if (policy.deniedEvents + policy.droppedEvents >= 50) return "Noisy blocking rule. Review source patterns and consider upstream blocks or clearer alerting thresholds.";
  if (policy.unknownDirectionEvents > 0) return "Improve source and destination IP mapping so this policy can be reviewed with traffic direction context.";
  return "Policy activity looks low risk from the available fields. Keep reviewing periodically.";
}

function createAccumulator(log: NormalizedLog): Accumulator {
  return {
    policyKey: getPolicyKey(log),
    policyName: getPolicyDisplayName(log),
    policyId: log.policyId,
    totalEvents: 0,
    allowedEvents: 0,
    blockedEvents: 0,
    deniedEvents: 0,
    droppedEvents: 0,
    inboundEvents: 0,
    outboundEvents: 0,
    internalEvents: 0,
    unknownDirectionEvents: 0,
    managementTrafficEvents: 0,
    databaseTrafficEvents: 0,
    sensitivePortEvents: 0,
    firstSeen: undefined,
    lastSeen: undefined,
    relatedLogs: [],
    srcIps: new Set(),
    dstIps: new Set(),
    dstPortFreq: new Map(),
    serviceFreq: new Map(),
    srcIpFreq: new Map(),
    dstIpFreq: new Map()
  };
}

export function buildPolicyReview(logs: NormalizedLog[]): PolicyReview[] {
  if (!hasPolicyFields(logs)) return [];
  const policies = new Map<string, Accumulator>();

  for (const log of logs) {
    const key = getPolicyKey(log);
    const policy = policies.get(key) ?? createAccumulator(log);
    policy.totalEvents += 1;
    if (isAllowed(log)) policy.allowedEvents += 1;
    if (isBlocked(log)) policy.blockedEvents += 1;
    if (log.action === "deny") policy.deniedEvents += 1;
    if (log.action === "drop") policy.droppedEvents += 1;
    if (log.trafficDirection === "inbound") policy.inboundEvents += 1;
    if (log.trafficDirection === "outbound") policy.outboundEvents += 1;
    if (log.trafficDirection === "internal") policy.internalEvents += 1;
    if (!log.trafficDirection || log.trafficDirection === "unknown") policy.unknownDirectionEvents += 1;
    if (log.isManagementTraffic) policy.managementTrafficEvents += 1;
    if (log.isDatabaseTraffic) policy.databaseTrafficEvents += 1;
    if (log.isRiskyServiceTraffic) policy.sensitivePortEvents += 1;
    if (log.srcIp) {
      policy.srcIps.add(log.srcIp);
      inc(policy.srcIpFreq, log.srcIp);
    }
    if (log.dstIp) {
      policy.dstIps.add(log.dstIp);
      inc(policy.dstIpFreq, log.dstIp);
    }
    if (log.dstPort !== undefined) inc(policy.dstPortFreq, String(log.dstPort));
    if (log.serviceCategory && log.serviceCategory !== "unknown") inc(policy.serviceFreq, log.serviceCategory);
    else if (log.service) inc(policy.serviceFreq, log.service);
    if (log.timestamp) {
      if (!policy.firstSeen || log.timestamp < policy.firstSeen) policy.firstSeen = log.timestamp;
      if (!policy.lastSeen || log.timestamp > policy.lastSeen) policy.lastSeen = log.timestamp;
    }
    if (policy.relatedLogs.length < MAX_RELATED_LOGS) policy.relatedLogs.push(log);
    policies.set(key, policy);
  }

  return Array.from(policies.values()).map((policy) => {
    const base: PolicyReview = {
      policyKey: policy.policyKey,
      policyName: policy.policyName,
      policyId: policy.policyId,
      totalEvents: policy.totalEvents,
      allowedEvents: policy.allowedEvents,
      blockedEvents: policy.blockedEvents,
      deniedEvents: policy.deniedEvents,
      droppedEvents: policy.droppedEvents,
      inboundEvents: policy.inboundEvents,
      outboundEvents: policy.outboundEvents,
      internalEvents: policy.internalEvents,
      unknownDirectionEvents: policy.unknownDirectionEvents,
      managementTrafficEvents: policy.managementTrafficEvents,
      databaseTrafficEvents: policy.databaseTrafficEvents,
      sensitivePortEvents: policy.sensitivePortEvents,
      uniqueSourceIps: policy.srcIps.size,
      uniqueDestinationIps: policy.dstIps.size,
      topDestinationPorts: topN(policy.dstPortFreq),
      topServices: topN(policy.serviceFreq),
      topSourceIps: topN(policy.srcIpFreq),
      topDestinationIps: topN(policy.dstIpFreq),
      firstSeen: policy.firstSeen,
      lastSeen: policy.lastSeen,
      riskScore: 0,
      riskLevel: "info",
      recommendation: "",
      relatedLogs: policy.relatedLogs
    };
    base.riskScore = calculatePolicyRiskScore(base);
    base.riskLevel = riskLevel(base.riskScore);
    base.recommendation = recommendation(base);
    return base;
  }).sort((a, b) => b.riskScore - a.riskScore || b.totalEvents - a.totalEvents);
}
