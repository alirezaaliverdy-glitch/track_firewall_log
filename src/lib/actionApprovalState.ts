import type { ActionPlan } from "./actions";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function actionExecutionUiState(action: ActionPlan) {
  const parameters = object(action.parametersJson);
  const executionSupport = String(metadataValue(parameters, "executionSupport") ?? "");
  const metadata = object(parameters.metadata);
  const catalogState = String(metadata.implementationState ?? "");
  const supportState = String(metadata.supportState ?? metadataValue(parameters, "supportState") ?? (catalogState === "implemented" && executionSupport === "connector" ? "verified" : ""));
  const customAction = action.actionType === "custom_vendor_action" || action.actionType === "generic_security_action";
  const customConnectorPlan = customAction &&
    metadata.source === "ai_custom_connector_plan" &&
    catalogState === "implemented" &&
    supportState === "verified" &&
    executionSupport === "connector" &&
    typeof metadata.executionTemplateRef === "string" &&
    metadata.executionTemplateRef.length > 0;
  if (metadata.source === "guided_action_wizard" && (metadata.executable === false || executionSupport === "planned_or_partial" || catalogState === "partial" || catalogState === "planned")) {
    return {
      state: "blocked",
      canApproveAndExecute: false,
      canExecute: false,
      reason: String(metadata.reasonFa ?? parameters.reasonFa ?? "این اکشن هنوز اجرای واقعی کامل ندارد."),
      missingField: null
    };
  }
  if (metadata.source === "command_catalog" && (supportState !== "verified" || executionSupport !== "connector" || !metadata.executionTemplateRef)) {
    return {
      state: "blocked",
      canApproveAndExecute: false,
      canExecute: false,
      reason: catalogState === "manualOnly" ? "این برنامه فقط برای بررسی دستی است و اجرای خودکار ندارد." : "این دستور هنوز برای اجرای خودکار پشتیبانی نمی‌شود.",
      missingField: null
    };
  }
  if (customAction && customConnectorPlan) {
    const missingFields = array(metadata.missingFields ?? parameters.missingFields).map(String).filter(Boolean);
    if (missingFields.length > 0) {
      return {
        state: "needs_value",
        canApproveAndExecute: false,
        canExecute: false,
        reason: "Required parameters must be completed before preview and execution.",
        missingField: missingFields.length === 1 ? missingFields[0] : null
      };
    }
  } else if (customAction || ["manual_or_not_implemented", "unsupported_vendor", "needs_parameters", "planned_or_partial"].includes(executionSupport)) {
    return {
      state: executionSupport === "needs_parameters" ? "needs_value" : "blocked",
      canApproveAndExecute: false,
      canExecute: false,
      reason: executionSupport === "needs_parameters"
        ? "Required parameters must be completed before execution can be evaluated."
        : executionSupport === "unsupported_vendor"
          ? "The action is proposed for review, but this vendor has no execution connector yet."
          : "The action is proposed for review as a manual action; controlled execution is not implemented yet.",
      missingField: null
    };
  }
  const validation = object(action.validationJson);
  const blockedStatus = ["needs_input", "validation_failed", "missing_fields", "blocked", "rejected", "rollback_needed"].includes(action.status);
  if (blockedStatus || validation.valid === false || array(validation.errors).length > 0 || array(validation.missingFields).length > 0) {
    const missingFields = array(validation.missingFields).map(String);
    return {
      state: missingFields.length === 1 ? "needs_value" : "blocked",
      canApproveAndExecute: false,
      canExecute: false,
      reason: String(validation.userMessage ?? (missingFields.length === 1 ? "One value is required." : "This action cannot execute until the highlighted issue is fixed.")),
      missingField: missingFields.length === 1 ? missingFields[0] : null
    };
  }
  if (action.status === "proposed" || action.status === "awaiting_approval") {
    return { state: "ready", canApproveAndExecute: true, canExecute: true, reason: null, missingField: null };
  }
  if (["running", "executing", "succeeded", "rolled_back"].includes(action.status)) {
    return { state: "complete", canApproveAndExecute: false, canExecute: false, reason: null, missingField: null };
  }
  const commandPlan = object(action.dryRunJson);
  if (commandPlan.status === "unsupported" || commandPlan.status === "needs_clarification") {
    return { state: "blocked", canApproveAndExecute: false, canExecute: false, reason: "This action is not supported in the command catalog yet.", missingField: null };
  }
  return { state: "ready", canApproveAndExecute: true, canExecute: true, reason: null, missingField: null };
}

function metadataValue(parameters: Record<string, unknown>, key: string) {
  const metadata = object(parameters.metadata);
  return metadata[key] ?? parameters[key];
}
