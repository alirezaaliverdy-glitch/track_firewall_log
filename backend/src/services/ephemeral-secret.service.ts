import crypto from "node:crypto";

type SecretRecord = {
  value: string;
  expiresAt: number;
  purpose: string;
};

const secrets = new Map<string, SecretRecord>();
const DEFAULT_TTL_MS = 30 * 60 * 1000;

function cleanup(now = Date.now()) {
  for (const [ref, record] of secrets.entries()) {
    if (record.expiresAt <= now) secrets.delete(ref);
  }
}

export function createEphemeralSecretRef(value: string, purpose: string, ttlMs = DEFAULT_TTL_MS) {
  cleanup();
  const secret = value.trim();
  if (!secret) throw new Error("SECRET_VALUE_REQUIRED");
  if (/[\n\r`|;]/.test(secret)) throw new Error("SECRET_VALUE_UNSAFE");
  const ref = `tmpsec_${crypto.randomUUID()}`;
  secrets.set(ref, { value: secret, purpose, expiresAt: Date.now() + ttlMs });
  return ref;
}

export function generateEphemeralSecretRef(purpose: string, ttlMs = DEFAULT_TTL_MS) {
  const value = crypto.randomBytes(24).toString("base64url");
  return createEphemeralSecretRef(value, purpose, ttlMs);
}

export function resolveEphemeralSecretRef(ref: string, purpose: string) {
  cleanup();
  const record = secrets.get(ref);
  if (!record || record.purpose !== purpose || record.expiresAt <= Date.now()) return undefined;
  return record.value;
}
