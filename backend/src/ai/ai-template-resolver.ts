import { COMMAND_CATALOG, type CommandCatalogItem } from "../commands/catalog/index.js";
import { getExecutionTemplate } from "../commands/execution/execution-template-registry.js";
import { parseAiIntent } from "../services/ai-intent.service.js";

export type AiResolverDevice = {
  id: string;
  vendor: string;
  type: string;
  protocol?: string;
};

export type AiTemplateResolution = {
  canonicalVendor: string;
  canonicalActionType: string;
  catalogCommandId: string | null;
  executionTemplateRef: string | null;
  connectorType: string | null;
  implementationState: "implemented" | "manualOnly" | "planned" | "unsupported";
  executionSupport: "connector" | "manual" | "not_implemented";
  normalizedParams: Record<string, unknown>;
  missingFields: string[];
  confidence: number;
  reasonFa: string;
  catalogItem: CommandCatalogItem | null;
};

const VENDOR_ALIASES: Record<string, string> = {
  linux: "linux",
  linuxedge: "linux",
  linuxserver: "linux",
  ubuntu: "linux",
  debian: "linux",
  mikrotik: "mikrotik",
  routeros: "mikrotik",
  fortigate: "fortigate",
  fortios: "fortigate",
  fortinet: "fortigate",
  cisco: "cisco",
  ios: "cisco",
  iosxe: "cisco",
  pfsense: "pfsense",
  juniper: "juniper",
  junos: "juniper",
  paloalto: "paloalto",
  panos: "paloalto",
  windows: "windows",
  windowsserver: "windows",
  docker: "docker",
  kubernetes: "kubernetes",
  k8s: "kubernetes",
};

const MISSING_FIELD_LABELS: Record<string, string> = {
  deviceId: "دستگاه هدف را انتخاب کنید.",
  port: "شماره پورت را وارد کنید.",
  serviceName: "نام سرویس لینوکس را وارد کنید.",
  username: "نام کاربر لینوکس را وارد کنید.",
  ipAddress: "آدرس IP را وارد کنید.",
};

export function normalizeAiVendor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const compact = value.trim().toLowerCase().replace(/[\s_-]+/g, "");
  return VENDOR_ALIASES[compact] ?? null;
}

function inferredVendorFromAction(actionType: string): string | null {
  if (actionType.startsWith("linux_") || actionType === "open_port") return "linux";
  if (actionType.startsWith("mikrotik_")) return "mikrotik";
  if (actionType.startsWith("fortigate_")) return "fortigate";
  if (actionType.startsWith("cisco_")) return "cisco";
  return null;
}

function inferVendorFromText(userText: string): string | null {
  const compact = userText.toLowerCase().replace(/[\s_-]+/g, "");
  for (const [alias, vendor] of Object.entries(VENDOR_ALIASES)) {
    if (compact.includes(alias)) return vendor;
  }
  return null;
}

function normalizeParams(parameters: Record<string, unknown>) {
  const next = { ...parameters };
  delete next.missingFields;
  delete next.clarificationQuestions;

  if (typeof next.service === "string" && !next.serviceName) next.serviceName = next.service;
  if (typeof next.ipAddress === "string") {
    if (!next.srcIp) next.srcIp = next.ipAddress;
    if (!next.sourceIp) next.sourceIp = next.ipAddress;
  }
  if (next.port !== undefined) {
    const port = Number(next.port);
    if (Number.isInteger(port) && port > 0) next.port = port;
  }
  if (typeof next.protocol !== "string" || next.protocol.trim() === "") next.protocol = "tcp";

  return next;
}

function resolveActionAlias(userText: string, rawActionType: string, canonicalVendor: string) {
  if (/وضعیت.*سرویس|service.*status|service.*check/i.test(userText) && canonicalVendor === "linux") {
    return "linux_check_service_status";
  }

  if (/چک\s*روزانه|daily[\s-]*check/i.test(userText)) {
    if (canonicalVendor === "linux") return "linux_daily_check";
    if (canonicalVendor === "mikrotik") return "mikrotik_daily_check";
    return "vendor_daily_check";
  }

  if (/لاگ.*(ورود|لاگین)|login.*log/i.test(userText) && canonicalVendor === "mikrotik") {
    return "mikrotik_show_logs";
  }

  if (rawActionType === "open_port" && canonicalVendor === "linux") {
    return "linux_open_port";
  }

  return rawActionType;
}

function findCatalogItemByIntent(vendor: string, actionType: string) {
  return COMMAND_CATALOG.find((entry) => entry.vendor === vendor && entry.actionType === actionType)
    ?? COMMAND_CATALOG.find((entry) => entry.actionType === actionType)
    ?? null;
}

function missingFieldsForItem(item: CommandCatalogItem | null, params: Record<string, unknown>) {
  if (!item) return [];
  return item.requiredParams
    .filter((field) => params[field.key] === undefined || params[field.key] === "")
    .map((field) => field.key);
}

export function missingFieldsMessageFa(fields: string[]) {
  if (fields.length === 1) return MISSING_FIELD_LABELS[fields[0]] ?? `مقدار ${fields[0]} را وارد کنید.`;
  return `اطلاعات لازم را کامل کنید: ${fields.map((field) => MISSING_FIELD_LABELS[field] ?? field).join("، ")}`;
}

export function resolveAiTemplate(input: {
  userText: string;
  selectedDevice?: AiResolverDevice | null;
  detectedVendor?: unknown;
  aiIntent?: { intentType?: unknown; parameters?: Record<string, unknown> } | null;
  params?: Record<string, unknown>;
}): AiTemplateResolution {
  const parsed = parseAiIntent(input.userText);
  const rawActionType = String(input.aiIntent?.intentType ?? parsed?.intentType ?? "generic_security_action");
  const normalizedParams = normalizeParams({
    ...(parsed?.parameters ?? {}),
    ...(input.aiIntent?.parameters ?? {}),
    ...(input.params ?? {}),
  });

  const canonicalVendor =
    normalizeAiVendor(input.selectedDevice?.type)
    ?? normalizeAiVendor(input.selectedDevice?.vendor)
    ?? normalizeAiVendor(input.detectedVendor)
    ?? normalizeAiVendor(normalizedParams.vendor)
    ?? normalizeAiVendor(normalizedParams.targetDeviceHint)
    ?? inferVendorFromText(input.userText)
    ?? inferredVendorFromAction(rawActionType)
    ?? "generic";

  const resolvedActionType = resolveActionAlias(input.userText, rawActionType, canonicalVendor);
  const item = findCatalogItemByIntent(canonicalVendor, resolvedActionType);
  const mergedParams = { ...(item?.defaultParams ?? {}), ...normalizedParams };
  const missingFields = missingFieldsForItem(item, mergedParams);
  const template = item?.executionTemplateRef ? getExecutionTemplate(item.executionTemplateRef) : null;

  if (item?.implementationState === "implemented" && template) {
    return {
      canonicalVendor,
      canonicalActionType: item.actionType,
      catalogCommandId: item.id,
      executionTemplateRef: item.executionTemplateRef,
      connectorType: item.connectorType,
      implementationState: "implemented",
      executionSupport: "connector",
      normalizedParams: mergedParams,
      missingFields,
      confidence: parsed ? 0.96 : 0.85,
      reasonFa: missingFields.length
        ? missingFieldsMessageFa(missingFields)
        : "درخواست به template اجرایی ثبت‌شده نگاشت شد.",
      catalogItem: item,
    };
  }

  if (item) {
    return {
      canonicalVendor,
      canonicalActionType: item.actionType,
      catalogCommandId: item.id,
      executionTemplateRef: null,
      connectorType: null,
      implementationState: item.implementationState === "unsupported" ? "unsupported" : item.implementationState === "planned" ? "planned" : "manualOnly",
      executionSupport: item.implementationState === "planned" || item.implementationState === "unsupported" ? "not_implemented" : "manual",
      normalizedParams: mergedParams,
      missingFields,
      confidence: parsed ? 0.72 : 0.45,
      reasonFa: item.implementationState === "manualOnly"
        ? "برای این درخواست فقط پیشنهاد دستی قابل ساخت است."
        : item.implementationState === "planned"
          ? "برای این درخواست template اجرایی هنوز آماده نیست."
          : "برای این درخواست پشتیبانی اجرایی وجود ندارد.",
      catalogItem: item,
    };
  }

  return {
    canonicalVendor,
    canonicalActionType: resolvedActionType,
    catalogCommandId: null,
    executionTemplateRef: null,
    connectorType: null,
    implementationState: "manualOnly",
    executionSupport: "manual",
    normalizedParams,
    missingFields: [],
    confidence: parsed ? 0.5 : 0.25,
    reasonFa: "برای این درخواست template اجرایی ثبت‌شده پیدا نشد و فقط پیشنهاد دستی ساخته می‌شود.",
    catalogItem: null,
  };
}
