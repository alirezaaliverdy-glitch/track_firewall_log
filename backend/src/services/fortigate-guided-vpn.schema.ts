import net from "node:net";
import { validationError, type StructuredValidationError } from "../actions/action-validators.js";

const CONTROL_TOKENS = new Set([
  "guided_action_wizard",
  "command_catalog",
  "command_search_ai_fallback",
  "ai_mapped_template",
  "fortigate_guided_vpn_setup",
  "vpn",
]);

const SAFE_NAME = /^[A-Za-z0-9_.:-]{1,79}$/;
const SAFE_FQDN = /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

function text(input: Record<string, unknown>, keys: string[], fallback?: string) {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

function bool(input: Record<string, unknown>, keys: string[], fallback: boolean) {
  for (const key of keys) {
    if (typeof input[key] === "boolean") return input[key] as boolean;
    if (typeof input[key] === "string" && input[key].trim()) return ["true", "1", "yes", "enable", "enabled"].includes(input[key].trim().toLowerCase());
  }
  return fallback;
}

export function isFortiGateControlToken(value: unknown) {
  return typeof value === "string" && CONTROL_TOKENS.has(value.trim().toLowerCase());
}

export function normalizeFortiGateGuidedVpnParameters(input: Record<string, unknown>): Record<string, unknown> {
  const vpnName = text(input, ["vpnName", "name", "tunnelName"]);
  const phase1Name = text(input, ["phase1Name"], vpnName);
  const phase2Name = text(input, ["phase2Name"], phase1Name ? `${phase1Name}-p2` : undefined);
  const localSubnet = text(input, ["localSubnet", "localCidr", "localNetwork"]) ?? (Array.isArray(input.localSubnets) ? String(input.localSubnets[0] ?? "").trim() : text(input, ["localSubnets"]));
  const remoteSubnet = text(input, ["remoteSubnet", "remoteCidr", "remoteNetwork"]) ?? (Array.isArray(input.remoteSubnets) ? String(input.remoteSubnets[0] ?? "").trim() : text(input, ["remoteSubnets"]));
  const normalized = {
    ...input,
    vpnType: text(input, ["vpnType"], "ipsec_site_to_site"),
    authMethod: text(input, ["authMethod"], "psk"),
    vpnName,
    phase1Name,
    phase2Name,
    name: vpnName,
    wanInterface: text(input, ["wanInterface", "dstInterface", "gatewayInterface", "remoteGatewayInterface", "wan"]),
    lanInterface: text(input, ["lanInterface", "srcInterface", "internalInterface", "localInterface", "lan"]),
    remoteGateway: text(input, ["remoteGateway", "gateway", "peer", "remotePeer"]),
    localSubnet,
    remoteSubnet,
    localSubnets: localSubnet ? [localSubnet] : [],
    remoteSubnets: remoteSubnet ? [remoteSubnet] : [],
    proposal: text(input, ["proposal"], "aes256-sha256"),
    dhGroup: text(input, ["dhGroup", "dhgrp"], "14"),
    ikeVersion: text(input, ["ikeVersion"], "2"),
    natTraversal: bool(input, ["natTraversal", "nattraversal"], true),
    createFirewallPolicy: bool(input, ["createFirewallPolicy"], true),
    createStaticRoute: bool(input, ["createStaticRoute"], true),
    natEnabled: bool(input, ["natEnabled"], false),
    logTraffic: bool(input, ["logTraffic"], true),
    enableAfterCreate: bool(input, ["enableAfterCreate"], true),
    routeDistance: input.routeDistance ?? 10,
    comments: text(input, ["comments", "comment"]),
    localAddressObjectName: text(input, ["localAddressObjectName"]),
    remoteAddressObjectName: text(input, ["remoteAddressObjectName"]),
    policyName: text(input, ["policyName"]),
  };
  delete (normalized as Record<string, unknown>).srcInterface;
  delete (normalized as Record<string, unknown>).dstInterface;
  return normalized;
}

function validSubnet(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return false;
  const parts = value.trim().split(/\s+/);
  if (parts.length === 2) return net.isIP(parts[0]) === 4 && net.isIP(parts[1]) === 4;
  const [ip, prefix] = value.trim().split("/");
  return net.isIP(ip) === 4 && prefix !== undefined && Number.isInteger(Number(prefix)) && Number(prefix) >= 0 && Number(prefix) <= 32;
}

function validGateway(value: unknown) {
  return typeof value === "string" && (net.isIP(value.trim()) === 4 || SAFE_FQDN.test(value.trim()));
}

function validName(value: unknown) {
  return typeof value === "string" && SAFE_NAME.test(value.trim()) && !isFortiGateControlToken(value);
}

export function validateFortiGateGuidedVpnParameters(parameters: Record<string, unknown>, discoveredInterfaces?: Set<string>) {
  const p = normalizeFortiGateGuidedVpnParameters(parameters);
  const issues: StructuredValidationError[] = [];
  const required: Array<[string, string]> = [
    ["vpnName", "VPN name, for example branch-office-vpn"],
    ["phase1Name", "FortiGate phase1 name, for example branch-office-vpn"],
    ["phase2Name", "FortiGate phase2 name, for example branch-office-vpn-p2"],
    ["wanInterface", "FortiGate interface name, for example port2 or wan1"],
    ["lanInterface", "FortiGate interface name, for example port1 or internal"],
    ["remoteGateway", "IPv4 address or FQDN, for example 185.238.45.165"],
    ["localSubnet", "IPv4 CIDR or address/mask, for example 192.168.7.0/24"],
    ["remoteSubnet", "IPv4 CIDR or address/mask, for example 10.20.30.0/24"],
    ["pskSecretRef", "temporary PSK secret reference"],
  ];
  for (const [field, expected] of required) {
    if (typeof p[field] !== "string" || !String(p[field]).trim()) issues.push(validationError(field, `${field} is required.`, p[field], expected));
  }
  for (const field of ["vpnName", "phase1Name", "phase2Name", "wanInterface", "lanInterface"] as const) {
    if (p[field] !== undefined && !validName(p[field])) issues.push(validationError(field, `${field} has an invalid value.`, p[field], field.includes("Interface") ? "FortiGate interface name, not an internal action/source token" : "safe FortiGate object name"));
  }
  if (p.remoteGateway !== undefined && !validGateway(p.remoteGateway)) issues.push(validationError("remoteGateway", "remoteGateway must be a valid IPv4 address or FQDN.", p.remoteGateway, "IPv4 address or FQDN"));
  if (p.localSubnet !== undefined && !validSubnet(p.localSubnet)) issues.push(validationError("localSubnet", "localSubnet must be a valid IPv4 CIDR or address/mask.", p.localSubnet, "IPv4 CIDR or address/mask"));
  if (p.remoteSubnet !== undefined && !validSubnet(p.remoteSubnet)) issues.push(validationError("remoteSubnet", "remoteSubnet must be a valid IPv4 CIDR or address/mask.", p.remoteSubnet, "IPv4 CIDR or address/mask"));
  if (discoveredInterfaces && discoveredInterfaces.size > 0) {
    for (const field of ["wanInterface", "lanInterface"] as const) {
      const value = String(p[field] ?? "");
      if (value && !discoveredInterfaces.has(value)) issues.push(validationError(field, `${field} was not found in FortiGate discovery.`, value, "FortiGate interface name discovered on device"));
    }
  }
  return { normalized: p, issues };
}
