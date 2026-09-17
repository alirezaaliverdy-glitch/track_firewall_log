import { COMMAND_CATALOG_VERSION } from "../commands/catalog/version.js";
import type { CommandCatalogItem } from "../commands/catalog/types.js";
import type { AiTemplateResolution } from "../ai/ai-template-resolver.js";

export type MonitoringPlanMetadata = {
  source: "monitoring_live";
  monitoring: true;
  readOnly: true;
  resultRoute: string;
  catalogCommandId: string | null;
  catalogVersion: string;
  vendor: string;
  actionType: string;
  implementationState: "implemented";
  executionSupport: "connector";
  supportState: "verified";
  executable: true;
  connectorType: string | null;
  executionTemplateRef: string | null;
  normalizedParams: Record<string, unknown>;
  previewGenerated: false;
  executed: false;
  connectorInvoked: false;
  lastExecutionStatus: "not_started";
};

export function isReadOnlyResolution(resolution: AiTemplateResolution) {
  const readOnly = resolution.catalogItem?.readOnly ?? resolution.targetSupportedAction?.readOnly;
  const mutating = resolution.catalogItem?.mutating ?? resolution.targetSupportedAction?.mutating;
  return readOnly === true && mutating !== true && resolution.executionSupport === "connector";
}

export function monitoringMetadata(input: {
  resolution: AiTemplateResolution;
  catalogItem?: CommandCatalogItem | null;
}): MonitoringPlanMetadata {
  return {
    source: "monitoring_live",
    monitoring: true,
    readOnly: true,
    resultRoute: "/monitoring/actions/:actionPlanId/result",
    catalogCommandId: input.resolution.catalogCommandId,
    catalogVersion: COMMAND_CATALOG_VERSION,
    vendor: input.resolution.canonicalVendor,
    actionType: input.resolution.canonicalActionType,
    implementationState: "implemented",
    executionSupport: "connector",
    supportState: "verified",
    executable: true,
    connectorType: input.resolution.connectorType,
    executionTemplateRef: input.resolution.executionTemplateRef,
    normalizedParams: input.resolution.normalizedParams,
    previewGenerated: false,
    executed: false,
    connectorInvoked: false,
    lastExecutionStatus: "not_started",
  };
}
