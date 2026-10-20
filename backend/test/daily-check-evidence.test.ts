import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyCheckResult } from "../src/daily-check/daily-check-engine.js";
test("daily checks attribute only matching command evidence and do not spread one error to every section", () => {
  const result = buildDailyCheckResult({ deviceId: "fixture", vendor: "linux", outputs: [
    { template: "daily check: system", stdout: "load average: 0.20\n/dev/sda1 100G 20G 80G 20% /", exitCode: 0 },
    { template: "daily check: logs", stdout: "sshd: Failed password for invalid user fixture", exitCode: 0 },
  ] });
  assert.equal(result.sections.find(row => row.key === "resources")!.status, "safe");
  assert.equal(result.sections.find(row => row.key === "logs")!.status, "needs_review");
  assert.equal(result.sections.find(row => row.key === "vpn_ha")!.status, "not_checked");
  assert.equal(result.sections.find(row => row.key === "services")!.evidence.length, 0);
  const authLog=buildDailyCheckResult({deviceId:"fixture",vendor:"linux",outputs:[{template:"daily check: logs",stdout:"sshd: authentication failed for fixture",exitCode:0}]});
  assert.equal(authLog.sections.find(row=>row.key==="logs")!.status,"needs_review","a device authentication event is not a collector login failure");
});
test("failed collection is unknown, while measured full disk is critical", () => {
  const failed = buildDailyCheckResult({ deviceId: "fixture", vendor: "linux", outputs: [{ template: "daily check: system", stdout: "Permission denied", exitCode: 1 }] });
  assert.equal(failed.sections.find(row => row.key === "resources")!.status, "not_checked");
  assert.equal(failed.confidence, 0);
  const full = buildDailyCheckResult({ deviceId: "fixture", vendor: "linux", outputs: [{ template: "daily check: system", stdout: "/dev/sda1 100G 99G 1G 99% /", exitCode: 0 }] });
  assert.equal(full.sections.find(row => row.key === "resources")!.status, "critical");
});
test("RouterOS checks retain source attribution and never claim unseen VPN settings", () => {
  const result = buildDailyCheckResult({ deviceId: "fixture", vendor: "mikrotik", outputs: [{ template: "mikrotik daily check: /system resource print", stdout: "cpu-load: 2%", exitCode: 0 }] });
  assert.equal(result.sections.find(row => row.key === "resources")!.status, "safe"); assert.equal(result.sections.find(row => row.key === "vpn_ha")!.status, "not_checked");
});
test("unparsed and unrelated percentages cannot be treated as measured full storage", () => {
  for(const stdout of ["garbled output", "cpu idle: 99%", "free-memory: 99%"]){
    const result=buildDailyCheckResult({deviceId:"fixture",vendor:"linux",outputs:[{template:"daily check: system",stdout,exitCode:0}]});
    assert.notEqual(result.sections.find(row=>row.key==="resources")!.status,"critical");
    if(stdout==="garbled output")assert.equal(result.sections.find(row=>row.key==="resources")!.status,"not_checked");
  }
});
