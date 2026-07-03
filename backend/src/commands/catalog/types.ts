export type CommandVendor = "linux" | "mikrotik" | "fortigate" | "cisco" | "pfsense" | "generic";
export type CommandRiskLevel = "low" | "medium" | "high" | "critical";

export type CommandParam = {
  key: string;
  labelFa: string;
  type: "string" | "number" | "ip" | "cidr" | "boolean";
  placeholderFa?: string;
};

export type CommandCatalogItem = {
  id: string;
  vendor: CommandVendor;
  titleFa: string;
  titleEn: string;
  descriptionFa: string;
  category: string;
  intent: string;
  riskLevel: CommandRiskLevel;
  privilegeLevel: "read" | "operator" | "admin";
  readOnly: boolean;
  mutating: boolean;
  requiresConfirmation: boolean;
  requiredParams: CommandParam[];
  optionalParams: CommandParam[];
  tagsFa: string[];
  searchKeywordsFa: string[];
  supportedConnectors: string[];
  prechecks: string[];
  executionTemplateRef: string | null;
  verification: string[];
  rollback: string[];
  evidenceOutput: string[];
  uiHints: { executable: boolean; badgeFa?: string };
};
