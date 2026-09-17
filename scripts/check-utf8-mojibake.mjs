import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const scanRoots = ["src", "backend/src", "backend/prisma/migrations", "docs"];
const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".mjs",
  ".prisma",
  ".ts",
  ".tsx",
  ".txt"
]);
const mojibakePattern = /Ã|Â|Ø|Ù|Û|â€|ðŸ|�/u;

function shouldSkip(relativePath) {
  return relativePath.startsWith(".git/") ||
    relativePath.startsWith("node_modules/") ||
    relativePath.startsWith("backend/node_modules/") ||
    relativePath.startsWith("dist/") ||
    relativePath.startsWith("backend/dist/") ||
    relativePath.startsWith("docs/evidence/");
}

function walk(directory, files = []) {
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    const relativePath = path.relative(root, fullPath).replace(/\\/g, "/");
    if (shouldSkip(relativePath)) continue;
    if (entry.isDirectory()) walk(fullPath, files);
    else if (textExtensions.has(path.extname(entry.name).toLowerCase())) files.push(fullPath);
  }
  return files;
}

const files = scanRoots.flatMap((scanRoot) => walk(path.join(root, scanRoot)));
for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith(".md")) files.push(path.join(root, entry.name));
}

const failures = [];
for (const file of Array.from(new Set(files))) {
  const bytes = fs.readFileSync(file);
  const relative = path.relative(root, file).replace(/\\/g, "/");
  const rejectsBom = relative.startsWith("src/") || relative.startsWith("backend/src/") || relative.startsWith("backend/prisma/migrations/");
  if (rejectsBom && bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    failures.push(`${relative}:1: UTF-8 BOM is not allowed`);
    continue;
  }
  const content = bytes.toString("utf8");
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (mojibakePattern.test(line)) {
      failures.push(`${path.relative(root, file).replace(/\\/g, "/")}:${index + 1}: ${line.trim()}`);
    }
  });
}

if (failures.length > 0) {
  console.error("Potential mojibake or replacement characters found:");
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`UTF-8/mojibake check passed (${new Set(files).size} files scanned).`);
