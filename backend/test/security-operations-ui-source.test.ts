import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(process.cwd(), "..");
const overview = readFileSync(join(root, "src", "features", "security", "pages", "SecurityOverviewPage.tsx"), "utf8");
const operations = readFileSync(join(root, "src", "features", "security", "hooks", "useSecurityOperations.ts"), "utf8");
const findings = readFileSync(join(root, "src", "features", "security", "pages", "FindingsPage.tsx"), "utf8");
const rules = readFileSync(join(root, "src", "features", "security", "pages", "DetectionRulesPage.tsx"), "utf8");
const presentation = readFileSync(join(root, "src", "features", "security", "securityPresentation.ts"), "utf8");
const platform = readFileSync(join(root, "src", "lib", "platform.ts"), "utf8");
const en = readFileSync(join(root, "src", "i18n", "locales", "en", "common.json"), "utf8");
const fa = readFileSync(join(root, "src", "i18n", "locales", "fa", "common.json"), "utf8");

test("security command center projects stored operational evidence without inventing compliance", () => {
  for (const source of ["listSecurityFindings", "listDetectionRules", "getIncidents", "listPlatformAssets"]) assert.match(operations, new RegExp(source));
  for (const fn of ["govern", "identify", "protect", "detect", "respond", "recover"]) assert.match(overview, new RegExp(`security\\.framework\\.${fn}`));
  assert.match(en, /operational capability map, not a certification or formal compliance score/);
  assert.match(en, /ATT&CK technique coverage and CISA KEV prioritization are not claimed/);
  assert.match(fa, /نقشه قابلیت عملیاتی است، نه گواهی یا امتیاز رسمی انطباق/);
  assert.doesNotMatch(overview, /complianceScore|attackCoverage|kevCount/);
});

test("finding queue supports operator search and risk filters", () => {
  assert.match(findings, /searchable\.includes\(normalized\)/);
  assert.match(findings, /closedStatuses\.has\(finding\.status\)/);
  assert.match(findings, /security\.severity\.critical/);
  assert.match(findings, /security\.findingStatus\.investigating/);
});

test("detection rule controls call the real enable and disable endpoints", () => {
  assert.match(platform, /security\/rules\/\$\{id\}\/\$\{enabled \? "enable" : "disable"\}/);
  assert.match(rules, /updateEnabled\(rule\.id, !rule\.enabled\)/);
  assert.match(rules, /aria-pressed=\{rule\.enabled\}/);
});

test("Persian presentation localizes stored security evidence without changing raw identifiers", () => {
  assert.match(presentation, /"SSH Brute Force": "حمله حدس رمز SSH"/);
  assert.match(presentation, /"Repeated SSH authentication failures": "شکست تکراری احراز هویت SSH"/);
  assert.match(overview, /securityDisplayText\(finding\.title/);
  assert.match(findings, /securityDisplayText\(finding\.summary/);
  assert.match(rules, /securityDisplayText\(rule\.name/);
});
