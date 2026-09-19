import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "dist");
const port = Number.parseInt(process.env.FRONTEND_SMOKE_PORT ?? "4177", 10);
const baseUrl = `http://127.0.0.1:${port}`;
const require = createRequire(import.meta.url);
const vitePackageJson = require.resolve("vite/package.json");
const viteBin = join(dirname(vitePackageJson), "bin", "vite.js");

function fail(message) {
  throw new Error(`[frontend-smoke] ${message}`);
}

async function fetchText(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  if (!response.ok) fail(`${pathname} returned ${response.status}`);
  return response.text();
}

async function waitForPreview() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.ok) return;
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  fail("Vite preview did not become ready");
}

async function verifyAssetReferences(indexHtml) {
  const assetPaths = [...indexHtml.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)]
    .map((match) => match[1])
    .filter((value, index, values) => values.indexOf(value) === index);

  if (!assetPaths.some((assetPath) => assetPath.endsWith(".js"))) fail("index.html does not reference a JavaScript entry asset");
  if (!assetPaths.some((assetPath) => assetPath.endsWith(".css"))) fail("index.html does not reference a CSS asset");

  for (const assetPath of assetPaths) {
    const response = await fetch(`${baseUrl}${assetPath}`);
    if (!response.ok) fail(`${assetPath} returned ${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (assetPath.endsWith(".js") && !contentType.includes("javascript")) fail(`${assetPath} was not served as JavaScript`);
    if (assetPath.endsWith(".css") && !contentType.includes("css")) fail(`${assetPath} was not served as CSS`);
  }
}

async function verifyAuthEntrypointsBundled() {
  const files = await readdir(join(distDir, "assets"));
  const javascriptFiles = files.filter((file) => file.endsWith(".js"));
  const bundledText = (await Promise.all(javascriptFiles.map((file) => readFile(join(distDir, "assets", file), "utf8")))).join("\n");
  if (!bundledText.includes("/auth/session-status")) fail("auth session-status endpoint is not present in the production bundle");
  if (!bundledText.includes("/auth/login")) fail("auth login endpoint is not present in the production bundle");
}

async function main() {
  const preview = spawn(process.execPath, [viteBin, "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: root,
    env: { ...process.env, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  preview.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  preview.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  try {
    await waitForPreview();

    const indexHtml = await fetchText("/");
    if (!indexHtml.includes('id="root"')) fail("application root element is missing");
    await verifyAssetReferences(indexHtml);

    const routes = ["/login", "/dashboard", "/actions", "/assets/devices", "/assistant"];
    for (const route of routes) {
      const html = await fetchText(route);
      if (!html.includes('id="root"')) fail(`${route} did not return the app shell`);
    }

    await verifyAuthEntrypointsBundled();
    console.log(JSON.stringify({ ok: true, checkedRoutes: routes.length + 1, baseUrl }));
  } catch (error) {
    console.error(output.trim());
    throw error;
  } finally {
    preview.kill();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
