import { ActionType } from "@prisma/client";
import { getExecutionTemplate } from "../execution/execution-template-registry.js";
import type { CommandCatalogItem, CommandVendor } from "./types.js";
import { getDeviceConnectors, getVendorPlanners } from "../../connectors/connector-registry.service.js";

const vendors = new Set<CommandVendor>(["linux", "mikrotik", "fortigate", "cisco", "pfsense", "juniper", "paloalto", "windows", "generic"]);
export function validateCommandCatalog(items: readonly CommandCatalogItem[]) {
  const errors: string[] = []; const ids = new Set<string>(); const actionTypes = new Set<string>(Object.values(ActionType));
  for (const item of items) {
    const prefix = item.id || "<missing-id>";
    if (ids.has(item.id)) errors.push(`${prefix}: duplicate id`); ids.add(item.id);
    if (!vendors.has(item.vendor)) errors.push(`${prefix}: unknown vendor`);
    if (!item.titleFa.trim()) errors.push(`${prefix}: titleFa is required`);
    if (!item.actionType || !actionTypes.has(item.actionType)) errors.push(`${prefix}: actionType does not exist`);
    for (const field of item.requiredParams) {
      if (!field.labelFa.trim() || !item.paramLabelsFa[field.key]) errors.push(`${prefix}: ${field.key} lacks Persian label`);
      if (!field.helpFa.trim() || !item.paramHelpFa[field.key]) errors.push(`${prefix}: ${field.key} lacks Persian help`);
    }
    if (item.mutating && !item.requiresConfirmation) errors.push(`${prefix}: mutating command must require confirmation`);
    if (item.mutating && (!item.prechecks.length || !item.verification.length)) errors.push(`${prefix}: mutating command needs prechecks and verification`);
    if (!item.rollback.available && !item.rollback.notAvailableReasonFa.trim()) errors.push(`${prefix}: rollback unavailability needs a reason`);
    if (item.implementationState === "implemented") {
      const template = getExecutionTemplate(item.executionTemplateRef);
      if (!template) errors.push(`${prefix}: implemented command has no registered template`);
      else if (template.actionType !== item.actionType || template.connectorType !== item.connectorType) errors.push(`${prefix}: template/action/connector mismatch`);
      else {
        const connectorVendor = template.connectorType === "linux-ssh" ? "linux_edge" : template.connectorType === "fortigate-ssh" ? "fortigate" : "mikrotik";
        const connector = getDeviceConnectors().find((candidate) => candidate.name === connectorVendor);
        const planner = getVendorPlanners().find((candidate) => candidate.vendor === connectorVendor);
        if (!connector?.supportedActions.includes(item.actionType as ActionType)) errors.push(`${prefix}: action is absent from real connector`);
        if (!planner?.supportedActions.includes(item.actionType as ActionType)) errors.push(`${prefix}: action is absent from real planner`);
      }
      if (item.executionSupport !== "connector" || !item.uiHints.executable) errors.push(`${prefix}: implemented command must be connector executable`);
    }
    if (["planned", "unsupported"].includes(item.implementationState) && (item.uiHints.executable || item.executionSupport === "connector" || item.executionTemplateRef)) errors.push(`${prefix}: planned/unsupported command cannot be executable`);
  }
  if (errors.length) throw new Error(`Invalid command catalog:\n${errors.join("\n")}`);
  return { valid: true as const, count: items.length };
}
