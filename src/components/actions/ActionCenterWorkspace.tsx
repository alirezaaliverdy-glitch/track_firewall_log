import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { quickExecuteAction } from "@/lib/actions";
import { getActionCenterItem, listActionCenter, type ActionCenterItem, type ActionLifecycle } from "@/lib/actionCenter";
import { createCatalogAction, searchCommands, type CatalogItem, type CatalogParam } from "@/lib/commandCatalog";
import { listCredentials, type DeviceCredential } from "@/lib/credentials";
import { getDeviceVerification, retryDeviceVerification, testDeviceVerification, type DeviceVerification } from "@/lib/deviceOnboarding";
import { listDevices, updateDevice, type Device } from "@/lib/devices";
import { StatusBadge } from "@/components/ui/StatusBadge";

type RunMode = "execute" | "preview";

function formatDate(value: string | null | undefined, locale: string) {
  return value ? new Date(value).toLocaleString(locale) : "—";
}

function pretty(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function humanize(value: string) {
  return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fieldValue(value: unknown) {
  if (typeof value === "boolean") return value ? "true" : "false";
  return value === undefined || value === null ? "" : String(value);
}

function AdvancedBlock({ title, value }: { title: string; value: unknown }) {
  return <section className="operator-advanced__block"><h4>{title}</h4><pre>{pretty(value)}</pre></section>;
}

function resultMessage(item: ActionCenterItem, isFa: boolean) {
  if (item.lifecycleState === "succeeded" && item.evidence.connectorInvoked) return isFa ? "اجرای واقعی Connector با موفقیت تکمیل شد." : "The connector completed the operation successfully.";
  if (item.lifecycleState === "failed") {
    const exactError = typeof item.connectorResult.message === "string" ? item.connectorResult.message : null;
    if (exactError) return exactError;
    return item.evidence.integrityError ?? (item.evidence.connectorInvoked
      ? (isFa ? "Connector اجرا شد اما عملیات موفق نبود. جزئیات پیشرفته را بررسی کنید." : "The connector ran, but the operation did not succeed. Review Advanced Details.")
      : (isFa ? "عملیات پیش از فراخوانی Connector متوقف شد." : "The operation stopped before the connector was invoked."));
  }
  if (item.lifecycleState === "ready_for_confirmation") return isFa ? "پیش‌نمایش آماده است و هیچ دستوری روی دستگاه اجرا نشد." : "Preview is ready; no command was executed on the device.";
  return isFa ? "وضعیت عملیات از تاریخچه ActionPlan بازیابی شد." : "Operation state was restored from ActionPlan history.";
}

export function ActionCenterWorkspace({ initialActionPlanId, onCreate }: { initialActionPlanId?: string; onCreate: () => void }) {
  const { i18n } = useTranslation();
  const isFa = i18n.language?.startsWith("fa") ?? false;
  const locale = isFa ? "fa-IR" : "en-US";
  const navigate = useNavigate();
  const location = useLocation();
  const view = location.pathname === "/actions/pending" ? "pending" : location.pathname === "/actions/history" ? "history" : "all";

  const copy = isFa ? {
    connection: "اتصال",
    connectionHelp: "وضعیت واقعی SSH و احراز هویت دستگاه انتخاب‌شده",
    test: "تست اتصال",
    retry: "تلاش دوباره",
    refresh: "تازه‌سازی وضعیت",
    connected: "متصل",
    failed: "ناموفق",
    notTested: "تست‌نشده",
    lastSuccess: "آخرین موفقیت",
    lastFailure: "آخرین خطا",
    connectorState: "وضعیت Connector",
    ssh: "دسترسی SSH",
    auth: "احراز هویت",
    selectDevice: "۱. دستگاه را انتخاب کنید",
    selectCredential: "۲. اعتبارنامه را انتخاب کنید",
    selectAction: "۳. عملیات را انتخاب کنید",
    choose: "انتخاب کنید",
    operatorAction: "اجرای سریع عملیات",
    operatorHelp: "دستگاه، اعتبارنامه و عملیات را انتخاب کنید. اجرای فوری حالت پیش‌فرض است.",
    previewOnly: "فقط پیش‌نمایش",
    previewHelp: "ActionPlan و فرمان‌ها ساخته می‌شوند، اما Connector اجرا نمی‌شود.",
    executeNow: "اجرای فوری",
    executeHelp: "با همین کلیک PolicyGuard بررسی و Connector واقعی اجرا می‌شود.",
    execute: "اجرا",
    generatePreview: "ساخت پیش‌نمایش",
    running: "در حال اجرای Connector…",
    testing: "در حال تست اتصال…",
    required: "الزامی",
    result: "نتیجه عملیات",
    connectorProof: "اثبات Connector",
    advanced: "جزئیات پیشرفته",
    history: "تاریخچه ActionPlan",
    historyHelp: "تاریخچه حفظ شده و برای بررسی و Audit در دسترس است.",
    search: "جست‌وجو در تاریخچه",
    lifecycle: "چرخه",
    allStates: "همه وضعیت‌ها",
    action: "عملیات",
    device: "دستگاه",
    updated: "به‌روزرسانی",
    open: "باز کردن",
    previous: "قبلی",
    next: "بعدی",
    empty: "ActionPlan مطابق این فیلتر وجود ندارد.",
    loading: "در حال بارگذاری…",
    fullLibrary: "کتابخانه کامل عملیات",
    connectorRequired: "موفقیت فقط با connectorInvoked=true پذیرفته می‌شود."
  } : {
    connection: "Connection",
    connectionHelp: "Live SSH and authentication state for the selected device",
    test: "Test Connection",
    retry: "Retry",
    refresh: "Refresh Status",
    connected: "Connected",
    failed: "Failed",
    notTested: "Not tested",
    lastSuccess: "Last Success",
    lastFailure: "Last Failure",
    connectorState: "Connector state",
    ssh: "SSH reachability",
    auth: "Authentication status",
    selectDevice: "1. Select device",
    selectCredential: "2. Select credential",
    selectAction: "3. Select action",
    choose: "Choose…",
    operatorAction: "Run an operation",
    operatorHelp: "Select a device, credential, and action. Immediate execution is the default.",
    previewOnly: "Preview only",
    previewHelp: "Build the ActionPlan and commands without invoking the connector.",
    executeNow: "Execute immediately",
    executeHelp: "This click runs PolicyGuard and invokes the real connector.",
    execute: "Execute",
    generatePreview: "Generate Preview",
    running: "Running connector…",
    testing: "Testing connection…",
    required: "Required",
    result: "Operation result",
    connectorProof: "Connector proof",
    advanced: "Advanced Details",
    history: "ActionPlan history",
    historyHelp: "History remains available for review and audit.",
    search: "Search history",
    lifecycle: "Lifecycle",
    allStates: "All states",
    action: "Action",
    device: "Device",
    updated: "Updated",
    open: "Open",
    previous: "Previous",
    next: "Next",
    empty: "No ActionPlan matches this filter.",
    loading: "Loading…",
    fullLibrary: "Full action library",
    connectorRequired: "Success is accepted only when connectorInvoked=true."
  };

  const lifecycleLabels: Record<ActionLifecycle, string> = isFa ? {
    draft: "پیش‌نویس", needs_input: "نیازمند اطلاعات", ready_for_confirmation: "آماده تأیید", confirmed: "تأییدشده",
    executing: "در حال اجرا", succeeded: "موفق", failed: "ناموفق", cancelled: "لغوشده"
  } : {
    draft: "Draft", needs_input: "Needs input", ready_for_confirmation: "Preview ready", confirmed: "Confirmed",
    executing: "Executing", succeeded: "Succeeded", failed: "Failed", cancelled: "Cancelled"
  };

  const [devices, setDevices] = useState<Device[]>([]);
  const [credentials, setCredentials] = useState<DeviceCredential[]>([]);
  const [actions, setActions] = useState<CatalogItem[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [credentialId, setCredentialId] = useState("");
  const [actionId, setActionId] = useState("");
  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<RunMode>("execute");
  const [verification, setVerification] = useState<DeviceVerification | null>(null);
  const [selected, setSelected] = useState<ActionCenterItem | null>(null);
  const [connectionBusy, setConnectionBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<ActionCenterItem[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [historyBusy, setHistoryBusy] = useState(true);

  const selectedDevice = useMemo(() => devices.find((device) => device.id === deviceId) ?? null, [deviceId, devices]);
  const selectedAction = useMemo(() => actions.find((action) => action.id === actionId) ?? null, [actionId, actions]);
  const allFields = useMemo(() => selectedAction ? [...selectedAction.requiredParams, ...selectedAction.optionalParams] : [], [selectedAction]);
  const requiredComplete = useMemo(() => selectedAction?.requiredParams.every((field) => parameters[field.key]?.trim()) ?? false, [parameters, selectedAction]);

  const loadHistory = useCallback(async () => {
    setHistoryBusy(true);
    try {
      const response = await listActionCenter({ view, q: query, status, offset, limit: 10 });
      setItems(response.items);
      setTotal(response.total);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "ActionPlan history failed.");
    } finally {
      setHistoryBusy(false);
    }
  }, [offset, query, status, view]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setSelected(await getActionCenterItem(id));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "ActionPlan detail failed.");
    }
  }, []);

  useEffect(() => {
    void Promise.all([listDevices(), listCredentials()]).then(([deviceRows, credentialRows]) => {
      setDevices(deviceRows);
      setCredentials(credentialRows);
    }).catch((failure) => setError(failure instanceof Error ? failure.message : "Operator data failed."));
  }, []);

  useEffect(() => { void loadHistory(); }, [loadHistory]);
  useEffect(() => { if (initialActionPlanId) void loadDetail(initialActionPlanId); }, [initialActionPlanId, loadDetail]);
  useEffect(() => {
    if (!deviceId && selected?.deviceId && devices.some((device) => device.id === selected.deviceId)) {
      setDeviceId(selected.deviceId);
    }
  }, [deviceId, devices, selected?.deviceId]);

  useEffect(() => {
    setActionId("");
    setActions([]);
    setParameters({});
    setVerification(null);
    setError("");
    if (!selectedDevice) { setCredentialId(""); return; }
    setCredentialId(selectedDevice.credentialId ?? "");
    void Promise.all([
      searchCommands({ deviceId: selectedDevice.id, executable: "true" }).then((response) => setActions(response.items)),
      getDeviceVerification(selectedDevice.id).then(setVerification)
    ]).catch((failure) => setError(failure instanceof Error ? failure.message : "Device state failed."));
  }, [selectedDevice]);

  useEffect(() => {
    if (!selectedAction) { setParameters({}); return; }
    setParameters(Object.fromEntries(allFields.map((field) => [field.key, fieldValue(selectedAction.defaultParams[field.key])])));
  }, [allFields, selectedAction]);

  async function persistCredential() {
    if (!selectedDevice || !credentialId || selectedDevice.credentialId === credentialId) return;
    const updated = await updateDevice(selectedDevice.id, { credentialId });
    setDevices((current) => current.map((device) => device.id === updated.id ? updated : device));
  }

  async function runConnection(retry = false) {
    if (!selectedDevice || !credentialId) return;
    setConnectionBusy(true);
    setError("");
    try {
      await persistCredential();
      const response = retry
        ? await retryDeviceVerification(selectedDevice.id, credentialId)
        : await testDeviceVerification(selectedDevice.id, credentialId);
      setVerification(response);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Connection test failed.");
      await getDeviceVerification(selectedDevice.id).then(setVerification).catch(() => undefined);
    } finally {
      setConnectionBusy(false);
    }
  }

  async function refreshConnection() {
    if (!selectedDevice) return;
    setConnectionBusy(true);
    setError("");
    try { setVerification(await getDeviceVerification(selectedDevice.id)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Connection status failed."); }
    finally { setConnectionBusy(false); }
  }

  async function runOperatorAction() {
    if (!selectedDevice || !selectedAction || !credentialId || !requiredComplete) return;
    setActionBusy(true);
    setError("");
    try {
      await persistCredential();
      const input = Object.fromEntries(allFields.filter((field) => parameters[field.key] !== "").map((field) => [field.key, field.type === "number" ? Number(parameters[field.key]) : field.type === "boolean" ? parameters[field.key] === "true" : parameters[field.key]]));
      const plan = await createCatalogAction(selectedAction.id, selectedDevice.id, input);
      await quickExecuteAction(plan.id, { intent: mode, reason: mode === "execute" ? "Execute immediately from operator Action Center" : "Preview only from operator Action Center" });
      await Promise.all([loadDetail(plan.id), loadHistory()]);
      navigate(`/actions/${plan.id}`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Operator action failed.");
      await loadHistory();
    } finally {
      setActionBusy(false);
    }
  }

  const latestFailure = verification?.history.find((attempt) => !attempt.connected && Boolean(attempt.error));
  const connectionTone = verification?.connected ? "connected" : verification?.error ? "failed" : "unknown";
  const pages = Math.max(1, Math.ceil(total / 10));
  const currentPage = Math.floor(offset / 10) + 1;

  return (
    <section className="action-workspace operator-action-center" aria-label="Action Center">
      <section className={`operator-connection operator-connection--${connectionTone}`} aria-label={copy.connection}>
        <header>
          <div><p className="operator-eyebrow">{copy.connection}</p><h2>{verification?.connected ? copy.connected : verification?.error ? copy.failed : copy.notTested}</h2><span>{copy.connectionHelp}</span></div>
          <div className="operator-connection__actions">
            <button className="secondary-button" type="button" disabled={!selectedDevice || !credentialId || connectionBusy} onClick={() => void runConnection(false)}>{connectionBusy ? copy.testing : copy.test}</button>
            <button className="secondary-button" type="button" disabled={!selectedDevice || connectionBusy} onClick={() => void refreshConnection()}>{copy.refresh}</button>
            {verification?.error && <button className="primary-button" type="button" disabled={connectionBusy} onClick={() => void runConnection(true)}>{copy.retry}</button>}
          </div>
        </header>
        <div className="operator-connection__grid">
          <div><span>{copy.lastSuccess}</span><strong>{formatDate(verification?.lastSuccessAt, locale)}</strong></div>
          <div><span>{copy.lastFailure}</span><strong>{formatDate(verification?.lastFailureAt ?? latestFailure?.attemptedAt, locale)}</strong></div>
          <div><span>{copy.connectorState}</span><strong>{verification?.connectorState ?? "unknown"}</strong><small>{verification?.connectorType ?? "—"}</small></div>
          <div><span>{copy.ssh}</span><strong>{verification?.sshReachability ?? "unknown"}</strong></div>
          <div><span>{copy.auth}</span><strong>{verification?.authenticationStatus ?? "unknown"}</strong></div>
        </div>
        {verification?.error && <div className="operator-connection__error" role="alert">{verification.error}</div>}
      </section>

      <section className="operator-run-card" aria-label={copy.operatorAction}>
        <header><div><p className="operator-eyebrow">Operator workflow</p><h2>{copy.operatorAction}</h2><span>{copy.operatorHelp}</span></div></header>
        <div className="operator-run-card__selectors">
          <label>{copy.selectDevice}<select aria-label={copy.selectDevice} value={deviceId} onChange={(event) => setDeviceId(event.target.value)}><option value="">{copy.choose}</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.name} · {device.vendor}</option>)}</select></label>
          <label>{copy.selectCredential}<select aria-label={copy.selectCredential} value={credentialId} disabled={!selectedDevice} onChange={(event) => setCredentialId(event.target.value)}><option value="">{copy.choose}</option>{credentials.map((credential) => <option key={credential.id} value={credential.id}>{credential.name} · {credential.type}</option>)}</select></label>
          <label>{copy.selectAction}<select aria-label={copy.selectAction} value={actionId} disabled={!selectedDevice} onChange={(event) => setActionId(event.target.value)}><option value="">{copy.choose}</option>{actions.map((action) => <option key={action.id} value={action.id}>{isFa ? action.titleFa : action.titleEn}</option>)}</select></label>
        </div>

        {selectedAction && allFields.length > 0 && <section className="operator-parameters">
          {allFields.map((field: CatalogParam) => <label key={field.key}>{isFa ? field.labelFa : humanize(field.key)}{selectedAction.requiredParams.some((required) => required.key === field.key) && <small>{copy.required}</small>}{field.type === "boolean" ? <select value={parameters[field.key] ?? ""} onChange={(event) => setParameters((current) => ({ ...current, [field.key]: event.target.value }))}><option value="">{copy.choose}</option><option value="true">true</option><option value="false">false</option></select> : <input type={field.type === "number" ? "number" : "text"} placeholder={field.placeholderFa} value={parameters[field.key] ?? ""} onChange={(event) => setParameters((current) => ({ ...current, [field.key]: event.target.value }))} />}</label>)}
        </section>}

        <fieldset className="operator-mode"><legend>{isFa ? "حالت اجرا" : "Run mode"}</legend>
          <label className={mode === "preview" ? "is-selected" : ""}><input type="radio" name="operator-mode" value="preview" checked={mode === "preview"} onChange={() => setMode("preview")} /><span><strong>{copy.previewOnly}</strong><small>{copy.previewHelp}</small></span></label>
          <label className={mode === "execute" ? "is-selected" : ""}><input type="radio" name="operator-mode" value="execute" checked={mode === "execute"} onChange={() => setMode("execute")} /><span><strong>{copy.executeNow}</strong><small>{copy.executeHelp}</small></span></label>
        </fieldset>

        {error && <div className="state-panel state-panel--error" role="alert">{error}</div>}
        <footer><p>{copy.connectorRequired}</p><button className="primary-button operator-execute" type="button" disabled={!selectedDevice || !credentialId || !selectedAction || !requiredComplete || actionBusy} onClick={() => void runOperatorAction()}>{actionBusy ? copy.running : mode === "execute" ? copy.execute : copy.generatePreview}</button></footer>
      </section>

      {selected && <section className={`operator-result operator-result--${selected.lifecycleState}`} aria-label={copy.result}>
        <header><div><p className="operator-eyebrow">{copy.result}</p><h2>{selected.actionType.replace(/_/g, " ")}</h2></div><StatusBadge value={lifecycleLabels[selected.lifecycleState]} tone={selected.lifecycleState === "succeeded" ? "good" : selected.lifecycleState === "failed" ? "danger" : "warning"} /></header>
        <p>{resultMessage(selected, isFa)}</p>
        <div className="operator-result__proof"><span>{copy.connectorProof}</span><strong>{selected.evidence.connectorInvoked ? "connectorInvoked=true" : "connectorInvoked=false"}</strong><small>{formatDate(selected.updatedAt, locale)}</small></div>
        {selected.controls.relatedDevicePath && <Link className="secondary-link" to={selected.controls.relatedDevicePath}>{isFa ? "باز کردن فضای کاری دستگاه" : "Open Device Workspace"}</Link>}
        <details className="operator-advanced"><summary>{copy.advanced}</summary><div><AdvancedBlock title="Command preview" value={selected.commandPreview} /><AdvancedBlock title="Validation" value={selected.validationJson} /><AdvancedBlock title="Connector result" value={selected.connectorResult} /><AdvancedBlock title="Evidence and audit" value={{ evidence: selected.evidence, audit: selected.audit }} /></div></details>
      </section>}

      <details className="operator-history" open={view === "history" || Boolean(initialActionPlanId)}>
        <summary><span><strong>{copy.history}</strong><small>{copy.historyHelp}</small></span><span>{total}</span></summary>
        <div className="operator-history__content">
          <div className="action-workspace__toolbar"><button className="secondary-button" type="button" onClick={onCreate}>{copy.fullLibrary}</button><nav className="action-workspace__views" aria-label={copy.history}><Link aria-current={view === "all" ? "page" : undefined} to="/actions">{isFa ? "همه" : "All"}</Link><Link aria-current={view === "pending" ? "page" : undefined} to="/actions/pending">{isFa ? "در انتظار" : "Pending"}</Link><Link aria-current={view === "history" ? "page" : undefined} to="/actions/history">{copy.history}</Link></nav></div>
          <div className="filter-bar action-workspace__filters"><input aria-label={copy.search} placeholder={copy.search} value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0); }} /><select aria-label={copy.lifecycle} value={status} onChange={(event) => { setStatus(event.target.value); setOffset(0); }}><option value="">{copy.allStates}</option>{Object.entries(lifecycleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <section className="table-shell action-list" aria-busy={historyBusy}>{historyBusy ? <div className="state-panel">{copy.loading}</div> : items.length === 0 ? <div className="state-panel">{copy.empty}</div> : <table><thead><tr><th>{copy.action}</th><th>{copy.device}</th><th>{copy.lifecycle}</th><th>{copy.updated}</th><th /></tr></thead><tbody>{items.map((item) => <tr key={item.id} className={selected?.id === item.id ? "is-selected" : ""}><td><strong>{item.actionType.replace(/_/g, " ")}</strong><small>{item.id}</small></td><td>{item.device?.name ?? "—"}</td><td><StatusBadge value={lifecycleLabels[item.lifecycleState]} tone={item.lifecycleState === "succeeded" ? "good" : item.lifecycleState === "failed" ? "danger" : "warning"} /></td><td>{formatDate(item.updatedAt, locale)}</td><td><button className="text-button" type="button" onClick={() => navigate(`/actions/${item.id}`)}>{copy.open}</button></td></tr>)}</tbody></table>}{!historyBusy && total > 0 && <div className="action-pagination"><button className="secondary-button" type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 10))}>{copy.previous}</button><span>{currentPage} / {pages}</span><button className="secondary-button" type="button" disabled={offset + 10 >= total} onClick={() => setOffset(offset + 10)}>{copy.next}</button></div>}</section>
        </div>
      </details>
    </section>
  );
}
