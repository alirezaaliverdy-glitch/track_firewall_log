import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { isLinuxSshCapable, openLinuxTelemetryStream, resolveLinuxConnectionPort, type LinuxStreamSource } from "../../connectors/linux-ssh.connector.js";
import { redactLinuxTelemetry } from "./linux-telemetry.service.js";
import type { LinuxLiveLogEvent, LinuxTelemetrySeverity } from "./linux-telemetry.types.js";

const MAX_BUFFER = 500;
const MAX_RUNTIME_MS = 30 * 60 * 1000;
const allowedSources = new Set<LinuxStreamSource>(["auth", "system", "kernel", "firewall", "nginx", "docker"]);
type StreamHandle = { close: () => void };
type Session = { id: string; deviceId: string; sources: LinuxStreamSource[]; startedAt: Date; status: "starting" | "running" | "stopped"; warnings: string[]; events: LinuxLiveLogEvent[]; emitter: EventEmitter; handles: StreamHandle[]; timer: NodeJS.Timeout; counters: Map<string, number[]> };
const sessions = new Map<string, Session>();

function ip(line: string) { return line.match(/\b(?:from|SRC=)\s*=?\s*((?:\d{1,3}\.){3}\d{1,3})\b/i)?.[1]; }
function username(line: string) { return line.match(/(?:for|user)\s+(?:invalid user\s+)?([^\s]+)/i)?.[1]; }
function port(line: string) { const value = Number(line.match(/(?:port|DPT=)\s*=?\s*(\d{1,5})/i)?.[1]); return value > 0 && value <= 65535 ? value : undefined; }
function severityFor(line: string): LinuxTelemetrySeverity {
  return /accepted password.*root|out of memory|oom killer|segfault/i.test(line) ? "high" : /failed password|invalid user|authentication failure|ufw block|\b403\b|\b500\b/i.test(line) ? "medium" : "info";
}

export function parseLinuxLiveLogLine(source: LinuxStreamSource, line: string, context?: { repeated?: number }): Omit<LinuxLiveLogEvent, "streamId" | "deviceId"> {
  const raw = redactLinuxTelemetry(line).slice(0, 4000);
  const lower = raw.toLowerCase();
  const sourceIp = ip(raw);
  let summary = `${source} log event`;
  const tags: string[] = [source];
  let suspicious = false;
  if (/failed password|authentication failure/.test(lower)) { summary = "Failed SSH authentication"; tags.push("auth_failure"); suspicious = true; }
  else if (/invalid user/.test(lower)) { summary = "Invalid SSH user attempt"; tags.push("invalid_user"); suspicious = true; }
  else if (/accepted password|accepted publickey/.test(lower)) { summary = "Successful SSH login"; tags.push("auth_success"); }
  else if (/sudo.*authentication failure|incorrect password/.test(lower)) { summary = "Sudo authentication failure"; tags.push("sudo_failure"); suspicious = true; }
  else if (/ufw block|iptables.*drop|nft.*drop/.test(lower)) { summary = "Firewall blocked traffic"; tags.push("firewall_block"); suspicious = true; }
  else if (source === "nginx" && /\s(?:401|403|404)\s/.test(raw)) { summary = "Nginx denied/not-found response"; tags.push("web_denied"); suspicious = (context?.repeated ?? 0) >= 10; }
  else if (source === "nginx" && /\s5\d\d\s/.test(raw)) { summary = "Nginx server error"; tags.push("web_error"); suspicious = (context?.repeated ?? 0) >= 5; }
  else if (/oom|out of memory|segfault/.test(lower)) { summary = "Kernel/process stability warning"; tags.push("system_warning"); suspicious = true; }
  else if (source === "docker" && /error|failed|fatal/.test(lower)) { summary = "Docker daemon error"; tags.push("docker_error"); suspicious = true; }
  if ((context?.repeated ?? 0) >= 10) { suspicious = true; tags.push("repeated"); summary = `${summary} (${context?.repeated} recent)`; }
  const affectedUser = username(raw); const affectedPort = port(raw);
  if (/for root|invalid user root|accepted password for root/i.test(lower)) { tags.push("root_login"); suspicious = true; }
  return { source, timestamp: new Date().toISOString(), raw, parsed: { ...(sourceIp ? { sourceIp } : {}), ...(affectedUser ? { username: affectedUser } : {}), ...(affectedPort ? { port: affectedPort } : {}), repeated: context?.repeated ?? 0 }, severity: suspicious && (context?.repeated ?? 0) >= 20 ? "high" : severityFor(raw), tags, suspicious, summary };
}

function recentCount(session: Session, key: string) {
  const now = Date.now();
  const values = (session.counters.get(key) ?? []).filter((time) => now - time < 60_000);
  values.push(now);
  session.counters.set(key, values);
  return values.length;
}

async function storeSignal(event: LinuxLiveLogEvent) {
  if (!event.suspicious) return;
  await prisma.securityEvent.create({ data: {
    deviceId: event.deviceId, timestamp: new Date(event.timestamp), sourceType: `linux_live_${event.source}`, vendor: "linux", eventType: "live_telemetry_signal",
    action: event.tags[1] ?? "suspicious_activity", severity: event.severity, srcIp: typeof event.parsed.sourceIp === "string" ? event.parsed.sourceIp : undefined,
    rawMessage: event.raw, rawSnippet: event.raw, normalizedJson: event as unknown as Prisma.InputJsonValue,
    evidenceJson: { streamId: event.streamId, source: event.source } as Prisma.InputJsonValue,
    dedupeKey: crypto.createHash("sha256").update(`${event.streamId}|${event.source}|${event.timestamp}|${event.raw}`).digest("hex"),
    firstSeen: new Date(event.timestamp), lastSeen: new Date(event.timestamp), tags: { telemetry: true, suspicious: true } as Prisma.InputJsonValue
  } }).catch(() => undefined);
}

export async function startLinuxLogStream(deviceId: string, requestedSources: string[]) {
  const existing = Array.from(sessions.values()).find((item) => item.deviceId === deviceId && item.status !== "stopped");
  if (existing) return streamStatus(existing);
  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device) throw new Error("Selected Linux device does not exist.");
  if (!isLinuxSshCapable(device)) throw new Error("Selected device is not Linux/SSH capable.");
  if (!device.credentialId && !device.credentialRef) throw new Error("Linux device exists but no credential is configured.");
  const sources = Array.from(new Set(requestedSources)).filter((source): source is LinuxStreamSource => allowedSources.has(source as LinuxStreamSource));
  if (!sources.length) throw new Error("At least one supported log source is required.");
  const id = crypto.randomUUID();
  const session: Session = { id, deviceId, sources, startedAt: new Date(), status: "starting", warnings: [], events: [], emitter: new EventEmitter(), handles: [], timer: setTimeout(() => stopLinuxLogStream(id), MAX_RUNTIME_MS), counters: new Map() };
  sessions.set(id, session);
  for (const source of sources) {
    try {
      const handle = await openLinuxTelemetryStream(device, source, (line) => {
        const key = `${source}|${ip(line) ?? "none"}|${/\s(?:401|403|404|5\d\d)\s/.exec(line)?.[0] ?? "event"}`;
        const parsed = parseLinuxLiveLogLine(source, line, { repeated: recentCount(session, key) });
        const event: LinuxLiveLogEvent = { streamId: id, deviceId, ...parsed };
        session.events.push(event);
        if (session.events.length > MAX_BUFFER) session.events.shift();
        session.emitter.emit("event", event);
        void storeSignal(event);
      }, (warning) => { if (warning) { const safe = redactLinuxTelemetry(warning).slice(0, 300); session.warnings.push(safe); session.emitter.emit("warning", { streamId: id, deviceId, source, warning: safe, timestamp: new Date().toISOString() }); } });
      session.handles.push(handle);
    } catch (error) {
      session.warnings.push(`${source}: ${error instanceof Error ? error.message : "stream unavailable"}`);
    }
  }
  session.status = session.handles.length ? "running" : "stopped";
  if (!session.handles.length) {
    clearTimeout(session.timer);
    sessions.delete(id);
    throw new Error(`Linux telemetry could not connect to configured SSH endpoint ${device.host}:${resolveLinuxConnectionPort(device)}.`);
  }
  return { ...streamStatus(session), connection: { host: device.host, connectionPort: resolveLinuxConnectionPort(device) }, connectionPort: resolveLinuxConnectionPort(device) };
}

function streamStatus(session: Session) { return { streamId: session.id, deviceId: session.deviceId, sources: session.sources, startedAt: session.startedAt, status: session.status, warnings: session.warnings.slice(-20), bufferedEvents: session.events.length, maxRuntimeMinutes: MAX_RUNTIME_MS / 60000 }; }
export function getLinuxTelemetryStatus(deviceId: string) { const session = Array.from(sessions.values()).find((item) => item.deviceId === deviceId && item.status !== "stopped"); return session ? streamStatus(session) : { deviceId, status: "stopped", streamId: null, sources: [], warnings: [], bufferedEvents: 0 }; }
export function getLinuxLogStream(streamId: string) { return sessions.get(streamId) ?? null; }
export function subscribeLinuxLogStream(streamId: string, listener: (event: LinuxLiveLogEvent) => void) { const session = sessions.get(streamId); if (!session) return null; session.emitter.on("event", listener); return () => session.emitter.off("event", listener); }
export function subscribeLinuxLogWarnings(streamId: string, listener: (warning: Record<string, unknown>) => void) { const session = sessions.get(streamId); if (!session) return null; session.emitter.on("warning", listener); return () => session.emitter.off("warning", listener); }
export function stopLinuxLogStream(streamId: string) { const session = sessions.get(streamId); if (!session) return null; session.handles.forEach((handle) => handle.close()); session.handles = []; session.status = "stopped"; clearTimeout(session.timer); session.emitter.emit("stopped"); return streamStatus(session); }
export function stopAllLinuxLogStreams() { for (const session of sessions.values()) if (session.status !== "stopped") stopLinuxLogStream(session.id); }
