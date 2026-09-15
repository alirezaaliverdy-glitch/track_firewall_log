import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { selectCollector } from "../collectors/collector-registry.service.js";
import { reconcileCollectorStates, runCollectorOnce } from "./collector.service.js";
import { retryFailedSecurityAlertDeliveries } from "./security-alert-email.service.js";
import { effectiveCollectorIntervalSeconds, isCollectorDue } from "./security-monitor-schedule.js";
import { getDetectionDispatcherStatus, scheduleSecurityDetection, wasDetectionRecentlyCompleted } from "./security-detection-dispatcher.service.js";

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
    return collector?.stateSourceType === state.sourceType && isCollectorDue(state);
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
  const since = detectionSweepCursor ?? new Date(through.getTime() - 15 * 60_000);
  const changed = await prisma.securityEvent.findMany({
    where: { deviceId: { not: null }, receivedAt: { gt: since, lte: through } },
    distinct: ["deviceId"],
    select: { deviceId: true },
    take: 100
  });
  const due = changed.filter((event) => !wasDetectionRecentlyCompleted({ deviceId: event.deviceId! }, since));
  const results = await Promise.allSettled(due.map((event) => scheduleSecurityDetection({ deviceId: event.deviceId! })));
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  detectionSweepCursor = through;
  const completed = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  return completed.reduce((total, result) => ({
    rulesEvaluated: total.rulesEvaluated + result.rulesEvaluated,
    eventsEvaluated: total.eventsEvaluated + result.eventsEvaluated,
    findingsCreated: total.findingsCreated + result.findingsCreated,
    findingsUpdated: total.findingsUpdated + result.findingsUpdated
  }), { rulesEvaluated: 0, eventsEvaluated: 0, findingsCreated: 0, findingsUpdated: 0 });
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

export async function getSecurityMonitorStatus() {
  const [states, supportedDevices, enabledRules, alertChannels, pendingRetries] = await Promise.all([
    prisma.eventCollectorState.findMany({
      orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }],
      include: { device: { select: { id: true, name: true, vendor: true, type: true, host: true, protocol: true } } }
    }),
    prisma.device.findMany().then((devices) => devices.filter((device) => Boolean(selectCollector(device))).length),
    prisma.detectionRule.count({ where: { enabled: true } }),
    prisma.securityAlertChannel.count({ where: { enabled: true, recipientEmail: { not: null } } }),
    prisma.securityAlertDelivery.count({ where: { status: { in: ["pending", "failed"] } } })
  ]);
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
      supportedDevices,
      configured: states.length,
      enabled: states.filter((state) => state.enabled).length,
      attempted: runtime.collectorsAttempted,
      succeeded: runtime.collectorsSucceeded,
      failed: runtime.collectorsFailed,
      devices: states.map((state) => ({
        deviceId: state.deviceId,
        deviceName: state.device.name,
        vendor: state.device.vendor,
        sourceType: state.sourceType,
        enabled: state.enabled,
        intervalSeconds: state.intervalSeconds,
        effectiveIntervalSeconds: effectiveCollectorIntervalSeconds(state),
        consecutiveIdleRuns: state.consecutiveIdleRuns,
        consecutiveFailures: state.consecutiveFailures,
        lastSuccessAt: state.lastSuccessAt,
        lastErrorAt: state.lastErrorAt,
        lastErrorCode: state.lastError ? safeErrorCode(state.lastError) : null
      }))
    },
    detection: { enabledRules, lastRun: runtime.lastDetection },
    dispatcher: getDetectionDispatcherStatus(),
    email: { enabledChannels: alertChannels, pendingRetries, lastRetry: runtime.lastEmailRetry }
  };
}
