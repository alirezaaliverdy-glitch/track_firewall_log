import type { ActionPlan, Device } from "@prisma/client";
import { COMMAND_CATALOG, findCatalogItem } from "./index.js";
import { getExecutionTemplate } from "../execution/execution-template-registry.js";
import { selectDeviceConnector } from "../../connectors/connector-registry.service.js";

type Resolution = { matched: false } | { matched: true; valid: false; code: string; messageFa: string } | { matched: true; valid: true; item: (typeof COMMAND_CATALOG)[number] };
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const vendorOf = (device: Device) => device.type === "linux_edge" ? "linux" : device.type === "generic_firewall" || device.type === "generic_syslog_source" ? "generic" : device.type;

export function resolveCatalogAction(plan: Pick<ActionPlan, "actionType" | "parametersJson">, device: Device | null): Resolution {
  const parameters = object(plan.parametersJson); const metadata = object(parameters.metadata);
  const commandId = typeof metadata.catalogCommandId === "string" ? metadata.catalogCommandId : null;
  const fallback = COMMAND_CATALOG.filter((item) => item.implementationState === "implemented" && item.actionType === plan.actionType);
  const item = commandId ? findCatalogItem(commandId) : fallback.length === 1 ? fallback[0] : undefined;
  if (!item) return commandId ? { matched: true, valid: false, code: "CATALOG_COMMAND_NOT_FOUND", messageFa: "دستور کاتالوگ پیدا نشد یا نسخه آن معتبر نیست." } : { matched: false };
  if (item.implementationState !== "implemented" || item.executionSupport !== "connector") return { matched: true, valid: false, code: "CATALOG_COMMAND_NOT_EXECUTABLE", messageFa: "این دستور هنوز برای اجرای خودکار پشتیبانی نمی‌شود." };
  if (plan.actionType !== item.actionType) return { matched: true, valid: false, code: "CATALOG_ACTION_TYPE_MISMATCH", messageFa: "نوع عملیات با دستور کاتالوگ سازگار نیست." };
  const template = getExecutionTemplate(item.executionTemplateRef);
  if (!template || template.actionType !== plan.actionType || template.connectorType !== item.connectorType) return { matched: true, valid: false, code: "CATALOG_TEMPLATE_MISSING", messageFa: "این دستور هنوز برای اجرای خودکار پشتیبانی نمی‌شود." };
  const missing = item.requiredParams.filter((field) => parameters[field.key] === undefined || parameters[field.key] === null || parameters[field.key] === "");
  if (missing.length) return { matched: true, valid: false, code: "CATALOG_PARAMS_INCOMPLETE", messageFa: "پارامترهای لازم ناقص است." };
  if (!device || (item.vendor !== "generic" && vendorOf(device) !== item.vendor)) return { matched: true, valid: false, code: "CATALOG_DEVICE_UNSUPPORTED", messageFa: "این دستور برای این نوع دستگاه قابل اجرا نیست." };
  const connector = selectDeviceConnector(device);
  if (!connector || !connector.supportedActions.includes(plan.actionType)) return { matched: true, valid: false, code: "CATALOG_DEVICE_UNSUPPORTED", messageFa: "این دستور برای این نوع دستگاه قابل اجرا نیست." };
  return { matched: true, valid: true, item };
}
