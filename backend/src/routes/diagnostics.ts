import type { FastifyPluginAsync } from "fastify";
import { getDiagnosticSession, listDiagnosticSessions, runDiagnosticSession } from "../services/diagnostics.service.js";
import { listNmapScans, runNmapScan } from "../services/nmap-worker.service.js";

export const diagnosticRoutes: FastifyPluginAsync = async (app) => {
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
