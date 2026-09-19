import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relative: string) => readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");

test("Docker assistant uses a stable host gateway instead of a volatile Hyper-V address", () => {
  const compose = read("docker-compose.firewall.yml");
  const starter = read("scripts/start-openrouter-host-proxy.ps1");

  assert.match(compose, /extra_hosts:\s*\n\s*- "host\.docker\.internal:host-gateway"/);
  assert.match(starter, /\[string\]\$BindAddress = "0\.0\.0\.0"/);
  assert.match(starter, /\[string\]\$AdvertiseHost = "host\.docker\.internal"/);
  assert.match(starter, /OPENAI_PROXY_URL=\$proxyUrl/);
  assert.match(starter, /candidate\.Length -ge 32/);
  assert.doesNotMatch(starter, /vEthernet \(Default Switch\)|Register-ScheduledTask|New-NetFirewallRule/);
});

test("OpenRouter proxy remains target-restricted and diagnostics never print credentials", () => {
  const proxy = read("scripts/openrouter-host-proxy.mjs");
  const diagnostic = read("scripts/diagnose-ai-provider-runtime.mjs");

  assert.match(proxy, /allowedTarget = "openrouter\.ai:443"/);
  assert.match(proxy, /request\.url !== allowedTarget/);
  assert.match(proxy, /hasValidAuthorization/);
  assert.match(diagnostic, /--application-provider/);
  assert.match(diagnostic, /hasAssistantMessage/);
  const consoleLines = diagnostic.split("\n").filter((line) => line.includes("console.log")).join("\n");
  assert.doesNotMatch(consoleLines, /OPENAI_API_KEY|Authorization|Bearer|\$\{key\}/);
});

test("OpenAI-compatible defaults are internally consistent with the OpenRouter model", () => {
  const env = read("backend/src/config/env.ts");
  const example = read("backend/.env.example");
  const providerService = read("backend/src/services/ai-provider.service.ts");

  assert.match(env, /DEFAULT_OPENAI_MODEL = "openrouter\/free"/);
  assert.match(env, /DEFAULT_OPENAI_COMPATIBLE_BASE_URL = "https:\/\/openrouter\.ai\/api\/v1"/);
  assert.match(example, /OPENAI_BASE_URL=https:\/\/openrouter\.ai\/api\/v1/);
  assert.match(providerService, /if \(lastStatusCode === 401\) break/);
  assert.doesNotMatch(providerService, /lastStatusCode === 401 \|\| lastStatusCode === 403/);
  assert.match(providerService, /deterministicProviderFallback/);
  assert.match(providerService, /model: "deterministic-offline-fallback"/);
  assert.match(providerService, /fallbackUsed: true/);
});
