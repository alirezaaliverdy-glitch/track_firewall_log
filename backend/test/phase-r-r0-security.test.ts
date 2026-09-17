import assert from "node:assert/strict";
import test from "node:test";

import { loggerConfig } from "../src/lib/logger.js";
import { redactForPersistence, redactText } from "../src/security/redaction.js";
import { buildSshHostKeyVerifier, sshHostKeySha256Fingerprint } from "../src/security/ssh-host-key-trust.js";
import { parseCorsOriginsForProfile, productionConfigFailures, resolveProductionProfile } from "../src/config/production-hardening.js";

test("Phase R0 redaction removes secrets, terminal controls, and oversized output before persistence", () => {
  const raw = {
    password: "plain-password",
    nested: {
      apiKey: "abc123",
      stdout: "\u001b[31mpassword=secret-value\u001b[0m\n".repeat(2000)
    },
    tokenLine: "Authorization: Bearer raw-token"
  };

  const redacted = redactForPersistence(raw) as Record<string, unknown>;
  const serialized = JSON.stringify(redacted);

  assert.equal(serialized.includes("plain-password"), false);
  assert.equal(serialized.includes("abc123"), false);
  assert.equal(serialized.includes("secret-value"), false);
  assert.equal(serialized.includes("raw-token"), false);
  assert.equal(serialized.includes("\u001b["), false);
  assert.ok(serialized.length < 60_000);
});

test("Phase R0 logger uses the same central sensitive-field redaction policy", () => {
  const logger = loggerConfig as { redact?: { paths?: string[]; censor?: string; remove?: boolean } };
  const paths = logger.redact?.paths ?? [];

  assert.ok(paths.includes("req.body.password"));
  assert.ok(paths.includes("req.query.token"));
  assert.equal(logger.redact?.censor, "[REDACTED]");
});

test("Phase R0 production profile treats APP_PROFILE=production as production and keeps CORS explicit", () => {
  assert.equal(resolveProductionProfile({ nodeEnv: "development", appProfile: "production" }), true);
  assert.deepEqual(parseCorsOriginsForProfile("https://console.example", true), ["https://console.example"]);

  const failures = productionConfigFailures({
    nodeEnv: "development",
    appProfile: "production",
    authSessionSecret: "development-only-change-this-secret",
    credentialEncryptionKey: "short",
    databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5432/firewall",
    adminPassword: "admin",
    actionExecutionMode: "quick_controlled",
    actionAllowLabUnrestrictedManagement: true,
    corsOrigins: []
  });

  assert.ok(failures.some((failure) => failure.includes("AUTH_SESSION_SECRET")));
  assert.ok(failures.some((failure) => failure.includes("CREDENTIAL_ENCRYPTION_KEY")));
  assert.ok(failures.some((failure) => failure.includes("default postgres:postgres")));
  assert.ok(failures.some((failure) => failure.includes("ADMIN_PASSWORD")));
  assert.ok(failures.some((failure) => failure.includes("quick controlled")));
  assert.ok(failures.some((failure) => failure.includes("CORS")));
});

test("Phase R0 SSH host-key trust supports explicit pinning, mismatch hard-fail, and unknown-host denial", () => {
  const key = Buffer.from("fixture-host-key");
  const fingerprint = sshHostKeySha256Fingerprint(key);
  assert.match(fingerprint, /^SHA256:/);

  const trusted = buildSshHostKeyVerifier({ pinnedSha256: fingerprint });
  assert.equal(trusted.verify(key), true);

  const mismatch = buildSshHostKeyVerifier({ pinnedSha256: "SHA256:not-the-same" });
  assert.throws(() => mismatch.verify(key), /SSH_HOST_KEY_MISMATCH/);

  const unknown = buildSshHostKeyVerifier({});
  assert.throws(() => unknown.verify(key), /SSH_HOST_KEY_UNKNOWN/);
});

test("Phase R0 text redaction catches inline secret forms", () => {
  assert.equal(redactText("set psksecret super-secret"), "set psksecret [REDACTED]");
  assert.equal(redactText("PRIVATE KEY-----BEGIN PRIVATE KEY-----abc"), "[REDACTED]");
});
