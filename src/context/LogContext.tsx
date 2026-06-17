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
import { buildSummary, type LogSummary } from "@/lib/analytics";
import { getDataQuality, type DataQualityResult } from "@/lib/dataQuality";
import { runDetections } from "@/lib/detections";
import { calculateHygieneScore } from "@/lib/scoring";
import {
  detectColumnMapping,
  getMappingConfidence,
  getMissingImportantMappings,
} from "@/lib/columnMapping";
import type { RawLogRow, NormalizedLog, FirewallVendor } from "@/types/log";
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
  filteredLogs: NormalizedLog[];

  // --- Legacy compatibility (LogTable / LogChart still reference this) ---
  filteredData: RawLogRow[];

  // --- Search ---
  search: string;
  setSearch: (s: string) => void;

  // --- Column mapping ---
  columnMapping: ColumnMapping;
  setColumnMapping: (m: ColumnMapping) => void;
  /** Raw CSV headers extracted from the current rawData */
  csvHeaders: string[];
  vendorPreset: FirewallVendor;
  setVendorPreset: (v: FirewallVendor) => void;
  mappingConfidence: MappingConfidence;
  missingMappings: MappableField[];

  // --- Analytics ---
  summary: LogSummary;
  dataQuality: DataQualityResult;

  // --- Security ---
  findings: Finding[];
  hygieneScore: number;

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

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function LogProvider({ children }: { children: ReactNode }) {
  const [rawData, setRawDataState] = useState<RawLogRow[]>(logData);
  const [search, setSearch] = useState("");

  // Derive initial mapping from seed data
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
    // Auto-detect mapping and vendor from the new data
    const headers = headersFromRows(rows);
    setColumnMapping(detectColumnMapping(headers));
    if (rows.length > 0) setVendorPreset(detectVendor(rows[0]));
  }, []);

  const setData = setRawData; // legacy alias

  const resetData = useCallback(() => {
    setRawDataState(logData);
    setSearch("");
    setColumnMapping(detectColumnMapping(headersFromRows(logData)));
    setVendorPreset(logData.length > 0 ? detectVendor(logData[0]) : "generic");
  }, []);

  // ---- Derived: CSV headers (memoized) ----
  const csvHeaders = useMemo(() => headersFromRows(rawData), [rawData]);

  // ---- Normalized logs (mapping-aware) ----
  const logs = useMemo(
    () => normalizeLogsWithMapping(rawData, columnMapping, vendorPreset),
    [rawData, columnMapping, vendorPreset]
  );

  // ---- Mapping confidence / missing fields ----
  const mappingConfidence = useMemo(
    () => getMappingConfidence(columnMapping),
    [columnMapping]
  );

  const missingMappings = useMemo(
    () => getMissingImportantMappings(columnMapping),
    [columnMapping]
  );

  // ---- Filtered logs (search) ----
  const filteredLogs = useMemo(() => {
    if (!search) return logs;
    const term = search.toLowerCase();
    return logs.filter((log) => {
      const normalizedFields: unknown[] = [
        log.timestamp, log.date, log.time,
        log.action, log.protocol,
        log.srcIp, log.dstIp,
        log.srcPort, log.dstPort,
        log.natSrcPort, log.natDstPort,
        log.bytes, log.bytesSent, log.bytesReceived,
        log.packets, log.packetsSent, log.packetsReceived,
        log.service, log.application,
        log.ruleName, log.user, log.message,
        log.vendor,
      ];
      if (normalizedFields.some((v) => v !== undefined && String(v).toLowerCase().includes(term))) {
        return true;
      }
      return Object.values(log.raw).some((v) =>
        String(v ?? "").toLowerCase().includes(term)
      );
    });
  }, [logs, search]);

  // ---- Legacy compat ----
  const filteredData = useMemo(() => filteredLogs.map((l) => l.raw), [filteredLogs]);

  // ---- Analytics ----
  const summary      = useMemo(() => buildSummary(logs), [logs]);
  const dataQuality  = useMemo(() => getDataQuality(logs), [logs]);
  const findings     = useMemo(() => runDetections(logs), [logs]);
  const hygieneScore = useMemo(
    () => calculateHygieneScore(findings, dataQuality),
    [findings, dataQuality]
  );

  return (
    <LogContext.Provider
      value={{
        rawData, setRawData, resetData,
        logs, filteredLogs, filteredData,
        search, setSearch,
        columnMapping, setColumnMapping,
        csvHeaders,
        vendorPreset, setVendorPreset,
        mappingConfidence, missingMappings,
        summary, dataQuality,
        findings, hygieneScore,
        setData,
      }}
    >
      {children}
    </LogContext.Provider>
  );
}
