import type { AnalysisResult, FirewallTypeSelection } from "./types.js";
import { importFirewallFile } from "./importer.js";
import { normalizeLogs } from "./normalizer.js";
import { enrichLogsWithTrafficDirection } from "./trafficDirection.js";
import { enrichLogsWithAssetIntelligence } from "./assetIntelligence.js";
import { buildLogProfile } from "./logProfile.js";
import { buildPolicyReview } from "./policyIntelligence.js";
import { buildSensitivePortsSummary, buildSummary, buildTrafficIntelligence } from "./analytics.js";
import { runDetections } from "./detections.js";

export async function analyzeFirewallFile(input: {
  filePath: string;
  fileName: string;
  selectedVendor?: string;
}): Promise<AnalysisResult> {
  const imported = await importFirewallFile(input.filePath, input.fileName);

  if (imported.rows.length === 0) {
    const warning = imported.warnings[0]?.message;
    throw new Error(warning ?? "No valid firewall log rows were found.");
  }

  const normalized = enrichLogsWithAssetIntelligence(enrichLogsWithTrafficDirection(normalizeLogs(imported.rows)));
  const selectedVendor = (input.selectedVendor ?? "auto") as FirewallTypeSelection;
  const logProfile = {
    ...buildLogProfile(imported.rows, normalized, selectedVendor),
    detectedFormat: imported.detectedFileType
  };

  return {
    summary: buildSummary(normalized),
    logProfile,
    trafficIntelligence: buildTrafficIntelligence(normalized),
    sensitivePorts: buildSensitivePortsSummary(normalized),
    policyReview: buildPolicyReview(normalized),
    findings: runDetections(normalized),
    normalizedLogs: normalized,
    parseWarnings: imported.warnings,
    rowCount: normalized.length
  };
}

export type * from "./types.js";
