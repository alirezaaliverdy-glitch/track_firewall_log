import type { ActionPlan } from "./actions";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function actionExecutionUiState(action: ActionPlan) {
  const validation = object(action.validationJson);
  const dryRun = object(action.dryRunJson);
  const blockedStatus = ["validation_failed", "missing_fields", "blocked", "rejected"].includes(action.status);
  if (blockedStatus || validation.valid === false || array(validation.errors).length > 0 || array(validation.missingFields).length > 0) {
    const missingFields = array(validation.missingFields).map(String);
    return {
      state: missingFields.length === 1 ? "needs_value" : "blocked",
      canApproveAndExecute: false,
      reason: String(validation.userMessage ?? (missingFields.length === 1 ? "One value is required." : "This action cannot execute until the highlighted issue is fixed.")),
      missingField: missingFields.length === 1 ? missingFields[0] : null
    };
  }
  if (action.status === "proposed" || action.status === "awaiting_approval") {
    return { state: "ready", canApproveAndExecute: true, reason: null, missingField: null };
  }
  if (action.status !== "dry_run_ready" || Object.keys(dryRun).length === 0) {
    return { state: "blocked", canApproveAndExecute: false, reason: "This action is not ready to execute.", missingField: null };
  }
  if (dryRun.status === "unsupported" || dryRun.status === "needs_clarification" || dryRun.executable !== true) {
    return { state: "blocked", canApproveAndExecute: false, reason: "This action is not supported for controlled execution.", missingField: null };
  }
  const plannedParameters = object(dryRun.parameters);
  if (Object.keys(plannedParameters).length > 0 && JSON.stringify(plannedParameters) !== JSON.stringify(action.parametersJson)) {
    return { state: "blocked", canApproveAndExecute: false, reason: "The action changed after its preview. Try Approve & Execute again.", missingField: null };
  }
  return { state: "ready", canApproveAndExecute: true, reason: null, missingField: null };
}
