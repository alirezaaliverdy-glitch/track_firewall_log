import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { countryInfo } from "../../src/features/attackers/pages/attackerCountry.ts";

const page = readFileSync(new URL("../../src/features/attackers/pages/AttackersPage.tsx", import.meta.url), "utf8");

test("country labels and flags derive only from a validated two-letter Geo database code", () => {
  assert.deepEqual(countryInfo({ countryCode: "se", countryName: "Sweden" }, "en-US"), { code: "SE", name: "Sweden", flag: "🇸🇪" });
  assert.equal(countryInfo({ countryCode: "SE<script>", countryName: "Sweden" }, "en-US"), null);
  assert.equal(countryInfo(null, "fa-IR"), null);
});

test("attacker page removes three explanatory cards and limits initial evidence while preserving expansion", () => {
  assert.doesNotMatch(page, /className="attacker-operations"/);
  assert.match(page, /latestEvidence\.slice\(0, allEvidence \? undefined : 3\)/);
  assert.match(page, /setAllEvidence\(\(value\) => !value\)/);
  assert.match(page, /countryInfo\(attacker\.enrichment\.geo, locale\)/);
  assert.match(page, /attacker\.enrichment\.status === "database_unavailable"/);
  assert.match(page, /attacker\.enrichment\.status === "not_public"/);
  assert.match(page, /refreshAttackerGeo\(\)/);
});
