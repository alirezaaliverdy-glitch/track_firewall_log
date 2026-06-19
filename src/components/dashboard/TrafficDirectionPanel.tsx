import { AlertTriangle, Database, Globe2, Network, ServerCog } from "lucide-react";
import { useLogContext } from "@/context/LogContext";
import { TRAFFIC_DIRECTION_LABELS } from "@/lib/trafficDirection";
import { SectionCard } from "@/components/ui/SectionCard";
import type { TrafficDirection } from "@/types/log";

const DIRECTIONS: TrafficDirection[] = ["inbound", "outbound", "internal", "external", "loopback", "unknown"];

function CountPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-blue-100">{value.toLocaleString()}</p>
    </div>
  );
}

export default function TrafficDirectionPanel() {
  const { logs, summary } = useLogContext();

  if (summary.total === 0) return null;

  const directionCounts = new Map<TrafficDirection, number>(
    DIRECTIONS.map((direction) => [direction, 0])
  );

  let exposedManagement = 0;
  let exposedDatabase = 0;
  let inboundRisky = 0;
  let missingIpData = 0;

  for (const log of logs) {
    const direction = log.trafficDirection ?? "unknown";
    directionCounts.set(direction, (directionCounts.get(direction) ?? 0) + 1);

    if (direction === "unknown") missingIpData += 1;
    if (direction === "inbound" && log.isManagementTraffic) exposedManagement += 1;
    if (direction === "inbound" && log.isDatabaseTraffic) exposedDatabase += 1;
    if (direction === "inbound" && log.isRiskyServiceTraffic) inboundRisky += 1;
  }

  const hasExposure = exposedManagement > 0 || exposedDatabase > 0 || inboundRisky > 0;

  return (
    <SectionCard title="Traffic Direction & Assets" subtitle="Internet, internal, and exposed service context">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {DIRECTIONS.map((direction) => (
          <CountPill
            key={direction}
            label={TRAFFIC_DIRECTION_LABELS[direction]}
            value={directionCounts.get(direction) ?? 0}
          />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className={`rounded-lg border px-3 py-3 ${
          exposedManagement > 0 ? "border-amber-800/60 bg-amber-950/20" : "border-slate-800 bg-slate-950/70"
        }`}>
          <div className="flex items-center gap-2">
            <ServerCog className={exposedManagement > 0 ? "h-4 w-4 text-amber-300" : "h-4 w-4 text-blue-300"} />
            <p className="text-sm font-semibold text-slate-100">Inbound management</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-slate-100">{exposedManagement.toLocaleString()}</p>
          <p className="text-xs text-slate-500">SSH, RDP, Telnet, VNC, admin panels</p>
        </div>

        <div className={`rounded-lg border px-3 py-3 ${
          exposedDatabase > 0 ? "border-red-800/60 bg-red-950/20" : "border-slate-800 bg-slate-950/70"
        }`}>
          <div className="flex items-center gap-2">
            <Database className={exposedDatabase > 0 ? "h-4 w-4 text-red-300" : "h-4 w-4 text-blue-300"} />
            <p className="text-sm font-semibold text-slate-100">Inbound databases</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-slate-100">{exposedDatabase.toLocaleString()}</p>
          <p className="text-xs text-slate-500">SQL, Redis, Elasticsearch</p>
        </div>

        <div className={`rounded-lg border px-3 py-3 ${
          missingIpData > 0 ? "border-amber-800/60 bg-amber-950/20" : "border-slate-800 bg-slate-950/70"
        }`}>
          <div className="flex items-center gap-2">
            <Network className={missingIpData > 0 ? "h-4 w-4 text-amber-300" : "h-4 w-4 text-blue-300"} />
            <p className="text-sm font-semibold text-slate-100">Missing direction</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-slate-100">{missingIpData.toLocaleString()}</p>
          <p className="text-xs text-slate-500">Rows without usable source/destination IPs</p>
        </div>
      </div>

      <div className={`mt-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
        hasExposure ? "border-amber-800/60 bg-amber-950/20 text-amber-200" : "border-blue-900/50 bg-blue-950/20 text-blue-200"
      }`}>
        {hasExposure ? (
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        ) : (
          <Globe2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        )}
        <span>
          {hasExposure
            ? "Review inbound management, database, and risky service traffic before allowing public access."
            : "No inbound management or database exposure was identified from the currently mapped IP and port fields."}
        </span>
      </div>
    </SectionCard>
  );
}
