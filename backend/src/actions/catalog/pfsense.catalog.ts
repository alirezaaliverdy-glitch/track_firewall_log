import { ActionType, AiRiskLevel } from "@prisma/client";
import { catalogEntry as e } from "./helpers.js";

const unsupported = { supported: false, executorHandler: "pfsenseConnectorNotConfigured", rollback: { available: false } } as const;
export const PFSENSE_COMMAND_CATALOG = Object.freeze([
  e("pfsense", "read_interfaces", "Read interfaces", "interfaces", ActionType.open_port, ["show interfaces", "read interfaces"], AiRiskLevel.low, true, [], [], unsupported),
  e("pfsense", "read_aliases", "Read aliases", "objects", ActionType.open_port, ["show aliases", "read aliases"], AiRiskLevel.low, true, [], [], unsupported),
  e("pfsense", "read_firewall_rules", "Read firewall rules", "firewall", ActionType.open_port, ["show firewall rules", "read firewall rules"], AiRiskLevel.low, true, [], [], unsupported),
  e("pfsense", "create_alias", "Create alias", "objects", ActionType.open_port, ["create alias", "add alias"], AiRiskLevel.medium, false, ["name", "sourceCidr"], [], unsupported),
  e("pfsense", "add_firewall_rule", "Add firewall rule", "firewall", ActionType.add_firewall_rule, ["add firewall rule", "create firewall rule"], AiRiskLevel.high, false, [], [], unsupported),
  e("pfsense", "toggle_managed_rule", "Enable or disable managed rule", "firewall", ActionType.disable_rule, ["disable managed rule", "enable managed rule"], AiRiskLevel.high, false, [], [], unsupported),
  e("pfsense", "read_nat_rules", "Read NAT rules", "nat", ActionType.open_port, ["show nat rules", "read nat rules"], AiRiskLevel.low, true, [], [], unsupported),
  e("pfsense", "create_port_forward", "Create port forward plan", "nat", ActionType.open_port, ["create port forward", "add port forward"], AiRiskLevel.high, false, ["port", "destinationIp"], [], unsupported),
  e("pfsense", "read_routes", "Read routes", "routing", ActionType.open_port, ["show routes", "read routes"], AiRiskLevel.low, true, [], [], unsupported),
  e("pfsense", "read_gateway_status", "Read gateway status", "routing", ActionType.open_port, ["show gateway status", "read gateways"], AiRiskLevel.low, true, [], [], unsupported)
]);

