import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../db/prisma.js";

// Operator explicitly approved these defaults, exclusions and irreversible deletion.
export const DEFAULT_COMMUNITY_RETENTION = { enabled: true, discussionDays: 30, closedTicketDays: 90, maxMessages: 5000 };
export async function getCommunityRetention(workspaceId: string) {
  return await prisma.communityRetentionPolicy.findUnique({ where: { workspaceId } }) ?? { workspaceId, ...DEFAULT_COMMUNITY_RETENTION };
}
export async function pruneCommunityMessages(workspaceId?: string, actor = "system:community-retention") {
  const threads = await prisma.communityThread.findMany({ where: workspaceId ? { workspaceId } : {}, take: 50,
    orderBy: [{ retentionCheckedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }], select: { id: true } });
  const total = { threadsChecked: 0, deletedMessages: 0, deletedFiles: 0, deletedBytes: 0 };
  for (const selected of threads) {
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "CommunityThread" WHERE "id" = ${selected.id} FOR UPDATE`;
      const thread = await tx.communityThread.findUnique({ where: { id: selected.id } });
      if (!thread) return null;
      const policy = await tx.communityRetentionPolicy.findUnique({ where: { workspaceId: thread.workspaceId } }) ?? DEFAULT_COMMUNITY_RETENTION;
      await tx.communityThread.update({ where: { id: thread.id }, data: { retentionCheckedAt: new Date(), updatedAt: thread.updatedAt } });
      if (!policy.enabled || (thread.kind === "ticket" && thread.status !== "resolved")) return null;
      const days = thread.kind === "ticket" ? policy.closedTicketDays : policy.discussionDays;
      const cutoff = Date.now() - days * 86400000;
      const count = await tx.communityMessage.count({ where: { threadId: thread.id } });
      const excess = Math.max(0, count - policy.maxMessages);
      const oldest = await tx.communityMessage.findMany({ where: { threadId: thread.id }, orderBy: { sequence: "asc" }, take: 500,
        select: { id: true, sequence: true, createdAt: true } });
      const firstKept = oldest.findIndex((message, index) => index >= excess && message.createdAt.getTime() >= cutoff);
      const removed = firstKept < 0 ? oldest : oldest.slice(0, firstKept);
      if (!removed.length) return null;
      const ids = removed.map(message => message.id);
      const files = await tx.communityAttachment.aggregate({ where: { messageId: { in: ids } }, _sum: { size: true }, _count: { _all: true } });
      await tx.communityMessage.deleteMany({ where: { id: { in: ids }, threadId: thread.id } });
      await tx.communityThread.update({ where: { id: thread.id }, data: { prunedThroughSequence: removed.at(-1)!.sequence, updatedAt: thread.updatedAt } });
      const result = { deletedMessages: ids.length, deletedFiles: files._count._all, deletedBytes: files._sum.size ?? 0 };
      await tx.auditLog.create({ data: { actor, action: "community.retention_pruned", targetType: "community", targetId: thread.id,
        dryRun: false, metadata: { workspaceId: thread.workspaceId, ...result, policy: { days, maxMessages: policy.maxMessages } } } });
      return result;
    }, { timeout: 15000 });
    total.threadsChecked++;
    if (result) { total.deletedMessages += result.deletedMessages; total.deletedFiles += result.deletedFiles; total.deletedBytes += result.deletedBytes; }
  }
  return { ...total, batchLimit: 50, perThreadLimit: 500 };
}
let timer: ReturnType<typeof setInterval> | undefined, startup: ReturnType<typeof setTimeout> | undefined, running: Promise<unknown> | undefined;
export function startCommunityRetention(logger: FastifyBaseLogger) {
  if (timer) return;
  const tick = () => { if (!running) running = pruneCommunityMessages().catch(() => logger.warn({ code: "COMMUNITY_RETENTION_FAILED" }, "Community retention unavailable")).finally(() => { running = undefined; }); };
  startup = setTimeout(tick, 60000); startup.unref(); timer = setInterval(tick, 3600000); timer.unref();
}
export async function stopCommunityRetention() { clearInterval(timer); clearTimeout(startup); timer = undefined; startup = undefined; await running; }
