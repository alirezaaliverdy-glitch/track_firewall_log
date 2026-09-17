import type { GuidedActionBuildContext, GuidedActionField } from "../../types.js";
export const nameValidation = { pattern: "^[A-Za-z0-9_.:-]{1,79}$" };
export const portValidation = { min: 1, max: 65535 };

export function field(key: string, labelFa: string, type: GuidedActionField["type"], required = true, extra: Partial<GuidedActionField> = {}): GuidedActionField {
  return { key, labelFa, type, required, ...extra };
}

export function missing(context: GuidedActionBuildContext, fields: GuidedActionField[]) {
  return fields.filter((item) => item.required && (context.values[item.key] === undefined || context.values[item.key] === ""));
}

export function actionPlan(context: GuidedActionBuildContext, actionType: string, riskLevel: "low" | "medium" | "high" | "critical", params: Record<string, unknown>) {
  return {
    source: "ai" as const,
    deviceId: context.deviceId,
    vendor: "fortigate" as const,
    actionType,
    riskLevel,
    requestedBy: context.requestedBy,
    parametersJson: {
      ...params,
      source: "guided_action",
      implementationState: "implemented",
      executionSupport: "connector",
      connectorType: "fortigate-ssh",
      executionTemplateRef: actionType,
      requiredParamsSatisfied: true,
      metadata: {
        source: "guided_action",
        blueprintId: context.blueprintId,
        initialRequest: context.initialRequest,
        vendor: "fortigate",
        actionType,
        executionSupport: "connector",
        implementationState: "implemented",
        connectorType: "fortigate-ssh",
        executionTemplateRef: actionType,
        requiredParamsSatisfied: true,
        previewGenerated: false,
        executed: false,
        connectorInvoked: false,
        lastExecutionStatus: "not_started",
        guidedSteps: [],
      },
    },
  };
}
