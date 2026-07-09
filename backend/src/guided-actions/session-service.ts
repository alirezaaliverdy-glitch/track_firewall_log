import { randomUUID } from "node:crypto";
import type { GuidedActionBlueprint, GuidedActionField } from "./types.js";
import { activeGuidedFields, maskGuidedSecrets, validateGuidedValues } from "./validators.js";
import { getGuidedActionBlueprint } from "./registry.js";
import { proposeActionPlan } from "../services/action-plan.service.js";
import { prisma } from "../db/prisma.js";
import { resolveGuidedAction } from "./registry.js";

export type GuidedActionSessionStatus = "collecting_inputs" | "ready_to_build" | "built" | "cancelled";

export type GuidedActionSession = {
  id: string;
  blueprintId: string;
  deviceId: string | null;
  vendor: string | null;
  initialRequest?: string;
  status: GuidedActionSessionStatus;
  currentStepIndex: number;
  answers: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  actionPlanId?: string;
};

const sessions = new Map<string, GuidedActionSession>();

const DEVICE_SELECTION_STEP = {
  id: "device_selection",
  titleFa: "انتخاب دستگاه",
  fields: [
    {
      key: "deviceId",
      labelFa: "دستگاه",
      type: "deviceObjectSelect" as const,
      required: true,
      helpFa: "ابتدا دستگاه هدف را انتخاب کن تا ادامه فرم بر اساس وندور همان دستگاه ساخته شود.",
    },
  ],
};

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

function deviceVendor(device: { type: string; vendor: string }) {
  const vendor = device.vendor.toLowerCase();
  if (device.type === "fortigate" || vendor.includes("forti")) return "fortigate";
  if (device.type === "mikrotik" || vendor.includes("mikrotik") || vendor.includes("routeros")) return "mikrotik";
  if (device.type === "linux_edge" || vendor.includes("linux")) return "linux";
  if (device.type === "generic_firewall" || device.type === "generic_syslog_source") return "generic";
  return device.type;
}

function shape(session: GuidedActionSession, blueprint: GuidedActionBlueprint) {
  return {
    sessionId: session.id,
    deviceId: session.deviceId,
    vendor: session.vendor,
    status: session.status,
    blueprint: publicBlueprint(blueprint),
    currentStep: session.status === "collecting_inputs" ? (!session.deviceId ? DEVICE_SELECTION_STEP : blueprint.steps[session.currentStepIndex] ?? null) : null,
    answers: maskGuidedSecrets(session.answers, activeGuidedFields(blueprint.steps, session.answers)),
    actionPlanId: session.actionPlanId,
  };
}

export function startGuidedActionSession(input: {
  blueprintId: string;
  deviceId?: string | null;
  vendor?: string | null;
  initialRequest?: string;
  initialValues?: Record<string, unknown>;
}) {
  const blueprint = getGuidedActionBlueprint(input.blueprintId);
  if (blueprint && !input.vendor) input.vendor = blueprint.vendor;
  if (!blueprint) return { ok: false as const, code: 404, error: "BLUEPRINT_NOT_FOUND", messageFa: "Workflow مرحله‌ای پیدا نشد." };
  if (blueprint.vendor !== input.vendor) return { ok: false as const, code: 409, error: "VENDOR_MISMATCH", messageFa: "این Workflow با وندور دستگاه سازگار نیست." };
  const session: GuidedActionSession = {
    id: randomUUID(),
    blueprintId: input.blueprintId,
    deviceId: input.deviceId ?? null,
    vendor: input.deviceId ? input.vendor ?? null : null,
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

export async function answerGuidedActionStep(id: string, input: { stepId: string; values: Record<string, unknown> }) {
  const session = sessions.get(id);
  if (!session) return { ok: false as const, code: 404, error: "SESSION_NOT_FOUND", messageFa: "جلسه Workflow پیدا نشد." };
  const blueprint = getGuidedActionBlueprint(session.blueprintId);
  if (!blueprint) return { ok: false as const, code: 404, error: "BLUEPRINT_NOT_FOUND", messageFa: "Workflow مرحله‌ای پیدا نشد." };
  if (session.status !== "collecting_inputs") return { ok: false as const, code: 409, error: "SESSION_NOT_COLLECTING", messageFa: "این جلسه در حالت دریافت اطلاعات نیست." };
  if (!session.deviceId) {
    if (input.stepId !== "device_selection") return { ok: false as const, code: 409, error: "STEP_MISMATCH", messageFa: "مرحله ارسال‌شده با مرحله فعلی همخوان نیست." };
    const selectedDeviceId = typeof input.values.deviceId === "string" ? input.values.deviceId : "";
    if (!selectedDeviceId) return { ok: false as const, code: 422, error: "VALIDATION_FAILED", messageFa: "انتخاب دستگاه الزامی است." };
    const device = await prisma.device.findUnique({ where: { id: selectedDeviceId } });
    if (!device) return { ok: false as const, code: 404, error: "DEVICE_NOT_FOUND", messageFa: "دستگاه انتخاب‌شده پیدا نشد." };
    const vendor = deviceVendor(device);
    const routed = resolveGuidedAction({ text: session.initialRequest ?? "", vendor });
    const nextBlueprint = routed ? getGuidedActionBlueprint(routed.blueprintId) : null;
    if (!nextBlueprint) return { ok: false as const, code: 409, error: "BLUEPRINT_NOT_FOUND", messageFa: "برای این وندور هنوز فرم مرحله‌ای این سناریو آماده نیست." };
    session.blueprintId = nextBlueprint.id;
    session.deviceId = device.id;
    session.vendor = vendor;
    session.answers = { ...session.answers, ...(routed?.initialValues ?? {}), deviceId: device.id, vendor };
    session.currentStepIndex = 0;
    session.updatedAt = now();
    return { ok: true as const, value: shape(session, nextBlueprint) };
  }
  const step = blueprint.steps[session.currentStepIndex];
  if (!step || step.id !== input.stepId) return { ok: false as const, code: 409, error: "STEP_MISMATCH", messageFa: "مرحله ارسال‌شده با مرحله فعلی همخوان نیست." };
  const allowedKeys = new Set(step.fields.map((field) => field.key));
  const unknownKey = Object.keys(input.values).find((key) => !allowedKeys.has(key));
  if (unknownKey) return { ok: false as const, code: 422, error: "UNKNOWN_FIELD", messageFa: `فیلد ${unknownKey} در این Workflow تعریف نشده است.` };
  const nextAnswers = { ...session.answers, ...input.values };
  const issues = validateGuidedValues(activeGuidedFields([step], nextAnswers), nextAnswers);
  if (issues.length) return { ok: false as const, code: 422, error: "VALIDATION_FAILED", messageFa: issues[0]?.messageFa ?? "ورودی معتبر نیست.", issues };
  session.answers = nextAnswers;
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
  if (!session.deviceId || !session.vendor) return { ok: false as const, code: 422, error: "DEVICE_REQUIRED", messageFa: "ابتدا دستگاه هدف را در فرم مرحله‌ای انتخاب کن." };
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
