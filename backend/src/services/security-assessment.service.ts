import { ActionType, AiRiskLevel, type Prisma } from "@prisma/client";
import { getCommandCatalogEntry, VENDOR_COMMAND_CATALOG } from "../actions/catalog/index.js";
import { selectDeviceConnector } from "../connectors/connector-registry.service.js";
import { prisma } from "../db/prisma.js";
import { buildSecurityContext } from "./ai-context.service.js";
import { proposeActionPlan } from "./action-plan.service.js";

type SecurityContext = Awaited<ReturnType<typeof buildSecurityContext>>;
type AssessmentFinding = {
  id: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  category: string;
  affectedDevices: string[];
  evidence: Record<string, unknown>;
  explanation: string;
  recommendedNextStep: string;
};

type RecommendationDraft = {
  deviceId: string | null;
  vendor: string;
  title: string;
  severity: string;
  category: string;
  reason: string;
  evidence: Record<string, unknown>;
  recommendation: string;
  catalogActionId: string | null;
  actionType: string | null;
  parameters: Record<string, unknown>;
  executable: boolean;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeVendor(value: unknown) {
  const text = String(value ?? "").toLowerCase();
  if (text.includes("mikrotik") || text.includes("routeros")) return "mikrotik";
  if (text.includes("forti")) return "fortigate";
  if (text.includes("linux") || text.includes("ubuntu") || text.includes("debian")) return "linux";
  if (text.includes("pfsense")) return "pfsense";
  return text || "unknown";
}

function severityCount(context: SecurityContext, severity: string) {
  return context.incidents.countBySeverity.find((row) => row.severity === severity)?.count ?? 0;
}

export function buildAssessmentDraft(context: SecurityContext, snapshotCount = 0) {
  const findings: AssessmentFinding[] = [];
  const criticalIncidents = severityCount(context, "critical");
  const highIncidents = severityCount(context, "high");
  const mediumIncidents = severityCount(context, "medium");
  const sensitiveHits = context.events.sensitivePorts.reduce((sum, row) => sum + row.count, 0);
  const unhealthyDevices = context.devices.filter((device) => !["online", "connected"].includes(String(device.status).toLowerCase()));
  const failedActions = context.actionPlans.recent.filter((plan) => plan.status === "failed");

  if (criticalIncidents + highIncidents > 0) {
    findings.push({
      id: "active-high-severity-incidents",
      title: "High-severity incidents require attention",
      severity: criticalIncidents > 0 ? "critical" : "high",
      category: "incident_trend",
      affectedDevices: context.incidents.recent.map((incident) => incident.device?.id).filter((id): id is string => Boolean(id)),
      evidence: { criticalIncidents, highIncidents, recent: context.incidents.recent.slice(0, 5) },
      explanation: "Recent high-impact detections indicate active or unresolved security pressure.",
      recommendedNextStep: "Review incident evidence and contain confirmed hostile sources with a controlled catalog action."
    });
  }
  if (sensitiveHits > 0) {
    findings.push({
      id: "sensitive-management-port-activity",
      title: "Sensitive services received recent traffic",
      severity: sensitiveHits > 25 ? "high" : "medium",
      category: "exposed_services",
      affectedDevices: context.devices.map((device) => device.id),
      evidence: { sensitivePorts: context.events.sensitivePorts, recentEventCount: context.events.recentCount },
      explanation: "Traffic to management and data-service ports increases exposure and should be restricted to trusted sources.",
      recommendedNextStep: "Verify listeners and restrict management access using vendor catalog actions where parameters are known."
    });
  }
  if (unhealthyDevices.length > 0) {
    findings.push({
      id: "device-health-visibility",
      title: "Some registered devices are not confirmed online",
      severity: "medium",
      category: "device_health",
      affectedDevices: unhealthyDevices.map((device) => device.id),
      evidence: { devices: unhealthyDevices.map((device) => ({ id: device.id, name: device.name, status: device.status })) },
      explanation: "Incomplete device health reduces confidence in firewall posture and connector coverage.",
      recommendedNextStep: "Verify credentials and connector reachability in Device Registry."
    });
  }
  if (failedActions.length > 0) {
    findings.push({
      id: "failed-controlled-actions",
      title: "Controlled actions recently failed",
      severity: "medium",
      category: "action_history",
      affectedDevices: failedActions.map((plan) => plan.deviceId).filter((id): id is string => Boolean(id)),
      evidence: { failedActions },
      explanation: "Failed actions can leave intended hardening incomplete even when no unsafe command was run.",
      recommendedNextStep: "Review connector output and audit timelines before retrying."
    });
  }
  if (context.events.recentCount === 0) {
    findings.push({
      id: "no-recent-security-events",
      title: "No recent security telemetry is available",
      severity: "medium",
      category: "logging",
      affectedDevices: context.devices.map((device) => device.id),
      evidence: { recentWindowMinutes: context.recentWindowMinutes, eventCount: 0 },
      explanation: "An empty event window may indicate a quiet network or a logging/collector gap.",
      recommendedNextStep: "Verify collectors, log forwarding, timestamps, and retention settings."
    });
  }

  const catalogCoverage = Object.fromEntries(["mikrotik", "fortigate", "linux"].map((vendor) => {
    const entries = VENDOR_COMMAND_CATALOG.filter((entry) => entry.vendor === vendor);
    return [vendor, { total: entries.length, executable: entries.filter((entry) => entry.supportsExecution).length, readOnly: entries.filter((entry) => entry.readOnly).length }];
  }));
  const score = Math.min(100,
    criticalIncidents * 18 + highIncidents * 10 + mediumIncidents * 4 +
    Math.min(20, sensitiveHits) + unhealthyDevices.length * 5 + failedActions.length * 4 +
    (context.events.recentCount === 0 ? 10 : 0)
  );
  const topRisks = [...findings].sort((a, b) => ["low", "medium", "high", "critical"].indexOf(b.severity) - ["low", "medium", "high", "critical"].indexOf(a.severity)).slice(0, 5);
  const affectedDevices = Array.from(new Set(findings.flatMap((finding) => finding.affectedDevices)));
  const summary = score >= 70
    ? "High security risk: immediate review and prioritized containment are recommended."
    : score >= 40
      ? "Moderate security risk: several hardening and visibility improvements are recommended."
      : "Current observed risk is low, but routine hardening and telemetry checks should continue.";

  return {
    riskScore: score,
    summary,
    findings,
    topRisks,
    affectedDevices,
    evidence: {
      devices: context.devices.length,
      recentEvents: context.events.recentCount,
      recentIncidents: context.incidents.recent.length,
      recentActions: context.actionPlans.recent.length,
      connectorSnapshots: snapshotCount,
      sensitivePorts: context.events.sensitivePorts,
      topSourceIps: context.events.topSourceIps
    },
    explanation: "The score is deterministic and combines incident severity, sensitive-port activity, device health, action failures, and telemetry coverage.",
    recommendedNextSteps: findings.map((finding) => finding.recommendedNextStep),
    catalogCoverage
  };
}

async function collectReadOnlySnapshots() {
  const devices = await prisma.device.findMany();
  const snapshots = await Promise.all(devices.map(async (device) => {
    const connector = selectDeviceConnector(device);
    if (!connector || (!device.credentialId && !device.credentialRef)) return null;
    try {
      const data = await connector.collectStatus(device);
      return await prisma.deviceSnapshot.create({
        data: { deviceId: device.id, vendor: normalizeVendor(device.vendor || device.type), snapshotType: "connector_status", dataJson: toJson(data) }
      });
    } catch (error) {
      return await prisma.deviceSnapshot.create({
        data: { deviceId: device.id, vendor: normalizeVendor(device.vendor || device.type), snapshotType: "connector_status_error", dataJson: toJson({ message: error instanceof Error ? error.message : "Status collection failed" }) }
      });
    }
  }));
  return snapshots.filter((snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot));
}

export async function runFullAnalysis(input: { scopeType?: string; scopeId?: string; collectConnectorData?: boolean } = {}) {
  const [context, snapshots] = await Promise.all([
    buildSecurityContext({ recentMinutes: 1440 }),
    input.collectConnectorData === false ? Promise.resolve([]) : collectReadOnlySnapshots()
  ]);
  const draft = buildAssessmentDraft(context, snapshots.length);
  return prisma.securityAssessment.create({
    data: {
      scopeType: input.scopeType?.trim() || "all",
      scopeId: input.scopeId?.trim() || null,
      status: "completed",
      riskScore: draft.riskScore,
      summary: draft.summary,
      findingsJson: toJson(draft)
    },
    include: { recommendations: { include: { device: { select: { id: true, name: true, vendor: true, type: true } } } } }
  });
}

export async function getSecurityAssessment(id: string) {
  return prisma.securityAssessment.findUnique({
    where: { id },
    include: { recommendations: { orderBy: [{ executable: "desc" }, { createdAt: "asc" }], include: { device: { select: { id: true, name: true, vendor: true, type: true } } } } }
  });
}

function catalogRecommendation(input: Omit<RecommendationDraft, "actionType" | "executable">): RecommendationDraft {
  const entry = input.catalogActionId ? getCommandCatalogEntry(input.catalogActionId) : null;
  const hasParams = entry ? entry.requiredParams.every((field) => input.parameters[field] !== undefined && input.parameters[field] !== "") : false;
  const actionType = entry && Object.values(ActionType).includes(entry.actionType as ActionType) ? String(entry.actionType) : null;
  return { ...input, actionType, executable: Boolean(entry?.supportsExecution && actionType && input.deviceId && hasParams) };
}

export function buildHardeningRecommendationDrafts(
  assessment: { findingsJson: unknown },
  devices: Array<{ id: string; name: string; vendor: string; type: string; managementPort: number }>
) {
  const details = object(assessment.findingsJson);
  const evidence = object(details.evidence);
  const topSources = Array.isArray(evidence.topSourceIps) ? evidence.topSourceIps.map(object) : [];
  const leadingSource = typeof topSources[0]?.srcIp === "string" ? topSources[0].srcIp : null;
  const recommendations: RecommendationDraft[] = [];

  for (const device of devices) {
    const vendor = normalizeVendor(device.vendor || device.type);
    if (vendor === "mikrotik") {
      recommendations.push(catalogRecommendation({
        deviceId: device.id, vendor, title: "Create a current sanitized configuration export", severity: "medium", category: "backup",
        reason: "A current export makes controlled rollback and incident recovery safer.", evidence: { device: device.name },
        recommendation: "Create and securely retain a hide-sensitive RouterOS export.", catalogActionId: "mikrotik.export_config", parameters: {}
      }));
      recommendations.push(catalogRecommendation({
        deviceId: device.id, vendor, title: "Restrict SSH management access", severity: "high", category: "management_access",
        reason: "Management services should accept traffic only from an explicitly trusted source.", evidence: { managementPort: device.managementPort },
        recommendation: "Choose an allowed management CIDR, then restrict the SSH service.", catalogActionId: "mikrotik.allow_management_source", parameters: { serviceName: "ssh" }
      }));
    } else if (vendor === "fortigate") {
      recommendations.push(catalogRecommendation({
        deviceId: device.id, vendor, title: "Create a current FortiGate configuration backup", severity: "medium", category: "backup",
        reason: "A current backup supports recovery before policy and NAT changes.", evidence: { device: device.name },
        recommendation: "Collect a controlled configuration backup.", catalogActionId: "fortigate.backup_config", parameters: {}
      }));
      recommendations.push(catalogRecommendation({
        deviceId: device.id, vendor, title: "Enable logging on important firewall policies", severity: "medium", category: "logging",
        reason: "Policy logging improves incident evidence and traffic trend visibility.", evidence: { device: device.name },
        recommendation: "Select the managed policy ID that should log all traffic.", catalogActionId: "fortigate.enable_policy_logging", parameters: {}
      }));
    } else if (vendor === "linux") {
      recommendations.push(catalogRecommendation({
        deviceId: device.id, vendor, title: "Review listening ports", severity: "medium", category: "exposed_services",
        reason: "Unexpected listeners can expose management or application services.", evidence: { device: device.name },
        recommendation: "Collect the controlled listening-port inventory and close unnecessary services.", catalogActionId: "linux.read_listening_ports", parameters: {}
      }));
      if (leadingSource) recommendations.push(catalogRecommendation({
        deviceId: device.id, vendor, title: `Temporarily block suspicious source ${leadingSource}`, severity: "high", category: "containment",
        reason: "This source generated the highest recent event volume.", evidence: { sourceIp: leadingSource, source: topSources[0] },
        recommendation: "Confirm the source is hostile, then apply a time-bounded managed UFW block.", catalogActionId: "linux.temporary_block_ip", parameters: { srcIp: leadingSource, durationMinutes: 30 }
      }));
    }
  }

  recommendations.push({
    deviceId: null, vendor: "manual", title: "Verify end-to-end log coverage", severity: "medium", category: "logging",
    reason: "Assessment confidence depends on complete, timely telemetry from every managed device.", evidence: { recentEvents: evidence.recentEvents ?? 0 },
    recommendation: "Compare registered devices with active collectors and repair any gaps.", catalogActionId: null, actionType: null, parameters: {}, executable: false
  });
  return recommendations;
}

export async function generateHardeningSuggestions(assessmentId: string) {
  const assessment = await prisma.securityAssessment.findUnique({ where: { id: assessmentId } });
  if (!assessment) return null;
  const existing = await prisma.hardeningRecommendation.count({ where: { assessmentId } });
  if (existing > 0) return getSecurityAssessment(assessmentId);
  const devices = await prisma.device.findMany({ select: { id: true, name: true, vendor: true, type: true, managementPort: true } });
  const drafts = buildHardeningRecommendationDrafts(assessment, devices);
  await prisma.hardeningRecommendation.createMany({
    data: drafts.map((draft) => ({
      assessmentId,
      deviceId: draft.deviceId,
      vendor: draft.vendor,
      title: draft.title,
      severity: draft.severity,
      category: draft.category,
      reason: draft.reason,
      evidenceJson: toJson(draft.evidence),
      recommendation: draft.recommendation,
      catalogActionId: draft.catalogActionId,
      actionType: draft.actionType,
      parametersJson: toJson(draft.parameters),
      executable: draft.executable,
      status: draft.executable ? "ready" : "manual"
    }))
  });
  return getSecurityAssessment(assessmentId);
}

export async function createActionPlanFromRecommendation(id: string) {
  const recommendation = await prisma.hardeningRecommendation.findUnique({ where: { id } });
  if (!recommendation) return null;
  if (recommendation.actionPlanId) {
    const existing = await prisma.actionPlan.findUnique({ where: { id: recommendation.actionPlanId }, include: { device: true } });
    if (existing) return { recommendationId: id, actionPlan: existing };
  }
  if (!recommendation.executable || !recommendation.catalogActionId || !recommendation.actionType || !recommendation.deviceId) {
    throw new Error("This recommendation is manual or is not supported by the controlled catalog yet.");
  }
  const entry = getCommandCatalogEntry(recommendation.catalogActionId);
  if (!entry?.supportsExecution || entry.actionType !== recommendation.actionType || !Object.values(ActionType).includes(recommendation.actionType as ActionType)) {
    throw new Error("The recommendation no longer maps to an executable controlled catalog action.");
  }
  const parameters = object(recommendation.parametersJson);
  const missing = entry.requiredParams.filter((field) => parameters[field] === undefined || parameters[field] === "");
  if (missing.length > 0) throw new Error(`Recommendation requires: ${missing.join(", ")}.`);
  const plan = await proposeActionPlan({
    source: "system",
    requestedBy: `hardening-recommendation:${id}`,
    deviceId: recommendation.deviceId,
    vendor: recommendation.vendor,
    actionType: recommendation.actionType,
    riskLevel: entry.risk as AiRiskLevel,
    parametersJson: parameters
  });
  await prisma.hardeningRecommendation.update({ where: { id }, data: { status: "action_plan_created", actionPlanId: plan.id } });
  return { recommendationId: id, actionPlan: plan };
}
