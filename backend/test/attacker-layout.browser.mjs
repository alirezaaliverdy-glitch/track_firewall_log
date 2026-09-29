import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire("/app/package.json");
const puppeteer = require("puppeteer-core");
const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(() => localStorage.setItem("i18nextLng", "fa"));
  const errors = [], writes = [];
  page.on("pageerror", error => errors.push(error.message));
  const now = new Date().toISOString();
  const assessment = { verdict: "likely_attack", containmentStatus: "not_contained", actionableFindingCount: 1, informationalFindingCount: 0, logicalAuthenticationFailures: 4, bruteForceDetected: false, authenticationServices: ["ssh"], authenticationFailureVendors: ["linux"], targetedUsers: [], authenticationSuccesses: 0, normalSessionEvents: 0, notes: [] };
  const attacker = { ip: "45.198.224.140", riskScore: 83, severity: "high", scope: "public", firstSeen: now, lastSeen: now, findingCount: 1, eventCount: 9, confidence: .8, vendors: ["linux"], devices: [{ id: "linux-one", name: "linux-one", vendor: "linux", host: "192.0.2.10" }], assets: [], categories: ["authentication"], sources: [], actions: [], protocols: ["ssh"], targetedIps: [], targetedPorts: [22], usernames: [], eventTypes: ["ssh"], mitreTags: [], assessment, attackFamilies: [], responseReadiness: [], enrichment: { status: "dbip_lite", geo: { countryCode: "SE", countryName: "Sweden" }, asn: 19948, networkOwner: "Example Hosting" }, latestEvidence: Array.from({ length: 8 }, (_, i) => ({ id: `e${i}`, eventType: "ssh", timestamp: now, message: `Failed SSH authentication attempt ${i} from 45.198.224.140`, vendor: "linux", device: { name: "linux-one" } })), findings: [] };
  await page.setRequestInterception(true);
  page.on("request", request => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/firewall-api/") && !url.pathname.startsWith("/api/")) return url.hostname === "main-nginx" || url.protocol === "data:" ? request.continue() : request.abort();
    if (request.method() !== "GET") writes.push(url.pathname);
    let body = {};
    if (url.pathname.endsWith("/auth/session-status")) body = { user: { id: "fixture", username: "test", displayName: "Test", role: "admin", allowedSections: ["assets", "actions", "dashboard", "monitoring", "security"] } };
    else if (url.pathname.endsWith("/auth/csrf")) body = { csrfToken: "fixture" };
    else if (url.pathname.endsWith("/product-state/navigation")) body = { contractVersion: "test", navigation: [] };
    else if (url.pathname.endsWith("/security/attackers-geoip/status")) body = { ready: true, source: "DB-IP Lite", loadedAt: now };
    else if (url.pathname.endsWith("/security/attackers-allowlist")) body = { entries: [], vendors: ["all", "linux"] };
    else if (url.pathname.endsWith("/security/attackers")) body = { generatedAt: now, qualification: "fixture", summary: { total: 1, high: 1, critical: 0, affectedDevices: 1, contained: 0, bruteForce: 0, vendors: ["linux"] }, coverage: { findingsScanned: 1, eventsScanned: 8, eventWindowDays: 30 }, attackers: [attacker] };
    else if (url.pathname.endsWith("/security/attackers/45.198.224.140")) body = { generatedAt: now, qualification: "fixture", attacker };
    return request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("http://main-nginx/firewall/attackers", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".attacker-card");
  assert.equal(await page.$$(".attacker-operations").then(items => items.length), 0);
  assert.ok((await page.$eval(".attacker-card__identity", el => el.textContent)).includes("Sweden") || (await page.$eval(".attacker-card__identity", el => el.textContent)).includes("سوئد"));
  await page.click(".attacker-card");
  await page.waitForSelector(".attacker-enrichment-note__country");
  assert.equal(await page.$eval(".attacker-enrichment-note__country code", el => el.textContent), "SE");
  assert.equal(await page.$eval(".attacker-country-flag", el => el.textContent), "🇸🇪");
  assert.equal(await page.$$(".attacker-evidence-list article").then(items => items.length), 3);
  await page.click(".attacker-evidence-more");
  assert.equal(await page.$$(".attacker-evidence-list article").then(items => items.length), 8);
  await page.click(".attacker-evidence-list article details summary");
  assert.ok(await page.$eval(".attacker-evidence-list article details", el => el.open));
  for (const width of [1440, 390, 320]) {
    await page.setViewport({ width, height: 900 });
    await new Promise(resolve => setTimeout(resolve, 120));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), `horizontal overflow at ${width}`);
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  console.log("Passed: concise attacker cards, localized source-country flag and ASN, 3-log preview with expansion, responsive widths, no writes.");
} finally { await browser.close(); }
