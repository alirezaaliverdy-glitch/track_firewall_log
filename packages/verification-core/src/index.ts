import type { ExecutionResult, VerificationState } from "../../contracts/src/index";

const CONTROL_SEQUENCE = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

export function sanitizeTerminalOutput(value: string, maxBytes = 64_000) {
  const clean = value.replace(CONTROL_SEQUENCE, "").replace(/\r\n/g, "\n");
  return clean.length > maxBytes ? `${clean.slice(0, maxBytes)}\n[TRUNCATED]` : clean;
}

export function verifyExecutionResult(result: Pick<ExecutionResult, "connectorInvoked" | "exitCode" | "stdout" | "stderr">): VerificationState {
  if (!result.connectorInvoked) return "failed";
  if (result.exitCode !== 0) return "failed";
  if (!result.stdout.trim() && !result.stderr.trim()) return "unverified";
  return "verified";
}
