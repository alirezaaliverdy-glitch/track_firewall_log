import { useMemo, useState } from "react";
import { Search, ShieldAlert } from "lucide-react";
import { useLogContext } from "@/context/LogContext";
import { RISKY_PORTS, getRiskyPort } from "@/lib/riskyPorts";
import { SectionCard } from "@/components/ui/SectionCard";
import { SeverityBadge } from "@/components/ui/SeverityBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Severity } from "@/types/finding";

type PortExposure = {
  port: number;
  service: string;
  severity: Severity;
  reason: string;
  recommendation: string;
  total: number;
  allowed: number;
  blocked: number;
  other: number;
};

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

function isAllowed(action?: string): boolean {
  return action === "allow" || action === "accept" || action === "pass" || action === "permit";
}

function isBlocked(action?: string): boolean {
  return action === "deny" || action === "drop" || action === "block";
}

export default function SensitivePortsExplorer() {
  const { logs, summary, logProfile } = useLogContext();
  const [query, setQuery] = useState("");

  const exposures = useMemo(() => {
    const byPort = new Map<number, PortExposure>();

    for (const log of logs) {
      if (log.dstPort === undefined) continue;
      const meta = getRiskyPort(log.dstPort);
      if (!meta) continue;

      const existing = byPort.get(log.dstPort) ?? {
        port: meta.port,
        service: meta.service,
        severity: meta.severity,
        reason: meta.reason,
        recommendation: meta.recommendation,
        total: 0,
        allowed: 0,
        blocked: 0,
        other: 0,
      };

      existing.total += 1;
      if (isAllowed(log.action)) existing.allowed += 1;
      else if (isBlocked(log.action)) existing.blocked += 1;
      else existing.other += 1;

      byPort.set(log.dstPort, existing);
    }

    return Array.from(byPort.values()).sort((a, b) => {
      const severityDelta = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (severityDelta !== 0) return severityDelta;
      return b.total - a.total;
    });
  }, [logs]);

  if (summary.total === 0) return null;
  if (!logProfile.capabilities.includes("sensitivePorts")) return null;

  const lowerQuery = query.trim().toLowerCase();
  const filtered = lowerQuery
    ? exposures.filter((entry) =>
        String(entry.port).includes(lowerQuery) ||
        entry.service.toLowerCase().includes(lowerQuery) ||
        entry.reason.toLowerCase().includes(lowerQuery)
      )
    : exposures;

  const observedRiskyCount = exposures.length;
  const allowedRiskyCount = exposures.filter((entry) => entry.allowed > 0).length;

  const headerRight = (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <span className="text-xs text-zinc-400">
        {observedRiskyCount}/{RISKY_PORTS.length} observed
      </span>
      {allowedRiskyCount > 0 && (
        <span className="text-xs text-yellow-400">
          {allowedRiskyCount} allowed
        </span>
      )}
    </div>
  );

  return (
    <SectionCard
      title="Sensitive Ports Explorer"
      subtitle="Observed risky destination ports and service context"
      headerRight={headerRight}
    >
      <div className="mb-4 flex items-center gap-2 rounded-md border border-slate-800 bg-slate-950 px-3 py-2 focus-within:border-blue-700/70 focus-within:ring-2 focus-within:ring-blue-600/20">
        <Search className="h-4 w-4 text-blue-400" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search port or service"
          className="w-full bg-transparent text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none"
          aria-label="Search sensitive ports"
        />
      </div>

      {exposures.length === 0 ? (
        <EmptyState
          compact
          icon={<ShieldAlert className="h-8 w-8" />}
          title="No sensitive destination ports observed"
          description="The current dataset does not contain ports from the risky services registry."
        />
      ) : filtered.length === 0 ? (
        <EmptyState compact title="No sensitive ports match your search" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Port</th>
                <th className="px-3 py-2 font-medium">Service</th>
                <th className="px-3 py-2 font-medium">Severity</th>
                <th className="px-3 py-2 font-medium text-right">Allowed</th>
                <th className="px-3 py-2 font-medium text-right">Blocked</th>
                <th className="px-3 py-2 font-medium text-right">Total</th>
                <th className="px-3 py-2 font-medium">Why it matters</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((entry) => (
                <tr key={entry.port} className="align-top hover:bg-slate-900/50">
                  <td className="px-3 py-3 font-mono text-blue-100">{entry.port}</td>
                  <td className="px-3 py-3 text-slate-200">{entry.service}</td>
                  <td className="px-3 py-3">
                    <SeverityBadge severity={entry.severity} />
                  </td>
                  <td className={`px-3 py-3 text-right tabular-nums ${entry.allowed > 0 ? "text-yellow-400" : "text-zinc-500"}`}>
                    {entry.allowed.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-400">
                    {entry.blocked.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-300">
                    {entry.total.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-xs leading-relaxed text-slate-400">
                    <p>{entry.reason}</p>
                    <p className="mt-1 text-slate-500">{entry.recommendation}</p>
                    {entry.other > 0 && (
                      <p className="mt-1 text-zinc-600">
                        {entry.other.toLocaleString()} event{entry.other === 1 ? "" : "s"} had another or unknown action.
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
