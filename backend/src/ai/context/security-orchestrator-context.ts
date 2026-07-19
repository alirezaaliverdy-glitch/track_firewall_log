import { env } from "../../config/env.js";
import { getConnectorCapabilities } from "../../connectors/connector-registry.service.js";
import { VENDOR_COMMAND_CATALOG } from "../../actions/catalog/index.js";
import { buildSecurityContext as buildLegacySecurityContext } from "../../services/ai-context.service.js";
import { buildEvidencePack } from "./evidence-pack.service.js";
import { searchCatalog } from "../../commands/catalog/index.js";
import { prisma } from "../../db/prisma.js";
import { buildAssistantTargetContextFromRecord } from "./assistant-target-context.js";

export async function buildAssistantTargetContext(selectedDeviceId?: string | null) {
  if (!selectedDeviceId) return null;
  const device = await prisma.device.findUnique({
    where: { id: selectedDeviceId },
    select: {
      id: true,
      name: true,
      vendor: true,
      type: true,
      host: true,
      managementPort: true,
      protocol: true,
      status: true,
      capabilities: true,
      statusChecks: {
        orderBy: { checkedAt: "desc" },
        take: 1,
        select: { status: true, checkedAt: true, message: true, latencyMs: true },
      },
    },
  });
  return buildAssistantTargetContextFromRecord(device);
}

function broadCatalogActions() {
  return VENDOR_COMMAND_CATALOG.map((action) => ({
    vendor: action.vendor,
    actionId: action.actionType,
    catalogId: action.id,
    title: action.title,
    category: action.category,
    riskLevel: action.risk,
    supportsExecution: action.supportsExecution && action.supported,
    requiredParams: action.requiredParams,
  }));
}

export async function buildSecurityOrchestratorContext(input: { recentMinutes?: number; selectedDeviceId?: string; vendor?: string } = {}) {
  const [security, evidencePack, targetDeviceContext] = await Promise.all([
    buildLegacySecurityContext(input),
    buildEvidencePack(input),
    buildAssistantTargetContext(input.selectedDeviceId),
  ]);
  const availableCatalogActions = targetDeviceContext
    ? targetDeviceContext.supportedActions.map((action) => ({
        vendor: targetDeviceContext.device.vendor,
        actionId: action.actionType,
        catalogId: action.id,
        title: action.titleFa,
        category: action.category,
        riskLevel: action.riskLevel,
        supportsExecution: true,
        requiredParams: action.requiredParams,
      }))
    : broadCatalogActions();
  return {
    ...security,
    evidencePack,
    targetDeviceContext,
    appProfile: env.appProfile,
    actionExecutionMode: env.actionExecutionMode,
    actionAllowLabUnrestrictedManagement: env.actionAllowLabUnrestrictedManagement,
    actionRequireManagementSource: env.actionRequireManagementSource,
    actionDefaultTrustedSource: env.actionDefaultTrustedSource,
    safetyPosture: {
      actionCreationPolicy: "permissive" as const,
      executionPolicy: "controlled" as const,
      quickControlledMode: env.actionExecutionMode === "quick_controlled"
    },
    availableCatalogActions,
    targetScopedCatalogActions: targetDeviceContext ? searchCatalog({ vendor: targetDeviceContext.device.vendor }).map((action) => ({
      vendor: action.vendor,
      actionId: action.actionType,
      catalogId: action.id,
      titleFa: action.titleFa,
      titleEn: action.titleEn,
      category: action.category,
      supportState: action.supportState,
      implementationState: action.implementationState,
      requiredParams: action.requiredParams.map((field) => field.key),
    })) : [],
    fallbackActionSupport: {
      customVendorActionSupported: true
    },
    connectorCapabilities: getConnectorCapabilities().map((capability) => ({
      vendor: capability.vendor,
      deviceTypes: capability.deviceTypes,
      protocols: capability.protocols,
      supportedActions: capability.supportedActions,
      executionEnabled: capability.executionEnabled
    }))
  };
}
