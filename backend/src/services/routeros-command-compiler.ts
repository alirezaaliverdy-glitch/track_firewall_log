import net from "node:net";
import { ActionType, AiRiskLevel } from "@prisma/client";
import { env } from "../config/env.js";
import type { MikroTikCommandSpec } from "../actions/mikrotik-action-catalog.js";
import type { RouterOsDialect } from "./routeros-version.service.js";

export type RouterOsCompiledAction = {
  commandSpecs: MikroTikCommandSpec[];
  normalizedParameters: Record<string, unknown>;
  warnings: string[];
  rollbackJson: Record<string, unknown>;
  riskLevel: AiRiskLevel;
  category: string;
  requiresBackup: boolean;
  requiresBreakGlass: boolean;
  lockoutSensitive: boolean;
  unsupported?: { code: "ROUTEROS_UNSUPPORTED_FEATURE"; message: string };
};

const MANAGED_COMMENT_PREFIX = "firewall-log-analyzer";
const SAFE_TEXT = /^[A-Za-z0-9_.:\/ -]{1,120}$/;
const SAFE_NAME = /^[A-Za-z0-9_.:-]{1,64}$/;
const SAFE_ID = /^\*?[A-Fa-f0-9]{1,16}$/;
const SAFE_DURATION = /^(\d+[smhdw]){1,4}$/;
const COMMON_RESERVED_OR_SERVICE_PORTS = new Set([
  21, 22, 23, 25, 53, 67, 68, 69, 80, 110, 123, 135, 137, 138, 139, 143,
  161, 389, 443, 445, 465, 514, 587, 636, 993, 995,
  1080, 1433, 1521, 1723, 1883, 2049, 2375, 2376, 3000, 3306, 3389, 5060,
  5432, 5672, 5900, 6379, 6443, 8080, 8291, 8728, 8729, 9200, 9300, 27017
]);
const SSH_PORT_RULE_COMMENT = "allow-new-ssh-port-from-ai-orchestrator";

function failParam(name: string): never {
  throw new Error(`${name} is invalid or missing.`);
}

function text(params: Record<string, unknown>, key: string, fallback?: string) {
  const value = typeof params[key] === "string" && String(params[key]).trim() ? String(params[key]).trim() : fallback;
  if (value === undefined) return undefined;
  if (/[\n\r;`]|[$][(]/.test(value)) throw new Error(`${key} contains unsafe characters.`);
  return value;
}

function safeText(params: Record<string, unknown>, key: string, fallback?: string) {
  const value = text(params, key, fallback);
  if (value !== undefined && !SAFE_TEXT.test(value)) throw new Error(`${key} contains unsupported characters.`);
  return value;
}

function safeName(params: Record<string, unknown>, key: string, fallback?: string) {
  const value = text(params, key, fallback);
  if (!value || !SAFE_NAME.test(value)) failParam(key);
  return value;
}

function ruleId(params: Record<string, unknown>, key = "ruleId") {
  const value = text(params, key);
  if (!value || !SAFE_ID.test(value)) failParam(key);
  return value;
}

function numberPort(params: Record<string, unknown>, key: string) {
  const port = Number(params[key]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) failParam(key);
  return port;
}

function address(params: Record<string, unknown>, key = "address") {
  const value = text(params, key) ?? text(params, "srcIp");
  if (!value) failParam(key);
  const [ip, prefix] = value.split("/");
  if (net.isIP(ip) !== 4) failParam(key);
  if (prefix !== undefined) {
    const parsed = Number(prefix);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 32 || String(parsed) !== prefix) failParam(key);
  }
  return value;
}

function cidr(params: Record<string, unknown>, key: string) {
  return address(params, key);
}

function bool(params: Record<string, unknown>, key: string, fallback = false) {
  return typeof params[key] === "boolean" ? params[key] as boolean : fallback;
}

function duration(params: Record<string, unknown>, key: string, fallback?: string) {
  const value = text(params, key, fallback);
  if (value !== undefined && !SAFE_DURATION.test(value)) throw new Error(`${key} must be a RouterOS duration such as 30m, 1h, or 1d.`);
  return value;
}

function quote(value: string | number | boolean) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function spec(input: Omit<MikroTikCommandSpec, "write"> & { write?: boolean }): MikroTikCommandSpec {
  return { ...input, write: input.write ?? true };
}

function managedComment(value: string) {
  const base = value.startsWith(MANAGED_COMMENT_PREFIX) ? value : `${MANAGED_COMMENT_PREFIX} ${value}`;
  return base.slice(0, 120);
}

function exactManagedFind(menu: string, id: string) {
  return `:local ids [${menu} find where .id=${quote(id)} comment~${quote(`^${MANAGED_COMMENT_PREFIX}`)}]; :if ([:len $ids] = 1) do=`;
}

function result(input: Omit<RouterOsCompiledAction, "commandSpecs" | "warnings" | "rollbackJson"> & {
  commandSpecs?: MikroTikCommandSpec[];
  warnings?: string[];
  rollbackJson?: Record<string, unknown>;
}): RouterOsCompiledAction {
  return {
    commandSpecs: input.commandSpecs ?? [],
    warnings: input.warnings ?? [],
    rollbackJson: input.rollbackJson ?? { type: "manual_review" },
    ...input
  };
}

export function compileRouterOsAction(input: {
  actionType: ActionType;
  parameters: Record<string, unknown>;
  riskLevel: AiRiskLevel;
  dialect?: RouterOsDialect;
}): RouterOsCompiledAction {
  const p = input.parameters;
  const actionType = input.actionType;

  switch (actionType) {
    case ActionType.mikrotik_daily_check: {
      const commands = ["/system resource print", "/system package print", "/interface print stats", "/ip service print", "/ip firewall filter print stats", "/ip firewall nat print", "/ip firewall address-list print", "/ip route print", "/ip dhcp-server lease print", "/interface wireguard print", "/ip ipsec active-peers print", "/log print where topics~\"account|system|firewall|ipsec|route|warning|error\""];
      return result({ category: "daily-check", riskLevel: AiRiskLevel.low, normalizedParameters: p, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: commands.map((command) => spec({ template: "mikrotik daily check", command, write: false, target: {}, rollbackSteps: [], warnings: [] })) });
    }
    case ActionType.mikrotik_list_filter_rules:
    case ActionType.mikrotik_search_filter_rules:
      return result({ category: "firewall", riskLevel: AiRiskLevel.low, normalizedParameters: p, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: [spec({ template: "/ip firewall filter print terse", command: "/ip firewall filter print terse", write: false, target: {}, rollbackSteps: [], warnings: [] })] });
    case ActionType.mikrotik_list_nat_rules:
      return result({ category: "nat", riskLevel: AiRiskLevel.low, normalizedParameters: p, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: [spec({ template: "/ip firewall nat print terse", command: "/ip firewall nat print terse", write: false, target: {}, rollbackSteps: [], warnings: [] })] });
    case ActionType.mikrotik_list_address_list:
      return result({ category: "address-list", riskLevel: AiRiskLevel.low, normalizedParameters: p, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: [spec({ template: "/ip firewall address-list print terse", command: "/ip firewall address-list print terse", write: false, target: {}, rollbackSteps: [], warnings: [] })] });
    case ActionType.mikrotik_list_ip_services:
    case ActionType.mikrotik_list_management_services:
      return result({ category: "management", riskLevel: AiRiskLevel.low, normalizedParameters: p, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: [spec({ template: "/ip service print terse", command: "/ip service print terse", write: false, target: {}, rollbackSteps: [], warnings: [] })] });
    case ActionType.mikrotik_list_interfaces:
    case ActionType.mikrotik_detect_wan_lan_candidates:
      return result({ category: "interfaces", riskLevel: AiRiskLevel.low, normalizedParameters: p, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: [spec({ template: "/interface print terse", command: "/interface print terse", write: false, target: {}, rollbackSteps: [], warnings: [] })] });
    case ActionType.mikrotik_list_routes:
      return result({ category: "routes", riskLevel: AiRiskLevel.low, normalizedParameters: p, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: [spec({ template: "/ip route print terse", command: "/ip route print terse", write: false, target: {}, rollbackSteps: [], warnings: [] })] });
    case ActionType.mikrotik_show_dns_settings:
      return result({ category: "dns-dhcp", riskLevel: AiRiskLevel.low, normalizedParameters: p, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: [spec({ template: "/ip dns print", command: "/ip dns print", write: false, target: {}, rollbackSteps: [], warnings: [] })] });
    case ActionType.mikrotik_list_dhcp_servers:
      return result({ category: "dns-dhcp", riskLevel: AiRiskLevel.low, normalizedParameters: p, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: [spec({ template: "/ip dhcp-server print terse", command: "/ip dhcp-server print terse", write: false, target: {}, rollbackSteps: [], warnings: [] })] });
    case ActionType.mikrotik_list_dhcp_leases:
      return result({ category: "dns-dhcp", riskLevel: AiRiskLevel.low, normalizedParameters: p, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: [spec({ template: "/ip dhcp-server lease print terse", command: "/ip dhcp-server lease print terse", write: false, target: {}, rollbackSteps: [], warnings: [] })] });
    case ActionType.mikrotik_show_clock:
      return result({ category: "system", riskLevel: AiRiskLevel.low, normalizedParameters: p, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: [spec({ template: "/system clock print", command: "/system clock print", write: false, target: {}, rollbackSteps: [], warnings: [] })] });
    case ActionType.mikrotik_show_logs:
    case ActionType.mikrotik_check_login_logs:
      return result({ category: "system", riskLevel: AiRiskLevel.low, normalizedParameters: p, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: [spec({ template: "/log print without-paging", command: "/log print without-paging", write: false, target: {}, rollbackSteps: [], warnings: [] })] });
    case ActionType.mikrotik_show_resources:
      return result({ category: "system", riskLevel: AiRiskLevel.low, normalizedParameters: p, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: [spec({ template: "/system resource print", command: "/system resource print", write: false, target: {}, rollbackSteps: [], warnings: [] })] });
  }

  if (actionType === ActionType.mikrotik_create_filter_rule || actionType === ActionType.mikrotik_create_managed_blocklist_rule) {
    const chain = safeName(p, "chain", "forward");
    const action = safeName(p, "action", "drop");
    const srcAddressList = text(p, "srcAddressList") ?? text(p, "listName");
    const srcAddress = text(p, "sourceCidr") ?? text(p, "sourceIp") ?? text(p, "srcAddress");
    const protocol = text(p, "protocol");
    const dstPort = p.dstPort ?? p.port;
    const comment = managedComment(safeText(p, "comment", "managed filter rule") ?? "managed filter rule");
    const disabled = bool(p, "disabled", true);
    const parts = [`/ip firewall filter add chain=${quote(chain)}`, `action=${quote(action)}`, `comment=${quote(comment)}`, `disabled=${disabled ? "yes" : "no"}`];
    if (srcAddressList) parts.push(`src-address-list=${quote(safeName({ srcAddressList }, "srcAddressList"))}`);
    if (srcAddress) parts.push(`src-address=${quote(cidr({ srcAddress }, "srcAddress"))}`);
    if (protocol) parts.push(`protocol=${quote(safeName({ protocol }, "protocol"))}`);
    if (dstPort) parts.push(`dst-port=${quote(numberPort({ dstPort }, "dstPort"))}`);
    const riskLevel = chain === "input" ? AiRiskLevel.high : AiRiskLevel.medium;
    return result({ category: "firewall", riskLevel, normalizedParameters: { chain, action, srcAddressList, sourceIp: text(p, "sourceIp") ?? null, sourceCidr: text(p, "sourceCidr") ?? null, protocol, dstPort, comment, disabled }, requiresBackup: true, requiresBreakGlass: false, lockoutSensitive: chain === "input", warnings: ["Created firewall filter rules are disabled by default unless explicitly requested."], commandSpecs: [spec({ template: "/ip firewall filter add ... disabled=yes", command: parts.join(" "), target: { chain, comment }, rollbackSteps: [`Remove only managed filter rule comment=${comment}.`], warnings: [] })], rollbackJson: { type: "remove_created_managed_filter_rule", comment } });
  }

  if (actionType === ActionType.mikrotik_create_dstnat_rule) {
    const dstPort = numberPort(p, "dstPort");
    const toAddress = address(p, "toAddress");
    const toPort = p.toPort ? numberPort(p, "toPort") : dstPort;
    const protocol = safeName(p, "protocol", "tcp");
    const comment = managedComment(safeText(p, "comment", "managed dstnat") ?? "managed dstnat");
    const command = `/ip firewall nat add chain="dstnat" protocol=${quote(protocol)} dst-port=${quote(dstPort)} action="dst-nat" to-addresses=${quote(toAddress)} to-ports=${quote(toPort)} comment=${quote(comment)} disabled=yes`;
    return result({ category: "nat", riskLevel: AiRiskLevel.medium, normalizedParameters: { dstPort, toAddress, toPort, protocol, comment, disabled: true }, requiresBackup: true, requiresBreakGlass: false, lockoutSensitive: false, warnings: ["DST-NAT rule is created disabled by default."], commandSpecs: [spec({ template: "/ip firewall nat add chain=dstnat ... disabled=yes", command, target: { dstPort, toAddress, toPort, comment }, rollbackSteps: [`Remove only managed NAT rule comment=${comment}.`], warnings: [] })], rollbackJson: { type: "remove_created_managed_nat_rule", comment } });
  }

  if (actionType === ActionType.mikrotik_create_srcnat_masquerade_rule) {
    const outInterface = safeName(p, "outInterface");
    const srcAddress = text(p, "srcAddress");
    const comment = managedComment(safeText(p, "comment", "managed masquerade") ?? "managed masquerade");
    const command = `/ip firewall nat add chain="srcnat" out-interface=${quote(outInterface)}${srcAddress ? ` src-address=${quote(cidr({ srcAddress }, "srcAddress"))}` : ""} action="masquerade" comment=${quote(comment)} disabled=yes`;
    return result({ category: "nat", riskLevel: AiRiskLevel.medium, normalizedParameters: { outInterface, srcAddress, comment, disabled: true }, requiresBackup: true, requiresBreakGlass: false, lockoutSensitive: false, warnings: ["Masquerade rule is created disabled by default."], commandSpecs: [spec({ template: "/ip firewall nat add chain=srcnat action=masquerade disabled=yes", command, target: { outInterface, comment }, rollbackSteps: [`Remove only managed NAT rule comment=${comment}.`], warnings: [] })], rollbackJson: { type: "remove_created_managed_nat_rule", comment } });
  }

  const managedRuleActions = new Set<ActionType>([ActionType.mikrotik_enable_filter_rule, ActionType.mikrotik_disable_filter_rule, ActionType.mikrotik_remove_managed_filter_rule, ActionType.mikrotik_enable_nat_rule, ActionType.mikrotik_disable_nat_rule, ActionType.mikrotik_remove_managed_nat_rule, ActionType.mikrotik_disable_rule_by_id, ActionType.mikrotik_remove_rule_by_id]);
  if (managedRuleActions.has(actionType)) {
    const id = ruleId(p);
    const natRuleActions = new Set<ActionType>([ActionType.mikrotik_enable_nat_rule, ActionType.mikrotik_disable_nat_rule, ActionType.mikrotik_remove_managed_nat_rule]);
    const isNat = natRuleActions.has(actionType);
    const menu = isNat ? "/ip firewall nat" : "/ip firewall filter";
    const verb = actionType.toString().includes("enable") ? "enable" : actionType.toString().includes("disable") ? "disable" : "remove";
    const critical = actionType === ActionType.mikrotik_disable_rule_by_id || actionType === ActionType.mikrotik_remove_rule_by_id;
    const command = `${exactManagedFind(menu, id)}{${menu} ${verb} $ids} else={:error "expected exactly one managed rule match"}`;
    return result({ category: isNat ? "nat" : "firewall", riskLevel: critical ? AiRiskLevel.critical : verb === "enable" ? AiRiskLevel.high : AiRiskLevel.medium, normalizedParameters: { ruleId: id, managedOnly: true }, requiresBackup: true, requiresBreakGlass: critical, lockoutSensitive: true, warnings: ["Only firewall-log-analyzer managed rules are eligible unless break-glass critical action is explicitly approved."], commandSpecs: [spec({ template: `${menu} ${verb} exact managed rule`, command, target: { ruleId: id, menu, verb }, rollbackSteps: [verb === "enable" ? `Disable same rule ${id}.` : verb === "disable" ? `Enable same rule ${id}.` : "Recreate removed rule manually from backup/export."], warnings: [] })], rollbackJson: { type: `${verb}_same_rule`, ruleId: id, menu } });
  }

  if (actionType === ActionType.mikrotik_set_filter_rule_comment || actionType === ActionType.mikrotik_set_nat_rule_comment || actionType === ActionType.mikrotik_add_comment_to_rule) {
    const id = ruleId(p);
    const comment = safeText(p, "comment") ?? failParam("comment");
    const menu = actionType === ActionType.mikrotik_set_nat_rule_comment ? "/ip firewall nat" : "/ip firewall filter";
    const command = `:local ids [${menu} find where .id=${quote(id)}]; :if ([:len $ids] = 1) do={${menu} set $ids comment=${quote(comment)}} else={:error "expected exactly one rule match"}`;
    return result({ category: menu.includes("nat") ? "nat" : "firewall", riskLevel: AiRiskLevel.low, normalizedParameters: { ruleId: id, comment }, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: [spec({ template: `${menu} set exact rule comment=<comment>`, command, target: { ruleId: id, comment }, rollbackSteps: ["Restore previous comment from audit/export if needed."], warnings: [] })], rollbackJson: { type: "restore_previous_comment_manual", ruleId: id } });
  }

  const serviceActions = new Set<ActionType>([ActionType.mikrotik_disable_unused_service, ActionType.mikrotik_restrict_service_by_address, ActionType.mikrotik_change_service_port, ActionType.mikrotik_enable_service, ActionType.mikrotik_disable_service]);
  if (serviceActions.has(actionType)) {
    const service = safeName(p, "service");
    const addressValue = text(p, "address");
    const port = p.newPort !== undefined ? numberPort(p, "newPort") : p.port !== undefined ? numberPort(p, "port") : undefined;
    if (actionType === ActionType.mikrotik_change_service_port && service === "ssh") {
      const newPort = port ?? failParam("newPort");
      if (newPort < 1) throw new Error("newPort must be between 1 and 65535.");
      if (COMMON_RESERVED_OR_SERVICE_PORTS.has(newPort)) throw new Error(`newPort ${newPort} is reserved for a common management or application service.`);
      if (!p.trustedSourceCidr && !p.trustedSourceIp && !p.trustedSource) {
        throw new Error("Allowed source is required for SSH management changes.");
      }
      const trustedSource = cidr({
        address: p.trustedSourceCidr ?? p.trustedSourceIp ?? p.trustedSource
      }, "address");
      if (trustedSource === "0.0.0.0/0" && !(env.actionExecutionMode === "quick_controlled" && env.actionAllowLabUnrestrictedManagement && p.trustedSourceAutoResolved === true)) {
        throw new Error("trusted source must not allow every IPv4 address.");
      }
      const oldPortValue = p.oldPort === undefined || p.oldPort === null ? undefined : numberPort(p, "oldPort");
      if (oldPortValue === newPort) throw new Error("newPort must be different from the detected old SSH port.");

      const ensureRule = `:if ([:len [/ip firewall filter find where chain="input" action="accept" protocol="tcp" src-address=${quote(trustedSource)} dst-port=${newPort} comment=${quote(SSH_PORT_RULE_COMMENT)}]] = 0) do={/ip firewall filter add chain="input" action="accept" protocol="tcp" src-address=${quote(trustedSource)} dst-port=${newPort} comment=${quote(SSH_PORT_RULE_COMMENT)}}`;
      const changePort = `/ip service set [find where name="ssh"] port=${newPort}`;
      const verify = "/ip service print where name=ssh";
      const rollbackSteps = [
        ...(oldPortValue ? [`Restore SSH with /ip service set [find where name=\"ssh\"] port=${oldPortValue}.`] : ["Old SSH port was not detected; verify the previous port before attempting rollback."]),
        `Optionally remove the firewall rule whose exact comment is ${SSH_PORT_RULE_COMMENT}.`
      ];

      return result({
        category: "management",
        riskLevel: AiRiskLevel.high,
        normalizedParameters: {
          service: "ssh",
          newPort,
          port: newPort,
          trustedSource,
          trustedSourceIp: p.trustedSourceIp ?? null,
          trustedSourceCidr: p.trustedSourceCidr ?? null,
          oldPort: oldPortValue ?? null,
          firewallRuleComment: SSH_PORT_RULE_COMMENT
        },
        requiresBackup: true,
        requiresBreakGlass: false,
        lockoutSensitive: true,
        warnings: [
          "Changing the MikroTik SSH service port can lock out administrators. Keep the current session open and verify alternate access.",
          ...(oldPortValue ? [] : ["Old SSH port could not be detected; automatic rollback is not available."])
        ],
        commandSpecs: [
          spec({
            template: "/ip firewall filter ensure accept tcp from <trustedSource> to <newPort>",
            command: ensureRule,
            target: { trustedSource, newPort, comment: SSH_PORT_RULE_COMMENT },
            rollbackSteps: [`Remove the exact firewall rule with comment=${SSH_PORT_RULE_COMMENT} if it was created by this action.`],
            warnings: []
          }),
          spec({
            template: "/ip service set [find where name=ssh] port=<newPort>",
            command: changePort,
            target: { service: "ssh", oldPort: oldPortValue ?? null, newPort },
            rollbackSteps,
            warnings: []
          }),
          spec({
            template: "/ip service print where name=ssh",
            command: verify,
            write: false,
            target: { service: "ssh", expectedPort: newPort },
            rollbackSteps: [],
            warnings: []
          })
        ],
        rollbackJson: {
          type: "restore_mikrotik_ssh_port",
          oldPort: oldPortValue ?? null,
          newPort,
          trustedSource,
          firewallRuleComment: SSH_PORT_RULE_COMMENT,
          oldPortDetected: oldPortValue !== undefined,
          steps: rollbackSteps
        }
      });
    }
    let command = "";
    if (actionType === ActionType.mikrotik_restrict_service_by_address) command = `/ip service set [find where name=${quote(service)}] address=${quote(cidr({ address: addressValue }, "address"))}`;
    else if (actionType === ActionType.mikrotik_change_service_port) command = `/ip service set [find where name=${quote(service)}] port=${quote(port ?? failParam("port"))}`;
    else command = `/ip service ${actionType === ActionType.mikrotik_enable_service ? "enable" : "disable"} [find where name=${quote(service)}]`;
    const sensitive = ["ssh", "winbox", "api", "api-ssl"].includes(service);
    return result({ category: "management", riskLevel: sensitive || actionType === ActionType.mikrotik_change_service_port ? AiRiskLevel.high : AiRiskLevel.medium, normalizedParameters: { service, address: addressValue, port }, requiresBackup: true, requiresBreakGlass: service === "ssh" && actionType === ActionType.mikrotik_disable_service, lockoutSensitive: sensitive, warnings: sensitive ? ["Management service change may lock out administrators."] : [], commandSpecs: [spec({ template: "/ip service controlled update", command, target: { service, address: addressValue, port }, rollbackSteps: ["Restore service state from backup/export if needed."], warnings: [] })], rollbackJson: { type: "restore_service_state_manual", service } });
  }

  const interfaceActions = new Set<ActionType>([ActionType.mikrotik_enable_interface, ActionType.mikrotik_disable_interface, ActionType.mikrotik_set_interface_comment]);
  if (interfaceActions.has(actionType)) {
    const iface = safeName(p, "interfaceName");
    const command = actionType === ActionType.mikrotik_set_interface_comment
      ? `/interface set [find where name=${quote(iface)}] comment=${quote(safeText(p, "comment") ?? failParam("comment"))}`
      : `/interface ${actionType === ActionType.mikrotik_enable_interface ? "enable" : "disable"} [find where name=${quote(iface)}]`;
    const disable = actionType === ActionType.mikrotik_disable_interface;
    return result({ category: "interfaces", riskLevel: disable ? AiRiskLevel.critical : AiRiskLevel.medium, normalizedParameters: { interfaceName: iface, comment: text(p, "comment") }, requiresBackup: true, requiresBreakGlass: disable, lockoutSensitive: disable, warnings: disable ? ["Disabling interfaces is critical and can cause lockout."] : [], commandSpecs: [spec({ template: "/interface controlled update", command, target: { interfaceName: iface }, rollbackSteps: [disable ? `Enable interface ${iface}.` : "Restore previous interface state/comment from backup/export."], warnings: [] })], rollbackJson: { type: disable ? "enable_interface" : "manual_restore_interface", interfaceName: iface } });
  }

  const routeActions = new Set<ActionType>([ActionType.mikrotik_add_static_route, ActionType.mikrotik_disable_static_route, ActionType.mikrotik_remove_managed_static_route]);
  if (routeActions.has(actionType)) {
    if (actionType === ActionType.mikrotik_add_static_route) {
      const dstAddress = cidr(p, "dstAddress");
      const gateway = address(p, "gateway");
      const comment = managedComment(safeText(p, "comment", "managed static route") ?? "managed static route");
      const command = `/ip route add dst-address=${quote(dstAddress)} gateway=${quote(gateway)} comment=${quote(comment)} disabled=yes`;
      return result({ category: "routes", riskLevel: AiRiskLevel.high, normalizedParameters: { dstAddress, gateway, comment, disabled: true }, requiresBackup: true, requiresBreakGlass: false, lockoutSensitive: true, warnings: ["Static route is created disabled by default."], commandSpecs: [spec({ template: "/ip route add ... disabled=yes", command, target: { dstAddress, gateway, comment }, rollbackSteps: [`Remove managed static route comment=${comment}.`], warnings: [] })], rollbackJson: { type: "remove_created_managed_static_route", comment } });
    }
    const id = ruleId(p, "routeId");
    const verb = actionType === ActionType.mikrotik_disable_static_route ? "disable" : "remove";
    const command = `:local ids [/ip route find where .id=${quote(id)} comment~${quote(`^${MANAGED_COMMENT_PREFIX}`)}]; :if ([:len $ids] = 1) do={/ip route ${verb} $ids} else={:error "expected exactly one managed route match"}`;
    return result({ category: "routes", riskLevel: AiRiskLevel.high, normalizedParameters: { routeId: id }, requiresBackup: true, requiresBreakGlass: false, lockoutSensitive: true, commandSpecs: [spec({ template: `/ip route ${verb} exact managed route`, command, target: { routeId: id }, rollbackSteps: [verb === "disable" ? `Enable route ${id}.` : "Recreate route from backup/export if needed."], warnings: [] })], rollbackJson: { type: `${verb}_same_route`, routeId: id } });
  }

  if (actionType === ActionType.mikrotik_set_dns_servers) {
    const servers = Array.isArray(p.servers) ? p.servers.map(String) : String(p.servers ?? "").split(",");
    const safeServers = servers.map((item) => item.trim()).filter(Boolean);
    if (safeServers.length === 0 || safeServers.some((item) => net.isIP(item) === 0)) failParam("servers");
    const command = `/ip dns set servers=${quote(safeServers.join(","))}`;
    return result({ category: "dns-dhcp", riskLevel: AiRiskLevel.medium, normalizedParameters: { servers: safeServers }, requiresBackup: true, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: [spec({ template: "/ip dns set servers=<servers>", command, target: { servers: safeServers }, rollbackSteps: ["Restore previous DNS servers from backup/export."], warnings: [] })], rollbackJson: { type: "restore_dns_servers_manual" } });
  }

  const dhcpLeaseActions = new Set<ActionType>([ActionType.mikrotik_add_static_dhcp_lease, ActionType.mikrotik_remove_static_dhcp_lease]);
  if (dhcpLeaseActions.has(actionType)) {
    if (actionType === ActionType.mikrotik_add_static_dhcp_lease) {
      const macAddress = text(p, "macAddress") ?? failParam("macAddress");
      if (!/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(macAddress)) failParam("macAddress");
      const ip = address(p);
      const comment = managedComment(safeText(p, "comment", "managed dhcp lease") ?? "managed dhcp lease");
      const command = `/ip dhcp-server lease add mac-address=${quote(macAddress)} address=${quote(ip)} comment=${quote(comment)}`;
      return result({ category: "dns-dhcp", riskLevel: AiRiskLevel.medium, normalizedParameters: { macAddress, address: ip, comment }, requiresBackup: true, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: [spec({ template: "/ip dhcp-server lease add mac-address=<mac> address=<address>", command, target: { macAddress, address: ip }, rollbackSteps: [`Remove managed DHCP lease comment=${comment}.`], warnings: [] })], rollbackJson: { type: "remove_static_dhcp_lease", macAddress, address: ip } });
    }
    const leaseId = ruleId(p, "leaseId");
    const command = `:local ids [/ip dhcp-server lease find where .id=${quote(leaseId)} dynamic=no]; :if ([:len $ids] = 1) do={/ip dhcp-server lease remove $ids} else={:error "expected exactly one static lease match"}`;
    return result({ category: "dns-dhcp", riskLevel: AiRiskLevel.medium, normalizedParameters: { leaseId }, requiresBackup: true, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: [spec({ template: "/ip dhcp-server lease remove exact static lease", command, target: { leaseId }, rollbackSteps: ["Recreate static lease from backup/export if needed."], warnings: [] })], rollbackJson: { type: "recreate_static_lease_manual", leaseId } });
  }

  const backupActions = new Set<ActionType>([ActionType.mikrotik_create_backup, ActionType.mikrotik_create_export_sanitized]);
  if (backupActions.has(actionType)) {
    const name = safeName(p, "name", `firewall-log-analyzer-${Date.now()}`);
    const backup = actionType === ActionType.mikrotik_create_backup;
    const command = backup ? `/system backup save name=${quote(name)}` : `/export hide-sensitive file=${quote(name)}`;
    return result({ category: "system", riskLevel: AiRiskLevel.low, normalizedParameters: { name }, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: [spec({ template: backup ? "/system backup save name=<name>" : "/export hide-sensitive file=<name>", command, target: { name }, rollbackSteps: [], warnings: [] })], rollbackJson: { type: "none_backup_artifact", name } });
  }

  if (actionType === ActionType.mikrotik_set_identity) {
    const name = safeText(p, "name") ?? failParam("name");
    const command = `/system identity set name=${quote(name)}`;
    return result({ category: "system", riskLevel: AiRiskLevel.medium, normalizedParameters: { name }, requiresBackup: true, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: [spec({ template: "/system identity set name=<name>", command, target: { name }, rollbackSteps: ["Restore previous identity from backup/export."], warnings: [] })], rollbackJson: { type: "restore_identity_manual" } });
  }

  const rebootActions = new Set<ActionType>([ActionType.mikrotik_reboot, ActionType.mikrotik_schedule_reboot]);
  if (rebootActions.has(actionType)) {
    const schedule = actionType === ActionType.mikrotik_schedule_reboot;
    const delay = duration(p, "delay", "5m");
    const command = schedule ? `/system scheduler add name=${quote(`firewall-log-analyzer-reboot-${Date.now()}`)} start-time=startup interval=0 on-event=${quote(`/system reboot`)} disabled=yes` : "/system reboot";
    return result({ category: "system", riskLevel: AiRiskLevel.critical, normalizedParameters: { delay }, requiresBackup: true, requiresBreakGlass: true, lockoutSensitive: true, warnings: ["Reboot is critical and requires break-glass."], commandSpecs: [spec({ template: schedule ? "/system scheduler add disabled reboot job" : "/system reboot", command, target: { delay }, rollbackSteps: schedule ? ["Remove scheduled reboot job before enabling/running it."] : [], warnings: [] })], rollbackJson: { type: schedule ? "remove_scheduled_reboot" : "none_reboot" } });
  }

  throw new Error("ROUTEROS_UNSUPPORTED_FEATURE");
}
