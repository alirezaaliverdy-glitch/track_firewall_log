// Opt-in live provider check. Run inside the API image with an EMPTY disposable
// TEST_DATABASE_URL. Only synthetic messages are sent; never prints AI content.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

assert.equal(process.env.QA_LIVE_OPENROUTER, "synthetic-only");
const testDatabase = new URL(process.env.TEST_DATABASE_URL || "");
assert.match(testDatabase.hostname, /^eosnet-assistant-qa-/);
assert.equal(testDatabase.pathname, "/eosnet_assistant_qa");
assert.equal(new URL(process.env.OPENAI_BASE_URL).hostname, "openrouter.ai");
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";

const { prisma, shutdownDatabase } = await import("/app/dist/db/prisma.js");
const { default: Fastify } = await import("fastify");
const { aiRoutes } = await import("/app/dist/routes/ai.js");
const app = Fastify({ logger: false });
const probeOwner = `synthetic-assistant-${randomUUID()}`;
app.addHook("onRequest", async request => { request.authUser = { id: probeOwner }; });
let phase = "empty_database_guard";
let result = { ok: false };
try {
  for (const table of [prisma.device, prisma.securityEvent, prisma.finding, prisma.incident, prisma.actionPlan, prisma.aiChatSession]) {
    assert.equal(await table.count(), 0);
  }
  await app.register(aiRoutes);
  const configured = (await app.inject({ method: "GET", url: "/api/ai/provider/status" })).json();
  assert.equal(configured.provider, "openai_compatible");
  assert.equal(configured.keyConfigured, true);
  phase = "live_analysis";
  const first = await app.inject({
    method: "POST", url: "/api/ai/chat",
    payload: {
      intentModeOverride: "Chat",
      message: "این فقط یک مثال ساختگی است، هیچ عملیاتی انجام نده. لاگ lab-host sudo: operator1 : TTY=pts/1 ; PWD=/home/operator1 ; USER=root ; COMMAND=/usr/bin/grep 'Accepted password' /var/log/auth.log را تحلیل کن. حساب اجراکننده کیست و آیا این خط به‌تنهایی ورود SSH با root را ثابت می‌کند؟ کوتاه فارسی پاسخ بده.",
    },
  });
  const firstBody = first.json();
  if (first.statusCode !== 200) {
    result = { ok: false, phase, status: first.statusCode, provider: configured.provider, keyConfigured: configured.keyConfigured, model: configured.model, liveVerified: false };
  } else {
    assert.equal(firstBody.providerStatus.liveVerified, true);
    assert.notEqual(firstBody.providerStatus.provider, "mock");
    assert.equal(firstBody.actionPlan, null);
    assert.equal(firstBody.actionIntent, null);
    assert.equal(firstBody.shouldCreateActionPlan, false);
    assert.match(firstBody.assistantMessage, /operator1/i);
    assert.match(firstBody.assistantMessage, /sudo|USER\s*=\s*root|دسترسی/i);
    phase = "conversation_history";
    const second = await app.inject({
      method: "POST", url: "/api/ai/chat",
      payload: { sessionId: firstBody.sessionId, intentModeOverride: "Chat", message: "نام همان حساب اجراکننده در مثال قبلی چه بود؟ فقط نام حساب را بنویس و هیچ اقدامی انجام نده." },
    });
    const secondBody = second.json();
    assert.equal(second.statusCode, 200);
    assert.equal(secondBody.providerStatus.liveVerified, true);
    assert.match(secondBody.assistantMessage, /operator1/i);
    assert.equal(secondBody.actionPlan, null);
    assert.equal(secondBody.actionIntent, null);
    assert.equal(await prisma.actionPlan.count(), 0);
    assert.equal(await prisma.aiActionIntent.count(), 0);
    assert.equal(await prisma.aiChatMessage.count(), 4);
    result = { ok: true, status: 200, liveVerified: true, provider: configured.provider, analysisReceived: true, actorRecognized: true, conversationHistory: true, actionPlans: 0, actionIntents: 0, data: "synthetic only" };
  }
} catch (error) {
  result = { ok: false, phase, errorName: error instanceof Error ? error.name : "UnknownError" };
} finally {
  // Includes our failed upstream requests, but never another run's sessions,
  // even if the empty-database guard rejected this test.
  await prisma.aiChatSession.deleteMany({ where: { userId: probeOwner } });
  await app.close();
  await shutdownDatabase();
}
console.log(JSON.stringify(result));
process.exit(result.ok ? 0 : 1);
