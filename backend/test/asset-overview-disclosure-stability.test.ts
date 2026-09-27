import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const page = readFileSync(new URL("../../src/features/assets/pages/AssetDetailPage.tsx", import.meta.url), "utf8");
test("polling asset overview does not mount locally recreated React component types", () => {
  for (const name of ["AdvancedWorkspaceDetails", "SensorReadings", "OverviewTrends", "OverviewFirstViewport", "WorkspaceCharts"]) {
    assert.doesNotMatch(page, new RegExp(`<${name}\\b`));
    assert.match(page, new RegExp(`function render${name}\\(\\)`));
    assert.match(page, new RegExp(`render${name}\\(\\)`));
  }
  assert.match(page, /return renderOverviewFirstViewport\(\);/);
  assert.match(page, /asset-cisco-expanded/);
  assert.match(page, /asset-overview-technical/);
  assert.match(page, /5_000/);
});
test("transient refresh failures retain last workspace instead of unmounting disclosures", () => {
  assert.doesNotMatch(page, /if \(error \|\| !workspace\)/);
  assert.match(page, /if \(!workspace\) return <ErrorState/);
  assert.match(page, /asset-refresh-notice.*role="status"/);
});
