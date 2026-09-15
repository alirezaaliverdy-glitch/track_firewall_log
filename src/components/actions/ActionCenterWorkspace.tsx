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
import { actionExecutionPermission } from "@/lib/frontendPermissions";
import { useAuth } from "@/context/AuthContext";
import { InlineActionReviewPanel } from "@/features/actions/components/ActionReviewSheet";
import { ExecutionReviewDialog } from "@/features/actions/components/ExecutionReviewDialog";
import {
  actionDisplayName,
  fieldValue,
  formatDate,
  humanize,
  reviewParametersFrom,
  terminalLifecycle,
} from "@/features/actions/actionCenterWorkspaceModel";

export function ActionCenterWorkspace({ initialActionPlanId, onCreate }: { initialActionPlanId?: string; onCreate: () => void }) {
  const { i18n } = useTranslation();
  const { user } = useAuth();
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
    queued: "در انتظار اجرا", draft: "پیش‌نویس", needs_input: "نیازمند اطلاعات", ready_for_confirmation: "آماده تأیید", confirmed: "تأییدشده",
    executing: "در حال اجرا", succeeded: "موفق", failed: "ناموفق", skipped: "ردشده", cancelled: "لغوشده"
  } : {
    queued: "Queued", draft: "Draft", needs_input: "Needs input", ready_for_confirmation: "Preview ready", confirmed: "Confirmed",
    executing: "Executing", succeeded: "Succeeded", failed: "Failed", skipped: "Skipped", cancelled: "Cancelled"
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
  const [summary, setSummary] = useState<Partial<Record<ActionLifecycle, number>>>({});
  const [actionPlanCount, setActionPlanCount] = useState(0);
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
      setSummary(response.summary);
      setActionPlanCount(Object.values(response.summary).reduce((sum, count) => sum + count, 0));
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
  }, [selected]);

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
    const permission = actionExecutionPermission(user, selected.riskLevel, isFa);
    if (!permission.allowed) {
      setError(permission.reason ?? "Execution is not allowed for this role.");
      return;
    }
    setReviewParameters(reviewParametersFrom(selected.parametersJson));
    setReviewOpen(true);
  }

  async function executeSelected() {
    if (!selected?.controls.canConfirm && !selected?.controls.canExecute) return;
    const permission = actionExecutionPermission(user, selected.riskLevel, isFa);
    if (!permission.allowed) {
      setError(permission.reason ?? "Execution is not allowed for this role.");
      setReviewOpen(false);
      return;
    }
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

  async function clearAllHistory() {
    setHistoryBusy(true); setError(""); setHistoryNotice("");
    try {
      const response = await clearActionCenterHistory();
      setClearHistoryOpen(false);
      setSelected((current) => current?.lifecycleState === "executing" ? current : null);
      if (initialActionPlanId) navigate("/actions/history");
      setHistoryNotice(isFa ? `${response.archived} رکورد از تاریخچه پاک شد؛ ${response.retainedActive} عملیات در حال اجرا حفظ شد.` : `${response.archived} records cleared from history; ${response.retainedActive} executing actions preserved.`);
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
  const pendingCount = (summary.queued ?? 0) + (summary.ready_for_confirmation ?? 0) + (summary.confirmed ?? 0);
  const activeCount = summary.executing ?? 0;
  const succeededCount = summary.succeeded ?? 0;
  const failedCount = summary.failed ?? 0;
  const selectedHistoryId = selected?.id;
  const selectedExecutionPermission = selected
    ? actionExecutionPermission(user, selected.riskLevel, isFa)
    : { allowed: false, reason: null };
  const historyActionLabel = (item: ActionCenterItem) => {
    if (item.lifecycleState === "queued") return isFa ? "مشاهده زمان‌بندی" : "View schedule";
    if (item.controls.canPreview) return isFa ? "بررسی و ساخت پیش‌نمایش" : "Review and preview";
    if (item.controls.canConfirm || item.controls.canExecute) return isFa ? "بررسی و تأیید اجرا" : "Review and execute";
    if (item.lifecycleState === "failed") return isFa ? "بررسی و تلاش دوباره" : "Review and retry";
    if (item.lifecycleState === "succeeded") return isFa ? "مشاهده نتیجه" : "View result";
    return copy.open;
  };

  return (
    <section className="action-workspace operator-action-center" aria-label="Action Center">
      {!selected && <section className="operations-summary" aria-label={isFa ? "خلاصه وضعیت عملیات" : "Operations summary"}>
        <div className="operations-summary__intro"><span>{isFa ? "نمای سریع" : "At a glance"}</span><strong>{isFa ? `${actionPlanCount.toLocaleString("fa-IR")} عملیات ثبت‌شده` : `${actionPlanCount.toLocaleString("en-US")} recorded operations`}</strong></div>
        <div className="operations-summary__metric operations-summary__metric--pending"><span>{isFa ? "نیازمند بررسی" : "Needs review"}</span><strong>{pendingCount.toLocaleString(locale)}</strong></div>
        <div className="operations-summary__metric operations-summary__metric--active"><span>{isFa ? "در حال اجرا" : "Executing"}</span><strong>{activeCount.toLocaleString(locale)}</strong></div>
        <div className="operations-summary__metric operations-summary__metric--success"><span>{isFa ? "موفق" : "Succeeded"}</span><strong>{succeededCount.toLocaleString(locale)}</strong></div>
        <div className="operations-summary__metric operations-summary__metric--failed"><span>{isFa ? "ناموفق" : "Failed"}</span><strong>{failedCount.toLocaleString(locale)}</strong></div>
      </section>}

      {selected && <section ref={handoffRef} className="operator-handoff operations-review-focus" aria-label={isFa ? "اکشن انتخاب‌شده" : "Selected action"} tabIndex={-1}><InlineActionReviewPanel
        item={selected}
        actionName={selectedActionName}
        isFa={isFa}
        locale={locale}
        lifecycleLabel={lifecycleLabel}
        busy={actionBusy}
        canReview={selectedExecutionPermission.allowed}
        disabledReason={selectedExecutionPermission.reason}
        onPreview={() => void previewSelected()}
        onReview={openExecutionReview}
        onRetry={() => void repeatSelected()}
        onClose={() => {
          setSelected(null);
          if (initialActionPlanId) navigate("/actions");
        }}
      /></section>}
      {selected && reviewOpen && <ExecutionReviewDialog item={selected} actionName={selectedActionName} parameters={reviewParameters} permission={selectedExecutionPermission} busy={actionBusy} isFa={isFa} onParameterChange={(key, value) => setReviewParameters((current) => ({ ...current, [key]: value }))} onCancel={() => setReviewOpen(false)} onConfirm={() => void executeSelected()} />}
      {!selected && <div className="operations-compose-grid">
      <section className={`operator-connection operator-connection--${connectionTone}`} aria-label={copy.connection}>
        <header>
          <div><p className="operator-eyebrow">{isFa ? "آمادگی اجرا" : "Execution readiness"}</p><h2>{!selectedDevice ? (isFa ? "یک دستگاه انتخاب کنید" : "Select a device") : verification?.connected ? copy.connected : verification?.error ? copy.failed : copy.notTested}</h2><span>{!selectedDevice ? (isFa ? "پس از انتخاب دستگاه، وضعیت واقعی اتصال اینجا نمایش داده می‌شود." : "Live connection readiness appears here after selecting a device.") : copy.connectionHelp}</span></div>
          <div className="operator-connection__actions">
            <button className="secondary-button" type="button" disabled={!selectedDevice || !credentialId || connectionBusy} onClick={() => void runConnection(false)}>{connectionBusy ? copy.testing : copy.test}</button>
            <button className="secondary-button" type="button" disabled={!selectedDevice || connectionBusy} onClick={() => void refreshConnection()}>{copy.refresh}</button>
            {verification?.error && <button className="primary-button" type="button" disabled={connectionBusy} onClick={() => void runConnection(true)}>{copy.retry}</button>}
          </div>
        </header>
        {selectedDevice && <div className="operator-device-identity"><span>{selectedDevice.name}</span><strong dir="ltr">{selectedDevice.host}</strong><small>{selectedDevice.vendor} · {selectedDevice.protocol}</small></div>}
        {selectedDevice && <div className="operator-connection__grid">
          <div><span>{copy.lastSuccess}</span><strong>{formatDate(verification?.lastSuccessAt, locale)}</strong></div>
          <div><span>{copy.lastFailure}</span><strong>{formatDate(verification?.lastFailureAt ?? latestFailure?.attemptedAt, locale)}</strong></div>
          <div><span>{copy.connectorState}</span><strong>{verification?.connectorState ?? "unknown"}</strong><small>{verification?.connectorType ?? "—"}</small></div>
          <div><span>{copy.ssh}</span><strong>{verification?.sshReachability ?? "unknown"}</strong></div>
          <div><span>{copy.auth}</span><strong>{verification?.authenticationStatus ?? "unknown"}</strong></div>
        </div>}
        {verification?.error && <div className="operator-connection__error" role="alert">{verification.error}</div>}
      </section>

      <section className="operator-run-card" aria-label={copy.operatorAction}>
        <header><div><p className="operator-eyebrow">{isFa ? "ساخت عملیات" : "Build operation"}</p><h2>{isFa ? "چه کاری انجام شود؟" : "What should be done?"}</h2><span>{isFa ? "هدف، اعتبارنامه و عملیات را انتخاب کنید؛ ابتدا فقط یک پیش‌نمایش امن ساخته می‌شود." : "Choose the target, credential, and operation; an inspection-only preview is created first."}</span></div><span className="operator-run-card__safe-note">{isFa ? "بدون تغییر دستگاه" : "No device changes"}</span></header>
        <div className="operator-run-card__selectors">
          <label>{copy.selectDevice}<select aria-label={copy.selectDevice} value={deviceId} onChange={(event) => setDeviceId(event.target.value)}><option value="">{copy.choose}</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.name} · {device.vendor}</option>)}</select></label>
          <label>{copy.selectCredential}<select aria-label={copy.selectCredential} value={credentialId} disabled={!selectedDevice} onChange={(event) => setCredentialId(event.target.value)}><option value="">{copy.choose}</option>{credentials.map((credential) => <option key={credential.id} value={credential.id}>{credential.name} · {credential.type}</option>)}</select></label>
          <label>{copy.selectAction}<select aria-label={copy.selectAction} value={actionId} disabled={!selectedDevice} onChange={(event) => setActionId(event.target.value)}><option value="">{copy.choose}</option>{actions.map((action) => <option key={action.id} value={action.id}>{isFa ? action.titleFa : action.titleEn}</option>)}</select></label>
        </div>

        {selectedAction && allFields.length > 0 && <section className="operator-parameters">
          {allFields.map((field: CatalogParam) => <label key={field.key}>{isFa ? field.labelFa : humanize(field.key)}{selectedAction.requiredParams.some((required) => required.key === field.key) && <small>{copy.required}</small>}{field.type === "boolean" ? <select value={parameters[field.key] ?? ""} onChange={(event) => setParameters((current) => ({ ...current, [field.key]: event.target.value }))}><option value="">{copy.choose}</option><option value="true">true</option><option value="false">false</option></select> : <input type={field.type === "number" ? "number" : "text"} placeholder={field.placeholderFa} value={parameters[field.key] ?? ""} onChange={(event) => setParameters((current) => ({ ...current, [field.key]: event.target.value }))} />}</label>)}
        </section>}

        {error && <div className="state-panel state-panel--error" role="alert">{error}</div>}
        <footer><p>{isFa ? "مرحله بعد: بازبینی فرمان‌ها و تأیید صریح شما" : "Next: inspect generated commands and explicitly confirm"}</p><button className="primary-button operator-execute" type="button" disabled={!selectedDevice || !credentialId || !selectedAction || !requiredComplete || actionBusy} onClick={() => void runOperatorAction()}>{actionBusy ? copy.running : copy.generatePreview}</button></footer>
      </section>
      </div>}

      {!selected && <section className="operator-history">
        <header className="operator-history__header"><span><strong>{isFa ? "صف عملیات" : "Operations queue"}</strong><small>{isFa ? "موارد نیازمند بررسی، اجراهای اخیر و نتیجه‌ها در یک فهرست قابل جست‌وجو" : "Review requests, recent executions, and results in one searchable queue"}</small></span><span>{total.toLocaleString(locale)}</span></header>
        <div className="operator-history__content">
          <div className="action-workspace__toolbar"><div className="button-row"><button className="secondary-button" type="button" onClick={onCreate}>{copy.fullLibrary}</button><button className="danger-button" type="button" disabled={historyBusy || actionPlanCount === 0} onClick={() => setClearHistoryOpen(true)}>{isFa ? "پاک‌کردن تاریخچه" : "Clear history"}</button></div><nav className="action-workspace__views" aria-label={copy.history}><Link aria-current={view === "all" ? "page" : undefined} to="/actions">{isFa ? "همه" : "All"}</Link><Link aria-current={view === "pending" ? "page" : undefined} to="/actions/pending">{isFa ? "در انتظار" : "Pending"}</Link><Link aria-current={view === "history" ? "page" : undefined} to="/actions/history">{copy.history}</Link></nav></div>
          {clearHistoryOpen && <section className="destructive-confirm" role="alertdialog" aria-label={isFa ? "تأیید پاک‌کردن تاریخچه" : "Confirm clearing history"}><strong>{isFa ? "همه تاریخچه پاک شود؟" : "Clear all history?"}</strong><p>{isFa ? "همه ActionPlanها با هر وضعیت از تاریخچه پاک می‌شوند؛ فقط عملیات در حال اجرا حفظ می‌شود. اطلاعات Audit حذف فیزیکی نمی‌شود." : "ActionPlans in every state are cleared; only executing operations are preserved. Audit evidence is not physically deleted."}</p><div className="button-row"><button className="danger-button" type="button" disabled={historyBusy} onClick={() => void clearAllHistory()}>{isFa ? "بله، همه تاریخچه پاک شود" : "Yes, clear all history"}</button><button className="secondary-button" type="button" disabled={historyBusy} onClick={() => setClearHistoryOpen(false)}>{isFa ? "انصراف" : "Cancel"}</button></div></section>}
          {historyNotice && <div className="state-panel state-panel--success" role="status">{historyNotice}</div>}
          <div className="filter-bar action-workspace__filters"><input aria-label={copy.search} placeholder={copy.search} value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0); }} /><select aria-label={copy.lifecycle} value={status} onChange={(event) => { setStatus(event.target.value); setOffset(0); }}><option value="">{copy.allStates}</option>{Object.entries(lifecycleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <section className="table-shell action-list" aria-busy={historyBusy}>{historyBusy ? <div className="state-panel">{copy.loading}</div> : items.length === 0 ? <div className="state-panel">{copy.empty}</div> : <table><thead><tr><th>{copy.action}</th><th>{copy.device}</th><th>{copy.lifecycle}</th><th>{copy.updated}</th><th /></tr></thead><tbody>{items.map((item) => <tr key={item.id} className={selectedHistoryId === item.id ? "is-selected" : ""}><td><strong>{actionDisplayName(item, isFa)}</strong><small>{item.id}</small></td><td>{item.device?.name || (isFa ? "اطلاعات موجود نیست" : "Not available")}</td><td><StatusBadge value={lifecycleLabel(item.lifecycleState)} tone={item.lifecycleState === "succeeded" ? "good" : item.lifecycleState === "failed" ? "danger" : "warning"} /></td><td>{formatDate(item.updatedAt, locale)}</td><td><button className={item.controls.canPreview || item.controls.canConfirm || item.controls.canExecute ? "primary-button" : "text-button"} type="button" onClick={() => navigate(`/actions/${encodeURIComponent(item.id)}`)}>{historyActionLabel(item)}</button></td></tr>)}</tbody></table>}{!historyBusy && total > 0 && <div className="action-pagination"><button className="secondary-button" type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 10))}>{copy.previous}</button><span>{currentPage} / {pages}</span><button className="secondary-button" type="button" disabled={offset + 10 >= total} onClick={() => setOffset(offset + 10)}>{copy.next}</button></div>}</section>
        </div>
      </section>}
    </section>
  );
}
