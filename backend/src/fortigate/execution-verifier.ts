import { ActionType } from "@prisma/client";

type CommandOutput = {
  template: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
};

export type FortiGateVerificationCheck = {
  id: string;
  label: string;
  ok: boolean;
  evidence?: string;
  expected?: string;
};

export type FortiGateVerificationResult = {
  ok: boolean;
  actionType: string;
  summary: string;
  checks: FortiGateVerificationCheck[];
};

const CLI_FAILURE_PATTERNS: Array<[RegExp, string]> = [
  [/\bcommand parse error\b/i, "command parse error"],
  [/\bunknown action\b/i, "unknown action"],
  [/\binvalid value\b/i, "invalid value"],
  [/\bobject (?:not found|does not exist)\b/i, "object not found"],
  [/\bentry (?:not found|is used|already exists)\b/i, "entry error"],
  [/\bduplicate\b/i, "duplicate object"],
  [/\bpermission denied\b|\baccess denied\b|\bnot authorized\b/i, "permission error"],
  [/\bnode_check_object fail\b/i, "FortiOS object validation failed"],
  [/\breturn code -\d+\b/i, "FortiOS returned an error code"],
];

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function includesAll(haystack: string, needles: string[]) {
  const lower = haystack.toLowerCase();
  return needles.every((needle) => lower.includes(needle.toLowerCase()));
}

function commandText(command: CommandOutput) {
  return `${command.stdout}\n${command.stderr}`.trim();
}

function findCommand(commands: CommandOutput[], predicate: (command: CommandOutput) => boolean) {
  return commands.find(predicate);
}

function cidrNetwork(cidr: string) {
  return cidr.split(/[\/\s]/)[0] ?? cidr;
}

export function detectFortiGateCliFailure(output: string) {
  for (const [pattern, reason] of CLI_FAILURE_PATTERNS) {
    if (pattern.test(output)) return reason;
  }
  return null;
}

export function assertNoFortiGateCliFailure(command: CommandOutput) {
  const reason = detectFortiGateCliFailure(commandText(command));
  if (reason) throw new Error(`FortiGate CLI failure detected (${reason}) in ${command.template}.`);
}

export function verifyFortiGateGuidedVpn(parameters: Record<string, unknown>, commands: CommandOutput[]): FortiGateVerificationResult {
  const vpnName = asText(parameters.vpnName ?? parameters.name);
  const phase1Name = asText(parameters.phase1Name ?? vpnName);
  const phase2Name = asText(parameters.phase2Name ?? (phase1Name ? `${phase1Name}-p2` : ""));
  const wanInterface = asText(parameters.wanInterface);
  const lanInterface = asText(parameters.lanInterface);
  const remoteGateway = asText(parameters.remoteGateway);
  const proposal = asText(parameters.proposal || "aes256-sha256").toLowerCase();
  const localSubnet = asText(parameters.localSubnet);
  const remoteSubnet = asText(parameters.remoteSubnet);
  const createFirewallPolicy = parameters.createFirewallPolicy !== false;
  const createStaticRoute = parameters.createStaticRoute !== false;
  const natEnabled = parameters.natEnabled === true;
  const logTraffic = parameters.logTraffic === true;
  const policyBaseName = asText(parameters.policyName ?? vpnName);
  const lanPolicyName = `${policyBaseName}-lan-to-vpn`.slice(0, 79);
  const vpnPolicyName = `${policyBaseName}-vpn-to-lan`.slice(0, 79);

  const checks: FortiGateVerificationCheck[] = [];
  const push = (id: string, label: string, ok: boolean, evidence?: string, expected?: string) => checks.push({ id, label, ok, evidence, expected });

  const phase1Output = commandText(findCommand(commands, (command) => command.template.includes("show vpn ipsec phase1-interface")) ?? { template: "", stdout: "", stderr: "", exitCode: null });
  push(
    "phase1",
    "Phase1 exists with selected proposal, interface, and peer",
    includesAll(phase1Output, [`edit "${phase1Name}"`, `set proposal ${proposal}`, `set interface "${wanInterface}"`, `set remote-gw ${remoteGateway}`]),
    phase1Output.slice(0, 1200),
    `edit "${phase1Name}", proposal ${proposal}, interface ${wanInterface}, remote-gw ${remoteGateway}`
  );

  const phase2Output = commandText(findCommand(commands, (command) => command.template.includes("show vpn ipsec phase2-interface")) ?? { template: "", stdout: "", stderr: "", exitCode: null });
  push(
    "phase2",
    "Phase2 exists with selected proposal and selectors",
    includesAll(phase2Output, [`edit "${phase2Name}"`, `set phase1name "${phase1Name}"`, `set proposal ${proposal}`]) &&
      (localSubnet ? phase2Output.includes(cidrNetwork(localSubnet)) : true) &&
      (remoteSubnet ? phase2Output.includes(cidrNetwork(remoteSubnet)) : true),
    phase2Output.slice(0, 1200),
    `edit "${phase2Name}", phase1 ${phase1Name}, proposal ${proposal}, selectors ${localSubnet} -> ${remoteSubnet}`
  );

  const routeOutput = commandText(findCommand(commands, (command) => command.template.includes("routing-table")) ?? { template: "", stdout: "", stderr: "", exitCode: null });
  push(
    "static_route",
    createStaticRoute ? "Static route exists for remote subnet" : "Static route creation was disabled",
    createStaticRoute ? Boolean(remoteSubnet && routeOutput.includes(cidrNetwork(remoteSubnet)) && routeOutput.toLowerCase().includes(phase1Name.toLowerCase())) : true,
    createStaticRoute ? routeOutput.slice(0, 1000) : "createStaticRoute=false",
    createStaticRoute ? `${remoteSubnet} via ${phase1Name}` : "route intentionally not created"
  );

  const policyOutput = commandText(findCommand(commands, (command) => command.template.includes("show firewall policy")) ?? { template: "", stdout: "", stderr: "", exitCode: null });
  const natExpectation = natEnabled ? "set nat enable" : "set nat disable";
  const loggingExpectation = logTraffic ? "set logtraffic all" : "set logtraffic disable";
  push(
    "lan_to_vpn_policy",
    createFirewallPolicy ? "LAN-to-VPN firewall policy exists with expected fields" : "Firewall policy creation was disabled",
    createFirewallPolicy ? includesAll(policyOutput, [lanPolicyName, `set srcintf "${lanInterface}"`, `set dstintf "${phase1Name}"`, "set action accept", 'set schedule "always"', 'set service "ALL"', natExpectation, loggingExpectation]) : true,
    createFirewallPolicy ? policyOutput.slice(0, 1400) : "createFirewallPolicy=false",
    createFirewallPolicy ? `${lanPolicyName} ${lanInterface}->${phase1Name} nat=${natEnabled}` : "policies intentionally not created"
  );
  push(
    "vpn_to_lan_policy",
    createFirewallPolicy ? "VPN-to-LAN firewall policy exists with expected fields" : "Firewall policy creation was disabled",
    createFirewallPolicy ? includesAll(policyOutput, [vpnPolicyName, `set srcintf "${phase1Name}"`, `set dstintf "${lanInterface}"`, "set action accept", 'set schedule "always"', 'set service "ALL"', "set nat disable", loggingExpectation]) : true,
    createFirewallPolicy ? policyOutput.slice(0, 1400) : "createFirewallPolicy=false",
    createFirewallPolicy ? `${vpnPolicyName} ${phase1Name}->${lanInterface} nat=false` : "policies intentionally not created"
  );

  const tunnelOutput = commandText(findCommand(commands, (command) => command.template.includes("tunnel summary")) ?? { template: "", stdout: "", stderr: "", exitCode: null });
  push("tunnel_summary", "VPN tunnel summary references the phase1/tunnel", tunnelOutput.toLowerCase().includes(phase1Name.toLowerCase()), tunnelOutput.slice(0, 1000), phase1Name);

  const ok = checks.every((check) => check.ok);
  return {
    ok,
    actionType: "fortigate_guided_vpn_setup",
    summary: ok ? "FortiGate IPsec VPN post-execution verification passed." : "FortiGate IPsec VPN post-execution verification failed.",
    checks,
  };
}

export function verifyFortiGateExecution(actionType: ActionType, parameters: Record<string, unknown>, commands: CommandOutput[]) {
  for (const command of commands) assertNoFortiGateCliFailure(command);
  if (actionType === ActionType.fortigate_guided_vpn_setup) return verifyFortiGateGuidedVpn(parameters, commands);
  const interfaceActions = new Set<ActionType>([
    ActionType.fortigate_set_interface_alias,
    ActionType.fortigate_enable_interface,
    ActionType.fortigate_disable_interface,
    ActionType.fortigate_update_interface_ip,
  ]);
  if (interfaceActions.has(actionType)) {
    const verification = findCommand(commands, (command) => command.template === "verify interface full configuration");
    const evidence = verification ? commandText(verification) : "";
    const name = asText(parameters.name ?? parameters.interfaceName);
    const checks: FortiGateVerificationCheck[] = [{ id: "interface", label: "Target interface is present", ok: Boolean(name) && includesAll(evidence, [`edit \"${name}\"`]), evidence: evidence.slice(0, 1400), expected: name }];
    if (actionType === ActionType.fortigate_enable_interface) checks.push({ id: "status", label: "Interface is administratively enabled", ok: /\bset\s+status\s+up\b/i.test(evidence), evidence: evidence.slice(0, 1400), expected: "set status up" });
    if (actionType === ActionType.fortigate_disable_interface) checks.push({ id: "status", label: "Interface is administratively disabled", ok: /\bset\s+status\s+down\b/i.test(evidence), evidence: evidence.slice(0, 1400), expected: "set status down" });
    if (actionType === ActionType.fortigate_set_interface_alias) {
      const alias = asText(parameters.alias);
      checks.push({ id: "alias", label: "Interface alias matches", ok: Boolean(alias) && evidence.toLowerCase().includes(`set alias \"${alias.toLowerCase()}\"`), evidence: evidence.slice(0, 1400), expected: alias });
    }
    if (actionType === ActionType.fortigate_update_interface_ip) {
      const requested = asText(parameters.requestedIp ?? parameters.cidr ?? parameters.ip);
      const [ip, prefixText] = requested.split("/");
      const prefix = prefixText === undefined ? 32 : Number(prefixText);
      const maskNumber = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
      const subnetMask = [24, 16, 8, 0].map((shift) => String((maskNumber >>> shift) & 255)).join(".");
      const expected = `${ip} ${subnetMask}`;
      checks.push({ id: "ip", label: "Interface IPv4 address matches", ok: Boolean(ip) && includesAll(evidence, [`set ip ${expected}`]), evidence: evidence.slice(0, 1400), expected });
    }
    const ok = checks.every((check) => check.ok);
    return { ok, actionType: String(actionType), summary: ok ? "FortiGate interface post-execution verification passed." : "FortiGate interface post-execution verification failed.", checks } satisfies FortiGateVerificationResult;
  }
  return { ok: true, actionType: String(actionType), summary: "No write-action semantic verifier was required.", checks: [] } satisfies FortiGateVerificationResult;
}
