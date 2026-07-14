import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildApp } from "../src/app.js";

const verificationPanel = readFileSync(new URL("../../src/features/assets/components/DeviceVerificationPanel.tsx", import.meta.url), "utf8");
const actionWorkspace = readFileSync(new URL("../../src/components/actions/ActionCenterWorkspace.tsx", import.meta.url), "utf8");
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

test("Action Center exposes the complete lifecycle and primary control contract", () => {
  for (const contract of [
    "Create ActionPlan", "Review", "Edit parameters", "Select device", "Select credential", "Preview commands",
    "Confirm", "Execute", "Retry", "Cancel", "View evidence", "View connector result", "Open related device workspace"
  ]) assert.match(actionWorkspace, new RegExp(contract));
  for (const path of ["/actions", "/actions/pending", "/actions/history", "/actions/:actionId", "/assets/devices/:deviceId"]) {
    assert.match(routes, new RegExp(path.replace(/[/:]/g, (character) => character === "/" ? "\\/" : ":")));
  }
  assert.match(actionWorkspace, /connectorInvoked=true/);
  assert.match(css, /\.action-workspace__body\.has-detail/);
  assert.match(css, /@media\(max-width:1500px\)/);
  assert.match(css, /@media\(max-width:1050px\)/);
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
