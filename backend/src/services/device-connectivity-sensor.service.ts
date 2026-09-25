import net from "node:net";
import tls from "node:tls";
import { DeviceProtocol, DeviceStatus, EventSourceType, type Device, type DeviceConnectionChannel } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { closeSshMonitorSessions, probeSshMonitorSession } from "./ssh-monitor-session.service.js";

type SensorLogger = {
  info(payload: unknown, message?: string): void;
  warn(payload: unknown, message?: string): void;
  error(payload: unknown, message?: string): void;
};

type ProbeResult = {
  reachable: boolean;
  status: DeviceStatus;
  code: string;
  message: string;
  latencyMs: number;
  mode: "ssh_banner" | "tls_handshake" | "tcp_connect" | "passive_evidence";
};

type SensorDeviceState = {
  consecutiveFailures: number;
  status: DeviceStatus;
  checkedAt: Date;
  persistedAt: Date;
  lastSuccessAt: Date | null;
  latencyMs: number | null;
  code: string;
};

type SensorDevice = Device & { connectionChannels: DeviceConnectionChannel[] };

const runtime = {
  running: false,
  cycleRunning: false,
  startedAt: null as Date | null,
  lastCycleAt: null as Date | null,
  lastErrorCode: null as string | null,
  checked: 0,
  online: 0,
  degraded: 0,
  offline: 0,
  unknown: 0,
  transitions: 0
};

const deviceStates = new Map<string, SensorDeviceState>();
const verifiedUntil = new Map<string, number>();
const recoveryRefreshes = new Map<string, Promise<void>>();
let timer: NodeJS.Timeout | null = null;
let cyclePromise: Promise<void> | null = null;
const VERIFIED_COLLECTION_GRACE_MS = 20_000;

function bounded(value: string, limit = 240) {
  return Array.from(value)
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? " " : character;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function errorCode(error: unknown) {
  const source = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : {};
  const code = bounded(String(source.code ?? ""), 60).toUpperCase();
  if (code) return code;
  const message = bounded(String(source.message ?? error ?? ""), 120).toUpperCase();
  if (/TIMEOUT/.test(message)) return "CONNECTIVITY_TIMEOUT";
  if (/REFUSED/.test(message)) return "CONNECTION_REFUSED";
  if (/UNREACH/.test(message)) return "HOST_UNREACHABLE";
  return "CONNECTIVITY_PROBE_FAILED";
}

function failedProbe(startedAt: number, mode: ProbeResult["mode"], code: string, message: string): ProbeResult {
  return {
    reachable: false,
    status: DeviceStatus.error,
    code,
    message: bounded(message),
    latencyMs: Date.now() - startedAt,
    mode
  };
}

export function deriveConnectivityStatus(reachable: boolean, consecutiveFailures: number, offlineThreshold: number): DeviceStatus {
  if (reachable) return DeviceStatus.online;
  return consecutiveFailures >= Math.max(1, offlineThreshold) ? DeviceStatus.offline : DeviceStatus.error;
}

export function probeMode(protocol: DeviceProtocol, method: string, port: number): ProbeResult["mode"] {
  if (protocol === DeviceProtocol.ssh || method === "ssh") return "ssh_banner";
  if (protocol === DeviceProtocol.api || /api|restconf|netconf/i.test(method)) {
    return port === 80 || port === 8080 ? "tcp_connect" : "tls_handshake";
  }
  return "tcp_connect";
}

function managementChannel(device: SensorDevice) {
  return device.connectionChannels.find((channel) => channel.role === "management" && channel.enabled)
    ?? device.connectionChannels.find((channel) => channel.role === "management");
}

export function probeIntervalSeconds(device: Pick<SensorDevice, "protocol" | "connectionChannels">) {
  const management = managementChannel(device as SensorDevice);
  const method = management?.method ?? device.protocol;
  return method === "ssh" || device.protocol === DeviceProtocol.ssh
    ? Math.max(env.deviceConnectivityIntervalSeconds, env.deviceConnectivitySshIntervalSeconds)
    : env.deviceConnectivityIntervalSeconds;
}

function tcpProbe(host: string, port: number, timeoutMs: number): Promise<ProbeResult> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (result: ProbeResult) => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish({ reachable: true, status: DeviceStatus.online, code: "TCP_CONNECTED", message: "TCP endpoint accepted the connection.", latencyMs: Date.now() - startedAt, mode: "tcp_connect" }));
    socket.once("timeout", () => finish(failedProbe(startedAt, "tcp_connect", "TCP_TIMEOUT", `TCP connection timed out after ${timeoutMs}ms.`)));
    socket.once("error", (error) => finish(failedProbe(startedAt, "tcp_connect", errorCode(error), "TCP endpoint is not reachable.")));
  });
}

function sshBannerProbe(host: string, port: number, timeoutMs: number): Promise<ProbeResult> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    let banner = "";
    const finish = (result: ProbeResult) => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.on("data", (chunk) => {
      banner = `${banner}${chunk.toString("ascii")}`.slice(-1024);
      if (/(^|\r?\n)SSH-\d+\.\d+-/i.test(banner)) {
        finish({ reachable: true, status: DeviceStatus.online, code: "SSH_BANNER_VERIFIED", message: "SSH service banner was verified.", latencyMs: Date.now() - startedAt, mode: "ssh_banner" });
      }
    });
    socket.once("timeout", () => finish(failedProbe(startedAt, "ssh_banner", banner ? "SSH_BANNER_INVALID" : "SSH_BANNER_TIMEOUT", `SSH service did not provide a valid banner within ${timeoutMs}ms.`)));
    socket.once("end", () => finish(failedProbe(startedAt, "ssh_banner", "SSH_CONNECTION_CLOSED", "SSH endpoint closed before sending a valid banner.")));
    socket.once("error", (error) => finish(failedProbe(startedAt, "ssh_banner", errorCode(error), "SSH endpoint is not reachable.")));
  });
}

function tlsProbe(host: string, port: number, timeoutMs: number): Promise<ProbeResult> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port, rejectUnauthorized: false, ...(net.isIP(host) ? {} : { servername: host }) });
    let settled = false;
    const finish = (result: ProbeResult) => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("secureConnect", () => finish({ reachable: true, status: DeviceStatus.online, code: "TLS_HANDSHAKE_VERIFIED", message: "TLS management endpoint completed its handshake.", latencyMs: Date.now() - startedAt, mode: "tls_handshake" }));
    socket.once("timeout", () => finish(failedProbe(startedAt, "tls_handshake", "TLS_HANDSHAKE_TIMEOUT", `TLS handshake timed out after ${timeoutMs}ms.`)));
    socket.once("error", (error) => finish(failedProbe(startedAt, "tls_handshake", errorCode(error), "TLS management endpoint is not reachable.")));
  });
}

async function passiveProbe(deviceId: string, method: string): Promise<ProbeResult> {
  const startedAt = Date.now();
  const sourceType = method === "agent" ? EventSourceType.agent : EventSourceType.syslog;
  const source = await prisma.eventSource.findFirst({
    where: { deviceId, type: sourceType },
    orderBy: { lastSeenAt: "desc" },
    select: { lastSeenAt: true }
  });
  const freshnessMs = Math.max(30, env.deviceConnectivityIntervalSeconds * 3) * 1000;
  const fresh = Boolean(source?.lastSeenAt && Date.now() - source.lastSeenAt.getTime() <= freshnessMs);
  return fresh
    ? { reachable: true, status: DeviceStatus.online, code: "PASSIVE_HEARTBEAT_FRESH", message: `Recent ${method} evidence was received.`, latencyMs: Date.now() - startedAt, mode: "passive_evidence" }
    : { reachable: false, status: DeviceStatus.unknown, code: "PASSIVE_HEARTBEAT_STALE", message: `No recent ${method} heartbeat is available; connectivity cannot be confirmed.`, latencyMs: Date.now() - startedAt, mode: "passive_evidence" };
}

export async function probeDeviceConnectivity(device: SensorDevice): Promise<ProbeResult> {
  const management = managementChannel(device);
  const host = management?.host ?? device.host;
  const port = management?.port ?? device.managementPort;
  const method = management?.method ?? device.protocol;
  if (method === "agent" || method === "syslog") return passiveProbe(device.id, method);
  const mode = probeMode(device.protocol, method, port);
  if (mode === "ssh_banner") {
    const session = await probeSshMonitorSession(device, host, port);
    if (session) return { ...session, status: session.reachable ? DeviceStatus.online : DeviceStatus.error, mode: "ssh_banner" };
    return sshBannerProbe(host, port, env.deviceConnectivityTimeoutMs);
  }
  if (mode === "tls_handshake") return tlsProbe(host, port, env.deviceConnectivityTimeoutMs);
  return tcpProbe(host, port, env.deviceConnectivityTimeoutMs);
}

async function reconcileUnavailableAgentChannel(device: SensorDevice, now: Date) {
  const channel = device.connectionChannels.find((item) => item.role === "observability" && item.method === "agent");
  if (!channel) return;
  const settings = channel.settingsJson && typeof channel.settingsJson === "object" && !Array.isArray(channel.settingsJson)
    ? channel.settingsJson as Record<string, unknown>
    : {};
  if (settings.readiness === "ready") return;
  if (channel.status === "setup_required" && !channel.enabled && !channel.lastSuccessAt && settings.agentAvailable === false) return;
  const message = "Agent مستقل هنوز در این نسخه ارائه نشده است؛ پایش فعال از مسیر SSH تأییدشده انجام می‌شود.";
  await prisma.deviceConnectionChannel.update({
    where: { id: channel.id },
    data: {
      enabled: false,
      status: "setup_required",
      lastTestAt: now,
      lastSuccessAt: null,
      lastError: message,
      settingsJson: {
        ...settings,
        readiness: "setup_required",
        agentAvailable: false,
        prerequisites: ["Standalone agent package and enrollment are not available in this release"],
        prerequisitesFa: ["بسته نصب و ثبت Agent مستقل در این نسخه ارائه نشده است"]
      }
    }
  });
}

function queueRecoveryRefresh(device: SensorDevice, logger?: SensorLogger) {
  if (recoveryRefreshes.has(device.id)) return;
  const task = (async () => {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    try {
      if (device.type === "linux_edge" || /linux|ubuntu|debian|centos|rhel/i.test(`${device.vendor} ${device.type}`)) {
        const { refreshLinuxHealth } = await import("../monitoring/linux/linux-health.service.js");
        await refreshLinuxHealth(device.id);
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      const { runCollectorOnce } = await import("./collector.service.js");
      await runCollectorOnce(device.id);
      logger?.info({ deviceId: device.id }, "Recovered device sensors refreshed");
    } catch (error) {
      logger?.warn({ deviceId: device.id, code: errorCode(error) }, "Recovered device refresh did not complete");
    }
  })().finally(() => recoveryRefreshes.delete(device.id));
  recoveryRefreshes.set(device.id, task);
}

async function persistProbe(device: SensorDevice, originalResult: ProbeResult, now: Date, logger?: SensorLogger, refreshOnRecovery = true) {
  const previous = deviceStates.get(device.id);
  const graceActive = !originalResult.reachable && (verifiedUntil.get(device.id) ?? 0) > now.getTime();
  const result = graceActive
    ? { reachable: true, status: DeviceStatus.online, code: "RECENT_COLLECTION_VERIFIED", message: "A recent authenticated collection verified the device connection.", latencyMs: originalResult.latencyMs, mode: originalResult.mode }
    : originalResult;
  const consecutiveFailures = result.reachable ? 0 : (previous?.consecutiveFailures ?? 0) + 1;
  const nextStatus = result.status === DeviceStatus.unknown
    ? DeviceStatus.unknown
    : deriveConnectivityStatus(result.reachable, consecutiveFailures, env.deviceConnectivityOfflineThreshold);
  const lastSuccessAt = result.reachable ? now : previous?.lastSuccessAt ?? null;
  const transition = previous?.status !== nextStatus || device.status !== nextStatus;
  const heartbeatDue = !previous || now.getTime() - previous.persistedAt.getTime() >= env.deviceConnectivityHeartbeatSeconds * 1000;
  deviceStates.set(device.id, { consecutiveFailures, status: nextStatus, checkedAt: now, persistedAt: transition || heartbeatDue ? now : previous.persistedAt, lastSuccessAt, latencyMs: result.latencyMs, code: result.code });
  if (!transition && !heartbeatDue) return;

  const management = device.connectionChannels.find((channel) => channel.role === "management");
  const channelStatus = nextStatus === DeviceStatus.online ? "verified" : nextStatus === DeviceStatus.offline ? "offline" : nextStatus === DeviceStatus.error ? "degraded" : "unknown";
  const message = `${result.code}: ${result.message}`;
  await prisma.$transaction([
    prisma.device.update({ where: { id: device.id }, data: { status: nextStatus } }),
    prisma.deviceStatusCheck.create({ data: { deviceId: device.id, status: nextStatus, message, latencyMs: result.latencyMs } }),
    prisma.asset.updateMany({
      where: { deviceId: device.id, deletedAt: null },
      data: { healthState: nextStatus, ...(result.reachable ? { lastSeenAt: now } : {}) }
    }),
    ...(management ? [prisma.deviceConnectionChannel.update({
      where: { id: management.id },
      data: { status: channelStatus, lastTestAt: now, ...(result.reachable ? { lastSuccessAt: now, lastError: null } : { lastError: message }) }
    })] : []),
    ...(transition ? [prisma.auditLog.create({ data: {
      deviceId: device.id,
      action: `device.connectivity_${nextStatus}`,
      targetType: "device",
      targetId: device.id,
      dryRun: true,
      approvalStatus: "not_required",
      metadata: { sensor: "unified_connectivity", probeMode: result.mode, code: result.code, latencyMs: result.latencyMs, consecutiveFailures }
    } })] : [])
  ]);
  if (transition) runtime.transitions += 1;
  if (refreshOnRecovery && nextStatus === DeviceStatus.online && previous?.status !== DeviceStatus.online && device.status !== DeviceStatus.online) {
    queueRecoveryRefresh(device, logger);
  }
}

export async function recordVerifiedDeviceConnectivity(deviceId: string, code: string, message: string, latencyMs = 0) {
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    include: { connectionChannels: { orderBy: [{ priority: "asc" }, { role: "asc" }] } }
  });
  if (!device) return false;
  const now = new Date();
  verifiedUntil.set(deviceId, now.getTime() + VERIFIED_COLLECTION_GRACE_MS);
  await persistProbe(device, {
    reachable: true,
    status: DeviceStatus.online,
    code: bounded(code, 60) || "AUTHENTICATED_COLLECTION_VERIFIED",
    message: bounded(message),
    latencyMs: Math.max(0, Math.round(latencyMs)),
    mode: probeMode(device.protocol, managementChannel(device)?.method ?? device.protocol, managementChannel(device)?.port ?? device.managementPort)
  }, now, undefined, false);
  return true;
}

export async function runDeviceConnectivityCycle(logger?: SensorLogger) {
  runtime.cycleRunning = true;
  try {
    const devices = await prisma.device.findMany({
      where: { deletedAt: null },
      include: { connectionChannels: { orderBy: [{ priority: "asc" }, { role: "asc" }] } },
      orderBy: { id: "asc" }
    });
    const counters = { online: 0, degraded: 0, offline: 0, unknown: 0 };
    for (let offset = 0; offset < devices.length; offset += 10) {
      const batch = devices.slice(offset, offset + 10);
      await Promise.all(batch.map(async (device) => {
        try {
          const now = new Date();
          await reconcileUnavailableAgentChannel(device, now);
          const previous = deviceStates.get(device.id);
          if (previous && now.getTime() - previous.checkedAt.getTime() < probeIntervalSeconds(device) * 1000) {
            if (previous.status === DeviceStatus.online) counters.online += 1;
            else if (previous.status === DeviceStatus.offline) counters.offline += 1;
            else if (previous.status === DeviceStatus.error) counters.degraded += 1;
            else counters.unknown += 1;
            return;
          }
          const result = await probeDeviceConnectivity(device);
          await persistProbe(device, result, new Date(), logger);
          const status = deviceStates.get(device.id)?.status ?? DeviceStatus.unknown;
          if (status === DeviceStatus.online) counters.online += 1;
          else if (status === DeviceStatus.offline) counters.offline += 1;
          else if (status === DeviceStatus.error) counters.degraded += 1;
          else counters.unknown += 1;
        } catch (error) {
          counters.degraded += 1;
          logger?.warn({ deviceId: device.id, code: errorCode(error) }, "Unified device connectivity probe failed");
        }
      }));
    }
    runtime.checked = devices.length;
    runtime.online = counters.online;
    runtime.degraded = counters.degraded;
    runtime.offline = counters.offline;
    runtime.unknown = counters.unknown;
    runtime.lastErrorCode = null;
  } catch (error) {
    runtime.lastErrorCode = errorCode(error);
    logger?.error({ code: runtime.lastErrorCode }, "Unified device connectivity cycle failed");
  } finally {
    runtime.lastCycleAt = new Date();
    runtime.cycleRunning = false;
  }
}

function triggerCycle(logger?: SensorLogger) {
  if (cyclePromise) return cyclePromise;
  cyclePromise = runDeviceConnectivityCycle(logger).finally(() => { cyclePromise = null; });
  return cyclePromise;
}

export function startDeviceConnectivitySensor(logger?: SensorLogger) {
  if (runtime.running || !env.deviceConnectivitySensorEnabled) return;
  runtime.running = true;
  runtime.startedAt = new Date();
  logger?.info({ intervalSeconds: env.deviceConnectivityIntervalSeconds, sshIntervalSeconds: env.deviceConnectivitySshIntervalSeconds, timeoutMs: env.deviceConnectivityTimeoutMs, offlineThreshold: env.deviceConnectivityOfflineThreshold }, "Unified device connectivity sensor started");
  void triggerCycle(logger);
  timer = setInterval(() => { void triggerCycle(logger); }, Math.max(1, env.deviceConnectivityIntervalSeconds) * 1000);
  timer.unref();
}

export async function stopDeviceConnectivitySensor() {
  runtime.running = false;
  if (timer) clearInterval(timer);
  timer = null;
  await cyclePromise;
  closeSshMonitorSessions();
}

export function getDeviceConnectivitySensorStatus() {
  return {
    enabled: env.deviceConnectivitySensorEnabled,
    running: runtime.running,
    cycleRunning: runtime.cycleRunning,
    intervalSeconds: env.deviceConnectivityIntervalSeconds,
    sshIntervalSeconds: env.deviceConnectivitySshIntervalSeconds,
    timeoutMs: env.deviceConnectivityTimeoutMs,
    offlineThreshold: env.deviceConnectivityOfflineThreshold,
    startedAt: runtime.startedAt,
    lastCycleAt: runtime.lastCycleAt,
    lastErrorCode: runtime.lastErrorCode,
    checked: runtime.checked,
    online: runtime.online,
    degraded: runtime.degraded,
    offline: runtime.offline,
    unknown: runtime.unknown,
    transitions: runtime.transitions,
    devices: [...deviceStates.entries()].map(([deviceId, state]) => ({ deviceId, ...state }))
  };
}
