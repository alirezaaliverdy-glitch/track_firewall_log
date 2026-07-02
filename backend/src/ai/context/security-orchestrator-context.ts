import { env } from "../../config/env.js";
import { getConnectorCapabilities } from "../../connectors/connector-registry.service.js";
import { VENDOR_COMMAND_CATALOG } from "../../actions/catalog/index.js";
import { buildSecurityContext as buildLegacySecurityContext } from "../../services/ai-context.service.js";

export async function buildSecurityOrchestratorContext(input: { recentMinutes?: number } = {}) {
  const security = await buildLegacySecurityContext(input);
  return {
    ...security,
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
    availableCatalogActions: VENDOR_COMMAND_CATALOG.map((action) => ({
      vendor: action.vendor,
      actionId: action.actionType,
      catalogId: action.id,
      title: action.title,
      category: action.category,
      riskLevel: action.risk,
      supportsExecution: action.supportsExecution && action.supported,
      requiredParams: action.requiredParams
    })),
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
