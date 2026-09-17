import { CheckCircle2, Database, Download, Fingerprint, HardDrive, KeyRound, Languages, ListChecks, Play, RotateCw, Server, ShieldCheck, Smartphone, Upload, Wifi, WifiOff } from "lucide-react";
import { useMemo, useState } from "react";
import { LOCAL_GUIDED_WORKFLOWS, monitoringTemplatesFor } from "@/mobile-local/workflows/LocalGuidedWorkflows";
import { createOfflineFallbackDraft, providerDestinationLabel, type LocalAiProviderMode } from "@/mobile-local/ai/LocalAiProviders";
import { decideLocalExecutionResume, foregroundNotificationFor, iosBackgroundExecutionStatus } from "@/mobile-local/lifecycle/LocalExecutionLifecycle";
import type { DeviceVendor } from "../../../../packages/contracts/src/index";

const vendors: DeviceVendor[] = ["linux", "mikrotik", "fortigate", "cisco"];

const runtimeSteps = [
  { id: "language", label: "Language", icon: Languages, state: "ready" },
  { id: "inventory", label: "Inventory", icon: Server, state: "ready" },
  { id: "vault", label: "Vault", icon: KeyRound, state: "required" },
  { id: "host-key", label: "Host key", icon: Fingerprint, state: "required" },
  { id: "preview", label: "Preview", icon: ListChecks, state: "locked" },
  { id: "execution", label: "Execution", icon: Play, state: "locked" }
];

export default function LocalMobileRuntimePage() {
  const [vendor, setVendor] = useState<DeviceVendor>("linux");
  const [providerMode, setProviderMode] = useState<LocalAiProviderMode>("catalog-only");
  const [trusted, setTrusted] = useState(false);
  const [credentialReady, setCredentialReady] = useState(false);
  const [networkReady, setNetworkReady] = useState(false);
  const templates = useMemo(() => monitoringTemplatesFor(vendor), [vendor]);
  const workflows = LOCAL_GUIDED_WORKFLOWS;
  const aiDraft = useMemo(() => createOfflineFallbackDraft({ message: `${vendor} monitoring`, deviceId: "local-device-preview", vendor, locale: "en" }), [vendor]);
  const providerDestination = providerDestinationLabel({ mode: providerMode, enabled: providerMode !== "catalog-only", apiKeyVaultRef: providerMode === "byok-cloud" ? "vault:ai-provider" : null, baseUrl: providerMode === "lan-openai-compatible" ? "http://lan-ai.local/v1" : null });
  const lifecycle = decideLocalExecutionResume({ executionId: "local-exec-1001", status: "executing", connectorInvoked: credentialReady && trusted, updatedAt: new Date(0).toISOString(), appLifecycleState: "background", platform: "android" });
  const notification = foregroundNotificationFor({ executionId: "local-exec-1001", status: "executing", connectorInvoked: true, updatedAt: new Date(0).toISOString(), appLifecycleState: "background", platform: "android" });
  const iosStatus = iosBackgroundExecutionStatus({ executionId: "local-exec-ios", status: "executing", connectorInvoked: true, updatedAt: new Date(0).toISOString(), appLifecycleState: "background", platform: "ios" });

  return (
    <div className="local-mobile-page">
      <header className="local-mobile-header">
        <div>
          <p className="operator-eyebrow">Local Mode</p>
          <h1>Local Mobile Runtime</h1>
          <p>Device inventory, vault references, host-key trust, preview, approval, execution progress, audit, diagnostics, and backup stay available without a VPS.</p>
        </div>
        <div className="local-mobile-header__state" aria-label="Runtime state">
          <Smartphone aria-hidden="true" />
          <span>RuntimeFacade</span>
          <strong>local-mobile</strong>
        </div>
      </header>

      <section className="local-mobile-stepper" aria-label="Local runtime setup">
        {runtimeSteps.map(({ id, label, icon: Icon, state }) => (
          <article key={id} className={`local-mobile-stepper__item is-${state}`}>
            <Icon aria-hidden="true" />
            <span>{label}</span>
            <strong>{state}</strong>
          </article>
        ))}
      </section>

      <section className="local-mobile-grid">
        <article className="local-mobile-panel">
          <header><Database aria-hidden="true" /><h2>Offline Inventory</h2></header>
          <div className="local-mobile-form-grid">
            <label>Name<input value="Branch edge preview" readOnly /></label>
            <label>Host<input value="192.0.2.10" readOnly dir="ltr" /></label>
            <label>Vendor<select value={vendor} onChange={(event) => setVendor(event.target.value as DeviceVendor)}>{vendors.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label>Port<input value="22" readOnly dir="ltr" /></label>
          </div>
        </article>

        <article className="local-mobile-panel">
          <header><KeyRound aria-hidden="true" /><h2>Vault And Trust</h2></header>
          <div className="local-mobile-switches">
            <label><input type="checkbox" checked={credentialReady} onChange={(event) => setCredentialReady(event.target.checked)} /> Credential reference stored in native vault</label>
            <label><input type="checkbox" checked={trusted} onChange={(event) => setTrusted(event.target.checked)} /> SSH fingerprint trusted and pinned</label>
            <label><input type="checkbox" checked={networkReady} onChange={(event) => setNetworkReady(event.target.checked)} /> Local network permission granted</label>
          </div>
          <div className={`local-mobile-trust ${trusted ? "is-good" : "is-warning"}`}>
            {trusted ? <CheckCircle2 aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
            <span>{trusted ? "Pinned host key available" : "Execution locked until fingerprint trust is explicit"}</span>
          </div>
        </article>

        <article className="local-mobile-panel local-mobile-panel--wide">
          <header><ListChecks aria-hidden="true" /><h2>Catalog Preview And Approval</h2></header>
          <div className="local-mobile-audit">
            {workflows.map((workflow) => <span key={workflow.id}>{workflow.id}</span>)}
          </div>
          <div className="local-mobile-template-list">
            {templates.map((template) => (
              <div key={template.id} className="local-mobile-template">
                <strong>{template.title}</strong>
                <span>{template.actionType}</span>
                <small>{template.commandSpecs.length} read-only command{template.commandSpecs.length === 1 ? "" : "s"}</small>
              </div>
            ))}
          </div>
          <div className="local-mobile-approval">
            <code>{aiDraft.proposedPlan?.actionType ?? "select-device-first"}</code>
            <button type="button" className="primary-button" disabled={!credentialReady || !trusted || !networkReady}>Preview</button>
            <button type="button" className="secondary-button" disabled={!credentialReady || !trusted || !networkReady}>Approve</button>
          </div>
        </article>

        <article className="local-mobile-panel">
          <header>{networkReady ? <Wifi aria-hidden="true" /> : <WifiOff aria-hidden="true" />}<h2>Assistant Mode</h2></header>
          <div className="local-mobile-segmented" role="group" aria-label="AI provider mode">
            {(["catalog-only", "byok-cloud", "lan-openai-compatible", "future-on-device"] as LocalAiProviderMode[]).map((mode) => (
              <button key={mode} type="button" aria-pressed={providerMode === mode} onClick={() => setProviderMode(mode)}>{mode}</button>
            ))}
          </div>
          <dl className="detail-list">
            <dt>Destination</dt><dd>{providerDestination}</dd>
            <dt>Fallback</dt><dd>{String(aiDraft.offlineFallbackUsed)}</dd>
            <dt>Execution path</dt><dd>ActionPlan only</dd>
          </dl>
        </article>

        <article className="local-mobile-panel">
          <header><RotateCw aria-hidden="true" /><h2>Lifecycle</h2></header>
          <dl className="detail-list">
            <dt>Resume action</dt><dd>{lifecycle.action}</dd>
            <dt>Foreground notification</dt><dd>{notification?.channelId ?? "none"}</dd>
            <dt>iOS long-run status</dt><dd>{iosStatus.reason}</dd>
          </dl>
        </article>

        <article className="local-mobile-panel local-mobile-panel--wide">
          <header><HardDrive aria-hidden="true" /><h2>Audit And Backup</h2></header>
          <div className="local-mobile-audit">
            <span>local.device.created</span>
            <span>local.plan.created</span>
            <span>local.plan.approved</span>
            <span>local.connector.invoked</span>
            <span>local.execution.completed</span>
          </div>
          <div className="button-row">
            <button type="button" className="secondary-button"><Download aria-hidden="true" /> Encrypted backup</button>
            <button type="button" className="secondary-button"><Upload aria-hidden="true" /> Restore</button>
          </div>
        </article>
      </section>
    </div>
  );
}
