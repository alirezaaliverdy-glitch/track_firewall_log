import assert from "node:assert/strict";
import test from "node:test";
import { evaluateVendorTelemetry, resetFindingEngineWindows } from "../src/telemetry/vendor-finding-engine.js";
import { VENDOR_TELEMETRY_PROFILES } from "../src/telemetry/vendor-telemetry-profiles.js";

test("all requested vendors have profiles and at least five rules", () => {
  for (const vendor of ["linux", "mikrotik", "fortigate", "pfsense", "cisco", "paloalto", "juniper", "windows", "docker", "kubernetes", "aws", "azure"] as const) assert.ok(VENDOR_TELEMETRY_PROFILES[vendor].findingRules.length >= 5, vendor);
});

test("Linux SSH failures aggregate into one stable finding after threshold", () => {
  resetFindingEngineWindows(); const device = { id: "linux-1", vendor: "linux", type: "linux_edge" };
  let result = evaluateVendorTelemetry({ device, events: Array.from({ length: 5 }, () => ({ source: "auth", raw: "sshd: Failed password for root from 203.0.113.7", srcIp: "203.0.113.7" })) });
  const findings = result.findings.filter(x => x.title === "Repeated SSH authentication failures");
  assert.equal(findings.length, 1); assert.equal(findings[0].count, 5);
  result = evaluateVendorTelemetry({ device, events: [{ source: "auth", raw: "sshd: Failed password for root from 203.0.113.7", srcIp: "203.0.113.7" }] });
  assert.equal(result.findings[0].fingerprint, findings[0].fingerprint);
});

test("MikroTik exposed service becomes a vendor-specific finding", () => {
  resetFindingEngineWindows(); const result = evaluateVendorTelemetry({ device: { id: "mt-1", vendor: "MikroTik", type: "mikrotik" }, events: [{ source: "system", raw: "www management service enabled available from any public address" }] });
  assert.ok(result.findings.some(x => x.category === "management_exposure" && x.vendor === "mikrotik"));
});

test("routine low-value telemetry is suppressed and does not become a finding", () => {
  resetFindingEngineWindows(); const result = evaluateVendorTelemetry({ device: { id: "linux-2", vendor: "linux", type: "linux_edge" }, events: [{ source: "system", raw: "health-check keepalive session closed normally" }] });
  assert.equal(result.findings.length, 0); assert.equal(result.suppressed.length, 1);
});

test("normalized findings carry evidence and proposal-only remediation intent", () => {
  resetFindingEngineWindows(); const result = evaluateVendorTelemetry({ device: { id: "mt-2", vendor: "mikrotik", type: "mikrotik" }, events: [{ id: "raw-1", source: "system", raw: "telnet service enabled" }] });
  const finding = result.findings[0]; assert.ok(finding.evidence.length); assert.ok(finding.recommendedActions[0].intent); assert.equal(finding.status, "active");
});

test("Linux sudo events cannot be mislabeled as SSH attacks", () => {
  resetFindingEngineWindows();
  const device = { id: "linux-sudo", vendor: "linux", type: "linux_edge" };
  const result = evaluateVendorTelemetry({ device, events: Array.from({ length: 3 }, (_, index) => ({ id: `sudo-${index}`, source: "system", raw: `sudo[10]: pam_unix(sudo:auth): authentication failure; user=operator attempt=${index}` })) });
  assert.ok(result.findings.some((finding) => finding.title === "Repeated denied sudo attempts"));
  assert.equal(result.findings.some((finding) => finding.title === "Repeated SSH authentication failures"), false);
});

test("successful sudo session records do not create security findings", () => {
  resetFindingEngineWindows();
  const result = evaluateVendorTelemetry({ device: { id: "linux-sudo-ok", vendor: "linux", type: "linux_edge" }, events: [{ id: "sudo-ok", source: "system", raw: "sudo[3253083]: pam_unix(sudo:session): session opened for user root by operator" }] });
  assert.equal(result.findings.length, 0);
});

test("Linux SSH and sudo rule patterns stay mutually exclusive", () => {
  const sshRule = VENDOR_TELEMETRY_PROFILES.linux.findingRules.find((rule) => rule.id === "ssh-failure-burst")!;
  const sudoRule = VENDOR_TELEMETRY_PROFILES.linux.findingRules.find((rule) => rule.id === "sudo-denied-burst")!;
  const sshFailure = "sshd[90]: Failed password for root from 203.0.113.9 port 5000 ssh2";
  const sudoFailure = "sudo[10]: pam_unix(sudo:auth): authentication failure; user=operator";
  const sudoSuccess = "sudo[11]: pam_unix(sudo:session): session opened for user root by operator";
  assert.equal(sshRule.eventPattern!.test(sshFailure), true);
  assert.equal(sshRule.eventPattern!.test(sudoFailure), false);
  assert.equal(sshRule.eventPattern!.test(sudoSuccess), false);
  assert.equal(sudoRule.eventPattern!.test(sudoFailure), true);
  assert.equal(sudoRule.eventPattern!.test(sudoSuccess), false);
});
