import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { test } from "node:test";
import type { DeviceConnector } from "../src/connectors/types.js";

process.env.AUTH_SESSION_SECRET = randomBytes(32).toString("hex");
process.env.CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString("hex");
process.env.ACTION_EXECUTION_MODE = "safe";
process.env.ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT = "false";
process.env.LOG_LEVEL = "silent";

test("created and promoted admins stay visible; legacy creator audit restores management without exposing independent admins", async () => {
  const { prisma, shutdownDatabase } = await import("../src/db/prisma.js");
  const { buildApp } = await import("../src/app.js");
  const { createSession, publicUser } = await import("../src/services/auth.service.js");
  const { createCredential } = await import("../src/services/credential.service.js");
  const { proposeActionPlan, dryRunActionPlan, quickExecuteActionPlan } = await import("../src/services/action-plan.service.js");
  const { getActionCenterItem } = await import("../src/services/action-center.service.js");
  const { approvalRequirements } = await import("../src/actions/action-plan/action-plan.shared.js");
  const app = await buildApp(); const tag = `response-regression-${randomUUID()}`, users: string[] = [], devices: string[] = [];
  let credentialId: string | undefined;
  async function account(suffix: string, role: "admin" | "viewer" = "admin", workspaceOwnerId?: string) {
    const user = await prisma.appUser.create({ data: { username: `${tag}-${suffix}`, displayName: suffix, role, workspaceOwnerId, passwordHash: "fixture-not-a-login" } }); users.push(user.id);
    const session = await createSession(user.id, {}); return { ...user, headers: { authorization: `Bearer ${session.token}` } };
  }
  try {
    const owner = await account("owner"), independent = await account("independent"), viewer = await account("viewer", "viewer", owner.id);
    const create = await app.inject({ method: "POST", url: "/api/admin/users", headers: owner.headers, payload: { username: `${tag}-created`, displayName: "Created admin", role: "admin", password: randomUUID() } });
    assert.equal(create.statusCode, 201); const childId = create.json().user.id as string; users.push(childId);
    const child = await prisma.appUser.findUniqueOrThrow({ where: { id: childId } });
    assert.equal(child.workspaceOwnerId, owner.id); assert.equal(publicUser(child).scopeOwnerId, child.id, "admin workspace scope stays independent");
    const list = () => app.inject({ url: "/api/admin/users", headers: owner.headers });
    assert.ok((await list()).json().users.some((user: { id: string }) => user.id === childId));
    assert.equal((await list()).json().users.some((user: { id: string }) => user.id === independent.id), false);
    const promoted = await app.inject({ method: "PATCH", url: `/api/admin/users/${viewer.id}`, headers: owner.headers, payload: { role: "admin" } });
    assert.equal(promoted.statusCode, 200); assert.ok((await list()).json().users.some((user: { id: string }) => user.id === viewer.id));
    const legacy = await account("legacy");
    await prisma.auditLog.create({ data: { actor: owner.username, action: "admin.user.create", targetType: "user_account", targetId: legacy.id, dryRun: false } });
    assert.ok((await list()).json().users.some((user: { id: string }) => user.id === legacy.id));
    assert.equal((await app.inject({ method: "POST", url: `/api/admin/users/${legacy.id}/reset-password`, headers: owner.headers, payload: { password: randomUUID() } })).statusCode, 200);
    assert.equal((await app.inject({ method: "PATCH", url: `/api/admin/users/${independent.id}`, headers: owner.headers, payload: { displayName: "Forbidden edit" } })).statusCode, 404);
    assert.equal((await app.inject({ method: "PATCH", url: `/api/admin/users/${childId}`, headers: independent.headers, payload: { displayName: "Forbidden edit" } })).statusCode, 404);
    // Reproduce the actual server issue: safe/high mode asks for typed confirmation.
    const company = await prisma.company.create({ data: { ownerId: owner.id, code: tag, name: "Response fixture" } });
    const credential = await createCredential({ name: tag, type: "password", username: "fixture", password: randomUUID(), sudo: false }); credentialId = credential.id;
    const device = await prisma.device.create({ data: { name: tag, vendor: "linux", type: "linux_edge", protocol: "ssh", host: "127.0.0.1", managementPort: 9, environment: "lab", companyId: company.id, credentialId } }); devices.push(device.id);
    const plan = await proposeActionPlan({ actionType: "linux_block_ip", source: "detection", deviceId: device.id, requestedBy: "finding:fixture", riskLevel: "high", parametersJson: { ipAddress: "203.0.113.8", srcIp: "203.0.113.8", durationMinutes: 60 } });
    await dryRunActionPlan(plan.id);
    const center = await getActionCenterItem(plan.id); assert.equal(center?.approvalRequirements.typedApprove, true);
    let invoked = 0;
    const connector = { name: "linux_edge", supports: () => true, supportedActions: ["linux_block_ip"], execute: async () => { invoked++; return { executed: true, actionType: "linux_block_ip", deviceId: device.id, commands: [{ template: "fixture block", stdout: "fixture verified", stderr: "", exitCode: 0 }], warnings: [], rollbackJson: { verification: { ok: true, evidence: ["fixture proof"] } } }; } } as unknown as DeviceConnector;
    await assert.rejects(() => quickExecuteActionPlan(plan.id, { intent: "execute" }, { selectConnector: () => connector }), /APPROVE/);
    assert.equal(invoked, 0); assert.equal((await prisma.actionPlan.findUniqueOrThrow({ where: { id: plan.id } })).status, "dry_run_ready");
    const forged = await account("forged", "viewer", owner.id);
    // A username matching another account's ID must not affect role resolution.
    await prisma.appUser.update({ where: { id: independent.id }, data: { username: forged.id } });
    await assert.rejects(() => quickExecuteActionPlan(plan.id, { intent: "execute", approvalConfirmation: "APPROVE", approvedBy: forged.id, approvedByRole: "admin", reason: "Untrusted role claim" }, { selectConnector: () => connector }), /administrator/);
    assert.equal(invoked, 0, "a claimed admin role cannot invoke the connector");
    const executed = await quickExecuteActionPlan(plan.id, { intent: "execute", approvalConfirmation: "APPROVE", approvedBy: owner.id, approvedByRole: "admin", reason: "Explicit fixture confirmation" }, { selectConnector: () => connector });
    assert.equal(invoked, 1); assert.equal(executed?.status, "succeeded");
    const result = executed?.resultJson as Record<string, unknown>; assert.equal(result.connectorInvoked, true); assert.equal(result.executed, true); assert.equal((result.commands as unknown[]).length, 1);
    for (const risk of ["high", "critical"] as const) { const quick = approvalRequirements(risk, "quick_controlled"); assert.equal(quick.typedApprove, false); assert.equal(quick.breakGlass, false); assert.equal(quick.reason, false); }
  } finally {
    await app.close(); await prisma.actionPlan.deleteMany({ where: { deviceId: { in: devices } } }); await prisma.device.deleteMany({ where: { id: { in: devices } } });
    if (credentialId) await prisma.deviceCredential.delete({ where: { id: credentialId } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ actor: { startsWith: tag } }, { actor: { in: users } }] } });
    await prisma.appUser.deleteMany({ where: { id: { in: users } } }); await shutdownDatabase();
  }
});
