import type { ActionType, AiRiskLevel } from "@prisma/client";

export type CatalogVendor = "mikrotik" | "fortigate" | "linux" | "pfsense" | "cisco" | "sophos";

export type CommandCatalogEntry = {
  id: string;
  vendor: CatalogVendor;
  title: string;
  category: string;
  actionType: ActionType | string;
  aliases: string[];
  faAliases: string[];
  examples: string[];
  faExamples: string[];
  requiredParams: string[];
  optionalParams: string[];
  risk: AiRiskLevel;
  readOnly: boolean;
  supportsExecution: boolean;
  connector: string;
  planner: string;
  auditLabel: string;
  safetyNotes: string[];
  rollbackSupported: boolean;

  // Compatibility fields used by the existing deterministic action framework.
  plannerHandler: string;
  executorHandler: string;
  rollback: { available: boolean; strategy?: string };
  supported: boolean;
};
