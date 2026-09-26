import { createHash } from "node:crypto";
import { Client, type ConnectConfig } from "ssh2";

export type SharedSshResult = { reachable: boolean; code: string; message: string; latencyMs: number };

export class SharedSshConnectionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "SharedSshConnectionError";
  }
}

type Entry = {
  key: string;
  client: Client | null;
  connected: boolean;
  pending: Promise<SharedSshResult> | null;
  queue: Promise<void>;
  busy: number;
  failures: number;
  nextAttemptAt: number;
  lastError: SharedSshResult | null;
  lastUsedAt: number;
};

const entries = new Map<string, Entry>();
const MAX_SESSIONS = 128;
const IDLE_MS = 10 * 60_000;
const MAX_BACKOFF_MS = 2 * 60_000;

function identity(config: ConnectConfig) {
  const secret = createHash("sha256")
    .update(String(config.password ?? ""))
    .update(String(config.privateKey ?? ""))
    .update(String(config.passphrase ?? ""))
    .update(JSON.stringify(config.algorithms ?? null))
    .update(String(config.tryKeyboard ?? false))
    .digest("hex");
  return [config.host, config.port ?? 22, config.username, secret].join(":");
}

function failure(error: unknown, elapsed: number): SharedSshResult {
  const source = error && typeof error === "object" ? error as { level?: string; code?: string; message?: string } : {};
  const message = String(source.message ?? "");
  const code = source.level === "client-authentication" || /authentication failed|all configured authentication methods failed/i.test(message)
    ? "SSH_AUTH_FAILED"
    : source.code === "ETIMEDOUT" || /timed out|timeout/i.test(message) ? "SSH_HANDSHAKE_TIMEOUT"
      : source.code === "ECONNREFUSED" ? "SSH_CONNECTION_REFUSED"
        : source.code === "ENETUNREACH" || source.code === "EHOSTUNREACH" ? "SSH_NETWORK_UNREACHABLE"
          : "SSH_SESSION_ERROR";
  const detail = code === "SSH_AUTH_FAILED" ? "SSH authentication was rejected."
    : code === "SSH_HANDSHAKE_TIMEOUT" ? "SSH handshake timed out."
      : code === "SSH_CONNECTION_REFUSED" ? "SSH service refused the connection."
        : code === "SSH_NETWORK_UNREACHABLE" ? "The network path to SSH is unavailable."
          : "SSH session could not be established.";
  return { reachable: false, code, message: detail, latencyMs: elapsed };
}

function drop(entry: Entry, client: Client, result: SharedSshResult) {
  if (entry.client !== client) return;
  entry.connected = false;
  entry.client = null;
  entry.lastError = result;
  entry.failures += 1;
  entry.nextAttemptAt = Date.now() + Math.min(MAX_BACKOFF_MS, 5_000 * 2 ** Math.min(entry.failures - 1, 5));
  client.end();
}

function close(entry: Entry) {
  const client = entry.client;
  entry.client = null;
  entry.connected = false;
  client?.end();
}

async function entryFor(deviceId: string, config: ConnectConfig) {
  const key = `${deviceId}:${identity(config)}`;
  let entry = entries.get(key);
  if (entry) return entry;
  // A changed address or credential may coexist briefly with an in-flight
  // operation, but never tears down that operation's transport.
  for (const [oldKey, oldEntry] of entries) {
    if (oldKey.startsWith(`${deviceId}:`) && oldEntry.busy === 0 && !oldEntry.pending) {
      entries.delete(oldKey);
      close(oldEntry);
    }
  }
  if (entries.size >= MAX_SESSIONS) {
    const idle = [...entries].filter(([, item]) => item.busy === 0 && !item.pending)
      .sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt)[0];
    if (!idle) throw new SharedSshConnectionError("SSH_POOL_LIMIT", "SSH session limit is reached.");
    entries.delete(idle[0]);
    close(idle[1]);
  }
  entry = { key, client: null, connected: false, pending: null, queue: Promise.resolve(), busy: 0, failures: 0, nextAttemptAt: 0, lastError: null, lastUsedAt: Date.now() };
  entries.set(key, entry);
  return entry;
}

async function ensure(entry: Entry, config: ConnectConfig): Promise<SharedSshResult> {
  entry.lastUsedAt = Date.now();
  if (entry.connected && entry.client) return { reachable: true, code: "SSH_SESSION_ALIVE", message: "Authenticated SSH session is active.", latencyMs: 0 };
  if (entry.pending) return entry.pending;
  if (Date.now() < entry.nextAttemptAt) return entry.lastError ?? { reachable: false, code: "SSH_RECONNECT_BACKOFF", message: "Waiting before SSH reconnect.", latencyMs: 0 };
  const started = Date.now();
  const client = new Client();
  entry.client = client;
  entry.pending = new Promise<SharedSshResult>((resolve) => {
    let settled = false;
    let deadline: NodeJS.Timeout | null = null;
    const finish = (result: SharedSshResult) => {
      if (settled) return;
      settled = true;
      if (deadline) clearTimeout(deadline);
      entry.pending = null;
      resolve(result);
    };
    client.once("ready", () => {
      if (entry.client !== client) return;
      entry.connected = true;
      entry.failures = 0;
      entry.nextAttemptAt = 0;
      entry.lastError = null;
      finish({ reachable: true, code: "SSH_SESSION_AUTHENTICATED", message: "Authenticated SSH session established.", latencyMs: Date.now() - started });
    });
    if (config.tryKeyboard && config.password) {
      client.on("keyboard-interactive", (_name, _instructions, _language, prompts, respond) => {
        respond(prompts.map(() => String(config.password)));
      });
    }
    client.on("error", (error) => {
      const result = failure(error, Date.now() - started);
      drop(entry, client, result);
      finish(result);
    });
    client.once("close", () => {
      const result = { reachable: false, code: "SSH_SESSION_CLOSED", message: "SSH session closed.", latencyMs: Date.now() - started };
      drop(entry, client, result);
      finish(result);
    });
    deadline = setTimeout(() => {
      const result = { reachable: false, code: "SSH_HANDSHAKE_TIMEOUT", message: "SSH connection deadline exceeded.", latencyMs: Date.now() - started };
      drop(entry, client, result);
      finish(result);
    }, Math.max(3_000, config.readyTimeout ?? 15_000) + 500);
    deadline.unref();
    queueMicrotask(() => {
      try {
        client.connect({ ...config, keepaliveInterval: 15_000, keepaliveCountMax: 2 });
      } catch (error) {
        const result = failure(error, Date.now() - started);
        drop(entry, client, result);
        finish(result);
      }
    });
  });
  return entry.pending;
}

export async function probeSharedSsh(deviceId: string, config: ConnectConfig): Promise<SharedSshResult> {
  const entry = await entryFor(deviceId, config);
  return ensure(entry, config);
}

export async function withSharedSsh<T>(deviceId: string, config: ConnectConfig, callback: (client: Client) => Promise<T>): Promise<T> {
  const entry = await entryFor(deviceId, config);
  const previous = entry.queue;
  let release!: () => void;
  entry.queue = new Promise<void>((resolve) => { release = resolve; });
  entry.busy += 1;
  try {
    await previous;
    const result = await ensure(entry, config);
    if (!result.reachable || !entry.client) throw new SharedSshConnectionError(result.code, result.message);
    return await callback(entry.client);
  } finally {
    entry.busy -= 1;
    entry.lastUsedAt = Date.now();
    release();
  }
}

export function closeSharedSshSessions() {
  for (const entry of entries.values()) close(entry);
  entries.clear();
}

const idleTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of entries) {
    if (entry.busy === 0 && !entry.pending && now - entry.lastUsedAt > IDLE_MS) {
      entries.delete(id);
      close(entry);
    }
  }
}, 60_000);
idleTimer.unref();
