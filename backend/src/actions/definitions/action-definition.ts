import type { CommandCatalogItem, CommandParam, CommandRiskLevel, CommandVendor, RollbackContract } from "../../commands/catalog/types.js";

export const ACTION_DEFINITION_SCHEMA_VERSION = "phase_r_action_definition_v1";

export type ActionDefinitionPermission = "actions.execute.read" | "actions.execute.write" | "actions.execute.high_risk";

export type ActionDefinition = {
  schemaVersion: typeof ACTION_DEFINITION_SCHEMA_VERSION;
  id: string;
  vendor: CommandVendor;
  actionType: string;
  titles: {
    fa: string;
    en: string;
  };
  catalog: {
    category: string;
    implementationState: CommandCatalogItem["implementationState"];
    supportState: CommandCatalogItem["supportState"];
    supportReasonKey: string;
  };
  risk: {
    level: CommandRiskLevel;
    readOnly: boolean;
    mutating: boolean;
    requiresConfirmation: boolean;
  };
  permissions: {
    required: ActionDefinitionPermission;
    privilegeLevel: CommandCatalogItem["privilegeLevel"];
  };
  execution: {
    support: CommandCatalogItem["executionSupport"];
    connectorType: string | null;
    supportedConnectors: string[];
    templateRef: string | null;
  };
  ui: {
    requiredParams: CommandParam[];
    optionalParams: CommandParam[];
    labelsFa: Record<string, string>;
    helpFa: Record<string, string>;
    hints: CommandCatalogItem["uiHints"];
  };
  validation: {
    rules: Record<string, string[]>;
    prechecks: string[];
  };
  verification: {
    checks: string[];
    evidenceOutput: string[];
  };
  rollback: RollbackContract;
  production: {
    executable: boolean;
    disabledReasonFa: string | null;
  };
};

function requiredPermission(item: CommandCatalogItem): ActionDefinitionPermission {
  if (!item.mutating) return "actions.execute.read";
  return item.riskLevel === "high" || item.riskLevel === "critical" ? "actions.execute.high_risk" : "actions.execute.write";
}

export function toActionDefinition(item: CommandCatalogItem): ActionDefinition {
  return {
    schemaVersion: ACTION_DEFINITION_SCHEMA_VERSION,
    id: item.id,
    vendor: item.vendor,
    actionType: item.actionType,
    titles: {
      fa: item.titleFa,
      en: item.titleEn
    },
    catalog: {
      category: item.category,
      implementationState: item.implementationState,
      supportState: item.supportState,
      supportReasonKey: item.supportReasonKey
    },
    risk: {
      level: item.riskLevel,
      readOnly: item.readOnly,
      mutating: item.mutating,
      requiresConfirmation: item.requiresConfirmation
    },
    permissions: {
      required: requiredPermission(item),
      privilegeLevel: item.privilegeLevel
    },
    execution: {
      support: item.executionSupport,
      connectorType: item.connectorType,
      supportedConnectors: item.supportedConnectors,
      templateRef: item.executionTemplateRef
    },
    ui: {
      requiredParams: item.requiredParams,
      optionalParams: item.optionalParams,
      labelsFa: item.paramLabelsFa,
      helpFa: item.paramHelpFa,
      hints: item.uiHints
    },
    validation: {
      rules: item.validationRules,
      prechecks: item.prechecks
    },
    verification: {
      checks: item.verification,
      evidenceOutput: item.evidenceOutput
    },
    rollback: item.rollback,
    production: {
      executable: item.supportState === "verified",
      disabledReasonFa: item.disabledReasonFa
    }
  };
}
