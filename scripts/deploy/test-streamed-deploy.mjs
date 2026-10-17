import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const source = readFileSync(new URL("./update-main-server.sh", import.meta.url), "utf8");
const requiredMigrations = [
  "20261009090000_managed_user_workspace_scope",
  "20261012150000_camera_workspace",
  "20261013160000_split_vpn",
  "20261013170000_vpn_asset_binding",
  "20261017120000_community",
];

function databaseProbes(script) {
  const probes = script.split(/\r?\n/).filter(line => line.includes("compose exec -T firewall-db"));
  assert.ok(probes.length > 0, "Deployment must retain its database preflight checks");
  for (const migration of requiredMigrations) {
    assert.ok(probes.some(probe => probe.includes(migration)), `Missing migration preflight: ${migration}`);
  }
  return probes;
}

function assertDetachedProbes(script) {
  for (const probe of databaseProbes(script)) {
    assert.match(probe, /<\s*\/dev\/null\b/, "Every database preflight must detach SSH stdin");
    // Run the actual command substitution with a deliberately stdin-consuming
    // Compose stub. No Docker/SQL runs; the next shell step must survive.
    const command = probe.match(/compose exec -T firewall-db.*?<\s*\/dev\/null\b/)?.[0];
    assert.ok(command);
    const input = `compose() { cat >/dev/null; printf ready; }\ncamera_migration_role=fixture_role\nprobe=$(${command})\nprintf 'next-deploy-step-ran'\n`;
    const result = spawnSync("sh", ["-s"], { input, encoding: "utf8", timeout: 5000 });
    assert.equal(result.status, 0, "Database preflight simulation must complete");
    assert.equal(result.stdout, "next-deploy-step-ran", "Database preflight consumed the remaining SSH script");
  }
}
test("Caddy validation preserves the remaining streamed SSH deployment script", () => {
  const command = source.split(/\r?\n/).find(line => line.startsWith("compose run "));
  assert.ok(command);
  const input = `compose() { cat >/dev/null; }\n${command}\nprintf 'next-deploy-step-ran'\n`;
  const result = spawnSync("sh", ["-s"], { input, encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "next-deploy-step-ran");
  assert.ok(command.includes("--interactive=false"));
});
test("non-input database probes do not attach to the streamed deployment input", () => {
  assertDetachedProbes(source);
});

test("additional migration probes are accepted without changing a fixed count", () => {
  const futureProbe = "future_access=$(compose exec -T firewall-db sh -c 'printf ready' < /dev/null)";
  assertDetachedProbes(`${source}\n${futureProbe}\n`);
  assert.throws(() => assertDetachedProbes(`${source}\n${futureProbe.replace("< /dev/null", "")}\n`), /detach SSH stdin/);
});

test("removing stdin protection from any current probe is rejected", () => {
  for (const probe of databaseProbes(source)) {
    const unsafe = source.replace(probe, probe.replace(/<\s*\/dev\/null\b/, ""));
    assert.throws(() => assertDetachedProbes(unsafe), /detach SSH stdin/);
  }
});

test("required migration checks cannot silently disappear", () => {
  for (const migration of requiredMigrations) {
    const withoutProbe = source.split(/\r?\n/).filter(line => !(line.includes("compose exec -T firewall-db") && line.includes(migration))).join("\n");
    assert.throws(() => databaseProbes(withoutProbe), /Missing migration preflight/);
  }
  assert.throws(() => databaseProbes(""), /retain its database preflight/);
});

test("production CI verifies the deployed revision and health after installation", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/production-ci.yml", import.meta.url), "utf8");
  const install = workflow.indexOf('"sh -s -- \'$DEPLOY_PATH\' \'$DEPLOY_SHA\'" < scripts/deploy/update-main-server.sh');
  const verification = workflow.indexOf("sh scripts/deploy/verify-main-server.sh '$DEPLOY_SHA'");
  assert.ok(install >= 0 && verification > install, "CI must verify the exact pushed revision after deployment");
  assert.ok(workflow.indexOf("Verified production commit:", verification) > verification);
  assert.match(workflow, /needs: \[frontend, backend, compose\]/, "Deployment must retain all build/preflight gates");
});
