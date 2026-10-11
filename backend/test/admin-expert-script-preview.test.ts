import assert from "node:assert/strict";
import test from "node:test";
import {
  ActionPlanSource,
  ActionType,
  AiRiskLevel,
  AppUserRole,
  DeviceEnvironment,
  DeviceProtocol,
  DeviceStatus,
  DeviceType,
} from "@prisma/client";
import { ActionScriptEditorError, createEditedScriptPreview } from "../src/actions/action-script-editor.service.js";
import { prisma } from "../src/db/prisma.js";
import { createCredential } from "../src/services/credential.service.js";

test("administrator-authored expert commands reach dry-run while operator spoofing is rejected", async () => {
  const runId = `admin-expert-${Date.now()}`;
  const createdUserIds: string[] = [];
  let deviceId = "";
  let credentialId = "";
  try {
    const admin = await prisma.appUser.create({
      data: {
        username: `${runId}-admin`,
        displayName: "Admin expert test",
        passwordHash: "test-only-unused-hash",
        role: AppUserRole.admin,
      },
    });
    const operator = await prisma.appUser.create({
      data: {
        username: `${runId}-operator`,
        displayName: "Operator expert test",
        passwordHash: "test-only-unused-hash",
        role: AppUserRole.operator,
      },
    });
    createdUserIds.push(admin.id, operator.id);

    const credential = await createCredential({
      name: `${runId}-credential`,
      type: "password",
      username: "collector",
      password: "test-only-not-used",
      sudo: true,
    });
    credentialId = credential.id;
    const device = await prisma.device.create({
      data: {
        name: runId,
        vendor: "linux",
        type: DeviceType.linux_edge,
        host: "192.0.2.211",
        managementPort: 22,
        protocol: DeviceProtocol.ssh,
        environment: DeviceEnvironment.lab,
        status: DeviceStatus.online,
        credentialId: credential.id,
        capabilities: {},
      },
    });
    deviceId = device.id;
    const source = await prisma.actionPlan.create({
      data: {
        source: ActionPlanSource.user,
        requestedBy: admin.id,
        deviceId: device.id,
        actionType: ActionType.linux_daily_check,
        riskLevel: AiRiskLevel.low,
        parametersJson: { metadata: { planRevision: 1 } },
      },
    });

    await assert.rejects(
      () => createEditedScriptPreview({
        sourceActionPlanId: source.id,
        sourceRevision: 1,
        script: "printf 'operator denied' | tee /tmp/operator-denied",
        verificationScript: "",
        requestedBy: operator.id,
        requestedByRole: "operator",
        executionMode: "admin_expert",
      }),
      (error: unknown) => error instanceof ActionScriptEditorError && error.code === "SCRIPT_ADMIN_REQUIRED",
    );

    const result = await createEditedScriptPreview({
      sourceActionPlanId: source.id,
      sourceRevision: 1,
      script: "printf 'admin preview' | tee /tmp/admin-preview",
      verificationScript: "",
      requestedBy: admin.id,
      requestedByRole: "admin",
      executionMode: "admin_expert",
    });
    assert.ok(result);
    assert.equal(result.actionPlan.status, "dry_run_ready");
    assert.equal(result.actionPlan.riskLevel, "high");
    const parameters = result.actionPlan.parametersJson as Record<string, unknown>;
    const metadata = parameters.metadata as Record<string, unknown>;
    const custom = parameters.customCommandPlan as Record<string, unknown>;
    assert.equal(metadata.source, "admin_expert_connector_plan");
    assert.equal(metadata.rawCommandExecution, true);
    assert.equal(custom.source, "admin_expert");
    assert.equal(custom.rawCommandExecution, true);
    assert.equal(result.actionPlan.resultJson, null);
  } finally {
    if (deviceId) {
      await prisma.actionPlan.deleteMany({ where: { deviceId } });
      await prisma.device.deleteMany({ where: { id: deviceId } });
    }
    if (credentialId) await prisma.deviceCredential.deleteMany({ where: { id: credentialId } });
    if (createdUserIds.length) await prisma.appUser.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});
