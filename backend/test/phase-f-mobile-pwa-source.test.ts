import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relative: string) => readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");

test("Phase F adds installable PWA shell without offline API execution or approval caching", () => {
  const html = read("index.html");
  const manifest = JSON.parse(read("public/manifest.webmanifest")) as {
    display?: string;
    start_url?: string;
    icons?: Array<{ src?: string; purpose?: string }>;
  };
  const worker = read("public/sw.js");
  const registration = read("src/lib/pwa.ts");
  const main = read("src/main.tsx");

  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /name="theme-color"/);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/dashboard");
  assert.ok(manifest.icons?.some((icon) => icon.src === "/pwa-icon.svg"));
  assert.ok(manifest.icons?.some((icon) => icon.purpose === "maskable"));
  assert.match(registration, /navigator\.serviceWorker\.register\("\/sw\.js", \{ scope: "\/" \}\)/);
  assert.match(main, /registerPwaServiceWorker\(\)/);

  assert.match(worker, /const API_PREFIX = "\/firewall-api"/);
  assert.match(worker, /if \(isApi\)/);
  assert.match(worker, /request\.method !== "GET"/);
  assert.match(worker, /OFFLINE_MUTATION_BLOCKED/);
  assert.match(worker, /Network connection is required for approvals, execution/);
  assert.match(worker, /event\.respondWith\(fetch\(request\)\)/);
  assert.doesNotMatch(worker, /cache\.put\(request, copy\)[\s\S]*API_PREFIX/);
  assert.doesNotMatch(worker, /action-center\/.+execute|approve|confirm/);
  assert.doesNotMatch(worker, /password|privateKey|passphrase|apiKey|sshKey|rawCommand/i);
});

test("Phase F keeps phone and tablet routes usable through drawer, bottom nav, offline status, and Action Center sheet", () => {
  const shell = read("src/components/layout/AppShell.tsx");
  const css = read("src/App.css");
  const onlineHook = read("src/lib/useOnlineStatus.ts");

  assert.match(shell, /useOnlineStatus/);
  assert.match(shell, /platform-mobile-menu/);
  assert.match(shell, /aria-controls="platform-primary-navigation"/);
  assert.match(shell, /platform-drawer-scrim/);
  assert.match(shell, /is-mobile-open/);
  assert.match(shell, /platform-offline-banner/);
  assert.match(shell, /shell\.offlineBanner/);
  assert.match(onlineHook, /window\.addEventListener\("online"/);
  assert.match(onlineHook, /window\.addEventListener\("offline"/);

  assert.match(css, /@media \(max-width: 900px\)[\s\S]*platform-sidebar[\s\S]*position: fixed/);
  assert.match(css, /platform-bottom-nav[\s\S]*env\(safe-area-inset-bottom\)/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /action-review-dialog[\s\S]*align-items:end/);
  assert.match(css, /action-review-dialog__card[\s\S]*border-radius:18px 18px 0 0/);
  assert.match(css, /workflow-status-strip[\s\S]*grid-template-columns:repeat\(2/);
  assert.match(css, /@media \(max-width: 420px\)/);
  assert.match(css, /table-shell[\s\S]*overflow: auto/);
});
