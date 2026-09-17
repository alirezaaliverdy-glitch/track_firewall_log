import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import { AiRiskLevel, ActionPlanSource, ActionPlanStatus, ActionType } from "@prisma/client";

process.env.ADMIN_USERNAME = "phase-a-admin-bootstrap";
process.env.ADMIN_PASSWORD = "phase-a-admin-password";
process.env.ADMIN_DISPLAY_NAME = "Phase A Bootstrap Admin";
process.env.AUTH_SESSION_SECRET = "phase-a-test-session-secret-that-is-long-enough";

const { buildApp } = await import("../src/app.js");
const { prisma } = await import("../src/db/prisma.js");
const { createSession, hashSessionToken } = await import("../src/services/auth.service.js");

async function createUser(username: string, role: "admin" | "operator" | "viewer") {
  await prisma.appUser.deleteMany({ where: { username } });
  return prisma.appUser.create({
    data: {
      username,
      displayName: username,
      role,
      passwordHash: await bcrypt.hash("phase-a-password", 10)
    }
  });
}

async function login(app: Awaited<ReturnType<typeof buildApp>>, username: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username, password: "phase-a-password" }
  });
  assert.equal(response.statusCode, 200);
  const cookie = response.headers["set-cookie"]?.split(";", 1)[0];
  assert.ok(cookie);
  return cookie;
}

async function csrf(app: Awaited<ReturnType<typeof buildApp>>, cookie: string) {
  const response = await app.inject({ method: "GET", url: "/api/auth/csrf", headers: { cookie } });
  assert.equal(response.statusCode, 200);
  const token = response.json().csrfToken;
  assert.equal(typeof token, "string");
  return token as string;
}

const proposalPayload = {
  source: "user",
  actionType: "generic_security_action",
  riskLevel: "low",
  parametersJson: {
    requestedOperation: "phase-a-security-acceptance",
    executionSupport: "manual_or_not_implemented"
  }
};

test("Phase A RBAC, CSRF, rate-limit, high-risk, logout, and expired-session acceptance", async (t) => {
  await prisma.actionAuditLog.deleteMany({ where: { actionPlan: { requestedBy: { contains: "phase-a-" } } } });
  await prisma.actionPlan.deleteMany({ where: { requestedBy: { contains: "phase-a-" } } });
  await prisma.authSession.deleteMany({ where: { user: { username: { startsWith: "phase-a-" } } } });
  await prisma.appUser.deleteMany({ where: { username: { startsWith: "phase-a-" } } });

  const viewer = await createUser("phase-a-viewer", "viewer");
  const operator = await createUser("phase-a-operator", "operator");
  const admin = await createUser("phase-a-admin", "admin");

  const app = await buildApp();
  t.after(async () => {
    await app.close();
    await prisma.actionAuditLog.deleteMany({ where: { actionPlan: { requestedBy: { contains: "phase-a-" } } } });
    await prisma.actionPlan.deleteMany({ where: { requestedBy: { contains: "phase-a-" } } });
    await prisma.authSession.deleteMany({ where: { user: { username: { startsWith: "phase-a-" } } } });
    await prisma.appUser.deleteMany({ where: { username: { startsWith: "phase-a-" } } });
  });

  const anonymousStatus = await app.inject({ method: "GET", url: "/api/auth/session-status" });
  assert.equal(anonymousStatus.statusCode, 200);
  assert.equal(anonymousStatus.json().authenticated, false);
  assert.equal(anonymousStatus.json().user, null);

  const viewerCookie = await login(app, viewer.username);
  const viewerCsrf = await csrf(app, viewerCookie);
  const missingCsrf = await app.inject({
    method: "POST",
    url: "/api/actions/propose",
    headers: { cookie: viewerCookie },
    payload: proposalPayload
  });
  assert.equal(missingCsrf.statusCode, 403);
  assert.equal(missingCsrf.json().reasonCode, "CSRF_VALIDATION_FAILED");

  const viewerDenied = await app.inject({
    method: "POST",
    url: "/api/actions/propose",
    headers: { cookie: viewerCookie, "x-csrf-token": viewerCsrf },
    payload: proposalPayload
  });
  assert.equal(viewerDenied.statusCode, 403);
  assert.equal(viewerDenied.json().reasonCode, "PERMISSION_DENIED");

  const operatorCookie = await login(app, operator.username);
  const operatorCsrf = await csrf(app, operatorCookie);
  const operatorAllowed = await app.inject({
    method: "POST",
    url: "/api/actions/propose",
    headers: { cookie: operatorCookie, "x-csrf-token": operatorCsrf },
    payload: { ...proposalPayload, requestedBy: "phase-a-operator" }
  });
  assert.equal(operatorAllowed.statusCode, 201);

  const highRiskPlan = await prisma.actionPlan.create({
    data: {
      source: ActionPlanSource.user,
      requestedBy: "phase-a-high-risk",
      actionType: ActionType.generic_security_action,
      status: ActionPlanStatus.approved,
      riskLevel: AiRiskLevel.high,
      parametersJson: {
        requestedOperation: "phase-a-high-risk",
        executionSupport: "manual_or_not_implemented"
      }
    }
  });

  const operatorHighRisk = await app.inject({
    method: "POST",
    url: `/api/actions/${highRiskPlan.id}/execute`,
    headers: { cookie: operatorCookie, "x-csrf-token": operatorCsrf },
    payload: { intent: "execute" }
  });
  assert.equal(operatorHighRisk.statusCode, 403);
  assert.equal(operatorHighRisk.json().reasonCode, "HIGH_RISK_PERMISSION_REQUIRED");

  const adminCookie = await login(app, admin.username);
  const adminCsrf = await csrf(app, adminCookie);
  const adminHighRisk = await app.inject({
    method: "POST",
    url: `/api/actions/${highRiskPlan.id}/execute`,
    headers: { cookie: adminCookie, "x-csrf-token": adminCsrf },
    payload: { intent: "execute" }
  });
  assert.notEqual(adminHighRisk.json().reasonCode, "HIGH_RISK_PERMISSION_REQUIRED");

  const logout = await app.inject({
    method: "POST",
    url: "/api/auth/logout",
    headers: { cookie: adminCookie, "x-csrf-token": adminCsrf }
  });
  assert.equal(logout.statusCode, 200);
  const loggedOut = await app.inject({ method: "GET", url: "/api/auth/session-status", headers: { cookie: adminCookie } });
  assert.equal(loggedOut.json().authenticated, false);

  const expiredSession = await createSession(operator.id, { userAgent: "phase-a-test", ipAddress: "127.0.0.1" });
  await prisma.authSession.update({
    where: { tokenHash: hashSessionToken(expiredSession.token) },
    data: { expiresAt: new Date(Date.now() - 1000) }
  });
  const expired = await app.inject({
    method: "GET",
    url: "/api/auth/session-status",
    headers: { cookie: `firewall_session=${expiredSession.token}` }
  });
  assert.equal(expired.statusCode, 200);
  assert.equal(expired.json().authenticated, false);

  const limitedUsername = `phase-a-limited-${Date.now()}`;
  for (let i = 0; i < 5; i += 1) {
    const failed = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: limitedUsername, password: "wrong-password" }
    });
    assert.equal(failed.statusCode, 401);
  }
  const limited = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: limitedUsername, password: "wrong-password" }
  });
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.json().reasonCode, "RATE_LIMIT_LOGIN");
  assert.ok(limited.headers["retry-after"]);
});
