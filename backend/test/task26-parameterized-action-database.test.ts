import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { ActionPlanSource, ActionType, AiRiskLevel } from "@prisma/client";
import { buildCustomCommandPlan } from "../src/ai/custom-action-plan.js";
import { prisma } from "../src/db/prisma.js";
import { ACTION_PLAN_SECRET_KEYS, resolveActionPlanSecret } from "../src/services/action-plan-secret.service.js";
import { correctAndRevalidateActionPlan } from "../src/services/action-plan.service.js";

test("Linux account password is encrypted outside ActionPlan JSON and survives the parameter workflow", async (t) => {
  const device = await prisma.device.create({
    data: {
      name: `Task 26 secure Linux ${Date.now()}`,
      vendor: "Linux",
      type: "linux_edge",
      host: "192.0.2.226",
      managementPort: 22,
      protocol: "ssh",
      environment: "lab",
    },
  });
  const draft = buildCustomCommandPlan({ message: "یک کاربر جدید بساز", device });
  assert.ok(draft);
  const parametersJson = {
    operation: "create_user",
    vendor: "linux",
    userRequest: "یک کاربر جدید بساز",
    source: "ai_custom_connector_plan",
    implementationState: "implemented",
    executionSupport: "connector",
    supportState: "verified",
    executable: false,
    connectorType: draft.connectorType,
    executionTemplateRef: draft.executionTemplateRef,
    customCommandPlan: draft,
    orderedCommands: draft.orderedCommands,
    typedParameters: draft.typedParameters,
    missingFields: draft.missingFields,
    metadata: {
      source: "ai_custom_connector_plan",
      implementationState: "implemented",
      executionSupport: "connector",
      supportState: "verified",
      executable: false,
      connectorType: draft.connectorType,
      executionTemplateRef: draft.executionTemplateRef,
      customCommandPlan: draft,
      typedParameters: draft.typedParameters,
      missingFields: draft.missingFields,
      backendExecutionRequired: true,
      rawCommandExecution: false,
      reviewOnly: false,
    },
  };
  const plan = await prisma.actionPlan.create({
    data: {
      source: ActionPlanSource.ai,
      deviceId: device.id,
      actionType: ActionType.custom_vendor_action,
      riskLevel: AiRiskLevel.medium,
      parametersJson,
    },
  });
  t.after(async () => {
    await prisma.actionPlan.deleteMany({ where: { deviceId: device.id } });
    await prisma.device.delete({ where: { id: device.id } });
  });

  const password = `T26-${crypto.randomBytes(12).toString("base64url")}!a`;
  const updated = await correctAndRevalidateActionPlan(plan.id, {
    fields: { username: "task26_operator", initialPassword: password, confirmPassword: password },
  });
  assert.ok(updated);
  const serialized = JSON.stringify(updated);
  assert.equal(serialized.includes(password), false);
  assert.equal(serialized.includes("initialPassword"), false);
  assert.equal(serialized.includes("confirmPassword"), false);

  const stored = await prisma.actionPlanSecret.findUniqueOrThrow({
    where: { actionPlanId_key: { actionPlanId: plan.id, key: ACTION_PLAN_SECRET_KEYS.linuxInitialPassword } },
  });
  assert.notEqual(stored.secretEncrypted, password);
  assert.match(stored.secretEncrypted, /^v1:/);
  assert.equal(await resolveActionPlanSecret(plan.id, ACTION_PLAN_SECRET_KEYS.linuxInitialPassword), password);

  const persisted = await prisma.actionPlan.findUniqueOrThrow({ where: { id: plan.id } });
  const persistedJson = JSON.stringify(persisted.parametersJson);
  assert.equal(persistedJson.includes(password), false);
  const custom = (persisted.parametersJson as { customCommandPlan: { orderedCommands: string[]; typedParameters: Record<string, unknown> } }).customCommandPlan;
  assert.deepEqual(custom.orderedCommands, ["sudo -n useradd -m task26_operator", "sudo -n chpasswd"]);
  assert.equal(custom.typedParameters.accountAccessConfigured, true);
});
