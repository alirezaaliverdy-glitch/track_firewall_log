import net from "node:net";
import { ActionType, AiRiskLevel } from "@prisma/client";
import type { FortiOsDialect } from "./fortigate-version.service.js";

export type FortiGateCommandSpec = {
  template: string;
  command: string;
  write: boolean;
  target: Record<string, unknown>;
  rollbackSteps: string[];
  warnings: string[];
};

export type FortiGateCompiledAction = {
  commandSpecs: FortiGateCommandSpec[];
  normalizedParameters: Record<string, unknown>;
  warnings: string[];
  rollbackJson: Record<string, unknown>;
  riskLevel: AiRiskLevel;
  category: string;
  requiresBackup: boolean;
  requiresBreakGlass: boolean;
  lockoutSensitive: boolean;
};

const MANAGED_PREFIX = "firewall-log-analyzer";
const SAFE_NAME = /^[A-Za-z0-9_.:-]{1,79}$/;
const SAFE_TEXT = /^[A-Za-z0-9_.:\/,@#() +*-]{1,180}$/;
const SAFE_ID = /^[0-9]{1,10}$/;
const RAW_KEYS = new Set(["command", "cmd", "shell", "script", "exec", "args", "cli", "rawCli"]);
const BUILT_IN_SERVICES = new Set(["ALL", "HTTP", "HTTPS", "SSH", "DNS", "PING", "FTP", "SMTP", "POP3", "IMAP", "LDAP", "RDP", "TELNET", "SNMP"]);

function fail(name: string): never {
  throw new Error(`${name} is invalid or missing.`);
}

function rejectUnsafe(value: string, key: string) {
  if (/[\n\r;`|&]|[$][(]|\\$/.test(value)) throw new Error(`${key} contains unsafe characters.`);
  return value;
}

function text(params: Record<string, unknown>, key: string, fallback?: string) {
  const value = typeof params[key] === "string" && String(params[key]).trim() ? String(params[key]).trim() : fallback;
  return value === undefined ? undefined : rejectUnsafe(value, key);
}

function safeName(params: Record<string, unknown>, key: string, fallback?: string) {
  const value = text(params, key, fallback);
  if (!value || !SAFE_NAME.test(value)) fail(key);
  return value;
}

function safeOptionalName(params: Record<string, unknown>, key: string) {
  const value = text(params, key);
  if (value !== undefined && !SAFE_NAME.test(value)) fail(key);
  return value;
}

function safeText(params: Record<string, unknown>, key: string, fallback?: string) {
  const value = text(params, key, fallback);
  if (value !== undefined && !SAFE_TEXT.test(value)) throw new Error(`${key} contains unsupported characters.`);
  return value;
}

function arrayNames(params: Record<string, unknown>, key: string, fallback?: string[]) {
  const raw = Array.isArray(params[key]) ? params[key] : typeof params[key] === "string" ? String(params[key]).split(",") : fallback ?? [];
  const values = raw.map((item) => safeName({ value: String(item).trim() }, "value")).filter(Boolean);
  if (values.length === 0) fail(key);
  return values;
}

function policyId(params: Record<string, unknown>, key = "policyId") {
  const value = text(params, key);
  if (!value || !SAFE_ID.test(value)) fail(key);
  return value;
}

function port(params: Record<string, unknown>, key: string) {
  const value = Number(params[key]);
  if (!Number.isInteger(value) || value < 1 || value > 65535) fail(key);
  return value;
}

function portList(params: Record<string, unknown>, key: string) {
  const raw = Array.isArray(params[key]) ? params[key].join(",") : String(params[key] ?? "").trim();
  if (!raw) fail(key);
  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) fail(key);
  for (const part of parts) {
    const [start, end] = part.split("-");
    const a = Number(start);
    const b = end === undefined ? a : Number(end);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < 1 || a > 65535 || b > 65535 || a > b) fail(key);
  }
  return parts.join(",");
}

function ipv4(value: string, key: string) {
  if (net.isIP(value) !== 4) fail(key);
  return value;
}

function cidrOrIp(params: Record<string, unknown>, key: string) {
  const value = text(params, key) ?? fail(key);
  const [ip, prefix] = value.split("/");
  ipv4(ip, key);
  if (prefix !== undefined) {
    const n = Number(prefix);
    if (!Number.isInteger(n) || n < 0 || n > 32 || String(n) !== prefix) fail(key);
  }
  return value;
}

function subnet(params: Record<string, unknown>) {
  const cidr = text(params, "sourceCidr") ?? text(params, "cidr") ?? text(params, "sourceIp") ?? text(params, "ip") ?? text(params, "address");
  if (!cidr) fail("cidr");
  const [ip, prefix] = cidr.split("/");
  ipv4(ip, "cidr");
  const bits = prefix === undefined ? 32 : Number(prefix);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) fail("cidr");
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return `${ip} ${[24, 16, 8, 0].map((shift) => (mask >>> shift) & 255).join(".")}`;
}

function fqdn(params: Record<string, unknown>) {
  const value = text(params, "fqdn") ?? text(params, "domain") ?? fail("fqdn");
  if (!/^\*?(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,63}$/.test(value)) fail("fqdn");
  return value;
}

function ipRange(params: Record<string, unknown>) {
  const start = ipv4(text(params, "startIp") ?? text(params, "start") ?? fail("startIp"), "startIp");
  const end = ipv4(text(params, "endIp") ?? text(params, "end") ?? fail("endIp"), "endIp");
  return { start, end };
}

function requireFeature(condition: boolean | undefined, code = "FORTIGATE_UNSUPPORTED_FEATURE") {
  if (condition === false) throw new Error(code);
}

function assertNotBuiltinService(name: string) {
  if (BUILT_IN_SERVICES.has(name.toUpperCase())) throw new Error("Built-in FortiGate services cannot be overwritten or deleted.");
}

function quote(value: string | number | boolean) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function block(lines: string[]) {
  return lines.join("\n");
}

function spec(input: Omit<FortiGateCommandSpec, "write"> & { write?: boolean }): FortiGateCommandSpec {
  return { ...input, write: input.write ?? true };
}

function managedComment(comment?: string) {
  const value = comment?.startsWith(MANAGED_PREFIX) ? comment : `${MANAGED_PREFIX} ${comment ?? "managed fortigate change"}`;
  return value.slice(0, 180);
}

function result(input: Omit<FortiGateCompiledAction, "commandSpecs" | "warnings" | "rollbackJson"> & {
  commandSpecs?: FortiGateCommandSpec[];
  warnings?: string[];
  rollbackJson?: Record<string, unknown>;
}): FortiGateCompiledAction {
  return {
    commandSpecs: input.commandSpecs ?? [],
    warnings: input.warnings ?? [],
    rollbackJson: input.rollbackJson ?? { type: "manual_review" },
    ...input
  };
}

function readOnly(command: string, category: string) {
  return result({
    category,
    riskLevel: AiRiskLevel.low,
    normalizedParameters: {},
    requiresBackup: false,
    requiresBreakGlass: false,
    lockoutSensitive: false,
    commandSpecs: [spec({ template: command, command, write: false, target: {}, rollbackSteps: [], warnings: [] })],
    rollbackJson: { type: "none_read_only" }
  });
}

function withVdom(command: string, vdom?: string) {
  if (!vdom) return command;
  return block(["config vdom", `edit ${quote(vdom)}`, command, "end"]);
}

export function compileFortiGateAction(input: {
  actionType: ActionType;
  parameters: Record<string, unknown>;
  riskLevel: AiRiskLevel;
  dialect?: FortiOsDialect;
}): FortiGateCompiledAction {
  const p = input.parameters;
  for (const key of Object.keys(p)) if (RAW_KEYS.has(key)) throw new Error("Raw CLI parameters are not allowed.");
  const actionType = input.actionType;
  const vdom = safeOptionalName(p, "vdom");
  if (p.vdomRequired === true && !vdom) throw new Error("FORTIGATE_VDOM_REQUIRED");

  if (actionType === ActionType.fortigate_daily_check) {
    const commands = ["get system status", "get system performance status", "diagnose sys top-summary", "show system interface", "get router info routing-table all", "get system dns", "show system fortiguard", "show system admin"];
    return result({ category: "daily-check", riskLevel: AiRiskLevel.low, normalizedParameters: {}, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: commands.map((command) => spec({ template: `fortigate daily check: ${command}`, command, write: false, target: {}, rollbackSteps: [], warnings: [] })) });
  }

  if (actionType === ActionType.fortigate_list_admins) return readOnly("show system admin", "management");
  if (actionType === ActionType.fortigate_list_zones) return readOnly("show system zone", "zone");
  if (actionType === ActionType.fortigate_list_interfaces) return readOnly("show system interface", "interface");
  if (actionType === ActionType.fortigate_list_policies) return readOnly("show firewall policy", "policy");
  if (actionType === ActionType.fortigate_list_address_objects) return readOnly("show firewall address", "address");
  if (actionType === ActionType.fortigate_list_routes) return readOnly("get router info routing-table all", "route");
  if (actionType === ActionType.fortigate_show_logs) return readOnly("execute log display", "system");
  if (actionType === ActionType.fortigate_show_sessions) return readOnly("diagnose sys session list", "system");

  if (actionType === ActionType.fortigate_create_static_route) {
    const destinationCidr = cidrOrIp({ destinationCidr: p.destinationCidr ?? p.dstCidr ?? p.destination }, "destinationCidr");
    const gateway = ipv4(text(p, "gateway") ?? fail("gateway"), "gateway");
    const device = safeOptionalName(p, "device") ?? safeOptionalName(p, "dstInterface");
    const lines = ["config router static", "edit 0", `set dst ${quote(destinationCidr)}`, `set gateway ${quote(gateway)}`];
    if (device) lines.push(`set device ${quote(device)}`);
    lines.push("next", "end");
    return result({
      category: "route", riskLevel: AiRiskLevel.high, normalizedParameters: { destinationCidr, gateway, device: device ?? null },
      requiresBackup: true, requiresBreakGlass: false, lockoutSensitive: true,
      warnings: ["Static route changes can alter the management path and require backup preflight."],
      commandSpecs: [spec({ template: "config router static/edit 0/set dst/gateway", command: block(lines), target: { destinationCidr, gateway, device: device ?? null }, rollbackSteps: ["Remove the created managed route using its audited route ID."], warnings: [] })],
      rollbackJson: { type: "remove_created_static_route", destinationCidr, gateway }
    });
  }

  if (actionType === ActionType.fortigate_backup_config || actionType === ActionType.fortigate_export_sanitized_config) {
    const command = actionType === ActionType.fortigate_backup_config ? "show full-configuration" : "show";
    return result({
      category: "system",
      riskLevel: AiRiskLevel.low,
      normalizedParameters: { vdom },
      requiresBackup: false,
      requiresBreakGlass: false,
      lockoutSensitive: false,
      commandSpecs: [spec({ template: command, command: withVdom(command, vdom), write: false, target: { vdom }, rollbackSteps: [], warnings: [] })],
      rollbackJson: { type: "none_export" }
    });
  }

  if (actionType === ActionType.fortigate_create_zone || actionType === ActionType.fortigate_add_interface_to_zone || actionType === ActionType.fortigate_remove_interface_from_zone) {
    const name = safeName(p, "name", text(p, "zoneName"));
    const interfaces = arrayNames(p, "interfaces", safeOptionalName(p, "interfaceName") ? [safeName(p, "interfaceName")] : undefined);
    const verb = actionType === ActionType.fortigate_add_interface_to_zone ? "append" : actionType === ActionType.fortigate_remove_interface_from_zone ? "unselect" : "set";
    const command = withVdom(block(["config system zone", `edit ${quote(name)}`, `${verb} interface ${interfaces.map(quote).join(" ")}`, `set intrazone ${p.intrazone === "allow" ? "allow" : "deny"}`, `set description ${quote(managedComment(safeText(p, "comment", "managed zone")))}`, "next", "end"]), vdom);
    return result({ category: "zone", riskLevel: AiRiskLevel.high, normalizedParameters: { name, interfaces, vdom }, requiresBackup: true, requiresBreakGlass: false, lockoutSensitive: true, warnings: ["Zone changes are high risk and may affect policy matching."], commandSpecs: [spec({ template: `config system zone/${verb} interface`, command, target: { name, interfaces, vdom }, rollbackSteps: ["Restore previous zone interface membership from backup/export."], warnings: [] })], rollbackJson: { type: "restore_zone_membership_manual", name, vdom } });
  }

  if (actionType === ActionType.fortigate_delete_managed_zone) {
    const name = safeName(p, "name", text(p, "zoneName"));
    const critical = p.managed === false || p.breakGlass === true;
    const command = withVdom(block(["config system zone", `delete ${quote(name)}`, "end"]), vdom);
    return result({ category: "zone", riskLevel: critical ? AiRiskLevel.critical : AiRiskLevel.high, normalizedParameters: { name, vdom, managedOnly: true }, requiresBackup: true, requiresBreakGlass: critical, lockoutSensitive: true, warnings: ["Deleting zones is high risk. Non-managed zone deletion requires break-glass."], commandSpecs: [spec({ template: "config system zone/delete <managed-zone>", command, target: { name, vdom }, rollbackSteps: ["Recreate zone and memberships from backup/export."], warnings: [] })], rollbackJson: { type: "recreate_deleted_zone_manual", name, vdom } });
  }

  if (new Set<ActionType>([ActionType.fortigate_set_interface_alias, ActionType.fortigate_set_interface_role, ActionType.fortigate_enable_interface, ActionType.fortigate_disable_interface, ActionType.fortigate_update_interface_ip]).has(actionType)) {
    const name = safeName(p, "name", text(p, "interfaceName"));
    const lines = ["config system interface", `edit ${quote(name)}`];
    let rollback = "Restore previous interface settings from backup/export.";
    let riskLevel: AiRiskLevel = AiRiskLevel.high;
    let requiresBreakGlass = false;
    if (actionType === ActionType.fortigate_set_interface_alias) lines.push(`set alias ${quote(safeText(p, "alias") ?? fail("alias"))}`);
    if (actionType === ActionType.fortigate_set_interface_role) lines.push(`set role ${safeName(p, "role")}`);
    if (actionType === ActionType.fortigate_enable_interface) lines.push("set status up");
    if (actionType === ActionType.fortigate_disable_interface) {
      lines.push("set status down");
      riskLevel = AiRiskLevel.critical;
      requiresBreakGlass = true;
      rollback = `set interface ${name} status up`;
    }
    if (actionType === ActionType.fortigate_update_interface_ip) {
      lines.push(`set ip ${subnet({ cidr: text(p, "cidr") ?? text(p, "ip") ?? fail("ip") })}`);
      requiresBreakGlass = p.managementFacing === true || p.lockoutRisk === true;
      riskLevel = requiresBreakGlass ? AiRiskLevel.critical : AiRiskLevel.high;
    }
    lines.push("next", "end");
    return result({ category: "interface", riskLevel, normalizedParameters: { name, vdom, managementFacing: p.managementFacing === true }, requiresBackup: true, requiresBreakGlass, lockoutSensitive: true, warnings: ["Interface changes can cause connectivity loss. Verify alternate access."], commandSpecs: [spec({ template: "config system interface/edit <name>/controlled update", command: withVdom(block(lines), vdom), target: { name, vdom }, rollbackSteps: [rollback], warnings: [] })], rollbackJson: { type: "restore_interface_manual", name, vdom } });
  }

  if (actionType === ActionType.fortigate_create_vlan_interface) {
    const name = safeName(p, "name", text(p, "interfaceName"));
    const parent = safeName(p, "parent", text(p, "parentInterface"));
    const vlanId = Number(p.vlanId);
    if (!Number.isInteger(vlanId) || vlanId < 1 || vlanId > 4094) fail("vlanId");
    const command = withVdom(block(["config system interface", `edit ${quote(name)}`, "set type vlan", `set interface ${quote(parent)}`, `set vlanid ${vlanId}`, ...(text(p, "ip") || text(p, "cidr") ? [`set ip ${subnet({ cidr: text(p, "cidr") ?? text(p, "ip") })}`] : []), `set alias ${quote(managedComment(safeText(p, "comment", "managed vlan interface")))}`, "next", "end"]), vdom);
    return result({ category: "interface", riskLevel: AiRiskLevel.high, normalizedParameters: { name, parent, vlanId, vdom }, requiresBackup: true, requiresBreakGlass: false, lockoutSensitive: true, warnings: ["VLAN interface creation is high risk and requires backup preflight."], commandSpecs: [spec({ template: "config system interface/edit <vlan>/set type vlan", command, target: { name, parent, vlanId, vdom }, rollbackSteps: [`delete VLAN interface ${name}`], warnings: [] })], rollbackJson: { type: "delete_created_vlan_interface", name, vdom } });
  }

  if (actionType === ActionType.fortigate_create_address_object || actionType === ActionType.fortigate_update_address_object) {
    const name = safeName(p, "name", text(p, "addressObjectName"));
    const comment = managedComment(safeText(p, "comment", "managed address object"));
    const type = safeName(p, "type", text(p, "addressType") ?? (text(p, "fqdn") ? "fqdn" : text(p, "startIp") ? "iprange" : text(p, "geo") ? "geography" : "subnet")).toLowerCase();
    const lines = ["config firewall address", `edit ${quote(name)}`];
    if (type === "subnet") lines.push(`set subnet ${subnet(p)}`);
    else if (type === "iprange") {
      const range = ipRange(p);
      lines.push("set type iprange", `set start-ip ${range.start}`, `set end-ip ${range.end}`);
    } else if (type === "fqdn" || type === "wildcard-fqdn") {
      requireFeature(type !== "wildcard-fqdn" || input.dialect?.features.wildcardFqdn !== false);
      lines.push(`set type ${type}`, `set fqdn ${quote(fqdn(p))}`);
    } else if (type === "geography") {
      requireFeature(input.dialect?.features.geoAddress !== false);
      lines.push("set type geography", `set country ${quote(safeName(p, "geo", text(p, "country")))}`);
    } else {
      fail("type");
    }
    lines.push(`set comment ${quote(comment)}`, "next", "end");
    const command = withVdom(block(lines), vdom);
    return result({
      category: "address",
      riskLevel: AiRiskLevel.low,
      normalizedParameters: { name, type, comment, vdom },
      requiresBackup: false,
      requiresBreakGlass: false,
      lockoutSensitive: false,
      commandSpecs: [spec({ template: "config firewall address/edit <name>/set subnet <subnet>", command, target: { name, vdom }, rollbackSteps: [`delete managed address object ${name}`], warnings: [] })],
      rollbackJson: { type: "delete_created_address_object", name, vdom }
    });
  }

  if (actionType === ActionType.fortigate_delete_managed_address_object) {
    const name = safeName(p, "name", text(p, "addressObjectName"));
    const command = withVdom(block(["config firewall address", `delete ${quote(name)}`, "end"]), vdom);
    const critical = p.managed === false || p.breakGlass === true;
    return result({
      category: "address",
      riskLevel: critical ? AiRiskLevel.critical : AiRiskLevel.medium,
      normalizedParameters: { name, managedOnly: true, vdom },
      requiresBackup: critical,
      requiresBreakGlass: critical,
      lockoutSensitive: false,
      warnings: ["Deletion is intended only for firewall-log-analyzer managed address objects with explicit selected name."],
      commandSpecs: [spec({ template: "config firewall address/delete <managed-name>", command, target: { name, vdom }, rollbackSteps: ["Recreate address object from backup/export."], warnings: [] })],
      rollbackJson: { type: "recreate_deleted_address_from_backup", name, vdom }
    });
  }

  if (new Set<ActionType>([ActionType.fortigate_create_address_group, ActionType.fortigate_add_member_to_address_group, ActionType.fortigate_remove_member_from_address_group]).has(actionType)) {
    const name = safeName(p, "name", text(p, "groupName"));
    const members = arrayNames(p, "members");
    const append = actionType === ActionType.fortigate_add_member_to_address_group;
    const remove = actionType === ActionType.fortigate_remove_member_from_address_group;
    const verb = remove ? "unselect" : append ? "append" : "set";
    const command = withVdom(block(["config firewall addrgrp", `edit ${quote(name)}`, `${verb} member ${members.map(quote).join(" ")}`, `set comment ${quote(managedComment(safeText(p, "comment", "managed address group")))}`, "next", "end"]), vdom);
    return result({ category: "address", riskLevel: AiRiskLevel.medium, normalizedParameters: { name, members, vdom }, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: [spec({ template: `config firewall addrgrp/${verb} member`, command, target: { name, members, vdom }, rollbackSteps: ["Restore previous address group membership from backup/export."], warnings: [] })], rollbackJson: { type: "restore_addrgrp_members_manual", name, vdom } });
  }

  if (new Set<ActionType>([ActionType.fortigate_create_service_object, ActionType.fortigate_update_service_object, ActionType.fortigate_create_tcp_service, ActionType.fortigate_create_udp_service, ActionType.fortigate_create_tcp_udp_service, ActionType.fortigate_update_service_ports]).has(actionType)) {
    const name = safeName(p, "name", text(p, "serviceName"));
    assertNotBuiltinService(name);
    const inferred = actionType === ActionType.fortigate_create_udp_service ? "UDP" : actionType === ActionType.fortigate_create_tcp_udp_service ? "TCP-UDP" : "TCP";
    const protocol = safeName(p, "protocol", inferred).toUpperCase();
    if (protocol !== "TCP" && protocol !== "UDP" && protocol !== "TCP-UDP") fail("protocol");
    const tcpPorts = protocol !== "UDP" ? portList(p, "tcpPorts" in p ? "tcpPorts" : "port") : undefined;
    const udpPorts = protocol !== "TCP" ? portList(p, "udpPorts" in p ? "udpPorts" : "port") : undefined;
    const command = withVdom(block(["config firewall service custom", `edit ${quote(name)}`, `set protocol ${protocol}`, ...(tcpPorts ? [`set tcp-portrange ${tcpPorts}`] : []), ...(udpPorts ? [`set udp-portrange ${udpPorts}`] : []), `set comment ${quote(managedComment(safeText(p, "comment", "managed service")))}`, "next", "end"]), vdom);
    return result({ category: "service", riskLevel: AiRiskLevel.medium, normalizedParameters: { name, protocol, tcpPorts, udpPorts, vdom }, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: [spec({ template: "config firewall service custom/edit <name>/set protocol and port ranges", command, target: { name, tcpPorts, udpPorts, vdom }, rollbackSteps: [`delete service object ${name}`], warnings: [] })], rollbackJson: { type: "delete_created_service", name, vdom } });
  }

  if (actionType === ActionType.fortigate_delete_managed_service) {
    const name = safeName(p, "name", text(p, "serviceName"));
    assertNotBuiltinService(name);
    const critical = p.managed === false || p.breakGlass === true;
    const command = withVdom(block(["config firewall service custom", `delete ${quote(name)}`, "end"]), vdom);
    return result({ category: "service", riskLevel: critical ? AiRiskLevel.critical : AiRiskLevel.medium, normalizedParameters: { name, vdom, managedOnly: true }, requiresBackup: critical, requiresBreakGlass: critical, lockoutSensitive: false, warnings: ["Only firewall-log-analyzer managed service objects may be deleted without break-glass."], commandSpecs: [spec({ template: "config firewall service custom/delete <managed-service>", command, target: { name, vdom }, rollbackSteps: ["Recreate service object from backup/export."], warnings: [] })], rollbackJson: { type: "recreate_deleted_service_manual", name, vdom } });
  }

  if (new Set<ActionType>([ActionType.fortigate_create_service_group, ActionType.fortigate_add_service_to_group, ActionType.fortigate_remove_service_from_group]).has(actionType)) {
    const name = safeName(p, "name", text(p, "groupName"));
    const members = arrayNames(p, "members");
    const verb = actionType === ActionType.fortigate_add_service_to_group ? "append" : actionType === ActionType.fortigate_remove_service_from_group ? "unselect" : "set";
    const command = withVdom(block(["config firewall service group", `edit ${quote(name)}`, `${verb} member ${members.map(quote).join(" ")}`, "next", "end"]), vdom);
    return result({ category: "service", riskLevel: AiRiskLevel.medium, normalizedParameters: { name, members, vdom }, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: [spec({ template: `config firewall service group/edit <name>/${verb} member`, command, target: { name, members, vdom }, rollbackSteps: [`Restore service group ${name} membership from backup/export.`], warnings: [] })], rollbackJson: { type: "restore_service_group_members_manual", name, vdom } });
  }

  if (actionType === ActionType.fortigate_create_recurring_schedule || actionType === ActionType.fortigate_update_schedule) {
    const name = safeName(p, "name", text(p, "scheduleName"));
    const days = arrayNames(p, "days", ["monday", "tuesday", "wednesday", "thursday", "friday"]);
    const start = safeText(p, "start", "09:00") ?? "09:00";
    const end = safeText(p, "end", "17:00") ?? "17:00";
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) throw new Error("start/end must be HH:MM.");
    const command = withVdom(block(["config firewall schedule recurring", `edit ${quote(name)}`, `set day ${days.join(" ")}`, `set start ${start}`, `set end ${end}`, "next", "end"]), vdom);
    return result({ category: "schedule", riskLevel: AiRiskLevel.medium, normalizedParameters: { name, days, start, end, vdom }, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: [spec({ template: "config firewall schedule recurring/edit <name>", command, target: { name, vdom }, rollbackSteps: [`delete schedule ${name}`], warnings: [] })], rollbackJson: { type: "delete_created_schedule", name, vdom } });
  }

  if (new Set<ActionType>([ActionType.fortigate_create_egress_policy, ActionType.fortigate_create_deny_policy, ActionType.fortigate_create_dstnat_policy, ActionType.fortigate_create_policy, ActionType.fortigate_create_zone_policy]).has(actionType)) {
    const name = safeName(p, "name", text(p, "policyName") ?? `${MANAGED_PREFIX}-policy`);
    const srcintf = safeName(p, "srcintf", text(p, "srcInterface"));
    const dstintf = safeName(p, "dstintf", text(p, "dstInterface"));
    const sourceValue = text(p, "sourceCidr") ?? text(p, "sourceIp");
    const generatedSourceObject = sourceValue ? `${MANAGED_PREFIX}-src-${sourceValue.replace(/[^A-Za-z0-9]/g, "_")}`.slice(0, 79) : undefined;
    const sourceObject = safeOptionalName(p, "sourceAddressObject") ?? safeOptionalName(p, "sourceObject") ?? generatedSourceObject;
    const srcaddr = arrayNames(p, "srcaddr", [sourceObject ?? "all"]);
    const dstaddr = arrayNames(p, "dstaddr", [safeOptionalName(p, "destinationAddressObject") ?? safeName(p, "destinationObject", "all")]);
    const services = arrayNames(p, "services", ["ALL"]);
    const schedule = safeName(p, "schedule", text(p, "scheduleName") ?? "always");
    const action = actionType === ActionType.fortigate_create_deny_policy ? "deny" : safeName(p, "action", "accept");
    if (action !== "accept" && action !== "deny") fail("action");
    const disabled = p.disabled !== false;
    const nat = actionType === ActionType.fortigate_create_egress_policy ? p.nat !== false : p.nat === true;
    const policyCommand = block([
      "config firewall policy",
      "edit 0",
      `set name ${quote(name)}`,
      `set srcintf ${quote(srcintf)}`,
      `set dstintf ${quote(dstintf)}`,
      `set srcaddr ${srcaddr.map(quote).join(" ")}`,
      `set dstaddr ${dstaddr.map(quote).join(" ")}`,
      `set action ${action}`,
      `set schedule ${quote(schedule)}`,
      `set service ${services.map(quote).join(" ")}`,
      `set nat ${nat ? "enable" : "disable"}`,
      `set logtraffic ${p.logTraffic === false ? "disable" : "all"}`,
      `set status ${disabled ? "disable" : "enable"}`,
      `set comments ${quote(managedComment(safeText(p, "comment", "managed policy")))}`,
      "next",
      "end"
    ]);
    const addressCommand = sourceValue && generatedSourceObject
      ? block(["config firewall address", `edit ${quote(generatedSourceObject)}`, `set subnet ${subnet({ sourceCidr: sourceValue })}`, `set comment ${quote(managedComment("policy source"))}`, "next", "end"])
      : null;
    const command = withVdom(block([...(addressCommand ? [addressCommand] : []), policyCommand]), vdom);
    const rollbackSteps = [`delete managed policy named ${name}`, ...(generatedSourceObject ? [`delete generated address object ${generatedSourceObject} if unused`] : [])];
    return result({ category: "policy", riskLevel: disabled ? AiRiskLevel.medium : AiRiskLevel.high, normalizedParameters: { name, srcintf, dstintf, srcaddr, dstaddr, services, schedule, action, nat, logTraffic: p.logTraffic !== false, disabled, sourceIp: text(p, "sourceIp") ?? null, sourceCidr: text(p, "sourceCidr") ?? null, vdom }, requiresBackup: !disabled, requiresBreakGlass: false, lockoutSensitive: !disabled, warnings: disabled ? ["Policy and any generated source object are created disabled/unreferenced outside this managed policy. Enable requires a separate approved action."] : ["Enabled policy creation is high risk."], commandSpecs: [spec({ template: "optional address object, then config firewall policy/edit 0/set managed fields", command, target: { name, sourceObject: sourceObject ?? null, vdom }, rollbackSteps, warnings: [] })], rollbackJson: { type: "delete_created_policy_and_source_object", name, sourceObject: generatedSourceObject ?? null, vdom } });
  }

  if (actionType === ActionType.fortigate_update_policy) {
    const id = policyId(p);
    const lines = ["config firewall policy", `edit ${id}`];
    const optionalArrays: Array<[string, string]> = [["srcaddr", "srcaddr"], ["dstaddr", "dstaddr"], ["service", "services"]];
    for (const [fortiKey, paramKey] of optionalArrays) if (p[paramKey] !== undefined) lines.push(`set ${fortiKey} ${arrayNames(p, paramKey).map(quote).join(" ")}`);
    if (text(p, "srcintf")) lines.push(`set srcintf ${quote(safeName(p, "srcintf"))}`);
    if (text(p, "dstintf")) lines.push(`set dstintf ${quote(safeName(p, "dstintf"))}`);
    if (text(p, "schedule")) lines.push(`set schedule ${quote(safeName(p, "schedule"))}`);
    if (text(p, "action")) lines.push(`set action ${safeName(p, "action")}`);
    if (p.nat !== undefined) lines.push(`set nat ${p.nat === true ? "enable" : "disable"}`);
    if (text(p, "logtraffic")) lines.push(`set logtraffic ${safeName(p, "logtraffic")}`);
    if (p.disabled !== undefined || text(p, "status")) lines.push(`set status ${p.disabled === true || text(p, "status") === "disabled" ? "disable" : "enable"}`);
    if (text(p, "comment")) lines.push(`set comments ${quote(managedComment(safeText(p, "comment")))}`);
    lines.push("next", "end");
    return result({ category: "policy", riskLevel: AiRiskLevel.high, normalizedParameters: { policyId: id, vdom }, requiresBackup: true, requiresBreakGlass: false, lockoutSensitive: true, warnings: ["Policy updates are high risk and require backup preflight."], commandSpecs: [spec({ template: "config firewall policy/edit <id>/controlled update", command: withVdom(block(lines), vdom), target: { policyId: id, vdom }, rollbackSteps: ["Restore previous policy fields from backup/export."], warnings: [] })], rollbackJson: { type: "restore_policy_fields_manual", policyId: id, vdom } });
  }

  if (new Set<ActionType>([ActionType.fortigate_enable_policy, ActionType.fortigate_disable_policy, ActionType.fortigate_delete_managed_policy]).has(actionType)) {
    const id = policyId(p);
    const verb = actionType === ActionType.fortigate_enable_policy ? "enable" : actionType === ActionType.fortigate_disable_policy ? "disable" : "delete";
    const command = withVdom(verb === "delete" ? block(["config firewall policy", `delete ${id}`, "end"]) : block(["config firewall policy", `edit ${id}`, `set status ${verb}`, "next", "end"]), vdom);
    const critical = actionType === ActionType.fortigate_delete_managed_policy && (p.managed === false || p.breakGlass === true);
    return result({ category: "policy", riskLevel: actionType === ActionType.fortigate_enable_policy ? AiRiskLevel.high : critical ? AiRiskLevel.critical : AiRiskLevel.medium, normalizedParameters: { policyId: id, managedOnly: true, vdom }, requiresBackup: actionType === ActionType.fortigate_enable_policy || critical, requiresBreakGlass: critical, lockoutSensitive: actionType === ActionType.fortigate_enable_policy, warnings: ["Policy target must be an explicitly selected firewall-log-analyzer managed policy."], commandSpecs: [spec({ template: `config firewall policy/${verb} exact managed policy`, command, target: { policyId: id, vdom }, rollbackSteps: [verb === "enable" ? `disable policy ${id}` : verb === "disable" ? `enable policy ${id}` : "Recreate policy from backup/export."], warnings: [] })], rollbackJson: { type: `${verb}_same_policy`, policyId: id, vdom } });
  }

  if (actionType === ActionType.fortigate_move_policy) {
    const id = policyId(p);
    const before = safeOptionalName(p, "before");
    const after = safeOptionalName(p, "after");
    if (!before && !after) throw new Error("before or after is required.");
    const command = withVdom(`move ${id} ${before ? `before ${before}` : `after ${after}`}`, vdom);
    return result({ category: "policy", riskLevel: AiRiskLevel.high, normalizedParameters: { policyId: id, before, after, vdom }, requiresBackup: true, requiresBreakGlass: false, lockoutSensitive: true, commandSpecs: [spec({ template: "move <policyId> before|after <policyId>", command, target: { policyId: id, before, after, vdom }, rollbackSteps: ["Move policy back to previous order from backup/export."], warnings: [] })], rollbackJson: { type: "restore_policy_order_manual", policyId: id, vdom } });
  }

  if (actionType === ActionType.fortigate_update_policy_comment) {
    const id = policyId(p);
    const comment = managedComment(safeText(p, "comment") ?? fail("comment"));
    const command = withVdom(block(["config firewall policy", `edit ${id}`, `set comments ${quote(comment)}`, "next", "end"]), vdom);
    return result({ category: "policy", riskLevel: AiRiskLevel.low, normalizedParameters: { policyId: id, comment, vdom }, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: [spec({ template: "config firewall policy/edit <id>/set comments", command, target: { policyId: id, vdom }, rollbackSteps: ["Restore previous policy comment from audit/export."], warnings: [] })], rollbackJson: { type: "restore_policy_comment_manual", policyId: id, vdom } });
  }

  if (actionType === ActionType.fortigate_create_vip || actionType === ActionType.fortigate_create_vip_group) {
    const name = safeName(p, "name");
    const command = actionType === ActionType.fortigate_create_vip
      ? withVdom(block(["config firewall vip", `edit ${quote(name)}`, `set extip ${ipv4(text(p, "externalIp") ?? fail("externalIp"), "externalIp")}`, `set mappedip ${quote(ipv4(text(p, "mappedIp") ?? fail("mappedIp"), "mappedIp"))}`, `set extport ${port(p, "externalPort")}`, `set mappedport ${port(p, "mappedPort")}`, "set portforward enable", "next", "end"]), vdom)
      : withVdom(block(["config firewall vipgrp", `edit ${quote(name)}`, `set member ${arrayNames(p, "members").map(quote).join(" ")}`, "next", "end"]), vdom);
    return result({ category: "nat", riskLevel: AiRiskLevel.high, normalizedParameters: { name, vdom }, requiresBackup: true, requiresBreakGlass: false, lockoutSensitive: false, warnings: ["VIP/NAT changes are high risk and require backup preflight."], commandSpecs: [spec({ template: actionType === ActionType.fortigate_create_vip ? "config firewall vip/edit <name>" : "config firewall vipgrp/edit <name>", command, target: { name, vdom }, rollbackSteps: [`delete VIP/VIP group ${name}`], warnings: [] })], rollbackJson: { type: "delete_created_vip_artifact", name, vdom } });
  }

  if (actionType === ActionType.fortigate_create_snat_policy) {
    if (input.dialect?.features.centralSnatLikelyAvailable === false) throw new Error("FORTIOS_UNSUPPORTED_FEATURE");
    const srcintf = safeName(p, "srcintf", text(p, "srcInterface"));
    const dstintf = safeName(p, "dstintf", text(p, "dstInterface"));
    const srcaddr = cidrOrIp(p, "srcaddr");
    const command = withVdom(block(["config firewall central-snat-map", "edit 0", `set srcintf ${quote(srcintf)}`, `set dstintf ${quote(dstintf)}`, `set orig-addr ${quote(srcaddr)}`, "set nat enable", "next", "end"]), vdom);
    return result({ category: "nat", riskLevel: AiRiskLevel.high, normalizedParameters: { srcintf, dstintf, srcaddr, vdom }, requiresBackup: true, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: [spec({ template: "config firewall central-snat-map/edit 0", command, target: { srcintf, dstintf, vdom }, rollbackSteps: ["Remove created central SNAT entry from backup/export reference."], warnings: [] })], rollbackJson: { type: "remove_created_central_snat_manual", vdom } });
  }

  if (new Set<ActionType>([ActionType.fortigate_restrict_admin_trusthost, ActionType.fortigate_change_admin_port, ActionType.fortigate_disable_unused_admin_service]).has(actionType)) {
    const critical = actionType === ActionType.fortigate_change_admin_port;
    const admin = safeName(p, "admin", "admin");
    const command = actionType === ActionType.fortigate_restrict_admin_trusthost
      ? block(["config system admin", `edit ${quote(admin)}`, `set trusthost1 ${cidrOrIp(p, "trusthost")}`, "next", "end"])
      : actionType === ActionType.fortigate_change_admin_port
        ? block(["config system global", `set admin-sport ${port(p, "port")}`, "end"])
        : block(["config system global", `set admin-${safeName(p, "service")} disable`, "end"]);
    return result({ category: "management", riskLevel: critical ? AiRiskLevel.critical : AiRiskLevel.high, normalizedParameters: { admin, vdom }, requiresBackup: true, requiresBreakGlass: critical, lockoutSensitive: true, warnings: ["Management changes may lock out the current administrator."], commandSpecs: [spec({ template: "config system controlled management update", command, target: { admin }, rollbackSteps: ["Restore previous admin management settings from backup/export."], warnings: [] })], rollbackJson: { type: "restore_admin_management_manual", admin } });
  }

  throw new Error("FORTIOS_UNSUPPORTED_FEATURE");
}
