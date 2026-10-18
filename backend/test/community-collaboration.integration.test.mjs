// Only disposable TEST_DATABASE_URL. No production/user/device mutations.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID, randomBytes } from 'node:crypto';

test('collaboration: authorship, replies, change feed, private files, quotas, task assignment and viewer boundaries', async () => {
  process.env.AUTH_SESSION_SECRET = randomBytes(32).toString('hex'); process.env.LOG_LEVEL = 'silent';
  const { prisma, shutdownDatabase } = await import('../dist/db/prisma.js');
  const { buildApp } = await import('../dist/app.js');
  const { createSession } = await import('../dist/services/auth.service.js');
  const { validateCommunityFile, WORKSPACE_FILE_LIMIT } = await import('../dist/services/community-collaboration.service.js');
  const app = await buildApp(), users = [], tag = `collaboration-${randomUUID()}`;
  async function identity(role, workspaceOwnerId, isActive = true) {
    const user = await prisma.appUser.create({ data: { username: `${tag}-${users.length}`, displayName: `Fixture ${users.length}`, role,
      passwordHash: 'fixture-not-a-real-password', workspaceOwnerId, isActive, allowedSections: [] } }); users.push(user.id);
    if (!isActive) return { id: user.id };
    const session = await createSession(user.id, {}), cookie = `firewall_session=${session.token}`;
    const csrf = await app.inject({ url: '/api/auth/csrf', headers: { cookie } });
    return { id: user.id, token: session.token, headers: { cookie, 'x-csrf-token': csrf.json().csrfToken } };
  }
  const send = (who, method, path, payload) => app.inject({ method, url: '/api/community' + path, headers: who.headers, ...(payload ? { payload } : {}) });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
  async function upload(who, thread, files, extra = {}) {
    const boundary = 'eosnet-' + randomUUID(); const chunks = [];
    for (const [name, value] of Object.entries({ body: 'Attachment fixture', clientKey: randomUUID(), ...extra }))
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
    for (const file of files) chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${file.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`), file.data, Buffer.from('\r\n'));
    chunks.push(Buffer.from(`--${boundary}--\r\n`));
    return app.inject({ method: 'POST', url: `/api/community/threads/${thread}/messages/files`, headers: { ...who.headers, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat(chunks) });
  }
  try {
    const owner = await identity('admin'), foreign = await identity('admin'), viewer = await identity('viewer', owner.id), peer = await identity('operator', owner.id);
    const inactive = await identity('viewer', owner.id, false), independentAdmin = await identity('admin', owner.id);
    const create = (who, kind = 'discussion') => send(who, 'POST', '/threads', { title: 'Fixture conversation', body: 'First message', kind, clientKey: randomUUID() });
    const topic = (await create(owner)).json().id, another = (await create(peer)).json().id, ticket = (await create(viewer, 'ticket')).json().id;
    const message = (await send(viewer, 'POST', `/threads/${topic}/messages`, { body: '<script>fixture only</script>', clientKey: randomUUID() })).json().message;
    const reply = await send(peer, 'POST', `/threads/${topic}/messages`, { body: 'A reply', replyToId: message.id, clientKey: randomUUID() });
    assert.equal(reply.statusCode, 200); assert.equal(reply.json().message.replyTo.body, message.body);
    assert.equal((await send(peer, 'POST', `/threads/${another}/messages`, { body: 'Bad reply', replyToId: message.id, clientKey: randomUUID() })).statusCode, 404);
    const rev = message.changeSequence, cursor = (await send(peer, 'GET', `/threads/${topic}`)).json().changeCursor;
    assert.ok(Number.isInteger(rev));
    assert.equal((await send(peer, 'PATCH', `/threads/${topic}/messages/${message.id}`, { body: 'forged', expectedRevision: rev })).statusCode, 403);
    assert.equal((await send(foreign, 'DELETE', `/threads/${topic}/messages/${message.id}`, { expectedRevision: rev })).statusCode, 404);
    const edited = await send(viewer, 'PATCH', `/threads/${topic}/messages/${message.id}`, { body: 'Edited fixture', expectedRevision: rev });
    assert.equal(edited.statusCode, 200); assert.ok(edited.json().message.editedAt);
    assert.equal((await send(viewer, 'PATCH', `/threads/${topic}/messages/${message.id}`, { body: 'Stale edit', expectedRevision: rev })).statusCode, 409);
    const changes = (await send(peer, 'GET', `/threads/${topic}?changeAfter=${cursor}`)).json();
    assert.equal(changes.messages[0].id, message.id); assert.equal(changes.messages[0].body, 'Edited fixture'); assert.ok(changes.changeCursor > cursor);
    const source = (await send(peer, 'POST', `/threads/${topic}/messages`, { body: 'Task source', clientKey: randomUUID() })).json().message;
    const uploadKey = randomUUID(), fileResult = await upload(viewer, ticket, [{ name: 'تصویر.png', data: png }], { clientKey: uploadKey });
    assert.equal(fileResult.statusCode, 200); const fileMessage = fileResult.json().message, file = fileMessage.attachments[0];
    assert.equal(JSON.stringify(fileMessage).includes('content'), false); assert.equal(JSON.stringify(fileMessage).includes('checksum'), false);
    assert.equal((await upload(viewer, ticket, [{ name: 'تصویر.png', data: png }], { clientKey: uploadKey })).json().message.id, fileMessage.id);
    assert.equal(await prisma.communityAttachment.count({ where: { messageId: fileMessage.id } }), 1);
    assert.equal(await prisma.auditLog.count({ where: { actor: viewer.id, action: 'community.files_uploaded' } }), 1, 'retry does not spend daily upload budget twice');
    const download = await send(owner, 'GET', `/threads/${ticket}/attachments/${file.id}`);
    assert.equal(download.statusCode, 200); assert.deepEqual(download.rawPayload, png);
    assert.match(download.headers['content-disposition'], /^attachment;/); assert.match(download.headers['cache-control'], /no-store/);
    assert.equal(download.headers['content-type'], 'application/octet-stream'); assert.match(download.headers['content-security-policy'], /sandbox/);
    for (const who of [peer, foreign]) assert.equal((await send(who, 'GET', `/threads/${ticket}/attachments/${file.id}`)).statusCode, 404);
    assert.equal((await app.inject({ url: `/api/community/threads/${ticket}/attachments/${file.id}` })).statusCode, 401);
    assert.equal((await upload(viewer, ticket, [{ name: 'active.svg', data: Buffer.from('<svg onload="alert(1)"/>') }])).statusCode, 415);
    assert.equal((await upload(viewer, ticket, [{ name: 'fake.png', data: Buffer.from('MZnot-an-image') }])).statusCode, 415);
    assert.equal((await upload(viewer, ticket, [{ name: 'large.txt', data: Buffer.alloc(5242881, 65) }])).statusCode, 413);
    const nativeHeaders = { authorization: `Bearer ${viewer.token}`, 'x-firewall-client': 'android' };
    const nativeFile = await upload({ headers: nativeHeaders }, topic, [{ name: 'native.txt', data: Buffer.from('native viewer fixture') }]);
    assert.equal(nativeFile.statusCode, 200, 'native viewer can send attachments without granting device permissions');
    assert.equal((await app.inject({ url: `/api/community/threads/${topic}/attachments/${nativeFile.json().message.attachments[0].id}`, headers: nativeHeaders })).statusCode, 200);
    assert.equal((await upload(viewer, topic, [{ name: 'limited.txt', data: Buffer.from('rate limited') }])).statusCode, 429);
    assert.equal((await app.inject({ method: 'POST', url: `/api/community/threads/${topic}/messages/files`, headers: { cookie: owner.headers.cookie } })).statusCode, 403);
    assert.throws(() => validateCommunityFile('../unsafe.txt', Buffer.from('text')), /COMMUNITY_FILE_NAME/);
    assert.throws(() => validateCommunityFile('x.txt', Buffer.from([0xff, 0xfe])), /COMMUNITY_FILE_TYPE/);
    assert.throws(() => validateCommunityFile('x.exe', Buffer.from('MZ')), /COMMUNITY_FILE_TYPE/);
    assert.equal((await upload(peer, topic, Array.from({ length: 4 }, () => ({ name: 'file.txt', data: Buffer.from('text') })))).statusCode, 413);
    // Synthetic quota metadata only, scoped to these fixture users and removed below.
    const quota = await prisma.communityAttachment.create({ data: { messageId: source.id, workspaceId: owner.id, uploaderId: owner.id,
      fileName: 'quota.txt', mimeType: 'text/plain', size: 5242880, checksum: 'fixture', content: new Uint8Array([65]) } });
    await prisma.communityAttachment.createMany({ data: Array.from({ length: WORKSPACE_FILE_LIMIT / 5242880 - 1 }, (_, i) => ({
      messageId: source.id, workspaceId: owner.id, uploaderId: owner.id, fileName: `quota-${i}.txt`, mimeType: 'text/plain', size: 5242880, checksum: 'fixture', content: new Uint8Array([65]) })) });
    assert.equal((await upload(peer, topic, [{ name: 'quota.txt', data: Buffer.from('over quota') }])).statusCode, 413);
    await prisma.communityAttachment.deleteMany({ where: { messageId: source.id } });
    assert.ok(quota.id);
    await prisma.auditLog.create({ data: { actor: peer.id, action: 'community.files_uploaded', targetType: 'community', targetId: tag, dryRun: false, metadata: { bytes: 50 * 1024 * 1024, files: 10 } } });
    assert.equal((await upload(peer, topic, [{ name: 'daily.txt', data: Buffer.from('daily quota survives deletion') }])).statusCode, 413);
    const members = (await send(viewer, 'GET', '/members')).json().members;
    assert.ok(members.some(m => m.id === viewer.id)); assert.ok(members.some(m => m.id === owner.id));
    assert.equal(members.some(m => [foreign.id, inactive.id, independentAdmin.id].includes(m.id)), false);
    assert.deepEqual(Object.keys(members[0]).sort(), ['displayName', 'id']);
    const taskInput = { title: 'Review fixture', description: 'Follow up', assigneeId: viewer.id, sourceMessageId: source.id, dueAt: '2026-11-01T12:00:00Z', clientKey: randomUUID() };
    const taskCreated = await send(owner, 'POST', '/tasks', taskInput); assert.equal(taskCreated.statusCode, 201); const taskId = taskCreated.json().id;
    assert.equal((await send(owner, 'POST', '/tasks', taskInput)).json().id, taskId);
    assert.equal((await send(owner, 'POST', '/tasks', { ...taskInput, title: 'Different' })).statusCode, 409);
    assert.equal((await send(owner, 'POST', '/tasks', { ...taskInput, clientKey: randomUUID(), assigneeId: foreign.id })).statusCode, 400);
    assert.equal((await send(owner, 'POST', '/tasks', { ...taskInput, clientKey: randomUUID(), assigneeId: inactive.id })).statusCode, 400);
    const privateSource = (await send(viewer, 'GET', `/threads/${ticket}`)).json().messages[0].id;
    assert.equal((await send(viewer, 'POST', '/tasks', { ...taskInput, clientKey: randomUUID(), sourceMessageId: privateSource })).statusCode, 404);
    assert.equal((await send(foreign, 'GET', '/tasks')).json().tasks.length, 0);
    assert.equal((await send(viewer, 'GET', '/tasks?mine=true')).json().tasks[0].id, taskId);
    assert.equal((await send(peer, 'PATCH', `/tasks/${taskId}`, { status: 'done', expectedVersion: 1 })).statusCode, 403);
    assert.equal((await send(viewer, 'PATCH', `/tasks/${taskId}`, { assigneeId: peer.id, expectedVersion: 1 })).statusCode, 403);
    const progressed = await send(viewer, 'PATCH', `/tasks/${taskId}`, { status: 'in_progress', expectedVersion: 1 });
    assert.equal(progressed.statusCode, 200); assert.equal(progressed.json().task.version, 2);
    assert.equal((await send(owner, 'PATCH', `/tasks/${taskId}`, { status: 'done', expectedVersion: 1 })).statusCode, 409);
    assert.equal((await send(owner, 'PATCH', `/tasks/${taskId}`, { status: 'done', expectedVersion: 2 })).statusCode, 200);
    const deleted = await send(viewer, 'DELETE', `/threads/${topic}/messages/${message.id}`, { expectedRevision: edited.json().message.changeSequence });
    assert.equal(deleted.statusCode, 200); assert.equal(deleted.json().message.body, ''); assert.ok(deleted.json().message.deletedAt);
    const afterDelete = (await send(peer, 'GET', `/threads/${topic}`)).json();
    assert.equal(afterDelete.messages.find(m => m.id === reply.json().message.id).replyTo.body, '');
    assert.equal((await send(viewer, 'POST', `/threads/${topic}/messages`, { body: 'Reply to deleted', replyToId: message.id, clientKey: randomUUID() })).statusCode, 404);
    assert.equal((await send(viewer, 'DELETE', `/threads/${ticket}/messages/${fileMessage.id}`, { expectedRevision: fileMessage.changeSequence })).statusCode, 200);
    assert.equal((await send(owner, 'GET', `/threads/${ticket}/attachments/${file.id}`)).statusCode, 404);
    assert.equal(await prisma.communityAttachment.count({ where: { messageId: fileMessage.id } }), 0);
    assert.equal((await app.inject({ method: 'PATCH', url: `/api/community/tasks/${taskId}`, headers: { cookie: owner.headers.cookie }, payload: { status: 'todo', expectedVersion: 3 } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/api/devices', headers: viewer.headers, payload: {} })).statusCode, 403);
    const second = await buildApp();
    try { assert.equal((await second.inject({ url: '/api/community/tasks?mine=true', headers: viewer.headers })).json().tasks[0].status, 'done'); } finally { await second.close(); }
    const audit = await prisma.auditLog.findMany({ where: { actor: { in: users }, action: { in: ['community.message_edited', 'community.message_deleted', 'community.task_created'] } } });
    assert.ok(audit.length >= 4); assert.equal(JSON.stringify(audit).includes('<script>'), false);
  } finally {
    await app.close(); await prisma.auditLog.deleteMany({ where: { actor: { in: users }, targetType: 'community' } });
    await prisma.appUser.deleteMany({ where: { id: { in: users } } }); await shutdownDatabase();
  }
});
