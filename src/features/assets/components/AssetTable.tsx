import { MoreVertical } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { deleteDevice, testDeviceConnection } from "@/lib/devices";
import type { PlatformAsset } from "@/lib/platform";
import { removePlatformAsset } from "@/lib/platform";
import { AssetIdentityIcon } from "./AssetIdentityIcon";

function healthTone(value: string): "good" | "warning" | "danger" | "neutral" {
  if (["online", "healthy"].includes(value)) return "good";
  if (["warning", "degraded", "needs_review", "unknown"].includes(value)) return "warning";
  if (["offline", "error"].includes(value)) return "danger";
  return "neutral";
}

function vendorPlatform(asset: PlatformAsset, fallback: string) {
  return [asset.vendor?.name, asset.platform?.name].filter(Boolean).join(" / ") || fallback;
}

export function AssetTable({ assets, onRemoved }: { assets: PlatformAsset[]; onRemoved?: (assetId: string) => void }) {
  const { t, i18n } = useTranslation();
  const [busyId, setBusyId] = useState("");
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [rowNotice, setRowNotice] = useState<Record<string, string>>({});
  const locale = (i18n.resolvedLanguage ?? i18n.language).startsWith("fa") ? "fa-IR" : "en-US";

  async function remove(asset: PlatformAsset) {
    if (!window.confirm(t("assets.table.removeConfirm"))) return;
    setBusyId(asset.id);
    setRowError((current) => ({ ...current, [asset.id]: "" }));
    setRowNotice((current) => ({ ...current, [asset.id]: "" }));
    try {
      if (asset.device?.id) await deleteDevice(asset.device.id);
      else await removePlatformAsset(asset.id);
      onRemoved?.(asset.id);
    } catch (error) {
      setRowError((current) => ({ ...current, [asset.id]: error instanceof Error ? error.message : t("assets.table.removeFailed") }));
    } finally {
      setBusyId("");
    }
  }

  async function test(asset: PlatformAsset) {
    if (!asset.device?.id) return;
    setBusyId(asset.id);
    setRowError((current) => ({ ...current, [asset.id]: "" }));
    setRowNotice((current) => ({ ...current, [asset.id]: "" }));
    try {
      await testDeviceConnection(asset.device.id);
      setRowNotice((current) => ({ ...current, [asset.id]: t("assets.table.testSucceeded") }));
    } catch (error) {
      setRowError((current) => ({ ...current, [asset.id]: error instanceof Error ? error.message : t("assets.table.testFailed") }));
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="table-shell equipment-table asset-table-shell">
      <table>
        <thead><tr><th>{t("assets.table.asset")}</th><th>{t("assets.table.managementAddress")}</th><th>{t("assets.table.status")}</th><th>{t("assets.table.lastVerified")}</th><th><span className="sr-only">{t("assets.table.actions")}</span></th></tr></thead>
        <tbody>{assets.map((asset) => {
          const workspaceId = asset.device?.id ?? asset.id;
          const openPath = `/assets/devices/${workspaceId}`;
          return (
            <tr key={asset.id}>
              <td><div className="asset-table-identity"><AssetIdentityIcon asset={asset} /><div><Link to={openPath}>{asset.name}</Link><span>{vendorPlatform(asset, t("assets.unknownPlatform"))}</span>{rowError[asset.id] ? <p className="row-error" role="alert">{rowError[asset.id]}</p> : null}{rowNotice[asset.id] ? <p className="row-notice" role="status">{rowNotice[asset.id]}</p> : null}</div></div></td>
              <td dir="ltr">{asset.managementIp ?? asset.hostname ?? "—"}</td>
              <td><StatusBadge value={t(`assets.health.${asset.healthState}`, { defaultValue: asset.healthState })} tone={healthTone(asset.healthState)} /></td>
              <td>{asset.lastSeenAt ? new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(asset.lastSeenAt)) : t("assets.notCollected")}</td>
              <td><details className="row-menu"><summary aria-label={t("assets.table.actions")}><MoreVertical aria-hidden="true" /></summary><div><Link to={openPath}>{t("assets.actions.open")}</Link>{asset.device?.id ? <button type="button" disabled={busyId === asset.id} onClick={() => void test(asset)}>{busyId === asset.id ? t("assets.table.testing") : t("assets.table.testConnection")}</button> : null}<Link to={asset.device?.id ? `/assets/devices/${asset.device.id}/setup` : openPath}>{t("assets.table.edit")}</Link><button type="button" className="danger-text" disabled={busyId === asset.id} onClick={() => void remove(asset)}>{busyId === asset.id ? t("assets.table.removing") : t("assets.table.remove")}</button></div></details></td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}
