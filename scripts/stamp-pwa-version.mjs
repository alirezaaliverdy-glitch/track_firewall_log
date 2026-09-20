import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(projectRoot, "dist");
const swPath = path.join(distRoot, "sw.js");
const indexPath = path.join(distRoot, "index.html");

const [serviceWorker, indexHtml, assetNames] = await Promise.all([
  readFile(swPath, "utf8"),
  readFile(indexPath),
  readdir(path.join(distRoot, "assets"))
]);

const buildFingerprint = createHash("sha256")
  .update(indexHtml)
  .update(assetNames.sort().join("\n"))
  .digest("hex")
  .slice(0, 16);
const cacheVersion = `firewall-ui-${buildFingerprint}`;
const stamped = serviceWorker.replaceAll("__FIREWALL_PWA_VERSION__", cacheVersion);

if (stamped === serviceWorker) {
  throw new Error("PWA service worker placeholder was not found.");
}

await writeFile(swPath, stamped, "utf8");
console.log(`[pwa] stamped service worker cache version: ${cacheVersion}`);
