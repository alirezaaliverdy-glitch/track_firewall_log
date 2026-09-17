import type { ActionPlan, Device } from "@prisma/client";
import { COMMAND_CATALOG, findCatalogItem } from "./index.js";
import { getExecutionTemplate } from "../execution/execution-template-registry.js";
import { selectDeviceConnector } from "../../connectors/connector-registry.service.js";

type Resolution = { matched: false } | { matched: true; valid: false; code: string; messageFa: string } | { matched: true; valid: true; item: (typeof COMMAND_CATALOG)[number] };
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const vendorOf = (device: Device) => device.type === "linux_edge" ? "linux" : String(device.vendor).toLowerCase().includes("cisco") ? "cisco" : device.type === "generic_firewall" || device.type === "generic_syslog_source" ? "generic" : device.type;

export function resolveCatalogAction(plan: Pick<ActionPlan, "actionType" | "parametersJson">, device: Device | null): Resolution {
  const parameters = object(plan.parametersJson); const metadata = object(parameters.metadata);
  const storedCommandId = typeof metadata.catalogCommandId === "string" ? metadata.catalogCommandId : null;
  // Legacy-controlled actions use an explicit canonical marker for revision
  // identity, but that marker is not a product-catalog item ID.
  const commandId = storedCommandId?.startsWith("legacy:") ? null : storedCommandId;
  const fallback = COMMAND_CATALOG.filter((item) => item.supportState === "verified" && item.actionType === plan.actionType);
  const item = commandId ? findCatalogItem(commandId) : fallback.length === 1 ? fallback[0] : undefined;
  if (!item) return commandId ? { matched: true, valid: false, code: "CATALOG_COMMAND_NOT_FOUND", messageFa: "این دستور هنوز اجرای خودکار ندارد" } : { matched: false };
  if (item.supportState !== "verified" || item.executionSupport !== "connector") return { matched: true, valid: false, code: "CATALOG_COMMAND_NOT_VERIFIED", messageFa: "این دستور هنوز اجرای خودکار ندارد" };
  if (plan.actionType !== item.actionType) return { matched: true, valid: false, code: "CATALOG_ACTION_TYPE_MISMATCH", messageFa: "این دستور هنوز اجرای خودکار ندارد" };
  const template = getExecutionTemplate(item.executionTemplateRef);
  if (!template || template.actionType !== plan.actionType || template.connectorType !== item.connectorType) return { matched: true, valid: false, code: "CATALOG_TEMPLATE_MISSING", messageFa: "قالب اجرای این دستور پیدا نشد" };
  const missing = item.requiredParams.filter((field) => parameters[field.key] === undefined || parameters[field.key] === null || parameters[field.key] === "");
  if (missing.length) return { matched: true, valid: false, code: "CATALOG_PARAMS_INCOMPLETE", messageFa: "پارامترهای دستور ناقص است" };
  if (!device || (item.vendor !== "generic" && vendorOf(device) !== item.vendor)) return { matched: true, valid: false, code: "CATALOG_DEVICE_UNSUPPORTED", messageFa: "اتصال دستگاه آماده نیست" };
  const connector = selectDeviceConnector(device);
  if (!connector || !connector.supportedActions.includes(plan.actionType)) return { matched: true, valid: false, code: "CATALOG_DEVICE_UNSUPPORTED", messageFa: "اتصال دستگاه آماده نیست" };
  return { matched: true, valid: true, item };
}
