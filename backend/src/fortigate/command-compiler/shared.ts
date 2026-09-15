import net from "node:net";
import { ActionType, AiRiskLevel } from "@prisma/client";
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

export const MANAGED_PREFIX = "firewall-log-analyzer";
const SAFE_NAME = /^[A-Za-z0-9_.:-]{1,79}$/;
const SAFE_TEXT = /^[A-Za-z0-9_.:\/,@#() +*-]{1,180}$/;
const SAFE_ID = /^[0-9]{1,10}$/;
export const RAW_KEYS = new Set(["command", "cmd", "shell", "script", "exec", "args", "cli", "rawCli"]);
const BUILT_IN_SERVICES = new Set(["ALL", "HTTP", "HTTPS", "SSH", "DNS", "PING", "FTP", "SMTP", "POP3", "IMAP", "LDAP", "RDP", "TELNET", "SNMP"]);
const WEAK_IPSEC_PROPOSAL = /(?:^|-)(?:des|3des|md5|sha1)(?:-|$)/i;
const APPROVED_IPSEC_PROPOSALS = new Set(["aes256-sha256", "aes256-sha384", "aes256-sha512", "aes128-sha256", "aes128-sha384", "aes128-sha512"]);

export function fail(name: string): never {
  throw new Error(`${name} is invalid or missing.`);
}

export function rejectUnsafe(value: string, key: string) {
  if (/[\n\r;`|&]|[$][(]|\\$/.test(value)) throw new Error(`${key} contains unsafe characters.`);
  return value;
}

export function text(params: Record<string, unknown>, key: string, fallback?: string) {
  const value = typeof params[key] === "string" && String(params[key]).trim() ? String(params[key]).trim() : fallback;
  return value === undefined ? undefined : rejectUnsafe(value, key);
}

export function safeName(params: Record<string, unknown>, key: string, fallback?: string) {
  const value = text(params, key, fallback);
  if (!value || !SAFE_NAME.test(value)) fail(key);
  return value;
}

export function safeOptionalName(params: Record<string, unknown>, key: string) {
  const value = text(params, key);
  if (value !== undefined && !SAFE_NAME.test(value)) fail(key);
  return value;
}

export function safeText(params: Record<string, unknown>, key: string, fallback?: string) {
  const value = text(params, key, fallback);
  if (value !== undefined && !SAFE_TEXT.test(value)) throw new Error(`${key} contains unsupported characters.`);
  return value;
}

export function arrayNames(params: Record<string, unknown>, key: string, fallback?: string[]) {
  const raw = Array.isArray(params[key]) ? params[key] : typeof params[key] === "string" ? String(params[key]).split(",") : fallback ?? [];
  const values = raw.map((item) => safeName({ value: String(item).trim() }, "value")).filter(Boolean);
  if (values.length === 0) fail(key);
  return values;
}

export function policyId(params: Record<string, unknown>, key = "policyId") {
  const value = text(params, key);
  if (!value || !SAFE_ID.test(value)) fail(key);
  return value;
}

export function port(params: Record<string, unknown>, key: string) {
  const value = Number(params[key]);
  if (!Number.isInteger(value) || value < 1 || value > 65535) fail(key);
  return value;
}

export function portList(params: Record<string, unknown>, key: string) {
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

export function ipv4(value: string, key: string) {
  if (net.isIP(value) !== 4) fail(key);
  return value;
}

export function ipv4OrFqdn(value: string, key: string) {
  if (net.isIP(value) === 4) return value;
  if (/^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/.test(value)) return value;
  fail(key);
}

export function cidrOrIp(params: Record<string, unknown>, key: string) {
  const value = text(params, key) ?? fail(key);
  const [ip, prefix] = value.split("/");
  ipv4(ip, key);
  if (prefix !== undefined) {
    const n = Number(prefix);
    if (!Number.isInteger(n) || n < 0 || n > 32 || String(n) !== prefix) fail(key);
  }
  return value;
}

export function subnet(params: Record<string, unknown>) {
  const cidr = text(params, "sourceCidr") ?? text(params, "cidr") ?? text(params, "sourceIp") ?? text(params, "ip") ?? text(params, "address");
  if (!cidr) fail("cidr");
  const [ip, prefix] = cidr.split("/");
  ipv4(ip, "cidr");
  const bits = prefix === undefined ? 32 : Number(prefix);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) fail("cidr");
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return `${ip} ${[24, 16, 8, 0].map((shift) => (mask >>> shift) & 255).join(".")}`;
}

export function cidrToSubnet(value: string, key: string) {
  const addressMask = value.trim().split(/\s+/);
  if (addressMask.length === 2) {
    ipv4(addressMask[0], key);
    ipv4(addressMask[1], key);
    return `${addressMask[0]} ${addressMask[1]}`;
  }
  const [ip, prefix] = value.split("/");
  ipv4(ip, key);
  if (prefix === undefined) fail(key);
  const bits = Number(prefix);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32 || String(bits) !== prefix) fail(key);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return `${ip} ${[24, 16, 8, 0].map((shift) => (mask >>> shift) & 255).join(".")}`;
}

export function cidrList(params: Record<string, unknown>, key: string) {
  const raw = Array.isArray(params[key]) ? params[key] : typeof params[key] === "string" ? String(params[key]).split(",") : [];
  const values = raw.map((item) => String(item).trim()).filter(Boolean);
  if (values.length === 0) fail(key);
  return values.map((value) => ({ cidr: value, subnet: cidrToSubnet(value, key) }));
}

export function safeProposal(params: Record<string, unknown>, key = "proposal") {
  const value = (text(params, key, "aes256-sha256") ?? "aes256-sha256").toLowerCase();
  if (!/^[A-Za-z0-9-]{3,80}$/.test(value)) fail(key);
  if (WEAK_IPSEC_PROPOSAL.test(value) && params.allowWeakProposal !== true) throw new Error("Weak FortiGate VPN proposals are blocked unless allowWeakProposal=true.");
  if (!APPROVED_IPSEC_PROPOSALS.has(value) && params.allowWeakProposal !== true) throw new Error("Only approved AES/SHA2 FortiGate VPN proposals are allowed by default.");
  return value;
}

export function objectName(prefix: string, index: number) {
  const safe = prefix.replace(/[^A-Za-z0-9_.:-]/g, "-").slice(0, 64);
  return `${safe}-${index}`.slice(0, 79);
}

export function secretValue(params: Record<string, unknown>, key: string) {
  const value = typeof params[key] === "string" && String(params[key]).trim() ? String(params[key]).trim() : undefined;
  if (value !== undefined && /[\n\r`|;]/.test(value)) throw new Error(`${key} contains unsafe characters.`);
  return value;
}

export function fqdn(params: Record<string, unknown>) {
  const value = text(params, "fqdn") ?? text(params, "domain") ?? fail("fqdn");
  if (!/^\*?(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,63}$/.test(value)) fail("fqdn");
  return value;
}

export function ipRange(params: Record<string, unknown>) {
  const start = ipv4(text(params, "startIp") ?? text(params, "start") ?? fail("startIp"), "startIp");
  const end = ipv4(text(params, "endIp") ?? text(params, "end") ?? fail("endIp"), "endIp");
  return { start, end };
}

export function requireFeature(condition: boolean | undefined, code = "FORTIGATE_UNSUPPORTED_FEATURE") {
  if (condition === false) throw new Error(code);
}

export function assertNotBuiltinService(name: string) {
  if (BUILT_IN_SERVICES.has(name.toUpperCase())) throw new Error("Built-in FortiGate services cannot be overwritten or deleted.");
}

export function quote(value: string | number | boolean) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function block(lines: string[]) {
  return lines.join("\n");
}

export function spec(input: Omit<FortiGateCommandSpec, "write"> & { write?: boolean }): FortiGateCommandSpec {
  return { ...input, write: input.write ?? true };
}

export function managedComment(comment?: string) {
  const value = comment?.startsWith(MANAGED_PREFIX) ? comment : `${MANAGED_PREFIX} ${comment ?? "managed fortigate change"}`;
  return value.slice(0, 180);
}

export function result(input: Omit<FortiGateCompiledAction, "commandSpecs" | "warnings" | "rollbackJson"> & {
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

export function readOnly(command: string, category: string) {
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

export function withVdom(command: string, vdom?: string) {
  if (!vdom) return command;
  return block(["config vdom", `edit ${quote(vdom)}`, command, "end"]);
}

export function actionName(actionType: ActionType) {
  return String(actionType);
}
