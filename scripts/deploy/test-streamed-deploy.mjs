import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const source = readFileSync(new URL("./update-main-server.sh", import.meta.url), "utf8");
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
  const probes = source.split(/\r?\n/).filter(line => line.includes("compose exec -T firewall-db"));
  assert.equal(probes.length, 4);
  for (const probe of probes) assert.ok(probe.includes("</dev/null"));
});
