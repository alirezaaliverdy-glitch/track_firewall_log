import { ActionType } from "@prisma/client";
import type { CustomCommandPlan, CustomCommandValidation, CustomConnectorVendor } from "../../ai/custom-action-plan.js";
import type { CustomCommandPolicyDevice, VendorCustomCommandPolicy } from "./custom-command-policy.types.js";
import { linuxCustomCommandPolicy } from "./linux.policy.js";
import { mikrotikCustomCommandPolicy } from "./mikrotik.policy.js";
import { fortigateCustomCommandPolicy } from "./fortigate.policy.js";
import { ciscoCustomCommandPolicy } from "./cisco.policy.js";

const POLICIES: Record<CustomConnectorVendor, VendorCustomCommandPolicy> = {
  linux: linuxCustomCommandPolicy,
  mikrotik: mikrotikCustomCommandPolicy,
  fortigate: fortigateCustomCommandPolicy,
  cisco: ciscoCustomCommandPolicy,
};

const VENDOR_TEMPLATES: Record<CustomConnectorVendor, {
  connectorType: CustomCommandPlan["connectorType"];
  executionTemplateRef: CustomCommandPlan["executionTemplateRef"];
}> = {
  linux: { connectorType: "linux-ssh", executionTemplateRef: "linux_custom_connector_command" },
  mikrotik: { connectorType: "mikrotik-ssh", executionTemplateRef: "mikrotik_custom_connector_command" },
  fortigate: { connectorType: "fortigate-ssh", executionTemplateRef: "fortigate_custom_connector_command" },
  cisco: { connectorType: "cisco-ios-xe-ssh", executionTemplateRef: "cisco_custom_connector_command" },
};

function requestedVendorFromText(message: string): CustomConnectorVendor | null {
  const text = message.toLowerCase().replace(/[?؟,،;؛:.!()[\]{}"']/g, " ").replace(/\s+/g, " ").trim();
  if (/\bmikrotik|routeros\b/.test(text)) return "mikrotik";
  if (/\bfortigate|fortinet|fortios\b/.test(text)) return "fortigate";
  if (/\blinux|ubuntu|debian|rhel|centos\b/.test(text)) return "linux";
  if (/\bcisco|iosxe|ios-xe|ios\b/.test(text)) return "cisco";
  return null;
}

export function getCustomCommandPolicy(vendor: CustomConnectorVendor) {
  return POLICIES[vendor];
}

function vendorFromDevice(device: CustomCommandPolicyDevice | null | undefined): CustomConnectorVendor | null {
  const vendor = String(device?.vendor ?? "").toLowerCase();
  const type = String(device?.type ?? "").toLowerCase();
  if (type === "mikrotik" || vendor.includes("mikrotik") || vendor.includes("routeros")) return "mikrotik";
  if (type === "fortigate" || vendor.includes("forti")) return "fortigate";
  if (type === "linux_edge" || vendor.includes("linux")) return "linux";
  if (vendor.includes("cisco")) return "cisco";
  return null;
}

export function evaluateCustomCommandPolicy(input: {
  plan: CustomCommandPlan | null;
  device: CustomCommandPolicyDevice | null;
  actionType: ActionType | string;
}): CustomCommandValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const missingFields = Array.from(new Set(input.plan?.missingFields ?? []));
  if (input.actionType !== ActionType.custom_vendor_action) errors.push("Custom connector execution requires custom_vendor_action.");
  if (!input.device) errors.push("Custom connector action requires a selected registered device.");
  if (!input.plan) errors.push("Custom connector action requires a normalized customCommandPlan.");
  if (!input.plan || !input.device) return { valid: false, errors, warnings, missingFields, normalizedPlan: null, rollbackJson: {} };

  const policy = getCustomCommandPolicy(input.plan.vendor);
  const selectedVendor = vendorFromDevice(input.device);
  const requestedVendor = requestedVendorFromText(input.plan.intent);
  const template = VENDOR_TEMPLATES[input.plan.vendor];
  if (!selectedVendor || selectedVendor !== input.plan.vendor) errors.push("Custom command vendor does not match the selected device vendor/platform.");
  if (requestedVendor && requestedVendor !== input.plan.vendor) errors.push("Custom command text references a different vendor than the selected device.");
  if (!policy.supportsDevice(input.device)) errors.push("Custom connector actions require an SSH-backed registered connector for the selected vendor.");
  if (input.plan.connectorType !== template.connectorType || input.plan.executionTemplateRef !== template.executionTemplateRef) errors.push("Custom command template does not match the selected vendor connector.");

  const decision = policy.evaluate({ plan: input.plan, device: input.device });
  errors.push(...decision.errors);
  warnings.push(...decision.warnings);

  const normalizedPlan = {
    ...input.plan,
    orderedCommands: decision.normalizedOperation.orderedCommands,
    typedParameters: {
      ...decision.normalizedOperation.typedParameters,
      requiredRole: decision.requiredRole,
      requiredPermission: decision.requiredPermission,
      timeoutMs: decision.normalizedOperation.timeoutMs,
      outputLimitBytes: decision.normalizedOperation.outputLimitBytes,
    },
    verificationCommands: decision.normalizedOperation.verificationCommands,
    rollbackGuidance: decision.normalizedOperation.rollbackGuidance,
    expectedImpact: decision.normalizedOperation.expectedImpact,
    riskLevel: decision.normalizedOperation.riskLevel,
    backendValidation: {
      normalized: true as const,
      vendorPlatformCompatible: Boolean(selectedVendor && selectedVendor === input.plan.vendor && policy.supportsDevice(input.device)),
      commandSafety: errors.length === 0 ? "passed" as const : "failed" as const,
    },
    rawCommandExecution: false as const,
  };

  const policyMissingFields = Array.from(new Set([...missingFields, ...decision.missingFields]));
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    missingFields: policyMissingFields,
    normalizedPlan,
    rollbackJson: {
      customConnectorPlan: true,
      rollbackGuidance: normalizedPlan.rollbackGuidance,
      verificationCommands: normalizedPlan.verificationCommands,
      requiredRole: decision.requiredRole,
      requiredPermission: decision.requiredPermission,
      requiresBackup: decision.requiresBackup,
      timeoutMs: decision.normalizedOperation.timeoutMs,
      outputLimitBytes: decision.normalizedOperation.outputLimitBytes,
      rawCommandExecution: false,
    },
  };
}
