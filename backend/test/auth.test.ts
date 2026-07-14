import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";

process.env.ADMIN_USERNAME = "codex-auth-test-admin";
process.env.ADMIN_PASSWORD = "change-me-please";
process.env.ADMIN_DISPLAY_NAME = "Auth Test Admin";
process.env.AUTH_SESSION_SECRET = "test-only-session-secret-that-is-long-enough";

const { buildApp } = await import("../src/app.js");
const { prisma } = await import("../src/db/prisma.js");

test("authentication lifecycle, bootstrap, and protected routes", async (t) => {
  await prisma.appUser.deleteMany({ where: { username: process.env.ADMIN_USERNAME } });
  await prisma.appUser.create({
    data: {
      username: process.env.ADMIN_USERNAME!,
      passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD!, 10),
      displayName: process.env.ADMIN_DISPLAY_NAME!,
      role: "admin"
    }
  });
  const app = await buildApp();
  t.after(async () => {
    await prisma.appUser.deleteMany({ where: { username: process.env.ADMIN_USERNAME } });
    await app.close();
  });

  const admin = await prisma.appUser.findUnique({ where: { username: process.env.ADMIN_USERNAME! } });
  assert.ok(admin, "first admin is bootstrapped");
  assert.notEqual(admin.passwordHash, process.env.ADMIN_PASSWORD);
  assert.equal(await bcrypt.compare(process.env.ADMIN_PASSWORD!, admin.passwordHash), true);

  const ready = await app.inject({ method: "GET", url: "/api/health/ready" });
  assert.equal(ready.statusCode, 200);
  assert.equal(ready.json().databaseReady, true);
  assert.equal(ready.json().schemaReady, true);
  assert.equal(ready.json().runtime.host, "127.0.0.1");
  assert.equal(ready.json().runtime.port, 5432);
  assert.equal(ready.json().runtime.database, "firewall_log_analyzer");
  assert.equal(ready.json().runtime.schema, "public");

  const anonymousMe = await app.inject({ method: "GET", url: "/api/auth/me" });
  assert.equal(anonymousMe.statusCode, 401);

  const protectedResponse = await app.inject({ method: "GET", url: "/api/devices" });
  assert.equal(protectedResponse.statusCode, 401);
  assert.equal(protectedResponse.json().error, "unauthorized");

  const failed = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "admin", password: "wrong-password" } });
  assert.equal(failed.statusCode, 401);

  const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD } });
  assert.equal(login.statusCode, 200);
  const cookie = login.headers["set-cookie"]?.split(";", 1)[0];
  assert.ok(cookie);

  const authenticatedMe = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
  assert.equal(authenticatedMe.statusCode, 200);
  assert.equal(authenticatedMe.json().user.username, process.env.ADMIN_USERNAME);

  const logout = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie } });
  assert.equal(logout.statusCode, 200);
  assert.match(String(logout.headers["set-cookie"]), /firewall_session=;/);
  assert.equal((await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } })).statusCode, 401);
});
