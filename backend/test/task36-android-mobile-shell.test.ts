import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const target = path.join(directory, name);
    if (statSync(target).isDirectory()) return sourceFiles(target);
    return /\.(ts|tsx)$/.test(name) ? [target] : [];
  });
}

test("all frontend API clients use the native-aware central server URL", () => {
  const srcRoot = path.join(root, "src");
  const offenders = sourceFiles(srcRoot)
    .filter((file) => !file.endsWith(path.join("config", "frontendEnv.ts")))
    .filter((file) => readFileSync(file, "utf8").includes("VITE_API_BASE_URL"))
    .map((file) => path.relative(root, file));

  assert.deepEqual(offenders, []);
  assert.match(read("src/config/frontendEnv.ts"), /nativeServerUrl \?\? import\.meta\.env\.VITE_API_BASE_URL/);
  assert.match(read("src/lib/productState.ts"), /import \{ API_BASE_URL \} from "@\/config\/frontendEnv"/);
});

test("Android login and navigation stay inside the phone viewport", () => {
  const login = read("src/components/auth/LoginPage.tsx");
  const shell = read("src/components/layout/AppShell.tsx");
  const loginCss = read("src/App.css");
  const navigationCss = read("src/components/layout/AppShellNavigation.css");

  assert.match(login, /password\.length < 6/);
  assert.match(login, /autoFocus=\{!isNativeAndroid\}/);
  assert.match(login, /login-scene--native/);
  assert.doesNotMatch(loginCss, /1000px #06111e inset/);
  assert.match(loginCss, /\.login-field input \{ width: 0;[^}]*flex: 1 1 0/);
  assert.match(shell, /\(!collapsed \|\| mobileNavOpen\) && group\.items\.length > 1/);
  assert.match(shell, /accountMenuRef\.current\?\.removeAttribute\("open"\)/);
  assert.match(navigationCss, /\.platform-sidebar\.is-mobile-open \{ display: flex; width: min\(88vw, 320px\)/);
  assert.match(shell, /const fallbackNavigation: ProductNavigationGroup\[\]/);
  assert.match(shell, /visibleNavigation\.find/);
  assert.match(shell, /window\.setTimeout\(loadNavigation, 10_000\)/);
  assert.match(read("src/components/layout/MobileShell.css"), /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(read("src/components/auth/NativeLoginStability.css"), /place-items: start center/);
  assert.match(read("android/app/src/main/AndroidManifest.xml"), /android:windowSoftInputMode="adjustResize"/);
});
