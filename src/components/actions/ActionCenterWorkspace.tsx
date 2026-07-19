import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { correctActionFields, quickExecuteAction } from "@/lib/actions";
import { clearActionCenterHistory, getActionCenterItem, listActionCenter, retryActionCenterItem, type ActionCenterItem, type ActionLifecycle } from "@/lib/actionCenter";
import { createCatalogAction, searchCommands, type CatalogItem, type CatalogParam } from "@/lib/commandCatalog";
import { listCredentials, type DeviceCredential } from "@/lib/credentials";
import { getDeviceVerification, retryDeviceVerification, testDeviceVerification, type DeviceVerification } from "@/lib/deviceOnboarding";
import { listDevices, updateDevice, type Device } from "@/lib/devices";
import { StatusBadge } from "@/components/ui/StatusBadge";

function formatDate(value: string | null | undefined, locale: string) {
  if (!value) return locale === "fa-IR" ? "اطلاعات موجود نیست" : "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? (locale === "fa-IR" ? "اطلاعات موجود نیست" : "Not available") : date.toLocaleString(locale);
}

function pretty(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function humanize(value: string) {
  return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function actionDisplayName(action: ActionCenterItem, isFa: boolean) {
  const metadata = record(action.parametersJson.metadata);
  const catalogTitle = isFa ? metadata.catalogTitleFa : metadata.catalogTitleEn ?? metadata.catalogTitleFa;
  if (typeof catalogTitle === "string" && catalogTitle.trim()) return catalogTitle.trim();
  const requested = metadata.requestedActionType ?? metadata.actionType;
  if ((action.actionType === "custom_vendor_action" || action.actionType === "generic_security_action") && typeof requested === "string" && requested.trim()) {
    return humanize(requested);
  }
  return action.actionType ? humanize(action.actionType) : (isFa ? "اطلاعات موجود نیست" : "Not available");
}

function fieldValue(value: unknown) {
  if (typeof value === "boolean") return value ? "true" : "false";
  return value === undefined || value === null ? "" : String(value);
}

function terminalLifecycle(value: ActionLifecycle) {
  return value === "succeeded" || value === "failed" || value === "cancelled";
}

function reviewParametersFrom(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([key, item]) => key !== "metadata" && (item === null || ["string", "number", "boolean"].includes(typeof item))).map(([key, item]) => [key, fieldValue(item)]));
}

function commandLines(preview: Record<string, unknown>) {
  const candidates = [preview.plannedCommands, preview.commands, preview.generatedCommands, preview.command];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.map((item) => typeof item === "string" ? item : fieldValue((item as Record<string, unknown>)?.command)).filter(Boolean);
    if (typeof candidate === "string" && candidate.trim()) return [candidate];
  }
  return [];
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
  const handoffRef = useRef<HTMLElement | null>(null);
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
    connectorRequired: "موفقیت فقط وقتی پذیرفته می‌شود که اجرای واقعی کانکتور ثبت شده باشد."
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
    connectorRequired: "Success is accepted only when real connector execution is recorded."
  };

  const lifecycleLabels: Record<ActionLifecycle, string> = isFa ? {
    draft: "پیش‌نویس", needs_input: "نیازمند اطلاعات", ready_for_confirmation: "آماده تأیید", confirmed: "تأییدشده",
    executing: "در حال اجرا", succeeded: "موفق", failed: "ناموفق", cancelled: "لغوشده"
  } : {
    draft: "Draft", needs_input: "Needs input", ready_for_confirmation: "Preview ready", confirmed: "Confirmed",
    executing: "Executing", succeeded: "Succeeded", failed: "Failed", cancelled: "Cancelled"
  };
  const lifecycleLabel = (value: ActionLifecycle) => lifecycleLabels[value] ?? (isFa ? "اطلاعات موجود نیست" : "Not available");

  const [devices, setDevices] = useState<Device[]>([]);
  const [credentials, setCredentials] = useState<DeviceCredential[]>([]);
  const [actions, setActions] = useState<CatalogItem[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [credentialId, setCredentialId] = useState("");
  const [actionId, setActionId] = useState("");
  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [verification, setVerification] = useState<DeviceVerification | null>(null);
  const [selected, setSelected] = useState<ActionCenterItem | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewParameters, setReviewParameters] = useState<Record<string, string>>({});
  const [connectionBusy, setConnectionBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<ActionCenterItem[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [historyBusy, setHistoryBusy] = useState(true);
  const [clearHistoryOpen, setClearHistoryOpen] = useState(false);
  const [historyNotice, setHistoryNotice] = useState("");

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
    if (!initialActionPlanId || selected?.id !== initialActionPlanId) return;
    handoffRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    handoffRef.current?.focus({ preventScroll: true });
  }, [initialActionPlanId, selected?.id]);
  useEffect(() => {
    if (!deviceId && selected?.deviceId && devices.some((device) => device.id === selected.deviceId)) {
      setDeviceId(selected.deviceId);
    }
  }, [deviceId, devices, selected?.deviceId]);

  useEffect(() => {
    if (!selected) return;
    setReviewParameters(reviewParametersFrom(selected.parametersJson));
  }, [selected?.id, selected?.updatedAt]);

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
      await quickExecuteAction(plan.id, { intent: "preview", reason: "Preview generated from operator Action Center" });
      await Promise.all([loadDetail(plan.id), loadHistory()]);
      navigate(`/actions/${plan.id}`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Operator action failed.");
      await loadHistory();
    } finally {
      setActionBusy(false);
    }
  }

  async function pollActionUntilTerminal(id: string) {
    const deadline = Date.now() + 120000;
    let latest = await getActionCenterItem(id);
    setSelected(latest);
    while (!terminalLifecycle(latest.lifecycleState) && Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      latest = await getActionCenterItem(id);
      setSelected(latest);
    }
    return latest;
  }

  function openExecutionReview() {
    if (!selected) return;
    setReviewParameters(reviewParametersFrom(selected.parametersJson));
    setReviewOpen(true);
  }

  async function executeSelected() {
    if (!selected?.controls.canConfirm && !selected?.controls.canExecute) return;
    const actionPlanId = selected.id;
    setActionBusy(true);
    setError("");
    setReviewOpen(false);
    try {
      const currentParams = reviewParametersFrom(selected.parametersJson);
      const changedFields = Object.fromEntries(Object.entries(reviewParameters).filter(([key, value]) => currentParams[key] !== value));
      if (Object.keys(changedFields).length > 0 && selected.controls.canEditParameters) {
        await correctActionFields(actionPlanId, changedFields);
        await quickExecuteAction(actionPlanId, { intent: "preview", reason: "Preview refreshed after parameter edits in Action Center review" });
      }
      await quickExecuteAction(actionPlanId, { intent: "execute", reason: "Explicitly confirmed and executed from operator Action Center review" });
      await pollActionUntilTerminal(actionPlanId);
      await Promise.all([loadDetail(actionPlanId), loadHistory()]);
      navigate(`/actions/${encodeURIComponent(actionPlanId)}/result`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Execution failed.");
      await loadDetail(actionPlanId).catch(() => undefined);
      navigate(`/actions/${encodeURIComponent(actionPlanId)}/result`);
    } finally { setActionBusy(false); }
  }

  async function previewSelected() {
    if (!selected?.controls.canPreview) return;
    setActionBusy(true);
    setError("");
    try {
      await quickExecuteAction(selected.id, { intent: "preview", reason: "Preview requested from Action Center handoff" });
      await Promise.all([loadDetail(selected.id), loadHistory()]);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Preview failed.");
      await loadDetail(selected.id).catch(() => undefined);
    } finally { setActionBusy(false); }
  }

  async function repeatSelected() {
    if (!selected) return;
    setActionBusy(true);
    setError("");
    try {
      const next = await retryActionCenterItem(selected.id);
      setSelected(next);
      await loadHistory();
      navigate(`/actions/${next.id}`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not create a new run."); }
    finally { setActionBusy(false); }
  }

  async function clearCompletedHistory() {
    setHistoryBusy(true); setError(""); setHistoryNotice("");
    try {
      const response = await clearActionCenterHistory();
      setClearHistoryOpen(false);
      setSelected((current) => current && ["succeeded", "failed", "cancelled"].includes(current.lifecycleState) ? null : current);
      if (initialActionPlanId) navigate("/actions/history");
      setHistoryNotice(isFa ? `${response.deleted} رکورد نهایی حذف شد؛ ${response.retainedActive} اکشن فعال حفظ شد.` : `${response.deleted} completed records deleted; ${response.retainedActive} active actions preserved.`);
      setOffset(0);
      await loadHistory();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not clear ActionPlan history."); }
    finally { setHistoryBusy(false); }
  }

  const latestFailure = verification?.history.find((attempt) => !attempt.connected && Boolean(attempt.error));
  const connectionTone = verification?.connected ? "connected" : verification?.error ? "failed" : "unknown";
  const pages = Math.max(1, Math.ceil(total / 10));
  const currentPage = Math.floor(offset / 10) + 1;
  const selectedActionName = selected ? actionDisplayName(selected, isFa) : "";
  const historyActionLabel = (item: ActionCenterItem) => {
    if (item.controls.canPreview) return isFa ? "بررسی و ساخت پیش‌نمایش" : "Review and preview";
    if (item.controls.canConfirm || item.controls.canExecute) return isFa ? "بررسی و تأیید اجرا" : "Review and execute";
    if (item.lifecycleState === "failed") return isFa ? "بررسی و تلاش دوباره" : "Review and retry";
    if (item.lifecycleState === "succeeded") return isFa ? "مشاهده نتیجه" : "View result";
    return copy.open;
  };

  return (
    <section className="action-workspace operator-action-center" aria-label="Action Center">
      {selected && <section ref={handoffRef} className="operator-handoff" aria-label={isFa ? "اکشن انتخاب‌شده" : "Selected action"} tabIndex={-1}>
        <div><p className="operator-eyebrow">{isFa ? "اکشن آماده بررسی" : "Action ready for review"}</p><h2>{selectedActionName}</h2><span>{selected.device?.name || (isFa ? "اطلاعات دستگاه موجود نیست" : "Device information is not available")}</span></div>
        <div className="operator-result__actions">
          {selected.controls.canPreview && <button className="primary-button operator-execute" type="button" disabled={actionBusy} onClick={() => void previewSelected()}>{actionBusy ? copy.running : (isFa ? "ساخت پیش‌نمایش" : "Generate Preview")}</button>}
          {(selected.controls.canConfirm || selected.controls.canExecute) && <button className="primary-button operator-execute" type="button" disabled={actionBusy} onClick={openExecutionReview}>{actionBusy ? copy.running : selected.lifecycleState === "ready_for_confirmation" ? (isFa ? "تأیید و اجرا" : "Confirm and Execute") : copy.executeNow}</button>}
          {selected.lifecycleState === "failed" && <button className="primary-button" type="button" disabled={actionBusy} onClick={() => void repeatSelected()}>{isFa ? "تلاش دوباره" : "Retry"}</button>}
          {selected.lifecycleState === "succeeded" && <button className="primary-button" type="button" disabled={actionBusy} onClick={() => void repeatSelected()}>{isFa ? "اجرای دوباره" : "Run again"}</button>}
        </div>
      </section>}
      {selected && reviewOpen && <section className="action-review-dialog" role="dialog" aria-modal="true" aria-label="Execution review"><div className="action-review-dialog__card"><header><div><p className="operator-eyebrow">Explicit confirmation</p><h2>Review action execution</h2></div><button className="secondary-button" type="button" disabled={actionBusy} onClick={() => setReviewOpen(false)}>Close</button></header><dl className="detail-list"><dt>Target device</dt><dd>{selected.device?.name ?? selected.deviceId ?? "-"}</dd><dt>Action purpose</dt><dd>{selectedActionName}</dd><dt>Risk</dt><dd>{selected.riskLevel}</dd><dt>Backup requirement</dt><dd>{String(selected.rollback.required ?? selected.commandPreview.requiresBackup ?? selected.validationJson.requiresBackup ?? "Not specified")}</dd></dl><section><h3>Generated commands</h3>{commandLines(selected.commandPreview).length ? <ol className="command-review-list">{commandLines(selected.commandPreview).map((command, index) => <li key={`${command}-${index}`}><code dir="ltr">{command}</code></li>)}</ol> : <p>Generate a preview first to show commands.</p>}</section><section><h3>Editable parameters</h3>{Object.keys(reviewParameters).length ? <div className="operator-parameters">{Object.entries(reviewParameters).map(([key, value]) => <label key={key}>{humanize(key)}<input value={value} onChange={(event) => setReviewParameters((current) => ({ ...current, [key]: event.target.value }))} /></label>)}</div> : <p>No simple editable parameters are available.</p>}</section><footer className="button-row"><button className="secondary-button" type="button" disabled={actionBusy} onClick={() => setReviewOpen(false)}>Cancel</button><button className="primary-button operator-execute" type="button" disabled={actionBusy} onClick={() => void executeSelected()}>{actionBusy ? copy.running : "Confirm and execute"}</button></footer></div></section>}
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

        {error && <div className="state-panel state-panel--error" role="alert">{error}</div>}
        <footer><p>{copy.previewHelp}</p><button className="primary-button operator-execute" type="button" disabled={!selectedDevice || !credentialId || !selectedAction || !requiredComplete || actionBusy} onClick={() => void runOperatorAction()}>{actionBusy ? copy.running : copy.generatePreview}</button></footer>
      </section>

      {selected && <section className={`operator-result operator-result--${selected.lifecycleState}`} aria-label={copy.result}>
        <header><div><p className="operator-eyebrow">{copy.result}</p><h2>{selectedActionName}</h2></div><StatusBadge value={lifecycleLabel(selected.lifecycleState)} tone={selected.lifecycleState === "succeeded" ? "good" : selected.lifecycleState === "failed" ? "danger" : "warning"} /></header>
        <p>{resultMessage(selected, isFa)}</p>
        <div className="operator-result__proof"><span>{copy.connectorProof}</span><strong>{selected.evidence.connectorInvoked ? (isFa ? "اجرای کانکتور ثبت شد" : "Connector execution recorded") : (isFa ? "فقط پیش‌نمایش یا توقف قبل از اجرا" : "Preview only or stopped before execution")}</strong><small>{formatDate(selected.updatedAt, locale)}</small></div>
        {!selected.support.executable && <div className="state-panel state-panel--error" role="alert"><strong>{isFa ? "غیرقابل اجرا" : "Unsupported action"}</strong><p>{String(selected.support.reason ?? (isFa ? "برای این فروشنده Connector ثبت‌شده‌ای وجود ندارد." : "No registered connector supports this action for the selected vendor."))}</p></div>}
        <div className="operator-result__actions">
          {selected.controls.canPreview && <button className="primary-button operator-execute" type="button" disabled={actionBusy} onClick={() => void previewSelected()}>{actionBusy ? copy.running : (isFa ? "ساخت پیش‌نمایش" : "Generate Preview")}</button>}
          {(selected.controls.canConfirm || selected.controls.canExecute) && <button className="primary-button operator-execute" type="button" disabled={actionBusy} onClick={openExecutionReview}>{actionBusy ? copy.running : selected.lifecycleState === "ready_for_confirmation" ? (isFa ? "تأیید و اجرا" : "Confirm and Execute") : copy.executeNow}</button>}
          {selected.lifecycleState === "failed" && <button className="primary-button" type="button" disabled={actionBusy} onClick={() => void repeatSelected()}>{isFa ? "تلاش دوباره" : "Retry"}</button>}
          {selected.lifecycleState === "succeeded" && <button className="primary-button" type="button" disabled={actionBusy} onClick={() => void repeatSelected()}>{isFa ? "اجرای دوباره" : "Run again"}</button>}
        </div>
        {(selected.lifecycleState === "executing" || selected.connectorResult.stdout !== undefined || selected.connectorResult.stderr !== undefined) && <section className="operator-live-result" aria-live="polite"><h3>{isFa ? "خروجی زنده" : "Live result"}</h3><p><strong>{isFa ? "وضعیت نهایی" : "Final status"}:</strong> {lifecycleLabel(selected.lifecycleState)}</p><h4>stdout</h4><pre>{String(selected.connectorResult.stdout ?? (isFa ? "اطلاعات موجود نیست" : "Not available"))}</pre><h4>stderr</h4><pre>{String(selected.connectorResult.stderr ?? (isFa ? "اطلاعات موجود نیست" : "Not available"))}</pre><h4>{isFa ? "شواهد" : "Evidence"}</h4><pre>{pretty(selected.evidence)}</pre></section>}
        {selected.controls.relatedDevicePath && <Link className="secondary-link" to={selected.controls.relatedDevicePath}>{isFa ? "باز کردن فضای کاری دستگاه" : "Open Device Workspace"}</Link>}
        <details className="operator-advanced"><summary>{copy.advanced}</summary><div><AdvancedBlock title="Command preview" value={selected.commandPreview} /><AdvancedBlock title="Validation" value={selected.validationJson} /><AdvancedBlock title="Connector result" value={selected.connectorResult} /><AdvancedBlock title="Evidence and audit" value={{ evidence: selected.evidence, audit: selected.audit }} /></div></details>
      </section>}

      <details className="operator-history" open={view === "history" || Boolean(initialActionPlanId)}>
        <summary><span><strong>{copy.history}</strong><small>{copy.historyHelp}</small></span><span>{total}</span></summary>
        <div className="operator-history__content">
          <div className="action-workspace__toolbar"><div className="button-row"><button className="secondary-button" type="button" onClick={onCreate}>{copy.fullLibrary}</button><button className="danger-button" type="button" disabled={historyBusy || total === 0} onClick={() => setClearHistoryOpen(true)}>{isFa ? "پاک‌کردن تاریخچه" : "Clear history"}</button></div><nav className="action-workspace__views" aria-label={copy.history}><Link aria-current={view === "all" ? "page" : undefined} to="/actions">{isFa ? "همه" : "All"}</Link><Link aria-current={view === "pending" ? "page" : undefined} to="/actions/pending">{isFa ? "در انتظار" : "Pending"}</Link><Link aria-current={view === "history" ? "page" : undefined} to="/actions/history">{copy.history}</Link></nav></div>
          {clearHistoryOpen && <section className="destructive-confirm" role="alertdialog" aria-label={isFa ? "تأیید پاک‌کردن تاریخچه" : "Confirm clearing history"}><strong>{isFa ? "تاریخچه نهایی پاک شود؟" : "Clear completed history?"}</strong><p>{isFa ? "اکشن‌های موفق، ناموفق و لغوشده همراه Audit وابسته حذف می‌شوند. اکشن‌های در انتظار یا در حال اجرا حفظ می‌شوند." : "Succeeded, failed, and cancelled actions and their related audit are deleted. Pending or executing actions are preserved."}</p><div className="button-row"><button className="danger-button" type="button" disabled={historyBusy} onClick={() => void clearCompletedHistory()}>{isFa ? "بله، تاریخچه نهایی پاک شود" : "Yes, clear completed history"}</button><button className="secondary-button" type="button" disabled={historyBusy} onClick={() => setClearHistoryOpen(false)}>{isFa ? "انصراف" : "Cancel"}</button></div></section>}
          {historyNotice && <div className="state-panel state-panel--success" role="status">{historyNotice}</div>}
          <div className="filter-bar action-workspace__filters"><input aria-label={copy.search} placeholder={copy.search} value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0); }} /><select aria-label={copy.lifecycle} value={status} onChange={(event) => { setStatus(event.target.value); setOffset(0); }}><option value="">{copy.allStates}</option>{Object.entries(lifecycleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <section className="table-shell action-list" aria-busy={historyBusy}>{historyBusy ? <div className="state-panel">{copy.loading}</div> : items.length === 0 ? <div className="state-panel">{copy.empty}</div> : <table><thead><tr><th>{copy.action}</th><th>{copy.device}</th><th>{copy.lifecycle}</th><th>{copy.updated}</th><th /></tr></thead><tbody>{items.map((item) => <tr key={item.id} className={selected?.id === item.id ? "is-selected" : ""}><td><strong>{actionDisplayName(item, isFa)}</strong><small>{item.id}</small></td><td>{item.device?.name || (isFa ? "اطلاعات موجود نیست" : "Not available")}</td><td><StatusBadge value={lifecycleLabel(item.lifecycleState)} tone={item.lifecycleState === "succeeded" ? "good" : item.lifecycleState === "failed" ? "danger" : "warning"} /></td><td>{formatDate(item.updatedAt, locale)}</td><td><button className={item.controls.canPreview || item.controls.canConfirm || item.controls.canExecute ? "primary-button" : "text-button"} type="button" onClick={() => navigate(`/actions/${encodeURIComponent(item.id)}`)}>{historyActionLabel(item)}</button></td></tr>)}</tbody></table>}{!historyBusy && total > 0 && <div className="action-pagination"><button className="secondary-button" type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 10))}>{copy.previous}</button><span>{currentPage} / {pages}</span><button className="secondary-button" type="button" disabled={offset + 10 >= total} onClick={() => setOffset(offset + 10)}>{copy.next}</button></div>}</section>
        </div>
      </details>
    </section>
  );
}
