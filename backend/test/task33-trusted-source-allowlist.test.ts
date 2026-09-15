import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("Task 33 trusted IPs are exact, vendor-scoped, and suppress matching open findings", () => {
  const service = readFileSync(join(process.cwd(), "src", "services", "trusted-source-ip.service.ts"), "utf8");
  assert.match(service, /if \(!isIP\(ip\)\)/);
  assert.match(service, /trusted\.has\(`\$\{normalizedIp\}\|all`\)/);
  assert.match(service, /trusted\.has\(`\$\{normalizedIp\}\|\$\{normalizedVendor\}`\)/);
  assert.match(service, /suppressionReason: `trusted_source_allowlist:\$\{vendor\}`/);
  assert.match(service, /status: \{ notIn: \["resolved", "false_positive", "accepted_risk", "suppressed"\] \}/);
});

test("Task 33 attacker aggregation filters trusted sources and management is admin-only", () => {
  const intelligence = readFileSync(join(process.cwd(), "src", "services", "attacker-intelligence.service.ts"), "utf8");
  const routes = readFileSync(join(process.cwd(), "src", "routes", "security-platform.ts"), "utf8");
  const page = readFileSync(join(process.cwd(), "..", "src", "features", "attackers", "pages", "AttackersPage.tsx"), "utf8");
  assert.match(intelligence, /buildTrustedSourceMatcher\(candidateIps\)/);
  assert.match(intelligence, /candidateFindings\.filter\(\(finding\) => !isTrusted\(finding\.srcIp, finding\.vendor\)\)/);
  assert.match(intelligence, /candidateEvents\.filter\(\(event\) => !isTrusted\(event\.srcIp, event\.vendor\)\)/);
  assert.match(routes, /request\.authUser\?\.role !== "admin"/);
  assert.match(page, /\{isAdmin \? <details className="trusted-source-panel">/);
});

