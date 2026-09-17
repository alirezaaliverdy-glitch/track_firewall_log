export type ExecutionResultState =
  | "succeeded_verified"
  | "succeeded_unverified"
  | "partially_succeeded"
  | "failed"
  | "rolled_back"
  | "rollback_failed"
  | "cancelled"
  | "timed_out";

export function classifyExecutionResultState(input: {
  connectorInvoked: boolean;
  executionSucceeded: boolean;
  verificationOk: boolean;
  verificationEvidenceCount: number;
  commandExitCodes?: Array<number | null>;
  rolledBack?: boolean;
  rollbackFailed?: boolean;
  cancelled?: boolean;
  timedOut?: boolean;
}): ExecutionResultState {
  if (input.timedOut) return "timed_out";
  if (input.cancelled) return "cancelled";
  if (input.rollbackFailed) return "rollback_failed";
  if (input.rolledBack) return "rolled_back";
  if (!input.connectorInvoked) return "failed";

  const numericExitCodes = (input.commandExitCodes ?? []).filter((code): code is number => typeof code === "number");
  if (!input.executionSucceeded && numericExitCodes.some((code) => code === 0)) return "partially_succeeded";
  if (!input.executionSucceeded || !input.verificationOk) return "failed";
  return input.verificationEvidenceCount > 0 ? "succeeded_verified" : "succeeded_unverified";
}
