import { useState } from "react";
import { MoreVertical } from "lucide-react";
import { Link } from "react-router-dom";
import type { PlatformAsset } from "@/lib/platform";
import { removePlatformAsset } from "@/lib/platform";
import { deleteDevice, testDeviceConnection } from "@/lib/devices";
import { StatusBadge } from "@/components/ui/StatusBadge";

function healthTone(value: string): "good" | "warning" | "danger" | "neutral" {
  if (["online", "healthy"].includes(value)) return "good";
  if (["warning", "degraded", "needs_review", "unknown"].includes(value)) return "warning";
  if (["offline", "error"].includes(value)) return "danger";
  return "neutral";
}

function vendorPlatform(asset: PlatformAsset) {
  return [asset.vendor?.name, asset.platform?.name].filter(Boolean).join(" / ") || "-";
}

export function AssetTable({ assets, onRemoved }: { assets: PlatformAsset[]; onRemoved?: (assetId: string) => void }) {
  const [busyId, setBusyId] = useState("");
  const [rowError, setRowError] = useState<Record<string, string>>({});
  async function remove(asset: PlatformAsset) {
    if (!window.confirm("Remove this item from active inventory? History and evidence are kept.")) return;
    setBusyId(asset.id); setRowError((current) => ({ ...current, [asset.id]: "" }));
    try { if (asset.device?.id) await deleteDevice(asset.device.id); else await removePlatformAsset(asset.id); onRemoved?.(asset.id); }
    catch (error) { setRowError((current) => ({ ...current, [asset.id]: error instanceof Error ? error.message : "Removal failed." })); }
    finally { setBusyId(""); }
  }
  async function test(asset: PlatformAsset) {
    if (!asset.device?.id) return;
    setBusyId(asset.id); setRowError((current) => ({ ...current, [asset.id]: "" }));
    try { await testDeviceConnection(asset.device.id); }
    catch (error) { setRowError((current) => ({ ...current, [asset.id]: error instanceof Error ? error.message : "Connection test failed." })); }
    finally { setBusyId(""); }
  }
  return <div className="table-shell equipment-table"><table><thead><tr><th>Name</th><th>Vendor / Platform</th><th>Management IP</th><th>Status</th><th>Last verified</th><th>More</th></tr></thead><tbody>{assets.map((asset) => {
    const workspaceId = asset.device?.id ?? asset.id;
    const openPath = "/assets/devices/" + workspaceId;
    return <tr key={asset.id}><td><Link to={openPath}>{asset.name}</Link>{rowError[asset.id] ? <p className="row-error" role="alert">{rowError[asset.id]}</p> : null}</td><td>{vendorPlatform(asset)}</td><td dir="ltr">{asset.managementIp ?? asset.hostname ?? "-"}</td><td><StatusBadge value={asset.healthState} tone={healthTone(asset.healthState)} /></td><td>{asset.lastSeenAt ? new Date(asset.lastSeenAt).toLocaleString() : "Not collected yet"}</td><td><details className="row-menu"><summary aria-label="More"><MoreVertical aria-hidden="true" /></summary><div><Link to={openPath}>Open</Link>{asset.device?.id ? <button type="button" disabled={busyId === asset.id} onClick={() => void test(asset)}>{busyId === asset.id ? "Testing..." : "Test connection"}</button> : null}<Link to={asset.device?.id ? "/assets/devices/" + asset.device.id + "/setup" : openPath}>Edit</Link><button type="button" className="danger-text" disabled={busyId === asset.id} onClick={() => void remove(asset)}>{busyId === asset.id ? "Removing..." : "Remove from inventory"}</button></div></details></td></tr>;
  })}</tbody></table></div>;
}
