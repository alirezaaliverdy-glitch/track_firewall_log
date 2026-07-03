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
