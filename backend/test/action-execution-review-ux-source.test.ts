import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relative: string) => readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");

test("execution confirmation is operator-focused and hides internal fields", () => {
  const workspace = read("src/components/actions/ActionCenterWorkspace.tsx");
  const dialog = read("src/features/actions/components/ExecutionReviewDialog.tsx");
  const model = read("src/features/actions/actionCenterWorkspaceModel.tsx");

  assert.match(workspace, /ExecutionReviewDialog/);
  assert.match(dialog, /What will happen\?/);
  assert.match(dialog, /Only operator-facing execution parameters are shown/);
  assert.match(dialog, /Commands to execute/);
  assert.match(dialog, /Technical details/);
  assert.match(dialog, /PolicyGuard checks and the real connector runs/);
  assert.match(dialog, /commands\.length === 0/);
  assert.match(dialog, /event\.key === "Escape"/);
  assert.match(dialog, /document\.body\.style\.overflow = "hidden"/);
  assert.match(model, /NON_OPERATOR_PARAMETER_FIELDS/);
  for (const field of ["deviceId", "vendor", "actionType", "executionSupport", "supportReasonKey", "requiresExplicitReview", "expectedImpact"]) {
    assert.match(model, new RegExp(`"${field}"`));
  }
  assert.doesNotMatch(workspace, /RequiresExplicitReview|SupportReasonKey|ExecutionSupport/);
});

test("responsive review keeps the decision footer visible and technical data collapsible", () => {
  const css = read("src/features/actions/pages/ActionsPage.css");
  assert.match(css, /\.execution-review__body[\s\S]*overflow-y: auto/);
  assert.match(css, /\.execution-review__footer[\s\S]*flex: 0 0 auto/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*max-height: 92dvh/);
  assert.match(css, /\.execution-review__summary[\s\S]*grid-template-columns: 1fr/);
});

test("frontend rebuild script deletes only the superseded project image after health succeeds", () => {
  const deploy = read("scripts/deploy/rebuild-firewall-web.ps1");
  assert.match(deploy, /Read-ContainerImage \$ContainerName/);
  assert.match(deploy, /--no-deps --force-recreate/);
  assert.match(deploy, /did not become healthy/);
  assert.match(deploy, /docker ps -aq --filter "ancestor=\$previousImage"/);
  assert.match(deploy, /docker image ls --no-trunc --quiet/);
  assert.match(deploy, /already reclaimed by Docker/);
  assert.match(deploy, /docker image rm \$previousImage/);
  assert.doesNotMatch(deploy, /docker (?:system|image|builder) prune|docker image rm -f/);
});
