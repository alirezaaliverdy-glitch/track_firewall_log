// Run against a disposable migrated TEST_DATABASE_URL only, with runtime /app/dist.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID, randomBytes } from 'node:crypto';

test('community: persisted chat, private tickets, workspace isolation, CSRF, cursors, retries and admin handling', async () => {
  process.env.AUTH_SESSION_SECRET = randomBytes(32).toString('hex');
  process.env.LOG_LEVEL = 'silent';
  const { prisma, shutdownDatabase } = await import('../dist/db/prisma.js');
  const { buildApp } = await import('../dist/app.js');
  const { createSession } = await import('../dist/services/auth.service.js');
  const app = await buildApp(); const users = [], tag = `community-fixture-${randomUUID()}`;
  async function identity(role, workspaceOwnerId) {
    const user = await prisma.appUser.create({ data: { username: `${tag}-${users.length}`, displayName: `Fixture ${users.length}`, role,
      passwordHash: 'fixture-not-a-login-password', workspaceOwnerId, allowedSections: [] } }); users.push(user.id);
    const session = await createSession(user.id, {}), cookie = `firewall_session=${session.token}`;
    const csrf = await app.inject({ url: '/api/auth/csrf', headers: { cookie } });
    assert.equal(csrf.statusCode, 200);
    return { id: user.id, token: session.token, headers: { cookie, 'x-csrf-token': csrf.json().csrfToken } };
  }
  const path = '/api/community/threads';
  const send = (who, method, url, payload) => app.inject({ method, url: path + url, headers: who.headers, ...(payload ? { payload } : {}) });
  try {
    const owner = await identity('admin'), other = await identity('admin'), one = await identity('viewer', owner.id), two = await identity('operator', owner.id);
    assert.equal((await app.inject({ url: path + '?kind=ticket' })).statusCode, 401);
    const input = { title: 'Fixture support', body: '<script>not executable</script>', kind: 'ticket', clientKey: randomUUID() };
    assert.equal((await app.inject({ method: 'POST', url: path, headers: { cookie: one.headers.cookie }, payload: input })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: path, headers: { ...one.headers, origin: 'https://untrusted.example' }, payload: input })).statusCode, 403);
    const created = await send(one, 'POST', '', input); assert.equal(created.statusCode, 201);
    const ticket = created.json().id;
    assert.equal((await send(one, 'POST', '', input)).json().id, ticket, 'retry returns the same ticket');
    assert.equal((await send(one, 'POST', '', { ...input, title: 'Changed request' })).statusCode, 409);
    assert.equal((await send(two, 'GET', `/${ticket}`)).statusCode, 404);
    assert.equal((await send(other, 'GET', `/${ticket}`)).statusCode, 404, 'other workspace admin cannot see ticket');
    assert.equal((await send(two, 'GET', '?kind=ticket')).json().threads.length, 0);
    assert.equal((await send(owner, 'GET', '?kind=ticket')).json().threads.length, 1);
    assert.equal((await send(owner, 'GET', `/${ticket}`)).json().messages[0].body, input.body);
    assert.equal((await send(one, 'PATCH', `/${ticket}`, { status: 'resolved' })).statusCode, 403);
    assert.equal((await send(two, 'POST', `/${ticket}/messages`, { body: 'not allowed', clientKey: randomUUID() })).statusCode, 404);
    const topic = (await send(two, 'POST', '', { ...input, title: 'Workspace discussion', kind: 'discussion', clientKey: randomUUID() })).json().id;
    assert.equal((await send(one, 'GET', `/${topic}`)).statusCode, 200);
    assert.equal((await send(other, 'GET', `/${topic}`)).statusCode, 404);
    const replyInput = { body: 'Fixture reply', clientKey: randomUUID() };
    const replies = await Promise.all([send(one, 'POST', `/${topic}/messages`, replyInput), send(one, 'POST', `/${topic}/messages`, replyInput)]);
    assert.equal(replies[0].statusCode, 200); assert.equal(replies[1].statusCode, 200);
    assert.equal(replies[0].json().message.id, replies[1].json().message.id);
    assert.equal((await send(one, 'POST', `/${topic}/messages`, { ...replyInput, body: 'changed' })).statusCode, 409);
    assert.equal((await send(one, 'POST', `/${topic}/messages`, { body: ' ', clientKey: randomUUID() })).statusCode, 400);
    assert.equal((await send(one, 'POST', `/${topic}/messages`, { body: 'x'.repeat(4001), clientKey: randomUUID() })).statusCode, 400);
    const detail = (await send(two, 'GET', `/${topic}`)).json();
    assert.equal(detail.messages.length, 2); assert.equal(JSON.stringify(detail).includes('passwordHash'), false);
    assert.equal((await send(two, 'GET', '?kind=discussion')).json().threads[0].unread, true);
    const seq = detail.messages.at(-1).sequence;
    assert.equal((await send(two, 'POST', `/${topic}/read`, { sequence: seq })).statusCode, 200);
    await send(two, 'POST', `/${topic}/read`, { sequence: detail.messages[0].sequence });
    assert.equal((await send(two, 'GET', '?kind=discussion')).json().threads[0].unread, false, 'read position never regresses');
    assert.equal((await send(two, 'POST', `/${topic}/read`, { sequence: 2147483647 })).statusCode, 400);
    assert.equal((await send(two, 'POST', `/${ticket}/read`, { sequence: seq })).statusCode, 404);
    await prisma.communityMessage.createMany({ data: Array.from({ length: 65 }, (_, i) => ({ threadId: topic, authorId: one.id, clientKey: `page-${i}`, body: `History ${i}` })) });
    const page = (await send(one, 'GET', `/${topic}`)).json(); assert.equal(page.messages.length, 60); assert.equal(page.hasMore, true);
    const earlier = (await send(one, 'GET', `/${topic}?before=${page.messages[0].sequence}`)).json(); assert.equal(earlier.messages.length, 7);
    const after = (await send(one, 'GET', `/${topic}?after=${seq}`)).json(); assert.equal(after.messages.length, 60); assert.equal(after.hasMore, true);
    assert.ok(after.messages.every((m, i, rows) => i === 0 || m.sequence > rows[i - 1].sequence));
    assert.equal((await send(owner, 'PATCH', `/${ticket}`, { status: 'in_progress' })).statusCode, 200);
    assert.equal((await send(owner, 'PATCH', `/${ticket}`, { status: 'resolved' })).statusCode, 200);
    assert.equal((await send(one, 'POST', `/${ticket}/messages`, { body: 'Closed reply', clientKey: randomUUID() })).statusCode, 409);
    await send(owner, 'PATCH', `/${ticket}`, { status: 'open' });
    assert.equal((await send(one, 'POST', `/${ticket}/messages`, { body: 'Reopened reply', clientKey: randomUUID() })).statusCode, 200);
    const audit = await prisma.auditLog.findMany({ where: { actor: owner.id, action: 'community.status_changed' } }); assert.equal(audit.length, 3);
    const native = await app.inject({ method: 'POST', url: path + `/${topic}/messages`, headers: { authorization: `Bearer ${one.token}`, 'x-firewall-client': 'android' }, payload: { body: 'Native fixture', clientKey: randomUUID() } });
    assert.equal(native.statusCode, 200, 'native viewer can participate');
    assert.equal((await app.inject({ method: 'POST', url: '/api/cameras', headers: one.headers, payload: {} })).statusCode, 403, 'viewer device mutation remains forbidden');
    const nav = (await app.inject({ url: '/api/product-state/navigation', headers: two.headers })).json().navigation;
    assert.ok(nav.some(item => item.key === 'community'), 'operator with no device sections still has community');
    // Check durability through a second application instance, not browser-only state.
    const second = await buildApp();
    try { assert.equal((await second.inject({ url: path + `/${ticket}`, headers: one.headers })).json().messages.length, 2); } finally { await second.close(); }
  } finally {
    await app.close(); await prisma.auditLog.deleteMany({ where: { actor: { in: users }, targetType: 'community' } });
    await prisma.appUser.deleteMany({ where: { id: { in: users } } }); await shutdownDatabase();
  }
});
