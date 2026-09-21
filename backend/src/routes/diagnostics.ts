import type { FastifyPluginAsync } from "fastify";
import { getDiagnosticSession, listDiagnosticSessions, runDiagnosticSession } from "../services/diagnostics.service.js";
import { listNmapScans, runNmapScan } from "../services/nmap-worker.service.js";
import { clearNetworkProbes, listNetworkProbes, runNetworkProbe, type NetworkProbeKind } from "../services/network-probe.service.js";

export const diagnosticRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { limit?: string } }>("/api/diagnostics/network-probes", async (request, reply) => {
    if (!request.authUser) return reply.code(401).send({ error: { code: "AUTH_REQUIRED", message: "Authentication required." } });
    return { probes: await listNetworkProbes(request.authUser.username, Number(request.query.limit ?? 30)) };
  });

  app.post<{ Body: { kind?: NetworkProbeKind; deviceId?: string; target?: string; port?: number; attempts?: number } }>("/api/diagnostics/network-probes", async (request, reply) => {
    if (!request.authUser) return reply.code(401).send({ error: { code: "AUTH_REQUIRED", message: "Authentication required." } });
    try {
      const probe = await runNetworkProbe(request.body ?? {}, request.authUser);
      return reply.code(201).send({ probe });
    } catch (error) {
      const code = error instanceof Error ? error.message : "NETWORK_PROBE_FAILED";
      const status = code === "DEVICE_NOT_FOUND" ? 404 : ["TARGET_REQUIRED", "TARGET_INVALID", "PORT_INVALID", "ATTEMPTS_INVALID"].includes(code) ? 400 : 500;
      return reply.code(status).send({ error: { code, message: code } });
    }
  });

  app.delete("/api/diagnostics/network-probes", async (request, reply) => {
    if (!request.authUser) return reply.code(401).send({ error: { code: "AUTH_REQUIRED", message: "Authentication required." } });
    const deleted = await clearNetworkProbes(request.authUser.username);
    return { deleted };
  });

  app.get("/api/diagnostics/sessions", async () => ({ sessions: await listDiagnosticSessions() }));

  app.get<{ Params: { id: string } }>("/api/diagnostics/sessions/:id", async (request, reply) => {
    const session = await getDiagnosticSession(request.params.id);
    if (!session) return reply.code(404).send({ error: { code: "DIAGNOSTIC_SESSION_NOT_FOUND", message: "Diagnostic session not found." } });
    return { session };
  });

  app.post<{ Body: { target?: string; checks?: Array<"dns" | "http" | "ping" | "tcp"> } }>("/api/diagnostics/sessions", async (request, reply) => {
    try {
      const session = await runDiagnosticSession({ target: String(request.body?.target ?? ""), checks: request.body?.checks });
      return reply.code(session.state === "failed" ? 422 : 201).send({ session });
    } catch (error) {
      return reply.code(502).send({ error: { code: "DIAGNOSTIC_PROVIDER_FAILED", message: error instanceof Error ? error.message : "Diagnostic provider failed.", providerInvoked: true } });
    }
  });

  app.get("/api/diagnostics/nmap", async () => ({ scans: await listNmapScans() }));

  app.post<{ Body: { target?: string; profile?: "host_discovery" | "quick_tcp" } }>("/api/diagnostics/nmap", async (request, reply) => {
    try {
      const scan = await runNmapScan({ target: String(request.body?.target ?? ""), profile: request.body?.profile ?? "host_discovery" });
      return reply.code(scan.state === "rejected" ? 422 : 201).send({ scan });
    } catch (error) {
      return reply.code(500).send({ error: { code: "NMAP_WORKER_FAILED", message: error instanceof Error ? error.message : "Nmap worker failed.", workerInvoked: false } });
    }
  });
};
