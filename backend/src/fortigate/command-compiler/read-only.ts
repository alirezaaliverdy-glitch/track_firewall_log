import { ActionType, AiRiskLevel } from "@prisma/client";
import {
  readOnly,
  result,
  spec,
  type FortiGateCompiledAction,
} from "./shared.js";

export function compileFortiGateReadOnlyAction(actionType: ActionType): FortiGateCompiledAction | null {  if (actionType === ActionType.fortigate_daily_check) {
    const commands = ["get system status", "get system performance status", "show system interface", "get system interface physical", "get router info routing-table all", "get system dns", "show system dns", "show system admin", "show firewall policy", "show firewall address", "show firewall vip", "show firewall ippool", "get vpn ipsec tunnel summary", "diagnose vpn tunnel list", "get vpn ssl monitor", "show vpn ipsec phase1-interface", "show vpn ipsec phase2-interface", "show vpn ssl settings", "get system ha status", "show system ha", "show system vdom", "show system zone"];
    return result({ category: "daily-check", riskLevel: AiRiskLevel.low, normalizedParameters: {}, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: commands.map((command) => spec({ template: `fortigate daily check: ${command}`, command, write: false, target: {}, rollbackSteps: [], warnings: [] })) });
  }
  if (actionType === ActionType.fortigate_show_interfaces) {
    const commands = ["show system interface", "get system interface physical"];
    return result({ category: "interface", riskLevel: AiRiskLevel.low, normalizedParameters: {}, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: commands.map((command) => spec({ template: `fortigate interfaces: ${command}`, command, write: false, target: {}, rollbackSteps: [], warnings: [] })) });
  }
  if (actionType === ActionType.fortigate_route_dns_check) {
    const commands = ["get router info routing-table all", "get system dns"];
    return result({ category: "network", riskLevel: AiRiskLevel.low, normalizedParameters: {}, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: commands.map((command) => spec({ template: `fortigate route dns: ${command}`, command, write: false, target: {}, rollbackSteps: [], warnings: [] })) });
  }
  if (actionType === ActionType.fortigate_license_status) {
    const commands = ["get system status", "show system fortiguard"];
    return result({ category: "license", riskLevel: AiRiskLevel.low, normalizedParameters: {}, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: commands.map((command) => spec({ template: `fortigate license: ${command}`, command, write: false, target: {}, rollbackSteps: [], warnings: [] })) });
  }
  if (actionType === ActionType.fortigate_admin_users) return readOnly("show system admin", "management");
  if (actionType === ActionType.fortigate_show_system_status) {
    const commands = ["get system status", "get system performance status"];
    return result({ category: "system", riskLevel: AiRiskLevel.low, normalizedParameters: {}, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: commands.map((command) => spec({ template: command, command, write: false, target: {}, rollbackSteps: [], warnings: [] })) });
  }
  if (actionType === ActionType.fortigate_show_routing_dns) {
    const commands = ["get router info routing-table all", "get system dns", "show system dns", "show system interface"];
    return result({ category: "network", riskLevel: AiRiskLevel.low, normalizedParameters: {}, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: commands.map((command) => spec({ template: command, command, write: false, target: {}, rollbackSteps: [], warnings: [] })) });
  }
  if (actionType === ActionType.fortigate_show_admin_access) {
    const commands = ["show system admin", "show system interface"];
    return result({ category: "management", riskLevel: AiRiskLevel.low, normalizedParameters: {}, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: commands.map((command) => spec({ template: command, command, write: false, target: {}, rollbackSteps: [], warnings: [] })) });
  }
  if (actionType === ActionType.fortigate_show_firewall_policies) {
    const commands = ["show firewall policy", "show firewall address", "show firewall vip", "show firewall ippool"];
    return result({ category: "firewall", riskLevel: AiRiskLevel.low, normalizedParameters: {}, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: commands.map((command) => spec({ template: command, command, write: false, target: {}, rollbackSteps: [], warnings: [] })) });
  }
  if (actionType === ActionType.fortigate_show_vpn_status) {
    const commands = ["get vpn ipsec tunnel summary", "diagnose vpn tunnel list", "get vpn ssl monitor", "show vpn ipsec phase1-interface", "show vpn ipsec phase2-interface", "show vpn ssl settings"];
    return result({ category: "vpn", riskLevel: AiRiskLevel.low, normalizedParameters: {}, requiresBackup: false, requiresBreakGlass: false, lockoutSensitive: false, commandSpecs: commands.map((command) => spec({ template: command, command, write: false, target: {}, rollbackSteps: [], warnings: [] })) });
  }
  return null;
}
