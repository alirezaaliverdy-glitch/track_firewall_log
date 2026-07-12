import type { PlatformAsset } from "@/lib/platform";
import { StatusBadge } from "@/components/ui/StatusBadge";

function healthTone(value: string): "good" | "warning" | "danger" | "neutral" {
  if (["online", "healthy"].includes(value)) return "good";
  if (["warning", "degraded", "needs_review"].includes(value)) return "warning";
  if (["offline", "error"].includes(value)) return "danger";
  return "neutral";
}

export function AssetTable({ assets }: { assets: PlatformAsset[] }) {
  return (
    <div className="table-shell">
      <table>
        <thead>
          <tr>
            <th>نام</th>
            <th>Vendor</th>
            <th>Site</th>
            <th>Management IP</th>
            <th>Managed</th>
            <th>Health</th>
            <th>Last Seen</th>
            <th>عملیات</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => (
            <tr key={asset.id}>
              <td><a href={`/assets/devices/${asset.id}`}>{asset.name}</a></td>
              <td>{asset.vendor?.name ?? "-"}</td>
              <td>{asset.site?.name ?? "-"}</td>
              <td>{asset.managementIp ?? asset.hostname ?? "-"}</td>
              <td><StatusBadge value={asset.managedState} tone={asset.managedState === "managed" ? "good" : "warning"} /></td>
              <td><StatusBadge value={asset.healthState} tone={healthTone(asset.healthState)} /></td>
              <td>{asset.lastSeenAt ? new Date(asset.lastSeenAt).toLocaleString() : "-"}</td>
              <td><a className="text-cyan-200" href={`/assets/devices/${asset.id}`}>جزئیات</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
