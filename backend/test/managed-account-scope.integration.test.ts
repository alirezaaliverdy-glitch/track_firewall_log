import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import bcrypt from "bcryptjs";

process.env.AUTH_SESSION_SECRET = "managed-account-scope-integration-secret-long-enough";

const { buildApp } = await import("../src/app.js");
const { prisma } = await import("../src/db/prisma.js");
const { createSession } = await import("../src/services/auth.service.js");

test("managed viewer sees admin workspace read-only; operator changes only granted section", async (t) => {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
  const username = `scope-admin-${suffix}`;
  const admin = await prisma.appUser.create({
    data: {
      username,
      displayName: "Scope test admin",
      role: "admin",
      passwordHash: await bcrypt.hash(randomUUID(), 10)
    }
  });
  const app = await buildApp();
  let companyId: string | undefined;
  t.after(async () => {
    await app.close();
    if (companyId) await prisma.company.deleteMany({ where: { id: companyId, ownerId: admin.id } });
    await prisma.appUser.deleteMany({ where: { OR: [{ id: admin.id }, { workspaceOwnerId: admin.id }] } });
  });

  const adminToken = (await createSession(admin.id, {})).token;
  const adminHeaders = { authorization: `Bearer ${adminToken}` };
  const createCompany = await app.inject({
    method: "POST", url: "/api/companies", headers: adminHeaders,
    payload: { name: "Scope test company", code: `SCOPE-${suffix.toUpperCase()}` }
  });
  assert.equal(createCompany.statusCode, 201);
  companyId = createCompany.json().company.id as string;

  const createViewer = await app.inject({
    method: "POST", url: "/api/admin/users", headers: adminHeaders,
    payload: { username: `scope-viewer-${suffix}`, displayName: "Scope viewer", password: randomUUID(), role: "viewer", allowedSections: ["dashboard"] }
  });
  assert.equal(createViewer.statusCode, 201);
  assert.equal(createViewer.json().user.allowedSections.length, 7);
  const viewerId = createViewer.json().user.id as string;
  const viewerHeaders = { authorization: `Bearer ${(await createSession(viewerId, {})).token}` };
  const viewerCompanies = await app.inject({ method: "GET", url: "/api/companies", headers: viewerHeaders });
  assert.equal(viewerCompanies.statusCode, 200);
  assert.ok(viewerCompanies.json().companies.some((item: { id: string }) => item.id === companyId));
  const viewerMutation = await app.inject({
    method: "PATCH", url: `/api/companies/${companyId}`, headers: viewerHeaders,
    payload: { name: "Forbidden change" }
  });
  assert.equal(viewerMutation.statusCode, 403);
  assert.equal(viewerMutation.json().reasonCode, "VIEWER_READ_ONLY");

  const createOperator = await app.inject({
    method: "POST", url: "/api/admin/users", headers: adminHeaders,
    payload: { username: `scope-operator-${suffix}`, displayName: "Scope operator", password: randomUUID(), role: "operator", allowedSections: ["assets"] }
  });
  assert.equal(createOperator.statusCode, 201);
  const operatorId = createOperator.json().user.id as string;
  const operatorHeaders = { authorization: `Bearer ${(await createSession(operatorId, {})).token}` };
  const operatorCompanies = await app.inject({ method: "GET", url: "/api/companies", headers: operatorHeaders });
  assert.equal(operatorCompanies.statusCode, 200);
  assert.ok(operatorCompanies.json().companies.some((item: { id: string }) => item.id === companyId));
  const operatorChange = await app.inject({
    method: "PATCH", url: `/api/companies/${companyId}`, headers: operatorHeaders,
    payload: { name: "Updated by operator" }
  });
  assert.equal(operatorChange.statusCode, 200);
  assert.equal(operatorChange.json().company.name, "Updated by operator");
  const deniedSection = await app.inject({ method: "GET", url: "/api/security/findings", headers: operatorHeaders });
  assert.equal(deniedSection.statusCode, 403);
  assert.equal(deniedSection.json().reasonCode, "SECTION_ACCESS_DENIED");
  const operatorDelete = await app.inject({
    method: "DELETE", url: `/api/companies/${companyId}`, headers: operatorHeaders,
    payload: { confirmation: "Updated by operator" }
  });
  assert.equal(operatorDelete.statusCode, 404);
});
