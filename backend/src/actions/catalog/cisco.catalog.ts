import { ActionType, AiRiskLevel } from "@prisma/client";
import { CISCO_OPERATION_REGISTRY } from "../../cisco/cisco-operation-registry.js";
import type { CommandCatalogEntry } from "./catalog.types.js";

const riskMap: Record<string, AiRiskLevel> = {
  low: AiRiskLevel.low,
  medium: AiRiskLevel.medium,
  high: AiRiskLevel.high,
  critical: AiRiskLevel.critical
};

export const CISCO_COMMAND_CATALOG: readonly CommandCatalogEntry[] = Object.freeze(CISCO_OPERATION_REGISTRY.map((operation): CommandCatalogEntry => {
  const executable = operation.state === "implemented" && Boolean(operation.executionTemplateRef);
  return {
    id: operation.id,
    vendor: "cisco",
    title: operation.titleEn,
    category: operation.category,
    actionType: ActionType.generic_security_action,
    aliases: [operation.slug, operation.titleEn.toLowerCase(), ...operation.keywords],
    faAliases: [operation.titleFa, ...operation.keywords],
    examples: operation.keywords.slice(0, 3),
    faExamples: operation.keywords.slice(0, 3),
    requiredParams: operation.requiredParams ?? [],
    optionalParams: operation.optionalParams ?? [],
    risk: riskMap[operation.risk] ?? AiRiskLevel.medium,
    readOnly: operation.readOnly,
    supportsExecution: executable,
    connector: executable ? "cisco-ios-xe-ssh" : "planned",
    planner: executable ? "ciscoIosXePlanner" : "planned",
    auditLabel: `cisco.${operation.slug}`,
    safetyNotes: executable
      ? ["Read-only IOS-XE SSH operation.", "Execution still goes through Action Center review and connector evidence."]
      : ["Cisco roadmap operation only; no command is executable until template/precheck/parser/rollback support is registered."],
    rollbackSupported: operation.rollback.available,
    plannerHandler: executable ? "ciscoIosXePlanner" : "plannedCiscoOperation",
    executorHandler: executable ? "cisco-ios-xe-ssh" : "plannedCiscoOperation",
    rollback: operation.rollback.available ? { available: true, strategy: operation.rollback.steps.join("; ") } : { available: false },
    supported: executable
  };
}));