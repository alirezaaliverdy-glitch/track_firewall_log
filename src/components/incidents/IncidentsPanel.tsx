import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Eye, Play, RefreshCw, ShieldCheck } from "lucide-react";
import { runDetections, type DetectionRunResult } from "@/lib/detectionApi";
import {
  getIncident,
  getIncidentEvents,
  getIncidents,
  normalizeArray,
  normalizeObject,
  updateIncidentStatus,
  type Incident,
  type IncidentStatus,
} from "@/lib/incidents";
import type { SecurityEvent } from "@/lib/securityEvents";

const STATUSES: IncidentStatus[] = ["open", "investigating", "resolved", "false_positive"];

const safeNumber = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const formatNumber = (value: unknown) => safeNumber(value).toLocaleString();

const formatDateTime = (value: unknown): string => {
  if (!value) return "-";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
};

function severityClass(severity: string) {
  if (severity === "critical") return "border-red-700 bg-red-950/60 text-red-200";
  if (severity === "high") return "border-red-800 bg-red-950/40 text-red-300";
  if (severity === "medium") return "border-yellow-800 bg-yellow-950/40 text-yellow-300";
  return "border-blue-800 bg-blue-950/40 text-blue-200";
}

function statusClass(status: string) {
  if (status === "open") return "border-red-800 bg-red-950/40 text-red-300";
  if (status === "investigating") return "border-yellow-800 bg-yellow-950/40 text-yellow-300";
  if (status === "resolved") return "border-green-800 bg-green-950/40 text-green-300";
  return "border-zinc-700 bg-zinc-950 text-zinc-400";
}

function endpoint(event: SecurityEvent) {
  const src = [event.srcIp, event.srcPort].filter((value) => value !== null && value !== undefined).join(":");
  const dst = [event.dstIp, event.dstPort].filter((value) => value !== null && value !== undefined).join(":");
  return `${src || "-"} -> ${dst || "-"}`;
}

function summaryValue(summary: Record<string, unknown>, key: string) {
  const value = summary[key];
  return value === undefined || value === null || value === "" ? "-" : String(value);
}

export default function IncidentsPanel() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [incidentEvents, setIncidentEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<DetectionRunResult | null>(null);

  const refreshIncidents = useCallback(() => {
    setLoading(true);
    setMessage(null);
    getIncidents()
      .then((nextIncidents) => {
        setIncidents(normalizeArray<Incident>(nextIncidents));
        setLastRefreshedAt(new Date().toISOString());
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Failed to load incidents."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refreshIncidents();
  }, [refreshIncidents]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(refreshIncidents, 10000);
    return () => window.clearInterval(id);
  }, [autoRefresh, refreshIncidents]);

  const runDetectionNow = () => {
    setRunning(true);
    setMessage(null);
    runDetections()
      .then((result) => {
        setRunResult(result);
        refreshIncidents();
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Failed to run detections."))
      .finally(() => setRunning(false));
  };

  const openIncident = (incident: Incident) => {
    setDetailsLoading(true);
    setMessage(null);
    Promise.all([getIncident(incident.id), getIncidentEvents(incident.id)])
      .then(([detail, evidence]) => {
        setSelectedIncident(detail);
        setIncidentEvents(normalizeArray<SecurityEvent>(evidence.events));
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Failed to load incident details."))
      .finally(() => setDetailsLoading(false));
  };

  const changeStatus = (status: IncidentStatus) => {
    if (!selectedIncident) return;
    setDetailsLoading(true);
    updateIncidentStatus(selectedIncident.id, status)
      .then((updated) => {
        setSelectedIncident(updated);
        setIncidents((current) => current.map((incident) => incident.id === updated.id ? updated : incident));
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Failed to update incident status."))
      .finally(() => setDetailsLoading(false));
  };

  const safeIncidents = normalizeArray<Incident>(incidents);
  const safeEvents = normalizeArray<SecurityEvent>(incidentEvents);

  return (
    <section className="mb-4 rounded-lg border border-blue-900/50 bg-slate-950/70 p-4 shadow-[inset_0_1px_0_rgba(59,130,246,0.08)]">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-left text-lg font-semibold text-zinc-100">Incidents</h2>
          <p className="mt-1 text-left text-sm text-zinc-400">
            Deterministic detections from stored security events.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-xs text-zinc-300">
            <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />
            Auto 10s
          </label>
          <button
            type="button"
            onClick={refreshIncidents}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm font-medium text-zinc-300 transition-colors hover:border-blue-700 hover:text-blue-200"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh
          </button>
          <button
            type="button"
            onClick={runDetectionNow}
            disabled={running}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            {running ? "Running" : "Run Detection"}
          </button>
        </div>
      </div>

      <p className="mb-4 text-left text-xs text-zinc-500">Last refreshed: {formatDateTime(lastRefreshedAt)}</p>

      {runResult && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
            <p className="text-xs text-zinc-500">Rules evaluated</p>
            <p className="mt-1 text-xl font-semibold text-blue-100">{formatNumber(runResult.rulesEvaluated)}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
            <p className="text-xs text-zinc-500">Created</p>
            <p className="mt-1 text-xl font-semibold text-red-200">{formatNumber(runResult.incidentsCreated)}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
            <p className="text-xs text-zinc-500">Updated</p>
            <p className="mt-1 text-xl font-semibold text-yellow-200">{formatNumber(runResult.incidentsUpdated)}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
            <p className="text-xs text-zinc-500">Matched events</p>
            <p className="mt-1 text-xl font-semibold text-blue-100">{formatNumber(runResult.matchedEvents)}</p>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-800 text-left text-sm">
            <thead className="bg-zinc-900/70 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Incident</th>
                <th className="px-3 py-2 font-medium">Severity</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Rule</th>
                <th className="px-3 py-2 font-medium">Evidence</th>
                <th className="px-3 py-2 font-medium">Last Seen</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-zinc-500">
                    Loading incidents...
                  </td>
                </tr>
              ) : safeIncidents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-zinc-500">
                    No incidents found.
                  </td>
                </tr>
              ) : (
                safeIncidents.map((incident) => {
                  const summary = normalizeObject(incident.summaryJson);
                  return (
                    <tr key={incident.id} className="text-zinc-300">
                      <td className="min-w-64 px-3 py-2">
                        <p className="font-medium text-zinc-100">{incident.title}</p>
                        <p className="mt-0.5 text-xs text-zinc-500">{incident.device?.name ?? incident.source?.name ?? "No device/source"}</p>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded border px-2 py-0.5 text-xs ${severityClass(incident.severity)}`}>
                          {incident.severity}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded border px-2 py-0.5 text-xs ${statusClass(incident.status)}`}>
                          {incident.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-400">{incident.rule?.ruleType ?? "-"}</td>
                      <td className="px-3 py-2 font-mono text-xs text-zinc-400">
                        {summaryValue(summary, "srcIp")} -&gt; {summaryValue(summary, "dstIp")}:{summaryValue(summary, "dstPort")}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">{formatDateTime(incident.lastSeenAt)}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => openIncident(incident)}
                          className="inline-flex h-8 items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 px-2.5 text-xs font-medium text-zinc-300 transition-colors hover:text-blue-200"
                        >
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedIncident && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="max-h-[88vh] w-full max-w-4xl overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl">
            <div className="flex flex-col gap-3 border-b border-zinc-800 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-left text-sm font-semibold text-zinc-100">{selectedIncident.title}</h3>
                <p className="mt-0.5 text-left text-xs text-zinc-500">{selectedIncident.description || selectedIncident.id}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={selectedIncident.status}
                  onChange={(event) => changeStatus(event.target.value as IncidentStatus)}
                  className="h-8 rounded border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-200"
                  disabled={detailsLoading}
                >
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setSelectedIncident(null)}
                  className="h-8 rounded border border-zinc-700 px-2 text-xs text-zinc-300 hover:text-zinc-100"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="max-h-[76vh] overflow-y-auto p-4">
              <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded border border-zinc-800 bg-black/30 p-3">
                  <p className="text-xs text-zinc-500">Severity</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-100">{selectedIncident.severity}</p>
                </div>
                <div className="rounded border border-zinc-800 bg-black/30 p-3">
                  <p className="text-xs text-zinc-500">Event count</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-100">{formatNumber(selectedIncident.eventCount)}</p>
                </div>
                <div className="rounded border border-zinc-800 bg-black/30 p-3">
                  <p className="text-xs text-zinc-500">First seen</p>
                  <p className="mt-1 text-xs text-zinc-300">{formatDateTime(selectedIncident.firstSeenAt)}</p>
                </div>
                <div className="rounded border border-zinc-800 bg-black/30 p-3">
                  <p className="text-xs text-zinc-500">Last seen</p>
                  <p className="mt-1 text-xs text-zinc-300">{formatDateTime(selectedIncident.lastSeenAt)}</p>
                </div>
              </div>

              <pre className="mb-4 max-h-56 overflow-auto rounded border border-zinc-800 bg-black/40 p-3 text-left text-xs text-zinc-300">
                {JSON.stringify(normalizeObject(selectedIncident.summaryJson), null, 2)}
              </pre>

              <h4 className="mb-2 flex items-center gap-2 text-left text-sm font-semibold text-zinc-100">
                <AlertTriangle className="h-4 w-4 text-yellow-300" aria-hidden="true" />
                Related Security Events
              </h4>
              <div className="overflow-hidden rounded border border-zinc-800">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-zinc-800 text-left text-xs">
                    <thead className="bg-zinc-900/70 text-zinc-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Time</th>
                        <th className="px-3 py-2 font-medium">Endpoint</th>
                        <th className="px-3 py-2 font-medium">Action</th>
                        <th className="px-3 py-2 font-medium">Protocol</th>
                        <th className="px-3 py-2 font-medium">Severity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {detailsLoading ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-6 text-center text-zinc-500">Loading evidence...</td>
                        </tr>
                      ) : safeEvents.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-6 text-center text-zinc-500">No related events found.</td>
                        </tr>
                      ) : (
                        safeEvents.map((event) => (
                          <tr key={event.id} className="text-zinc-300">
                            <td className="whitespace-nowrap px-3 py-2 text-zinc-500">{formatDateTime(event.timestamp ?? event.receivedAt)}</td>
                            <td className="px-3 py-2 font-mono">{endpoint(event)}</td>
                            <td className="px-3 py-2">{event.action ?? "-"}</td>
                            <td className="px-3 py-2">{event.protocol ?? "-"}</td>
                            <td className="px-3 py-2">{event.severity ?? "-"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {message && (
        <p className="mt-3 flex items-center gap-2 text-left text-xs text-zinc-400" role="status" aria-live="polite">
          <ShieldCheck className="h-3.5 w-3.5 text-blue-300" aria-hidden="true" />
          {message}
        </p>
      )}
    </section>
  );
}
