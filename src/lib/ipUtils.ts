export type IpCategory = "private" | "public" | "loopback" | "link-local" | "invalid" | "missing";

function normalizeIp(ip: unknown): string | undefined {
  if (ip === null || ip === undefined) return undefined;
  const value = String(ip).trim();
  return value === "" ? undefined : value;
}

function ipToInt(ip: string): number {
  const parts = ip.split(".");
  if (parts.length !== 4) return NaN;

  let result = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return NaN;
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return NaN;
    result = (result * 256 + n) >>> 0;
  }
  return result;
}

export function isValidIp(ip: unknown): boolean {
  const normalized = normalizeIp(ip);
  if (!normalized) return false;
  return !Number.isNaN(ipToInt(normalized));
}

export function isLoopbackIp(ip: unknown): boolean {
  const normalized = normalizeIp(ip);
  if (!normalized) return false;
  const n = ipToInt(normalized);
  return !Number.isNaN(n) && n >= 0x7f000000 && n <= 0x7fffffff;
}

export function isLinkLocalIp(ip: unknown): boolean {
  const normalized = normalizeIp(ip);
  if (!normalized) return false;
  const n = ipToInt(normalized);
  return !Number.isNaN(n) && n >= 0xa9fe0000 && n <= 0xa9feffff;
}

export function isPrivateIp(ip: unknown): boolean {
  const normalized = normalizeIp(ip);
  if (!normalized) return false;
  const n = ipToInt(normalized);
  if (Number.isNaN(n)) return false;

  if (n >= 0x0a000000 && n <= 0x0affffff) return true;
  if (n >= 0xac100000 && n <= 0xac1fffff) return true;
  if (n >= 0xc0a80000 && n <= 0xc0a8ffff) return true;
  return false;
}

export function isPublicIp(ip: unknown): boolean {
  return isValidIp(ip) && !isPrivateIp(ip) && !isLoopbackIp(ip) && !isLinkLocalIp(ip);
}

export function getIpCategory(ip: unknown): IpCategory {
  const normalized = normalizeIp(ip);
  if (!normalized) return "missing";
  if (!isValidIp(normalized)) return "invalid";
  if (isLoopbackIp(normalized)) return "loopback";
  if (isLinkLocalIp(normalized)) return "link-local";
  if (isPrivateIp(normalized)) return "private";
  return "public";
}
