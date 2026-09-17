import net from "node:net";
import { COMMAND_CATALOG_VERSION, findCatalogItem } from "../commands/catalog/index.js";
import type { CommandCatalogItem, CommandParam } from "../commands/catalog/types.js";
import { getExecutionTemplate } from "../commands/execution/execution-template-registry.js";
import type { GuidedActionBlueprint, GuidedActionField } from "./types.js";

export const CATALOG_GUIDED_PREFIX = "catalog:";

function connectorTypeForVendor(vendor: string) {
  if (vendor === "fortigate") return "fortigate-ssh";
  if (vendor === "mikrotik") return "mikrotik-ssh";
  if (vendor === "linux") return "linux-ssh";
  return null;
}

function guidedType(type: CommandParam["type"]): GuidedActionField["type"] {
  if (type === "boolean") return "checkbox";
  if (type === "number") return "number";
  if (type === "ip") return "ip";
  if (type === "cidr") return "cidr";
  return "text";
}

function fieldFromParam(param: CommandParam, required: boolean): GuidedActionField {
  const lowerKey = param.key.toLowerCase();
  return {
    key: param.key,
    labelFa: param.labelFa,
    type: guidedType(param.type),
    required,
    placeholderFa: param.placeholderFa,
    helpFa: param.helpFa,
    secret: /password|psk|secret|token|key/i.test(lowerKey),
  };
}

function invalidValue(type: CommandParam["type"], value: unknown) {
  if (value === undefined || value === null || value === "") return true;
  if (type === "ip") return typeof value !== "string" || net.isIP(value) === 0;
  if (type === "cidr") {
    if (typeof value !== "string") return true;
    const [address, prefix] = value.split("/");
    const version = net.isIP(address);
    const max = version === 4 ? 32 : version === 6 ? 128 : -1;
    return prefix === undefined || !/^\d+$/.test(prefix) || Number(prefix) > max;
  }
  if (type === "number") return !Number.isFinite(Number(value));
  if (type === "boolean") return typeof value !== "boolean";
  return typeof value !== "string" || !value.trim();
}

function cleanCatalogParams(item: CommandCatalogItem, values: Record<string, unknown>) {
  const allowed = new Set([...item.requiredParams, ...item.optionalParams].map((field) => field.key));
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries({ ...item.defaultParams, ...values })) {
    if (!allowed.has(key) && !(key in item.defaultParams)) continue;
    if (key === "source" || key === "metadata" || key.startsWith("__")) continue;
    next[key] = value;
  }
  return next;
}

export function catalogGuidedBlueprintId(catalogItemId: string) {
  return `${CATALOG_GUIDED_PREFIX}${catalogItemId}`;
}

export function catalogItemIdFromGuidedBlueprint(blueprintId: string) {
  return blueprintId.startsWith(CATALOG_GUIDED_PREFIX) ? blueprintId.slice(CATALOG_GUIDED_PREFIX.length) : null;
}

export function isCatalogGuidedBlueprintId(blueprintId: string) {
  return catalogItemIdFromGuidedBlueprint(blueprintId) !== null;
}

export function buildCatalogGuidedBlueprint(blueprintId: string): GuidedActionBlueprint | null {
  const itemId = catalogItemIdFromGuidedBlueprint(blueprintId);
  const item = itemId ? findCatalogItem(itemId) : null;
  if (!item) return null;
  const connectorType = item.connectorType ?? connectorTypeForVendor(item.vendor);
  const fields = [
    ...item.requiredParams.map((param) => fieldFromParam(param, true)),
    ...item.optionalParams.map((param) => fieldFromParam(param, false)),
  ];
  return {
    id: blueprintId,
    vendor: item.vendor,
    titleFa: item.titleFa,
    descriptionFa: item.descriptionFa,
    category: item.category,
    risk: item.riskLevel,
    actionKind: "guided_action",
    implementationState: item.supportState === "verified" ? "implemented" : item.supportState === "unsupported" ? "not_supported" : "partial",
    researchStatus: item.supportState === "verified" ? "verified_from_existing_templates" : "partial",
    supportedConnectors: connectorType ? [connectorType] : [],
    requiredCapabilities: item.supportState === "verified" && item.executionTemplateRef ? [item.executionTemplateRef] : [],
    prerequisites: item.prechecks.map((precheck, index) => ({ id: `precheck_${index + 1}`, titleFa: precheck, required: item.supportState === "verified" })),
    steps: [
      {
        id: "catalog_parameters",
        titleFa: "تکمیل پارامترهای اکشن",
        descriptionFa: "مقادیر لازم را وارد کن؛ متن نمونه داخل فیلد به عنوان مقدار واقعی ارسال نمی‌شود.",
        fields,
      },
    ],
    verification: { commands: item.verification },
    rollback: item.rollback.available ? { template: item.rollback.steps.join("\n") } : { template: item.rollback.notAvailableReasonFa },
    uiHints: { supportState: item.supportState, catalogCommandId: item.id },
    buildActionPlan: (context) => {
      if (item.supportState === "unsupported") {
        return { ok: false, status: "not_supported", reasonFa: item.supportReason || item.disabledReasonFa || "این اکشن پشتیبانی نمی‌شود." };
      }
      if (item.supportState === "verified" && (!item.executionTemplateRef || !getExecutionTemplate(item.executionTemplateRef))) {
        return { ok: false, status: "not_supported", reasonFa: "این اکشن هنوز template اجرایی ثبت‌شده ندارد." };
      }
      const normalizedParams = cleanCatalogParams(item, context.values);
      const missingFields = item.requiredParams.filter((field) => invalidValue(field.type, normalizedParams[field.key]));
      if (missingFields.length) return { ok: false, status: "needs_input", reasonFa: "پارامترهای لازم کامل یا معتبر نیستند.", missingFields: missingFields.map((field) => fieldFromParam(field, true)) };
      const manualOnly = item.supportState === "manual_only";
      const previewOnly = item.supportState === "preview_only";
      const executable = item.supportState === "verified";
      return {
        ok: true,
        preview: { catalogCommandId: item.id, supportState: item.supportState },
        actionPlanInput: {
        source: "user",
        requestedBy: context.requestedBy,
        deviceId: context.deviceId,
        vendor: item.vendor,
        actionType: item.actionType,
        riskLevel: item.riskLevel,
        parametersJson: {
          ...normalizedParams,
          vendor: item.vendor,
          executionSupport: executable ? item.executionSupport : manualOnly ? "manual_or_not_implemented" : "preview_only",
          supportState: item.supportState,
          supportReasonKey: item.supportReasonKey,
          executable,
          requiresExplicitReview: true,
          expectedImpact: item.descriptionFa,
          suggestedPrechecks: item.prechecks,
          suggestedVerification: item.verification,
          suggestedRollback: item.rollback.available ? item.rollback.steps : [item.rollback.notAvailableReasonFa],
          metadata: {
            catalogCommandId: item.id,
            catalogVersion: COMMAND_CATALOG_VERSION,
            catalogTitleFa: item.titleFa,
            guidedBlueprintId: blueprintId,
            vendor: item.vendor,
            actionType: item.actionType,
            executionSupport: executable ? item.executionSupport : manualOnly ? "manual" : "preview_only",
            supportState: item.supportState,
            supportReasonKey: item.supportReasonKey,
            implementationState: item.implementationState,
            executionTemplateRef: executable ? item.executionTemplateRef : null,
            connectorType: executable ? item.connectorType : null,
            source: "guided_action_wizard",
            normalizedParams,
            requiredParamsSatisfied: true,
            previewGenerated: false,
            executed: false,
            connectorInvoked: false,
            lastExecutionStatus: "not_started",
            executable,
            previewOnly,
          },
        },
        },
      };
    },
  };
}
