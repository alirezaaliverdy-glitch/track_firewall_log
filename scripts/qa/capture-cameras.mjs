import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import puppeteer from "puppeteer-core";

const image = execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=1", "-frames:v", "1", "-threads", "1", "-f", "image2pipe", "-c:v", "mjpeg", "pipe:1"]);
const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage(), errors = [];
await page.setBypassServiceWorker(true);
if (process.env.QA_APPEARANCE === "light") await page.evaluateOnNewDocument(() => localStorage.setItem("eosnet.appearance", "light"));
const base = process.env.QA_BASE_URL || "http://host.docker.internal/firewall";
let executions = 0;
let frameRequests = 0;
let mediaRequests = 0, inventoryMode = "normal", failMedia = false, role = "admin";
let screenshotCount = 0;
let emptyDesktopStream = true;
const profile = (token, source, name, width, ptz = false) => ({ token, sourceToken: source, name, width, height: Math.round(width * 9 / 16), encoding: "H264", fps: 25, ptz, streamAvailable: true, snapshotAvailable: true });
const device = (id, name, host, kind, location, profiles) => ({ id, name, host, kind, location, profiles, onvifPort: 80, onvifHttps: false, onvifPath: "/onvif/device_service", connectionMode: "onvif", status: "verified", lastSeenAt: new Date().toISOString(), lastErrorCode: null, credentialsConfigured: true, infoJson: { Manufacturer: "ONVIF fixture", Model: kind === "nvr" ? "NVR fixture" : "MCA52 fixture", FirmwareVersion: "Test fixture", SerialNumber: "QA-only" } });
const devices = [device("nvr", "ضبط‌کنندهٔ اصلی", "192.168.18.50", "nvr", "اتاق تجهیزات", [profile("ch1-main", "ch1", "ورودی · اصلی", 1920), profile("ch1-sub", "ch1", "ورودی · کم‌مصرف", 640), profile("ch2-main", "ch2", "پارکینگ", 1280)]), ...Array.from({ length: 5 }, (_, i) => device(`c${i}`, ["ورودی ساختمان", "پارکینگ", "راهروی طبقهٔ اول", "حیاط", "انبار"][i], `192.168.18.${i + 4}`, "camera", ["همکف", "زیرزمین", "طبقهٔ اول", "محوطه", "همکف"][i], [profile("main", "source", "اصلی", 1920, i === 0), profile("sub", "source", "کم‌مصرف", 640, i === 0)]))];
devices[5].status = "error"; devices[5].lastErrorCode = "CAMERA_TIMEOUT"; devices[5].lastSeenAt = null;
devices[0].profiles.push({ ...profile("still-only", "ch1", "عکس", 320), streamAvailable: false });
page.on("pageerror", (error) => errors.push(error.message));
await page.setRequestInterception(true);
page.on("request", (request) => {
  const url = new URL(request.url());
  if (!url.pathname.startsWith("/firewall-api/")) { void request.continue(); return; }
  const path = url.pathname.slice("/firewall-api".length), method = request.method();
  const respond = (value, status = 200) => request.respond({ status, contentType: "application/json", body: JSON.stringify(value) });
  if (path === "/auth/session-status") return void respond({ ok: true, authenticated: true, user: { id: "qa", username: "qa", displayName: "مدیر آزمایش", role, allowedSections: role === "admin" ? ["assets", "actions"] : ["assets"] } });
  if (path === "/auth/csrf") return void respond({ ok: true, csrfToken: "qa-only" });
  if (path === "/product-state/navigation") return void respond({ navigation: [{ key: "assets", iconKey: "assets", titleFa: "دارایی‌ها", titleEn: "Assets", route: "/assets", mobilePrimary: true, items: [{ key: "assets.cameras", titleFa: "دوربین‌ها", titleEn: "Cameras", route: "/assets/cameras", state: "partial" }] }] });
  if (path === "/cameras" && method === "GET") return void respond(inventoryMode === "failure" ? { error: { code: "CAMERA_REQUEST_FAILED" } } : { cameras: inventoryMode === "empty" ? [] : devices }, inventoryMode === "failure" ? 503 : 200);
  if (path === "/vpn") return void respond({ profiles: [], helper: { available: false, protocols: [] } });
  if (path === "/cameras/discover") return void respond({ cidr: "192.168.18.0/24", scannedAddresses: 254, partial: false, candidates: [{ host: "192.168.18.12", onvifPort: 80, onvifHttps: false, onvifPath: "/onvif/device_service", name: "دوربین ورودی دوم", evidence: "onvif", registered: false }, { host: "192.168.18.13", onvifPort: 80, onvifPath: "/onvif/device_service", name: "192.168.18.13", evidence: "rtsp", registered: false }] });
  if (/\/(?:live|snapshot|frame)$/.test(path)) { mediaRequests++; if (failMedia) return void respond({ error: { code: "CAMERA_VIDEO_TIMEOUT" } }, 504); }
  if (path.endsWith("/frame")) { frameRequests++; return void request.respond({ status: 200, contentType: "image/jpeg", body: image }); }
  if (/\/(?:live|snapshot)$/.test(path)) {
    if (path.endsWith("/snapshot")) return void request.respond({ status: 200, contentType: "image/jpeg", body: image });
    if (emptyDesktopStream) { emptyDesktopStream = false; return void request.respond({ status: 200, contentType: "multipart/x-mixed-replace; boundary=firewall-camera", body: "" }); }
    const multipart = Buffer.concat([Buffer.from(`--firewall-camera\r\nContent-Type: image/jpeg\r\nContent-Length: ${image.length}\r\n\r\n`), image, Buffer.from("\r\n--firewall-camera--\r\n")]);
    return void request.respond({ status: 200, contentType: "multipart/x-mixed-replace; boundary=firewall-camera", body: multipart });
  }
  if (path.endsWith("/presets")) return void respond({ presets: [{ token: "front", name: "ورودی" }] });
  if (path.endsWith("/actions/preview")) return void respond({ id: "qa-plan", status: "preview_ready", expiresAt: new Date(Date.now() + 300000).toISOString(), preview: { titleFa: "راه‌اندازی مجدد", titleEn: "Restart device", cameraName: devices[0].name, host: devices[0].host, effectFa: "NVR دوباره راه‌اندازی می‌شود؛ تصویر همهٔ کانال‌های آن موقتاً قطع می‌شود.", effectEn: "NVR will restart; all channels disconnect temporarily.", risk: "high", connectorInvoked: false } });
  if (path.endsWith("/execute")) { executions++; return void respond({ status: "succeeded", connectorInvoked: true, accepted: true, requiresReconnect: true }); }
  if (path.endsWith("/actions")) return void respond({ actions: [] });
  return void respond({});
});

async function capture(name) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "page overflow");
  const dialogOverflow = await page.evaluate(() => [...document.querySelectorAll("dialog[open]")].some((dialog) => dialog.scrollWidth > dialog.clientWidth + 1));
  assert.equal(dialogOverflow, false, "dialog overflow");
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('dialog[open]')].every(dialog => {
    const bounds = dialog.getBoundingClientRect();
    return Math.abs(bounds.left + bounds.width / 2 - innerWidth / 2) < 2 && Math.abs(bounds.top + bounds.height / 2 - innerHeight / 2) < 2;
  })), true, "camera dialogs must be centered");
  await page.screenshot({ path: `/out/${name}.png`, fullPage: true });
  screenshotCount++;
}
try {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${base}/assets/cameras`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".camera-device-card", { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  assert.equal(mediaRequests, 0, "inventory must not auto-start camera decoders");
  await capture("cameras-desktop");
  await page.click(".camera-overview__item--attention");
  assert.equal(await page.$$eval(".camera-device-card", cards => cards.length), 1);
  await capture("cameras-desktop-attention");
  await page.click(".camera-overview__item--all");
  await page.type(".camera-search input", "  192.168.18.50  ");
  assert.equal(await page.$$eval(".camera-device-card", cards => cards.length), 1, "search ignores outer spaces");
  await page.click(".camera-search__clear");
  assert.equal(await page.$$eval(".camera-device-card", cards => cards.length), 6);
  await page.click(".camera-device-card .camera-button--primary");
  await page.waitForFunction(() => document.querySelector(".camera-player img")?.complete);
  assert.ok(await page.$eval(".camera-player img", (img) => img.naturalWidth > 0));
  assert.equal(await page.$eval('.camera-player select', el => el.value), 'ch1-sub', 'prefer a playable stream over a lower-resolution snapshot-only profile');
  assert.ok(frameRequests > 0, 'an empty multipart response falls back to bounded JPEG frames');
  await capture("cameras-desktop-live");
  await page.click(".camera-player .camera-icon-button");
  await page.click(".camera-device-card .camera-icon-button");
  await page.waitForSelector("dialog[open]");
  await page.locator(".camera-controls > .camera-button").click();
  await page.waitForSelector(".camera-confirm"); assert.equal(executions, 0);
  await capture("cameras-desktop-confirm");
  await page.click(".camera-confirm .camera-button--primary");
  await page.waitForSelector(".camera-success"); assert.equal(executions, 1);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.waitForSelector(".camera-device-card");
  await capture("cameras-mobile");
  await page.click(".camera-device-card .camera-button--primary");
  await page.waitForFunction(() => document.querySelector(".camera-player img")?.naturalWidth > 0);
  assert.ok(frameRequests > 0, "touch devices must use bounded authenticated JPEG frames");
  const before = frameRequests; await new Promise(resolve => setTimeout(resolve, 1200)); assert.ok(frameRequests > before);
  await capture("cameras-mobile-live");
  await page.click('.camera-player [aria-label="توقف پخش"]');
  await page.waitForSelector(".camera-player__resume");
  const retainedSrc = await page.$eval(".camera-player img", img => img.src);
  assert.ok(await page.$eval(".camera-player img", img => img.complete && img.naturalWidth > 0), "manual pause retains a decoded image");
  await new Promise(resolve => setTimeout(resolve, 650));
  const pausedRequests = frameRequests;
  await new Promise(resolve => setTimeout(resolve, 900)); assert.equal(frameRequests, pausedRequests, "paused video must not keep polling");
  assert.equal(await page.$eval(".camera-player img", img => img.src), retainedSrc, "paused image must remain stable");
  await capture("cameras-mobile-paused");
  await page.click(".camera-player__resume");
  await page.waitForFunction(() => document.querySelector(".camera-player--live img")?.naturalWidth > 0);
  await page.select('.camera-player select', "ch1-main");
  await page.waitForFunction(() => document.querySelector(".camera-player--live img")?.naturalWidth > 0);
  failMedia = true;
  await page.waitForSelector(".camera-player__error");
  await capture("cameras-mobile-video-error");
  await page.click('.camera-player__error-actions button:nth-child(2)');
  await page.waitForSelector('dialog[open]');
  await page.keyboard.press("Escape");
  failMedia = false;
  await page.click(".camera-player__error-actions .camera-button");
  await page.waitForFunction(() => document.querySelector(".camera-player--live img")?.naturalWidth > 0);
  await page.click(".camera-player header .camera-icon-button");
  await page.click(".camera-heading-actions .camera-button--primary");
  await page.waitForSelector("dialog[open]");
  await page.click(".camera-discover-row .camera-button");
  await page.waitForSelector(".camera-candidate");
  await page.click(".camera-candidate input:not([disabled])");
  assert.equal(await page.$eval(".camera-discover-row input", (input) => input.value), "192.168.18.0/24");
  await capture("cameras-mobile-discovery");
  await page.focus('.camera-tabs [aria-selected="true"]');
  await page.keyboard.press("End");
  assert.equal(await page.$eval('.camera-tabs button:nth-child(2)', el => el.getAttribute('aria-selected')), 'true');
  await page.keyboard.press("Home");
  assert.equal(await page.$eval('.camera-tabs button:first-child', el => el.getAttribute('aria-selected')), 'true');
  await page.click(".camera-tabs button:nth-child(2)");
  await page.select(".camera-form-grid select", "nvr");
  await capture("cameras-mobile-nvr");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  await page.waitForSelector(".camera-device-card");
  for (let index = 0; index < 4; index++) {
    const cards = await page.$$(".camera-device-card .camera-button--primary");
    assert.equal(cards.length, devices.length, `inventory before opening view ${index + 1}`);
    await cards[index].click();
    await page.waitForFunction(count => document.querySelectorAll(".camera-player").length === count, {}, index + 1);
  }
  const fifth = (await page.$$(".camera-device-card .camera-button--primary"))[4]; await fifth.click();
  assert.equal(await page.$$eval(".camera-player", views => views.length), 4);
  assert.ok(await page.$(".camera-alert[role=status]"));
  await page.click('.camera-layout-toggle [aria-label="تصاویر بزرگ"]');
  assert.equal(await page.$eval(".camera-view-grid", el => getComputedStyle(el).gridTemplateColumns.split(" ").length), 1);
  await page.click('.camera-layout-toggle [aria-label="چیدمان شبکه‌ای"]');
  assert.equal(await page.$eval(".camera-view-grid", el => getComputedStyle(el).gridTemplateColumns.split(" ").length), 2);
  await capture("cameras-desktop-four-views");
  await page.click(".camera-live-actions>.camera-button");
  await page.waitForFunction(() => !document.querySelector(".camera-player"));
  for (const width of [320, 768]) {
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    await capture(`cameras-width-${width}`);
  }
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  inventoryMode = "empty"; await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".camera-empty__icon");
  await capture("cameras-mobile-empty");
  inventoryMode = "failure"; await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('.camera-alert[role="alert"]');
  assert.equal(await page.$(".camera-empty__icon"), null, "load failure is not an empty camera library");
  await capture("cameras-mobile-load-error");
  inventoryMode = "normal";
  await page.evaluate(() => localStorage.setItem("firewall-log-analyzer.locale", "en"));
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".camera-device-card");
  assert.equal(await page.$eval("html", el => el.dir), "ltr");
  await capture("cameras-desktop-english");
  role = "viewer"; await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".camera-device-card");
  assert.equal(await page.$(".camera-heading-actions .camera-button--primary"), null, "viewer cannot add devices");
  await page.click(".camera-device-card .camera-icon-button");
  await page.waitForSelector('dialog[open]');
  assert.equal(await page.$(".camera-controls"), null, "viewer has no device actions");
  assert.equal(await page.$(".camera-detail__remove"), null, "viewer has no removal control");
  await capture("cameras-viewer-details");
  await page.keyboard.press("Escape");
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.click('.camera-device-card .camera-button--primary');
  await page.waitForFunction(() => document.querySelector('.camera-player img')?.naturalWidth > 0);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForSelector('.camera-player--paused');
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForSelector('.camera-player--live');
  await capture('cameras-reduced-motion');
  assert.deepEqual(errors, []);
  process.stdout.write(JSON.stringify({ ok: true, runtimeErrors: errors.length, overflow: false, confirmationExecutions: executions, frameRequests, screenshotCount, data: "mocked ONVIF devices and synthetic video" }));
} finally { await browser.close(); }
