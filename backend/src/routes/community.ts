import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import type { PublicUser } from "../services/auth.service.js";
import { author, messageInclude, safeMessage, nextChange, communityError, messageHash, validateCommunityFile,
  FILE_LIMIT, WORKSPACE_FILE_LIMIT, GLOBAL_FILE_LIMIT, DAILY_FILE_LIMIT, type ValidatedFile } from "../services/community-collaboration.service.js";
import { communityTaskRoutes } from "./community-tasks.js";
import { communityRetentionRoutes } from "./community-retention.js";

// Community is shared only inside the authenticated workspace. Tickets are private.
export function communityScope(user: PublicUser): Prisma.CommunityThreadWhereInput {
  return { workspaceId: user.scopeOwnerId ?? user.id,
    ...(user.role === "admin" ? {} : { OR: [{ kind: "discussion" }, { creatorId: user.id }] }) };
}
const idSchema = { type: "string", minLength: 1, maxLength: 100, pattern: "^[a-zA-Z0-9_-]+$" };
const textSchema = (maxLength: number) => ({ type: "string", minLength: 1, maxLength, pattern: "\\S" });
const params = { type: "object", required: ["id"], properties: { id: idSchema }, additionalProperties: false };
const conflict = () => Object.assign(new Error("COMMUNITY_CONFLICT"), { statusCode: 409 });
const activeUploads = new Set<string>();
const activeDownloads = new Map<string, number>();
let downloadCount = 0;

export async function communityRoutes(app: FastifyInstance) {
  // Route-level guard also keeps test/dev auth bypass from exposing community content.
  app.addHook("preHandler", async (req, reply) => {
    if (!req.authUser) return reply.code(401).send({ error: "unauthorized" });
  });
  await app.register(communityTaskRoutes);
  await app.register(communityRetentionRoutes);
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
      include: { creator: author, messages: { orderBy: { sequence: "desc" }, take: 1, select: { sequence: true, body: true, authorId: true, deletedAt: true } },
        reads: { where: { userId: user.id }, select: { lastSequence: true } }, _count: { select: { messages: true } } }
    });
    return { hasMore: rows.length > 30, threads: rows.slice(0, 30).map(({ messages, reads, _count, clientKey: _key, workspaceId: _scope, ...thread }) => ({
      ...thread, preview: messages[0]?.deletedAt ? "" : messages[0]?.body.slice(0, 160) ?? "", messageCount: _count.messages,
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
  app.get<{ Params: { id: string }; Querystring: { before?: number; after?: number; changeAfter?: number } }>("/api/community/threads/:id", {
    schema: { params, querystring: { type: "object", additionalProperties: false, properties: {
      before: { type: "integer", minimum: 1, maximum: 2147483647 }, after: { type: "integer", minimum: 0, maximum: 2147483647 },
      changeAfter: { type: "integer", minimum: 0, maximum: 2147483647 }
    } } }
  }, async (req, reply) => {
    if ([req.query.before, req.query.after, req.query.changeAfter].filter(v => v !== undefined).length > 1) return reply.code(400).send({ error: "invalid_cursor" });
    const thread = await prisma.communityThread.findFirst({ where: { AND: [communityScope(req.authUser!), { id: req.params.id }] }, include: { creator: author } });
    if (!thread) return reply.code(404).send({ error: "not_found" });
    const forward = req.query.after !== undefined;
    const changes = req.query.changeAfter !== undefined;
    const rows = await prisma.communityMessage.findMany({ where: { threadId: thread.id,
      ...(changes ? { changeSequence: { gt: req.query.changeAfter } } : forward ? { sequence: { gt: req.query.after } } : req.query.before ? { sequence: { lt: req.query.before } } : {}) },
      orderBy: changes ? { changeSequence: "asc" } : { sequence: forward ? "asc" : "desc" }, take: 61, include: messageInclude });
    const { clientKey: _key, workspaceId: _workspace, ...safe } = thread;
    const messages = rows.slice(0, 60).map(safeMessage);
    return { thread: safe, messages: forward || changes ? messages : messages.reverse(), hasMore: rows.length > 60,
      changeCursor: Math.max(req.query.changeAfter ?? 0, ...messages.map(m => m.changeSequence)) };
  });
  async function createMessage(user: PublicUser, id: string, input: { body: string; clientKey: string; replyToId?: string }, files: ValidatedFile[]) {
    const found = await prisma.communityThread.findFirst({ where: { AND: [communityScope(user), { id }] } });
    if (!found) throw communityError("not_found", 404);
    const hash = messageHash(input.body.trim(), input.replyToId, files);
    return prisma.$transaction(async tx => {
      // One global attachment-budget lock makes quota checks exact across processes.
      if (files.length) await tx.$executeRaw`SELECT pg_advisory_xact_lock(1948287)`;
      await tx.$queryRaw`SELECT "id" FROM "CommunityThread" WHERE "id" = ${found.id} FOR UPDATE`;
      const previous = await tx.communityMessage.findUnique({ where: { threadId_authorId_clientKey: {
        threadId: found.id, authorId: user.id, clientKey: input.clientKey } }, include: messageInclude });
      if (previous) {
        if (previous.requestHash ? previous.requestHash !== hash : previous.body !== input.body.trim() || files.length || input.replyToId) throw conflict();
        return safeMessage(previous);
      }
      const thread = await tx.communityThread.findUniqueOrThrow({ where: { id: found.id } });
      if (thread.status === "resolved") throw conflict();
      if (input.replyToId && !await tx.communityMessage.findFirst({ where: { id: input.replyToId, threadId: found.id, deletedAt: null } }))
        throw communityError("COMMUNITY_REPLY_UNAVAILABLE", 404);
      if (files.length) {
        const global = await tx.communityAttachment.aggregate({ _sum: { size: true } });
        const workspace = await tx.communityAttachment.aggregate({ where: { workspaceId: found.workspaceId }, _sum: { size: true } });
        // Count accepted bytes from audit, not live files: deleting a message must
        // not reset its author's rolling upload allowance.
        const daily = await tx.$queryRaw<{ bytes: bigint }[]>`SELECT COALESCE(SUM(("metadata"->>'bytes')::bigint), 0)::bigint AS bytes
          FROM "AuditLog" WHERE "actor" = ${user.id} AND "action" = 'community.files_uploaded'
          AND "createdAt" >= ${new Date(Date.now() - 86400000)}`;
        const bytes = files.reduce((sum, f) => sum + f.size, 0);
        if ((global._sum.size ?? 0) + bytes > GLOBAL_FILE_LIMIT || (workspace._sum.size ?? 0) + bytes > WORKSPACE_FILE_LIMIT || Number(daily[0].bytes) + bytes > DAILY_FILE_LIMIT)
          throw communityError("COMMUNITY_STORAGE_QUOTA", 413);
      }
      const message = await tx.communityMessage.create({ data: { threadId: found.id, authorId: user.id, body: input.body.trim(),
        clientKey: input.clientKey, requestHash: hash, replyToId: input.replyToId,
        attachments: { create: files.map(file => ({ ...file, content: new Uint8Array(file.content), workspaceId: found.workspaceId, uploaderId: user.id })) } }, include: messageInclude });
      if (files.length) await tx.auditLog.create({ data: { actor: user.id, action: "community.files_uploaded", targetType: "community", targetId: message.id,
        dryRun: false, metadata: { bytes: files.reduce((sum, file) => sum + file.size, 0), files: files.length } } });
      await tx.communityThread.update({ where: { id: found.id }, data: { updatedAt: new Date() } });
      return safeMessage(message);
    }, { timeout: files.length ? 120000 : 15000, maxWait: 10000 });
  }
  app.post<{ Params: { id: string }; Body: { body: string; clientKey: string; replyToId?: string } }>("/api/community/threads/:id/messages", {
    bodyLimit: 24000, schema: { params, body: { type: "object", required: ["body", "clientKey"], additionalProperties: false,
      properties: { body: textSchema(4000), clientKey: idSchema, replyToId: idSchema } } }
  }, async (req, reply) => {
    return { message: await createMessage(req.authUser!, req.params.id, req.body, []) };
  });
  app.post<{ Params: { id: string } }>("/api/community/threads/:id/messages/files", { bodyLimit: 160 * 1024 * 1024, schema: { params } }, async (req, reply) => {
    const user = req.authUser!;
    // Authorize before consuming bytes; cap simultaneous buffered requests as well as disk use.
    if (!await prisma.communityThread.findFirst({ where: { AND: [communityScope(user), { id: req.params.id }] } }))
      return reply.code(404).send({ error: "not_found" });
    if (activeUploads.has(user.id) || activeUploads.size >= 1) return reply.code(429).send({ error: "COMMUNITY_UPLOAD_BUSY" });
    activeUploads.add(user.id);
    const timeout = setTimeout(() => req.raw.destroy(), 300000); timeout.unref();
    try {
      const fields: Record<string, string> = {}, files: ValidatedFile[] = [];
      for await (const part of req.parts({ limits: { fileSize: FILE_LIMIT, files: 3, fields: 3, parts: 6, fieldSize: 16000, fieldNameSize: 40 } })) {
        if (part.type === "file") {
          if (part.fieldname !== "files") { part.file.resume(); throw communityError("COMMUNITY_FIELDS"); }
          const data = await part.toBuffer();
          if (part.file.truncated) throw communityError("COMMUNITY_FILE_SIZE", 413);
          files.push(validateCommunityFile(part.filename, data));
        } else {
          if (!["body", "clientKey", "replyToId"].includes(part.fieldname) || fields[part.fieldname] !== undefined || part.valueTruncated || typeof part.value !== "string")
            throw communityError("COMMUNITY_FIELDS");
          fields[part.fieldname] = part.value;
        }
      }
      if (!files.length || !/^[a-zA-Z0-9_-]{1,100}$/.test(fields.clientKey ?? "") || (fields.body?.length ?? 0) > 4000 ||
        (fields.replyToId !== undefined && !/^[a-zA-Z0-9_-]{1,100}$/.test(fields.replyToId))) throw communityError("COMMUNITY_FIELDS");
      return { message: await createMessage(user, req.params.id, { body: fields.body ?? "", clientKey: fields.clientKey, replyToId: fields.replyToId }, files) };
    } catch (error) {
      if ((error as { code?: string }).code?.startsWith("FST_")) return reply.code(413).send({ error: "COMMUNITY_FILE_SIZE" });
      const safe = error as { message?: string; statusCode?: number; code?: string };
      if (safe.statusCode && safe.statusCode >= 400 && safe.statusCode < 500 && /^(COMMUNITY_[A-Z_]+|not_found|forbidden)$/.test(safe.message ?? ""))
        return reply.code(safe.statusCode).send({ error: safe.message });
      // Database exceptions can contain serialized upload arguments. Never log them.
      req.log.warn({ code: "COMMUNITY_FILE_STORE_FAILED", databaseCode: /^P\d{4}$/.test(safe.code ?? "") ? safe.code : undefined }, "Attachment could not be stored");
      return reply.code(500).send({ error: "COMMUNITY_FILE_STORE_FAILED" });
    } finally { clearTimeout(timeout); activeUploads.delete(user.id); }
  });
  const messageParams = { type: "object", required: ["id", "messageId"], additionalProperties: false, properties: { id: idSchema, messageId: idSchema } };
  for (const method of ["PATCH", "DELETE"] as const) {
    app.route<{ Params: { id: string; messageId: string }; Body: { body?: string; expectedRevision: number } }>({ method,
      url: "/api/community/threads/:id/messages/:messageId", bodyLimit: 24000,
      schema: { params: messageParams, body: { type: "object", required: method === "PATCH" ? ["body", "expectedRevision"] : ["expectedRevision"], additionalProperties: false,
        properties: { ...(method === "PATCH" ? { body: textSchema(4000) } : {}), expectedRevision: { type: "integer", minimum: 1, maximum: 2147483647 } } } },
      handler: async (req, reply) => {
        const user = req.authUser!;
        const thread = await prisma.communityThread.findFirst({ where: { AND: [communityScope(user), { id: req.params.id }] } });
        if (!thread) return reply.code(404).send({ error: "not_found" });
        const message = await prisma.$transaction(async tx => {
          await tx.$queryRaw`SELECT "id" FROM "CommunityThread" WHERE "id" = ${thread.id} FOR UPDATE`;
          const current = await tx.communityMessage.findFirst({ where: { id: req.params.messageId, threadId: thread.id }, include: messageInclude });
          if (!current) throw communityError("not_found", 404);
          if (current.authorId !== user.id) throw communityError("forbidden", 403);
          if (current.deletedAt) { if (method === "DELETE") return safeMessage(current); throw conflict(); }
          if (current.changeSequence !== req.body.expectedRevision) throw conflict();
          const updated = await tx.communityMessage.update({ where: { id: current.id }, data: {
            body: method === "DELETE" ? "" : req.body.body!.trim(), changeSequence: await nextChange(tx),
            ...(method === "DELETE" ? { deletedAt: new Date(), attachments: { deleteMany: {} } } : { editedAt: new Date() })
          }, include: messageInclude });
          await tx.communityThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });
          await tx.auditLog.create({ data: { actor: user.id, action: method === "DELETE" ? "community.message_deleted" : "community.message_edited",
            targetType: "community", targetId: current.id, dryRun: false } });
          return safeMessage(updated);
        });
        return { message };
      }
    });
  }
  app.get<{ Params: { id: string; attachmentId: string } }>("/api/community/threads/:id/attachments/:attachmentId", {
    schema: { params: { type: "object", required: ["id", "attachmentId"], additionalProperties: false, properties: { id: idSchema, attachmentId: idSchema } } }
  }, async (req, reply) => {
    const thread = await prisma.communityThread.findFirst({ where: { AND: [communityScope(req.authUser!), { id: req.params.id }] } });
    if (!thread) return reply.code(404).send({ error: "not_found" });
    const userId = req.authUser!.id;
    if (downloadCount >= 2 || (activeDownloads.get(userId) ?? 0) >= 1) return reply.code(429).send({ error: "COMMUNITY_DOWNLOAD_BUSY" });
    downloadCount++; activeDownloads.set(userId, (activeDownloads.get(userId) ?? 0) + 1);
    let released = false;
    const timeout = setTimeout(() => reply.raw.destroy(), 300000); timeout.unref();
    const release = () => {
      if (released) return; released = true; clearTimeout(timeout); downloadCount--;
      const remaining = (activeDownloads.get(userId) ?? 1) - 1;
      if (remaining) activeDownloads.set(userId, remaining); else activeDownloads.delete(userId);
    };
    reply.raw.once("finish", release); reply.raw.once("close", release);
    const file = await prisma.communityAttachment.findFirst({ where: { id: req.params.attachmentId, message: { threadId: thread.id, deletedAt: null } } });
    if (!file) return reply.code(404).send({ error: "not_found" });
    reply.header("Content-Disposition", `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(file.fileName).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16)}`)}`);
    reply.header("X-Content-Type-Options", "nosniff").header("Content-Security-Policy", "sandbox; default-src 'none'")
      .header("Cache-Control", "private, no-store").type("application/octet-stream");
    return reply.send(Buffer.from(file.content));
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
    if (!message && req.body.sequence !== thread.prunedThroughSequence) return reply.code(400).send({ error: "invalid_cursor" });
    // Monotonic across open tabs; never mark future/unseen messages as read.
    await prisma.$executeRaw`INSERT INTO "CommunityRead" ("threadId", "userId", "lastSequence") VALUES (${thread.id}, ${user.id}, ${req.body.sequence})
      ON CONFLICT ("threadId", "userId") DO UPDATE SET "lastSequence" = GREATEST("CommunityRead"."lastSequence", EXCLUDED."lastSequence")`;
    return { ok: true };
  });
}
