import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Eye, Filter, Network, RefreshCw, ShieldAlert } from "lucide-react";
import {
  getSecurityEvent,
  getSecurityEventsSummary,
  listEventBatches,
  listSecurityEvents,
  type EventBatch,
  type EventFilters,
  type EventsSummary,
  type SecurityEvent,
} from "@/lib/securityEvents";
import { Input } from "@/components/ui/input";

const EMPTY_SUMMARY: EventsSummary = {
  totalEvents: 0,
  countBySeverity: [],
  countByAction: [],
  topSourceIps: [],
  topDestinationPorts: [],
  topSources: [],
  topDevices: [],
};

const EMPTY_FILTERS: EventFilters = {
  vendor: "",
  action: "",
  severity: "",
  srcIp: "",
  dstIp: "",
  port: "",
  protocol: "",
};

function fmtDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function severityClass(severity: string | null) {
  if (severity === "high" || severity === "critical") return "border-red-800 bg-red-950/40 text-red-300";
  if (severity === "medium") return "border-yellow-800 bg-yellow-950/40 text-yellow-300";
  if (severity === "low") return "border-blue-800 bg-blue-950/40 text-blue-200";
  return "border-zinc-700 bg-zinc-950 text-zinc-400";
}

function topList(items: Array<{ value?: string; name?: string; count: number }>) {
  if (items.length === 0) return "none";
  return items.slice(0, 3).map((item) => `${item.value ?? item.name}: ${item.count}`).join(", ");
}

function eventEndpoint(event: SecurityEvent) {
  const src = [event.srcIp, event.srcPort].filter((value) => value !== null && value !== undefined).join(":");
  const dst = [event.dstIp, event.dstPort].filter((value) => value !== null && value !== undefined).join(":");
  return `${src || "-"} -> ${dst || "-"}`;
}

export default function SecurityEventsPanel() {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [summary, setSummary] = useState<EventsSummary>(EMPTY_SUMMARY);
  const [batches, setBatches] = useState<EventBatch[]>([]);
  const [filters, setFilters] = useState<EventFilters>(EMPTY_FILTERS);
  const [selectedEvent, setSelectedEvent] = useState<SecurityEvent | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setMessage(null);
    Promise.all([
      listSecurityEvents(filters),
      getSecurityEventsSummary(filters),
      listEventBatches(),
    ])
      .then(([nextEvents, nextSummary, nextBatches]) => {
        setEvents(nextEvents);
        setSummary(nextSummary);
        setBatches(nextBatches);
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Failed to load security events."))
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateFilter = (key: keyof EventFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const openEvent = (event: SecurityEvent) => {
    getSecurityEvent(event.id)
      .then(setSelectedEvent)
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Failed to load event details."));
  };

  return (
    <section className="mb-4 rounded-lg border border-blue-900/50 bg-slate-950/70 p-4 shadow-[inset_0_1px_0_rgba(59,130,246,0.08)]">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-left text-lg font-semibold text-zinc-100">Security Events</h2>
          <p className="mt-1 text-left text-sm text-zinc-400">
            Normalized event store for uploads and future real-time sources.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex h-9 w-fit items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm font-medium text-zinc-300 transition-colors hover:border-blue-700 hover:text-blue-200"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            Total events
          </div>
          <p className="mt-1 text-2xl font-semibold text-blue-100">{summary.totalEvents.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Network className="h-4 w-4" aria-hidden="true" />
            Top source IPs
          </div>
          <p className="mt-2 text-xs text-zinc-300">{topList(summary.topSourceIps)}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Filter className="h-4 w-4" aria-hidden="true" />
            Actions
          </div>
          <p className="mt-2 text-xs text-zinc-300">{topList(summary.countByAction.map((item) => ({ value: item.action, count: item.count })))}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            Recent batches
          </div>
          <p className="mt-2 text-xs text-zinc-300">{batches.length} batches stored</p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        {(["vendor", "action", "severity", "srcIp", "dstIp", "port", "protocol"] as Array<keyof EventFilters>).map((key) => (
          <label key={key} className="grid gap-1 text-left text-xs font-medium text-zinc-500">
            {key}
            <Input
              value={filters[key] ?? ""}
              onChange={(event) => updateFilter(key, event.target.value)}
              placeholder={key === "port" ? "22" : key}
              className="h-8 text-xs"
            />
          </label>
        ))}
        <button
          type="button"
          onClick={refresh}
          className="col-span-2 inline-flex h-8 items-center justify-center gap-2 self-end rounded-md bg-blue-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-blue-500 md:col-span-1"
        >
          <Filter className="h-3.5 w-3.5" aria-hidden="true" />
          Apply
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-800 text-left text-sm">
            <thead className="bg-zinc-900/70 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Severity</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Endpoint</th>
                <th className="px-3 py-2 font-medium">Vendor</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {events.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-zinc-500">
                    No security events stored yet.
                  </td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr key={event.id} className="text-zinc-300">
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">{fmtDate(event.timestamp ?? event.receivedAt)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded border px-2 py-0.5 text-xs ${severityClass(event.severity)}`}>
                        {event.severity ?? "unknown"}
                      </span>
                    </td>
                    <td className="px-3 py-2">{event.action ?? "-"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{eventEndpoint(event)}</td>
                    <td className="px-3 py-2">{event.vendor ?? "-"}</td>
                    <td className="px-3 py-2">{event.source?.name ?? "-"}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => openEvent(event)}
                        className="inline-flex h-8 items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 px-2.5 text-xs font-medium text-zinc-300 transition-colors hover:text-blue-200"
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {batches.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {batches.slice(0, 5).map((batch) => (
            <span key={batch.id} className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-400">
              {batch.source?.name ?? "Source"}: {batch.parsedEvents}/{batch.totalEvents}
            </span>
          ))}
        </div>
      )}

      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">Event Details</h3>
                <p className="mt-0.5 text-xs text-zinc-500">{selectedEvent.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:text-zinc-100"
              >
                Close
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-4">
              <div className="grid gap-2 text-sm text-zinc-300 sm:grid-cols-2">
                <p><span className="text-zinc-500">Type:</span> {selectedEvent.eventType}</p>
                <p><span className="text-zinc-500">Protocol:</span> {selectedEvent.protocol ?? "-"}</p>
                <p><span className="text-zinc-500">Rule:</span> {selectedEvent.ruleName ?? "-"}</p>
                <p><span className="text-zinc-500">User:</span> {selectedEvent.username ?? "-"}</p>
                <p><span className="text-zinc-500">Source:</span> {eventEndpoint(selectedEvent)}</p>
                <p><span className="text-zinc-500">Batch:</span> {selectedEvent.batchId ?? "-"}</p>
              </div>
              <pre className="mt-4 max-h-80 overflow-auto rounded border border-zinc-800 bg-black/40 p-3 text-xs text-zinc-300">
                {JSON.stringify(selectedEvent.normalizedJson, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {message && (
        <p className="mt-3 text-left text-xs text-zinc-400" role="status" aria-live="polite">
          {message}
        </p>
      )}
    </section>
  );
}
