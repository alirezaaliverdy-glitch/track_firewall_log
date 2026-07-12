import type { SecurityFinding } from "@/lib/platform";
import { StatusBadge } from "@/components/ui/StatusBadge";

function severityTone(value: string): "danger" | "warning" | "info" | "neutral" {
  if (["critical", "high"].includes(value)) return "danger";
  if (value === "medium") return "warning";
  if (value === "low") return "info";
  return "neutral";
}

export function FindingTable({ findings }: { findings: SecurityFinding[] }) {
  return (
    <div className="table-shell">
      <table>
        <thead>
          <tr>
            <th>عنوان</th>
            <th>Severity</th>
            <th>Asset</th>
            <th>Rule</th>
            <th>Count</th>
            <th>Last Seen</th>
            <th>Status</th>
            <th>Suggested Action</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((finding) => (
            <tr key={finding.id}>
              <td><a href={`/security/findings/${finding.id}`}>{finding.title}</a></td>
              <td><StatusBadge value={finding.severity} tone={severityTone(finding.severity)} /></td>
              <td>{finding.asset?.name ?? finding.device?.name ?? "-"}</td>
              <td>{finding.summary}</td>
              <td>{finding.count}</td>
              <td>{finding.lastSeen ? new Date(finding.lastSeen).toLocaleString() : "-"}</td>
              <td><StatusBadge value={finding.status} tone={finding.status === "active" ? "warning" : "neutral"} /></td>
              <td><a className="text-cyan-200" href={`/security/findings/${finding.id}`}>ساخت ActionPlan</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
