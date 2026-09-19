import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const compose = readFileSync(new URL("../../docker-compose.firewall.yml", import.meta.url), "utf8");

test("firewall-api preserves credential encryption configuration from backend env file", () => {
  const serviceStart = compose.indexOf("\n  firewall-api:");
  const serviceEnd = compose.indexOf("\n  firewall-db:", serviceStart);
  const apiService = compose.slice(serviceStart, serviceEnd);

  assert.notEqual(serviceStart, -1);
  assert.notEqual(serviceEnd, -1);
  assert.match(apiService, /env_file:\r?\n\s+- path: \.\/backend\/\.env/);
  assert.doesNotMatch(apiService, /^\s+CREDENTIAL_ENCRYPTION_KEY:/m);
});
