import type { FastifyRequest } from "fastify";

type RateLimitPolicy = {
  id: string;
  limit: number;
  windowMs: number;
};

type Entry = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  reasonCode: string;
};

export interface RateLimitStore {
  increment(key: string, windowMs: number, now: number): Entry;
  reset(key: string): void;
}

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<string, Entry>();

  increment(key: string, windowMs: number, now: number) {
    const current = this.entries.get(key);
    const entry = !current || current.resetAt <= now
      ? { count: 1, resetAt: now + windowMs }
      : { count: current.count + 1, resetAt: current.resetAt };
    this.entries.set(key, entry);
    return entry;
  }

  reset(key: string) {
    this.entries.delete(key);
  }
}

const store = new InMemoryRateLimitStore();

const LOGIN_POLICY: RateLimitPolicy = { id: "login", limit: 5, windowMs: 15 * 60_000 };
const LOGIN_IP_POLICY: RateLimitPolicy = { id: "login_ip", limit: 25, windowMs: 15 * 60_000 };
const ROUTE_POLICIES: RateLimitPolicy[] = [
  { id: "ai_chat", limit: 30, windowMs: 60_000 },
  { id: "action_proposal", limit: 20, windowMs: 60_000 },
  { id: "action_execution", limit: 5, windowMs: 60_000 },
  { id: "device_onboarding", limit: 10, windowMs: 10 * 60_000 },
  { id: "upload", limit: 10, windowMs: 60 * 60_000 }
];

function normalizePart(value: unknown) {
  return String(value ?? "unknown").trim().toLowerCase().slice(0, 256);
}

function resultForEntry(entry: Entry, policy: RateLimitPolicy, now: number): RateLimitResult {
  const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  return {
    allowed: entry.count <= policy.limit,
    retryAfterSeconds,
    reasonCode: `RATE_LIMIT_${policy.id.toUpperCase()}`
  };
}

export function assertLoginRateLimit(ip: string, username: string): RateLimitResult {
  const now = Date.now();
  const normalizedIp = normalizePart(ip);
  const ipEntry = store.increment(`${LOGIN_IP_POLICY.id}:${normalizedIp}`, LOGIN_IP_POLICY.windowMs, now);
  const ipResult = resultForEntry(ipEntry, LOGIN_IP_POLICY, now);
  if (!ipResult.allowed) return ipResult;
  const identityEntry = store.increment(`${LOGIN_POLICY.id}:${normalizedIp}:${normalizePart(username)}`, LOGIN_POLICY.windowMs, now);
  return resultForEntry(identityEntry, LOGIN_POLICY, now);
}

export function resetLoginRateLimit(ip: string, username: string) {
  store.reset(`${LOGIN_POLICY.id}:${normalizePart(ip)}:${normalizePart(username)}`);
}

function bodyValue(request: FastifyRequest, keys: string[]) {
  const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
  return keys.map((key) => body[key]).find((value) => value !== undefined);
}

function policyForRequest(pathname: string) {
  if (pathname === "/api/ai/chat") return ROUTE_POLICIES[0];
  if (/^\/api\/actions\/[^/]+\/(?:execute|quick-execute)$/.test(pathname)) return ROUTE_POLICIES[2];
  if (/^\/api\/actions(\/|$)/.test(pathname) || /^\/api\/action-center\//.test(pathname) || pathname === "/api/commands/ai-propose" || /\/create-action-plan$/.test(pathname)) return ROUTE_POLICIES[1];
  if (/^\/api\/device-onboarding\//.test(pathname) || /\/(?:test|test-connection|connection-test|verification\/retry)$/.test(pathname)) return ROUTE_POLICIES[3];
  if (pathname === "/api/uploads" || pathname === "/api/analysis/upload") return ROUTE_POLICIES[4];
  return null;
}

export function consumeRouteRateLimit(request: FastifyRequest, pathname: string): RateLimitResult | null {
  const policy = policyForRequest(pathname);
  if (!policy) return null;

  const user = request.authUser?.id ?? request.authUser?.username ?? request.ip;
  const target = policy.id === "device_onboarding"
    ? bodyValue(request, ["targetIp", "managementIp", "host", "ipAddress", "address"]) ?? pathname
    : policy.id === "action_execution"
      ? pathname
      : "route";
  const now = Date.now();
  const entry = store.increment(`${policy.id}:${normalizePart(user)}:${normalizePart(target)}`, policy.windowMs, now);
  return resultForEntry(entry, policy, now);
}
