import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { prisma, shutdownDatabase } from "../src/db/prisma.js";
import { getFindingCampaign } from "../src/services/finding-campaign.service.js";
import { buildSecurityOrchestratorContext } from "../src/ai/context/security-orchestrator-context.js";
import { aiRoutes } from "../src/routes/ai.js";

test("campaign evidence and assistant context remain target/workspace scoped; provider settings are admin-only", async () => {
  const tag = `review-${randomUUID()}`, directory = await mkdtemp(join(tmpdir(), "eosnet-review-settings-"));
  const previousPath = process.env.AI_SETTINGS_FILE, previousFetch = globalThis.fetch;
  process.env.AI_SETTINGS_FILE = join(directory, "settings.json");
  const users: string[] = [], devices: string[] = [];
  const app = Fastify({ logger: false });
  let role = "operator", actorId = "", calls = 0;
  app.addHook("onRequest", async request => { request.authUser = { id: actorId, username: tag, role, scopeOwnerId: actorId, displayName: "QA", allowedSections: [] } as never; });
  await app.register(aiRoutes);
  try {
    for (let index = 0; index < 2; index++) {
      const user = await prisma.appUser.create({ data: { username: `${tag}-${index}`, passwordHash: "fixture-only-not-a-login", displayName: "QA", role: "admin" } }); users.push(user.id);
      const company = await prisma.company.create({ data: { ownerId: user.id, code: tag, name: tag } });
      const device = await prisma.device.create({ data: { name: `${tag}-${index}`, companyId: company.id, vendor: "linux", host: `192.0.2.${180 + index}`, type: "linux_edge", protocol: "ssh", managementPort: 22, environment: "lab", status: "online" } }); devices.push(device.id);
    }
    actorId = users[0];
    let anchor = "";
    for (let index = 0; index < 3; index++) {
      const deviceId = devices[index === 2 ? 1 : 0], source = `203.0.113.${180 + index}`, at = new Date("2026-10-15T11:20:00Z");
      const event = await prisma.securityEvent.create({ data: { deviceId, timestamp: at, sourceType: "linux_ssh", vendor: "linux", eventType: "authentication_failure", action: "auth_failed", srcIp: source, username: "root", rawMessage: `lab-host sshd[1]: Failed password for root from ${source} port 40123 ssh2`, normalizedJson: {}, dedupeKey: `${tag}-${index}` } });
      const finding = await prisma.finding.create({ data: { deviceId, vendor: "linux", title: "Fixture repeated login failures", summary: "Fixture only", source: "fixture", category: "authentication", severity: "high", status: "active", confidence: .9, srcIp: source, firstSeen: at, lastSeen: at, count: 1, evidenceJson: [], rawRefsJson: [event.id], recommendedActions: [], mitreTags: [], fingerprint: `${tag}-${index}` } });
      if (!index) anchor = finding.id;
    }
    const campaign = await getFindingCampaign(anchor, users[0]);
    assert.equal(campaign?.sources.length, 2);
    assert.deepEqual(campaign?.sources.map(source => source.ip), ["203.0.113.180", "203.0.113.181"]);
    assert.equal(campaign?.observedEvents, 2);
    assert.equal(await getFindingCampaign(anchor, users[1]), null);
    const context = await buildSecurityOrchestratorContext({ ownerId: users[0] });
    const serialized = JSON.stringify(context);
    assert.equal(serialized.includes(devices[1]), false);
    assert.equal(serialized.includes("203.0.113.182"), false);
    assert.equal((await app.inject({ method: "GET", url: "/api/ai/provider/config" })).statusCode, 403);
    assert.equal((await app.inject({ method: "PUT", url: "/api/ai/provider/config", payload: {} })).statusCode, 403);
    role = "admin";
    const key = "sk-or-v1-" + "synthetic_fixture_never_a_real_provider_key";
    const saved = await app.inject({ method: "PUT", url: "/api/ai/provider/config", payload: { apiKey: key, enabled: true, model: "openrouter/free", externalDataConsent: true } });
    assert.equal(saved.statusCode, 200); assert.equal(saved.body.includes(key), false);
    const before = await prisma.actionPlan.count();
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), "https://openrouter.ai/api/v1/chat/completions");
      assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${key}`);
      const body = JSON.parse(String(init?.body));
      assert.equal(JSON.stringify(body).includes(devices[0]), false);
      assert.equal(JSON.stringify(body).includes("203.0.113.180"), false);
      calls++;
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ assistantMessage: "Synthetic connectivity response", shouldCreateIntent: false, intent: null, confidence: 1 }) } }] }), { status: 200 });
    };
    const tested = await app.inject({ method: "POST", url: "/api/ai/provider/test", payload: {} });
    assert.equal(tested.statusCode, 200); assert.equal(tested.json().liveVerified, true); assert.equal(calls, 1);
    assert.equal(await prisma.actionPlan.count(), before);
    assert.equal(await prisma.auditLog.count({ where: { actor: tag, action: "ai.provider.configuration_updated" } }), 1);
  } finally {
    globalThis.fetch = previousFetch;
    await app.close();
    await prisma.auditLog.deleteMany({ where: { actor: tag } });
    await prisma.securityEvent.deleteMany({ where: { deviceId: { in: devices } } });
    await prisma.finding.deleteMany({ where: { deviceId: { in: devices } } });
    await prisma.device.deleteMany({ where: { id: { in: devices } } });
    await prisma.appUser.deleteMany({ where: { id: { in: users } } });
    if (previousPath === undefined) delete process.env.AI_SETTINGS_FILE; else process.env.AI_SETTINGS_FILE = previousPath;
    await rm(directory, { recursive: true, force: true }); await shutdownDatabase();
  }
});
