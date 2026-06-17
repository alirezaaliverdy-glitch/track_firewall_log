import type { NormalizedLog } from "@/types/log";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Coverage fraction (0–1) for a single field. */
export type FieldCoverage = {
  field: string;
  /** Fraction of logs (0–1) where this field is present. */
  coverage: number;
  /** Human-readable percentage, e.g. "87%" */
  label: string;
};

export type DataQualityResult = {
  /**
   * Overall quality score from 0 to 100.
   * Weighted average of critical-field coverage, rounded to nearest integer.
   */
  score: number;
  /** Per-field coverage stats for all tracked fields. */
  fields: FieldCoverage[];
  /**
   * Names of critical fields that are entirely absent (coverage === 0).
   * Used to surface warnings in the UI before running detections.
   */
  missingCriticalFields: string[];
  /**
   * True when srcIp or dstIp is missing from all rows.
   * IP-based detections will not be available.
   */
  ipDetectionsLimited: boolean;
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Fields we track coverage for. */
const TRACKED_FIELDS: Array<keyof NormalizedLog> = [
  "timestamp",
  "action",
  "srcIp",
  "dstIp",
  "srcPort",
  "dstPort",
  "protocol",
  "bytes",
  "packets",
];

/**
 * Critical fields — their absence is flagged as a warning.
 * Weighted equally for the overall score.
 */
const CRITICAL_FIELDS: Array<keyof NormalizedLog> = [
  "action",
  "dstPort",
  "srcIp",
  "dstIp",
  "timestamp",
  "protocol",
];

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Calculate data quality metrics for a set of normalized logs.
 *
 * Score calculation:
 *   - Only critical fields contribute to the score.
 *   - Each critical field is weighted equally.
 *   - Score = average coverage of critical fields × 100, rounded.
 *
 * An empty log array returns a zero score with all fields missing.
 */
export function getDataQuality(logs: NormalizedLog[]): DataQualityResult {
  if (logs.length === 0) {
    const fields: FieldCoverage[] = TRACKED_FIELDS.map((f) => ({
      field: f as string,
      coverage: 0,
      label: "0%",
    }));
    return {
      score: 0,
      fields,
      missingCriticalFields: CRITICAL_FIELDS.map((f) => f as string),
      ipDetectionsLimited: true,
    };
  }

  const total = logs.length;

  // Count rows where each field is present (not undefined)
  const presentCount = new Map<string, number>();
  for (const field of TRACKED_FIELDS) {
    presentCount.set(field as string, 0);
  }

  for (const log of logs) {
    for (const field of TRACKED_FIELDS) {
      if (log[field] !== undefined) {
        const key = field as string;
        presentCount.set(key, (presentCount.get(key) ?? 0) + 1);
      }
    }
  }

  // Build per-field coverage objects
  const fields: FieldCoverage[] = TRACKED_FIELDS.map((field) => {
    const key = field as string;
    const count = presentCount.get(key) ?? 0;
    const coverage = count / total;
    const pct = Math.round(coverage * 100);
    return { field: key, coverage, label: `${pct}%` };
  });

  // Score = mean coverage of critical fields
  const criticalCoverages = CRITICAL_FIELDS.map((field) => {
    const count = presentCount.get(field as string) ?? 0;
    return count / total;
  });
  const avgCritical =
    criticalCoverages.reduce((sum, c) => sum + c, 0) / criticalCoverages.length;
  const score = Math.round(avgCritical * 100);

  // Missing critical = coverage of 0
  const missingCriticalFields = CRITICAL_FIELDS.filter((field) => {
    const count = presentCount.get(field as string) ?? 0;
    return count === 0;
  }).map((f) => f as string);

  // IP detection limitation
  const srcIpCount  = presentCount.get("srcIp")  ?? 0;
  const dstIpCount  = presentCount.get("dstIp")  ?? 0;
  const ipDetectionsLimited = srcIpCount === 0 || dstIpCount === 0;

  return { score, fields, missingCriticalFields, ipDetectionsLimited };
}
