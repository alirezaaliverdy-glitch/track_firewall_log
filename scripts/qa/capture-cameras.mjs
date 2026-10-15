import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import puppeteer from "puppeteer-core";

const image = execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=1", "-frames:v", "1", "-threads", "1", "-f", "image2pipe", "-c:v", "mjpeg", "pipe:1"]);
const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage(), errors = [];
await page.setBypassServiceWorker(true);
const base = process.env.QA_BASE_URL || "http://host.docker.internal/firewall";
let executions = 0;
let frameRequests = 0;
const profile = (token, source, name, width, ptz = false) => ({ token, sourceToken: source, name, width, height: Math.round(width * 9 / 16), encoding: "H264", fps: 25, ptz, streamAvailable: true, snapshotAvailable: true });
const device = (id, name, host, kind, location, profiles) => ({ id, name, host, kind, location, profiles, onvifPort: 80, onvifHttps: false, onvifPath: "/onvif/device_service", connectionMode: "onvif", status: "verified", lastSeenAt: new Date().toISOString(), lastErrorCode: null, credentialsConfigured: true, infoJson: { Manufacturer: "ONVIF fixture", Model: kind === "nvr" ? "NVR fixture" : "MCA52 fixture", FirmwareVersion: "Test fixture", SerialNumber: "QA-only" } });
const devices = [device("nvr", "ضبط‌کنندهٔ اصلی", "192.168.18.50", "nvr", "اتاق تجهیزات", [profile("ch1-main", "ch1", "ورودی · اصلی", 1920), profile("ch1-sub", "ch1", "ورودی · کم‌مصرف", 640), profile("ch2-main", "ch2", "پارکینگ", 1280)]), ...Array.from({ length: 5 }, (_, i) => device(`c${i}`, ["ورودی ساختمان", "پارکینگ", "راهروی طبقهٔ اول", "حیاط", "انبار"][i], `192.168.18.${i + 4}`, "camera", ["همکف", "زیرزمین", "طبقهٔ اول", "محوطه", "همکف"][i], [profile("main", "source", "اصلی", 1920, i === 0), profile("sub", "source", "کم‌مصرف", 640, i === 0)]))];
page.on("pageerror", (error) => errors.push(error.message));
await page.setRequestInterception(true);
page.on("request", (request) => {
  const url = new URL(request.url());
  if (!url.pathname.startsWith("/firewall-api/")) { void request.continue(); return; }
  const path = url.pathname.slice("/firewall-api".length), method = request.method();
  const respond = (value, status = 200) => request.respond({ status, contentType: "application/json", body: JSON.stringify(value) });
  if (path === "/auth/session-status") return void respond({ ok: true, authenticated: true, user: { id: "qa", username: "qa", displayName: "مدیر آزمایش", role: "admin", allowedSections: ["assets", "actions"] } });
  if (path === "/auth/csrf") return void respond({ ok: true, csrfToken: "qa-only" });
  if (path === "/product-state/navigation") return void respond({ navigation: [{ key: "assets", iconKey: "assets", titleFa: "دارایی‌ها", titleEn: "Assets", route: "/assets", mobilePrimary: true, items: [{ key: "assets.cameras", titleFa: "دوربین‌ها", titleEn: "Cameras", route: "/assets/cameras", state: "partial" }] }] });
  if (path === "/cameras" && method === "GET") return void respond({ cameras: devices });
  if (path === "/vpn") return void respond({ profiles: [], helper: { available: false, protocols: [] } });
  if (path === "/cameras/discover") return void respond({ cidr: "192.168.18.0/24", scannedAddresses: 254, partial: false, candidates: [{ host: "192.168.18.12", onvifPort: 80, onvifHttps: false, onvifPath: "/onvif/device_service", name: "دوربین ورودی دوم", evidence: "onvif", registered: false }, { host: "192.168.18.13", onvifPort: 80, onvifPath: "/onvif/device_service", name: "192.168.18.13", evidence: "rtsp", registered: false }] });
  if (path.endsWith("/frame")) { frameRequests++; return void request.respond({ status: 200, contentType: "image/jpeg", body: image }); }
  if (/\/(?:live|snapshot)$/.test(path)) {
    if (path.endsWith("/snapshot")) return void request.respond({ status: 200, contentType: "image/jpeg", body: image });
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
  await page.screenshot({ path: `/out/${name}.png`, fullPage: true });
}
try {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${base}/assets/cameras`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".camera-device-card", { timeout: 20000 });
  await capture("cameras-desktop");
  await page.click(".camera-device-card .camera-button--primary");
  await page.waitForFunction(() => document.querySelector(".camera-player img")?.complete);
  assert.ok(await page.$eval(".camera-player img", (img) => img.naturalWidth > 0));
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
  await page.click(".camera-player header .camera-icon-button");
  await page.click(".camera-heading-actions .camera-button--primary");
  await page.waitForSelector("dialog[open]");
  await page.click(".camera-discover-row .camera-button");
  await page.waitForSelector(".camera-candidate");
  await page.click(".camera-candidate input:not([disabled])");
  assert.equal(await page.$eval(".camera-discover-row input", (input) => input.value), "192.168.18.0/24");
  await capture("cameras-mobile-discovery");
  await page.click(".camera-tabs button:nth-child(2)");
  await page.select(".camera-form-grid select", "nvr");
  await capture("cameras-mobile-nvr");
  await page.keyboard.press("Escape");
  assert.deepEqual(errors, []);
  process.stdout.write(JSON.stringify({ ok: true, runtimeErrors: errors.length, overflow: false, confirmationExecutions: executions, frameRequests, screenshotCount: 7, data: "mocked ONVIF devices and synthetic video" }));
} finally { await browser.close(); }
