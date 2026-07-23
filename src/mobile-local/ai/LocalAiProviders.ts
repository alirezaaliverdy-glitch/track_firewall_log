import type { CreatePlanInput, DeviceVendor } from "../../../packages/contracts/src/index";
import { LOCAL_VENDOR_TEMPLATES } from "../../../packages/vendor-schemas/src/index";
import { planInputForMonitoring } from "@/mobile-local/workflows/LocalGuidedWorkflows";

export type LocalAiProviderMode = "catalog-only" | "byok-cloud" | "lan-openai-compatible" | "future-on-device";

export type LocalAiProviderConfig = {
  mode: LocalAiProviderMode;
  enabled: boolean;
  modelLabel?: string | null;
  baseUrl?: string | null;
  apiKeyVaultRef?: string | null;
};

export type LocalAiDraftInput = {
  message: string;
  deviceId?: string | null;
  vendor?: DeviceVendor | null;
  locale?: "fa" | "en";
};

export type LocalAiDraft = {
  providerMode: LocalAiProviderMode;
  destination: "none" | "cloud" | "lan" | "device";
  assistantMessage: string;
  proposedPlan: CreatePlanInput | null;
  confidence: number;
  offlineFallbackUsed: boolean;
  blockedReason?: string;
};

const SECRET_KEYS = /(api[-_ ]?key|token|password|passphrase|private[-_ ]?key|secret|credential)/i;
const REDACTION = "[redacted]";

export function redactAiPayload(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/(api[-_ ]?key|token|password|passphrase|private[-_ ]?key|secret)\s*[:=]\s*([^\s,;]+)/gi, `$1=${REDACTION}`)
      .replace(/-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g, REDACTION);
  }
  if (Array.isArray(value)) return value.map((item) => redactAiPayload(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SECRET_KEYS.test(key) ? REDACTION : redactAiPayload(item)
      ])
    );
  }
  return value;
}

export function validateLocalAiProviderConfig(config: LocalAiProviderConfig) {
  const errors: string[] = [];
  if (config.mode === "byok-cloud" && !config.apiKeyVaultRef) errors.push("LOCAL_AI_API_KEY_VAULT_REF_REQUIRED");
  if (config.mode === "lan-openai-compatible" && !config.baseUrl) errors.push("LOCAL_AI_LAN_BASE_URL_REQUIRED");
  if (config.apiKeyVaultRef && /(key-|sk-|token|password|secret)/i.test(config.apiKeyVaultRef)) errors.push("LOCAL_AI_VAULT_REF_MUST_NOT_CONTAIN_SECRET");
  return { valid: errors.length === 0, errors };
}

export function providerDestinationLabel(config: LocalAiProviderConfig): LocalAiDraft["destination"] {
  if (!config.enabled || config.mode === "catalog-only") return "none";
  if (config.mode === "byok-cloud") return "cloud";
  if (config.mode === "lan-openai-compatible") return "lan";
  return "device";
}

export function createOfflineFallbackDraft(input: LocalAiDraftInput): LocalAiDraft {
  const message = input.message.toLowerCase();
  const vendor = input.vendor ?? inferVendor(message);
  const template = vendor ? matchMonitoringTemplate(vendor, message) : null;
  const proposedPlan = vendor && template && input.deviceId ? planInputForMonitoring(input.deviceId, vendor, template.actionType) : null;
  return {
    providerMode: "catalog-only",
    destination: "none",
    assistantMessage: proposedPlan
      ? "A local read-only monitoring plan is ready for preview. It still requires approval and PolicyGuard before execution."
      : "I can draft local catalog plans offline. Select a device and choose a supported monitoring template before preview.",
    proposedPlan,
    confidence: proposedPlan ? 0.82 : 0.35,
    offlineFallbackUsed: true
  };
}

export async function draftLocalAiProposal(config: LocalAiProviderConfig, input: LocalAiDraftInput): Promise<LocalAiDraft> {
  const validation = validateLocalAiProviderConfig(config);
  if (!validation.valid || providerDestinationLabel(config) === "none") {
    return { ...createOfflineFallbackDraft(input), providerMode: config.mode, blockedReason: validation.errors.join("; ") || undefined };
  }
  const sanitized = redactAiPayload({ message: input.message, vendor: input.vendor, deviceId: input.deviceId });
  void sanitized;
  return {
    ...createOfflineFallbackDraft(input),
    providerMode: config.mode,
    destination: providerDestinationLabel(config),
    offlineFallbackUsed: true,
    blockedReason: "LOCAL_AI_PROVIDER_TRANSPORT_NOT_BOUND_TO_EXECUTION"
  };
}

function inferVendor(message: string): DeviceVendor | null {
  if (/mikrotik|routeros/.test(message)) return "mikrotik";
  if (/fortigate|fortinet/.test(message)) return "fortigate";
  if (/cisco|ios[- ]?xe|vlan/.test(message)) return "cisco";
  if (/linux|server|cpu|memory|storage|log|port/.test(message)) return "linux";
  return null;
}

function matchMonitoringTemplate(vendor: DeviceVendor, message: string) {
  const templates = LOCAL_VENDOR_TEMPLATES.filter((template) => template.vendor === vendor && template.monitoring);
  if (/vlan/.test(message)) return templates.find((template) => /vlan/i.test(template.title));
  if (/route|neighbor|interface|port|cpu|memory|storage|log|vpn|session|config/.test(message)) return templates[0] ?? null;
  return null;
}
