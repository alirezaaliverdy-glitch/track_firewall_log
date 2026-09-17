import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (relative: string) => readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");

test("Phase G centralizes web API transport and keeps auth cookie flow isolated", () => {
  const transport = read("src/lib/apiTransport.ts");
  const auth = read("src/lib/auth.ts");
  const csrf = read("src/lib/csrfFetch.ts");

  assert.match(transport, /export const API_BASE_URL/);
  assert.match(transport, /VITE_API_BASE_URL/);
  assert.match(transport, /\/firewall-api/);
  assert.match(transport, /export type ApiTransport/);
  assert.match(transport, /webCookieTransport/);
  assert.match(transport, /credentials: "include"/);
  assert.match(transport, /apiRequest/);
  assert.doesNotMatch(transport, /localhost|127\.0\.0\.1/);

  assert.match(auth, /import \{ apiRequest \} from "\.\/apiTransport"/);
  assert.doesNotMatch(auth, /VITE_API_BASE_URL|API_BASE_URL/);
  assert.match(csrf, /from "\.\/apiTransport"/);
  assert.doesNotMatch(csrf, /const API_BASE_URL/);
});

test("Phase G adds safe mobile storage, push readiness, and deep-link navigation boundaries", () => {
  const storage = read("src/lib/mobileStorage.ts");
  const push = read("src/lib/pushNotifications.ts");
  const deepLinks = read("src/lib/deepLinks.ts");
  const app = read("src/App.tsx");

  assert.match(storage, /MOBILE_STORAGE_NAMESPACE = "firewall\.mobile\."/);
  assert.match(storage, /SENSITIVE_KEY_PARTS/);
  assert.match(storage, /unsafe_mobile_storage_key/);
  assert.match(storage, /MobilePreferenceKey = "locale" \| "sidebarCollapsed" \| "lastRoute" \| "theme"/);
  assert.doesNotMatch(storage, /sessionStorage|indexedDB/);

  assert.match(push, /getPushReadiness/);
  assert.match(push, /PushManager/);
  assert.match(push, /Notification\.requestPermission/);
  assert.doesNotMatch(push, /subscribe\(|localStorage|sessionStorage|indexedDB/);

  assert.match(deepLinks, /SAFE_APP_ROUTE_PREFIXES/);
  assert.match(deepLinks, /javascript\|data\|file\|blob/);
  assert.match(deepLinks, /url\.origin !== window\.location\.origin/);
  assert.match(app, /normalizeAppDeepLink/);
  assert.match(app, /navigate\(normalizeAppDeepLink\(to\)\)/);
});

test("Phase G PWA artifacts support installability, updates, offline shell, and read-only API cache only", () => {
  const manifest = JSON.parse(read("public/manifest.webmanifest")) as {
    name?: string;
    lang?: string;
    dir?: string;
    display?: string;
    display_override?: string[];
    prefer_related_applications?: boolean;
  };
  const worker = read("public/sw.js");
  const registration = read("src/lib/pwa.ts");

  assert.match(manifest.name ?? "", /Firewall Log Analyzer/);
  assert.match(manifest.name ?? "", /مرکز فرمان فایروال/);
  assert.equal(manifest.lang, "fa");
  assert.equal(manifest.dir, "auto");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.display_override?.includes("standalone"));
  assert.equal(manifest.prefer_related_applications, false);

  assert.match(registration, /import\.meta\.env\.PROD/);
  assert.match(registration, /VITE_ENABLE_PWA/);
  assert.match(registration, /updatefound/);
  assert.match(registration, /app:pwa-update/);
  assert.match(registration, /app:pwa-ready/);

  assert.match(worker, /SAFE_API_CACHE_PATHS/);
  assert.match(worker, /UNSAFE_API_CACHE_PATHS/);
  assert.match(worker, /sanitizeForOfflineCache/);
  assert.match(worker, /X-Offline-Readonly/);
  assert.match(worker, /OFFLINE_MUTATION_BLOCKED/);
  assert.match(worker, /event\.respondWith\(fetch\(request\)\)/);
  assert.doesNotMatch(worker, /periodicSync|backgroundSync|queue|replay/i);
  assert.doesNotMatch(worker, /action-center\/.+(?:execute|approve|confirm)/i);
});

test("Phase G Capacitor foundation remains compatible with generated native projects", () => {
  const root = new URL("../../", import.meta.url);
  const packageJson = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };
  const capacitor = read("capacitor.config.ts");

  assert.ok(existsSync(new URL("capacitor.config.ts", root)));
  assert.match(capacitor, /appId: "com\.firewallsoar\.app"/);
  assert.match(capacitor, /webDir: "dist"/);
  assert.match(capacitor, /androidScheme: "https"/);
  assert.equal(packageJson.scripts?.["mobile:build:web"], "npm run build");
  assert.equal(packageJson.scripts?.["mobile:sync"], "npx cap sync");
  assert.equal(packageJson.scripts?.["mobile:open:android"], "npx cap open android");
  assert.equal(packageJson.scripts?.["mobile:open:ios"], "npx cap open ios");
  assert.equal(existsSync(new URL("android/gradlew.bat", root)), true);
  assert.equal(existsSync(new URL("ios/App/App.xcodeproj/project.pbxproj", root)), true);
});

test("Phase G production readiness keeps secrets out of compose defaults and runs backend as non-root", () => {
  const compose = read("docker-compose.firewall.yml");
  const backendDockerfile = read("backend/Dockerfile");
  const rootDockerignore = read(".dockerignore");
  const backendDockerignore = read("backend/.dockerignore");

  assert.match(compose, /DATABASE_URL: \$\{DATABASE_URL:\?Set DATABASE_URL in \.env\}/);
  assert.match(compose, /CREDENTIAL_ENCRYPTION_KEY: \$\{CREDENTIAL_ENCRYPTION_KEY:\?Set CREDENTIAL_ENCRYPTION_KEY in \.env\}/);
  assert.match(compose, /AUTH_SESSION_SECRET: \$\{AUTH_SESSION_SECRET:\?Set AUTH_SESSION_SECRET in \.env\}/);
  assert.doesNotMatch(compose, /firewall-db:[\s\S]*ports:/);
  assert.match(compose, /condition: service_healthy/);
  assert.match(compose, /healthcheck:/);
  assert.match(backendDockerfile, /USER node/);
  assert.match(rootDockerignore, /\.env/);
  assert.match(rootDockerignore, /node_modules/);
  assert.match(rootDockerignore, /dist/);
  assert.match(backendDockerignore, /\.env/);
  assert.match(backendDockerignore, /storage/);
});
