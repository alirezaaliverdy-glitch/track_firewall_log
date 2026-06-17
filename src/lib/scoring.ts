import type { Finding } from "@/types/finding";
import type { DataQualityResult } from "@/lib/dataQuality";

// ---------------------------------------------------------------------------
// Deductions per finding severity
// ---------------------------------------------------------------------------

const SEVERITY_DEDUCTION: Record<string, number> = {
  critical: 15,
  high: 8,
  medium: 3,
  low: 1,
  info: 0,
};

// ---------------------------------------------------------------------------
// Deductions for missing critical fields (data quality penalties)
// ---------------------------------------------------------------------------

const FIELD_DEDUCTIONS: Record<string, number> = {
  srcIp:     10,
  dstIp:     10,
  action:    10,
  dstPort:   10,
};

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Calculate a firewall hygiene score from 0 to 100.
 *
 * Starts at 100 and subtracts:
 *   - Per finding: deduction based on severity (critical=15, high=8, medium=3, low=1)
 *   - Per missing critical field in the log data: fixed deduction
 *
 * The result is clamped to [0, 100].
 */
export function calculateHygieneScore(
  findings: Finding[],
  dataQuality: DataQualityResult
): number {
  let score = 100;

  // Deduct for each finding
  for (const finding of findings) {
    score -= SEVERITY_DEDUCTION[finding.severity] ?? 0;
  }

  // Deduct for missing critical fields
  for (const missingField of dataQuality.missingCriticalFields) {
    score -= FIELD_DEDUCTIONS[missingField] ?? 0;
  }

  // Clamp to [0, 100]
  return Math.max(0, Math.min(100, score));
}
