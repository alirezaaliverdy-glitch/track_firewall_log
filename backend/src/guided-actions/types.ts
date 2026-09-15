import type { CommandRiskLevel, CommandVendor } from "../commands/catalog/types.js";

export type GuidedImplementationState = "implemented" | "partial" | "planned" | "not_supported";
export type GuidedResearchStatus = "verified_from_official_docs" | "verified_from_existing_templates" | "partial" | "unknown";
export type GuidedFieldSource = "official_docs" | "existing_template" | "device_runtime" | "project_default";
export type GuidedFieldType =
  | "text"
  | "password"
  | "number"
  | "cidr"
  | "cidrList"
  | "ip"
  | "ipList"
  | "ipRange"
  | "select"
  | "multiSelect"
  | "checkbox"
  | "textarea"
  | "generatedSecret"
  | "deviceObjectSelect"
  | "interfaceSelect"
  | "addressObjectSelect"
  | "serviceObjectSelect"
  | "userGroupSelect";

export type GuidedDynamicOptionProvider =
  | "fortigate_interfaces"
  | "fortigate_address_objects"
  | "fortigate_service_objects"
  | "fortigate_user_groups"
  | "fortigate_zones"
  | "fortigate_ip_pools"
  | "fortigate_policies"
  | "mikrotik_interfaces"
  | "linux_services";

export type GuidedActionField = {
  key: string;
  labelFa: string;
  type: GuidedFieldType;
  required: boolean;
  placeholderFa?: string;
  helpFa?: string;
  secret?: boolean;
  options?: Array<{ labelFa: string; value: string; source?: GuidedFieldSource }>;
  dynamicOptions?: { provider: GuidedDynamicOptionProvider; dependsOn?: string[] };
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
    allowedValues?: string[];
    allowCustom?: boolean;
  };
  dependsOn?: Record<string, unknown>;
};

export type GuidedActionStep = {
  id: string;
  titleFa: string;
  descriptionFa?: string;
  fields: GuidedActionField[];
  dependsOn?: string[];
};

export type GuidedPrerequisite = {
  id: string;
  titleFa: string;
  descriptionFa?: string;
  required: boolean;
};

export type GuidedActionBuildContext = {
  blueprintId: string;
  deviceId: string;
  vendor: string;
  requestedBy?: string;
  initialRequest?: string;
  values: Record<string, unknown>;
};

export type ActionPlanBuildResult =
  | {
      ok: true;
      actionPlanInput: {
        source: "ai" | "user";
        deviceId: string;
        vendor: CommandVendor;
        actionType: string;
        riskLevel: CommandRiskLevel;
        parametersJson: Record<string, unknown>;
        requestedBy?: string;
      };
      preview?: Record<string, unknown>;
    }
  | {
      ok: false;
      status: "needs_input" | "not_supported" | "planned";
      reasonFa: string;
      missingFields?: GuidedActionField[];
    };

export type GuidedActionBlueprint = {
  id: string;
  vendor: string;
  titleFa: string;
  descriptionFa: string;
  category: string;
  risk: CommandRiskLevel;
  actionKind: "guided_action";
  implementationState: GuidedImplementationState;
  researchStatus: GuidedResearchStatus;
  supportedConnectors: string[];
  requiredCapabilities: string[];
  fixedOptionSources?: Record<string, GuidedFieldSource>;
  dynamicOptionSources?: Record<string, GuidedDynamicOptionProvider>;
  prerequisites: GuidedPrerequisite[];
  steps: GuidedActionStep[];
  buildActionPlan: (context: GuidedActionBuildContext) => ActionPlanBuildResult;
  verification?: unknown;
  rollback?: unknown;
  auditEvents?: string[];
  uiHints?: Record<string, unknown>;
};

export type ResolverResult =
  | { mode: "executable_action_plan"; actionPlanInput: unknown }
  | { mode: "needs_input"; templateRef: string; missingFields: GuidedActionField[]; initialValues: Record<string, unknown> }
  | { mode: "guided_workflow"; blueprintId: string; initialValues: Record<string, unknown>; reasonFa: string }
  | { mode: "clarification"; questionFa: string; options: Array<{ labelFa: string; value: string }> }
  | { mode: "manual_or_not_supported"; reasonFa: string };
