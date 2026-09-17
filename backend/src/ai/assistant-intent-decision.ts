import type { AssistantIntentClassification } from "./assistant-intent-classifier.js";
import type { AiTemplateResolution } from "./ai-template-resolver.js";

export type AssistantIntent =
  | "conversation"
  | "general_question"
  | "device_question"
  | "monitoring_cached"
  | "monitoring_live"
  | "single_step_action"
  | "multi_step_action"
  | "clarification_required";

export type DestructivePotential = "none" | "low" | "medium" | "high" | "critical";

export type AssistantIntentDecision = {
  intent: AssistantIntent;
  confidence: number;
  reasonCode: string;
  targetDeviceId?: string;
  vendor?: string;
  platform?: string | null;
  requiresLiveData: boolean;
  requiresApproval: boolean;
  requiresParameters: boolean;
  destructivePotential: DestructivePotential;
  missingContext: string[];
};

export type ExecutionStrategy =
  | "chat_only"
  | "cached_answer"
  | "live_monitoring"
  | "catalog_action"
  | "guided_catalog_workflow"
  | "generic_vendor_action"
  | "clarification";

const MONITORING_TERMS = [
  "show",
  "list",
  "check",
  "current",
  "now",
  "status",
  "health",
  "cpu",
  "memory",
  "disk",
  "temperature",
  "routing",
  "route",
  "arp",
  "vlan",
  "interfaces",
  "logs",
  "sessions",
  "vpn",
  "service",
  "services",
];

const LIVE_TERMS = ["live", "now", "current", "fresh", "real time", "right now", "check"];
const MULTI_STEP_TERMS = ["deploy", "workflow", "site-to-site", "vpn", "reverse proxy", "compose", "ospf", "bgp", "policy", "assign ports"];
const HIGH_RISK_TERMS = ["delete", "remove", "shutdown", "disable", "reload", "restart", "erase", "critical"];

function normalized(value: string) {
  return value.toLowerCase().replace(/[?.,;:!()[\]{}"']/g, " ").replace(/\s+/g, " ").trim();
}

function hasAny(text: string, terms: readonly string[]) {
  return terms.some((term) => text.includes(term));
}

function riskFromText(text: string): DestructivePotential {
  if (hasAny(text, ["erase", "write erase", "format"])) return "critical";
  if (hasAny(text, HIGH_RISK_TERMS)) return "high";
  if (hasAny(text, ["create", "configure", "add", "set", "change", "enable"])) return "medium";
  return "none";
}

function isMonitoringRequest(text: string) {
  return hasAny(text, MONITORING_TERMS) && !hasAny(text, ["create", "configure", "add", "set ", "change", "delete", "remove", "restart", "reload"]);
}

export function decideAssistantIntent(input: {
  message: string;
  classification: AssistantIntentClassification;
  targetDevice?: { id?: string | null; vendor?: string | null; platform?: string | null } | null;
  hasFreshCachedEvidence?: boolean;
}): AssistantIntentDecision {
  const text = normalized(input.message);
  const targetDeviceId = input.targetDevice?.id ?? undefined;
  const vendor = input.targetDevice?.vendor ?? undefined;
  const platform = input.targetDevice?.platform ?? null;
  const missingContext = targetDeviceId ? [] : ["targetDeviceId"];

  if (input.classification.requiresClarification) {
    return {
      intent: "clarification_required",
      confidence: input.classification.confidence,
      reasonCode: input.classification.reasonCode,
      targetDeviceId,
      vendor,
      platform,
      requiresLiveData: false,
      requiresApproval: false,
      requiresParameters: true,
      destructivePotential: "none",
      missingContext,
    };
  }

  if (targetDeviceId && isMonitoringRequest(text)) {
    const live = hasAny(text, LIVE_TERMS);
    return {
      intent: live || !input.hasFreshCachedEvidence ? "monitoring_live" : "monitoring_cached",
      confidence: Math.max(input.classification.confidence, 0.82),
      reasonCode: live ? "live_monitoring_requested" : "cached_monitoring_available",
      targetDeviceId,
      vendor,
      platform,
      requiresLiveData: live || !input.hasFreshCachedEvidence,
      requiresApproval: live || !input.hasFreshCachedEvidence,
      requiresParameters: false,
      destructivePotential: "none",
      missingContext: [],
    };
  }

  if (input.classification.mode === "conversation") {
    return {
      intent: targetDeviceId && hasAny(text, ["what", "which", "how", "why"]) ? "general_question" : "conversation",
      confidence: input.classification.confidence,
      reasonCode: input.classification.reasonCode,
      targetDeviceId,
      vendor,
      platform,
      requiresLiveData: false,
      requiresApproval: false,
      requiresParameters: false,
      destructivePotential: "none",
      missingContext: [],
    };
  }

  if (input.classification.mode === "device_question") {
    const live = hasAny(text, LIVE_TERMS);
    const monitoring = isMonitoringRequest(text);
    return {
      intent: monitoring ? (live || !input.hasFreshCachedEvidence ? "monitoring_live" : "monitoring_cached") : "device_question",
      confidence: input.classification.confidence,
      reasonCode: monitoring ? (live ? "live_monitoring_requested" : "cached_monitoring_available") : input.classification.reasonCode,
      targetDeviceId,
      vendor,
      platform,
      requiresLiveData: monitoring && (live || !input.hasFreshCachedEvidence),
      requiresApproval: monitoring && (live || !input.hasFreshCachedEvidence),
      requiresParameters: false,
      destructivePotential: "none",
      missingContext,
    };
  }

  const destructivePotential = riskFromText(text);
  const multiStep = hasAny(text, MULTI_STEP_TERMS);
  return {
    intent: multiStep ? "multi_step_action" : "single_step_action",
    confidence: input.classification.confidence,
    reasonCode: input.classification.reasonCode,
    targetDeviceId,
    vendor,
    platform,
    requiresLiveData: false,
    requiresApproval: true,
    requiresParameters: false,
    destructivePotential,
    missingContext,
  };
}

export function resolveExecutionStrategy(input: {
  decision: AssistantIntentDecision;
  resolution?: AiTemplateResolution | null;
  hasFreshCachedEvidence?: boolean;
}): ExecutionStrategy {
  if (input.decision.intent === "clarification_required") return "clarification";
  if (input.decision.intent === "conversation" || input.decision.intent === "general_question" || input.decision.intent === "device_question") return "chat_only";
  if (input.decision.intent === "monitoring_cached") return "cached_answer";
  if (input.decision.intent === "monitoring_live") return "live_monitoring";
  if (input.resolution?.mode === "guided_workflow") return "guided_catalog_workflow";
  if (input.resolution?.executionSupport === "connector" && input.resolution.catalogCommandId) return "catalog_action";
  if (input.resolution?.canonicalActionType === "custom_vendor_action" || input.resolution?.mode === "manual_or_not_supported") return "generic_vendor_action";
  return "clarification";
}
