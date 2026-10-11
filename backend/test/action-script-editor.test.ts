import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ActionType, DeviceProtocol, DeviceType } from "@prisma/client";
import { buildCustomCommandPlan, validateCustomCommandPlan } from "../src/ai/custom-action-plan.js";
import { linuxDailyCheckCommands, linuxReadCommand } from "../src/connectors/linux/command-library.js";

const serviceSource = readFileSync(new URL("../src/actions/action-script-editor.service.ts", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../src/routes/actions.ts", import.meta.url), "utf8");
const policyGuardSource = readFileSync(new URL("../src/services/policy-guard.service.ts", import.meta.url), "utf8");
const editorUiSource = readFileSync(new URL("../../src/features/actions/pages/ActionScriptEditorPage.tsx", import.meta.url), "utf8");

const linuxDevice = {
  id: "linux-script-editor",
  type: DeviceType.linux_edge,
  vendor: "Linux",
  protocol: DeviceProtocol.ssh,
  capabilities: { platform: "ubuntu" },
};

function editorPlan(commands: string[], verificationCommands: string[]) {
  return buildCustomCommandPlan({
    message: "Advanced script editor for linux",
    device: linuxDevice,
    parameters: {
      customCommandPlan: {
        orderedCommands: commands,
        verificationCommands,
        typedParameters: { operation: "edited_linux_service" },
        missingFields: [],
        riskLevel: "medium",
        expectedImpact: "Apply the operator-edited service plan.",
        rollbackGuidance: ["Restore the previous service state."],
      },
    },
  });
}

test("advanced editor accepts freely edited lines only after vendor policy validation", () => {
  const plan = editorPlan(
    ["sudo -n systemctl restart nginx", "sudo -n systemctl enable nginx"],
    ["systemctl is-active nginx", "systemctl is-enabled nginx"],
  );
  assert.ok(plan);
  const validation = validateCustomCommandPlan({ plan, device: linuxDevice, actionType: ActionType.custom_vendor_action });
  assert.equal(validation.valid, true, validation.errors.join("; "));
  assert.deepEqual(validation.normalizedPlan?.orderedCommands, ["sudo -n systemctl restart nginx", "sudo -n systemctl enable nginx"]);
  assert.equal(validation.normalizedPlan?.rawCommandExecution, false);
});

test("advanced editor fails closed for arbitrary unsupported or secret-bearing text", () => {
  for (const command of ["echo anything", "rm -rf /", "curl https://example.invalid", "password=topsecret"]) {
    const plan = editorPlan([command], ["systemctl is-active nginx"]);
    assert.ok(plan);
    const validation = validateCustomCommandPlan({ plan, device: linuxDevice, actionType: ActionType.custom_vendor_action });
    assert.equal(validation.valid, false, command);
  }
});

test("authenticated administrator expert mode accepts operator-authored commands outside the curated allowlist", () => {
  const controlled = editorPlan(["printf 'status' | tee /tmp/vendor-status"], []);
  assert.ok(controlled);
  const expert = {
    ...controlled,
    source: "admin_expert" as const,
    rawCommandExecution: true,
  };
  const denied = validateCustomCommandPlan({ plan: expert, device: linuxDevice, actionType: ActionType.custom_vendor_action });
  assert.equal(denied.valid, false);
  assert.ok(denied.errors.some((error) => error.includes("authenticated administrator")));

  const allowed = validateCustomCommandPlan({ plan: expert, device: linuxDevice, actionType: ActionType.custom_vendor_action, allowAdminExpert: true });
  assert.equal(allowed.valid, true, allowed.errors.join("; "));
  assert.deepEqual(allowed.normalizedPlan?.orderedCommands, ["printf 'status' | tee /tmp/vendor-status"]);
  assert.equal(allowed.normalizedPlan?.verificationCommands.length, 0);
  assert.equal(allowed.normalizedPlan?.riskLevel, "high");
  assert.equal(allowed.normalizedPlan?.rawCommandExecution, true);
  assert.equal(allowed.normalizedPlan?.typedParameters.requiredRole, "admin");
});

test("administrator expert mode still rejects secrets and catastrophic commands", () => {
  for (const command of ["password=do-not-store-this", "rm -rf /"]) {
    const controlled = editorPlan([command], []);
    assert.ok(controlled);
    const expert = { ...controlled, source: "admin_expert" as const, rawCommandExecution: true };
    const validation = validateCustomCommandPlan({ plan: expert, device: linuxDevice, actionType: ActionType.custom_vendor_action, allowAdminExpert: true });
    assert.equal(validation.valid, false, command);
  }
});

test("script editor creates a derived preview and never sends edited text to a raw executor", () => {
  assert.match(routeSource, /\/api\/actions\/:id\/script-editor/);
  assert.match(routeSource, /createEditedScriptPreview/);
  assert.match(serviceSource, /ActionType\.custom_vendor_action/);
  assert.match(serviceSource, /adminExpert \? "admin_expert_connector_plan" : "ai_custom_connector_plan"/);
  assert.match(serviceSource, /dryRunActionPlan\(previewPlan\.id\)/);
  assert.match(serviceSource, /rawExecution:\s*false/);
  assert.doesNotMatch(serviceSource, /exec\(|spawn\(|ssh2|client\.exec/);
});

test("administrator expert mode is role-gated in API, PolicyGuard, and UI", () => {
  assert.match(routeSource, /requestedByRole:\s*actorRole\(request\)/);
  assert.match(serviceSource, /SCRIPT_ADMIN_REQUIRED/);
  assert.match(serviceSource, /admin_expert_connector_plan/);
  assert.match(policyGuardSource, /role:\s*"admin",\s*isActive:\s*true/);
  assert.match(policyGuardSource, /allowAdminExpert/);
  assert.match(editorUiSource, /user\?\.role === "admin"/);
  assert.match(editorUiSource, /executionMode:\s*expertMode \? "admin_expert" : "controlled"/);
});

test("script editor can open an empty draft before a custom command preview exists", () => {
  assert.doesNotMatch(serviceSource, /SCRIPT_PREVIEW_UNAVAILABLE/);
  assert.match(serviceSource, /script:\s*commands\.join\("\\n"\)/);
  assert.match(serviceSource, /verificationScript:\s*verificationCommands\.join\("\\n"\)/);
});

test("catalog read-only commands stay in the main editable script and are never reduced to labels", () => {
  const daily = linuxDailyCheckCommands();
  assert.equal(daily.length, 6);
  assert.equal(daily.some((item) => item.command.includes("controlled Linux daily-check bundle")), false);
  assert.ok(daily.every((item) => item.command.length > 20));
  assert.equal(linuxReadCommand(ActionType.linux_read_auth_logs, "sudo -n ")?.command.startsWith("sudo -n journalctl"), true);
  assert.match(serviceSource, /const hasWriteCommand = specs\.some/);
  assert.match(serviceSource, /!hasWriteCommand \|\| item\.write !== false/);
});

test("the complete registered daily-check bundle remains previewable after opening it in the editor", () => {
  const commands = linuxDailyCheckCommands().map((item) => item.command);
  const plan = editorPlan(commands, [commands.at(-1)!]);
  assert.ok(plan);
  const validation = validateCustomCommandPlan({ plan, device: linuxDevice, actionType: ActionType.custom_vendor_action });
  assert.equal(validation.valid, true, validation.errors.join("; "));
  assert.deepEqual(validation.normalizedPlan?.orderedCommands, commands);
});
