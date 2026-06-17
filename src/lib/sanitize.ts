/**
 * CSV cell sanitization — protects against CSV Formula Injection.
 *
 * Spreadsheet applications (Excel, LibreOffice, Google Sheets) will execute
 * cell content that starts with = + - @ as a formula. Prefixing with a single
 * quote neutralises this: the quote is consumed by the spreadsheet as a
 * "text prefix" indicator and the cell is treated as a plain string.
 *
 * Security requirements:
 *   - Never use eval.
 *   - Never use dangerouslySetInnerHTML.
 *   - Treat all values as untrusted input.
 *   - Never send values to a server.
 */

/** Characters that trigger formula execution in spreadsheet applications. */
const FORMULA_TRIGGER_CHARS = new Set(["=", "+", "-", "@"]);

/**
 * Convert any raw CSV field value to a safe, export-ready string.
 *
 * Steps:
 * 1. Coerce null / undefined / boolean / number to string.
 * 2. If the result starts with a formula-injection character, prefix with `'`.
 * 3. Wrap in double-quotes and escape any internal double-quotes with `""`.
 *
 * The returned string is always RFC 4180-safe and injection-free.
 */
export function sanitizeCsvCell(value: unknown): string {
  // Step 1 — coerce to string, treating null/undefined as empty
  let str: string;
  if (value === null || value === undefined) {
    str = "";
  } else if (typeof value === "boolean") {
    str = value ? "true" : "false";
  } else {
    str = String(value);
  }

  // Step 2 — neutralise formula injection
  if (str.length > 0 && FORMULA_TRIGGER_CHARS.has(str[0])) {
    str = "'" + str;
  }

  // Step 3 — RFC 4180 quoting: wrap in double-quotes, escape internal quotes
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}
