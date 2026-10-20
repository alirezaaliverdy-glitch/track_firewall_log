import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';

test('approved retention protects open tickets, tasks, audit and other workspaces; accepts real 50 MiB files', async () => {
  process.env.AUTH_SESSION_SECRET = randomBytes(32).toString('hex'); process.env.LOG_LEVEL = 'silent';
  const { prisma, shutdownDatabase } = await import('../dist/db/prisma.js');
  const { buildApp } = await import('../dist/app.js');
  const { createSession } = await import('../dist/services/auth.service.js');
  const { pruneCommunityMessages } = await import('../dist/services/community-retention.service.js');
  const app = await buildApp(), tag = `retention-${randomUUID()}`, users = [], audits = [];
  let safeError;
  app.addHook('onError', async (_req, _reply, error) => { safeError = { code: error.code, name: error.name, transactionExpired: /Transaction.*closed|timeout/i.test(error.message) }; });
  const identity = async (role, workspaceOwnerId) => { const user = await prisma.appUser.create({ data: { username: `${tag}-${users.length}`, displayName: 'Retention fixture', role, workspaceOwnerId, passwordHash: 'fixture-only', allowedSections: ['page:community'] } }); users.push(user.id); const session = await createSession(user.id, {}); const cookie = `firewall_session=${session.token}`; const csrf = await app.inject({ url: '/api/auth/csrf', headers: { cookie } }); return { id: user.id, headers: { cookie, 'x-csrf-token': csrf.json().csrfToken } }; };
  const send = (who, method, path, payload) => app.inject({ method, url: '/api/community' + path, headers: who.headers, ...(payload ? { payload } : {}) });
  try {
    const owner = await identity('admin'), viewer = await identity('viewer', owner.id), foreign = await identity('admin');
    const old = new Date(Date.now() - 100 * 86400000), recent = new Date();
    const thread = async (user, kind, status = 'open') => prisma.communityThread.create({ data: { workspaceId: user.id, creatorId: user.id, clientKey: randomUUID(), title: tag, kind, status, messages: { create: { authorId: user.id, clientKey: randomUUID(), body: 'Expired fixture', createdAt: old } } }, include: { messages: true } });
    const topic = await thread(owner, 'discussion'), open = await thread(owner, 'ticket'), closed = await thread(owner, 'ticket', 'resolved'), privateOther = await thread(foreign, 'discussion');
    const task = await prisma.communityTask.create({ data: { workspaceId: owner.id, creatorId: owner.id, clientKey: randomUUID(), requestHash: 'fixture', title: 'Keep task', sourceMessageId: topic.messages[0].id } });
    await prisma.communityAttachment.create({ data: { messageId: topic.messages[0].id, workspaceId: owner.id, uploaderId: owner.id, fileName: 'expired.txt', mimeType: 'text/plain', size: 3, checksum: 'fixture', content: new Uint8Array([65,65,65]) } });
    const quote = await prisma.communityMessage.create({ data: { threadId: topic.id, authorId: viewer.id, clientKey: randomUUID(), body: 'Keep recent reply', createdAt: recent, replyToId: topic.messages[0].id } });
    assert.equal((await send(viewer, 'PATCH', '/retention', { enabled: false, discussionDays: 30, closedTicketDays: 90, maxMessages: 5000 })).statusCode, 403);
    assert.equal((await send(owner, 'PATCH', '/retention', { enabled: true, discussionDays: 0, closedTicketDays: 90, maxMessages: 5000 })).statusCode, 400);
    assert.equal((await send(owner, 'POST', '/retention/cleanup', { confirmed: false })).statusCode, 400);
    const result = await pruneCommunityMessages(owner.id, owner.id); assert.equal(result.deletedMessages, 2); assert.equal(result.deletedFiles, 1);
    assert.equal(await prisma.communityMessage.count({ where: { threadId: open.id } }), 1);
    assert.equal(await prisma.communityMessage.count({ where: { threadId: privateOther.id } }), 1);
    assert.equal(await prisma.communityMessage.count({ where: { threadId: closed.id } }), 0);
    assert.equal((await prisma.communityTask.findUniqueOrThrow({ where: { id: task.id } })).sourceMessageId, null);
    assert.equal((await prisma.communityMessage.findUniqueOrThrow({ where: { id: quote.id } })).replyToId, null);
    assert.equal((await prisma.communityThread.findUniqueOrThrow({ where: { id: topic.id } })).updatedAt.getTime(), topic.updatedAt.getTime(), 'housekeeping does not reorder inbox');
    const detail = (await send(viewer, 'GET', `/threads/${topic.id}`)).json(); assert.equal(detail.thread.prunedThroughSequence, topic.messages[0].sequence);
    assert.equal((await send(owner, 'POST', `/threads/${closed.id}/read`, { sequence: closed.messages[0].sequence })).statusCode, 200, 'a fully pruned conversation can acknowledge its retained cursor');
    assert.equal(detail.messages[0].id, quote.id);
    const oldAgain = await thread(owner, 'discussion');
    assert.equal((await send(owner, 'PATCH', '/retention', { enabled: false, discussionDays: 30, closedTicketDays: 90, maxMessages: 5000 })).statusCode, 200);
    assert.equal((await send(owner, 'POST', '/retention/cleanup', { confirmed: true })).json().deletedMessages, 0);
    assert.equal(await prisma.communityMessage.count({ where: { threadId: oldAgain.id } }), 1);
    const audit = await prisma.auditLog.findMany({ where: { actor: owner.id, action: 'community.retention_pruned' } }); assert.equal(audit.length, 2); audits.push(...audit.map(a => a.id)); assert.equal(JSON.stringify(audit).includes('Expired fixture'), false);
    // Actual multipart and PostgreSQL bytea, not only a changed label/size metadata.
    const boundary = `fixture-${randomUUID()}`, bytes = Buffer.alloc(50 * 1024 * 1024, 65);
    const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="clientKey"\r\n\r\n${randomUUID()}\r\n--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="fifty.txt"\r\nContent-Type: text/plain\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const uploaded = await app.inject({ method: 'POST', url: `/api/community/threads/${topic.id}/messages/files`, headers: { ...viewer.headers, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload });
    assert.equal(uploaded.statusCode, 200, JSON.stringify(safeError)); assert.equal(uploaded.json().message.attachments[0].size, bytes.length);
    const file = await prisma.communityAttachment.findUniqueOrThrow({ where: { id: uploaded.json().message.attachments[0].id } }); assert.equal(file.content.byteLength, bytes.length);
    const usage = (await send(viewer, 'GET', '/retention')).json(); assert.equal(usage.fileLimit, 52428800); assert.ok(usage.usedBytes >= 52428800); assert.equal(usage.policy.enabled, false);
    assert.equal((await send(owner, 'PATCH', '/retention', { enabled: true, discussionDays: 30, closedTicketDays: 90, maxMessages: 100 })).statusCode, 200);
    const bounded = await prisma.communityThread.create({ data: { workspaceId: owner.id, creatorId: owner.id, clientKey: randomUUID(), title: 'Count bound', kind: 'discussion' } });
    await prisma.communityMessage.createMany({ data: Array.from({ length: 120 }, () => ({ threadId: bounded.id, authorId: owner.id, body: 'Recent message', clientKey: randomUUID() })) });
    await prisma.communityMessage.createMany({ data: Array.from({ length: 120 }, () => ({ threadId: open.id, authorId: owner.id, body: 'Protected open ticket', clientKey: randomUUID() })) });
    await pruneCommunityMessages(owner.id, owner.id);
    assert.equal(await prisma.communityMessage.count({ where: { threadId: bounded.id } }), 100, 'count limit applies to eligible recent discussions');
    assert.equal(await prisma.communityMessage.count({ where: { threadId: open.id } }), 121, 'open ticket ignores both age and count thresholds');
  } finally {
    await app.close(); await prisma.communityRetentionPolicy.deleteMany({ where: { workspaceId: { in: users } } }); await prisma.auditLog.deleteMany({ where: { actor: { in: users } } }); await prisma.appUser.deleteMany({ where: { id: { in: users } } }); await shutdownDatabase();
  }
});
