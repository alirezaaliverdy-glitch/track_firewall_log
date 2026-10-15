import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import { createFindingActionPlan } from "../assets/asset-intelligence.service.js";
import { VENDOR_TELEMETRY_PROFILES } from "../telemetry/vendor-telemetry-profiles.js";
import { serializeFinding } from "../telemetry/vendor-finding-engine.js";

export async function telemetryFindingRoutes(app: FastifyInstance) {
  app.get("/api/telemetry/profiles", async () => Object.values(VENDOR_TELEMETRY_PROFILES).map(p => ({ ...p, findingRules: p.findingRules.map(r => ({ ...r, eventPattern: r.eventPattern?.source })), suppressionRules: p.suppressionRules.map(r => ({ ...r, pattern: r.pattern.source })) })));
  app.get<{ Params: { deviceId: string }; Querystring: { status?: string } }>("/api/devices/:deviceId/findings", async request => (await prisma.finding.findMany({ where: { deviceId: request.params.deviceId, ...(request.query.status ? { status: request.query.status } : {}) }, orderBy: [{ severity: "desc" }, { confidence: "desc" }, { lastSeen: "desc" }] })).map(x => serializeFinding(x as unknown as Record<string, unknown>)));
  app.patch<{ Params: { id: string }; Body: { status: "active" | "acknowledged" | "resolved" } }>("/api/findings/:id", async (request, reply) => { if (!["active", "acknowledged", "resolved"].includes(request.body.status)) return reply.code(400).send({ error: "Invalid finding status" }); return serializeFinding(await prisma.finding.update({ where: { id: request.params.id }, data: { status: request.body.status } }) as unknown as Record<string, unknown>); });
  app.post<{ Params: { id: string } }>("/api/findings/:id/action-plan", async (request, reply) => {
    const result = await createFindingActionPlan(request.params.id, request.authUser?.scopeOwnerId);
    return result ? reply.code(201).send(result) : reply.code(404).send({ error: "Finding not found" });
  });
}
