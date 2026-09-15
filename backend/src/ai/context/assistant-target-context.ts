import { COMMAND_CATALOG, type CommandCatalogItem } from "../../commands/catalog/index.js";
import { VENDOR_COMMAND_CATALOG } from "../../actions/catalog/index.js";
import { normalizeVendor, type NormalizedVendor } from "../../services/ai-normalization.js";

export type AssistantTargetDeviceRecord = {
  id: string;
  name: string;
  vendor: string;
  type: string;
  host: string;
  managementPort: number;
  protocol: string;
  status: string;
  capabilities?: unknown;
  statusChecks?: Array<{ status: string; checkedAt: Date; message: string | null; latencyMs: number | null }>;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function vendorForAssistantTarget(device: Pick<AssistantTargetDeviceRecord, "vendor" | "type"> | null | undefined): NormalizedVendor | "generic" {
  if (device?.type === "linux_edge") return "linux";
  const normalized = normalizeVendor(device?.type) ?? normalizeVendor(device?.vendor);
  if (normalized === "unknown") return "generic";
  return normalized ?? "generic";
}

function pickCiscoPlatform(capabilities: Record<string, unknown>) {
  const cisco = asObject(capabilities.cisco);
  const detection = asObject(cisco.detection);
  const collection = asObject(cisco.collection);
  const system = asObject(collection.system);
  return String(
    detection.platform
      ?? cisco.platform
      ?? system.platform
      ?? capabilities.platform
      ?? ""
  ) || null;
}

function inventorySummary(capabilities: Record<string, unknown>) {
  const cisco = asObject(capabilities.cisco);
  const collection = asObject(cisco.collection);
  const system = asObject(collection.system);
  const interfaces = asArray(collection.interfaces);
  return {
    hostname: system.hostname ?? capabilities.hostname ?? null,
    model: system.model ?? capabilities.model ?? null,
    serialNumber: system.serialNumber ?? capabilities.serialNumber ?? null,
    softwareVersion: system.iosVersion ?? system.softwareVersion ?? capabilities.softwareVersion ?? null,
    uptime: system.uptime ?? capabilities.uptime ?? null,
    interfaceCount: interfaces.length || null,
    inventoryStatus: cisco.inventoryStatus ?? capabilities.inventoryStatus ?? null,
    capabilityStatus: cisco.capabilityStatus ?? capabilities.capabilityStatus ?? null,
  };
}

function healthSummary(capabilities: Record<string, unknown>, statusChecks: AssistantTargetDeviceRecord["statusChecks"]) {
  const latestCheck = statusChecks?.[0] ?? null;
  const cisco = asObject(capabilities.cisco);
  const collection = asObject(cisco.collection);
  return {
    deviceStatus: latestCheck?.status ?? null,
    checkedAt: latestCheck?.checkedAt?.toISOString?.() ?? null,
    details: latestCheck ? { message: latestCheck.message, latencyMs: latestCheck.latencyMs } : {},
    health: asObject(collection.health),
  };
}

function connectorTypeForVendor(vendor: string) {
  if (vendor === "fortigate") return "fortigate-ssh";
  if (vendor === "mikrotik") return "mikrotik-ssh";
  if (vendor === "linux") return "linux-ssh";
  if (vendor === "cisco") return "cisco-ios-xe-ssh";
  return null;
}

export function supportedActionsForAssistantTarget(
  device: Pick<AssistantTargetDeviceRecord, "vendor" | "type"> | null | undefined,
  catalog: readonly CommandCatalogItem[] = COMMAND_CATALOG
) {
  const vendor = vendorForAssistantTarget(device);
  const commandCatalogActions = catalog
    .filter((action) => action.vendor === vendor && action.supportState === "verified")
    .map((action) => ({
      source: "command_catalog" as const,
      id: action.id,
      actionType: action.actionType,
      titleFa: action.titleFa,
      titleEn: action.titleEn,
      category: action.category,
      riskLevel: action.riskLevel,
      readOnly: action.readOnly,
      mutating: action.mutating,
      connectorType: action.connectorType,
      executionTemplateRef: action.executionTemplateRef,
      requiredParams: action.requiredParams.map((field) => field.key),
      optionalParams: action.optionalParams.map((field) => field.key),
      aliases: [...action.tagsFa, ...action.searchKeywordsFa, action.titleFa, action.titleEn],
    }));
  const commandActionIds = new Set(commandCatalogActions.map((action) => action.id));
  const legacyControlledActions = VENDOR_COMMAND_CATALOG
    .filter((action) => action.vendor === vendor && action.supported && action.supportsExecution && !commandActionIds.has(action.id))
    .map((action) => ({
      source: "legacy_action_catalog" as const,
      id: action.id,
      actionType: String(action.actionType),
      titleFa: action.title,
      titleEn: action.title,
      category: action.category,
      riskLevel: action.risk,
      readOnly: action.readOnly,
      mutating: !action.readOnly,
      connectorType: connectorTypeForVendor(action.vendor),
      executionTemplateRef: null,
      requiredParams: action.requiredParams,
      optionalParams: action.optionalParams,
      aliases: [...action.aliases, ...action.faAliases, action.title],
    }));
  return [...commandCatalogActions, ...legacyControlledActions];
}

export function suggestSupportedActionsForAssistantTarget(device: Pick<AssistantTargetDeviceRecord, "vendor" | "type"> | null | undefined, limit = 6) {
  return supportedActionsForAssistantTarget(device).slice(0, limit);
}

export function buildAssistantTargetContextFromRecord(device: AssistantTargetDeviceRecord | null) {
  if (!device) return null;
  const capabilities = asObject(device.capabilities);
  const vendor = vendorForAssistantTarget(device);
  const platform = pickCiscoPlatform(capabilities) ?? String(capabilities.platform ?? device.type);
  return {
    selectedDeviceIsSingleSourceOfTruth: true,
    device: {
      id: device.id,
      name: device.name,
      vendor,
      rawVendor: device.vendor,
      type: device.type,
      platform,
      host: device.host,
      managementPort: device.managementPort,
      protocol: device.protocol,
    },
    appRoutes: {
      deviceOverview: `/devices/${encodeURIComponent(device.id)}`,
      actionCenter: `/actions?deviceId=${encodeURIComponent(device.id)}`,
      actionHistory: "/actions/history",
    },
    workflowState: {
      selectedDeviceId: device.id,
      staleIntentAllowed: false,
      staleGuidedActionAllowed: false,
      actionPlanCreationPath: "backend_ai_chat_to_ActionPlan_to_ActionCenter",
    },
    connectionState: {
      status: device.status,
      health: healthSummary(capabilities, device.statusChecks ?? []),
      verificationStatus: capabilities.verificationStatus ?? capabilities.ciscoVerificationStatus ?? null,
      legacyCompatibility: capabilities.sshCompatibilityProfile ?? asObject(capabilities.cisco).sshCompatibilityProfile ?? null,
    },
    inventory: inventorySummary(capabilities),
    capabilities,
    supportedActions: supportedActionsForAssistantTarget(device),
    unsupportedPolicy: {
      explainMismatch: true,
      suggestFromSelectedDeviceCatalogOnly: true,
    },
  };
}
