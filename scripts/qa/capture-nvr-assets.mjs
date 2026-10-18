import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage(), errors = [], base = process.env.QA_BASE_URL ?? "http://host.docker.internal/firewall";
await page.setBypassServiceWorker(true);
await page.evaluateOnNewDocument(appearance => { localStorage.setItem("eosnet.appearance", appearance); }, process.env.QA_APPEARANCE ?? "dark");
let role = "admin", moved = false, conflict = true, moves = 0, creations = 0, checks = 0, state = "normal", screenshots = 0;
const company = { id: "qa-company", name: "شرکت مبنا", code: "MABNA", cameraCount: 0, nvrCount: 1 }, target = { id: "qa-second", name: "شرکت آفتاب", code: "AFTAB", cameraCount: 0, nvrCount: 0 };
const camera = { id: "qa-nvr", name: "ضبط‌کننده ساختمان مرکزی", companyId: company.id, company, host: "192.168.18.50", location: "اتاق سرور", kind: "nvr", connectionMode: "onvif", onvifPort: 80, onvifPath: "/onvif/device_service", onvifHttps: false, status: "verified", lastSeenAt: new Date().toISOString(), lastErrorCode: null, profiles: [], credentialsConfigured: true, createdAt: new Date().toISOString(), infoJson: { Manufacturer: "QA fixture", Model: "NVR 16 channel" } };
const legacy = { ...camera, id: "legacy", kind: "camera", name: "ورودی ساختمان", companyId: null, company: null, host: "192.168.18.4" };
const specs = [["connection", "پاسخ تجهیز", "connection", 1, "boolean"], ["response_time", "زمان پایش", "connection", 83, "ms"], ["clock", "اختلاف ساعت", "connection", 3, "s"], ["disks", "هاردهای گزارش‌شده", "storage", 2, "count"], ["capacity", "ظرفیت هاردها", "storage", 4e12, "bytes"], ["usage", "فضای مصرف‌شده", "storage", 62, "%"], ["disk_health", "وضعیت هارد", "storage", 1, "boolean"], ["temperature", "بیشترین دمای هارد", "storage", 56, "°C"], ["smart", "ارزیابی SMART", "storage", null, "boolean"], ["channels", "کانال پیکربندی‌شده", "recording", 16, "count"], ["job_errors", "خطاهای کار ضبط", "recording", 0, "count"], ["cpu", "پردازنده", "hardware", null, "%"], ["memory", "حافظه", "hardware", null, "%"]];
const monitor = () => ({ monitoringEnabled: true, intervalSeconds: 300, sensors: specs.map(([id, labelFa, group, value, unit]) => ({ id, labelFa, labelEn: id, group, value: state === "empty" ? null : value, unit, status: state === "empty" || value === null ? "unknown" : state === "stale" ? "stale" : id === "temperature" ? "warning" : "ok", source: group === "storage" ? "xiongmai" : "ONVIF", noteFa: value === null ? "این آداپتور مقدار واقعی این سنسور را ارائه نکرده است." : "اندازه‌گیری واقعی دستگاه؛ وضعیت به پاسخ سرویس سازنده وابسته است.", noteEn: "Actual device measurements only." })),
  history: Array.from({ length: 12 }, (_, i) => ({ checkedAt: new Date(Date.now() - (12 - i) * 300000).toISOString(), reachable: true, warningCount: 0, readings: i === 5 ? {} : { temperature: 44 + i, usage: 50 + i, response_time: 80 + i } })),
  report: state === "empty" ? null : { checkedAt: new Date(Date.now() - (state === "stale" ? 3600000 : 0)).toISOString(), errorCode: state === "denied" ? "CAMERA_AUTH_FAILED" : undefined, reachable: true, durationMs: 83, configuredChannels: 16, recordingCount: null, clockDriftSeconds: 3, interfaces: [], jobs: [], coverage: { recordingJobs: "unsupported", diskCapacity: "measured", diskHealth: "measured" }, warnings: [], storage: { source: "xiongmai", status: "measured", disks: [{ id: "1", name: "HDD 1", capacityBytes: 4e12, usedBytes: 2.48e12, freeBytes: 1.52e12, health: "reported_ok", reportedState: "Normal", smart: "unknown", temperatureC: 56 }] } } });
page.on("pageerror", error => errors.push(error.message));
await page.setRequestInterception(true);
page.on("request", request => {
  const url = new URL(request.url()); if (!url.pathname.startsWith("/firewall-api/")) return void request.continue();
  const path = url.pathname.slice("/firewall-api".length), method = request.method(), respond = (value, status = 200) => request.respond({ status, contentType: "application/json", body: JSON.stringify(value) });
  if (path === "/auth/session-status") return void respond({ ok: true, authenticated: true, user: { id: "qa", username: "qa", displayName: "مدیر آزمایش", role, allowedSections: ["assets", "actions"] } });
  if (path === "/auth/csrf") return void respond({ ok: true, csrfToken: "qa-only" });
  if (path === "/product-state/navigation") return void respond({ navigation: [{ key: "assets", iconKey: "assets", titleFa: "دارایی‌ها", titleEn: "Assets", route: "/assets", mobilePrimary: true, items: [{ key: "assets.cameras", titleFa: "دوربین‌ها", titleEn: "Cameras", route: "/assets/cameras", state: "partial" }] }] });
  if (path === "/cameras/companies") return void respond({ companies: [company, target], unassigned: { cameraCount: moved ? 0 : 1, nvrCount: 0 } });
  if (path === "/companies") return void respond({ companies: url.searchParams.get("view") === "deleted" ? [] : [company, target].map(item => ({ ...item, description: "", deletedAt: null, _count: { devices: 0, assets: 1 } })) });
  if (path === "/assets") return void respond({ assets: [{ id: "nvr-qa-nvr", name: camera.name, companyId: company.id, company, managementIp: camera.host, managedState: "managed", healthState: "warning", nvrCameraId: camera.id, openPath: "/assets/devices/nvr-qa-nvr", vendor: { name: "NVR" }, platform: { name: "ONVIF / vendor API" }, lastSeenAt: new Date().toISOString() }], summary: {} });
  if (path === "/cameras/transfer") { moves++; if (conflict) return void respond({ error: { code: "CAMERA_TRANSFER_CONFLICT" } }, 409); moved = true; return void respond({ transferred: 1, companyId: target.id }); }
  if (path === "/cameras" && method === "GET") return void respond({ cameras: url.searchParams.get("companyId") === "unassigned" ? moved ? [] : [legacy] : [camera] });
  if (path === "/cameras" && method === "POST") { const input = JSON.parse(request.postData()); assert.equal(input.kind, "nvr"); assert.equal(input.companyId, company.id); creations++; return void respond({ camera }, 201); }
  if (path === `/cameras/${camera.id}`) return void respond({ camera });
  if (path === `/cameras/${camera.id}/monitor/refresh`) { checks++; return void respond(monitor()); }
  if (path === `/cameras/${camera.id}/monitor`) return void respond(monitor());
  if (path === "/vpn") return void respond({ profiles: [], helper: { available: false, protocols: [] } });
  if (path.endsWith("/actions")) return void respond({ actions: [] });
  if (method !== "GET") errors.push(`Unexpected intercepted write ${method} ${path}`);
  return void respond({});
});
async function capture(name) { await page.evaluate(() => document.fonts.ready); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `page overflow: ${name}`); assert.equal(await page.evaluate(() => [...document.querySelectorAll("dialog[open]")].some(el => el.scrollWidth > el.clientWidth + 1)), false, `dialog overflow: ${name}`); await page.screenshot({ path: `/out/${name}.png`, fullPage: true }); screenshots++; }
async function button(text, scope = "") { const found = await page.evaluate((text, scope) => { const el = [...document.querySelectorAll(`${scope} button`)].find(el => el.textContent.trim() === text); if (!el) return false; el.click(); return true; }, text, scope); assert.ok(found, `button ${text}`); }
try {
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${base}/assets/cameras?company=unassigned`, { waitUntil: "domcontentloaded" }); await page.waitForSelector(".camera-device-card");
  await button("افزودن دستگاه"); await page.waitForSelector("dialog[open] select"); await capture("unassigned-add-company");
  await button("ساخت شرکت جدید", "dialog[open]"); assert.equal((await page.$$("dialog[open] input[required]")).length, 2); await capture("unassigned-create-company"); await button("انتخاب شرکت موجود", "dialog[open]");
  await button("ادامه", "dialog[open]"); await page.waitForSelector(".camera-tabs"); await capture("unassigned-add-connection");
  await page.keyboard.press("Escape"); await page.waitForSelector("dialog[open]", { hidden: true });
  await button("انتقال به شرکت دیگر"); await page.click(".camera-transfer-selection input"); await button("انتقال 1 دستگاه");
  await page.waitForSelector("dialog[open] select"); await page.select("dialog[open] select", target.id); await button("ادامه", "dialog[open]"); await page.waitForFunction(() => document.querySelector("dialog[open]")?.textContent.includes("تأیید انتقال")); await capture("transfer-confirm");
  await button("تأیید انتقال", "dialog[open]"); await page.waitForSelector("dialog[open] [role=alert]"); assert.ok(await page.$eval("dialog[open]", el => el.textContent.includes("هیچ‌کدام"))); await capture("transfer-conflict");
  conflict = false; await button("تأیید انتقال", "dialog[open]"); await page.waitForSelector("dialog[open]", { hidden: true }); await page.waitForSelector(".camera-empty"); assert.equal(moves, 2);
  await page.goto(`${base}/assets/devices/new?vendor=nvr`, { waitUntil: "domcontentloaded" }); await page.waitForSelector("dialog[open] select"); await button("ادامه", "dialog[open]"); await page.waitForSelector(".camera-form-grid select");
  assert.equal(await page.$eval(".camera-form-grid select", el => el.value), "nvr"); assert.equal(await page.$eval(".camera-form-grid select", el => el.disabled), true);
  await capture("nvr-register-from-assets"); await page.type("input[placeholder='192.168.18.50']", camera.host);
  await page.$eval("dialog[open] form", form => form.requestSubmit()); await page.waitForSelector(".nvr-sensor-grid"); assert.equal(creations, 1);
  assert.equal(await page.$$(".nvr-sensor").then(nodes => nodes.length), 13); assert.equal(await page.$$(".nvr-sensor.is-unknown").then(nodes => nodes.length), 3); assert.ok(await page.$(".nvr-sensor__trend"));
  await capture("nvr-sensors-desktop"); await button("پایش الان"); await page.waitForFunction(() => !document.querySelector(".nvr-workspace-toolbar>.camera-button").disabled); assert.equal(checks, 1);
  await button("هاردها", ".nvr-sensor-filters"); assert.equal((await page.$$(".nvr-sensor")).length, 6); await capture("nvr-storage-sensors"); await button("همه", ".nvr-sensor-filters");
  await button("هارد و تنظیم پایش"); await page.waitForSelector(".nvr-disk"); await capture("nvr-disk-detail"); await button("سنسورها", ".nvr-workspace-toolbar");
  for (const width of [390, 320]) { await page.setViewport({ width, height: 844, isMobile: true, hasTouch: true }); await page.waitForSelector(".nvr-sensor-grid"); await capture(`nvr-mobile-${width}`); }
  state = "stale"; await page.reload({ waitUntil: "domcontentloaded" }); await page.waitForSelector(".nvr-sensor.is-stale"); await capture("nvr-stale-mobile");
  state = "empty"; await page.reload({ waitUntil: "domcontentloaded" }); await page.waitForSelector(".nvr-sensor"); assert.equal((await page.$$(".nvr-sensor.is-unknown")).length, 13); await capture("nvr-never-measured-mobile");
  state = "denied"; await page.reload({ waitUntil: "domcontentloaded" }); await page.waitForSelector(".nvr-sensor-grid"); assert.ok(await page.$eval(".nvr-device-page", el => el.textContent.includes("دستگاه ورود را رد کرد"))); await capture("nvr-authentication-error-mobile");
  state = "normal"; role = "viewer"; await page.reload({ waitUntil: "domcontentloaded" }); await page.waitForSelector(".nvr-sensor-grid"); assert.equal(await page.$(".nvr-workspace-toolbar>.camera-button"), null); await capture("nvr-viewer-mobile");
  await page.goto(`${base}/assets/cameras?company=qa-company`, { waitUntil: "domcontentloaded" }); await page.waitForSelector(".camera-device-card"); assert.equal(await page.$(".camera-transfer-toolbar"), null); await capture("camera-viewer-mobile");
  role = "admin"; await page.reload({ waitUntil: "domcontentloaded" }); await page.waitForSelector(".camera-transfer-toolbar"); await button("انتقال به شرکت دیگر"); await page.click(".camera-transfer-selection input"); await button("انتقال 1 دستگاه"); await page.waitForSelector("dialog[open] select");
  assert.deepEqual(await page.$$eval("dialog[open] select option", options => options.map(option => option.value).filter(Boolean)), [target.id], "the current company cannot be selected as the destination"); await capture("transfer-company-mobile"); await page.keyboard.press("Escape");
  await page.setViewport({ width: 1440, height: 900, isMobile: false, hasTouch: false }); await page.goto(`${base}/assets/devices`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".asset-table-identity a"); assert.ok(await page.$('a[href$="/assets/devices/new?vendor=nvr"]')); assert.ok(await page.$('.asset-table-identity a[href$="/assets/devices/nvr-qa-nvr"]'));
  await capture("nvr-in-asset-inventory"); await page.click('.asset-table-identity a[href$="/assets/devices/nvr-qa-nvr"]'); await page.waitForSelector(".nvr-sensor-grid");
  assert.deepEqual(errors, []); console.log(JSON.stringify({ ok: true, screenshots, moves, registrations: creations, readOnlyChecks: checks, runtimeErrors: errors.length, actualExternalWrites: 0 }));
} finally { await browser.close(); }
