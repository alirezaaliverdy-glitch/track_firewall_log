import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { isCurrentCollectorState, selectCollector } from "../collectors/collector-registry.service.js";
import { reconcileCollectorStates, runCollectorOnce } from "./collector.service.js";
import { retryFailedSecurityAlertDeliveries } from "./security-alert-email.service.js";
import { accountMonitoringSchedule, effectiveCollectorIntervalSeconds, isCollectorDue } from "./security-monitor-schedule.js";
import { getDetectionDispatcherStatus, scheduleSecurityDetection } from "./security-detection-dispatcher.service.js";
import { getDeviceConnectivitySensorStatus } from "./device-connectivity-sensor.service.js";
import { monitoringCoverage } from "../monitoring/monitoring-coverage.js";
import type { Prisma } from "@prisma/client";
import { securityChangePage } from "./security-change-page.js";

type MonitorLogger = {
  info(payload: unknown, message?: string): void;
  warn(payload: unknown, message?: string): void;
  error(payload: unknown, message?: string): void;
};

const runtime = {
  running: false,
  cycleRunning: false,
  startedAt: null as Date | null,
  lastCycleAt: null as Date | null,
  lastDetectionAt: null as Date | null,
  lastReconciledAt: null as Date | null,
  lastErrorCode: null as string | null,
  collectorsAttempted: 0,
  collectorsSucceeded: 0,
  collectorsFailed: 0,
  lastDetection: null as null | { rulesEvaluated: number; eventsEvaluated: number; findingsCreated: number; findingsUpdated: number },
  lastEmailRetry: null as null | { attempted: number; sent: number; failed: number }
};

let timer: NodeJS.Timeout | null = null;
let cyclePromise: Promise<void> | null = null;
let detectionSweepCursor: Date | null = null;

function safeErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/CREDENTIAL/i.test(message)) return "COLLECTOR_CREDENTIAL_MISSING";
  if (/AUTH/i.test(message)) return "COLLECTOR_AUTH_FAILED";
  if (/TIMEOUT|TIMED.OUT/i.test(message)) return "COLLECTOR_TIMEOUT";
  if (/CONNECTION|CONNECT|ECONN/i.test(message)) return "COLLECTOR_CONNECTION_FAILED";
  return "SECURITY_MONITOR_CYCLE_FAILED";
}

async function reconcileIfDue(now: Date) {
  if (runtime.lastReconciledAt && now.getTime() - runtime.lastReconciledAt.getTime() < 60_000) return;
  await reconcileCollectorStates();
  runtime.lastReconciledAt = now;
}

async function runDueCollectors(logger?: MonitorLogger) {
  const states = await prisma.eventCollectorState.findMany({ where: { enabled: true }, include: { device: true } });
  const due = states.filter((state) => {
    const collector = selectCollector(state.device);
    return state.device.status !== "offline" && collector?.stateSourceType === state.sourceType && isCollectorDue(accountMonitoringSchedule(state, state.sourceType));
  });
  for (let offset = 0; offset < due.length; offset += 3) {
    const batch = due.slice(offset, offset + 3);
    const results = await Promise.allSettled(batch.map((state) => runCollectorOnce(state.deviceId)));
    runtime.collectorsAttempted += results.length;
    results.forEach((result, index) => {
      if (result.status === "fulfilled") runtime.collectorsSucceeded += 1;
      else {
        runtime.collectorsFailed += 1;
        logger?.warn({ deviceId: batch[index].deviceId, code: safeErrorCode(result.reason) }, "Continuous security collector failed");
      }
    });
  }
}

async function detectChangedDevices(through: Date) {
  const since = detectionSweepCursor ? new Date(detectionSweepCursor.getTime() - 5000) : new Date(through.getTime() - 15 * 60_000);
  const total = { rulesEvaluated: 0, eventsEvaluated: 0, findingsCreated: 0, findingsUpdated: 0 };
  let after: string | undefined;
  // Stable pages over a fixed window; do not lose the 101st device or advance on failure.
  for (;;) {
    const changed = await securityChangePage(since, through, after);
  const results = await Promise.allSettled(changed.map((event) => scheduleSecurityDetection({ deviceId: event.deviceId! })));
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  const completed = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  Object.assign(total, completed.reduce((total, result) => ({
    rulesEvaluated: total.rulesEvaluated + result.rulesEvaluated,
    eventsEvaluated: total.eventsEvaluated + result.eventsEvaluated,
    findingsCreated: total.findingsCreated + result.findingsCreated,
    findingsUpdated: total.findingsUpdated + result.findingsUpdated
  }), total));
  if (changed.length < 100) break;
  after = changed[changed.length - 1].deviceId!;
  }
  detectionSweepCursor = through;
  return total;
}

export async function runSecurityMonitorCycle(logger?: MonitorLogger) {
  const now = new Date();
  runtime.cycleRunning = true;
  try {
    await reconcileIfDue(now);
    await runDueCollectors(logger);
    runtime.lastDetection = await detectChangedDevices(now);
    runtime.lastDetectionAt = new Date();
    runtime.lastErrorCode = null;
  } catch (error) {
    runtime.lastErrorCode = safeErrorCode(error);
    logger?.error({ code: runtime.lastErrorCode }, "Continuous security monitoring cycle failed");
  } finally {
    try {
      runtime.lastEmailRetry = await retryFailedSecurityAlertDeliveries();
    } catch {
      if (!runtime.lastErrorCode) runtime.lastErrorCode = "EMAIL_RETRY_CYCLE_FAILED";
      logger?.warn({ code: "EMAIL_RETRY_CYCLE_FAILED" }, "Security email retry cycle failed");
    }
    runtime.lastCycleAt = new Date();
    runtime.cycleRunning = false;
  }
}

function triggerCycle(logger?: MonitorLogger) {
  if (cyclePromise) return cyclePromise;
  cyclePromise = runSecurityMonitorCycle(logger).finally(() => { cyclePromise = null; });
  return cyclePromise;
}

export function startSecurityMonitor(logger?: MonitorLogger) {
  if (runtime.running || !env.securityMonitoringEnabled) return;
  runtime.running = true;
  runtime.startedAt = new Date();
  logger?.info({ tickSeconds: env.securityMonitorTickSeconds, collectorIntervalSeconds: env.securityCollectorIntervalSeconds }, "Continuous security monitoring started");
  void triggerCycle(logger);
  timer = setInterval(() => { void triggerCycle(logger); }, Math.max(1, env.securityMonitorTickSeconds) * 1000);
  timer.unref();
}

export async function stopSecurityMonitor() {
  runtime.running = false;
  if (timer) clearInterval(timer);
  timer = null;
  await cyclePromise;
}

export async function getSecurityMonitorStatus(ownerId?: string) {
  const deviceScope: Prisma.DeviceWhereInput = { deletedAt: null, ...(ownerId ? { company: { deletedAt: null, ownerId } } : { OR: [{ companyId: null }, { company: { deletedAt: null } }] }) };
  const [states, supportedDevices, enabledRules, alertChannels, pendingRetries] = await Promise.all([
    prisma.eventCollectorState.findMany({
      where: { device: deviceScope },
      orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }],
      include: { device: true }
    }),
    prisma.device.findMany({ where: deviceScope }),
    prisma.detectionRule.count({ where: { enabled: true } }),
    prisma.securityAlertChannel.count({ where: { enabled: true, recipientEmail: { not: null } } }),
    prisma.securityAlertDelivery.count({ where: { status: { in: ["pending", "failed"] } } })
  ]);
  const currentStates = states.filter((state) => !state.device.deletedAt && isCurrentCollectorState(state.device, state.sourceType));
  const collectorRows = currentStates.map(state => ({ ...state, effectiveIntervalSeconds: effectiveCollectorIntervalSeconds(accountMonitoringSchedule(state, state.sourceType)) }));
  const coverage = monitoringCoverage(supportedDevices.map(device => ({ ...device, liveCollectorSupported: Boolean(selectCollector(device)) })), collectorRows);
  const connectivity = getDeviceConnectivitySensorStatus();
  const visibleIds = new Set(supportedDevices.map(device => device.id));
  const connectivityDevices = connectivity.devices.filter(device => visibleIds.has(device.deviceId));
  return {
    enabled: env.securityMonitoringEnabled,
    running: runtime.running,
    cycleRunning: runtime.cycleRunning,
    tickSeconds: env.securityMonitorTickSeconds,
    defaultCollectorIntervalSeconds: env.securityCollectorIntervalSeconds,
    startedAt: runtime.startedAt,
    lastCycleAt: runtime.lastCycleAt,
    lastDetectionAt: runtime.lastDetectionAt,
    lastErrorCode: runtime.lastErrorCode,
    collectors: {
      supportedDevices: supportedDevices.filter(device => Boolean(selectCollector(device))).length,
      configured: currentStates.length,
      enabled: currentStates.filter((state) => state.enabled).length,
      attempted: runtime.collectorsAttempted,
      succeeded: runtime.collectorsSucceeded,
      failed: runtime.collectorsFailed,
      devices: currentStates.map((state) => ({
        deviceId: state.deviceId,
        deviceName: state.device.name,
        vendor: state.device.vendor,
        sourceType: state.sourceType,
        enabled: state.enabled,
        intervalSeconds: state.intervalSeconds,
        effectiveIntervalSeconds: effectiveCollectorIntervalSeconds(accountMonitoringSchedule(state, state.sourceType)),
        consecutiveIdleRuns: state.consecutiveIdleRuns,
        consecutiveFailures: state.consecutiveFailures,
        lastSuccessAt: state.lastSuccessAt,
        lastErrorAt: state.lastErrorAt,
        lastErrorCode: state.lastError ? safeErrorCode(state.lastError) : null
      }))
    },
    detection: { enabledRules, lastRun: runtime.lastDetection },
    dispatcher: getDetectionDispatcherStatus(),
    coverage,
    connectivity: { ...connectivity, devices: connectivityDevices, checked: connectivityDevices.length,
      online: connectivityDevices.filter(device => device.status === "online").length,
      degraded: connectivityDevices.filter(device => device.status === "error").length,
      offline: connectivityDevices.filter(device => device.status === "offline").length,
      unknown: connectivityDevices.filter(device => device.status === "unknown").length },
    email: { enabledChannels: alertChannels, pendingRetries, lastRetry: runtime.lastEmailRetry }
  };
}
