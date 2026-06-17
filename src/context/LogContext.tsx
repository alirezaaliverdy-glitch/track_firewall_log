import {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";
import { logData } from "@/lib/logData";
import { normalizeLogs } from "@/lib/normalizer";
import { buildSummary, type LogSummary } from "@/lib/analytics";
import { getDataQuality, type DataQualityResult } from "@/lib/dataQuality";
import type { RawLogRow, NormalizedLog } from "@/types/log";

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

export type LogContextType = {
  // --- Raw layer ---
  rawData: RawLogRow[];
  /** Replace the entire dataset with freshly parsed CSV rows. */
  setRawData: (rows: RawLogRow[]) => void;
  /** Reset back to the built-in seed data. */
  resetData: () => void;

  // --- Normalized layer ---
  /** All rows after normalization — one NormalizedLog per raw row. */
  logs: NormalizedLog[];
  /** Normalized rows that pass the current search filter. */
  filteredLogs: NormalizedLog[];

  // --- Legacy compatibility: raw rows of filteredLogs, for LogTable / LogChart ---
  filteredData: RawLogRow[];

  // --- Search ---
  search: string;
  setSearch: (s: string) => void;

  // --- Analytics ---
  summary: LogSummary;
  dataQuality: DataQualityResult;

  // --- Legacy: kept so CsvUploader compiles without a change ---
  setData: (rows: RawLogRow[]) => void;
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const LogContext = createContext<LogContextType | undefined>(undefined);

export function useLogContext(): LogContextType {
  const ctx = useContext(LogContext);
  if (!ctx) throw new Error("useLogContext must be used within LogProvider");
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function LogProvider({ children }: { children: ReactNode }) {
  const [rawData, setRawDataState] = useState<RawLogRow[]>(logData);
  const [search, setSearch] = useState("");

  // Stable setter — replaces dataset and clears search
  const setRawData = useCallback((rows: RawLogRow[]) => {
    setRawDataState(rows);
    setSearch("");
  }, []);

  // Alias kept for CsvUploader (which still calls setData)
  const setData = setRawData;

  const resetData = useCallback(() => {
    setRawDataState(logData);
    setSearch("");
  }, []);

  // --- Normalized logs (derived from rawData) ---
  const logs = useMemo(() => normalizeLogs(rawData), [rawData]);

  // --- Search filter applied to normalized logs ---
  const filteredLogs = useMemo(() => {
    if (!search) return logs;
    const term = search.toLowerCase();

    return logs.filter((log) => {
      // 1. Check every normalized field (string / number / undefined)
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

      if (
        normalizedFields.some(
          (v) => v !== undefined && String(v).toLowerCase().includes(term)
        )
      ) {
        return true;
      }

      // 2. Fall back to scanning the original raw row
      return Object.values(log.raw).some((v) =>
        String(v ?? "").toLowerCase().includes(term)
      );
    });
  }, [logs, search]);

  // --- Legacy: raw rows of the filtered set (for LogTable and LogChart) ---
  const filteredData = useMemo(
    () => filteredLogs.map((l) => l.raw),
    [filteredLogs]
  );

  // --- Summary analytics (runs on ALL normalized logs, not just filtered) ---
  const summary = useMemo(() => buildSummary(logs), [logs]);

  // --- Data quality (runs on ALL normalized logs) ---
  const dataQuality = useMemo(() => getDataQuality(logs), [logs]);

  return (
    <LogContext.Provider
      value={{
        rawData,
        setRawData,
        resetData,
        logs,
        filteredLogs,
        filteredData,
        search,
        setSearch,
        summary,
        dataQuality,
        setData,
      }}
    >
      {children}
    </LogContext.Provider>
  );
}
