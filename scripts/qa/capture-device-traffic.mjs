import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage();
const issues = [];
page.on("pageerror", (error) => issues.push(error.message));
await page.setRequestInterception(true);

const device = (id, name, vendor, host, speed, source) => ({
  id, name, vendor, host, status: "online",
  interfaces: [
    { name: vendor === "mikrotik" ? "ether1" : "port1", rxMbps: speed * .7, txMbps: speed * .3, totalMbps: speed, sampledAt: new Date().toISOString(), stale: false, method: "counter_delta" },
    { name: "port2", rxMbps: speed * .2, txMbps: speed * .1, totalMbps: speed * .3, sampledAt: new Date().toISOString(), stale: false, method: "counter_delta" }
  ],
  volume: { source, sampled: source === "netflow-v9" ? null : false, ports: [{ value: "443", bytes: 3_600_000_000, records: 100 }, { value: "53", bytes: 820_000_000, records: 50 }], sourceIps: [{ value: "192.168.1.10", bytes: 2_400_000_000, records: 60 }], destinationIps: [{ value: "203.0.113.4", bytes: 4_100_000_000, records: 90 }], interfaceIn: [], interfaceOut: [] },
  observed: { ports: [{ value: "443", count: 110 }], sourceIps: [{ value: "192.168.1.10", count: 55 }], destinationIps: [{ value: "203.0.113.4", count: 90 }] }
});

page.on("request", (request) => {
  const url = request.url();
  if (!url.includes("/firewall-api/")) { void request.continue(); return; }
  const respond = (value) => request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
  if (url.includes("/auth/session-status")) return void respond({ ok: true, authenticated: true, user: { id: "qa-admin", username: "qa", displayName: "مدیر آزمایش", role: "admin", allowedSections: ["dashboard", "assets", "security", "monitoring", "actions", "assistant"] } });
  if (url.includes("/auth/csrf")) return void respond({ ok: true, csrfToken: "visual-test-only" });
  if (url.includes("/dashboard/traffic")) return void respond({ generatedAt: new Date().toISOString(), devices: [device("d1", "فایروال مرکزی", "fortigate", "192.0.2.10", 648, "netflow-v9"), device("d2", "سوئیچ طبقه", "mikrotik", "192.0.2.11", 183, "netflow-v5")] });
  if (url.includes("/devices/d1/netflow")) return void respond({ enabled: true, exporterIp: "192.0.2.10", lastSeenAt: new Date().toISOString(), lastFormat: "netflow-v9", receiver: { listening: true, port: 2055, hostBind: "192.0.2.20", lastError: null }, packets: { accepted: 32, dropped: 0, lastPacketAt: new Date().toISOString() } });
  if (url.includes("/devices/d2/netflow")) return void respond({ enabled: false, exporterIp: null, lastSeenAt: null, lastFormat: null, receiver: { listening: true, port: 2055, hostBind: "192.0.2.20", lastError: null }, packets: { accepted: 0, dropped: 0, lastPacketAt: null } });
  if (url.includes("/dashboard/device-health")) return void respond({ devices: [], total: 0, pageSize: 10 });
  if (url.includes("/dashboard/activity")) return void respond({ generatedAt: new Date().toISOString(), summary: { activeDevices: 2, recentExecutions: 0, successfulActions: 0, failedActions: 0, pendingApprovals: 0, recentDeviceRegistrations: 0, latestConfigurationChanges: 0 }, recentExecutions: [], successfulActions: [], failedActions: [], pendingApprovals: [], recentDeviceRegistrations: [], latestConfigurationChanges: [] });
  if (url.includes("/monitoring/linux/summary")) return void respond({ devices: [], warning: 0, critical: 0, offline: 0, stale: 0, unknown: 0 });
  if (url.includes("/security/monitoring/status")) return void respond({ running: true, lastCycleAt: new Date().toISOString(), collectors: { configured: 0, succeeded: 0, failed: 0, devices: [] } });
  if (url.includes("/assets?")) return void respond({ assets: [], summary: {} });
  if (url.includes("/security/findings")) return void respond({ findings: [] });
  if (url.includes("/product-state/navigation")) return void respond({ contractVersion: "qa", navigation: [] });
  void respond({});
});

try {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto("http://host.docker.internal/firewall/dashboard", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector(".device-traffic-highlights", { timeout: 20_000 });
  const panel = await page.$(".device-traffic-panel");
  await panel.screenshot({ path: "/out/traffic-desktop.png" });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.waitForSelector(".device-traffic-highlights", { timeout: 10_000 });
  await panel.screenshot({ path: "/out/traffic-mobile.png" });
  await page.click(".device-traffic-explore > summary");
  await page.click(".device-traffic-tabs button:nth-child(2)");
  await panel.screenshot({ path: "/out/traffic-mobile-detail.png" });
  await page.click(".device-traffic-explore > summary");
  await page.click(".device-netflow-setup > summary");
  await panel.screenshot({ path: "/out/traffic-mobile-setup.png" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (issues.length || overflow) throw new Error(JSON.stringify({ issues, overflow }));
  process.stdout.write(JSON.stringify({ ok: true, desktop: "/out/traffic-desktop.png", mobile: "/out/traffic-mobile.png", detail: "/out/traffic-mobile-detail.png", setup: "/out/traffic-mobile-setup.png" }));
} finally { await browser.close(); }
