import { ActionType, DeviceType } from "@prisma/client";
import type { PlannerInput, VendorCommandPlan, VendorPlanner } from "../types.js";

function str(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function base(input: PlannerInput): VendorCommandPlan {
  return {
    status: "planned",
    vendor: "mikrotik",
    deviceId: input.device?.id ?? null,
    actionType: input.actionType,
    transport: input.device?.protocol === "api" ? "api" : "ssh",
    commands: [],
    apiCalls: [],
    warnings: ["Dry-run only. No RouterOS command or API call was executed."],
    rollbackSteps: [],
    riskLevel: input.riskLevel,
    requiresApproval: true
  };
}

function needs(input: PlannerInput, missingFields: string[], questions: string[]): VendorCommandPlan {
  return {
    ...base(input),
    status: "needs_clarification",
    missingFields,
    questions,
    warnings: ["MikroTik chain/interface placement is not safe to guess."]
  };
}

function blockTemporary(input: PlannerInput): VendorCommandPlan {
  const srcIp = str(input.parameters.srcIp);
  if (!srcIp) return needs(input, ["srcIp"], ["Which source IP should be added to the temporary block address-list?"]);
  const timeout = num(input.parameters.durationMinutes) ?? 30;
  const plan = base(input);
  plan.commands = [
    `/ip firewall address-list add list=temporary-block address=${srcIp} timeout=${timeout}m comment="Firewall Log Analyzer dry-run"`,
    "/ip firewall filter add chain=forward src-address-list=temporary-block action=drop comment=\"Drop temporary blocked sources\""
  ];
  plan.apiCalls = [
    { method: "POST", path: "/rest/ip/firewall/address-list", description: "Add source IP to temporary block list.", body: { list: "temporary-block", address: srcIp, timeout: `${timeout}m` } },
    { method: "POST", path: "/rest/ip/firewall/filter", description: "Create drop filter for temporary block list if missing.", body: { chain: "forward", srcAddressList: "temporary-block", action: "drop" } }
  ];
  plan.rollbackSteps = [`Remove ${srcIp} from address-list temporary-block.`, "Remove the filter only if it was created exclusively for this plan."];
  return plan;
}

function portPlan(input: PlannerInput, action: "accept" | "drop"): VendorCommandPlan {
  const port = num(input.parameters.port);
  const protocol = str(input.parameters.protocol) ?? "tcp";
  const chain = str(input.parameters.chain) ?? "input";
  if (!port) return needs(input, ["port"], ["Which destination port should the RouterOS rule target?"]);
  const plan = base(input);
  plan.commands = [
    `/ip firewall filter add chain=${chain} protocol=${protocol} dst-port=${port} action=${action} comment="Firewall Log Analyzer dry-run"`
  ];
  plan.apiCalls = [
    { method: "POST", path: "/rest/ip/firewall/filter", description: `Create RouterOS ${action} filter rule.`, body: { chain, protocol, dstPort: port, action } }
  ];
  plan.rollbackSteps = [`Remove the RouterOS firewall filter rule for ${protocol}/${port} created by this plan.`];
  if ([22, 80, 443, 8080].includes(port)) plan.warnings.push(`Port ${port} is operationally sensitive.`);
  return plan;
}

function egressPolicy(input: PlannerInput): VendorCommandPlan {
  const src = str(input.parameters.sourceIp) ?? str(input.parameters.sourceCidr);
  const outInterface = str(input.parameters.dstInterface) ?? str(input.parameters.dstintf);
  const services = Array.isArray(input.parameters.services) ? input.parameters.services.map(String) : [];
  if (!src || !outInterface || services.length === 0) {
    return needs(input, ["sourceIp/sourceCidr", "dstInterface", "services"], [
      "Which source IP or CIDR should be allowed or denied?",
      "Which WAN or destination interface should be used?",
      "Which destination ports/services should be explicit?"
    ]);
  }
  const action = str(input.parameters.action) === "deny" ? "drop" : "accept";
  const plan = base(input);
  plan.commands = services.map((service) =>
    `/ip firewall filter add chain=forward src-address=${src} out-interface=${outInterface} protocol=tcp dst-port=${service} action=${action} comment="Firewall Log Analyzer egress dry-run"`
  );
  if (input.parameters.nat === true && action === "accept") {
    plan.commands.push(`/ip firewall nat add chain=srcnat src-address=${src} out-interface=${outInterface} action=masquerade comment="Firewall Log Analyzer egress NAT dry-run"`);
  }
  plan.rollbackSteps = ["Remove the created forward filter rules.", "Remove the masquerade NAT rule if this plan created it."];
  plan.warnings.push("Review RouterOS rule order before approval.");
  return plan;
}

export const mikrotikPlanner: VendorPlanner = {
  vendor: "mikrotik",
  supportedActions: [
    ActionType.create_egress_policy,
    ActionType.block_source_ip_temporary,
    ActionType.unblock_source_ip,
    ActionType.open_port,
    ActionType.close_port,
    ActionType.add_firewall_rule,
    ActionType.remove_firewall_rule
  ],
  supports(device) {
    return device?.type === DeviceType.mikrotik || String(device?.vendor ?? "").toLowerCase().includes("mikrotik");
  },
  plan(input) {
    if (input.actionType === ActionType.block_source_ip_temporary) return blockTemporary(input);
    if (input.actionType === ActionType.open_port) return portPlan(input, "accept");
    if (input.actionType === ActionType.close_port) return portPlan(input, "drop");
    if (input.actionType === ActionType.create_egress_policy) return egressPolicy(input);
    return { ...base(input), status: "unsupported", transport: "manual", unsupportedReason: "MikroTik template for this action is not implemented yet." };
  }
};
