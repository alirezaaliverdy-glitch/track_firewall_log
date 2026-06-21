import { ActionType, DeviceType } from "@prisma/client";
import type { PlannerInput, VendorCommandPlan, VendorPlanner } from "../types.js";

function str(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function bool(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function arr(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function missingPolicyFields(parameters: Record<string, unknown>) {
  const missing: string[] = [];
  if (!str(parameters.srcintf) && !str(parameters.srcInterface) && !str(parameters.srcZone)) missing.push("srcintf");
  if (!str(parameters.dstintf) && !str(parameters.dstInterface) && !str(parameters.dstZone)) missing.push("dstintf");
  if (!str(parameters.sourceIp) && !str(parameters.sourceCidr) && !str(parameters.sourceAddressObject)) missing.push("sourceIp/sourceCidr/sourceAddressObject");
  if (!str(parameters.destination) && !str(parameters.dstCidr)) missing.push("destination/dstCidr");
  if (!str(parameters.scheduleName) && !str(parameters.scheduleDefinition) && parameters.always !== true) missing.push("scheduleName/scheduleDefinition or always=true");
  if (arr(parameters.services).length === 0 && parameters.anyService !== true) missing.push("services or anyService=true");
  if (!str(parameters.action)) missing.push("action");
  return missing;
}

function base(input: PlannerInput): VendorCommandPlan {
  return {
    status: "planned",
    vendor: "fortigate",
    deviceId: input.device?.id ?? null,
    actionType: input.actionType,
    transport: input.device?.protocol === "api" ? "api" : "ssh",
    commands: [],
    apiCalls: [],
    warnings: [],
    rollbackSteps: [],
    riskLevel: input.riskLevel,
    requiresApproval: true
  };
}

function createEgressPolicy(input: PlannerInput): VendorCommandPlan {
  const parameters = input.parameters;
  const missing = missingPolicyFields(parameters);
  const plan = base(input);
  if (missing.length > 0) {
    return {
      ...plan,
      status: "needs_clarification",
      missingFields: missing,
      questions: [
        "Which FortiGate source interface or zone should the policy use?",
        "Which FortiGate destination interface or zone should the policy use?",
        "Should services be explicit, or is anyService=true approved?",
        "Should the schedule be a named object, a new recurring definition, or always=true?"
      ],
      warnings: ["FortiGate interface and policy order are not safe to guess."]
    };
  }

  const existingSourceObject = str(parameters.sourceAddressObject);
  const sourceSubnet = str(parameters.sourceIp) ?? str(parameters.sourceCidr);
  const sourceName = existingSourceObject ?? `src_${sourceSubnet}`.replace(/[^\w-]/g, "_");
  const dstAddr = str(parameters.destination) === "internet" ? "all" : str(parameters.destination) ?? str(parameters.dstCidr) ?? "all";
  const srcIntf = str(parameters.srcintf) ?? str(parameters.srcInterface) ?? str(parameters.srcZone) ?? "";
  const dstIntf = str(parameters.dstintf) ?? str(parameters.dstInterface) ?? str(parameters.dstZone) ?? "";
  const schedule = str(parameters.scheduleName) ?? "always";
  const services = arr(parameters.services);
  const action = str(parameters.action) === "deny" ? "deny" : "accept";
  const nat = bool(parameters.nat, true);
  const log = bool(parameters.log, true);
  const comment = str(parameters.comment) ?? "Created from Firewall Log Analyzer dry-run plan";

  plan.commands = [
    ...(existingSourceObject ? [] : [
      "config firewall address",
      `edit ${sourceName}`,
      `set subnet ${sourceSubnet}`,
      "next",
      "end"
    ]),
    "config firewall schedule recurring",
    `edit ${schedule}`,
    `set day ${str(parameters.scheduleDefinition) ?? "monday tuesday wednesday thursday friday"}`,
    "set start 09:00",
    "set end 17:00",
    "next",
    "end",
    "config firewall policy",
    "edit 0",
    `set srcintf ${srcIntf}`,
    `set dstintf ${dstIntf}`,
    `set srcaddr ${sourceName}`,
    `set dstaddr ${dstAddr}`,
    `set schedule ${schedule}`,
    `set service ${services.join(" ")}`,
    `set action ${action}`,
    `set nat ${nat ? "enable" : "disable"}`,
    `set logtraffic ${log ? "all" : "disable"}`,
    `set comments "${comment.replace(/"/g, "'")}"`,
    "next",
    "end"
  ];
  plan.apiCalls = [
    ...(existingSourceObject ? [] : [{ method: "POST" as const, path: "/api/v2/cmdb/firewall/address", description: "Create or update source address object.", body: { name: sourceName, subnet: sourceSubnet } }]),
    { method: "POST", path: "/api/v2/cmdb/firewall/schedule/recurring", description: "Create or update recurring schedule object.", body: { name: schedule, definition: str(parameters.scheduleDefinition) ?? "business_hours" } },
    { method: "POST", path: "/api/v2/cmdb/firewall/policy", description: "Create egress firewall policy.", body: { srcintf: srcIntf, dstintf: dstIntf, srcaddr: sourceName, dstaddr: dstAddr, schedule, service: services, action, nat, logtraffic: log ? "all" : "disable", comments: comment } }
  ];
  plan.warnings = ["Review policy order and shadowing before approval.", "Dry-run only. No FortiGate command or API call was executed."];
  plan.rollbackSteps = [
    "Remove the new firewall policy created for this egress rule.",
    `Remove schedule object ${schedule} if it was created only for this rule.`,
    `Remove address object ${sourceName} if it is not reused elsewhere.`
  ];
  return plan;
}

function simpleUnsupported(input: PlannerInput, reason: string): VendorCommandPlan {
  return { ...base(input), status: "unsupported", transport: "manual", unsupportedReason: reason };
}

export const fortigatePlanner: VendorPlanner = {
  vendor: "fortigate",
  supportedActions: [
    ActionType.create_egress_policy,
    ActionType.create_address_object,
    ActionType.create_schedule_object,
    ActionType.create_service_object,
    ActionType.add_firewall_rule,
    ActionType.remove_firewall_rule,
    ActionType.enable_rule,
    ActionType.disable_rule
  ],
  supports(device) {
    return device?.type === DeviceType.fortigate || String(device?.vendor ?? "").toLowerCase().includes("forti");
  },
  plan(input) {
    if (input.actionType === ActionType.create_egress_policy) return createEgressPolicy(input);
    return simpleUnsupported(input, "FortiGate planner foundation exists, but this action template is not implemented yet.");
  }
};
