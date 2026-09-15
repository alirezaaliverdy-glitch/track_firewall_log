import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.TEST_DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:5432/firewall_log_analyzer_test";

const {
  listUnifiedActionRegistry,
  registeredActionsForVendor,
  resolveRegisteredAction,
} = await import("../src/actions/unified-action-registry.js");

test("unified action registry exposes command catalog and legacy controlled sources", () => {
  const actions = listUnifiedActionRegistry();
  const sources = new Set(actions.map((item) => item.source));

  assert.ok(actions.length > 0);
  assert.ok(sources.has("command_catalog"));
  assert.ok(sources.has("legacy_controlled_action"));
});

test("executable command-catalog actions have a connector and template-backed key", () => {
  const actions = listUnifiedActionRegistry().filter((item) => item.source === "command_catalog" && item.executable);

  assert.ok(actions.length > 0);
  assert.ok(actions.every((item) => item.connector.trim().length > 0));
  assert.ok(actions.every((item) => item.vendor !== "generic"));
});

test("registered action resolution is isolated by selected vendor and platform", () => {
  const cisco = resolveRegisteredAction({ key: "cisco.show-version", vendor: "cisco", platform: "ios-xe" });

  assert.equal(cisco?.vendor, "cisco");
  assert.equal(resolveRegisteredAction({ key: "cisco.show-version", vendor: "mikrotik", platform: "routeros" }), null);
  assert.equal(resolveRegisteredAction({ key: "cisco.show-version", vendor: "cisco", platform: "routeros" }), null);
});

test("vendor registry queries do not leak cross-vendor actions", () => {
  const mikrotik = registeredActionsForVendor("mikrotik");
  const fortigate = registeredActionsForVendor("fortigate");

  assert.ok(mikrotik.length > 0);
  assert.ok(fortigate.length > 0);
  assert.ok(mikrotik.every((item) => item.vendor === "mikrotik"));
  assert.ok(fortigate.every((item) => item.vendor === "fortigate"));
});
