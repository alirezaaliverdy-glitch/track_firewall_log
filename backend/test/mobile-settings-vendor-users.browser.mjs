import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";

const require = createRequire("/app/package.json");
const puppeteer = require("puppeteer-core");
const baseUrl = process.env.TEST_BASE_URL ?? "http://main-nginx";
const appOrigin = new URL(baseUrl).origin;
const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const now = new Date().toISOString();
const sections = ["dashboard", "assets", "security", "monitoring", "actions", "assistant", "attackers"];
const users = [{ id: "admin-1", username: "admin", displayName: "Administrator", role: "admin", isActive: true, allowedSections: sections, effectivePermissions: [], activeSessionCount: 1, lastSeenAt: now, createdAt: now, updatedAt: now }];
const events = Array.from({ length: 18 }, (_, index) => ({ id: `event-${index}`, username: "operator", kind: index % 5 === 0 ? "privileged" : "login", risk: index % 5 === 0 ? "high" : "normal", deviceId: "linux-1", deviceName: "server-one", sourceIp: "192.0.2.10", observedAt: now, sourceType: "linux_ssh", evidence: `Sample account evidence ${index} and a long message for the expandable log view.` }));
const account = { username: "operator", loginCount: 14, activityCount: 4, reviewCount: 4, findingCount: 0, devices: [{ id: "linux-1", name: "server-one" }], reviewDeviceIds: ["linux-1"], sourceIps: ["192.0.2.10"], lastSeen: now };

try {
  for (const language of ["fa", "en"]) {
    console.log(`Testing ${language} mobile UI`);
    const page = await browser.newPage();
    const errors = [];
    const writes = [];
    await page.setBypassServiceWorker(true);
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.evaluateOnNewDocument((selectedLanguage) => localStorage.setItem("firewall-log-analyzer.locale", selectedLanguage), language);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith("/firewall-api/") && !url.pathname.startsWith("/api/")) return url.origin === appOrigin || url.protocol === "data:" ? request.continue() : request.abort();
      const path = url.pathname.replace(/^\/(?:firewall-api|api)/, "");
      if (request.method() !== "GET") writes.push({ path, method: request.method(), body: request.postData() });
      let body = {};
      if (path === "/auth/session-status") body = { user: users[0] };
      else if (path === "/auth/csrf") body = { csrfToken: "fixture" };
      else if (path === "/auth/sessions") body = { sessions: [] };
      else if (path === "/admin/users" && request.method() === "GET") body = { users, catalog: { sections, roles: [] } };
      else if (path === "/admin/users" && request.method() === "POST") {
        const input = JSON.parse(request.postData() ?? "{}");
        users.push({ ...input, id: `created-${users.length}`, isActive: true, effectivePermissions: [], activeSessionCount: 0, lastSeenAt: null, createdAt: now, updatedAt: now });
        body = { user: users.at(-1) };
      } else if (path === "/product-state/navigation") body = { contractVersion: "test", navigation: [] };
      else if (path === "/security/vendor-users") {
        const vendor = url.searchParams.get("vendor");
        const selected = url.searchParams.get("username");
        body = { vendors: ["linux"], recommendedVendor: "linux", refreshedAt: now, vendor, deviceId: null, selectedUsername: selected, devices: [{ id: "linux-1", name: "server-one", vendor: "linux" }], days: 7, since: now, sampled: false, monitoring: { enabledCollectors: 1, latestCollectionAt: now, latestErrorAt: null }, coverage: "collector_or_import", accounts: vendor ? [account] : [], timeline: selected ? events : [], timelineTotal: selected ? events.length : 0, findings: [] };
      }
      return request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });

    await page.goto(`${baseUrl}/firewall/settings`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".users-toolbar__actions .primary-button");
    if (language === "en") assert.doesNotMatch(await page.$eval("body", (element) => element.innerText), /[\u0600-\u06ff]/, "English settings contains Persian interface copy");
    await page.click(".platform-bottom-nav button");
    await page.waitForFunction(() => Math.abs(document.querySelector('.platform-sidebar.is-mobile-open')?.getBoundingClientRect().right - (document.querySelector('.platform-shell')?.getAttribute('dir') === 'rtl' ? innerWidth : document.querySelector('.platform-sidebar.is-mobile-open')?.getBoundingClientRect().width)) < 2, { timeout: 3000 });
    const drawer = await page.$eval(".platform-sidebar.is-mobile-open", (element) => { const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right }; });
    assert.ok(language === "fa" ? Math.abs(drawer.right - 390) < 2 : Math.abs(drawer.left) < 2, `${language} drawer opened on the wrong side: ${JSON.stringify(drawer)}`);
    await page.click(".platform-sidebar__close");
    await page.waitForFunction(() => !document.querySelector('.platform-sidebar')?.classList.contains('is-mobile-open'));
    await new Promise((resolve) => setTimeout(resolve, 300));
    await page.click(".users-toolbar__actions .primary-button");
    await page.waitForSelector(".settings-editor-backdrop [role=dialog]");
    assert.ok(await page.$eval(".settings-editor-backdrop [role=dialog]", (element) => { const rect = element.getBoundingClientRect(); return rect.top < innerHeight && rect.bottom > 0; }), `${language} account editor is not visible`);
    if (language === "en") assert.match(await page.$eval("#user-editor-title", (element) => element.textContent), /Create account/);
    await page.type(".user-editor input[placeholder='sara.ops']", `mobile_${language}_${Date.now()}`);
    await page.type(".user-editor input[autocomplete='new-password']", randomBytes(12).toString("base64url"));
    await page.type(".user-editor .editor-fields label:nth-child(2) input", "Mobile Test User");
    await page.click(".user-editor button[type=submit]");
    await page.waitForFunction(() => !document.querySelector(".settings-editor-backdrop"));
    assert.ok(writes.some((item) => item.path === "/admin/users" && item.method === "POST"), `${language} did not submit account creation`);
    await page.click(".users-list article:last-child .user-edit");
    await page.waitForSelector(".settings-editor-backdrop");
    await page.click(".user-delete-row button");
    await page.waitForSelector(".settings-delete-backdrop");
    assert.ok(await page.$eval(".settings-delete-dialog", (element) => {
      const rect = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
    }), `${language} delete confirmation is hidden behind the account editor`);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector(".settings-delete-backdrop"));
    assert.ok(await page.$(".settings-editor-backdrop"), `${language} Escape closed the editor instead of the delete confirmation`);
    await page.click(".user-editor > header .icon-button");

    await page.goto(`${baseUrl}/firewall/security/vendor-users`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".vendor-user-card");
    await page.click(".vendor-user-card");
    await page.waitForSelector(".vendor-user-detail .vendor-user-event");
    if (language === "en") assert.doesNotMatch(await page.$eval(".vendor-user-detail", (element) => element.innerText), /[\u0600-\u06ff]/, "English account detail contains Persian interface copy");
    assert.equal(await page.$$(".vendor-user-detail .vendor-user-event").then((items) => items.length), 6);
    assert.ok(await page.$eval(".vendor-user-detail", (element) => getComputedStyle(element).position === "fixed"));
    assert.ok(await page.$eval(".vendor-user-event-evidence", (element) => !element.open));
    await page.click(".vendor-user-show-more");
    assert.equal(await page.$$(".vendor-user-detail .vendor-user-event").then((items) => items.length), 12);
    await page.click(".vendor-user-timeline-filters button:nth-child(2)");
    await page.waitForFunction(() => document.querySelectorAll('.vendor-user-detail .vendor-user-event').length === 4, { timeout: 3000 });
    assert.equal(await page.$$(".vendor-user-detail .vendor-user-event").then((items) => items.length), 4);
    if (language === "en") assert.match(await page.$eval(".vendor-user-timeline-section", (element) => element.textContent), /Activity timeline/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), `${language} page overflows horizontally`);
    await page.click(".vendor-user-detail-close");
    assert.equal(await page.$$(".vendor-user-detail").then((items) => items.length), 0);
    assert.deepEqual(errors, [], `${language} browser errors`);
    await page.close();
  }
  console.log("Passed: RTL/LTR mobile drawer, visible account creation and mocked POST, compact bilingual account evidence, no browser errors.");
} finally { await browser.close(); }
