import { randomUUID } from "node:crypto";
import type { GuidedActionBlueprint, GuidedActionField } from "./types.js";
import { activeGuidedFields, maskGuidedSecrets, validateGuidedValues } from "./validators.js";
import { getGuidedActionBlueprint } from "./registry.js";
import { proposeActionPlan } from "../services/action-plan.service.js";

export type GuidedActionSessionStatus = "collecting_inputs" | "ready_to_build" | "built" | "cancelled";

export type GuidedActionSession = {
  id: string;
  blueprintId: string;
  deviceId: string;
  vendor: string;
  initialRequest?: string;
  status: GuidedActionSessionStatus;
  currentStepIndex: number;
  answers: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  actionPlanId?: string;
};

const sessions = new Map<string, GuidedActionSession>();

function now() {
  return new Date().toISOString();
}

function publicBlueprint(blueprint: GuidedActionBlueprint) {
  return {
    id: blueprint.id,
    vendor: blueprint.vendor,
    titleFa: blueprint.titleFa,
    descriptionFa: blueprint.descriptionFa,
    category: blueprint.category,
    risk: blueprint.risk,
    actionKind: blueprint.actionKind,
    implementationState: blueprint.implementationState,
    researchStatus: blueprint.researchStatus,
    supportedConnectors: blueprint.supportedConnectors,
    requiredCapabilities: blueprint.requiredCapabilities,
    prerequisites: blueprint.prerequisites,
    steps: blueprint.steps,
    verification: blueprint.verification,
    rollback: blueprint.rollback,
    uiHints: blueprint.uiHints,
  };
}

function shape(session: GuidedActionSession, blueprint: GuidedActionBlueprint) {
  return {
    sessionId: session.id,
    status: session.status,
    blueprint: publicBlueprint(blueprint),
    currentStep: session.status === "collecting_inputs" ? blueprint.steps[session.currentStepIndex] ?? null : null,
    answers: maskGuidedSecrets(session.answers, activeGuidedFields(blueprint.steps, session.answers)),
    actionPlanId: session.actionPlanId,
  };
}

export function startGuidedActionSession(input: {
  blueprintId: string;
  deviceId: string;
  vendor: string;
  initialRequest?: string;
  initialValues?: Record<string, unknown>;
}) {
  const blueprint = getGuidedActionBlueprint(input.blueprintId);
  if (!blueprint) return { ok: false as const, code: 404, error: "BLUEPRINT_NOT_FOUND", messageFa: "Workflow مرحله‌ای پیدا نشد." };
  if (blueprint.vendor !== input.vendor) return { ok: false as const, code: 409, error: "VENDOR_MISMATCH", messageFa: "این Workflow با وندور دستگاه سازگار نیست." };
  const session: GuidedActionSession = {
    id: randomUUID(),
    blueprintId: input.blueprintId,
    deviceId: input.deviceId,
    vendor: input.vendor,
    initialRequest: input.initialRequest,
    status: "collecting_inputs",
    currentStepIndex: 0,
    answers: input.initialValues ?? {},
    createdAt: now(),
    updatedAt: now(),
  };
  sessions.set(session.id, session);
  return { ok: true as const, value: shape(session, blueprint) };
}

export function getGuidedActionSession(id: string) {
  const session = sessions.get(id);
  if (!session) return null;
  const blueprint = getGuidedActionBlueprint(session.blueprintId);
  if (!blueprint) return null;
  return shape(session, blueprint);
}

export function answerGuidedActionStep(id: string, input: { stepId: string; values: Record<string, unknown> }) {
  const session = sessions.get(id);
  if (!session) return { ok: false as const, code: 404, error: "SESSION_NOT_FOUND", messageFa: "جلسه Workflow پیدا نشد." };
  const blueprint = getGuidedActionBlueprint(session.blueprintId);
  if (!blueprint) return { ok: false as const, code: 404, error: "BLUEPRINT_NOT_FOUND", messageFa: "Workflow مرحله‌ای پیدا نشد." };
  if (session.status !== "collecting_inputs") return { ok: false as const, code: 409, error: "SESSION_NOT_COLLECTING", messageFa: "این جلسه در حالت دریافت اطلاعات نیست." };
  const step = blueprint.steps[session.currentStepIndex];
  if (!step || step.id !== input.stepId) return { ok: false as const, code: 409, error: "STEP_MISMATCH", messageFa: "مرحله ارسال‌شده با مرحله فعلی همخوان نیست." };
  const allowedKeys = new Set(step.fields.map((field) => field.key));
  const unknownKey = Object.keys(input.values).find((key) => !allowedKeys.has(key));
  if (unknownKey) return { ok: false as const, code: 422, error: "UNKNOWN_FIELD", messageFa: `فیلد ${unknownKey} در این Workflow تعریف نشده است.` };
  const issues = validateGuidedValues(step.fields, input.values);
  if (issues.length) return { ok: false as const, code: 422, error: "VALIDATION_FAILED", messageFa: issues[0]?.messageFa ?? "ورودی معتبر نیست.", issues };
  session.answers = { ...session.answers, ...input.values };
  session.currentStepIndex += 1;
  session.status = session.currentStepIndex >= blueprint.steps.length ? "ready_to_build" : "collecting_inputs";
  session.updatedAt = now();
  return { ok: true as const, value: shape(session, blueprint) };
}

export async function buildGuidedActionPlan(id: string, requestedBy?: string) {
  const session = sessions.get(id);
  if (!session) return { ok: false as const, code: 404, error: "SESSION_NOT_FOUND", messageFa: "جلسه Workflow پیدا نشد." };
  const blueprint = getGuidedActionBlueprint(session.blueprintId);
  if (!blueprint) return { ok: false as const, code: 404, error: "BLUEPRINT_NOT_FOUND", messageFa: "Workflow مرحله‌ای پیدا نشد." };
  const fields: GuidedActionField[] = activeGuidedFields(blueprint.steps, session.answers);
  const issues = validateGuidedValues(fields, session.answers);
  if (issues.length) return { ok: false as const, code: 422, error: "VALIDATION_FAILED", messageFa: issues[0]?.messageFa ?? "ورودی معتبر نیست.", issues };
  const result = blueprint.buildActionPlan({
    blueprintId: blueprint.id,
    deviceId: session.deviceId,
    vendor: session.vendor,
    requestedBy,
    initialRequest: session.initialRequest,
    values: session.answers,
  });
  if (!result.ok) return { ok: false as const, code: result.status === "needs_input" ? 422 : 409, error: result.status.toUpperCase(), messageFa: result.reasonFa, missingFields: result.missingFields };
  const plan = await proposeActionPlan(result.actionPlanInput);
  session.status = "built";
  session.actionPlanId = plan.id;
  session.updatedAt = now();
  return { ok: true as const, value: { ...shape(session, blueprint), actionPlanId: plan.id, preview: result.preview, actionPlan: plan } };
}

export function cancelGuidedActionSession(id: string) {
  const session = sessions.get(id);
  if (!session) return null;
  const blueprint = getGuidedActionBlueprint(session.blueprintId);
  session.status = "cancelled";
  session.updatedAt = now();
  return blueprint ? shape(session, blueprint) : null;
}
