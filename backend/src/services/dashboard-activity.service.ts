import { ActionPlanStatus, type ActionPlan, type Device } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { COMMAND_CATALOG } from "../commands/catalog/index.js";

const TERMINAL = new Set<ActionPlanStatus>([ActionPlanStatus.succeeded, ActionPlanStatus.failed, ActionPlanStatus.rejected, ActionPlanStatus.rolled_back]);
const PENDING_APPROVAL = new Set<ActionPlanStatus>([ActionPlanStatus.dry_run_ready, ActionPlanStatus.awaiting_approval]);
const CONFIG_AUDIT_PATTERN = /config|configuration|backup|restore|archive|commit|save|interface|vlan|route|acl|nat|dhcp|dns|ntp|aaa|snmp|syslog|reload/i;
const READ_ACTION_PATTERN = /(^|_)(show|list|read|check|daily)(_|$)|status|summary|inventory|route_dns|license|admin_users|interfaces$/i;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function catalogFor(plan: Pick<ActionPlan, "actionType" | "parametersJson">) {
  const params = object(plan.parametersJson);
  const metadata = object(params.metadata);
  const catalogId = String(metadata.catalogCommandId ?? "");
  return COMMAND_CATALOG.find((item) => item.id === catalogId) ?? COMMAND_CATALOG.find((item) => item.actionType === plan.actionType);
}

function connectorInvoked(plan: Pick<ActionPlan, "resultJson">) {
  return object(plan.resultJson).connectorInvoked === true;
}

function projectedSuccess(plan: Pick<ActionPlan, "status" | "resultJson">) {
  return plan.status === ActionPlanStatus.succeeded && connectorInvoked(plan);
}

function displayTitle(plan: Pick<ActionPlan, "actionType" | "parametersJson">) {
  const item = catalogFor(plan);
  return item?.titleEn || item?.titleFa || String(plan.actionType).replace(/_/g, " ");
}

function isConfigurationChange(plan: Pick<ActionPlan, "actionType" | "parametersJson" | "status" | "resultJson">) {
  if (!projectedSuccess(plan)) return false;
  const item = catalogFor(plan);
  if (item) return item.mutating || (!item.readOnly && item.implementationState === "implemented");
  return !READ_ACTION_PATTERN.test(String(plan.actionType));
}

function planSummary(plan: ActionPlan & { device: Pick<Device, "id" | "name" | "vendor" | "host"> | null }) {
  const item = catalogFor(plan);
  const success = projectedSuccess(plan);
  return {
    id: plan.id,
    title: displayTitle(plan),
    actionType: plan.actionType,
    status: plan.status,
    outcome: success ? "succeeded" : plan.status === ActionPlanStatus.succeeded ? "failed_integrity" : plan.status,
    riskLevel: plan.riskLevel,
    source: plan.source,
    device: plan.device ? { id: plan.device.id, name: plan.device.name, vendor: plan.device.vendor, host: plan.device.host } : null,
    catalogCommandId: item?.id ?? null,
    connectorInvoked: connectorInvoked(plan),
    readOnly: item?.readOnly ?? READ_ACTION_PATTERN.test(String(plan.actionType)),
    createdAt: iso(plan.createdAt),
    updatedAt: iso(plan.updatedAt),
    resultPath: `/actions/${plan.id}/result`,
    actionCenterPath: `/actions/${plan.id}`
  };
}

export async function getOperationalDashboardActivity() {
  const [plans, devices, actionAudits, audits, activeDevices] = await Promise.all([
    prisma.actionPlan.findMany({
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 200,
      include: { device: { select: { id: true, name: true, vendor: true, host: true } } }
    }),
    prisma.device.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, name: true, vendor: true, type: true, host: true, status: true, createdAt: true, updatedAt: true, capabilities: true }
    }),
    prisma.actionAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 80,
      include: { actionPlan: { select: { id: true, actionType: true, status: true, parametersJson: true, resultJson: true } }, device: { select: { id: true, name: true, vendor: true, host: true } } }
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 80,
      include: { device: { select: { id: true, name: true, vendor: true, host: true } } }
    }),
    prisma.device.count()
  ]);

  const recentExecutions = plans.filter((plan) => TERMINAL.has(plan.status) || plan.status === ActionPlanStatus.executing).slice(0, 8).map(planSummary);
  const successfulActions = plans.filter(projectedSuccess).slice(0, 8).map(planSummary);
  const failedActions = plans.filter((plan) => plan.status === ActionPlanStatus.failed || (plan.status === ActionPlanStatus.succeeded && !connectorInvoked(plan))).slice(0, 8).map(planSummary);
  const pendingApprovals = plans.filter((plan) => PENDING_APPROVAL.has(plan.status)).slice(0, 8).map(planSummary);
  const configurationChanges = [
    ...plans.filter(isConfigurationChange).map((plan) => ({
      id: `plan:${plan.id}`,
      title: displayTitle(plan),
      source: "action" as const,
      status: plan.status,
      actionType: plan.actionType,
      device: plan.device ? { id: plan.device.id, name: plan.device.name, vendor: plan.device.vendor, host: plan.device.host } : null,
      timestamp: iso(plan.updatedAt),
      path: `/actions/${plan.id}/result`
    })),
    ...actionAudits.filter((entry) => CONFIG_AUDIT_PATTERN.test(`${entry.eventType} ${entry.message}`)).map((entry) => ({
      id: `action-audit:${entry.id}`,
      title: entry.message || entry.eventType,
      source: "action_audit" as const,
      status: entry.actionPlan.status,
      actionType: entry.actionPlan.actionType,
      device: entry.device ? { id: entry.device.id, name: entry.device.name, vendor: entry.device.vendor, host: entry.device.host } : null,
      timestamp: iso(entry.createdAt),
      path: `/actions/${entry.actionPlanId}/result`
    })),
    ...audits.filter((entry) => CONFIG_AUDIT_PATTERN.test(`${entry.action} ${entry.targetType}`)).map((entry) => ({
      id: `audit:${entry.id}`,
      title: entry.action,
      source: "audit" as const,
      status: entry.approvalStatus,
      actionType: entry.action,
      device: entry.device ? { id: entry.device.id, name: entry.device.name, vendor: entry.device.vendor, host: entry.device.host } : null,
      timestamp: iso(entry.createdAt),
      path: entry.deviceId ? `/assets/devices/${entry.deviceId}` : "/actions"
    }))
  ].sort((a, b) => new Date(b.timestamp ?? 0).getTime() - new Date(a.timestamp ?? 0).getTime()).slice(0, 10);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      activeDevices,
      recentExecutions: recentExecutions.length,
      successfulActions: plans.filter(projectedSuccess).length,
      failedActions: plans.filter((plan) => plan.status === ActionPlanStatus.failed || (plan.status === ActionPlanStatus.succeeded && !connectorInvoked(plan))).length,
      pendingApprovals: plans.filter((plan) => PENDING_APPROVAL.has(plan.status)).length,
      recentDeviceRegistrations: devices.length,
      latestConfigurationChanges: configurationChanges.length
    },
    recentExecutions,
    successfulActions,
    failedActions,
    pendingApprovals,
    recentDeviceRegistrations: devices.map((device) => ({
      id: device.id,
      name: device.name,
      vendor: device.vendor,
      platform: device.type,
      host: device.host,
      status: device.status,
      verified: object(device.capabilities).verified === true || object(object(device.capabilities).onboarding).verifiedAt !== undefined,
      createdAt: iso(device.createdAt),
      updatedAt: iso(device.updatedAt),
      path: `/assets/devices/${device.id}`
    })),
    latestConfigurationChanges: configurationChanges
  };
}