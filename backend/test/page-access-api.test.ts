import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { createSession } from "../src/services/auth.service.js";
import { createManagedUser, updateManagedUser, listManagedUsers } from "../src/services/user-management.service.js";

test("real database: viewer page grants persist, protect API, and changes revoke old sessions", async t => {
  const app = await buildApp();
  const owner = await prisma.appUser.create({ data: { username: "page-qa-owner", displayName: "QA owner", role: "admin", passwordHash: "not-used-by-session-fixture" } });
  t.after(async () => { await app.close(); await prisma.appUser.deleteMany({ where: { OR: [{ id: owner.id }, { workspaceOwnerId: owner.id }] } }); });
  const selected = ["page:assets.cameras", "page:tools.vpn"];
  const created = await createManagedUser(owner.id, { username: "page-qa-viewer", displayName: "QA viewer", role: "viewer", password: "Synthetic-test-only-2026", allowedSections: selected });
  assert.deepEqual(created.allowedSections, selected);
  assert.deepEqual((await listManagedUsers(owner.id)).find(user => user.id === created.id)?.allowedSections, selected);
  const { token } = await createSession(created.id, {});
  const headers = { cookie: `firewall_session=${token}` };
  for (const url of ["/api/cameras", "/api/cameras/companies", "/api/vpn"]) assert.equal((await app.inject({ url, headers })).statusCode, 200, url);
  const navigation = await app.inject({ url: "/api/product-state/navigation", headers });
  assert.equal(navigation.statusCode, 200);
  assert.deepEqual(navigation.json().navigation.map((group: { route: string }) => group.route), ["/assets/cameras", "/tools/vpn"]);
  for (const url of ["/api/dashboard", "/api/devices", "/api/security/findings", "/api/actions", "/api/community/threads?kind=discussion", "/api/admin/users", "/api/diagnostics/network-probes", "/api/credentials", "/api/%64evices"]) {
    const response = await app.inject({ url, headers });
    assert.equal(response.statusCode, 403, url);
    assert.equal(response.json().reasonCode, "SECTION_ACCESS_DENIED");
  }
  const csrf = (await app.inject({ url: "/api/auth/csrf", headers })).json().csrfToken;
  assert.equal((await app.inject({ method: "POST", url: "/api/cameras/discover", headers: { ...headers, "x-csrf-token": csrf }, payload: {} })).statusCode, 403, "Viewer remains read-only");
  await updateManagedUser(owner.id, created.id, { allowedSections: ["page:tools.vpn"] });
  assert.equal((await app.inject({ url: "/api/vpn", headers })).statusCode, 401, "Old session revoked");
  const fresh = await createSession(created.id, {});
  const freshHeaders = { cookie: `firewall_session=${fresh.token}` };
  assert.equal((await app.inject({ url: "/api/cameras", headers: freshHeaders })).statusCode, 403);
  assert.equal((await app.inject({ url: "/api/vpn", headers: freshHeaders })).statusCode, 200);
  const admin = await createSession(owner.id, {});
  assert.equal((await app.inject({ url: "/api/admin/users", headers: { cookie: `firewall_session=${admin.token}` } })).statusCode, 200);
});
