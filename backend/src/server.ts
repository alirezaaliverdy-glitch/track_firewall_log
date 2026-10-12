import { env } from "./config/env.js";
import { shutdownDatabase } from "./db/prisma.js";
import { buildApp } from "./app.js";
import { startFleetHealthMonitor, stopFleetHealthMonitor } from "./services/fleet-health.service.js";
import { startSecurityMonitor, stopSecurityMonitor } from "./services/security-monitor.service.js";
import { startScheduledTaskWorker, stopScheduledTaskWorker } from "./services/scheduled-task-worker.service.js";
import { startDeviceConnectivitySensor, stopDeviceConnectivitySensor } from "./services/device-connectivity-sensor.service.js";
import { startNetflowV5Collector, stopNetflowV5Collector } from "./services/netflow-v5.service.js";

let app: Awaited<ReturnType<typeof buildApp>> | undefined;

async function shutdown(signal: NodeJS.Signals) {
  try {
    app?.log.info({ signal }, "Shutting down");
    await stopSecurityMonitor();
    await stopFleetHealthMonitor();
    await stopDeviceConnectivitySensor();
    await stopScheduledTaskWorker();
    await stopNetflowV5Collector();
    await app?.close();
    await shutdownDatabase();
    process.exit(0);
  } catch (error) {
    app?.log.error({ err: error }, "Shutdown failed");
    process.exit(1);
  }
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

try {
  app = await buildApp();
  await app.listen({ port: env.port, host: "0.0.0.0" });
  startSecurityMonitor(app.log);
  startFleetHealthMonitor();
  startDeviceConnectivitySensor(app.log);
  await startScheduledTaskWorker(app.log);
  await startNetflowV5Collector(app.log).catch((error) => app?.log.warn({ code: "NETFLOW_RECEIVER_START_FAILED", reason: error instanceof Error ? error.name : "unknown" }, "NetFlow receiver unavailable"));
} catch (error) {
  const message = error instanceof Error ? error.message : "Backend startup failed.";
  console.error(message);
  await shutdownDatabase().catch(() => undefined);
  process.exit(1);
}
