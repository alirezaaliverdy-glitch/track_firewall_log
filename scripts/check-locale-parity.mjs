import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const locales = ["en", "fa"];

function flatten(value, prefix = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, nested]) => flatten(nested, prefix ? `${prefix}.${key}` : key));
}

const keysets = Object.fromEntries(locales.map((locale) => {
  const path = resolve(root, "src", "i18n", "locales", locale, "common.json");
  return [locale, new Set(flatten(JSON.parse(readFileSync(path, "utf8"))))];
}));

let failed = false;
for (const locale of locales) {
  const others = locales.filter((item) => item !== locale);
  for (const other of others) {
    const missing = [...keysets[other]].filter((key) => !keysets[locale].has(key));
    if (missing.length) {
      failed = true;
      console.error(`${locale} is missing keys present in ${other}:`);
      for (const key of missing) console.error(`  ${key}`);
    }
  }
}

if (failed) process.exit(1);
console.log(`Locale key parity OK (${[...keysets.en].length} keys).`);
