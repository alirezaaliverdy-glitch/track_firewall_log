import { isIP } from "node:net";

function endpoint(value?: string) {
  if (!value) return undefined;
  const candidate = value.replace(/^["']|["',;]$/g, "");
  if (isIP(candidate)) return candidate;
  const bracketed = candidate.match(/^\[([^\]]+)\](?::\d+)?$/)?.[1];
  if (bracketed && isIP(bracketed)) return bracketed;
  const ipv4 = candidate.match(/^((?:\d{1,3}\.){3}\d{1,3}):\d+$/)?.[1];
  return ipv4 && isIP(ipv4) === 4 ? ipv4 : undefined;
}

// Prefer the message's remote source, never a syslog relay/router address in the
// header. RouterOS does not use OpenSSH's "for root from ..." account grammar.
export function parseMikroTikSecurityLog(raw: string) {
  const failed = /\blogin failure for user\s+(.*?)\s+from\s+(\S+)\s+via\s+(\S+)/i.exec(raw);
  const success = /\buser\s+(\S+)\s+logged in from\s+(\S+)\s+via\s+(\S+)/i.exec(raw);
  const explicit = raw.match(/(?:^|\s)src=("[^"]+"|[^\s;,]+)/i)?.[1];
  const flow = raw.match(/(\[[\da-f:]+\](?::\d+)?|(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?)\s*->\s*(\[[\da-f:]+\](?::\d+)?|(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?)/i);
  const login = failed ?? success;
  return { action: failed ? "auth_failed" : success ? "auth_success" : "unknown",
    srcIp: endpoint(explicit) ?? endpoint(login?.[2]) ?? endpoint(flow?.[1]),
    dstIp: endpoint(raw.match(/(?:^|\s)dst=([^\s;,]+)/i)?.[1]) ?? endpoint(flow?.[2]),
    username: login?.[1]?.trim() || undefined,
    protocol: login?.[3]?.replace(/[;,]$/, "").toLowerCase() };
}
