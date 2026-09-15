import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { getProductNavigation, PRODUCT_FEATURES } from "../src/product-state/product-state.registry.js";

const backendRoot = process.cwd();
const frontendRoot = join(backendRoot, "..");
const readBackend = (path: string) => readFileSync(join(backendRoot, path), "utf8");
const readFrontend = (path: string) => readFileSync(join(frontendRoot, path), "utf8");

test("attacker intelligence requires a qualified finding and enriches from normalized cross-vendor events", () => {
  const service = readBackend("src/services/attacker-intelligence.service.ts");
  const routes = readBackend("src/routes/security-platform.ts");
  assert.match(service, /open_security_finding_with_valid_source_ip/);
  assert.match(service, /srcIp: exactIp \? exactIp : \{ not: null \}/);
  assert.match(service, /status: \{ notIn: CLOSED_FINDING_STATUSES \}/);
  assert.match(service, /prisma\.securityEvent\.findMany/);
  assert.match(service, /vendor: \{ equals: vendor, mode: "insensitive"/);
  assert.match(service, /redactText\(event\.rawSnippet \?\? event\.rawMessage/);
  assert.match(service, /local_telemetry_only/);
  assert.match(routes, /security\/attackers/);
  assert.match(routes, /security\/attackers\/:ip/);
});

test("integration UI routes are removed and the replacement attacker tab is registered", () => {
  const routes = readFrontend("src/routes/appRoutes.tsx");
  const shell = readFrontend("src/components/layout/AppShell.tsx");
  const page = readFrontend("src/features/attackers/pages/AttackersPage.tsx");
  assert.doesNotMatch(routes, /IntegrationsPage|path:\s*"\/integrations/);
  assert.match(routes, /path:\s*"\/attackers"/);
  assert.match(shell, /attackers:\s*Crosshair/);
  assert.match(page, /listAttackers\(\)/);
  assert.match(page, /getAttackerDetails\(ip\)/);
  assert.match(page, /فقط یافته معتبر/);
  assert.match(page, /attacker-hero/);
  assert.match(page, /مشاهده یافته‌های امنیتی/);
  const navigation = getProductNavigation();
  assert.ok(navigation.some((group) => group.key === "attackers" && group.route === "/attackers"));
  assert.ok(!navigation.some((group) => group.key === "integrations"));
  assert.ok(PRODUCT_FEATURES.some((feature) => feature.key === "attackers.overview" && feature.state === "implemented"));
  assert.ok(!PRODUCT_FEATURES.some((feature) => feature.key.startsWith("integrations.")));
});

test("attacker workspace exposes essential filtering, evidence, assets, and responsive containment", () => {
  const page = readFrontend("src/features/attackers/pages/AttackersPage.tsx");
  const styles = readFrontend("src/features/attackers/pages/AttackersPage.css");
  for (const contract of ["vendor", "severity", "scope", "query", "latestEvidence", "targetedPorts", "findings", "devices"]) assert.match(page, new RegExp(contract));
  assert.match(styles, /@media\(max-width:1100px\)/);
  assert.match(styles, /@media\(max-width:650px\)/);
  assert.match(styles, /minmax\(0,1fr\)/);
  assert.match(styles, /overflow-wrap:anywhere/);
  assert.match(styles, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});
