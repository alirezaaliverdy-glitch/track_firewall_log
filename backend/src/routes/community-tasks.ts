import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import { author, memberScope, workspaceId, communityError } from "../services/community-collaboration.service.js";

const idSchema = { type: "string", minLength: 1, maxLength: 100, pattern: "^[a-zA-Z0-9_-]+$" };
const params = { type: "object", required: ["id"], properties: { id: idSchema }, additionalProperties: false };
const properties = {
  title: { type: "string", minLength: 1, maxLength: 120, pattern: "\\S" },
  description: { type: "string", maxLength: 4000 },
  assigneeId: { anyOf: [idSchema, { type: "null" }] },
  priority: { enum: ["normal", "urgent"] },
  dueAt: { anyOf: [{ type: "string", format: "date-time", maxLength: 35, pattern: "^(20[0-9]{2}|2100)-" }, { type: "null" }] }
};
const include = { creator: author, assignee: author, sourceMessage: { select: { id: true, threadId: true, deletedAt: true } } } as const;
type TaskInput = { title: string; description?: string; assigneeId?: string | null; dueAt?: string | null; priority?: "normal" | "urgent"; sourceMessageId?: string; clientKey: string };
type TaskPatch = Partial<Omit<TaskInput, "sourceMessageId" | "clientKey">> & { status?: "todo" | "in_progress" | "done"; expectedVersion: number };

export async function communityTaskRoutes(app: FastifyInstance) {
  app.get("/api/community/members", async req => ({ members: await prisma.appUser.findMany({
    where: memberScope(req.authUser!), select: { id: true, displayName: true }, orderBy: [{ displayName: "asc" }, { id: "asc" }], take: 200
  }) }));
  app.get<{ Querystring: { mine?: boolean; search?: string; status?: string; offset?: number } }>("/api/community/tasks", {
    schema: { querystring: { type: "object", additionalProperties: false, properties: {
      mine: { type: "boolean" }, search: { type: "string", maxLength: 100 }, status: { enum: ["todo", "in_progress", "done"] },
      offset: { type: "integer", minimum: 0, maximum: 10000, default: 0 }
    } } }
  }, async req => {
    const q = req.query;
    const tasks = await prisma.communityTask.findMany({ where: { workspaceId: workspaceId(req.authUser!),
      ...(q.mine ? { assigneeId: req.authUser!.id } : {}), ...(q.status ? { status: q.status } : {}),
      ...(q.search?.trim() ? { title: { contains: q.search.trim(), mode: "insensitive" } } : {}) },
      include, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: q.offset ?? 0, take: 61 });
    return { tasks: tasks.slice(0, 60).map(({ workspaceId: _scope, clientKey: _key, requestHash: _hash, ...task }) => task), hasMore: tasks.length > 60 };
  });
  app.post<{ Body: TaskInput }>("/api/community/tasks", { bodyLimit: 24000,
    schema: { body: { type: "object", required: ["title", "clientKey"], additionalProperties: false,
      properties: { ...properties, sourceMessageId: idSchema, clientKey: idSchema } } }
  }, async (req, reply) => {
    const user = req.authUser!, b = req.body;
    const data = { title: b.title.trim(), description: b.description?.trim() ?? "", assigneeId: b.assigneeId ?? null,
      dueAt: b.dueAt ? new Date(b.dueAt) : null, priority: b.priority ?? "normal", sourceMessageId: b.sourceMessageId ?? null };
    const hash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
    const unique = { creatorId_clientKey: { creatorId: user.id, clientKey: b.clientKey } };
    const retry = async () => {
      const prior = await prisma.communityTask.findUnique({ where: unique });
      if (!prior) return null;
      if (prior.workspaceId !== workspaceId(user)) throw communityError("not_found", 404);
      if (prior.requestHash !== hash) throw communityError("COMMUNITY_CONFLICT", 409);
      return { id: prior.id };
    };
    const prior = await retry(); if (prior) return prior;
    try {
      const task = await prisma.$transaction(async tx => {
        if (data.assigneeId && !await tx.appUser.findFirst({ where: { AND: [memberScope(user), { id: data.assigneeId }] } }))
          throw communityError("COMMUNITY_ASSIGNEE_UNAVAILABLE", 400);
        // Tasks are shared: never turn a private ticket into a public source link.
        if (data.sourceMessageId && !await tx.communityMessage.findFirst({ where: { id: data.sourceMessageId, deletedAt: null,
          thread: { workspaceId: workspaceId(user), kind: "discussion" } } })) throw communityError("COMMUNITY_SOURCE_UNAVAILABLE", 404);
        const created = await tx.communityTask.create({ data: { ...data, workspaceId: workspaceId(user), creatorId: user.id, clientKey: b.clientKey, requestHash: hash } });
        await tx.auditLog.create({ data: { actor: user.id, action: "community.task_created", targetType: "community", targetId: created.id,
          dryRun: false, metadata: { assigneeId: data.assigneeId } } });
        return created;
      });
      return reply.code(201).send({ id: task.id });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      const result = await retry(); if (result) return result; throw error;
    }
  });
  app.patch<{ Params: { id: string }; Body: TaskPatch }>("/api/community/tasks/:id", { bodyLimit: 24000,
    schema: { params, body: { type: "object", additionalProperties: false, required: ["expectedVersion"], minProperties: 2,
      properties: { ...properties, status: { enum: ["todo", "in_progress", "done"] }, expectedVersion: { type: "integer", minimum: 1, maximum: 2147483647 } } } }
  }, async (req, reply) => {
    const user = req.authUser!, b = req.body;
    const current = await prisma.communityTask.findFirst({ where: { id: req.params.id, workspaceId: workspaceId(user) } });
    if (!current) return reply.code(404).send({ error: "not_found" });
    const owner = current.creatorId === user.id || user.role === "admin";
    if (!owner && (current.assigneeId !== user.id || Object.keys(b).some(key => !["status", "expectedVersion"].includes(key))))
      return reply.code(403).send({ error: "forbidden" });
    const result = await prisma.$transaction(async tx => {
      if (b.assigneeId && !await tx.appUser.findFirst({ where: { AND: [memberScope(user), { id: b.assigneeId }] } }))
        throw communityError("COMMUNITY_ASSIGNEE_UNAVAILABLE", 400);
      const changed = await tx.communityTask.updateMany({ where: { id: current.id, version: b.expectedVersion,
        ...(!owner ? { assigneeId: user.id } : {}) }, data: {
        ...(b.title !== undefined ? { title: b.title.trim() } : {}), ...(b.description !== undefined ? { description: b.description.trim() } : {}),
        ...(b.assigneeId !== undefined ? { assigneeId: b.assigneeId } : {}), ...(b.dueAt !== undefined ? { dueAt: b.dueAt ? new Date(b.dueAt) : null } : {}),
        ...(b.priority !== undefined ? { priority: b.priority } : {}), ...(b.status ? { status: b.status } : {}), version: { increment: 1 }
      } });
      if (!changed.count) throw communityError("COMMUNITY_CONFLICT", 409);
      await tx.auditLog.create({ data: { actor: user.id, action: "community.task_updated", targetType: "community", targetId: current.id,
        dryRun: false, metadata: { fields: Object.keys(b).filter(key => key !== "expectedVersion") } } });
      const task = await tx.communityTask.findUniqueOrThrow({ where: { id: current.id }, include });
      const { workspaceId: _scope, clientKey: _key, requestHash: _hash, ...safe } = task; return safe;
    });
    return { task: result };
  });
}
