import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage(), errors = [], appearance = process.env.QA_APPEARANCE ?? "dark";
await page.setBypassServiceWorker(true); await page.evaluateOnNewDocument(value => localStorage.setItem("eosnet.appearance", value), appearance);
let available = true, writes = 0, screenshots = 0;
const profile = { id: "qa-vpn-persistent", revision: "qa-revision", name: "دوربین‌های شعبهٔ آفتاب", protocol: "wireguard", endpoint: "vpn.example.com", endpointPort: 51820, routesJson: ["192.168.18.0/24"], lastErrorCode: null, desiredConnected: false, recoveryBlocked: false, retryAt: null, runtime: { state: "disconnected" } };
page.on("pageerror", error => errors.push(error.message)); await page.setRequestInterception(true);
page.on("request", request => {
  const url = new URL(request.url()); if (!url.pathname.startsWith("/firewall-api/")) return void request.continue();
  const path = url.pathname.slice("/firewall-api".length), method = request.method(), send = value => request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
  if (path === "/auth/session-status") return void send({ authenticated: true, user: { id: "qa", username: "qa", displayName: "مدیر آزمایش", role: "admin", allowedSections: ["assets", "actions"] } });
  if (path === "/auth/csrf") return void send({ csrfToken: "qa-only" });
  if (path === "/product-state/navigation") return void send({ navigation: [{ key: "tools", iconKey: "tools", titleFa: "آزمایشگاه شبکه", titleEn: "Network lab", route: "/tools/vpn", items: [{ key: "tools.vpn", route: "/tools/vpn", titleFa: "اتصال VPN", titleEn: "VPN connections", state: "partial" }] }] });
  if (path === "/vpn") return void send({ available, splitOnly: true, profiles: [profile] });
  if ([`/vpn/${profile.id}/connect`, `/vpn/${profile.id}/disconnect`].includes(path)) {
    const body = JSON.parse(request.postData()); assert.equal(method, "POST"); assert.equal(body.intent, "execute"); assert.equal(body.confirmed, true); writes++;
    profile.desiredConnected = path.endsWith("/connect"); profile.runtime.state = available ? "waiting" : "unavailable";
    return void send({ state: profile.runtime.state });
  }
  if (method !== "GET") errors.push(`Unexpected intercepted write ${method} ${path}`);
  return void send({});
});
const open = async () => { await page.goto("http://host.docker.internal/firewall/tools/vpn", { waitUntil: "domcontentloaded" }); await page.waitForSelector(".vpn-card"); };
const capture = async name => { await page.evaluate(() => document.fonts.ready); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); await page.screenshot({ path: `/out/${name}.png`, fullPage: true }); screenshots++; };
try {
  await page.setViewport({ width: 1440, height: 900 }); await open(); await page.click(".vpn-card .camera-button--primary"); await page.waitForSelector(".vpn-confirm"); assert.equal(writes, 0);
  await page.click(".vpn-confirm .camera-button--primary"); await page.waitForSelector("dialog[open]", { hidden: true }); await page.waitForFunction(() => document.querySelector(".vpn-card")?.textContent.includes("اتصال دائم")); assert.equal(writes, 1); await capture("persistent-desktop");
  await page.setViewport({ width: 390, height: 844 }); profile.retryAt = new Date(Date.now() + 30000).toISOString(); await open(); await capture("retry-mobile");
  available = false; profile.runtime.state = "unavailable"; await open(); assert.equal(await page.$eval(".vpn-card .camera-button--danger", e => e.disabled), false); await capture("offline-cancel-mobile");
  await page.click(".vpn-card .camera-button--danger"); await page.waitForSelector(".vpn-confirm"); assert.equal(writes, 1); await capture("manual-stop-confirm");
  await page.click(".vpn-confirm .camera-button--primary"); await page.waitForSelector("dialog[open]", { hidden: true }); assert.equal(writes, 2); assert.equal(profile.desiredConnected, false);
  await open(); assert.equal(await page.$eval(".vpn-card .camera-button--primary", e => e.disabled), true); assert.equal(writes, 2); await capture("manual-stop-persisted");
  available = true; profile.desiredConnected = true; profile.recoveryBlocked = true; profile.runtime.state = "error"; await page.setViewport({ width: 320, height: 844 }); await open(); assert.ok(await page.$eval(".vpn-card", e => e.textContent.includes("قفل حساب"))); await capture("auth-paused-320");
  assert.deepEqual(errors, []); console.log(JSON.stringify({ ok: true, appearance, screenshots, confirmedMockWrites: writes, actualExternalWrites: 0, runtimeErrors: 0, overflow: false }));
} finally { await browser.close(); }
