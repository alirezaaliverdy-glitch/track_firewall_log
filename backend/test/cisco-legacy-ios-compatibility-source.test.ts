import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const connectorSource = readFileSync(new URL("../src/connectors/cisco/ios-xe/cisco-iosxe.ssh.connector.ts", import.meta.url), "utf8");
const onboardingSource = readFileSync(new URL("../src/services/device-onboarding.service.ts", import.meta.url), "utf8");

test("legacy Cisco IOS SSH profile is explicit and opt-in", () => {
  assert.match(connectorSource, /Legacy Cisco IOS Compatibility Profile/);
  assert.match(connectorSource, /key:\s*"legacy_cisco"/);
  assert.match(connectorSource, /kex:\s*\{\s*append:\s*\["diffie-hellman-group14-sha1"/);
  assert.match(connectorSource, /serverHostKey:\s*\{\s*append:\s*\["ssh-rsa"\]/);
  assert.match(connectorSource, /hmac:\s*\{\s*append:\s*\["hmac-sha1",\s*"hmac-sha1-96"\]/);
  assert.match(connectorSource, /profile === "legacy_cisco"\) config\.algorithms = CISCO_LEGACY_IOS_COMPATIBILITY_PROFILE\.algorithms/);
  assert.match(connectorSource, /ciscoCompatibilityProfile\(device/);
  assert.match(connectorSource, /legacyCompatibilityApplied/);
  assert.match(connectorSource, /connectionPhase/);
});

test("onboarding keeps modern-first Cisco SSH and only retries legacy after approval", () => {
  assert.match(onboardingSource, /runReadOnlyCommands\(asDevice\(session, "modern"\), \[\.\.\.CISCO_IOS_CLASSIC_DISCOVERY_COMMANDS\]\)/);
  assert.match(onboardingSource, /session\.draft\.ciscoLegacyCompatibilityApproved !== true/);
  assert.match(onboardingSource, /runReadOnlyCommands\(asDevice\(session, "legacy_cisco"\), \[\.\.\.CISCO_IOS_CLASSIC_DISCOVERY_COMMANDS\]\)/);
  assert.match(onboardingSource, /sshCompatibilityProfile: "legacy_cisco"/);
});
