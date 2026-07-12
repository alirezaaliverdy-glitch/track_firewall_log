import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db/prisma.js";
import { parseEventFilters, listSecurityEvents } from "../services/event.service.js";
import {
  createFindingActionPlan,
  createSecurityEvent,
  ensureSeededSecurityRules,
  listSecurityFindings,
  runSecurityDetection,
  validateRuleDsl
} from "../assets/asset-intelligence.service.js";
import { mockWazuhAssets, mockWazuhEvents, mockWazuhHealth } from "../integrations/wazuh/mock-adapter.js";
import { applyAssetImport, previewAssetImport } from "../assets/asset-intelligence.service.js";

export const securityPlatformRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: Record<string, unknown> }>("/api/security/events", async (request) => listSecurityEvents(parseEventFilters(request.query ?? {})));

  app.post<{ Body: Record<string, unknown> }>("/api/security/events", async (request, reply) => {
    const event = await createSecurityEvent(request.body ?? {});
    return reply.code(201).send(event);
  });

  app.get("/api/security/findings", async () => listSecurityFindings());

  app.get<{ Params: { id: string } }>("/api/security/findings/:id", async (request, reply) => {
    const finding = await prisma.finding.findUnique({ where: { id: request.params.id }, include: { asset: true, device: true } });
    return finding ? finding : reply.code(404).send({ error: "Finding not found" });
  });

  app.patch<{ Params: { id: string }; Body: { status?: string } }>("/api/security/findings/:id/status", async (request, reply) => {
    const allowed = new Set(["active", "acknowledged", "resolved", "false_positive", "accepted_risk", "suppressed", "investigating"]);
    if (!request.body?.status || !allowed.has(request.body.status)) return reply.code(400).send({ error: "Invalid finding status" });
    return prisma.finding.update({ where: { id: request.params.id }, data: { status: request.body.status } });
  });

  app.post<{ Params: { id: string } }>("/api/security/findings/:id/action-plan", async (request, reply) => {
    const result = await createFindingActionPlan(request.params.id);
    return result ? reply.code(201).send(result) : reply.code(404).send({ error: "Finding not found" });
  });

  app.get("/api/security/rules", async () => {
    await ensureSeededSecurityRules();
    return { rules: await prisma.detectionRule.findMany({ orderBy: [{ enabled: "desc" }, { name: "asc" }] }) };
  });

  app.post<{ Params: { id: string } }>("/api/security/rules/:id/enable", async (request, reply) => {
    try { return await prisma.detectionRule.update({ where: { id: request.params.id }, data: { enabled: true } }); }
    catch { return reply.code(404).send({ error: "Detection rule not found" }); }
  });

  app.post<{ Params: { id: string } }>("/api/security/rules/:id/disable", async (request, reply) => {
    try { return await prisma.detectionRule.update({ where: { id: request.params.id }, data: { enabled: false } }); }
    catch { return reply.code(404).send({ error: "Detection rule not found" }); }
  });

  app.post<{ Body: Record<string, unknown> }>("/api/security/rules/test", async (request, reply) => {
    const result = validateRuleDsl(request.body ?? {});
    return result.valid ? result : reply.code(400).send(result);
  });

  app.post<{ Body: { deviceId?: string; assetId?: string } }>("/api/security/detections/run", async (request) => runSecurityDetection(request.body ?? {}));

  app.get("/api/integrations/wazuh/health", async () => mockWazuhHealth());
  app.get("/api/integrations/wazuh/sync-preview", async () => previewAssetImport({ sourceType: "wazuh", assets: mockWazuhAssets() }));
  app.post<{ Body: { idempotencyKey?: string; deviceId?: string; assetId?: string } }>("/api/integrations/wazuh/sync", async (request) => {
    const imported = await applyAssetImport({ sourceType: "wazuh", idempotencyKey: request.body?.idempotencyKey ?? "mock-wazuh-default", assets: mockWazuhAssets() });
    for (const event of mockWazuhEvents(request.body?.deviceId, request.body?.assetId)) await createSecurityEvent(event);
    const detection = await runSecurityDetection({ deviceId: request.body?.deviceId, assetId: request.body?.assetId });
    return { imported, detection };
  });
};
