import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  FileText,
  AlertTriangle,
  Radar,
  Activity,
  Users,
} from "lucide-react";
import { useLogContext } from "@/context/LogContext";
import { MetricCard } from "@/components/ui/MetricCard";
import { EmptyState } from "@/components/ui/EmptyState";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hygieneColor(score: number): string {
  if (score >= 75) return "text-green-400";
  if (score >= 50) return "text-yellow-400";
  return "text-red-400";
}

function hygieneAccent(score: number): "green" | "yellow" | "red" {
  if (score >= 75) return "green";
  if (score >= 50) return "yellow";
  return "red";
}

function hygieneLabel(score: number): string {
  if (score >= 75) return "Good";
  if (score >= 50) return "Needs attention";
  return "Poor";
}

function fmtBytes(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} GB`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)} MB`;
  if (n >= 1_000)         return `${(n / 1_000).toFixed(1)} KB`;
  return `${n} B`;
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)} K`;
  return n.toLocaleString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SecurityOverview() {
  const { summary, findings, hygieneScore, dataQuality } = useLogContext();

  if (summary.total === 0) {
    return (
      <div className="rounded-xl border border-zinc-700/60 bg-zinc-900 mb-4">
        <EmptyState
          icon={<Shield className="w-10 h-10" />}
          title="No data loaded"
          description="Upload a firewall log CSV to start analyzing."
        />
      </div>
    );
  }

  const criticalCount  = findings.filter((f) => f.severity === "critical").length;
  const highCount      = findings.filter((f) => f.severity === "high").length;
  const allowedRisky   = findings.filter((f) => f.type === "allowed-risky-service").length;
  const scanCount      = findings.filter(
    (f) => f.type === "vertical-port-scan" || f.type === "horizontal-port-scan"
  ).length;

  const deniedDropped = summary.denied + summary.dropped;

  return (
    <div className="mb-4">
      {/* Top KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">

        {/* Hygiene Score — prominent */}
        <div className="col-span-2 sm:col-span-2 xl:col-span-2">
          <MetricCard
            label="Hygiene Score"
            value={`${hygieneScore}%`}
            sub={hygieneLabel(hygieneScore)}
            valueColor={hygieneColor(hygieneScore)}
            accent={hygieneAccent(hygieneScore) as any}
            icon={
              hygieneScore >= 75
                ? <ShieldCheck className="w-5 h-5 text-green-600" />
                : <ShieldAlert className="w-5 h-5 text-yellow-600" />
            }
          />
        </div>

        <MetricCard
          label="Total Logs"
          value={summary.total.toLocaleString()}
          icon={<FileText className="w-4 h-4" />}
        />

        <MetricCard
          label="Critical Findings"
          value={criticalCount}
          valueColor={criticalCount > 0 ? "text-red-400" : "text-zinc-400"}
          accent={criticalCount > 0 ? "red" : "none"}
          icon={<ShieldX className="w-4 h-4" />}
        />

        <MetricCard
          label="High Findings"
          value={highCount}
          valueColor={highCount > 0 ? "text-orange-400" : "text-zinc-400"}
          accent={highCount > 0 ? "orange" : "none"}
          icon={<AlertTriangle className="w-4 h-4" />}
        />

        <MetricCard
          label="Allowed Risky"
          value={allowedRisky}
          valueColor={allowedRisky > 0 ? "text-yellow-400" : "text-zinc-400"}
          accent={allowedRisky > 0 ? "yellow" : "none"}
          icon={<Activity className="w-4 h-4" />}
          sub={allowedRisky > 0 ? "risky services allowed" : undefined}
        />

        <MetricCard
          label="Possible Scans"
          value={scanCount}
          valueColor={scanCount > 0 ? "text-orange-400" : "text-zinc-400"}
          accent={scanCount > 0 ? "orange" : "none"}
          icon={<Radar className="w-4 h-4" />}
        />

        <MetricCard
          label="Data Quality"
          value={`${dataQuality.score}%`}
          valueColor={
            dataQuality.score >= 75 ? "text-green-400" :
            dataQuality.score >= 50 ? "text-yellow-400" : "text-red-400"
          }
          icon={<Users className="w-4 h-4" />}
        />
      </div>

      {/* Secondary row: traffic metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-3">
        <MetricCard
          label="Allowed"
          value={summary.allowed.toLocaleString()}
          valueColor="text-green-400"
          accent="green"
        />
        <MetricCard
          label="Denied / Dropped"
          value={deniedDropped.toLocaleString()}
          sub={summary.reset > 0 ? `+${summary.reset.toLocaleString()} reset` : undefined}
          valueColor={deniedDropped > 0 ? "text-red-400" : "text-zinc-300"}
          accent={deniedDropped > 0 ? "red" : "none"}
        />
        <MetricCard
          label="Total Bytes"
          value={fmtBytes(summary.totalBytes)}
        />
        <MetricCard
          label="Total Packets"
          value={fmtCount(summary.totalPackets)}
        />
        <MetricCard
          label="Unique Src IPs"
          value={summary.uniqueSrcIps.toLocaleString()}
        />
        <MetricCard
          label="Unique Dst IPs"
          value={summary.uniqueDstIps.toLocaleString()}
        />
      </div>
    </div>
  );
}

// Needed for EmptyState above — a local stub so no import cycle
function Shield({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"
      strokeLinejoin="round" className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
