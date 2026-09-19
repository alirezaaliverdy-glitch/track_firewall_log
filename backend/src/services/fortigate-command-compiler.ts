import { ActionType, AiRiskLevel } from "@prisma/client";
import { getFortiGateControlAction } from "../fortigate/full-control-registry.js";
import type { FortiOsDialect } from "./fortigate-version.service.js";
import { normalizeFortiGateGuidedVpnParameters, validateFortiGateGuidedVpnParameters } from "./fortigate-guided-vpn.schema.js";
import {
  actionName,
  arrayNames,
  assertNotBuiltinService,
  block,
  cidrList,
  cidrOrIp,
  fail,
  fqdn,
  ipRange,
  MANAGED_PREFIX,
  ipv4,
  ipv4OrFqdn,
  managedComment,
  objectName,
  policyId,
  port,
  portList,
  quote,
  readOnly,
  requireFeature,
  result,
  RAW_KEYS,
  safeName,
  safeOptionalName,
  safeProposal,
  safeText,
  secretValue,
  spec,
  subnet,
  text,
  withVdom,
  type FortiGateCompiledAction,
} from "../fortigate/command-compiler/shared.js";

export type { FortiGateCommandSpec, FortiGateCompiledAction } from "../fortigate/command-compiler/shared.js";
import { compileFortiGateGuidedVpnSetup } from "../fortigate/command-compiler/guided-vpn.js";
import { compileFortiGateReadOnlyAction } from "../fortigate/command-compiler/read-only.js";
export function compileFortiGateAction(input: {
  actionType: ActionType;
  parameters: Record<string, unknown>;
  riskLevel: AiRiskLevel;
  dialect?: FortiOsDialect;
}): FortiGateCompiledAction {
  const p = input.parameters;
  for (const key of Object.keys(p)) if (RAW_KEYS.has(key)) throw new Error("Raw CLI parameters are not allowed.");
  const actionType = input.actionType;
  const action = actionName(actionType);
  const vdom = safeOptionalName(p, "vdom");
  if (p.vdomRequired === true && !vdom) throw new Error("FORTIGATE_VDOM_REQUIRED");

  if (actionType === ActionType.fortigate_reboot || actionType === ActionType.fortigate_shutdown) {
    const shutdown = actionType === ActionType.fortigate_shutdown;
    const command = shutdown ? "execute shutdown" : "execute reboot";
    return result({
      category: "system",
      riskLevel: AiRiskLevel.critical,
      normalizedParameters: { operation: shutdown ? "shutdown" : "reboot" },
      requiresBackup: false,
      requiresBreakGlass: true,
      lockoutSensitive: true,
      warnings: ["This operation interrupts management connectivity; the FortiOS confirmation prompt is answered only after user approval."],
      commandSpecs: [spec({ template: command, command, write: true, target: { operation: shutdown ? "shutdown" : "reboot" }, rollbackSteps: [], warnings: [] })],
      rollbackJson: { type: shutdown ? "none_shutdown" : "none_reboot", expectedDisconnect: true }
    });
  }

  const readOnlyCompiled = compileFortiGateReadOnlyAction(actionType);
  if (readOnlyCompiled) return readOnlyCompiled;

  if (actionType === ActionType.fortigate_guided_vpn_setup) return compileFortiGateGuidedVpnSetup({ parameters: p, riskLevel: input.riskLevel, dialect: input.dialect });

  if (actionType === ActionType.fortigate_show_ha_vdom_zone) {
    const commands = ["get system ha status", "show system ha", "show system vdom", "show system zone"];
    return result({ category: "system", riskLevel: AiRiskLevel.low, normalizedParameters: {}, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: commands.map((command) => spec({ template: command, command, write: false, target: {}, rollbackSteps: [], warnings: [] })) });
  }

  if (actionType === ActionType.fortigate_list_admins) return readOnly("show system admin", "management");
  if (actionType === ActionType.fortigate_list_zones) return readOnly("show system zone", "zone");
  if (actionType === ActionType.fortigate_list_interfaces) return readOnly("show system interface", "interface");
  if (actionType === ActionType.fortigate_list_policies) return readOnly("show firewall policy", "policy");
  if (actionType === ActionType.fortigate_list_address_objects) return readOnly("show firewall address", "address");
  if (actionType === ActionType.fortigate_list_routes) return readOnly("get router info routing-table all", "route");
  if (actionType === ActionType.fortigate_show_logs) return readOnly("execute log display", "system");
  if (actionType === ActionType.fortigate_show_sessions) return readOnly("diagnose sys session list", "system");
  const registryRead = getFortiGateControlAction(action);
  if (registryRead && registryRead.rollbackTemplate === "none_read_only") {
    const commands = registryRead.verificationCommands.length > 0 ? registryRead.verificationCommands : [registryRead.readCommand];
    return result({ category: registryRead.category, riskLevel: AiRiskLevel.low, normalizedParameters: {}, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: commands.map((command) => spec({ template: command, command, write: false, target: {}, rollbackSteps: [], warnings: [] })), rollbackJson: { type: "none_read_only", actionType: action } });
  }

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
      warnings: ["Static route changes can alter the management path. Backup is disabled for Quick Controlled execution."],
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
    const interfaces = actionType === ActionType.fortigate_create_zone && p.interfaces === undefined && !safeOptionalName(p, "interfaceName") ? [] : arrayNames(p, "interfaces", safeOptionalName(p, "interfaceName") ? [safeName(p, "interfaceName")] : undefined);
    const verb = actionType === ActionType.fortigate_add_interface_to_zone ? "append" : actionType === ActionType.fortigate_remove_interface_from_zone ? "unselect" : "set";
    const command = withVdom(block(["config system zone", `edit ${quote(name)}`, ...(interfaces.length > 0 ? [`${verb} interface ${interfaces.map(quote).join(" ")}`] : []), `set intrazone ${p.intrazone === "allow" ? "allow" : "deny"}`, `set description ${quote(managedComment(safeText(p, "comment", "managed zone")))}`, "next", "end"]), vdom);
    return result({ category: "zone", riskLevel: AiRiskLevel.high, normalizedParameters: { name, interfaces, vdom }, requiresBackup: true, requiresBreakGlass: false, lockoutSensitive: true, warnings: ["Zone changes are high risk and may affect policy matching."], commandSpecs: [spec({ template: `config system zone/${verb} interface`, command, target: { name, interfaces, vdom }, rollbackSteps: ["Restore previous zone interface membership from backup/export."], warnings: [] })], rollbackJson: { type: "restore_zone_membership_manual", name, vdom } });
  }

  if (actionType === ActionType.fortigate_delete_managed_zone || action === "fortigate_delete_zone") {
    const name = safeName(p, "name", text(p, "zoneName"));
    const critical = p.managed === false || p.breakGlass === true;
    const command = withVdom(block(["config system zone", `delete ${quote(name)}`, "end"]), vdom);
    return result({ category: "zone", riskLevel: critical ? AiRiskLevel.critical : AiRiskLevel.high, normalizedParameters: { name, vdom, managedOnly: true }, requiresBackup: true, requiresBreakGlass: critical, lockoutSensitive: true, warnings: ["Deleting zones is high risk. Non-managed zone deletion requires break-glass."], commandSpecs: [spec({ template: "config system zone/delete <managed-zone>", command, target: { name, vdom }, rollbackSteps: ["Recreate zone and memberships from backup/export."], warnings: [] })], rollbackJson: { type: "recreate_deleted_zone_manual", name, vdom } });
  }

  if (new Set<ActionType>([ActionType.fortigate_set_interface_alias, ActionType.fortigate_set_interface_role, ActionType.fortigate_enable_interface, ActionType.fortigate_disable_interface, ActionType.fortigate_update_interface_ip]).has(actionType) || action === "fortigate_update_interface_allowaccess" || action === "fortigate_update_management_access") {
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
    if (action === "fortigate_update_interface_allowaccess" || action === "fortigate_update_management_access") {
      const allowaccess = arrayNames(p, "allowaccess").map((item) => item.toLowerCase());
      const allowed = new Set(["ping", "https", "ssh", "http", "fgfm", "snmp", "radius-acct", "probe-response", "fabric"]);
      for (const item of allowaccess) if (!allowed.has(item)) fail("allowaccess");
      lines.push(`set allowaccess ${allowaccess.join(" ")}`);
      requiresBreakGlass = allowaccess.includes("http") || allowaccess.includes("https") || allowaccess.includes("ssh") || p.publicInterface === true;
      riskLevel = requiresBreakGlass ? AiRiskLevel.high : AiRiskLevel.medium;
      rollback = `restore previous allowaccess for ${name}`;
    }
    lines.push("next", "end");
    const verificationCommand = withVdom(`show full-configuration system interface ${name}`, vdom);
    return result({ category: "interface", riskLevel, normalizedParameters: { name, vdom, managementFacing: p.managementFacing === true, requestedIp: text(p, "cidr") ?? text(p, "ip"), requestedAlias: text(p, "alias") }, requiresBackup: true, requiresBreakGlass, lockoutSensitive: true, warnings: ["Interface changes can cause connectivity loss. Verify alternate access."], commandSpecs: [spec({ template: "config system interface/edit <name>/controlled update", command: withVdom(block(lines), vdom), target: { name, vdom }, rollbackSteps: [rollback], warnings: [] }), spec({ template: "verify interface full configuration", command: verificationCommand, write: false, target: { name, vdom }, rollbackSteps: [], warnings: [] })], rollbackJson: { type: "restore_interface_manual", name, vdom } });
  }

  if (actionType === ActionType.fortigate_create_vlan_interface) {
    const name = safeName(p, "name", text(p, "interfaceName"));
    const parent = safeName(p, "parent", text(p, "parentInterface"));
    const vlanId = Number(p.vlanId);
    if (!Number.isInteger(vlanId) || vlanId < 1 || vlanId > 4094) fail("vlanId");
    const command = withVdom(block(["config system interface", `edit ${quote(name)}`, "set type vlan", `set interface ${quote(parent)}`, `set vlanid ${vlanId}`, ...(text(p, "ip") || text(p, "cidr") ? [`set ip ${subnet({ cidr: text(p, "cidr") ?? text(p, "ip") })}`] : []), `set alias ${quote(managedComment(safeText(p, "comment", "managed vlan interface")))}`, "next", "end"]), vdom);
    return result({ category: "interface", riskLevel: AiRiskLevel.high, normalizedParameters: { name, parent, vlanId, vdom }, requiresBackup: true, requiresBreakGlass: false, lockoutSensitive: true, warnings: ["VLAN interface creation is high risk. Backup is disabled for Quick Controlled execution."], commandSpecs: [spec({ template: "config system interface/edit <vlan>/set type vlan", command, target: { name, parent, vlanId, vdom }, rollbackSteps: [`delete VLAN interface ${name}`], warnings: [] })], rollbackJson: { type: "delete_created_vlan_interface", name, vdom } });
  }

  if (action === "fortigate_delete_interface") {
    const name = safeName(p, "name", text(p, "interfaceName"));
    const command = withVdom(block(["config system interface", `delete ${quote(name)}`, "end"]), vdom);
    return result({ category: "interface", riskLevel: AiRiskLevel.high, normalizedParameters: { name, vdom }, requiresBackup: true, requiresBreakGlass: false, lockoutSensitive: true, warnings: ["Interface deletion requires dependency review before execution."], commandSpecs: [spec({ template: "config system interface/delete <name>", command, target: { name, vdom }, rollbackSteps: ["Recreate interface from snapshot/export."], warnings: [] })], rollbackJson: { type: "recreate_deleted_interface_manual", name, vdom } });
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

  if (actionType === ActionType.fortigate_delete_managed_address_object || action === "fortigate_delete_address_object") {
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

  if (actionType === ActionType.fortigate_delete_managed_service || action === "fortigate_delete_service_object") {
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
    return result({ category: "policy", riskLevel: AiRiskLevel.high, normalizedParameters: { policyId: id, vdom }, requiresBackup: true, requiresBreakGlass: false, lockoutSensitive: true, warnings: ["Policy updates are high risk. Backup is disabled for Quick Controlled execution."], commandSpecs: [spec({ template: "config firewall policy/edit <id>/controlled update", command: withVdom(block(lines), vdom), target: { policyId: id, vdom }, rollbackSteps: ["Restore previous policy fields from backup/export."], warnings: [] })], rollbackJson: { type: "restore_policy_fields_manual", policyId: id, vdom } });
  }

  if (new Set<ActionType>([ActionType.fortigate_enable_policy, ActionType.fortigate_disable_policy, ActionType.fortigate_delete_managed_policy]).has(actionType) || action === "fortigate_delete_policy") {
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
    return result({ category: "nat", riskLevel: AiRiskLevel.high, normalizedParameters: { name, vdom }, requiresBackup: true, requiresBreakGlass: false, lockoutSensitive: false, warnings: ["VIP/NAT changes are high risk. Backup is disabled for Quick Controlled execution."], commandSpecs: [spec({ template: actionType === ActionType.fortigate_create_vip ? "config firewall vip/edit <name>" : "config firewall vipgrp/edit <name>", command, target: { name, vdom }, rollbackSteps: [`delete VIP/VIP group ${name}`], warnings: [] })], rollbackJson: { type: "delete_created_vip_artifact", name, vdom } });
  }

  if (action === "fortigate_update_vip" || action === "fortigate_delete_vip") {
    const name = safeName(p, "name");
    const command = action === "fortigate_delete_vip"
      ? withVdom(block(["config firewall vip", `delete ${quote(name)}`, "end"]), vdom)
      : withVdom(block(["config firewall vip", `edit ${quote(name)}`, ...(text(p, "externalIp") ? [`set extip ${ipv4(text(p, "externalIp") ?? "", "externalIp")}`] : []), ...(text(p, "mappedIp") ? [`set mappedip ${quote(ipv4(text(p, "mappedIp") ?? "", "mappedIp"))}`] : []), ...(p.externalPort !== undefined ? [`set extport ${port(p, "externalPort")}`] : []), ...(p.mappedPort !== undefined ? [`set mappedport ${port(p, "mappedPort")}`] : []), "next", "end"]), vdom);
    return result({ category: "nat", riskLevel: AiRiskLevel.high, normalizedParameters: { name, vdom }, requiresBackup: true, requiresBreakGlass: false, lockoutSensitive: false, warnings: ["VIP changes require policy reference review."], commandSpecs: [spec({ template: action === "fortigate_delete_vip" ? "config firewall vip/delete <name>" : "config firewall vip/edit <name>", command, target: { name, vdom }, rollbackSteps: ["Restore previous VIP from snapshot/export."], warnings: [] })], rollbackJson: { type: "restore_vip_manual", name, vdom } });
  }

  if (action === "fortigate_create_ippool" || action === "fortigate_update_ippool" || action === "fortigate_delete_ippool") {
    const name = safeName(p, "name");
    const command = action === "fortigate_delete_ippool"
      ? withVdom(block(["config firewall ippool", `delete ${quote(name)}`, "end"]), vdom)
      : withVdom(block(["config firewall ippool", `edit ${quote(name)}`, ...(text(p, "startIp") ? [`set startip ${ipv4(text(p, "startIp") ?? "", "startIp")}`] : []), ...(text(p, "endIp") ? [`set endip ${ipv4(text(p, "endIp") ?? "", "endIp")}`] : []), "next", "end"]), vdom);
    return result({ category: "nat", riskLevel: AiRiskLevel.high, normalizedParameters: { name, vdom }, requiresBackup: true, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: [spec({ template: `config firewall ippool/${action.endsWith("delete_ippool") ? "delete" : "edit"} <name>`, command, target: { name, vdom }, rollbackSteps: ["Restore previous IP pool from snapshot/export."], warnings: [] })], rollbackJson: { type: "restore_ippool_manual", name, vdom } });
  }

  if (actionType === ActionType.fortigate_create_snat_policy) {
    if (input.dialect?.features.centralSnatLikelyAvailable === false) throw new Error("FORTIOS_UNSUPPORTED_FEATURE");
    const srcintf = safeName(p, "srcintf", text(p, "srcInterface"));
    const dstintf = safeName(p, "dstintf", text(p, "dstInterface"));
    const srcaddr = cidrOrIp(p, "srcaddr");
    const command = withVdom(block(["config firewall central-snat-map", "edit 0", `set srcintf ${quote(srcintf)}`, `set dstintf ${quote(dstintf)}`, `set orig-addr ${quote(srcaddr)}`, "set nat enable", "next", "end"]), vdom);
    return result({ category: "nat", riskLevel: AiRiskLevel.high, normalizedParameters: { srcintf, dstintf, srcaddr, vdom }, requiresBackup: true, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: [spec({ template: "config firewall central-snat-map/edit 0", command, target: { srcintf, dstintf, vdom }, rollbackSteps: ["Remove created central SNAT entry from backup/export reference."], warnings: [] })], rollbackJson: { type: "remove_created_central_snat_manual", vdom } });
  }

  if (action === "fortigate_update_static_route" || action === "fortigate_delete_static_route") {
    const routeId = policyId(p, "routeId");
    const command = action === "fortigate_delete_static_route"
      ? block(["config router static", `delete ${routeId}`, "end"])
      : block(["config router static", `edit ${routeId}`, ...(text(p, "destinationCidr") ? [`set dst ${quote(cidrOrIp({ destinationCidr: p.destinationCidr }, "destinationCidr"))}`] : []), ...(text(p, "gateway") ? [`set gateway ${quote(ipv4(text(p, "gateway") ?? "", "gateway"))}`] : []), ...(text(p, "device") ? [`set device ${quote(safeName(p, "device"))}`] : []), "next", "end"]);
    return result({ category: "route", riskLevel: AiRiskLevel.high, normalizedParameters: { routeId, vdom }, requiresBackup: true, requiresBreakGlass: false, lockoutSensitive: true, warnings: ["Route changes can affect management reachability. Old and new route must be reviewed in preview."], commandSpecs: [spec({ template: `config router static/${action.endsWith("delete_static_route") ? "delete" : "edit"} <routeId>`, command: withVdom(command, vdom), target: { routeId, vdom }, rollbackSteps: ["Restore previous route from snapshot/export."], warnings: [] })], rollbackJson: { type: "restore_static_route_manual", routeId, vdom } });
  }

  if (action === "fortigate_update_dns") {
    const primary = ipv4(text(p, "primary") ?? fail("primary"), "primary");
    const secondary = ipv4(text(p, "secondary") ?? fail("secondary"), "secondary");
    const command = block(["config system dns", `set primary ${primary}`, `set secondary ${secondary}`, "end"]);
    return result({ category: "network", riskLevel: AiRiskLevel.medium, normalizedParameters: { primary, secondary }, requiresBackup: true, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: [spec({ template: "config system dns/set primary secondary", command, target: { primary, secondary }, rollbackSteps: ["Restore previous DNS servers from snapshot/export."], warnings: [] })], rollbackJson: { type: "restore_dns_manual" } });
  }

  if (action === "fortigate_update_ntp") {
    const server = safeText(p, "server") ?? fail("server");
    const command = block(["config system ntp", "set ntpsync enable", "config ntpserver", "edit 1", `set server ${quote(server)}`, "next", "end", "end"]);
    return result({ category: "network", riskLevel: AiRiskLevel.medium, normalizedParameters: { server }, requiresBackup: true, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: [spec({ template: "config system ntp/server", command, target: { server }, rollbackSteps: ["Restore previous NTP settings from snapshot/export."], warnings: [] })], rollbackJson: { type: "restore_ntp_manual" } });
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

  if (action === "fortigate_update_zone") {
    const name = safeName(p, "name", text(p, "zoneName"));
    const lines = ["config system zone", `edit ${quote(name)}`];
    if (p.interfaces !== undefined || text(p, "interfaceName")) lines.push(`set interface ${arrayNames(p, "interfaces", safeOptionalName(p, "interfaceName") ? [safeName(p, "interfaceName")] : undefined).map(quote).join(" ")}`);
    if (text(p, "comment")) lines.push(`set description ${quote(managedComment(safeText(p, "comment")))}`);
    lines.push("next", "end");
    return result({ category: "zone", riskLevel: AiRiskLevel.high, normalizedParameters: { name, vdom }, requiresBackup: true, requiresBreakGlass: false, lockoutSensitive: true, warnings: ["Zone updates must show affected policy references."], commandSpecs: [spec({ template: "config system zone/edit <name>", command: withVdom(block(lines), vdom), target: { name, vdom }, rollbackSteps: ["Restore previous zone from snapshot/export."], warnings: [] })], rollbackJson: { type: "restore_zone_manual", name, vdom } });
  }

  if (action.startsWith("fortigate_") && getFortiGateControlAction(action)) {
    const name = safeOptionalName(p, "name") ?? safeOptionalName(p, "admin") ?? safeOptionalName(p, "groupName") ?? safeOptionalName(p, "interfaceName");
    const registry = getFortiGateControlAction(action)!;
    if (registry.requiredParams.includes("pskSecretRef") && text(p, "psk")) throw new Error("PSK plaintext is not allowed; use pskSecretRef.");
    if (registry.requiredParams.includes("pskSecretRef") && !text(p, "pskSecretRef")) fail("pskSecretRef");
    const target = name ? quote(name) : "0";
    let command: string;
    if (action.includes("_admin")) {
      const admin = safeName(p, "admin", name ?? text(p, "name"));
      command = action === "fortigate_delete_admin"
        ? block(["config system admin", `delete ${quote(admin)}`, "end"])
        : block(["config system admin", `edit ${quote(admin)}`, ...(action === "fortigate_disable_admin" ? ["set status disable"] : []), ...(text(p, "profile") ? [`set accprofile ${quote(safeName(p, "profile"))}`] : []), ...(text(p, "trusthost") ? [`set trusthost1 ${cidrOrIp(p, "trusthost")}`] : []), "next", "end"]);
    } else if (action === "fortigate_create_api_user") {
      const apiName = safeName(p, "name");
      command = block(["config system api-user", `edit ${quote(apiName)}`, ...(text(p, "profile") ? [`set accprofile ${quote(safeName(p, "profile"))}`] : []), "next", "end"]);
    } else if (action.includes("_vdom")) {
      const vdomName = safeName(p, "name", text(p, "vdomName"));
      command = action === "fortigate_delete_vdom" ? block(["config vdom", `delete ${quote(vdomName)}`, "end"]) : block(["config vdom", `edit ${quote(vdomName)}`, "next", "end"]);
    } else if (action === "fortigate_move_interface_to_vdom") {
      const iface = safeName(p, "name", text(p, "interfaceName"));
      const targetVdom = safeName(p, "targetVdom", text(p, "vdom"));
      command = block(["config global", "config system interface", `edit ${quote(iface)}`, `set vdom ${quote(targetVdom)}`, "next", "end", "end"]);
    } else if (action.includes("_ha")) {
      command = block(["config system ha", ...(text(p, "mode") ? [`set mode ${safeName(p, "mode")}`] : []), ...(text(p, "groupName") ? [`set group-name ${quote(safeName(p, "groupName"))}`] : []), ...(p.priority !== undefined ? [`set priority ${Number(p.priority)}`] : []), "end"]);
    } else if (action.includes("_sdwan")) {
      command = block(["config system sdwan", action === "fortigate_create_sdwan_zone" ? "config zone" : action === "fortigate_create_sdwan_health_check" ? "config health-check" : action === "fortigate_create_sdwan_rule" ? "config service" : "config members", `edit ${target}`, ...(text(p, "interfaceName") ? [`set interface ${quote(safeName(p, "interfaceName"))}`] : []), ...(text(p, "server") ? [`set server ${quote(safeText(p, "server") ?? "")}`] : []), "next", "end", "end"]);
    } else if (action.includes("_ipsec_")) {
      const vpnName = safeName(p, "name");
      const table = action.includes("phase2") ? "phase2-interface" : "phase1-interface";
      command = action === "fortigate_delete_ipsec_tunnel"
        ? block(["config vpn ipsec phase2-interface", `delete ${quote(vpnName)}`, "end", "config vpn ipsec phase1-interface", `delete ${quote(vpnName)}`, "end"])
        : block([`config vpn ipsec ${table}`, `edit ${quote(vpnName)}`, ...(text(p, "remoteGateway") ? [`set remote-gw ${ipv4(text(p, "remoteGateway") ?? "", "remoteGateway")}`] : []), ...(action === "fortigate_disable_ipsec_tunnel" ? ["set status disable"] : []), "next", "end"]);
    } else if (action.includes("_ssl_vpn")) {
      command = action === "fortigate_disable_ssl_vpn"
        ? block(["config vpn ssl settings", "unset source-interface", "end"])
        : block(["config vpn ssl settings", ...(p.port !== undefined ? [`set port ${port(p, "port")}`] : []), "end"]);
    } else {
      throw new Error("FORTIOS_UNSUPPORTED_FEATURE");
    }
    const critical = registry.risk === "critical";
    return result({ category: registry.category, riskLevel: critical ? AiRiskLevel.critical : registry.risk === "high" ? AiRiskLevel.high : registry.risk === "medium" ? AiRiskLevel.medium : AiRiskLevel.low, normalizedParameters: { actionType: action, name: name ?? null, vdom }, requiresBackup: registry.rollbackTemplate !== "none_read_only", requiresBreakGlass: false, lockoutSensitive: critical || registry.category === "admin" || registry.category === "vdom" || registry.category === "ha", warnings: registry.preChecks.map((item) => `Precheck required: ${item}`), commandSpecs: [spec({ template: registry.createTemplate ?? registry.updateTemplate ?? registry.deleteTemplate ?? registry.enableTemplate ?? registry.disableTemplate ?? action, command: withVdom(command, vdom), target: { actionType: action, name: name ?? null, vdom }, rollbackSteps: [registry.rollbackTemplate], warnings: [] })], rollbackJson: { type: registry.rollbackTemplate, actionType: action, name: name ?? null, vdom } });
  }

  throw new Error("FORTIOS_UNSUPPORTED_FEATURE");
}
