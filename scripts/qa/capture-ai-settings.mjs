import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage(); await page.setBypassServiceWorker(true);
const errors = []; page.on("pageerror", error => errors.push(error.message));
const base = process.env.QA_BASE_URL || "http://host.docker.internal/firewall";
const configuration = { enabled: false, model: "openrouter/free", keyConfigured: false, source: "settings" };
let saves = 0, tests = 0;
await page.setRequestInterception(true);
page.on("request", request => {
  const path = new URL(request.url()).pathname;
  if (!path.startsWith("/firewall-api/")) return void (["fetch", "xhr"].includes(request.resourceType()) ? request.abort() : request.continue());
  const api = path.slice("/firewall-api".length);
  const respond = value => request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
  if (api === "/auth/session-status") return void respond({ authenticated: true, user: { id: "synthetic-admin", username: "qa", displayName: "QA", role: "admin", allowedSections: [] } });
  if (api === "/auth/csrf") return void respond({ csrfToken: "synthetic-only" });
  if (api === "/admin/users") return void respond({ users: [], catalog: { roles: [], sections: [] } });
  if (api === "/auth/sessions") return void respond({ sessions: [] });
  if (api === "/product-state/navigation") return void respond({ navigation: [] });
  if (api === "/ai/provider/config") {
    if (request.method() === "PUT") { const input = JSON.parse(request.postData()); assert.equal(input.externalDataConsent, true); assert.ok(input.apiKey.startsWith("sk-or-v1-synthetic")); configuration.enabled = true; configuration.keyConfigured = true; saves++; }
    return void respond(configuration);
  }
  if (api === "/ai/provider/test") { tests++; return void respond({ ok: true, liveVerified: true, model: configuration.model }); }
  return void respond({});
});
try {
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`${base}/settings?tab=ai`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".ai-provider-settings");
  assert.equal(await page.$eval('.ai-provider-settings input[type=password]', input => input.value), "");
  await page.screenshot({ path: "/out/ai-settings-desktop.png", fullPage: true });
  await page.type('.ai-provider-settings input[type=password]', "sk-or-v1-synthetic_fixture_not_a_live_key");
  await page.click('.ai-provider-settings__check input');
  assert.equal(await page.$eval('.ai-provider-settings button[type=submit]', button => button.disabled), true);
  const checks = await page.$$('.ai-provider-settings__check input'); await checks[1].click();
  await page.click('.ai-provider-settings button[type=submit]');
  await page.waitForFunction(() => document.querySelector('.ai-provider-settings input[type=password]')?.value === "");
  assert.equal(saves, 1);
  await page.click('.ai-provider-settings footer button[type=button]');
  await page.waitForSelector('.ai-provider-settings .is-verified'); assert.equal(tests, 1);
  await page.setViewport({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await page.screenshot({ path: "/out/ai-settings-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, screenshots: 2, runtimeErrors: 0, overflow: false, saves, tests, data: "synthetic fixtures only; no real key or provider request" }));
} finally { await browser.close(); }
