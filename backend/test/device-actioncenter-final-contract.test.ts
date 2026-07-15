import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { findCatalogItem } from "../src/commands/catalog/index.js";
import { getExecutionTemplate } from "../src/commands/execution/execution-template-registry.js";
import { getDeviceConnectors, getVendorPlanners } from "../src/connectors/connector-registry.service.js";
import { ActionType } from "@prisma/client";

const verificationPanel = readFileSync(new URL("../../src/features/assets/components/DeviceVerificationPanel.tsx", import.meta.url), "utf8");
const actionWorkspace = readFileSync(new URL("../../src/components/actions/ActionCenterWorkspace.tsx", import.meta.url), "utf8");
const actionPlanService = readFileSync(new URL("../src/services/action-plan.service.ts", import.meta.url), "utf8");
const deviceVerificationService = readFileSync(new URL("../src/services/device-verification.service.ts", import.meta.url), "utf8");
const routes = readFileSync(new URL("../../src/routes/appRoutes.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../../src/App.css", import.meta.url), "utf8");

test("Device Workspace exposes every verification control over credential references", () => {
  for (const contract of [
    "Connection & Verification", "Select credential", "Test connection", "Retry", "Detect platform",
    "Discover inventory", "Verify and commit", "Start new session", "Verification history"
  ]) assert.match(verificationPanel, new RegExp(contract));
  assert.match(verificationPanel, /listCredentials/);
  assert.match(verificationPanel, /testDeviceVerification/);
  assert.doesNotMatch(verificationPanel, /password\s*[:=]|privateKey\s*[:=]|passphrase\s*[:=]/);
});

test("Action Center exposes an operator-first preview and real execution contract", () => {
  for (const contract of [
    "Select device", "Select credential", "Select action", "Generate Preview", "Execute immediately", "Confirm and Execute", "Run again", "Test Connection",
    "Refresh Status", "Last Success", "Last Failure", "Connector state", "SSH reachability", "Authentication status",
    "Advanced Details"
  ]) assert.match(actionWorkspace, new RegExp(contract));
  assert.match(actionWorkspace, /quickExecuteAction\(plan\.id, \{ intent: "preview"/);
  assert.match(actionWorkspace, /quickExecuteAction\(selected\.id, \{ intent: "execute"/);
  assert.match(actionWorkspace, /testDeviceVerification/);
  assert.match(actionWorkspace, /setDeviceId\(selected\.deviceId\)/);
  assert.match(actionWorkspace, /operator-advanced/);
  for (const path of ["/actions", "/actions/pending", "/actions/history", "/actions/:actionId", "/assets/devices/:deviceId"]) {
    assert.match(routes, new RegExp(path.replace(/[/:]/g, (character) => character === "/" ? "\\/" : ":")));
  }
  assert.match(actionWorkspace, /connectorInvoked=true/);
  assert.match(actionWorkspace, /connectorResult\.message/);
  assert.match(actionPlanService, /executed:\s*false,\s*connectorInvoked:\s*true,\s*backupEnabled:\s*false,\s*error:\s*connectorError\.code/);
  assert.match(actionPlanService, /item\.actionType === actionType && item\.vendor === productVendor/);
  assert.match(deviceVerificationService, /lastSuccessAt:\s*successfulAttempt\?\.attemptedAt/);
  assert.match(css, /\.operator-connection--connected/);
  assert.match(css, /\.operator-run-card__selectors/);
  assert.match(css, /@media\(max-width:650px\)/);
});

test("Cisco show version is a verified read-only catalog/template/planner/connector path", () => {
  const item = findCatalogItem("cisco.show-version");
  assert.ok(item);
  assert.equal(item.supportState, "verified");
  assert.equal(item.readOnly, true);
  assert.equal(item.connectorType, "cisco-ios-xe-ssh");
  assert.equal(item.executionTemplateRef, "cisco_show_version");
  const template = getExecutionTemplate(item.executionTemplateRef);
  assert.equal(template?.actionType, ActionType.generic_security_action);
  assert.ok(getVendorPlanners().find((planner) => planner.vendor === "cisco")?.supportedActions.includes(ActionType.generic_security_action));
  assert.ok(getDeviceConnectors().find((connector) => connector.name === "cisco")?.supportedActions.includes(ActionType.generic_security_action));
});

test("live Action Center projection never accepts success without connector evidence", async (t) => {
  const app = await buildApp({ authRequired: false });
  t.after(async () => { await app.close(); });
  const response = await app.inject({ method: "GET", url: "/api/action-center?limit=100" });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.ok(body.total >= body.items.length);
  for (const item of body.items) {
    if (item.lifecycleState === "succeeded") assert.equal(item.evidence.connectorInvoked, true);
    if (!item.support.executable) assert.equal(item.controls.canExecute, false);
  }
});
