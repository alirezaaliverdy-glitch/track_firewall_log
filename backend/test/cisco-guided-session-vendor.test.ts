import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
test("Cisco generic-firewall inventory entries retain Cisco vendor in guided sessions", () => {
  const route = readFileSync(new URL("../src/routes/action-sessions.ts", import.meta.url), "utf8");
  assert.match(route, /if \(vendor.includes\("cisco"\)\) return "cisco";/);
  assert.ok(route.indexOf('vendor.includes("cisco")') < route.indexOf('device.type === "generic_firewall"'));
});
test("catalog wizard navigation remains relative to the router basename", () => {
  const panel = readFileSync(new URL("../../src/components/commands/CommandCatalogPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /navigate\(`\$\{location.pathname\}\$\{url.search\}`/);
  assert.doesNotMatch(panel, /navigate\(`\$\{url.pathname\}/);
});
