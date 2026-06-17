import type { NormalizedLog } from "./log";

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

export type Severity = "critical" | "high" | "medium" | "low" | "info";

// ---------------------------------------------------------------------------
// Finding
// ---------------------------------------------------------------------------

/**
 * A single security finding produced by the detection engine.
 * Each finding groups one or more related log rows under a human-readable title.
 */
export type Finding = {
  /** Stable identifier for the finding type, e.g. "allowed-risky-service-22" */
  id: string;
  /** Machine-readable category, e.g. "allowed-risky-service" */
  type: string;
  severity: Severity;
  title: string;
  description: string;
  recommendation: string;
  /** Number of log rows that triggered this finding. */
  count: number;
  /** The normalized log rows associated with this finding (capped for performance). */
  relatedLogs: NormalizedLog[];
  /** MITRE ATT&CK tactic, e.g. "Reconnaissance" */
  mitreTactic?: string;
  /** MITRE ATT&CK technique, e.g. "T1046 - Network Service Discovery" */
  mitreTechnique?: string;
};
