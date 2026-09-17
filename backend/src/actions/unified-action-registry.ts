import { AiRiskLevel } from "@prisma/client";
import { COMMAND_CATALOG } from "../commands/catalog/index.js";
import { getExecutionTemplate } from "../commands/execution/execution-template-registry.js";
import { ACTION_CATALOG } from "./action-catalog.js";
import type { RegisteredAction } from "../workflow/workflow-contracts.js";

export type RegisteredActionSource = "command_catalog" | "legacy_controlled_action";
export type UnifiedRegisteredAction = RegisteredAction & {
  source: RegisteredActionSource;
  sourceKey: string;
  actionType: string;
  requiredParameters: string[];
  optionalParameters: string[];
};

const VENDOR_CONNECTORS: Record<string, string> = {
  cisco: "cisco-ios-xe-ssh",
  fortigate: "fortigate-ssh",
  linux: "linux-ssh",
  mikrotik: "mikrotik-ssh",
};

function platformsFor(vendor: string) {
  if (vendor === "cisco") return ["ios-xe", "ios-classic"];
  if (vendor === "linux") return ["linux"];
  if (vendor === "mikrotik") return ["routeros"];
  if (vendor === "fortigate") return ["fortios"];
  return [vendor];
}

function risk(value: string): RegisteredAction["risk"] {
  return value === "critical" || value === "high" || value === "medium" ? value : "low";
}

function legacyRisk(value: AiRiskLevel): RegisteredAction["risk"] {
  if (value === AiRiskLevel.critical) return "critical";
  if (value === AiRiskLevel.high) return "high";
  if (value === AiRiskLevel.medium) return "medium";
  return "low";
}

function fromCommandCatalog(): UnifiedRegisteredAction[] {
  return COMMAND_CATALOG.map((item) => {
    const template = getExecutionTemplate(item.executionTemplateRef);
    const executable = item.supportState === "verified" &&
      item.implementationState === "implemented" &&
      item.executionSupport === "connector" &&
      Boolean(item.connectorType) &&
      Boolean(template);

    return {
      key: item.id,
      source: "command_catalog",
      sourceKey: item.id,
      actionType: item.actionType,
      vendor: item.vendor,
      platforms: platformsFor(item.vendor),
      mode: item.readOnly ? "read" : "write",
      executionType: item.requiredParams.length > 0 || item.optionalParams.length > 0 ? "guided" : "direct",
      parameterSchema: {
        required: item.requiredParams.map((field) => ({ key: field.key, type: field.type })),
        optional: item.optionalParams.map((field) => ({ key: field.key, type: field.type })),
      },
      requiredParameters: item.requiredParams.map((field) => field.key),
      optionalParameters: item.optionalParams.map((field) => field.key),
      risk: risk(item.riskLevel),
      approvalRequired: item.requiresConfirmation || item.mutating,
      executable,
      connector: executable ? item.connectorType! : item.connectorType ?? "",
      verificationKey: item.verification.length ? item.id : undefined,
      rollbackKey: item.rollback.available ? `${item.id}.rollback` : undefined,
    };
  });
}

function fromLegacyCatalog(commandKeys: Set<string>): UnifiedRegisteredAction[] {
  return ACTION_CATALOG.flatMap((item) => {
    const vendor = item.vendor;
    const connector = VENDOR_CONNECTORS[vendor] ?? "";
    const key = `legacy:${vendor}.${item.actionType}`;
    if (commandKeys.has(key)) return [];
    return [{
      key,
      source: "legacy_controlled_action" as const,
      sourceKey: String(item.actionType),
      actionType: String(item.actionType),
      vendor,
      platforms: platformsFor(vendor),
      mode: item.requiresApproval ? "write" as const : "read" as const,
      executionType: item.requiredParameters.length > 0 || item.optionalParameters.length > 0 ? "guided" as const : "direct" as const,
      parameterSchema: {
        required: item.requiredParameters.map((field) => ({ key: field.name, validator: field.validator ?? null })),
        optional: item.optionalParameters.map((field) => ({ key: field.name, validator: field.validator ?? null })),
      },
      requiredParameters: item.requiredParameters.map((field) => field.name),
      optionalParameters: item.optionalParameters.map((field) => field.name),
      risk: legacyRisk(item.riskLevel),
      approvalRequired: item.requiresApproval,
      executable: item.supportsExecution && Boolean(connector),
      connector,
      verificationKey: item.supportsDryRun ? `${key}.preview` : undefined,
      rollbackKey: item.rollbackPreviewHandler ? `${key}.rollback-preview` : undefined,
    }];
  });
}

export function listUnifiedActionRegistry() {
  const catalogActions = fromCommandCatalog();
  return Object.freeze([...catalogActions, ...fromLegacyCatalog(new Set(catalogActions.map((item) => item.key)))]);
}

export function registeredActionsForVendor(vendor: string) {
  const normalized = vendor.trim().toLowerCase();
  return listUnifiedActionRegistry().filter((item) => item.vendor === normalized);
}

export function resolveRegisteredAction(input: { key: string; vendor: string; platform?: string | null }) {
  const vendor = input.vendor.trim().toLowerCase();
  const platform = input.platform?.trim().toLowerCase() ?? null;
  const action = listUnifiedActionRegistry().find((item) => item.key === input.key && item.vendor === vendor);
  if (!action) return null;
  if (platform && !action.platforms.map((item) => item.toLowerCase()).includes(platform)) return null;
  return action;
}
