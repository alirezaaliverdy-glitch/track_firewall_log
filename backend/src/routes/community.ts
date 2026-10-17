import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import type { PublicUser } from "../services/auth.service.js";

// Community is shared only inside the authenticated workspace. Tickets are private.
export function communityScope(user: PublicUser): Prisma.CommunityThreadWhereInput {
  return { workspaceId: user.scopeOwnerId ?? user.id,
    ...(user.role === "admin" ? {} : { OR: [{ kind: "discussion" }, { creatorId: user.id }] }) };
}
const author = { select: { id: true, displayName: true } } as const;
const messageInclude = { author } as const;
const idSchema = { type: "string", minLength: 1, maxLength: 100, pattern: "^[a-zA-Z0-9_-]+$" };
const textSchema = (maxLength: number) => ({ type: "string", minLength: 1, maxLength, pattern: "\\S" });
const params = { type: "object", required: ["id"], properties: { id: idSchema }, additionalProperties: false };
const conflict = () => Object.assign(new Error("COMMUNITY_CONFLICT"), { statusCode: 409 });

export async function communityRoutes(app: FastifyInstance) {
  // Route-level guard also keeps test/dev auth bypass from exposing community content.
  app.addHook("preHandler", async (req, reply) => {
    if (!req.authUser) return reply.code(401).send({ error: "unauthorized" });
  });
  app.get<{ Querystring: { kind: "discussion" | "ticket"; search?: string; status?: string; offset?: number } }>("/api/community/threads", {
    schema: { querystring: { type: "object", required: ["kind"], additionalProperties: false, properties: {
      kind: { enum: ["discussion", "ticket"] }, search: { type: "string", maxLength: 100 },
      status: { enum: ["open", "in_progress", "resolved"] }, offset: { type: "integer", minimum: 0, maximum: 10000, default: 0 }
    } } }
  }, async (req) => {
    const user = req.authUser!;
    const q = req.query;
    const rows = await prisma.communityThread.findMany({
      where: { AND: [communityScope(user), { kind: q.kind, ...(q.status ? { status: q.status } : {}),
        ...(q.search?.trim() ? { title: { contains: q.search.trim(), mode: "insensitive" } } : {}) }] },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: q.offset ?? 0, take: 31,
      include: { creator: author, messages: { orderBy: { sequence: "desc" }, take: 1, select: { sequence: true, body: true, authorId: true } },
        reads: { where: { userId: user.id }, select: { lastSequence: true } }, _count: { select: { messages: true } } }
    });
    return { hasMore: rows.length > 30, threads: rows.slice(0, 30).map(({ messages, reads, _count, clientKey: _key, workspaceId: _scope, ...thread }) => ({
      ...thread, preview: messages[0]?.body.slice(0, 160) ?? "", messageCount: _count.messages,
      unread: (messages[0]?.sequence ?? 0) > (reads[0]?.lastSequence ?? 0) && messages[0]?.authorId !== user.id
    })) };
  });
  app.post<{ Body: { kind: "discussion" | "ticket"; title: string; body: string; priority?: "normal" | "urgent"; clientKey: string } }>("/api/community/threads", {
    bodyLimit: 24000,
    schema: { body: { type: "object", required: ["kind", "title", "body", "clientKey"], additionalProperties: false, properties: {
      kind: { enum: ["discussion", "ticket"] }, title: textSchema(120), body: textSchema(4000),
      priority: { enum: ["normal", "urgent"], default: "normal" }, clientKey: idSchema
    } } }
  }, async (req, reply) => {
    const user = req.authUser!, b = req.body;
    const unique = { creatorId_clientKey: { creatorId: user.id, clientKey: b.clientKey } };
    const previous = await prisma.communityThread.findUnique({ where: unique, include: { messages: { orderBy: { sequence: "asc" }, take: 1 } } });
    if (previous) {
      if (previous.workspaceId !== (user.scopeOwnerId ?? user.id)) return reply.code(404).send({ error: "not_found" });
      if (previous.title !== b.title.trim() || previous.kind !== b.kind || previous.messages[0]?.body !== b.body.trim() || previous.priority !== (b.kind === "ticket" ? b.priority : "normal")) throw conflict();
      return { id: previous.id };
    }
    try {
      const thread = await prisma.$transaction(async tx => {
        const created = await tx.communityThread.create({ data: { workspaceId: user.scopeOwnerId ?? user.id, creatorId: user.id,
          clientKey: b.clientKey, kind: b.kind, title: b.title.trim(), priority: b.kind === "ticket" ? b.priority : "normal",
          messages: { create: { authorId: user.id, clientKey: b.clientKey, body: b.body.trim() } } } });
        await tx.auditLog.create({ data: { actor: user.id, action: "community.created", targetType: "community", targetId: created.id,
          dryRun: false, metadata: { kind: b.kind } } });
        return created;
      });
      return reply.code(201).send({ id: thread.id });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      const previous = await prisma.communityThread.findUniqueOrThrow({ where: unique, include: { messages: { orderBy: { sequence: "asc" }, take: 1 } } });
      if (previous.workspaceId !== (user.scopeOwnerId ?? user.id)) return reply.code(404).send({ error: "not_found" });
      if (previous.title !== b.title.trim() || previous.kind !== b.kind || previous.messages[0]?.body !== b.body.trim() || previous.priority !== (b.kind === "ticket" ? b.priority : "normal")) throw conflict();
      return { id: previous.id };
    }
  });
  app.get<{ Params: { id: string }; Querystring: { before?: number; after?: number } }>("/api/community/threads/:id", {
    schema: { params, querystring: { type: "object", additionalProperties: false, properties: {
      before: { type: "integer", minimum: 1, maximum: 2147483647 }, after: { type: "integer", minimum: 0, maximum: 2147483647 }
    } } }
  }, async (req, reply) => {
    if (req.query.before && req.query.after !== undefined) return reply.code(400).send({ error: "invalid_cursor" });
    const thread = await prisma.communityThread.findFirst({ where: { AND: [communityScope(req.authUser!), { id: req.params.id }] }, include: { creator: author } });
    if (!thread) return reply.code(404).send({ error: "not_found" });
    const forward = req.query.after !== undefined;
    const rows = await prisma.communityMessage.findMany({ where: { threadId: thread.id,
      ...(forward ? { sequence: { gt: req.query.after } } : req.query.before ? { sequence: { lt: req.query.before } } : {}) },
      orderBy: { sequence: forward ? "asc" : "desc" }, take: 61, include: messageInclude });
    const { clientKey: _key, workspaceId: _workspace, ...safe } = thread;
    const messages = rows.slice(0, 60).map(({ clientKey: _clientKey, ...message }) => message);
    return { thread: safe, messages: forward ? messages : messages.reverse(), hasMore: rows.length > 60 };
  });
  app.post<{ Params: { id: string }; Body: { body: string; clientKey: string } }>("/api/community/threads/:id/messages", {
    bodyLimit: 24000, schema: { params, body: { type: "object", required: ["body", "clientKey"], additionalProperties: false,
      properties: { body: textSchema(4000), clientKey: idSchema } } }
  }, async (req, reply) => {
    const user = req.authUser!;
    const found = await prisma.communityThread.findFirst({ where: { AND: [communityScope(user), { id: req.params.id }] } });
    if (!found) return reply.code(404).send({ error: "not_found" });
    const result = await prisma.$transaction(async tx => {
      // Serialize replies with closure so a closed ticket never accepts an unseen race.
      await tx.$queryRaw`SELECT "id" FROM "CommunityThread" WHERE "id" = ${found.id} FOR UPDATE`;
      const previous = await tx.communityMessage.findUnique({ where: { threadId_authorId_clientKey: {
        threadId: found.id, authorId: user.id, clientKey: req.body.clientKey } }, include: messageInclude });
      if (previous) { if (previous.body !== req.body.body.trim()) throw conflict(); return previous; }
      const thread = await tx.communityThread.findUniqueOrThrow({ where: { id: found.id } });
      if (thread.status === "resolved") throw conflict();
      const message = await tx.communityMessage.create({ data: { threadId: found.id, authorId: user.id, body: req.body.body.trim(), clientKey: req.body.clientKey }, include: messageInclude });
      await tx.communityThread.update({ where: { id: found.id }, data: { updatedAt: new Date() } });
      return message;
    });
    const { clientKey: _key, ...message } = result;
    return { message };
  });
  app.patch<{ Params: { id: string }; Body: { status: "open" | "in_progress" | "resolved" } }>("/api/community/threads/:id", {
    schema: { params, body: { type: "object", required: ["status"], additionalProperties: false, properties: { status: { enum: ["open", "in_progress", "resolved"] } } } }
  }, async (req, reply) => {
    const user = req.authUser!;
    if (user.role !== "admin") return reply.code(403).send({ error: "forbidden" });
    const found = await prisma.communityThread.findFirst({ where: { AND: [communityScope(user), { id: req.params.id }] } });
    if (!found) return reply.code(404).send({ error: "not_found" });
    await prisma.$transaction(async tx => {
      await tx.communityThread.update({ where: { id: found.id }, data: { status: req.body.status } });
      await tx.auditLog.create({ data: { actor: user.id, action: "community.status_changed", targetType: "community", targetId: found.id,
        dryRun: false, metadata: { status: req.body.status } } });
    });
    return { ok: true };
  });
  app.post<{ Params: { id: string }; Body: { sequence: number } }>("/api/community/threads/:id/read", {
    schema: { params, body: { type: "object", required: ["sequence"], additionalProperties: false,
      properties: { sequence: { type: "integer", minimum: 1, maximum: 2147483647 } } } }
  }, async (req, reply) => {
    const user = req.authUser!;
    const thread = await prisma.communityThread.findFirst({ where: { AND: [communityScope(user), { id: req.params.id }] } });
    if (!thread) return reply.code(404).send({ error: "not_found" });
    const message = await prisma.communityMessage.findFirst({ where: { threadId: thread.id, sequence: req.body.sequence }, select: { id: true } });
    if (!message) return reply.code(400).send({ error: "invalid_cursor" });
    // Monotonic across open tabs; never mark future/unseen messages as read.
    await prisma.$executeRaw`INSERT INTO "CommunityRead" ("threadId", "userId", "lastSequence") VALUES (${thread.id}, ${user.id}, ${req.body.sequence})
      ON CONFLICT ("threadId", "userId") DO UPDATE SET "lastSequence" = GREATEST("CommunityRead"."lastSequence", EXCLUDED."lastSequence")`;
    return { ok: true };
  });
}
