import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildAssessmentDraft, buildHardeningRecommendationDrafts } from "../src/services/security-assessment.service.js";
import { retryAfterMilliseconds } from "../src/services/providers/openai-compatible.provider.js";
import { buildApp } from "../src/app.js";

const context = {
  generatedAt: new Date().toISOString(), recentWindowMinutes: 1440,
  safety: { aiCanExecute: false, aiCanSsh: false, aiCanChangeFirewall: false, outputMode: "structured" },
  incidents: { recent: [{ id: "i1", title: "حمله", severity: "high", status: "open", eventCount: 5, device: { id: "l1" } }], countBySeverity: [{ severity: "high", count: 1 }], countByStatus: [] },
  events: { recentCount: 12, topSourceIps: [{ srcIp: "203.0.113.4", count: 8 }], sensitivePorts: [{ dstPort: 22, count: 8 }] },
  detections: { recentRules: [{ id: "r1" }] },
  devices: [{ id: "l1", name: "سرور لبه", vendor: "linux", type: "linux_edge", managementPort: 22, protocol: "ssh", status: "online", capabilities: {} }],
  eventBatches: [], actionPlans: { recent: [], pendingApprovalCount: 0 }
};

test("full analysis returns all structured Persian sections with evidence and severity", () => {
  const draft = buildAssessmentDraft(context as never, 0);
  const titles = Object.values(draft.sections).map((section) => section.title);
  for (const title of ["خلاصه مدیریتی", "دارایی‌ها و Vendorها", "وضعیت سطح حمله", "وضعیت فایروال و Policyها", "وضعیت دسترسی مدیریتی", "وضعیت لاگ و مانیتورینگ", "وضعیت Hardening", "یافته‌ها", "اقدامات پیشنهادی بعدی", "امتیاز ریسک"]) assert.ok(titles.includes(title));
  assert.equal(draft.language, "fa");
  assert.match(draft.dataNotice, /داده خوانده‌شده از دستگاه موجود نیست/);
  assert.ok(draft.findings.every((finding) => finding.severity && finding.evidence && finding.recommendedNextStep));
});

test("Persian hardening keeps catalog actions controlled and incomplete items manual", () => {
  const assessment = { findingsJson: buildAssessmentDraft(context as never, 0) };
  const items = buildHardeningRecommendationDrafts(assessment, context.devices.map((device) => ({ ...device, type: device.type, vendor: device.vendor })));
  assert.ok(items.some((item) => item.executable && item.catalogActionId === "linux.read_listening_ports"));
  assert.ok(items.some((item) => !item.executable && item.catalogActionId === null));
  assert.ok(items.every((item) => /[\u0600-\u06ff]/.test(`${item.title}${item.reason}${item.recommendation}`)));
});

test("OpenRouter retry-after is bounded and 429 has a friendly Persian message", () => {
  assert.equal(retryAfterMilliseconds("2"), 2000);
  assert.equal(retryAfterMilliseconds("99"), 5000);
  const provider = readFileSync(new URL("../src/services/ai-provider.service.ts", import.meta.url), "utf8");
  assert.match(provider, /سرویس هوش مصنوعی به محدودیت تعداد درخواست خورده است/);
});

test("assessment UI uses cards and does not render findings as raw JSON", () => {
  const ui = readFileSync(new URL("../../src/components/ai/AiSecurityAssistantPanel.tsx", import.meta.url), "utf8");
  assert.match(ui, /امتیاز ریسک/);
  assert.match(ui, /پوشش دستگاه/);
  assert.match(ui, /ساخت اکشن/);
  assert.match(ui, /نیاز به بررسی دستی/);
  assert.doesNotMatch(ui, /JSON\.stringify\(assessment\.findingsJson/);
  assert.doesNotMatch(ui, /JSON\.stringify\(recommendation\.evidenceJson/);
  assert.match(ui, /setMessages\(\[\]\)/);
  assert.match(ui, /setAssessment\(null\)/);
  assert.match(ui, /clearAiSessionMessages/);
});

test("full-analysis and standalone hardening keep a stable Persian 200 contract", async () => {
  const app = await buildApp({ authRequired: false });
  try {
    const full = await app.inject({ method: "POST", url: "/api/assessments/full-analysis", payload: { collectConnectorData: false } });
    assert.equal(full.statusCode, 200);
    const fullBody = full.json();
    assert.equal(fullBody.ok, true);
    assert.equal(fullBody.source, "deterministic");
    assert.equal(typeof fullBody.assessment.riskScore, "number");
    assert.ok(Array.isArray(fullBody.assessment.sections));
    assert.ok(Array.isArray(fullBody.assessment.findings));
    assert.match(fullBody.assessment.summaryFa, /[\u0600-\u06ff]/);

    const hardening = await app.inject({ method: "POST", url: "/api/assessments/hardening-suggestions" });
    assert.equal(hardening.statusCode, 200);
    const hardeningBody = hardening.json();
    assert.equal(hardeningBody.source, "deterministic");
    assert.ok(Array.isArray(hardeningBody.recommendations));
    assert.ok(hardeningBody.recommendations.every((item: { titleFa: string }) => /[\u0600-\u06ff]/.test(item.titleFa)));
  } finally {
    await app.close();
  }
});
