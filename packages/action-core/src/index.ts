import type { ActionPlan, ApprovalInput, DeviceDetails } from "../../contracts/src/index";

export const LOCAL_APPROVAL_BINDING_VERSION = "phase-m-local-approval-binding-v1";
export const LOCAL_APPROVAL_EXPIRY_MS = 15 * 60 * 1000;

export function canonicalJson(value: unknown): string {
  const stable = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(stable);
    if (!input || typeof input !== "object") return input;
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>)
        .filter(([key]) => !["approvalHash", "idempotencyKey"].includes(key))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stable(nested)])
    );
  };
  return JSON.stringify(stable(value));
}

export async function sha256Hex(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(typeof value === "string" ? value : canonicalJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function planCommandPayload(plan: ActionPlan) {
  return {
    deviceId: plan.deviceId,
    actionType: plan.actionType,
    parameters: plan.parameters,
    commands: plan.commandSpecs.map((command) => ({ id: command.id, command: command.command, readOnly: command.readOnly })),
    riskLevel: plan.riskLevel
  };
}

export async function buildLocalApprovalBinding(input: {
  plan: ActionPlan;
  device: DeviceDetails;
  credentialRef: string;
  trustedHostKeyFingerprint: string;
  approval: ApprovalInput;
}) {
  const approvedAt = new Date().toISOString();
  const expiresAt = input.approval.expiresAt ?? new Date(Date.parse(approvedAt) + LOCAL_APPROVAL_EXPIRY_MS).toISOString();
  const planHash = await sha256Hex(planCommandPayload(input.plan));
  const parametersHash = await sha256Hex(input.plan.parameters);
  const commandsHash = await sha256Hex(input.plan.commandSpecs.map((command) => command.command));
  const binding = {
    version: LOCAL_APPROVAL_BINDING_VERSION,
    planId: input.plan.id,
    planHash,
    deviceId: input.device.id,
    credentialRef: input.credentialRef,
    trustedHostKeyFingerprint: input.trustedHostKeyFingerprint,
    parametersHash,
    commandsHash,
    riskVersion: input.plan.riskLevel,
    approvedBy: input.approval.approvedBy,
    approvedAt,
    expiresAt
  };
  return {
    planId: input.plan.id,
    approvedAt,
    approvalHash: await sha256Hex(binding),
    binding
  };
}

export async function approvalStillMatches(plan: ActionPlan, approvalHash: string, binding: Record<string, unknown>) {
  if (String(binding.version) !== LOCAL_APPROVAL_BINDING_VERSION) return false;
  if (Date.parse(String(binding.expiresAt ?? "")) <= Date.now()) return false;
  if (String(binding.planHash) !== await sha256Hex(planCommandPayload(plan))) return false;
  return approvalHash === await sha256Hex(binding);
}
