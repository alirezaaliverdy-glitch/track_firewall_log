import type { FastifyPluginAsync } from "fastify";
import { analyzeLinuxTelemetry, collectLinuxSecuritySnapshot, collectLinuxServerOverview, getLatestLinuxSecuritySnapshot, getLinuxTelemetryOptions, LinuxTelemetryError } from "../telemetry/linux/linux-telemetry.service.js";
import { getLinuxLogStream, getLinuxTelemetryStatus, getLinuxTelemetryStorageStatus, startLinuxLogStream, stopLinuxLogStream, subscribeLinuxFindings, subscribeLinuxLogStream, subscribeLinuxLogWarnings } from "../telemetry/linux/linux-log-stream.service.js";

export const linuxTelemetryRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Params: { deviceId: string } }>("/api/devices/:deviceId/telemetry/linux/snapshot", async (request, reply) => {
    try { const snapshot = await collectLinuxSecuritySnapshot(request.params.deviceId); return { snapshot, analysis: { findings: snapshot.findings, riskSummary: snapshot.riskSummary } }; }
    catch (error) { const status = error instanceof LinuxTelemetryError ? error.statusCode : 400; return reply.code(status).send({ error: "Linux snapshot failed", code: error instanceof LinuxTelemetryError ? error.code : "LINUX_TELEMETRY_FAILED", detail: error instanceof Error ? error.message : "Unknown error" }); }
  });
  app.get<{ Params: { deviceId: string } }>("/api/devices/:deviceId/telemetry/linux/snapshot/latest", async (request, reply) => (await getLatestLinuxSecuritySnapshot(request.params.deviceId)) ?? reply.code(404).send({ error: "No Linux snapshot found" }));
  app.get<{ Params: { deviceId: string } }>("/api/devices/:deviceId/telemetry/linux/overview", async (request, reply) => { try { return await collectLinuxServerOverview(request.params.deviceId); } catch (error) { const status = error instanceof LinuxTelemetryError ? error.statusCode : 400; return reply.code(status).send({ error: error instanceof Error ? error.message : "Overview failed", code: error instanceof LinuxTelemetryError ? error.code : "LINUX_OVERVIEW_FAILED" }); } });
  app.post<{ Params: { deviceId: string } }>("/api/devices/:deviceId/telemetry/linux/analyze", async (request, reply) => { try { return await analyzeLinuxTelemetry(request.params.deviceId); } catch (error) { return reply.code(404).send({ error: error instanceof Error ? error.message : "Analysis failed" }); } });
  app.get<{ Params: { deviceId: string } }>("/api/devices/:deviceId/telemetry/linux/options", async (request, reply) => { try { return await getLinuxTelemetryOptions(request.params.deviceId); } catch (error) { const status = error instanceof LinuxTelemetryError ? error.statusCode : 400; return reply.code(status).send({ error: error instanceof Error ? error.message : "Options failed", code: error instanceof LinuxTelemetryError ? error.code : "LINUX_TELEMETRY_FAILED" }); } });
  app.post<{ Params: { deviceId: string }; Body: { sources?: string[] } }>("/api/devices/:deviceId/telemetry/linux/stream/start", async (request, reply) => { try { return await startLinuxLogStream(request.params.deviceId, request.body?.sources ?? ["auth"]); } catch (error) { const message = error instanceof Error ? error.message : "Unknown error"; return reply.code(/does not exist|not Linux\/SSH capable/.test(message) ? 404 : 400).send({ error: "Stream start failed", detail: message }); } });
  app.get<{ Params: { deviceId: string } }>("/api/devices/:deviceId/telemetry/linux/stream/status", async (request) => getLinuxTelemetryStatus(request.params.deviceId));
  app.get<{ Params: { deviceId: string } }>("/api/devices/:deviceId/telemetry/linux/storage/status", async (request) => getLinuxTelemetryStorageStatus(request.params.deviceId));
  app.post<{ Params: { deviceId: string }; Body: { streamId?: string } }>("/api/devices/:deviceId/telemetry/linux/stream/stop", async (request, reply) => { const streamId = request.body?.streamId; const session = streamId ? getLinuxLogStream(streamId) : null; if (!session || session.deviceId !== request.params.deviceId) return reply.code(404).send({ error: "Stream not found" }); return stopLinuxLogStream(streamId!); });
  app.get<{ Params: { deviceId: string }; Querystring: { streamId?: string } }>("/api/devices/:deviceId/telemetry/linux/stream/events", async (request, reply) => {
    const streamId = request.query.streamId; const session = streamId ? getLinuxLogStream(streamId) : null;
    if (!streamId || !session || session.deviceId !== request.params.deviceId) return reply.code(404).send({ error: "Stream not found" });
    reply.hijack(); reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    reply.raw.write(`event: ready\ndata: ${JSON.stringify({ streamId })}\n\n`);
    const unsubscribe = subscribeLinuxLogStream(streamId, (event) => reply.raw.write(`event: telemetry\ndata: ${JSON.stringify(event)}\n\n`));
    const unsubscribeWarnings = subscribeLinuxLogWarnings(streamId, (warning) => reply.raw.write(`event: warning\ndata: ${JSON.stringify(warning)}\n\n`));
    const unsubscribeFindings = subscribeLinuxFindings(streamId, (finding) => reply.raw.write(`event: finding\ndata: ${JSON.stringify(finding)}\n\n`));
    const heartbeat = setInterval(() => reply.raw.write(": keepalive\n\n"), 15000);
    request.raw.on("close", () => { clearInterval(heartbeat); unsubscribe?.(); unsubscribeWarnings?.(); unsubscribeFindings?.(); });
  });
};
