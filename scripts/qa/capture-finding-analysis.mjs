// Synthetic evidence and API fixtures only; no real login, VPN or device action.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const base = process.env.QA_BASE_URL || "http://host.docker.internal/firewall";
const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage(); await page.setBypassServiceWorker(true);
if (process.env.QA_APPEARANCE === "light") await page.evaluateOnNewDocument(() => localStorage.setItem("eosnet.appearance", "light"));
await page.evaluateOnNewDocument(() => localStorage.setItem("firewall-log-analyzer.locale", "fa"));
const errors = []; page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text().slice(0, 1200)); });
const now = new Date().toISOString(); let plans = 0, reanalyses = 0, vpnSaves = 0, executions = 0, screenshots = 0;
const device = { id: "fixture-device", name: "سرور آزمایش", host: "192.0.2.116", vendor: "linux", type: "linux_edge", protocol: "ssh", credentialConfigured: true };
const finding = { id: "fixture-finding", deviceId: device.id, device, vendor: "linux", title: "Linux: remote root login", summary: "Legacy rule match", status: "active", severity: "critical", source: "seeded_detection_rule", category: "privileged-access", confidence: .82, count: 1, firstSeen: now, lastSeen: now, actor: "root", rawRefsJson: ["fixture-event"], recommendedActions: [], mitreTags: ["T1078"] };
const decision = { mode: "investigate", evidenceScore: 0, evidenceLabelFa: "تفسیر اولیه نادرست است", evidenceLabelEn: "Initial interpretation contradicted", explanationFa: "دستور توسط operator1 با دسترسی root اجرا شده است.", explanationEn: "operator1 invoked a command as root.", nextStepFa: "وضعیت فعلی تجهیز را بررسی کنید.", nextStepEn: "Check current device state.", observedAt: now, deviceCount: 1, authSuccessCount: 0, referenceCount: 1, resolvedReferenceCount: 1, supportingReferenceCount: 0, applicationOwnedReferenceCount: 0, signals: [], suggestedAction: { kind: "diagnostic", labelFa: "بررسی وضعیت فعلی تجهیز", labelEn: "Check current device state" }, deviceContext: { observedAt: now, fresh: true, snapshotType: "linux_security", permitRootLogin: "no" }, analysis: { version: "fixture", verdict: "contradicted", rootClaim: true, complete: true, actors: ["operator1"], titleFa: "شواهد، ورود root را تأیید نمی‌کنند", titleEn: "The evidence contradicts a root login", summaryFa: "حساب اجراکننده operator1 بوده است. USER=root سطح دسترسی دستور را مشخص می‌کند. عبارت‌های داخل COMMAND، رویداد ورود نیستند.", summaryEn: "operator1 invoked sudo; USER=root describes privileges.", limitationsFa: ["مجاز بودن فعالیت را با دسترسی‌های تأییدشده مقایسه کنید."], limitationsEn: ["Check authorization."], events: [{ id: "fixture-event", timestamp: now, kind: "sudo_command", actor: "operator1", effectiveUser: "root", hostname: "lab-host", sourceIp: null, applicationOwned: false, supportsFinding: false, contradictsFinding: true, explanationFa: "اجرای دستور توسط operator1 با دسترسی root؛ این رویداد ورود SSH نیست.", explanationEn: "sudo invocation by operator1 as root." }] } };
const plan = { id: "fixture-plan", source: "detection", deviceId: device.id, device, actionType: "linux_daily_check", status: "dry_run_ready", lifecycleState: "ready_for_confirmation", riskLevel: "low", createdAt: now, updatedAt: now, parametersJson: { title: "بررسی وضعیت تجهیز", findingId: finding.id, responseKind: "diagnostic" }, support: { state: "verified", executable: true, execution: "connector" }, controls: { canReview: true, canExecute: true, canConfirm: true, canPreview: true }, evidence: { connectorInvoked: false }, commandPreview: { plannedCommands: ["systemctl is-active ssh", "sudo -n ufw status"], summary: "Read-only diagnostic" } };
await page.setRequestInterception(true);
page.on("request", request => {
  const url = new URL(request.url());
  if (!url.pathname.startsWith("/firewall-api/")) return void (["fetch", "xhr"].includes(request.resourceType()) ? request.abort() : request.continue());
  const path = url.pathname.slice("/firewall-api".length);
  const respond = value => request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
  if (path === "/auth/session-status") return void respond({ authenticated: true, user: { id: "fixture-user", username: "fixture-user", displayName: "QA", role: "admin", allowedSections: ["assets", "security", "actions"] } });
  if (path === "/auth/csrf") return void respond({ csrfToken: "fixture-only" });
  if (path === "/product-state/navigation") return void respond({ navigation: [{ key: "security", iconKey: "security", titleFa: "امنیت", titleEn: "Security", route: "/security", items: [] }, { key: "actions", iconKey: "actions", titleFa: "اقدامات", titleEn: "Actions", route: "/actions", items: [] }] });
  if (path === `/security/findings/${finding.id}`) return void respond(finding);
  if (path.endsWith("/decision")) return void respond(decision);
  if (path.endsWith("/campaign")) return void respond({ findingId: finding.id, device, windowMinutes: 15, start: now, end: new Date(Date.now() + 900000).toISOString(), sources: ["203.0.113.8", "203.0.113.9", "2001:db8::8"].map((ip, index) => ({ ip, events: 12 - index, accounts: ["operator1"], firstSeen: now, lastSeen: now, findingIds: [finding.id] })), sourceCount: 3, observedEvents: 33, partial: false, findings: [{ id: finding.id, status: "active", count: 33, srcIp: "203.0.113.8" }] });
  if (path.endsWith("/analysis")) { reanalyses++; finding.status = "false_positive"; decision.mode = "closed"; return void respond(decision); }
  if (path.endsWith("/action-plan")) { plans++; return void respond({ findingId: finding.id, actionPlan: plan }); }
  if (path.includes("execute") || path.endsWith("/connect")) { executions++; return void request.abort(); }
  if (path === "/action-center/fixture-plan") return void respond(plan);
  if (path === "/action-center") return void respond({ items: [plan], total: 1, offset: 0, limit: 10, summary: { ready_for_confirmation: 1 } });
  if (path === "/devices") return void respond({ devices: [device] });
  if (path === "/credentials") return void respond({ credentials: [] });
  if (path === "/vpn" && request.method() === "POST") { const input = JSON.parse(request.postData()); assert.deepEqual(input.routes, ["192.168.18.0/24"]); assert.equal(input.mtu, 1380); assert.equal(input.privateKey.length, 44); vpnSaves++; return void respond({ id: "fixture-vpn" }); }
  if (path === "/vpn") return void respond({ profiles: [], available: true, splitOnly: true, l2tpReady: true });
  if (path.includes("command")) return void respond({ items: [] });
  return void respond({});
});
async function capture(name) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, name);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll("dialog[open]")].some(dialog => dialog.scrollWidth > dialog.clientWidth + 1)), false, `${name}: dialog overflow`);
  await page.screenshot({ path: `/out/${name}.png`, fullPage: true }); screenshots++;
}
const fixtureDir = mkdtempSync(join(tmpdir(), "eosnet-wg-fixture-"));
const fixtureFile = join(fixtureDir, "office.conf");
const conf = `\uFEFF[Interface]\r\nPrivateKey = ${randomBytes(32).toString("base64")}\r\nAddress = 10.78.0.2/32\r\nDNS = 1.1.1.1\r\nMTU = 1380\r\n[Peer]\r\nPublicKey = ${randomBytes(32).toString("base64")}\r\nEndpoint = 198.51.100.8:51820\r\nAllowedIPs = 0.0.0.0/0, ::/0\r\n`;
writeFileSync(fixtureFile, conf);
try {
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`${base}/security/findings/${finding.id}`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".finding-review__table article");
  assert.equal(await page.$$eval(".finding-review__table article", rows => rows.length), 3);
  assert.equal(await page.$eval(".finding-review__details", element => element.open), false);
  await capture("finding-summary-desktop");
  await page.setViewport({ width: 390, height: 844 }); await capture("finding-summary-mobile");
  await page.click(".finding-review__details>summary");
  assert.match(await page.$eval(".finding-analysis .finding-analysis__accounts", element => element.textContent), /operator1/);
  await page.click(".finding-analysis__evidence summary"); await capture("finding-analysis-desktop");
  await page.setViewport({ width: 390, height: 844 }); await capture("finding-analysis-mobile");
  // Create the diagnostic while the finding is open, then verify closed-state UX.
  await page.click(".finding-review__actions>button");
  await page.waitForFunction(() => location.pathname.endsWith("/actions/fixture-plan"));
  await page.waitForSelector(".operator-handoff"); assert.equal(plans, 1); assert.equal(executions, 0);
  await capture("finding-action-review-mobile");
  await page.goto(`${base}/security/findings/${finding.id}`, { waitUntil: "networkidle0" });
  await page.click(".finding-review__heading>button"); await page.waitForFunction(() => document.querySelector(".finding-decision--closed"));
  assert.equal(reanalyses, 1); assert.equal(plans, 1);
  assert.equal(await page.$eval(".finding-next-step .finding-review__actions>button", element => element.disabled), true);
  await page.goto(`${base}/tools/vpn`, { waitUntil: "networkidle0" }); await page.waitForSelector(".vpn-heading .camera-button--primary");
  await page.click(".vpn-heading .camera-button--primary"); await page.waitForSelector(".vpn-import input[type=file]");
  const picker = page.waitForFileChooser(); await page.click(".vpn-import input[type=file]");
  await (await picker).accept([fixtureFile]);
  await page.waitForFunction(() => document.querySelector('.vpn-form input[min="1280"]')?.value === "1380");
  assert.equal(await page.$eval(".vpn-routes-field textarea", element => element.value), "");
  assert.equal(vpnSaves, 0); assert.equal(executions, 0);
  await capture("wireguard-import-mobile");
  await page.type(".vpn-routes-field textarea", "192.168.18.0/24");
  await page.click('.vpn-form button[type="submit"]'); await page.waitForFunction(() => !document.querySelector("dialog[open]")); assert.equal(vpnSaves, 1);
  await page.setViewport({ width: 1440, height: 1000 }); await page.click(".vpn-heading .camera-button--primary");
  await page.click(".vpn-import-options details summary");
  await page.$eval('.vpn-import-options textarea', (element, text) => { const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set; setter.call(element, text); element.dispatchEvent(new Event("input", { bubbles: true })); }, conf);
  await page.click(".vpn-import-options details button");
  await page.waitForFunction(() => document.querySelector('.vpn-form input[min="1280"]')?.value === "1380");
  assert.equal(vpnSaves, 1); assert.equal(executions, 0); await capture("wireguard-import-desktop");
  assert.deepEqual(errors, []);
  process.stdout.write(JSON.stringify({ ok: true, screenshots, runtimeErrors: 0, overflow: false, reanalyses, plans, vpnSaves, executions, nativeFileChooser: true, pasteFallback: true, defaultRouteImported: false, data: "synthetic fixtures only" }));
} catch (error) {
  await page.screenshot({ path: "/out/finding-qa-failure.png", fullPage: true });
  process.stdout.write(JSON.stringify({ pageErrors: errors, fixturePage: await page.$eval("body", element => element.textContent.slice(0, 900)) }));
  throw error;
} finally { await browser.close(); unlinkSync(fixtureFile); rmdirSync(fixtureDir); }
