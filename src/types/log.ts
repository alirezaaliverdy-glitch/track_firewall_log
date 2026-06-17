/**
 * Represents a single raw row parsed from a CSV file.
 * All values are kept as-is from PapaParse; nothing is coerced here.
 * Treat every value as untrusted input.
 */
export type RawLogRow = Record<string, string | number | boolean | null | undefined>;
