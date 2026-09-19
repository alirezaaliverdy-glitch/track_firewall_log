import { AlertTriangle, MoreVertical, Trash2, X } from "lucide-react";
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
  const [pendingRemove, setPendingRemove] = useState<PlatformAsset | null>(null);
  const [removeConfirmed, setRemoveConfirmed] = useState(false);
  const locale = (i18n.resolvedLanguage ?? i18n.language).startsWith("fa") ? "fa-IR" : "en-US";

  async function remove(asset: PlatformAsset) {
    setBusyId(asset.id);
    setRowError((current) => ({ ...current, [asset.id]: "" }));
    setRowNotice((current) => ({ ...current, [asset.id]: "" }));
    try {
      if (asset.device?.id) await deleteDevice(asset.device.id);
      else await removePlatformAsset(asset.id);
      onRemoved?.(asset.id);
      setPendingRemove(null);
      setRemoveConfirmed(false);
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
              <td><details className="row-menu"><summary aria-label={t("assets.table.actions")}><MoreVertical aria-hidden="true" /></summary><div><Link to={openPath}>{t("assets.actions.open")}</Link>{asset.device?.id ? <button type="button" disabled={busyId === asset.id} onClick={() => void test(asset)}>{busyId === asset.id ? t("assets.table.testing") : t("assets.table.testConnection")}</button> : null}<Link to={asset.device?.id ? `/assets/devices/${asset.device.id}/setup` : openPath}>{t("assets.table.edit")}</Link><button type="button" className="danger-text" disabled={busyId === asset.id} onClick={() => { setPendingRemove(asset); setRemoveConfirmed(false); }}>{busyId === asset.id ? t("assets.table.removing") : t("assets.table.remove")}</button></div></details></td>
            </tr>
          );
        })}</tbody>
      </table>
      {pendingRemove ? <div className="action-review-dialog" role="dialog" aria-modal="true" aria-labelledby="asset-remove-title"><section className="action-review-dialog__card company-dialog company-dialog--danger"><header><div><h2 id="asset-remove-title">حذف دارایی «{pendingRemove.name}»؟</h2><p>این دارایی و دستگاه متصل به آن از فهرست فعال خارج می‌شوند.</p></div><button type="button" onClick={() => setPendingRemove(null)} aria-label="بستن"><X /></button></header><div className="company-delete-warning"><AlertTriangle /><div><strong>قبل از ادامه اثر عملیات را بررسی کنید</strong><p>حذف فعلی نرم و قابل بازیابی توسط پشتیبانی است. اگر بعداً پاک‌سازی دائمی انجام شود، اطلاعات قابل بازگشت نخواهد بود.</p></div></div><label className="company-confirm company-confirm--check"><input type="checkbox" checked={removeConfirmed} onChange={(event) => setRemoveConfirmed(event.target.checked)} /><span>متوجه شدم که این دارایی از محیط عملیاتی و گزارش‌ها خارج می‌شود.</span></label><footer><button type="button" className="secondary-button" onClick={() => setPendingRemove(null)}>انصراف</button><button type="button" className="danger-button" disabled={!removeConfirmed || busyId === pendingRemove.id} onClick={() => void remove(pendingRemove)}><Trash2 size={17} />{busyId === pendingRemove.id ? "در حال حذف…" : "حذف دارایی"}</button></footer></section></div> : null}
    </div>
  );
}
