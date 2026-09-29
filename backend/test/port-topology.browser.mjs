// Deployed UI regression with synthetic data only. Every API request is intercepted.
// Run inside the API image (Chromium + puppeteer-core), never against a vendor API.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire("/app/package.json");
const puppeteer = require("puppeteer-core");
const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setBypassServiceWorker(true);
  await page.setViewport({ width: 1440, height: 1000 });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem("i18nextLng", "fa");
    window.topologyPolls = [];
    const original = window.setInterval.bind(window);
    window.setInterval = (callback, delay, ...args) => {
      if (delay === 60000) window.topologyPolls.push(callback);
      return original(callback, delay, ...args);
    };
  });
  const endpoint = (port, policy = false) => ({ key: "tcp:" + port, protocol: "tcp", address: "0.0.0.0", port, state: policy ? "allowed" : "listening", exposure: policy ? "policy" : "all_interfaces", source: "test", confidence: 1, serviceName: "fixture" });
  const device = (id, vendor, port) => ({ id, name: id, vendor, type: vendor === "linux" ? "linux_edge" : vendor, host: "192.0.2.10", status: "online", model: null, ports: [], serviceEndpoints: [endpoint(port), endpoint(443, true)], serviceFreshness: "stale", serviceSnapshotAt: new Date(Date.now() - 3600000).toISOString() });
  const devices = [device("linux-test", "linux", 8080), device("cisco-test", "cisco", 22)];
  let releaseInitial;
  const initialGate = new Promise((resolve) => { releaseInitial = resolve; });
  let initial = true;
  let failed = false;
  let listenerPort = 3000;
  let discoverCalls = 0;
  let listenerCalls = 0;
  const blockedMutations = [];
  await page.setRequestInterception(true);
  page.on("request", async (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/firewall-api/") && !url.pathname.startsWith("/api/")) {
      if (url.hostname === "main-nginx" || url.protocol === "data:") return request.continue();
      return request.abort();
    }
    let body = {};
    if (url.pathname.endsWith("/auth/session-status")) body = { user: { id: "fixture-user", username: "fixture", displayName: "Fixture", role: "admin", allowedSections: ["assets", "actions", "dashboard", "monitoring", "security"] } };
    else if (url.pathname.endsWith("/auth/csrf")) body = { csrfToken: "fixture-csrf" };
    else if (url.pathname.endsWith("/product-state/navigation")) body = { contractVersion: "test", navigation: [] };
    else if (url.pathname.endsWith("/assets/port-topology") && request.method() === "GET") body = { generatedAt: new Date().toISOString(), devices };
    else if (url.pathname.endsWith("/port-topology/discover") || url.pathname.endsWith("/listeners/refresh")) {
      const input = JSON.parse(request.postData());
      const item = devices.find((entry) => entry.id === input.deviceId);
      assert.ok(item, "refresh must preserve selected device identity");
      const discovery = url.pathname.endsWith("/discover");
      if (discovery) discoverCalls++; else listenerCalls++;
      if (initial) { initial = false; await initialGate; }
      Object.assign(item, { serviceFreshness: failed ? "stale" : "current", serviceErrorCode: failed ? "AUTH_FAILED" : null, serviceSnapshotAt: new Date().toISOString(), serviceEndpoints: [endpoint(item.vendor === "linux" ? listenerPort : 22), endpoint(443, true)] });
      body = { connected: !failed, liveConnected: !failed, discoveredCount: 0, serviceEndpointCount: item.serviceEndpoints.length, topology: { devices: [item] } };
    } else if (request.method() !== "GET") blockedMutations.push(url.pathname);
    await request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto((process.env.TOPOLOGY_UI_URL ?? "http://main-nginx/firewall/assets/topology") + "?deviceId=linux-test", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".service-evidence.is-stale");
  assert.equal(await page.$$(".service-node").then((items) => items.length), 0, "historical listener must not look current");
  assert.equal(await page.$eval(".port-topology-toolbar select", (el) => el.value), "linux-test");
  releaseInitial();
  await page.waitForSelector(".service-evidence.is-current");
  assert.deepEqual(await page.$$eval(".service-node strong", (nodes) => nodes.map((el) => el.textContent)), ["3000"]);
  await page.$$eval(".service-filter button", (nodes) => nodes[1].click());
  assert.deepEqual(await page.$$eval(".service-node strong", (nodes) => nodes.map((el) => el.textContent)), ["443"]);
  await page.$$eval(".service-filter button", (nodes) => nodes[0].click());
  listenerPort = 4000;
  await page.evaluate(() => window.topologyPolls.at(-1)());
  await page.waitForFunction(() => document.querySelector(".service-node strong")?.textContent === "4000");
  assert.equal(listenerCalls, 1, "repeat Linux poll should be light, not full discovery");
  failed = true;
  await page.evaluate(() => window.topologyPolls.at(-1)());
  await page.waitForSelector(".service-evidence.is-stale");
  assert.equal(await page.$$(".service-node").then((items) => items.length), 0);
  await page.$eval(".service-evidence button", (el) => el.click());
  await page.waitForSelector(".service-node");
  assert.equal(await page.$eval(".service-node strong", (el) => el.textContent), "4000");
  failed = false;
  await page.select(".port-topology-toolbar select", "cisco-test");
  await page.waitForSelector(".service-evidence.is-current");
  assert.equal(discoverCalls, 2, "non-Linux selected device must also refresh");
  assert.equal(await page.$eval(".service-node strong", (el) => el.textContent), "22");
  for (const width of [1440, 390, 320]) {
    await page.setViewport({ width, height: 1000 });
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "page must not overflow at " + width);
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(blockedMutations, [], "no configuration, action or credential writes");
  console.log(JSON.stringify({ ok: true, viewports: [1440, 390, 320], checks: ["historical-hidden", "selected-identity", "listener-policy-separation", "light-poll-replaces-port", "failed-read-historical", "vendor-switch", "no-overflow", "no-writes"] }));
} finally { await browser.close(); }
