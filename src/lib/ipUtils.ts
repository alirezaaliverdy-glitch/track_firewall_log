// ---------------------------------------------------------------------------
// IP address utilities
// All functions are pure and safe — they return false for any falsy input
// rather than throwing, so detections can call them without null-checks.
// ---------------------------------------------------------------------------

/**
 * Parse an IPv4 address string into a 32-bit unsigned integer.
 * Returns NaN if the string is not a valid IPv4 address.
 */
function ipToInt(ip: string): number {
  const parts = ip.split(".");
  if (parts.length !== 4) return NaN;
  let result = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return NaN;
    result = (result * 256 + n) >>> 0;
  }
  return result;
}

/**
 * Returns true when the string is a syntactically valid IPv4 address.
 * Does not perform DNS resolution — purely syntactic.
 */
export function isValidIp(ip?: string): boolean {
  if (!ip) return false;
  return !Number.isNaN(ipToInt(ip));
}

/**
 * Returns true when the IP falls in any of the well-known private/reserved ranges:
 *   10.0.0.0/8       — private Class A
 *   172.16.0.0/12    — private Class B
 *   192.168.0.0/16   — private Class C
 *   127.0.0.0/8      — loopback
 *   169.254.0.0/16   — link-local (APIPA)
 *
 * Returns false for invalid or missing input.
 */
export function isPrivateIp(ip?: string): boolean {
  if (!ip) return false;
  const n = ipToInt(ip);
  if (Number.isNaN(n)) return false;

  // 10.0.0.0/8  — 0x0A000000 … 0x0AFFFFFF
  if (n >= 0x0a000000 && n <= 0x0affffff) return true;
  // 172.16.0.0/12 — 0xAC100000 … 0xAC1FFFFF
  if (n >= 0xac100000 && n <= 0xac1fffff) return true;
  // 192.168.0.0/16 — 0xC0A80000 … 0xC0A8FFFF
  if (n >= 0xc0a80000 && n <= 0xc0a8ffff) return true;
  // 127.0.0.0/8 — loopback
  if (n >= 0x7f000000 && n <= 0x7fffffff) return true;
  // 169.254.0.0/16 — link-local
  if (n >= 0xa9fe0000 && n <= 0xa9feffff) return true;

  return false;
}

/**
 * Returns true when the IP is valid AND not in any private/reserved range.
 */
export function isPublicIp(ip?: string): boolean {
  return isValidIp(ip) && !isPrivateIp(ip);
}
