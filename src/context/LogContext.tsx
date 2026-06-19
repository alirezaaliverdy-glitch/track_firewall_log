import {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";
import { logData } from "@/lib/logData";
import { normalizeLogsWithMapping, detectVendor } from "@/lib/normalizer";
import { enrichLogsWithTrafficDirection } from "@/lib/trafficDirection";
import { enrichLogsWithAssetIntelligence } from "@/lib/assetIntelligence";
import { buildSummary, type LogSummary } from "@/lib/analytics";
import { getDataQuality, type DataQualityResult } from "@/lib/dataQuality";
import { runDetections } from "@/lib/detections";
import { calculateHygieneScore } from "@/lib/scoring";
import {
  detectColumnMapping,
  getMappingConfidence,
  getMissingImportantMappings,
} from "@/lib/columnMapping";
import { getVendorPreset } from "@/lib/vendorPresets";
import { buildLogProfile } from "@/lib/logProfile";
import type {
  RawLogRow,
  NormalizedLog,
  FirewallVendor,
  FirewallTypeSelection,
} from "@/types/log";
import type { LogProfile } from "@/types/logProfile";
import type { Finding } from "@/types/finding";
import type {
  ColumnMapping,
  MappingConfidence,
  MappableField,
} from "@/types/mapping";

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

export type LogContextType = {
  // --- Raw layer ---
  rawData: RawLogRow[];
  setRawData: (rows: RawLogRow[]) => void;
  resetData: () => void;

  // --- Normalized layer ---
  logs: NormalizedLog[];
  /** Filtered by search; if a finding is selected this equals evidenceLogs
   *  further filtered by search. */
  filteredLogs: NormalizedLog[];

  // --- Legacy compatibility ---
  filteredData: RawLogRow[];

  // --- Search ---
  search: string;
  setSearch: (s: string) => void;

  // --- Column mapping ---
  columnMapping: ColumnMapping;
  setColumnMapping: (m: ColumnMapping) => void;
  csvHeaders: string[];
  firewallType: FirewallTypeSelection;
  setFirewallType: (v: FirewallTypeSelection) => void;
  vendorPreset: FirewallVendor;
  setVendorPreset: (v: FirewallVendor) => void;
  detectedVendor: FirewallVendor; // Added for convenience
  mappingConfidence: MappingConfidence;
  missingMappings: MappableField[];

  // --- Analytics ---
  summary: LogSummary;
  dataQuality: DataQualityResult;
  logProfile: LogProfile;

  // --- Security findings ---
  findings: Finding[];
  hygieneScore: number;

  // --- Finding drilldown (Task 9) ---
  selectedFindingId: string | null;
  setSelectedFindingId: (id: string | null) => void;
  clearSelectedFinding: () => void;
  selectedFinding: Finding | null;
  /** Related logs for the selected finding; empty array when none selected. */
  evidenceLogs: NormalizedLog[];
  /**
   * The log set the table should display.
   * When no finding is selected → filteredLogs (search applied to all logs).
   * When a finding is selected  → evidence logs further filtered by search.
   */
  activeTableLogs: NormalizedLog[];

  // --- Legacy alias ---
  setData: (rows: RawLogRow[]) => void;
};

// ---------------------------------------------------------------------------
// Context instance
// ---------------------------------------------------------------------------

const LogContext = createContext<LogContextType | undefined>(undefined);

export function useLogContext(): LogContextType {
  const ctx = useContext(LogContext);
  if (!ctx) throw new Error("useLogContext must be used within LogProvider");
  return ctx;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function headersFromRows(rows: RawLogRow[]): string[] {
  if (rows.length === 0) return [];
  return Object.keys(rows[0]);
}

function applySearch(logs: NormalizedLog[], term: string): NormalizedLog[] {
  if (!term) return logs;
  const lower = term.toLowerCase();
  return logs.filter((log) => {
    const fields: unknown[] = [
      log.timestamp, log.date, log.time,
      log.action, log.protocol,
      log.srcIp, log.dstIp,
      log.srcPort, log.dstPort,
      log.natSrcPort, log.natDstPort,
      log.bytes, log.bytesSent, log.bytesReceived,
      log.packets, log.packetsSent, log.packetsReceived,
      log.service, log.application,
      log.ruleName, log.policyId, log.policyName, log.ruleDisplayName,
      log.user, log.message,
      log.vendor,
      log.srcIpCategory, log.dstIpCategory,
      log.trafficDirection, log.serviceCategory,
    ];
    if (fields.some((v) => v !== undefined && String(v).toLowerCase().includes(lower))) {
      return true;
    }
    return Object.values(log.raw).some((v) =>
      String(v ?? "").toLowerCase().includes(lower)
    );
  });
}

function mappingForRows(rows: RawLogRow[], firewallType: FirewallTypeSelection): ColumnMapping {
  const headers = headersFromRows(rows);
  const detectedMapping = detectColumnMapping(headers);
  if (firewallType === "auto") return detectedMapping;

  const preset = getVendorPreset(firewallType);
  return preset ? { ...detectedMapping, ...preset.mapping } : detectedMapping;
}

function vendorForRows(rows: RawLogRow[], firewallType: FirewallTypeSelection): FirewallVendor {
  if (firewallType !== "auto") return firewallType;
  return rows.length > 0 ? detectVendor(rows[0]) : "generic";
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function LogProvider({ children }: { children: ReactNode }) {
  const [rawData, setRawDataState] = useState<RawLogRow[]>(logData);
  const [search, setSearch] = useState("");
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [firewallType, setFirewallTypeState] = useState<FirewallTypeSelection>("auto");

  const [columnMapping, setColumnMapping] = useState<ColumnMapping>(() =>
    detectColumnMapping(headersFromRows(logData))
  );
  const [vendorPreset, setVendorPreset] = useState<FirewallVendor>(() =>
    logData.length > 0 ? detectVendor(logData[0]) : "generic"
  );

  // ---- Setters ----

  const setRawData = useCallback((rows: RawLogRow[]) => {
    setRawDataState(rows);
    setSearch("");
    setSelectedFindingId(null);
    setColumnMapping(mappingForRows(rows, firewallType));
    setVendorPreset(vendorForRows(rows, firewallType));
  }, [firewallType]);

  const setFirewallType = useCallback((nextType: FirewallTypeSelection) => {
    setFirewallTypeState(nextType);
    setSelectedFindingId(null);
    setColumnMapping(mappingForRows(rawData, nextType));
    setVendorPreset(vendorForRows(rawData, nextType));
  }, [rawData]);

  const setData = setRawData;

  const resetData = useCallback(() => {
    setRawDataState(logData);
    setSearch("");
    setSelectedFindingId(null);
    setColumnMapping(mappingForRows(logData, firewallType));
    setVendorPreset(vendorForRows(logData, firewallType));
  }, [firewallType]);

  const clearSelectedFinding = useCallback(() => {
    setSelectedFindingId(null);
  }, []);

  // ---- Derived ----

  const csvHeaders = useMemo(() => headersFromRows(rawData), [rawData]);

  const logs = useMemo(() => {
    const normalized = normalizeLogsWithMapping(rawData, columnMapping, vendorPreset);
    return enrichLogsWithAssetIntelligence(enrichLogsWithTrafficDirection(normalized));
  }, [rawData, columnMapping, vendorPreset]);

  const mappingConfidence = useMemo(
    () => getMappingConfidence(columnMapping),
    [columnMapping]
  );

  const missingMappings = useMemo(
    () => getMissingImportantMappings(columnMapping),
    [columnMapping]
  );

  const summary      = useMemo(() => buildSummary(logs), [logs]);
  const dataQuality  = useMemo(() => getDataQuality(logs), [logs]);
  const logProfile   = useMemo(
    () => buildLogProfile(rawData, logs, firewallType),
    [rawData, logs, firewallType]
  );
  const findings     = useMemo(() => runDetections(logs), [logs]);
  const hygieneScore = useMemo(
    () => calculateHygieneScore(findings, dataQuality),
    [findings, dataQuality]
  );

  // ---- Finding selection ----

  const selectedFinding = useMemo(
    () => findings.find((f) => f.id === selectedFindingId) ?? null,
    [findings, selectedFindingId]
  );

  const evidenceLogs = useMemo(
    () => selectedFinding?.relatedLogs ?? [],
    [selectedFinding]
  );

  // ---- Filtered logs ----
  // When a finding is selected the base pool is evidenceLogs; otherwise all logs.
  const filteredLogs = useMemo(() => {
    const base = selectedFinding ? evidenceLogs : logs;
    return applySearch(base, search);
  }, [logs, evidenceLogs, selectedFinding, search]);

  const filteredData = useMemo(
    () => filteredLogs.map((l) => l.raw),
    [filteredLogs]
  );

  // activeTableLogs = same as filteredLogs — named alias for table consumers
  const activeTableLogs = filteredLogs;

  return (
    <LogContext.Provider
      value={{
        rawData, setRawData, resetData,
        logs, filteredLogs, filteredData,
        search, setSearch,
        columnMapping, setColumnMapping,
        csvHeaders,
        firewallType, setFirewallType,
        vendorPreset, setVendorPreset, detectedVendor: vendorPreset,
        mappingConfidence, missingMappings,
        summary, dataQuality, logProfile,
        findings, hygieneScore,
        selectedFindingId, setSelectedFindingId,
        clearSelectedFinding,
        selectedFinding, evidenceLogs,
        activeTableLogs,
        setData,
      }}
    >
      {children}
    </LogContext.Provider>
  );
}
