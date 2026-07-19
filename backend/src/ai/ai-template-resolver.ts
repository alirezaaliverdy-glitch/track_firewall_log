import { COMMAND_CATALOG, type CommandCatalogItem } from "../commands/catalog/index.js";
import { getExecutionTemplate } from "../commands/execution/execution-template-registry.js";
import { routePersianIntent } from "./persian-intent-router.js";
import { parseAiIntent } from "../services/ai-intent.service.js";
import { getGuidedActionBlueprint, resolveGuidedAction } from "../guided-actions/registry.js";
import type { GuidedActionField } from "../guided-actions/types.js";

export type AiResolverDevice = {
  id: string;
  name?: string;
  vendor: string;
  type: string;
  protocol?: string;
};

export type AiResolverSupportedAction = {
  source?: "command_catalog" | "legacy_action_catalog";
  id: string;
  actionType: string;
  titleFa?: string;
  titleEn?: string;
  category?: string;
  riskLevel?: string;
  readOnly?: boolean;
  mutating?: boolean;
  connectorType?: string | null;
  executionTemplateRef?: string | null;
  requiredParams?: string[];
  optionalParams?: string[];
  aliases?: string[];
};

export type AiResolverTargetContext = {
  device?: {
    id?: string;
    vendor?: string;
    platform?: string | null;
    capabilities?: unknown;
  };
  capabilities?: unknown;
  supportedActions?: AiResolverSupportedAction[];
};

export type AiTemplateResolution = {
  mode: "executable_action_plan" | "needs_input" | "guided_workflow" | "clarification" | "manual_or_not_supported";
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
  targetSupportedAction?: AiResolverSupportedAction | null;
  blueprintId?: string;
  initialValues?: Record<string, unknown>;
  missingGuidedFields?: GuidedActionField[];
  questionFa?: string;
  options?: Array<{ labelFa: string; value: string }>;
};

const PERSIAN_DIGITS: Record<string, string> = {
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
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
  deviceId: "اول دستگاه را انتخاب کنید.",
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

function normalizeUserText(value: string) {
  return value
    .replace(/[۰-۹٠-٩]/g, (digit) => PERSIAN_DIGITS[digit] ?? digit)
    .replace(/[ي]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/[\u200c‌]/g, " ")
    .replace(/[؟?،,؛;:.!()[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function includesAny(text: string, values: string[]) {
  return values.some((value) => text.includes(normalizeUserText(value)));
}

function connectorTypeForVendor(vendor: string | null | undefined) {
  if (vendor === "fortigate") return "fortigate-ssh";
  if (vendor === "mikrotik") return "mikrotik-ssh";
  if (vendor === "linux") return "linux-ssh";
  if (vendor === "cisco") return "cisco-ios-xe-ssh";
  return null;
}

function isGuidedOperationalIntent(userText: string) {
  const text = normalizeUserText(userText);
  const hasCreateVerb = includesAny(text, ["بساز", "ایجاد کن", "راه بنداز", "راه‌انداز", "create", "build", "setup", "add"]);
  const hasGuidedKeyword = includesAny(text, [
    "vpn", "وی پی ان", "تونل", "ipsec", "ssl vpn", "wireguard", "l2tp", "ikev2",
    "vdom", "وی دام", "zone", "زون", "policy", "رول", "rule", "اجازه دسترسی", "دسترسی بده",
    "vip", "port forward", "پورت فوروارد", "nat", "service", "سرویس", "object", "آبجکت", "vlan", "subinterface", "اینترفیس بساز",
    "route", "static route", "gateway عوض", "گیت وی",
  ]);
  return hasGuidedKeyword && (hasCreateVerb || includesAny(text, ["دسترسی بده", "اجازه دسترسی بده", "پورت فوروارد کن", "gateway عوض کن", "روی port آی پی بزار"]));
}

function resolveVendorlessGuidedAction(userText: string) {
  const text = normalizeUserText(userText);
  const reasonFa = "این درخواست چندمرحله‌ای است و باید اطلاعات تکمیلی در یک فرم مرحله‌ای گرفته شود.";
  if (includesAny(text, ["vpn", "ipsec", "ssl vpn", "wireguard", "l2tp"])) {
    return { blueprintId: "fortigate_guided_vpn_setup", initialValues: { vpnType: includesAny(text, ["ssl vpn"]) ? "ssl_vpn" : includesAny(text, ["ipsec"]) ? "ipsec_site_to_site" : undefined }, reasonFa };
  }
  if (includesAny(text, ["vdom"])) return { blueprintId: "fortigate_guided_vdom_create", initialValues: {}, reasonFa };
  if (includesAny(text, ["zone"])) return { blueprintId: "fortigate_guided_zone_create", initialValues: {}, reasonFa };
  if (includesAny(text, ["policy", "rule"])) return { blueprintId: "fortigate_guided_firewall_policy_create", initialValues: {}, reasonFa };
  if (includesAny(text, ["vip", "port forward", "nat"])) return { blueprintId: "fortigate_guided_vip_port_forward_create", initialValues: { protocol: "tcp" }, reasonFa };
  if (includesAny(text, ["vlan", "subinterface"])) return { blueprintId: "fortigate_guided_interface_vlan_create", initialValues: {}, reasonFa };
  if (includesAny(text, ["static route", "route", "gateway"])) return { blueprintId: "fortigate_guided_static_route_create", initialValues: {}, reasonFa };
  return null;
}

function inferredVendorFromAction(actionType: string): string | null {
  if (actionType.startsWith("linux_") || actionType === "open_port") return "linux";
  if (actionType.startsWith("mikrotik_")) return "mikrotik";
  if (actionType.startsWith("fortigate_")) return "fortigate";
  if (actionType.startsWith("cisco_")) return "cisco";
  return null;
}

function normalizeParams(parameters: Record<string, unknown>) {
  const next = { ...parameters };
  delete next.missingFields;
  delete next.clarificationQuestions;

  if (typeof next.service === "string" && !next.serviceName) next.serviceName = next.service;
  if (next.port !== undefined) {
    const port = Number(next.port);
    if (Number.isInteger(port) && port > 0) next.port = port;
  }
  if (typeof next.protocol !== "string" || next.protocol.trim() === "") next.protocol = "tcp";

  return next;
}

function extractServiceName(text: string) {
  const known = ["nginx", "apache2", "apache", "httpd", "ssh", "sshd", "docker", "fail2ban", "postgresql", "mysql", "mariadb", "redis", "ufw"];
  const service = known.find((name) => new RegExp(`\\b${name}\\b`, "i").test(text));
  if (!service) return undefined;
  if (service === "apache") return "apache2";
  return service;
}

function resolveActionAlias(userText: string, rawActionType: string, canonicalVendor: string) {
  const text = normalizeUserText(userText);

  if (canonicalVendor === "linux" && includesAny(text, [
    "وضعیت پورت", "وضعیت پورت ها", "وضعیت پورت‌ها", "پورت های باز", "پورت‌های باز", "لیست پورت", "پورت های فعال", "پورت‌های فعال", "چه پورت هایی بازه", "چه پورت‌هایی بازه", "open ports", "list ports", "listening ports",
  ])) return "linux_list_open_ports";

  if (canonicalVendor === "linux" && includesAny(text, ["وضعیت فایروال", "فایروال رو ببین", "ufw", "firewall status"])) return "linux_check_firewall_status";

  if (canonicalVendor === "linux" && includesAny(text, ["کاربران sudo", "یوزرهای sudo", "چه کسانی sudo دارن", "sudo users"])) return "linux_check_sudo_users";

  if (includesAny(text, ["چک روزانه", "بررسی روزانه", "وضعیت کلی سرور", "سلامت سرور", "daily check"])) {
    if (canonicalVendor === "linux") return "linux_daily_check";
    if (canonicalVendor === "mikrotik") return "mikrotik_daily_check";
    return "vendor_daily_check";
  }

  if (canonicalVendor === "mikrotik" && includesAny(text, ["لاگ لاگین میکروتیک", "ورودهای ناموفق میکروتیک", "login logs", "failed login"])) return "mikrotik_check_login_logs";

  if (canonicalVendor === "linux" && includesAny(text, ["وضعیت", "چک", "بررسی", "ببین", "status", "check"]) && extractServiceName(text)) return "linux_check_service_status";

  if (/وضعیت.*سرویس|service.*status|service.*check/i.test(text) && canonicalVendor === "linux") return "linux_check_service_status";

  if (/لاگ.*(ورود|لاگین)|login.*log/i.test(text) && canonicalVendor === "mikrotik") return "mikrotik_check_login_logs";

  if (rawActionType === "open_port" && canonicalVendor === "linux") return "linux_open_port";

  return rawActionType;
}

function findCatalogItemByIntent(vendor: string, actionType: string) {
  return COMMAND_CATALOG.find((entry) => entry.vendor === vendor && entry.actionType === actionType)
    ?? (vendor === "generic" ? COMMAND_CATALOG.find((entry) => entry.actionType === actionType) : null)
    ?? null;
}

const TARGET_ACTION_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "any",
  "for",
  "from",
  "me",
  "my",
  "on",
  "please",
  "something",
  "the",
  "to",
]);

function targetSupportedActions(context: AiResolverTargetContext | null | undefined) {
  return Array.isArray(context?.supportedActions) ? context.supportedActions : [];
}

function tokenizeActionText(value: string) {
  return normalizeUserText(value)
    .split(" ")
    .map((word) => word.trim())
    .filter((word) => word.length >= 3 && !TARGET_ACTION_STOP_WORDS.has(word));
}

function actionText(action: AiResolverSupportedAction) {
  return normalizeUserText([
    action.id,
    action.actionType,
    action.titleFa,
    action.titleEn,
    action.category,
    ...(action.aliases ?? []),
  ].filter(Boolean).join(" "));
}

function resolveTargetSupportedAction(userText: string, actions: readonly AiResolverSupportedAction[]) {
  const text = normalizeUserText(userText);
  const requestTokens = tokenizeActionText(userText);
  let best: { action: AiResolverSupportedAction; score: number } | null = null;

  for (const action of actions) {
    const haystack = actionText(action);
    const aliases = (action.aliases ?? []).map((alias) => normalizeUserText(alias)).filter(Boolean);
    const titleEn = normalizeUserText(action.titleEn ?? "");
    const titleFa = normalizeUserText(action.titleFa ?? "");
    let score = 0;

    if (titleEn.length >= 3 && text.includes(titleEn)) score += 8;
    if (titleFa.length >= 3 && text.includes(titleFa)) score += 8;
    if (aliases.some((alias) => alias.length >= 3 && text.includes(alias))) score += 8;
    for (const token of requestTokens) {
      if (haystack.includes(token)) score += 1;
    }

    if (!best || score > best.score) best = { action, score };
  }

  return best && best.score >= 2 ? best.action : null;
}

function isDeviceOverviewRequest(userText: string) {
  const text = normalizeUserText(userText);
  const asksAboutSelectedDevice = includesAny(text, [
    "what do you know", "about my device", "about this device", "device overview", "device status", "system status", "health", "daily check", "diagnostic", "summary",
    "چی میدونی", "چه میدونی", "درباره دستگاه", "درباره روتر", "از روترم", "روترم", "دستگاهم", "وضعیت دستگاه", "سلامت دستگاه", "چک روزانه", "بررسی کلی", "تحلیل کامل",
  ]);
  const mutating = includesAny(text, [
    "configure", "create", "add", "change", "delete", "remove", "enable", "disable", "restart", "reload", "apply",
    "تنظیم", "بساز", "ایجاد", "اضافه", "تغییر", "حذف", "فعال", "غیرفعال", "ریستارت", "اعمال",
  ]);
  return asksAboutSelectedDevice && !mutating;
}

function resolveDefaultReadOnlyTargetAction(userText: string, actions: readonly AiResolverSupportedAction[]) {
  if (!isDeviceOverviewRequest(userText)) return null;
  const candidates = actions.filter((action) =>
    action.readOnly !== false &&
    action.connectorType &&
    action.executionTemplateRef &&
    (action.requiredParams ?? []).length === 0
  );
  const priorityTerms = [
    "daily-check",
    "diagnostics",
    "diagnostic",
    "health",
    "system-status",
    "show-health",
    "show-version",
    "resources",
    "status",
  ];
  let best: { action: AiResolverSupportedAction; score: number } | null = null;
  for (const action of candidates) {
    const haystack = actionText(action);
    let score = 1;
    priorityTerms.forEach((term, index) => {
      if (haystack.includes(normalizeUserText(term))) score += priorityTerms.length - index;
    });
    if (!best || score > best.score) best = { action, score };
  }
  return best?.action ?? null;
}

function numberAfter(text: string, keys: string[]) {
  for (const key of keys) {
    const match = new RegExp(`\\b${key}\\b\\s*(?:to|=|:)?\\s*(\\d{1,5})`, "i").exec(text);
    if (match?.[1]) return Number(match[1]);
  }
  return undefined;
}

function lastNumber(text: string) {
  const matches = Array.from(text.matchAll(/\b\d{1,5}\b/g));
  const last = matches.at(-1)?.[0];
  return last ? Number(last) : undefined;
}

function normalizeTargetActionParams(action: AiResolverSupportedAction, userText: string, params: Record<string, unknown>) {
  const text = normalizeUserText(userText);
  const next = { ...params };
  const fields = new Set([...(action.requiredParams ?? []), ...(action.optionalParams ?? [])]);
  const serviceName = extractServiceName(text);

  if (!next.serviceName && serviceName && fields.has("serviceName")) next.serviceName = serviceName;
  if (!next.serviceName && fields.has("serviceName") && includesAny(text, ["ssh", "secure shell"])) next.serviceName = "ssh";
  if (!next.service && typeof next.serviceName === "string") next.service = next.serviceName;

  if (next.newPort === undefined && fields.has("newPort")) next.newPort = numberAfter(text, ["newport", "port"]) ?? lastNumber(text);
  if (next.port === undefined && fields.has("port")) next.port = numberAfter(text, ["port"]) ?? lastNumber(text);
  if (next.vlanId === undefined && fields.has("vlanId")) next.vlanId = numberAfter(text, ["vlan"]) ?? lastNumber(text);

  return normalizeParams(next);
}

function missingFieldsForTargetAction(action: AiResolverSupportedAction, params: Record<string, unknown>) {
  return (action.requiredParams ?? []).filter((field) => params[field] === undefined || params[field] === "");
}

function canUseCatalogActionType(actionType: string) {
  return actionType !== "generic_security_action" && actionType !== "custom_vendor_action";
}

function missingFieldsForItem(item: CommandCatalogItem | null, params: Record<string, unknown>) {
  if (!item) return [];
  return item.requiredParams
    .filter((field) => params[field.key] === undefined || params[field.key] === "")
    .map((field) => field.key);
}

export function missingFieldsMessageFa(fields: string[]) {
  if (fields.includes("deviceId")) return MISSING_FIELD_LABELS.deviceId;
  if (fields.length === 1) return MISSING_FIELD_LABELS[fields[0]] ?? `مقدار ${fields[0]} را وارد کنید.`;
  return `برای ساخت برنامه اجرا، این اطلاعات لازم است: ${fields.map((field) => MISSING_FIELD_LABELS[field] ?? field).join("، ")}`;
}

function isAmbiguousPortRequest(userText: string) {
  const text = normalizeUserText(userText);
  return includesAny(text, ["وضعیت پورت", "پورت هامو", "پورت ها", "پورت‌ها", "open ports", "listening ports"]) && !includesAny(text, ["اینترفیس", "interface", "فیزیکی", "tcp", "udp", "listen"]);
}

export function resolveAiTemplate(input: {
  userText: string;
  selectedDevice?: AiResolverDevice | null;
  detectedVendor?: unknown;
  currentVendor?: unknown;
  selectedConnectorType?: unknown;
  selectedDeviceName?: unknown;
  searchFilters?: Record<string, unknown> | null;
  aiIntent?: { intentType?: unknown; parameters?: Record<string, unknown> } | null;
  params?: Record<string, unknown>;
  targetDeviceContext?: AiResolverTargetContext | null;
}): AiTemplateResolution {
  const selectedVendor =
    normalizeAiVendor(input.targetDeviceContext?.device?.vendor)
    ?? normalizeAiVendor(input.selectedDevice?.type)
    ?? normalizeAiVendor(input.selectedDevice?.vendor)
    ?? normalizeAiVendor(input.currentVendor)
    ?? normalizeAiVendor(input.detectedVendor);

  if (!selectedVendor && isAmbiguousPortRequest(input.userText)) {
    return {
      mode: "clarification",
      canonicalVendor: "generic",
      canonicalActionType: "port_status_clarification",
      catalogCommandId: null,
      executionTemplateRef: null,
      connectorType: null,
      implementationState: "manualOnly",
      executionSupport: "manual",
      normalizedParams: {},
      missingFields: [],
      confidence: 0.8,
      reasonFa: "منظورت از پورت‌ها را مشخص کن.",
      catalogItem: null,
      questionFa: "منظورت از پورت‌ها کدام است؟",
      options: [
        { labelFa: "پورت‌های فیزیکی / اینترفیس‌های دستگاه", value: "physical_interfaces" },
        { labelFa: "پورت‌های TCP/UDP باز و سرویس‌های در حال Listen", value: "listening_ports" },
      ],
    };
  }

  if (!input.selectedDevice?.id && isGuidedOperationalIntent(input.userText)) {
    const guided = selectedVendor
      ? resolveGuidedAction({ text: input.userText, vendor: selectedVendor })
      : resolveVendorlessGuidedAction(input.userText);
    if (guided) {
      const blueprint = getGuidedActionBlueprint(guided.blueprintId);
      const implementationState = blueprint?.implementationState === "implemented" ? "implemented" : "planned";
      return {
        mode: "guided_workflow",
        canonicalVendor: selectedVendor ?? "generic",
        canonicalActionType: guided.blueprintId,
        catalogCommandId: null,
        executionTemplateRef: null,
        connectorType: selectedVendor ? connectorTypeForVendor(selectedVendor) : null,
        implementationState,
        executionSupport: implementationState === "implemented" ? "connector" : "not_implemented",
        normalizedParams: guided.initialValues,
        missingFields: [],
        confidence: 0.93,
        reasonFa: guided.reasonFa,
        catalogItem: null,
        blueprintId: guided.blueprintId,
        initialValues: guided.initialValues,
      };
    }
    return {
      mode: "clarification",
      canonicalVendor: selectedVendor ?? "generic",
      canonicalActionType: "guided_workflow_device_required",
      catalogCommandId: null,
      executionTemplateRef: null,
      connectorType: connectorTypeForVendor(selectedVendor),
      implementationState: "manualOnly",
      executionSupport: "manual",
      normalizedParams: {},
      missingFields: ["deviceId"],
      confidence: 0.9,
      reasonFa: "اول دستگاه مقصد را انتخاب کن.",
      catalogItem: null,
      questionFa: "اول دستگاه مقصد را انتخاب کن.",
      options: [],
    };
  }

  const routed = routePersianIntent({
    text: input.userText,
    selectedDeviceId: input.selectedDevice?.id ?? null,
    selectedVendor,
  });
  if (routed.matched && routed.actionType && routed.executionTemplateRef) {
    const item = findCatalogItemByIntent(selectedVendor ?? "generic", routed.actionType);
    const template = getExecutionTemplate(routed.executionTemplateRef);
    const mergedParams = { ...(item?.defaultParams ?? {}), ...routed.normalizedParams };
    const missingFields = Array.from(new Set([...routed.missingFields, ...missingFieldsForItem(item, mergedParams)]));
    if (item?.supportState === "verified" && template) {
      return {
        mode: missingFields.length ? "needs_input" : "executable_action_plan",
        canonicalVendor: item.vendor,
        canonicalActionType: item.actionType,
        catalogCommandId: item.id,
        executionTemplateRef: routed.executionTemplateRef,
        connectorType: routed.connectorType,
        implementationState: "implemented",
        executionSupport: "connector",
        normalizedParams: mergedParams,
        missingFields,
        confidence: routed.confidence,
        reasonFa: missingFields.length ? missingFieldsMessageFa(missingFields) : routed.reasonFa,
        catalogItem: item,
      };
    }
  }

  const selectedTargetActions = targetSupportedActions(input.targetDeviceContext);
  const targetAction = resolveTargetSupportedAction(input.userText, selectedTargetActions)
    ?? resolveDefaultReadOnlyTargetAction(input.userText, selectedTargetActions);
  if (targetAction) {
    const targetCatalogItem = COMMAND_CATALOG.find((entry) => entry.id === targetAction.id && entry.supportState === "verified") ?? null;
    const targetTemplate = targetCatalogItem?.executionTemplateRef ? getExecutionTemplate(targetCatalogItem.executionTemplateRef) : null;
    const executionTemplateRef = targetCatalogItem?.executionTemplateRef ?? targetAction.executionTemplateRef ?? null;
    const connectorType = targetCatalogItem?.connectorType ?? targetAction.connectorType ?? connectorTypeForVendor(selectedVendor);
    const mergedParams = normalizeTargetActionParams(targetAction, input.userText, {
      ...(targetCatalogItem?.defaultParams ?? {}),
      ...(input.params ?? {}),
    });
    const missingFields = targetCatalogItem
      ? missingFieldsForItem(targetCatalogItem, mergedParams)
      : missingFieldsForTargetAction(targetAction, mergedParams);
    const commandCatalogReady = Boolean(targetCatalogItem?.executionTemplateRef && targetTemplate);
    const legacyCatalogReady = targetAction.source === "legacy_action_catalog";

    if (commandCatalogReady || legacyCatalogReady) {
      return {
        mode: missingFields.length ? "needs_input" : "executable_action_plan",
        canonicalVendor: selectedVendor ?? normalizeAiVendor(input.targetDeviceContext?.device?.vendor) ?? "generic",
        canonicalActionType: targetCatalogItem?.actionType ?? targetAction.actionType,
        catalogCommandId: legacyCatalogReady ? "legacy:" + targetAction.id : targetCatalogItem?.id ?? targetAction.id,
        executionTemplateRef,
        connectorType,
        implementationState: "implemented",
        executionSupport: "connector",
        normalizedParams: mergedParams,
        missingFields,
        confidence: 0.94,
        reasonFa: missingFields.length ? missingFieldsMessageFa(missingFields) : "Mapped to a supported executable action for the selected target device.",
        catalogItem: targetCatalogItem,
        targetSupportedAction: targetAction,
      };
    }
  }
  const guidedVendor = selectedVendor;
  const guided = guidedVendor && isGuidedOperationalIntent(input.userText) ? resolveGuidedAction({ text: input.userText, vendor: guidedVendor }) : null;
  if (guided) {
    const blueprint = getGuidedActionBlueprint(guided.blueprintId);
    const implementationState = blueprint?.implementationState === "implemented" ? "implemented" : blueprint?.implementationState === "partial" ? "planned" : "planned";
    return {
      mode: "guided_workflow",
      canonicalVendor: guidedVendor ?? "generic",
      canonicalActionType: guided.blueprintId,
      catalogCommandId: null,
      executionTemplateRef: null,
      connectorType: connectorTypeForVendor(guidedVendor),
      implementationState,
      executionSupport: implementationState === "implemented" ? "connector" : "not_implemented",
      normalizedParams: guided.initialValues,
      missingFields: [],
      confidence: 0.93,
      reasonFa: guided.reasonFa,
      catalogItem: null,
      blueprintId: guided.blueprintId,
      initialValues: guided.initialValues,
    };
  }

  const parsed = parseAiIntent(input.userText);
  const rawActionType = String(input.aiIntent?.intentType ?? parsed?.intentType ?? "generic_security_action");
  const normalizedText = normalizeUserText(input.userText);
  const normalizedParams = normalizeParams({
    ...(parsed?.parameters ?? {}),
    ...(input.aiIntent?.parameters ?? {}),
    ...(input.params ?? {}),
  });
  const serviceName = extractServiceName(normalizedText);
  if (serviceName && !normalizedParams.serviceName && includesAny(normalizedText, ["وضعیت", "چک", "بررسی", "ببین", "status", "check"])) {
    normalizedParams.serviceName = serviceName;
  }

  const canonicalVendor =
    normalizeAiVendor(input.targetDeviceContext?.device?.vendor)
    ?? normalizeAiVendor(input.selectedDevice?.type)
    ?? normalizeAiVendor(input.selectedDevice?.vendor)
    ?? normalizeAiVendor(input.currentVendor)
    ?? normalizeAiVendor(input.detectedVendor)
    ?? normalizeAiVendor(normalizedParams.vendor)
    ?? normalizeAiVendor(normalizedParams.targetDeviceHint)
    ?? inferredVendorFromAction(rawActionType)
    ?? "generic";

  const resolvedActionType = resolveActionAlias(input.userText, rawActionType, canonicalVendor);
  const item = canUseCatalogActionType(resolvedActionType) ? findCatalogItemByIntent(canonicalVendor, resolvedActionType) : null;
  const mergedParams = { ...(item?.defaultParams ?? {}), ...normalizedParams };
  const missingFields = missingFieldsForItem(item, mergedParams);
  const template = item?.executionTemplateRef ? getExecutionTemplate(item.executionTemplateRef) : null;

  if (item?.supportState === "verified" && template) {
    return {
      mode: missingFields.length ? "needs_input" : "executable_action_plan",
      canonicalVendor,
      canonicalActionType: item.actionType,
      catalogCommandId: item.id,
      executionTemplateRef: item.executionTemplateRef,
      connectorType: item.connectorType,
      implementationState: "implemented",
      executionSupport: "connector",
      normalizedParams: mergedParams,
      missingFields,
      confidence: parsed ? 0.96 : 0.9,
      reasonFa: missingFields.length ? missingFieldsMessageFa(missingFields) : "درخواست به template اجرایی ثبت‌شده نگاشت شد.",
      catalogItem: item,
    };
  }

  if (item) {
    return {
      mode: missingFields.length ? "needs_input" : "manual_or_not_supported",
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
    mode: "manual_or_not_supported",
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
    reasonFa: "برای این درخواست هنوز اجرای خودکار آماده نیست.",
    catalogItem: null,
  };
}
