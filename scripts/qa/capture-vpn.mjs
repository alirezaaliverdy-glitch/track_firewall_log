import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage(), errors = []; let connections = 0;
const profiles = [{ id: "qa-office", name: "شبکهٔ دوربین‌های دفتر", protocol: "wireguard", endpoint: "vpn.example.com", endpointPort: 51820, routesJson: ["192.168.18.0/24"], lastErrorCode: null, runtime: { state: "disconnected" } }, { id: "qa-branch", name: "تجهیزات شعبه", protocol: "l2tp", endpoint: "branch.example.com", endpointPort: 1701, routesJson: ["192.168.20.0/24"], lastErrorCode: null, runtime: { state: "connected", rxBytes: 103400, txBytes: 58000 } }];
page.on("pageerror", error => errors.push(error.message)); await page.setRequestInterception(true);
profiles.forEach(profile => { profile.revision = "qa-revision"; });
page.on("request", request => {
  const url = new URL(request.url()); if (!url.pathname.startsWith("/firewall-api/")) { void request.continue(); return; }
  const path = url.pathname.slice("/firewall-api".length);
  const respond = value => request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
  if (path === "/auth/session-status") return void respond({ authenticated: true, user: { id: "qa", username: "qa", displayName: "مدیر آزمایش", role: "admin", allowedSections: ["assets","actions"] } });
  if (path === "/auth/csrf") return void respond({ csrfToken: "qa-only" });
  if (path === "/product-state/navigation") return void respond({ navigation: [{ key: "tools", iconKey: "tools", titleFa: "آزمایشگاه شبکه", titleEn: "Network lab", route: "/tools/vpn", items: [{ key: "tools.vpn", route: "/tools/vpn", titleFa: "اتصال VPN", titleEn: "VPN connections", state: "partial" }] }] });
  if (path === "/vpn") return void respond({ available: true, splitOnly: true, profiles });
  if (path === "/devices") return void respond({ devices: [] });
  if (path === "/cameras") return void respond({ cameras: [] });
  if (path === "/companies") return void respond({ companies: [{ id: "qa-company", name: "دفتر", code: "qa", deletedAt: null, _count: { devices: 0, assets: 0 } }] });
  if (path === "/credentials") return void respond({ credentials: [] });
  if (path === "/vendors/connection-methods") return void respond({ profiles: [] });
  if (path === "/device-onboarding/sessions") return void respond({ id: "qa-onboarding", status: "draft", draft: { companyId: "qa-company", vendor: "linux", platform: "linux", connectionMethod: "ssh", name: "", host: "", managementPort: 22, credentialId: "", enableCredentialId: "", site: "", location: "", environment: "lab", vpnConnectionId: "" }, test: null, detection: null, discovery: null, preview: null, result: null });
  if (path === "/diagnostics/network-probes") return void respond({ probes: [] });
  if (path === "/diagnostics/network-inventory") return void respond({ scans: [] });
  if (path.endsWith("/connect")) { connections++; profiles[0].runtime.state = "waiting"; return void respond({ state: "waiting" }); }
  return void respond({});
});
async function capture(name) { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); assert.equal(await page.evaluate(() => [...document.querySelectorAll("dialog[open]")].some(dialog => dialog.scrollWidth > dialog.clientWidth + 1)), false); await page.screenshot({ path: `/out/${name}.png`, fullPage: true }); }
try {
  await page.setViewport({ width: 1440, height: 900 }); await page.goto("http://host.docker.internal/firewall/tools/vpn", { waitUntil: "domcontentloaded", timeout: 30000 }); await page.waitForSelector(".vpn-card"); await capture("vpn-desktop");
  await page.click(".vpn-card .camera-button--primary"); await page.waitForSelector("dialog[open]"); assert.equal(connections, 0); await capture("vpn-confirm"); await page.click(".vpn-confirm .camera-button--primary"); await page.waitForFunction(() => !document.querySelector("dialog[open]")); assert.equal(connections, 1);
  await page.click(".vpn-heading .camera-button--primary"); await page.waitForSelector(".vpn-form"); await capture("vpn-wireguard-form");
  if (process.env.VPN_SAMPLE_CONF_PATH) {
    const file = await page.$(".vpn-import input[type=file]"); assert.ok(file);
    await file.uploadFile(process.env.VPN_SAMPLE_CONF_PATH);
    await page.waitForFunction(() => document.querySelector(".vpn-routes-field textarea")?.value === "" && [...document.querySelectorAll('.vpn-form input[type="password"]')].some(input => input.value.length > 0));
    assert.equal(await page.$eval(".vpn-routes-field textarea", element => element.value), "");
    assert.equal(await page.$eval('.vpn-form input[min="1280"]', element => Number(element.value)), 1380);
  }
  await page.keyboard.press("Escape");
  await page.setViewport({ width: 390, height: 844 }); await capture("vpn-mobile"); await page.click(".vpn-heading .camera-button--primary"); await page.waitForSelector(".vpn-form"); await page.click(".vpn-protocols button:nth-child(2)"); await capture("vpn-l2tp-mobile"); await page.keyboard.press("Escape");
  await page.goto("http://host.docker.internal/firewall/tools/network-lab", { waitUntil: "domcontentloaded" }); await page.waitForSelector(".network-lab__primary-tabs"); await capture("vpn-network-lab-before");
  await page.waitForSelector(".network-lab__primary-tabs button:nth-child(3)"); await page.click(".network-lab__primary-tabs button:nth-child(3)"); await page.waitForSelector(".vpn-card"); await capture("vpn-network-lab-mobile");
  await page.goto("http://host.docker.internal/firewall/assets/cameras", { waitUntil: "domcontentloaded" }); await page.waitForSelector(".camera-heading-actions .camera-button--primary"); await page.click(".camera-heading-actions .camera-button--primary"); await page.waitForSelector(".vpn-access-field select"); await page.select(".vpn-access-field select", "qa-office"); await capture("vpn-camera-access-mobile"); await page.keyboard.press("Escape");
  await page.goto("http://host.docker.internal/firewall/assets/devices/new", { waitUntil: "domcontentloaded" }); await page.waitForSelector(".vpn-access-field select"); await page.select(".vpn-access-field select", "qa-office"); await capture("vpn-device-access-mobile");
  assert.deepEqual(errors, []); process.stdout.write(JSON.stringify({ ok: true, runtimeErrors: 0, overflow: false, screenshots: 8, connections, sampleImport: Boolean(process.env.VPN_SAMPLE_CONF_PATH), data: "mocked profiles; no real VPN" }));
} finally { await browser.close(); }
