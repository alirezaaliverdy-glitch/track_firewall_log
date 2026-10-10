import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ActionType, DeviceProtocol, DeviceType } from "@prisma/client";
import { buildCustomCommandPlan, validateCustomCommandPlan } from "../src/ai/custom-action-plan.js";

const serviceSource = readFileSync(new URL("../src/actions/action-script-editor.service.ts", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../src/routes/actions.ts", import.meta.url), "utf8");

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

test("script editor creates a derived preview and never sends edited text to a raw executor", () => {
  assert.match(routeSource, /\/api\/actions\/:id\/script-editor/);
  assert.match(routeSource, /createEditedScriptPreview/);
  assert.match(serviceSource, /ActionType\.custom_vendor_action/);
  assert.match(serviceSource, /source:\s*"ai_custom_connector_plan"/);
  assert.match(serviceSource, /dryRunActionPlan\(previewPlan\.id\)/);
  assert.match(serviceSource, /rawExecution:\s*false/);
  assert.doesNotMatch(serviceSource, /exec\(|spawn\(|ssh2|client\.exec/);
});
