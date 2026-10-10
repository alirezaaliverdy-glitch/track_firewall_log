import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { securityDisplayText } from "../../src/features/security/securityPresentation.ts";

const root = join(process.cwd(), "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("Persian vendor alerts preserve measured event counts without English summaries", () => {
  assert.equal(securityDisplayText("Linux: repeated authentication failures", "fa"), "لینوکس: شکست‌های تکراری ورود");
  assert.equal(securityDisplayText("Detects a burst of failed SSH, PAM, or system authentication attempts from one source. (8 matching events in 15 minutes)", "fa"), "در 15 دقیقه، 8 رویداد مطابق این قانون ثبت شده است.");
  assert.equal(securityDisplayText("Linux: repeated authentication failures", "en"), "Linux: repeated authentication failures");
});

test("overview counts all open findings and prioritizes critical evidence", () => {
  const service = read("backend/src/assets/asset-intelligence.service.ts");
  const hook = read("src/features/security/hooks/useSecurityOperations.ts");
  assert.match(service, /filters\.scope === "overview"/);
  assert.match(service, /\["critical", "high", "medium", "low"\]/);
  assert.match(service, /groupBy\(\{ by: \["severity"\]/);
  assert.match(hook, /listSecurityFindings\(\{ scope: "overview" \}\)/);
  assert.match(hook, /document\.visibilityState === "visible"/);
  assert.match(hook, /getSecurityEmailAlertSettings\(\)/);
});

test("overview distinguishes stale monitoring and resolution requires evidence", () => {
  const overview = read("src/features/security/pages/SecurityOverviewPage.tsx");
  const detail = read("src/features/security/pages/FindingDetailPage.tsx");
  const remediation = read("src/features/security/findingRemediation.ts");
  const routes = read("backend/src/routes/security-platform.ts");
  assert.match(overview, /monitorReady/);
  assert.match(overview, /security\.live\.noCoverageClaim/);
  assert.match(overview, /security\.live\.refreshFailed/);
  assert.match(detail, /if \(!evidence\)/);
  assert.match(detail, /updateFindingStatus\(finding\.id, "resolved", true\)/);
  assert.match(detail, /window\.confirm\(t\("security\.detail\.resolveConfirm"\)\)/);
  assert.match(routes, /RESOLUTION_CONFIRMATION_REQUIRED/);
  assert.match(routes, /security\.finding\.status_changed/);
  assert.match(remediation, /چطور از رفع واقعی مطمئن شویم|صرف بسته‌شدن هشدار کافی نیست/);
  assert.doesNotMatch(remediation, /(?:Ø.|Ù.){3}/);
});
