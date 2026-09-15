import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(process.cwd(), "..");
const onboarding = readFileSync(join(root, "src", "features", "assets", "pages", "DeviceOnboardingPage.tsx"), "utf8");
const workspace = readFileSync(join(root, "src", "features", "assets", "pages", "AssetDetailPage.tsx"), "utf8");
const client = readFileSync(join(root, "src", "lib", "deviceOnboarding.ts"), "utf8");
const lab = readFileSync(join(root, "src", "features", "tools", "pages", "WorkflowLabPage.tsx"), "utf8");
const en = readFileSync(join(root, "src", "i18n", "locales", "en", "common.json"), "utf8");
const fa = readFileSync(join(root, "src", "i18n", "locales", "fa", "common.json"), "utf8");

test("Phase B onboarding reuses the existing session contract and keeps verified/unverified outcomes explicit", () => {
  for (const symbol of ["startOnboarding", "answerOnboarding", "testOnboarding", "detectOnboarding", "discoverOnboarding", "previewOnboarding", "commitOnboarding", "registerUnverifiedOnboarding"]) {
    assert.match(onboarding, new RegExp(symbol));
  }
  assert.match(onboarding, /ciscoLegacyCompatibilityApproved/);
  assert.match(onboarding, /onboarding\.advanced\.ciscoWarning/);
  assert.match(onboarding, /verificationStatus === "unverified"/);
  assert.match(onboarding, /connectorInvoked === false/);
  assert.match(client, /class OnboardingApiError extends Error/);
  assert.match(onboarding, /mappedError/);
});

test("Phase B workspace exposes only the simplified primary tabs and moves vendor sections under Advanced", () => {
  for (const key of ["overview", "interfaces", "configuration", "actions", "monitoring", "history"]) {
    assert.match(workspace, new RegExp(`key: "${key}"`));
  }
  assert.doesNotMatch(workspace, /key: "health"/);
  assert.doesNotMatch(workspace, /key: "inventory"/);
  assert.doesNotMatch(workspace, /key: "capabilities"/);
  assert.doesNotMatch(workspace, /key: "findings"/);
  assert.match(workspace, /workspace\.cards\.connection/);
  assert.match(workspace, /workspace\.cards\.identity/);
  assert.match(workspace, /workspace\.cards\.interfaces/);
  assert.match(workspace, /workspace\.cards\.nextAction/);
  assert.match(workspace, /AdvancedWorkspaceDetails/);
  assert.match(workspace, /currentWorkspace\.vendor\.sections/);
  assert.doesNotMatch(workspace, /currentWorkspace\.vendor\.sections\.map\(\(item\) => <Link/);
});

test("Phase B workflow lab includes verified and unverified workspace fixtures with balanced locale keys", () => {
  for (const id of ["device-workspace-verified", "device-workspace-unverified"]) assert.match(lab, new RegExp(id));
  for (const key of [
    "workflowLab.examples.workspaceVerified.title",
    "workflowLab.examples.workspaceVerified.description",
    "workflowLab.examples.workspaceVerified.calloutTitle",
    "workflowLab.examples.workspaceVerified.calloutMessage",
    "workflowLab.examples.workspaceUnverified.title",
    "workflowLab.examples.workspaceUnverified.description",
    "workflowLab.examples.workspaceUnverified.calloutTitle",
    "workflowLab.examples.workspaceUnverified.calloutMessage"
  ]) {
    assert.ok(en.includes(`"${key}"`));
    assert.ok(fa.includes(`"${key}"`));
  }
  assert.doesNotMatch(fa, /\?\?\?/);
});
