import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

type ApplicationSshContext = {
  deviceId: string;
  username: string;
};

export type ApplicationCommandProvenance = ApplicationSshContext & {
  fingerprints: string[];
  startedAt: Date;
  completedAt?: Date;
};

type CommandEvent = {
  deviceId: string;
  timestamp?: Date;
  rawSnippet?: string;
  message?: string;
};

const context = new AsyncLocalStorage<ApplicationSshContext>();
const records = new Map<string, ApplicationCommandProvenance[]>();
const RETENTION_MS = 2 * 60 * 60 * 1000;
const CLOCK_TOLERANCE_MS = 2 * 60 * 1000;
const MAX_RECORDS_PER_DEVICE = 2_000;

function normalizeExecutable(value: string) {
  return value.replace(/^\/(?:usr\/)?(?:s?bin)\//, "");
}

function canonicalCommand(value: string) {
  let command = value.trim().replace(/\s+/g, " ");
  command = command.replace(/^sudo(?:\s+-[A-Za-z]+|\s+--[A-Za-z-]+(?:=[^\s]+)?)*\s+/, "");
  const firstSpace = command.indexOf(" ");
  if (firstSpace < 0) return normalizeExecutable(command);
  return `${normalizeExecutable(command.slice(0, firstSpace))}${command.slice(firstSpace)}`;
}

function commandParts(command: string) {
  const parts = [command, ...command.split(/\s+(?:\|\||&&|;)\s+/)];
  return [...new Set(parts.map(canonicalCommand).filter(Boolean))];
}

function fingerprint(command: string) {
  return crypto.createHash("sha256").update(command).digest("hex");
}

function commandFingerprints(command: string) {
  return commandParts(command).map(fingerprint);
}

function prune(deviceId: string, now = Date.now()) {
  const kept = (records.get(deviceId) ?? [])
    .filter((record) => (record.completedAt ?? record.startedAt).getTime() >= now - RETENTION_MS)
    .slice(-MAX_RECORDS_PER_DEVICE);
  if (kept.length) records.set(deviceId, kept);
  else records.delete(deviceId);
}

export function withApplicationSshContext<T>(value: ApplicationSshContext, callback: () => T): T {
  return context.run(value, callback);
}

export async function trackApplicationSshCommand<T>(input: ApplicationSshContext & { command: string }, callback: () => Promise<T>): Promise<T> {
  const record: ApplicationCommandProvenance = {
    deviceId: input.deviceId,
    username: input.username,
    fingerprints: commandFingerprints(input.command),
    startedAt: new Date()
  };
  prune(input.deviceId, record.startedAt.getTime());
  const deviceRecords = records.get(input.deviceId) ?? [];
  deviceRecords.push(record);
  records.set(input.deviceId, deviceRecords.slice(-MAX_RECORDS_PER_DEVICE));
  try {
    return await callback();
  } finally {
    record.completedAt = new Date();
  }
}

export function trackCurrentApplicationSshCommand<T>(command: string, callback: () => Promise<T>): Promise<T> {
  const current = context.getStore();
  return current ? trackApplicationSshCommand({ ...current, command }, callback) : callback();
}

export function knownApplicationCommands(deviceId: string) {
  prune(deviceId);
  return [...(records.get(deviceId) ?? [])];
}

function sudoAuditIdentity(raw: string) {
  const actor = raw.match(/\bsudo(?:\[\d+\])?:\s*([^\s:]+)\s*:/i)?.[1];
  const command = raw.match(/(?:^|\s|;)COMMAND=(.+)$/)?.[1]?.trim();
  return actor && command ? { actor, fingerprint: fingerprint(canonicalCommand(command)) } : null;
}

const FIXED_COLLECTOR_READ_COMMANDS = [
  /^ufw status (?:verbose|numbered)$/,
  /^tail -n 500 \/var\/log\/(?:auth|ufw)\.log$/,
  /^journalctl -u ufw --since (?:'[^']+'|\S+) --no-pager -o short-iso$/
];

/** Historical collector reads can be recognized without a broad account
 * allowlist because both the integration account and an exact, fixed,
 * read-only collector command must match. */
export function matchesFixedCollectorRead(event: Pick<CommandEvent, "rawSnippet" | "message">, username?: string) {
  if (!username) return false;
  const identity = sudoAuditIdentity(event.rawSnippet ?? event.message ?? "");
  if (!identity || identity.actor.localeCompare(username, undefined, { sensitivity: "accent" }) !== 0) return false;
  return FIXED_COLLECTOR_READ_COMMANDS.some((pattern) => pattern.test(canonicalCommand(
    (event.rawSnippet ?? event.message ?? "").match(/(?:^|\s|;)COMMAND=(.+)$/)?.[1]?.trim() ?? ""
  )));
}

export function matchesApplicationCommand(event: CommandEvent, commandRecords = knownApplicationCommands(event.deviceId)) {
  const identity = sudoAuditIdentity(event.rawSnippet ?? event.message ?? "");
  const observedAt = event.timestamp?.getTime();
  if (!identity || !observedAt || !Number.isFinite(observedAt)) return false;
  return commandRecords.some((record) =>
    record.deviceId === event.deviceId &&
    record.username.localeCompare(identity.actor, undefined, { sensitivity: "accent" }) === 0 &&
    record.fingerprints.includes(identity.fingerprint) &&
    observedAt >= record.startedAt.getTime() - CLOCK_TOLERANCE_MS &&
    observedAt <= (record.completedAt ?? new Date()).getTime() + CLOCK_TOLERANCE_MS
  );
}

export function clearApplicationCommandProvenance() {
  records.clear();
}
