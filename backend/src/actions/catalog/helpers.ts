import type { ActionType, AiRiskLevel } from "@prisma/client";
import type { CatalogVendor, CommandCatalogEntry } from "./types.js";

export function catalogEntry(
  vendor: CatalogVendor,
  id: string,
  title: string,
  category: string,
  actionType: ActionType | string,
  aliases: string[],
  risk: AiRiskLevel,
  readOnly: boolean,
  requiredParams: string[] = [],
  optionalParams: string[] = [],
  overrides: Partial<CommandCatalogEntry> = {}
): CommandCatalogEntry {
  const faAliases = aliases.filter((alias) => /[\u0600-\u06ff]/.test(alias));
  const enAliases = aliases.filter((alias) => !/[\u0600-\u06ff]/.test(alias));
  const supportsExecution = overrides.supportsExecution ?? overrides.supported ?? true;
  const rollbackSupported = overrides.rollbackSupported ?? overrides.rollback?.available ?? !readOnly;
  const planner = overrides.planner ?? `${vendor}DeterministicPlanner`;
  const connector = overrides.connector ?? (readOnly ? `${vendor}ReadConnector` : `${vendor}ControlledConnector`);
  return {
    id: `${vendor}.${id}`,
    vendor,
    title,
    category,
    actionType,
    aliases: enAliases,
    faAliases,
    examples: [`${vendor}: ${enAliases[0] ?? title}`],
    faExamples: faAliases.length > 0 ? [`${vendor}: ${faAliases[0]}`] : [],
    requiredParams,
    optionalParams,
    risk,
    readOnly,
    supportsExecution,
    connector,
    planner,
    safetyNotes: readOnly ? ["Read-only command template; device state is not changed."] : ["Validated structured parameters only; raw commands are rejected."],
    rollbackSupported,
    plannerHandler: planner,
    executorHandler: connector,
    rollback: { available: rollbackSupported, ...(rollbackSupported ? { strategy: "catalog_metadata" } : {}) },
    auditLabel: `${vendor}.${id}`,
    supported: supportsExecution,
    ...overrides
  };
}
