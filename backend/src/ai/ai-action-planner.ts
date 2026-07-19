import { getExecutionTemplate } from "../commands/execution/execution-template-registry.js";
import { resolveAiTemplate, type AiResolverDevice, type AiResolverTargetContext, type AiTemplateResolution } from "./ai-template-resolver.js";

type PlanStepStatus = "executable" | "needs_parameters" | "blocked";
type PlanEligibility = "ready_for_action_center" | "needs_parameters" | "partially_blocked" | "blocked";

export type AiStructuredActionPlanStep = {
  id: string;
  order: number;
  intent: string;
  targetDeviceId: string;
  vendor: string;
  platform: string | null;
  parameters: Record<string, unknown>;
  dependencies: string[];
  risk: string;
  verification: string[];
  rollback: { supported: boolean; metadata: unknown };
  status: PlanStepStatus;
  blockedReason: string | null;
  unsupportedCapability: string | null;
  missingFields: string[];
  catalogCommandId: string | null;
  actionType: string | null;
  executionTemplateRef: string | null;
  connectorType: string | null;
  backendValidated: boolean;
  rawCommandExecution: false;
};

export type AiStructuredActionPlan =
  | { kind: "chat_only"; reason: "informational" | "no_selected_device" | "empty"; rawCommandExecution: false }
  | {
      kind: "action_plan";
      schema: "ai_structured_action_plan_v1";
      requestedOperation: string;
      targetDeviceId: string;
      vendor: string;
      platform: string | null;
      steps: AiStructuredActionPlanStep[];
      executionEligibility: PlanEligibility;
      executableStepCount: number;
      blockedStepCount: number;
      missingParameterFields: string[];
      unsupportedCapabilities: string[];
      rawCommandExecution: false;
      backendExecutionRequired: true;
      approvalRequired: true;
    };

const MUTATING_WORDS = [
  "add", "assign", "change", "configure", "create", "delete", "disable", "enable", "install", "reload", "remove", "restart", "save", "set", "update",
  "اضافه", "اختصاص", "اعمال", "ایجاد", "بساز", "تغییر", "تنظیم", "حذف", "ذخیره", "ریستارت", "ساخت", "فعال", "غیرفعال",
];

const INFORMATIONAL_WORDS = [
  "how many", "how much", "what", "which", "tell me", "count", "explain", "describe",
  "چند", "چندتا", "چن", "چی", "چه", "کدام", "کدوم", "بگو", "توضیح",
];

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u200c]/g, " ")
    .replace(/[?؟،,;؛:.!()[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text: string, values: readonly string[]) {
  const normalized = normalizeText(text);
  return values.some((value) => normalized.includes(normalizeText(value)));
}

export function isInformationalAssistantRequest(message: string) {
  const text = normalizeText(message);
  return includesAny(text, INFORMATIONAL_WORDS) && !includesAny(text, MUTATING_WORDS);
}

function splitRequestedSteps(message: string) {
  const normalized = message
    .replace(/\bthen\b/gi, ",")
    .replace(/\band then\b/gi, ",")
    .replace(/\s+و سپس\s+/g, ",")
    .replace(/\s+و بعد\s+/g, ",")
    .replace(/\s+بعدش\s+/g, ",")
    .replace(/\s+and\s+/gi, ",");
  return normalized.split(",").map((part) => part.trim()).filter(Boolean);
}

function connectorMatchesSelectedDevice(device: AiResolverDevice, connectorType: string | null) {
  if (!connectorType) return false;
  if (connectorType.endsWith("-ssh")) return device.protocol === "ssh";
  return true;
}

function verificationPromptFor(vendor: string, previous: AiStructuredActionPlanStep | null, segment: string) {
  const previousIntent = normalizeText(previous?.intent ?? "");
  const text = normalizeText(segment);
  if (vendor === "mikrotik") return "show management services";
  if (vendor === "linux") {
    const service = String(previous?.parameters.serviceName ?? previous?.parameters.service ?? (text.includes("nginx") ? "nginx" : "")).trim();
    return service ? `check ${service} service status` : "check service status";
  }
  if (vendor === "fortigate") {
    if (previousIntent.includes("vip") || previousIntent.includes("policy")) return "show firewall policies";
    if (previousIntent.includes("address")) return "show address objects";
    return "show system status";
  }
  if (vendor === "cisco") {
    if (previousIntent.includes("vlan")) return "show vlan brief";
    if (previousIntent.includes("interface")) return "show interfaces summary";
    return "show running configuration";
  }
  return `verify ${segment}`;
}

function normalizeSegmentForVendor(segment: string, vendor: string, previous: AiStructuredActionPlanStep | null) {
  const text = normalizeText(segment);
  const verificationOnly = includesAny(text, ["verify", "verification", "status", "check", "بررسی", "تایید", "وضعیت"]) && !includesAny(text, MUTATING_WORDS);
  if (verificationOnly) return verificationPromptFor(vendor, previous, segment);
  if (!includesAny(text, MUTATING_WORDS) && previous && includesAny(previous.intent, ["create", "ساخت", "ایجاد"])) {
    if (includesAny(text, ["vip", "policy", "address", "object", "vlan"])) return `create ${segment}`;
  }
  if (vendor === "cisco" && includesAny(text, ["assign", "interface"]) && includesAny(text + " " + (previous?.intent ?? ""), ["vlan"])) return `assign access vlan ${segment}`;
  if (vendor === "cisco" && includesAny(text, ["save", "write memory", "copy running"])) return "save configuration";
  return segment;
}

function mergeStepParameters(resolution: AiTemplateResolution, previous: AiStructuredActionPlanStep | null) {
  const next = { ...resolution.normalizedParams };
  if (next.vlanId === undefined && previous?.parameters.vlanId !== undefined) next.vlanId = previous.parameters.vlanId;
  if (next.serviceName === undefined && previous?.parameters.serviceName !== undefined) next.serviceName = previous.parameters.serviceName;
  if (next.service === undefined && next.serviceName !== undefined) next.service = next.serviceName;
  return next;
}

function extractServiceName(text: string) {
  return normalizeText(text).match(/\b(nginx|apache2?|httpd|ssh|sshd|docker|fail2ban|postgresql|mysql|mariadb|redis|ufw)\b/)?.[1]?.replace(/^apache$/, "apache2");
}

function stepFromResolution(input: {
  order: number;
  segment: string;
  device: AiResolverDevice;
  platform: string | null;
  resolution: AiTemplateResolution;
  previous: AiStructuredActionPlanStep | null;
}): AiStructuredActionPlanStep {
  const params = mergeStepParameters(input.resolution, input.previous);
  const requestedService = extractServiceName(input.segment);
  if (requestedService && params.serviceName === undefined) params.serviceName = requestedService;
  if (requestedService && params.service === undefined) params.service = requestedService;
  const missingFields = Array.from(new Set([
    ...input.resolution.missingFields,
    ...((input.resolution.catalogItem?.requiredParams ?? [])
      .map((field) => field.key)
      .filter((field) => params[field] === undefined || params[field] === null || params[field] === ""))
  ]));
  const hasBackendTemplate = Boolean(
    input.resolution.catalogCommandId?.startsWith("legacy:") ||
    (input.resolution.executionTemplateRef && getExecutionTemplate(input.resolution.executionTemplateRef))
  );
  const backendSupported = input.resolution.executionSupport === "connector" &&
    input.resolution.implementationState === "implemented" &&
    connectorMatchesSelectedDevice(input.device, input.resolution.connectorType) &&
    hasBackendTemplate;
  const status: PlanStepStatus = backendSupported
    ? missingFields.length > 0 ? "needs_parameters" : "executable"
    : "blocked";
  const catalogRollback = input.resolution.catalogItem?.rollback;
  return {
    id: `step-${input.order}`,
    order: input.order,
    intent: input.segment,
    targetDeviceId: input.device.id,
    vendor: input.resolution.canonicalVendor,
    platform: input.platform,
    parameters: params,
    dependencies: input.previous ? [input.previous.id] : [],
    risk: input.resolution.catalogItem?.riskLevel ?? input.resolution.targetSupportedAction?.riskLevel ?? "medium",
    verification: input.resolution.catalogItem?.verification ?? [],
    rollback: {
      supported: catalogRollback ? catalogRollback.available : false,
      metadata: catalogRollback ?? { available: false, reason: "No registered rollback metadata for this step." },
    },
    status,
    blockedReason: status === "blocked" ? input.resolution.reasonFa : null,
    unsupportedCapability: status === "blocked" ? input.segment : null,
    missingFields,
    catalogCommandId: input.resolution.catalogCommandId,
    actionType: input.resolution.canonicalActionType,
    executionTemplateRef: input.resolution.executionTemplateRef,
    connectorType: input.resolution.connectorType,
    backendValidated: true,
    rawCommandExecution: false,
  };
}

export function buildAiStructuredActionPlan(input: {
  message: string;
  selectedDevice: AiResolverDevice | null;
  targetDeviceContext: AiResolverTargetContext | null | undefined;
}): AiStructuredActionPlan {
  const message = input.message.trim();
  if (!message) return { kind: "chat_only", reason: "empty", rawCommandExecution: false };
  if (!input.selectedDevice?.id) return { kind: "chat_only", reason: "no_selected_device", rawCommandExecution: false };
  if (isInformationalAssistantRequest(message)) return { kind: "chat_only", reason: "informational", rawCommandExecution: false };

  const vendor = String(input.targetDeviceContext?.device?.vendor ?? input.selectedDevice.vendor ?? "generic");
  const platform = input.targetDeviceContext?.device?.platform === undefined ? null : String(input.targetDeviceContext.device.platform);
  const rawSegments = splitRequestedSteps(message);
  const segments = rawSegments.length ? rawSegments : [message];
  const steps: AiStructuredActionPlanStep[] = [];

  for (const rawSegment of segments) {
    const previous = steps.at(-1) ?? null;
    const segment = normalizeSegmentForVendor(rawSegment, vendor, previous);
    const resolution = resolveAiTemplate({
      userText: segment,
      selectedDevice: input.selectedDevice,
      targetDeviceContext: input.targetDeviceContext,
      params: previous?.parameters,
    });
    steps.push(stepFromResolution({
      order: steps.length + 1,
      segment,
      device: input.selectedDevice,
      platform,
      resolution,
      previous,
    }));
  }

  const blockedStepCount = steps.filter((step) => step.status === "blocked").length;
  const executableStepCount = steps.filter((step) => step.status === "executable").length;
  const missingParameterFields = Array.from(new Set(steps.flatMap((step) => step.missingFields)));
  const executionEligibility: PlanEligibility = blockedStepCount === steps.length
    ? "blocked"
    : blockedStepCount > 0
      ? "partially_blocked"
      : missingParameterFields.length > 0
        ? "needs_parameters"
        : "ready_for_action_center";

  return {
    kind: "action_plan",
    schema: "ai_structured_action_plan_v1",
    requestedOperation: message,
    targetDeviceId: input.selectedDevice.id,
    vendor,
    platform,
    steps,
    executionEligibility,
    executableStepCount,
    blockedStepCount,
    missingParameterFields,
    unsupportedCapabilities: steps.flatMap((step) => step.unsupportedCapability ? [step.unsupportedCapability] : []),
    rawCommandExecution: false,
    backendExecutionRequired: true,
    approvalRequired: true,
  };
}
