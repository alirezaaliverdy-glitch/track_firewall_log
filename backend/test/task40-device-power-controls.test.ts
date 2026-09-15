import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.TEST_DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:5432/firewall_log_analyzer_test";

const { ActionType, AiRiskLevel } = await import("@prisma/client");
const { findCatalogItem } = await import("../src/commands/catalog/index.js");
const { getExecutionTemplate } = await import("../src/commands/execution/execution-template-registry.js");
const { compileRouterOsAction } = await import("../src/services/routeros-command-compiler.js");
const { compileFortiGateAction } = await import("../src/services/fortigate-command-compiler.js");
const { CISCO_OPERATION_REGISTRY } = await import("../src/cisco/cisco-operation-registry.js");

const root = join(process.cwd(), "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("graphical power controls expose only registered executable catalog actions", () => {
  const expected = [
    ["linux.reboot", "linux_reboot"],
    ["linux.shutdown", "linux_shutdown"],
    ["mikrotik.reboot", "mikrotik_reboot"],
    ["mikrotik.shutdown", "mikrotik_shutdown"],
    ["fortigate.reboot", "fortigate_reboot"],
    ["fortigate.shutdown", "fortigate_shutdown"],
    ["cisco.reload-device", "generic_security_action"]
  ] as const;

  for (const [catalogId, actionType] of expected) {
    const item = findCatalogItem(catalogId);
    assert.ok(item, `${catalogId} must exist`);
    assert.equal(item.implementationState, "implemented");
    assert.equal(item.supportState, "verified");
    assert.equal(item.actionType, actionType);
    if (catalogId === "cisco.reload-device") assert.equal(item.executionTemplateRef, "cisco_reload_device");
    else assert.ok(getExecutionTemplate(actionType as never), `${catalogId} must have an execution template`);
  }
});

test("MikroTik power actions compile to exact RouterOS commands", () => {
  const reboot = compileRouterOsAction({ actionType: ActionType.mikrotik_reboot, parameters: {}, riskLevel: AiRiskLevel.critical });
  const shutdown = compileRouterOsAction({ actionType: ActionType.mikrotik_shutdown, parameters: {}, riskLevel: AiRiskLevel.critical });
  assert.equal(reboot.commandSpecs[0]?.command, "/system reboot");
  assert.equal(shutdown.commandSpecs[0]?.command, "/system shutdown");
  assert.equal(reboot.requiresBreakGlass, true);
  assert.equal(shutdown.lockoutSensitive, true);
});

test("FortiGate power actions use registered exact commands and an interactive confirmation path", () => {
  const reboot = compileFortiGateAction({ actionType: ActionType.fortigate_reboot, parameters: {}, riskLevel: AiRiskLevel.critical });
  const shutdown = compileFortiGateAction({ actionType: ActionType.fortigate_shutdown, parameters: {}, riskLevel: AiRiskLevel.critical });
  assert.equal(reboot.commandSpecs[0]?.command, "execute reboot");
  assert.equal(shutdown.commandSpecs[0]?.command, "execute shutdown");
  assert.equal(shutdown.rollbackJson.expectedDisconnect, true);

  const connector = read("backend/src/connectors/fortigate-ssh.connector.ts");
  assert.match(connector, /execute\\s\+\(\?:reboot\|shutdown\)/);
  assert.match(connector, /confirmationSent = true/);
  assert.match(connector, /stream\.write\("y\\n"\)/);
});

test("Cisco exposes audited delayed reload but does not claim universal shutdown support", () => {
  const reload = CISCO_OPERATION_REGISTRY.find((item) => item.slug === "reload-device");
  assert.equal(reload?.state, "implemented");
  const specs = reload?.buildCommandSpecs?.({}) ?? [];
  assert.equal(specs[0]?.command, "reload in 1 reason Firewall-SOAR-approved-action");
  assert.ok(specs[0]?.confirmationPattern?.test("Proceed with reload? [confirm]"));

  const page = read("src/features/assets/pages/PortTopologyPage.tsx");
  assert.match(page, /key === "cisco"\) return \{ reboot: "cisco\.reload-device" \}/);
  assert.doesNotMatch(page, /key === "cisco"[^\n]+shutdown:/);
});

test("Linux power commands are delayed, bounded templates and the topology requires an administrator", () => {
  const planner = read("backend/src/connectors/vendors/linux-edge.planner.ts");
  const connector = read("backend/src/connectors/linux-ssh.connector.ts");
  const page = read("src/features/assets/pages/PortTopologyPage.tsx");
  assert.match(planner, /systemd-run --quiet --no-block --on-active=3s systemctl/);
  assert.match(connector, /systemd-run --quiet --no-block --on-active=3s systemctl/);
  assert.match(page, /enabled=\{user\?\.role === "admin"\}/);
  assert.match(page, /intent: "preview"/);
  assert.match(page, /intent: "execute"/);
  assert.match(page, /actionWasExecuted/);
});
