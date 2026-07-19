import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const connectorSource = readFileSync(new URL("../src/connectors/cisco/ios-xe/cisco-iosxe.ssh.connector.ts", import.meta.url), "utf8");
const onboardingSource = readFileSync(new URL("../src/services/device-onboarding.service.ts", import.meta.url), "utf8");

test("legacy Cisco IOS SSH profile is explicit and opt-in", () => {
  assert.match(connectorSource, /Legacy Cisco IOS Compatibility Profile/);
  assert.match(connectorSource, /key:\s*"legacy_cisco"/);
  assert.match(connectorSource, /kex:\s*\{\s*prepend:\s*\["diffie-hellman-group14-sha1"/);
  assert.match(connectorSource, /serverHostKey:\s*\{\s*prepend:\s*\["ssh-rsa"\]/);
  assert.match(connectorSource, /hmac:\s*\{\s*prepend:\s*\["hmac-sha1",\s*"hmac-sha1-96"\]/);
  assert.match(connectorSource, /profile === "legacy_cisco"\) config\.algorithms = CISCO_LEGACY_IOS_COMPATIBILITY_PROFILE\.algorithms/);
  assert.match(connectorSource, /ciscoCompatibilityProfile\(device/);
});

test("onboarding keeps modern-first Cisco SSH and only retries legacy after approval", () => {
  assert.match(onboardingSource, /runReadOnlyCommands\(asDevice\(session, "modern"\), \["platform"\]\)/);
  assert.match(onboardingSource, /session\.draft\.ciscoLegacyCompatibilityApproved !== true/);
  assert.match(onboardingSource, /runReadOnlyCommands\(asDevice\(session, "legacy_cisco"\), \["platform"\]\)/);
  assert.match(onboardingSource, /sshCompatibilityProfile: "legacy_cisco"/);
});