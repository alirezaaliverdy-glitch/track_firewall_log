import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ActionType, DeviceProtocol, DeviceType } from "@prisma/client";
import { buildCustomCommandPlan, validateCustomCommandPlan } from "../src/ai/custom-action-plan.js";
import { getActionParameterSchema } from "../src/actions/parameter-schema-registry.js";

const linuxDevice = {
  id: "linux-parameter-test",
  type: DeviceType.linux_edge,
  vendor: "Linux",
  protocol: DeviceProtocol.ssh,
  capabilities: { platform: "ubuntu" },
};

test("Linux create-user requests collect username, password, and confirmation in order", () => {
  const draft = buildCustomCommandPlan({ message: "برای من یک یوزر جدید بساز", device: linuxDevice });
  assert.ok(draft);
  assert.deepEqual(draft.missingFields, ["username", "initialPassword", "confirmPassword"]);
  assert.deepEqual(draft.orderedCommands, []);

  const named = buildCustomCommandPlan({
    message: "برای من یک یوزر جدید بساز",
    device: linuxDevice,
    parameters: { operation: "create_user", username: "operator_one" },
  });
  assert.ok(named);
  assert.deepEqual(named.missingFields, ["initialPassword", "confirmPassword"]);

  const schema = getActionParameterSchema({
    actionType: ActionType.custom_vendor_action,
    vendor: "Linux",
    parametersJson: { customCommandPlan: named },
  });
  assert.deepEqual(schema.fields.map((field) => field.key), ["username", "initialPassword", "confirmPassword"]);
  assert.deepEqual(schema.secretFields, ["initialPassword", "confirmPassword"]);
  assert.equal(schema.fields[1]?.minLength, 12);
  assert.equal(schema.fields[2]?.confirmFor, "initialPassword");
});

test("completed Linux create-user plans contain only controlled commands and no password", () => {
  const transientPassword = `${randomBytes(18).toString("base64url")}aA1!`;
  const plan = buildCustomCommandPlan({
    message: "create a user account",
    device: linuxDevice,
    parameters: {
      operation: "create_user",
      username: "operator_two",
      accountAccessConfigured: true,
      typedParameters: { initialPassword: transientPassword, confirmPassword: transientPassword },
    },
  });
  assert.ok(plan);
  assert.deepEqual(plan.missingFields, []);
  assert.deepEqual(plan.orderedCommands, ["sudo -n useradd -m operator_two", "sudo -n chpasswd"]);
  assert.equal(JSON.stringify(plan).includes(transientPassword), false);

  const validation = validateCustomCommandPlan({ plan, device: linuxDevice, actionType: ActionType.custom_vendor_action });
  assert.equal(validation.valid, true, validation.errors.join("; "));
});

test("password execution uses encrypted action storage and SSH stdin, never command interpolation", () => {
  const correctionService = readFileSync(new URL("../src/actions/action-plan/action-plan-preview.service.ts", import.meta.url), "utf8");
  const connector = readFileSync(new URL("../src/connectors/linux-ssh.connector.ts", import.meta.url), "utf8");
  const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  const configurePage = readFileSync(new URL("../../src/features/actions/pages/ActionConfigurePage.tsx", import.meta.url), "utf8");

  assert.match(correctionService, /storeActionPlanSecret/);
  assert.match(correctionService, /delete sanitizedCorrections\.initialPassword/);
  assert.match(correctionService, /ACCOUNT_PASSWORD_MISMATCH/);
  assert.match(schema, /model ActionPlanSecret/);
  assert.match(connector, /execCheckedWithStdin\(client, command, `\$\{username\}:\$\{initialPassword\}\\n`\)/);
  assert.doesNotMatch(connector, /chpasswd.*initialPassword/);
  assert.match(configurePage, /autoComplete=.*new-password/);
});
