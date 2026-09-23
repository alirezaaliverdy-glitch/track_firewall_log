import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("mobile LAN helper is narrow, self-elevating, and verifies the live URL", () => {
  const script = source("scripts/deploy/enable-mobile-lan-access.ps1");
  assert.match(script, /-Verb RunAs/);
  assert.match(script, /-RemoteAddress LocalSubnet/);
  assert.match(script, /-LocalPort \$Port/);
  assert.match(script, /Invoke-WebRequest -Uri \$url/);
  assert.doesNotMatch(script, /RemoteAddress\s+(?:Any|\*)/i);
});

test("deployment guides clone the current main branch and root compose", () => {
  const english = source("DEPLOYMENT.md");
  const persian = source("README_FA.md");
  for (const document of [english, persian]) {
    assert.match(document, /--branch main --single-branch/);
    assert.match(document, /docker compose up -d/);
    assert.doesNotMatch(document, /--branch latest-safe-snapshot/);
  }
});
