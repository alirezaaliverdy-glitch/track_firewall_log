const REDACTION = "[REDACTED]";
const MAX_STRING_LENGTH = 20_000;
const MAX_ARRAY_ITEMS = 200;
const MAX_OBJECT_KEYS = 200;

const SENSITIVE_KEY = /(?:^|[_\-.])(password|passwd|passphrase|privatekey|private_key|private-key|psk|api[_\-.]?key|token|authorization|cookie|secret|credential)(?:$|[_\-.])/i;
const SAFE_REFERENCE_KEY = /(?:secret|credential)(?:Ref|Id)$/i;
const TERMINAL_CONTROL = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi;
const INLINE_SECRET = /\b(password|passwd|passphrase|psksecret|psk|api[_-]?key|token|authorization|private[_ -]?key|secret)\b\s*[:= ]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi;
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;

export const sensitiveLogPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.body.password",
  "req.body.passphrase",
  "req.body.privateKey",
  "req.body.token",
  "req.body.apiKey",
  "req.body.secret",
  "req.query.password",
  "req.query.passphrase",
  "req.query.privateKey",
  "req.query.token",
  "req.query.apiKey",
  "req.query.secret",
  "res.body.token",
  "res.body.password",
  "res.body.secret"
];

function truncate(value: string) {
  return value.length > MAX_STRING_LENGTH
    ? `${value.slice(0, MAX_STRING_LENGTH)}\n[TRUNCATED ${value.length - MAX_STRING_LENGTH} chars]`
    : value;
}

export function redactText(value: string) {
  const trimmedPrivateKey = value.replace(PRIVATE_KEY_BLOCK, REDACTION);
  const privateKeyMarker = /PRIVATE KEY/i.test(trimmedPrivateKey) ? REDACTION : trimmedPrivateKey;
  return truncate(privateKeyMarker
    .replace(TERMINAL_CONTROL, "")
    .replace(BEARER_TOKEN, `Bearer ${REDACTION}`)
    .replace(INLINE_SECRET, (_match, key: string) => `${key} ${REDACTION}`));
}

function shouldRedactKey(key: string) {
  const normalized = key.replace(/([a-z])([A-Z])/g, "$1_$2");
  return SENSITIVE_KEY.test(normalized) && !SAFE_REFERENCE_KEY.test(key);
}

export function redactForPersistence(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return redactText(value);
  if (typeof value !== "object" || value === null) return value;
  if (depth > 8) return "[REDACTED_DEPTH_LIMIT]";
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY_ITEMS).map((item) => redactForPersistence(item, depth + 1));

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
    result[key] = shouldRedactKey(key) ? REDACTION : redactForPersistence(item, depth + 1);
  }
  return result;
}
