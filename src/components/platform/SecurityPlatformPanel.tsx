import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, Boxes, CheckCircle2, Database, FileWarning, Network, Play, ShieldAlert, Workflow } from "lucide-react";
import {
  createFindingActionPlan,
  listDetectionRules,
  listPlatformAssets,
  listSecurityFindings,
  netboxPreview,
  netboxSync,
  previewAssetImport,
  updateFindingStatus,
  wazuhPreview,
  wazuhSync,
  type DetectionRule,
  type PlatformAsset,
  type SecurityFinding
} from "@/lib/platform";

type Section = "assets" | "security";

const fa = {
  assets: "دارایی‌ها",
  security: "امنیت",
  overview: "نمای کلی",
  devices: "تجهیزات",
  sites: "سایت‌ها",
  networks: "شبکه‌ها و VLANها",
  topology: "توپولوژی",
  sync: "منابع همگام‌سازی",
  findings: "یافته‌ها",
  events: "رویدادها",
  rules: "قوانین تشخیص",
  exceptions: "استثناها",
  run: "اجرا",
  preview: "پیش‌نمایش",
  createAction: "ساخت ActionPlan",
  status: "وضعیت",
  noItems: "داده‌ای برای نمایش نیست.",
  compactHint: "نمای فشرده؛ جزئیات در هر گروه باز می‌شود."
};

const severityClass: Record<string, string> = {
  critical: "border-red-800 text-red-100",
  high: "border-orange-800 text-orange-100",
  medium: "border-yellow-800 text-yellow-100",
  low: "border-cyan-800 text-cyan-100"
};

export default function SecurityPlatformPanel({ section }: { section: Section }) {
  const [assets, setAssets] = useState<PlatformAsset[]>([]);
  const [findings, setFindings] = useState<SecurityFinding[]>([]);
  const [rules, setRules] = useState<DetectionRule[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  const selectedAsset = useMemo(() => assets.find((asset) => asset.id === selectedAssetId) ?? assets[0], [assets, selectedAssetId]);

  const refresh = async () => {
    const [assetResult, findingResult, ruleResult] = await Promise.all([listPlatformAssets(), listSecurityFindings(), listDetectionRules()]);
    setAssets(assetResult.assets);
    setFindings(findingResult.findings);
    setRules(ruleResult.rules);
    if (!selectedAssetId && assetResult.assets[0]) setSelectedAssetId(assetResult.assets[0].id);
  };

  useEffect(() => { void refresh().catch((error) => setMessage(error instanceof Error ? error.message : "Load failed")); }, []);

  const run = async (label: string, action: () => Promise<unknown>) => {
    setBusy(label);
    setMessage("");
    try {
      const result = await action();
      setMessage(JSON.stringify(result).slice(0, 260));
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed");
    } finally {
      setBusy("");
    }
  };

  if (section === "assets") {
    const unhealthy = assets.filter((asset) => !["online", "healthy"].includes(asset.healthState)).length;
    return <section dir="rtl" className="space-y-4 text-right text-slate-100">
      <Header icon={Boxes} title={fa.assets} subtitle={fa.compactHint} />
      <div className="grid gap-3 md:grid-cols-3">
        <Metric title={fa.devices} value={assets.length} />
        <Metric title={fa.status} value={unhealthy ? `${unhealthy} نیازمند بررسی` : "عادی"} />
        <Metric title={fa.sync} value="NetBox / Wazuh mock" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Panel title={fa.devices} icon={Database}>
          <div className="max-h-96 overflow-auto">
            {assets.map((asset) => <button key={asset.id} type="button" onClick={() => setSelectedAssetId(asset.id)} className={`mb-2 w-full border-r-2 px-3 py-2 text-right ${selectedAsset?.id === asset.id ? "border-cyan-400 bg-cyan-950/30" : "border-slate-800 bg-slate-950/50"}`}>
              <div className="flex items-center justify-between gap-2"><span className="font-medium">{asset.name}</span><span className="text-xs text-slate-400">{asset.vendor?.name ?? "unknown"}</span></div>
              <div className="mt-1 text-xs text-slate-400">{asset.managementIp ?? asset.hostname ?? "بدون IP"} · {asset.managedState} · {asset.healthState}</div>
            </button>)}
            {!assets.length && <Empty />}
          </div>
        </Panel>
        <Panel title={selectedAsset?.name ?? fa.overview} icon={Network}>
          {selectedAsset ? <div className="space-y-2 text-sm text-slate-300">
            <p>{selectedAsset.managementIp ?? "بدون IP مدیریت"}</p>
            <p>{selectedAsset.site?.name ?? "سایت نامشخص"} · {selectedAsset.platform?.name ?? "پلتفرم نامشخص"}</p>
            <p>{selectedAsset.device ? `Device: ${selectedAsset.device.name}` : "دارایی unmanaged"}</p>
            <p>{selectedAsset.ipAddresses?.map((ip) => ip.address).join("، ")}</p>
          </div> : <Empty />}
        </Panel>
      </div>
      <Panel title={fa.sync} icon={Workflow}>
        <div className="flex flex-wrap gap-2">
          <ActionButton disabled={busy !== ""} onClick={() => run("netbox-preview", netboxPreview)} label="NetBox preview" icon={FileWarning} />
          <ActionButton disabled={busy !== ""} onClick={() => run("netbox-sync", netboxSync)} label="NetBox sync" icon={Play} />
          <ActionButton disabled={busy !== ""} onClick={() => run("wazuh-preview", wazuhPreview)} label="Wazuh preview" icon={FileWarning} />
          <ActionButton disabled={busy !== ""} onClick={() => run("wazuh-sync", wazuhSync)} label="Wazuh sync" icon={Play} />
          <ActionButton disabled={busy !== ""} onClick={() => run("manual-preview", () => previewAssetImport({ sourceType: "manual_json", assets: [{ name: "manual-preview", managementIp: "192.0.2.90", vendor: "Linux" }] }))} label={fa.preview} icon={CheckCircle2} />
        </div>
      </Panel>
      {message && <p className="rounded border border-slate-800 bg-slate-950/80 p-3 text-xs text-slate-300">{message}</p>}
    </section>;
  }

  return <section dir="rtl" className="space-y-4 text-right text-slate-100">
    <Header icon={ShieldAlert} title={fa.security} subtitle={fa.compactHint} />
    <div className="grid gap-3 md:grid-cols-3">
      <Metric title={fa.findings} value={findings.length} />
      <Metric title={fa.rules} value={rules.length} />
      <Metric title={fa.events} value="bounded query" />
    </div>
    <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <Panel title={fa.findings} icon={ShieldAlert}>
        {findings.map((finding) => <article key={finding.id} className="mb-3 border-r-2 border-slate-800 bg-slate-950/50 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">{finding.title}</h3>
            <span className={`rounded border px-2 py-0.5 text-xs ${severityClass[finding.severity] ?? "border-slate-700 text-slate-300"}`}>{finding.severity}</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">{finding.asset?.name ?? finding.device?.name ?? "بدون دارایی"} · {finding.summary}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <ActionButton disabled={busy !== ""} onClick={() => run(`action-${finding.id}`, () => createFindingActionPlan(finding.id))} label={fa.createAction} icon={Play} />
            <ActionButton disabled={busy !== ""} onClick={() => run(`ack-${finding.id}`, () => updateFindingStatus(finding.id, "acknowledged"))} label="ack" icon={CheckCircle2} />
          </div>
        </article>)}
        {!findings.length && <Empty />}
      </Panel>
      <Panel title={fa.rules} icon={Activity}>
        <div className="space-y-2">
          {rules.slice(0, 12).map((rule) => <div key={rule.id} className="border-b border-slate-900 pb-2 text-sm">
            <div className="flex justify-between gap-2"><span>{rule.name}</span><span className={rule.enabled ? "text-green-300" : "text-slate-500"}>{rule.enabled ? "on" : "off"}</span></div>
            <p className="text-xs text-slate-500">{rule.description}</p>
          </div>)}
        </div>
      </Panel>
    </div>
    {message && <p className="rounded border border-slate-800 bg-slate-950/80 p-3 text-xs text-slate-300">{message}</p>}
  </section>;
}

function Header({ icon: Icon, title, subtitle }: { icon: typeof Boxes; title: string; subtitle: string }) {
  return <div className="flex items-start gap-3 border-b border-slate-800 pb-3"><Icon className="mt-1 h-5 w-5 text-cyan-300" /><div><h2 className="text-xl font-semibold">{title}</h2><p className="text-sm text-slate-400">{subtitle}</p></div></div>;
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof Boxes; children: ReactNode }) {
  return <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-4"><div className="mb-3 flex items-center gap-2"><Icon className="h-4 w-4 text-cyan-300" /><h3 className="font-semibold">{title}</h3></div>{children}</section>;
}

function Metric({ title, value }: { title: string; value: string | number }) {
  return <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-4"><div className="text-xs text-slate-500">{title}</div><div className="mt-2 text-xl font-semibold text-slate-100">{value}</div></div>;
}

function ActionButton({ label, icon: Icon, onClick, disabled }: { label: string; icon: typeof Play; onClick: () => void; disabled?: boolean }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="inline-flex h-8 items-center gap-1.5 rounded border border-cyan-900 px-2.5 text-xs text-cyan-100 disabled:opacity-50"><Icon className="h-3.5 w-3.5" />{label}</button>;
}

function Empty() {
  return <p className="py-8 text-center text-sm text-slate-500">{fa.noItems}</p>;
}
