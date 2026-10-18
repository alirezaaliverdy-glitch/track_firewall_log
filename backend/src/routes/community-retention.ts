import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import { workspaceId, WORKSPACE_FILE_LIMIT, FILE_LIMIT, DAILY_FILE_LIMIT } from "../services/community-collaboration.service.js";
import { getCommunityRetention, pruneCommunityMessages } from "../services/community-retention.service.js";

export async function communityRetentionRoutes(app: FastifyInstance) {
  app.get("/api/community/retention", async req => {
    const scope = workspaceId(req.authUser!);
    const usage = await prisma.communityAttachment.aggregate({ where: { workspaceId: scope }, _sum: { size: true } });
    return { policy: await getCommunityRetention(scope), fileLimit: FILE_LIMIT, workspaceFileLimit: WORKSPACE_FILE_LIMIT,
      dailyFileLimit: DAILY_FILE_LIMIT, usedBytes: usage._sum.size ?? 0, cleanupIntervalMinutes: 60, openTicketsProtected: true };
  });
  app.patch<{ Body: { enabled: boolean; discussionDays: number; closedTicketDays: number; maxMessages: number } }>("/api/community/retention", {
    bodyLimit: 2048, schema: { body: { type: "object", additionalProperties: false, required: ["enabled", "discussionDays", "closedTicketDays", "maxMessages"],
      properties: { enabled: { type: "boolean" }, discussionDays: { type: "integer", minimum: 7, maximum: 365 },
        closedTicketDays: { type: "integer", minimum: 7, maximum: 365 }, maxMessages: { type: "integer", minimum: 100, maximum: 20000 } } } }
  }, async (req, reply) => {
    if (req.authUser!.role !== "admin") return reply.code(403).send({ error: "forbidden" });
    const scope = workspaceId(req.authUser!);
    const policy = await prisma.$transaction(async tx => {
      const updated = await tx.communityRetentionPolicy.upsert({ where: { workspaceId: scope }, create: { workspaceId: scope, ...req.body }, update: req.body });
      await tx.auditLog.create({ data: { actor: req.authUser!.id, action: "community.retention_updated", targetType: "community", targetId: scope, dryRun: false, metadata: req.body } });
      return updated;
    });
    return { policy };
  });
  app.post<{ Body: { confirmed: boolean } }>("/api/community/retention/cleanup", {
    bodyLimit: 2048, schema: { body: { type: "object", additionalProperties: false, required: ["confirmed"], properties: { confirmed: { const: true } } } }
  }, async (req, reply) => {
    if (req.authUser!.role !== "admin") return reply.code(403).send({ error: "forbidden" });
    return pruneCommunityMessages(workspaceId(req.authUser!), req.authUser!.id);
  });
}
