// Browser-only fixtures: never submits credentials to the real authentication service.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage();
// HTTPS enables the production PWA worker. Bypass it so every synthetic API
// request remains in this page's interceptor rather than a worker-owned fetch.
await page.setBypassServiceWorker(true);
const errors = [];
let loginRequests = 0, loginResponse = "invalid_credentials", signedIn = false;
const user = { id: "qa-only", username: "qa-only", displayName: "QA", role: "admin", allowedSections: ["assets"] };
page.on("pageerror", error => errors.push(error.message));
await page.evaluateOnNewDocument(() => localStorage.setItem("firewall-log-analyzer.locale", "fa"));
await page.setRequestInterception(true);
page.on("request", request => {
  const url = new URL(request.url());
  if (!url.pathname.startsWith("/firewall-api/")) return void request.continue();
  const path = url.pathname.slice("/firewall-api".length);
  const respond = (body, status = 200) => request.respond({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (path === "/auth/session-status") return void respond({ authenticated: signedIn, user: signedIn ? user : null });
  if (path === "/auth/csrf") return void respond({ csrfToken: "qa-only" });
  if (path === "/auth/login") {
    loginRequests++;
    const body = JSON.parse(request.postData());
    assert.equal(body.username, "qa-only");
    assert.equal(body.password, "qa-fixture-only");
    setTimeout(() => {
      if (loginResponse === "success") { signedIn = true; void respond({ user }); }
      else void respond({ error: loginResponse, retryAfter: 30 }, loginResponse === "too_many_attempts" ? 429 : loginResponse === "invalid_credentials" ? 401 : 503);
    }, 400);
    return;
  }
  if (path === "/product-state/navigation") return void respond({ navigation: [{ key: "assets", iconKey: "assets", titleFa: "دارایی‌ها", titleEn: "Assets", route: "/assets/cameras", items: [] }] });
  if (path === "/cameras") return void respond({ cameras: [] });
  if (path === "/devices") return void respond({ devices: [] });
  if (path === "/vpn") return void respond({ profiles: [], available: true });
  return void respond({});
});
let screenshots = 0;
async function capture(name) {
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name}: horizontal overflow`);
  assert.equal(await page.$eval(".eos-login__brand img", image => image.complete && image.naturalWidth > 0), true);
  await page.screenshot({ path: `/out/${name}.png`, fullPage: true });
  screenshots++;
}
try {
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.setViewport({ width: 422, height: 750, deviceScaleFactor: 2 });
  await page.goto(process.env.LOGIN_QA_URL || "http://host.docker.internal/firewall/assets/cameras", { waitUntil: "networkidle0" });
  await page.waitForSelector(".eos-login__submit");
  assert.equal(await page.evaluate(() => document.activeElement.tagName), "BODY", "Must not open a mobile keyboard automatically");
  assert.equal(await page.$eval(".eos-login__brand .eos-brand__beam", element => getComputedStyle(element).animationName), "none");
  assert.equal(await page.$eval(".eos-login__submit", element => getComputedStyle(element).fontWeight), "800");
  assert.equal(await page.$eval("#login-password", element => getComputedStyle(element).fontSize), "16px");
  await capture("login-reference-mobile");
  const transparentCorners = await page.$eval(".eos-brand__base", image => {
    const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
    return [[0,0],[canvas.width-1,0],[0,canvas.height-1],[canvas.width-1,canvas.height-1]].map(([x,y]) => context.getImageData(x,y,1,1).data[3]);
  });
  assert.deepEqual(transparentCorners, [0,0,0,0], "Logo corners must be genuinely transparent");
  await page.evaluate(() => { document.querySelector(".eos-login").style.background = "#163247"; document.querySelector(".eos-login__background").style.display = "none"; });
  await capture("login-transparent-on-blue");
  await page.evaluate(() => { document.querySelector(".eos-login").style.background = ""; document.querySelector(".eos-login__background").style.display = ""; });
  const clips = { brand: { x: 100, y: 100, width: 222, height: 246 }, form: { x: 32, y: 410, width: 358, height: 215 } };
  for (const [name, clip] of Object.entries(clips)) {
    await page.screenshot({ path: `/out/login-${name}-detail.png`, clip }); screenshots++;
  }
  if (existsSync("/reference/eosnet-logo-source.jpg")) {
    const reference = await browser.newPage();
    await reference.setViewport({ width: 422, height: 750, deviceScaleFactor: 2 });
    await reference.setContent(`<style>body{margin:0}img{display:block;width:422px;height:750px}</style><img src="data:image/jpeg;base64,${readFileSync("/reference/eosnet-logo-source.jpg").toString("base64")}" alt="Reference">`);
    await reference.waitForFunction(() => document.querySelector("img").complete);
    for (const [name, clip] of Object.entries(clips)) {
      await reference.screenshot({ path: `/out/reference-${name}-detail.png`, clip }); screenshots++;
    }
    await reference.close();
  }
  for (const [name, width, height] of [["desktop",1440,900],["tablet",768,1024],["mobile",390,844],["small-mobile",320,568],["landscape",844,390]]) {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await capture(`login-${name}`);
  }
  await page.setViewport({ width: 390, height: 844 });
  await page.click('.eos-login__language button[lang="en"]');
  await page.waitForFunction(() => document.documentElement.lang === "en");
  assert.equal(await page.$eval(".eos-login", element => element.dir), "ltr");
  await capture("login-english");
  await page.click('.eos-login__language button[lang="fa"]');
  await page.waitForFunction(() => document.documentElement.lang === "fa");
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]);
  assert.equal(await page.$eval(".eos-login__brand .eos-brand__beam", element => getComputedStyle(element).animationName), "eos-brand-flow");
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  // Half the desktop CSS viewport models the responsive reflow at 200% browser zoom.
  await page.setViewport({ width: 720, height: 450 });
  await capture("login-zoom-reflow");
  await page.setViewport({ width: 390, height: 844 });
  await page.click(".eos-login__submit");
  await page.waitForSelector("#login-error");
  assert.equal(loginRequests, 0, "Invalid local form must not call API");
  await page.type("#login-username", " qa-only ");
  await page.type("#login-password", "qa-fixture-only");
  assert.equal(await page.$eval("#login-username", element => element.value.trim()), "qa-only");
  assert.equal(await page.$eval("#login-password", element => element.value.length), 15);
  await page.click(".eos-login__password-toggle");
  assert.equal(await page.$eval("#login-password", element => element.type), "text");
  assert.equal(await page.$eval(".eos-login__password-toggle", element => element.getAttribute("aria-pressed")), "true");
  await page.click(".eos-login__password-toggle");
  assert.equal(await page.$eval("#login-password", element => element.type), "password");
  await page.click("#login-password");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.className), "eos-login__password-toggle");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.className), "eos-login__submit");
  await page.click(".eos-login__submit");
  await page.waitForSelector(".eos-login__submit:disabled");
  await page.$eval(".eos-login__form", form => { form.requestSubmit(); form.requestSubmit(); });
  await capture("login-loading");
  await page.waitForSelector(".eos-login__submit:not(:disabled)");
  assert.equal(loginRequests, 1, "Repeated submit must not duplicate a pending request");
  await capture("login-invalid-credentials");
  for (const code of ["too_many_attempts", "database_unavailable", "login_unavailable"]) {
    loginResponse = code;
    await page.click("#login-password");
    await page.keyboard.press("Enter");
    await page.waitForSelector(".eos-login__submit:disabled");
    await page.waitForSelector(".eos-login__submit:not(:disabled)");
    assert.ok(await page.$eval("#login-error", element => element.textContent.length > 10));
    await capture(`login-${code}`);
  }
  await page.evaluate(() => sessionStorage.setItem("auth.notice", "password_changed"));
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector('.eos-login__message[role="status"]');
  await capture("login-password-changed");
  await page.evaluate(() => document.querySelector(".eos-login").classList.add("eos-login--native"));
  await page.setViewport({ width: 390, height: 420 });
  await page.click("#login-password");
  await page.$eval("#login-password", element => element.scrollIntoView({ block: "center" }));
  await capture("login-keyboard-height");
  await page.setViewport({ width: 390, height: 844 });
  await page.type("#login-username", "qa-only");
  await page.type("#login-password", "qa-fixture-only");
  loginResponse = "success";
  await page.click(".eos-login__submit");
  await page.waitForFunction(() => !document.querySelector(".eos-login"));
  assert.equal(signedIn, true, "Successful login must hand off to the existing protected route");
  await page.waitForSelector(".cameras-page__heading");
  assert.equal(await page.$eval(".platform-sidebar__brand-copy strong", element => element.textContent), "EOSNET");
  assert.equal((await page.$$(".platform-sidebar__brand-mark svg")).length, 0);
  assert.equal((await page.$$(".platform-sidebar__brand-mark .eos-brand img")).length, 4);
  await page.setViewport({ width: 1440, height: 900 });
  await page.screenshot({ path: "/out/eosnet-sidebar-desktop.png", fullPage: true }); screenshots++;
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]);
  assert.equal(await page.$eval(".platform-sidebar__brand-mark .eos-brand__beam", element => getComputedStyle(element).animationName), "eos-brand-flow");
  assert.equal(await page.$eval(".platform-sidebar__brand-mark i", element => getComputedStyle(element).animationName), "sidebar-orbit");
  await page.screenshot({ path: "/out/eosnet-sidebar-brand-detail.png", clip: await page.$eval(".platform-sidebar__controls", element => { const { x,y,width,height } = element.getBoundingClientRect(); return { x,y,width,height }; }) }); screenshots++;
  await page.screenshot({ path: "/out/login-camera-handoff.png", fullPage: true });
  screenshots++;
  assert.deepEqual(errors, []);
  process.stdout.write(JSON.stringify({ ok: true, screenshots, runtimeErrors: 0, overflow: false, authResponses: "mocked only", authHandoff: true, duplicateSubmitGuard: true, reducedMotion: true }));
} finally { await browser.close(); }
