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
const WEAK_PROPOSAL_PATTERN = /(?:^|-)(?:des|3des|md5|sha1)(?:-|$)/i;
const STRONG_PROPOSALS = new Set([
  "aes256-sha256",
  "aes256-sha384",
  "aes256-sha512",
  "aes128-sha256",
  "aes128-sha384",
  "aes128-sha512",
]);

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
  return typeof value === "string" && net.isIP(value.trim()) === 4;
}

export function fortiVpnSubnet(value: unknown) {
  if (!validSubnet(value)) return null;
  const number = (ip: string) => ip.split(".").reduce((sum, part) => ((sum << 8) | Number(part)) >>> 0, 0);
  const parts = String(value).trim().split(/\s+/), [ip, prefix] = parts[0].split("/");
  const bits = parts.length === 2 ? number(parts[1]) : Number(prefix) === 0 ? 0 : (0xffffffff << (32 - Number(prefix))) >>> 0;
  const inverse = (~bits) >>> 0, start = (number(ip) & bits) >>> 0;
  if (!bits || ((inverse + 1) & inverse) !== 0 || start !== number(ip)) return null;
  return { start, end: (start | inverse) >>> 0 };
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
    ["remoteGateway", "IPv4 address"],
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
  for (const field of ["vpnName", "phase1Name"] as const) if (String(p[field] ?? "").length > 15) issues.push(validationError(field, "نام تونل FortiOS حداکثر ۱۵ نویسه است.", p[field], "BranchVPN"));
  if (p.wanInterface === p.lanInterface) issues.push(validationError("lanInterface", "پورت WAN و LAN باید متفاوت باشند.", p.lanInterface, "separate LAN interface"));
  if (!["14", "19", "20", "21"].includes(String(p.dhGroup))) issues.push(validationError("dhGroup", "Only approved DH groups are allowed.", p.dhGroup, "14, 19, 20, 21"));
  if (String(p.ikeVersion) !== "2") issues.push(validationError("ikeVersion", "This Site-to-Site workflow requires IKEv2.", p.ikeVersion, "2"));
  if (!Number.isInteger(Number(p.routeDistance)) || Number(p.routeDistance) < 1 || Number(p.routeDistance) > 254) issues.push(validationError("routeDistance", "Route distance must be 1..254.", p.routeDistance, "1..254"));
  const local = fortiVpnSubnet(p.localSubnet), remote = fortiVpnSubnet(p.remoteSubnet);
  if (!local) issues.push(validationError("localSubnet", "یک آدرس شبکه IPv4 با ماسک پیوسته وارد کنید؛ مسیر پیش‌فرض مجاز نیست.", p.localSubnet, "192.168.7.0/24"));
  if (!remote) issues.push(validationError("remoteSubnet", "یک آدرس شبکه IPv4 با ماسک پیوسته وارد کنید؛ مسیر پیش‌فرض مجاز نیست.", p.remoteSubnet, "10.20.30.0/24"));
  if (local && remote && local.start <= remote.end && remote.start <= local.end) issues.push(validationError("remoteSubnet", "شبکه‌های دو طرف هم‌پوشانی دارند.", p.remoteSubnet, "non-overlapping network"));
  if (p.remoteGateway !== undefined && !validGateway(p.remoteGateway)) issues.push(validationError("remoteGateway", "remoteGateway must be a valid IPv4 address.", p.remoteGateway, "IPv4 address"));
  if (p.localSubnet !== undefined && !validSubnet(p.localSubnet)) issues.push(validationError("localSubnet", "localSubnet must be a valid IPv4 CIDR or address/mask.", p.localSubnet, "IPv4 CIDR or address/mask"));
  if (p.remoteSubnet !== undefined && !validSubnet(p.remoteSubnet)) issues.push(validationError("remoteSubnet", "remoteSubnet must be a valid IPv4 CIDR or address/mask.", p.remoteSubnet, "IPv4 CIDR or address/mask"));
  const proposal = typeof p.proposal === "string" ? p.proposal.trim().toLowerCase() : "";
  if (!proposal || !/^[a-z0-9-]{3,80}$/.test(proposal)) {
    issues.push(validationError("proposal", "proposal must be a FortiOS proposal token.", p.proposal, "aes256-sha256"));
  } else if (WEAK_PROPOSAL_PATTERN.test(proposal) && p.allowWeakProposal !== true) {
    issues.push(validationError("proposal", "Weak FortiGate VPN proposals are blocked unless allowWeakProposal=true.", p.proposal, "aes256-sha256 or another approved AES/SHA2 proposal"));
  } else if (!STRONG_PROPOSALS.has(proposal) && p.allowWeakProposal !== true) {
    issues.push(validationError("proposal", "Only approved AES/SHA2 FortiGate VPN proposals are allowed by default.", p.proposal, "aes256-sha256"));
  }
  if (discoveredInterfaces) {
    for (const field of ["wanInterface", "lanInterface"] as const) {
      const value = String(p[field] ?? "");
      if (value && !discoveredInterfaces.has(value)) issues.push(validationError(field, `${field} was not found in FortiGate discovery.`, value, "FortiGate interface name discovered on device"));
    }
  }
  return { normalized: p, issues };
}
