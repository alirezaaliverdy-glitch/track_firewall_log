import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { approveAction, correctActionFields, dryRunAction, executeAction } from "@/lib/actions";
import {
  cancelActionCenterItem,
  getActionCenterItem,
  listActionCenter,
  retryActionCenterItem,
  updateActionCenterTarget,
  type ActionCenterItem,
  type ActionLifecycle
} from "@/lib/actionCenter";
import { listDevices, updateDevice, type Device } from "@/lib/devices";
import { listCredentials, type DeviceCredential } from "@/lib/credentials";
import { StatusBadge } from "@/components/ui/StatusBadge";

const LIFECYCLE: ActionLifecycle[] = ["draft", "needs_input", "ready_for_confirmation", "confirmed", "executing", "succeeded", "failed", "cancelled"];
const TERMINAL = new Set<ActionLifecycle>(["succeeded", "failed", "cancelled"]);

function date(value: string, locale: string) {
  return value ? new Date(value).toLocaleString(locale) : "—";
}

function pretty(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function editableParameters(item: ActionCenterItem) {
  return Object.fromEntries(Object.entries(item.parametersJson).filter(([key, value]) => key !== "metadata" && !["deviceId", "vendor", "actionType", "executionSupport"].includes(key) && ["string", "number", "boolean"].includes(typeof value)).map(([key, value]) => [key, String(value)]));
}

function EvidenceBlock({ title, value }: { title: string; value: unknown }) {
  return <section className="action-detail-block"><h3>{title}</h3><pre>{pretty(value)}</pre></section>;
}

export function ActionCenterWorkspace({ initialActionPlanId, onCreate }: { initialActionPlanId?: string; onCreate: () => void }) {
  const { i18n } = useTranslation();
  const isFa = i18n.language?.startsWith("fa") ?? false;
  const locale = isFa ? "fa-IR" : "en-US";
  const location = useLocation();
  const navigate = useNavigate();
  const view = location.pathname === "/actions/pending" ? "pending" : location.pathname === "/actions/history" ? "history" : "all";
  const [items, setItems] = useState<ActionCenterItem[]>([]);
  const [summary, setSummary] = useState<Record<ActionLifecycle, number>>({ draft: 0, needs_input: 0, ready_for_confirmation: 0, confirmed: 0, executing: 0, succeeded: 0, failed: 0, cancelled: 0 });
  const [selected, setSelected] = useState<ActionCenterItem | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [deviceFilter, setDeviceFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [credentials, setCredentials] = useState<DeviceCredential[]>([]);
  const [targetDeviceId, setTargetDeviceId] = useState("");
  const [credentialId, setCredentialId] = useState("");
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [showEvidence, setShowEvidence] = useState(false);
  const [showResult, setShowResult] = useState(false);

  const copy = isFa ? {
    create: "ساخت ActionPlan", refresh: "تازه‌سازی", summary: "خلاصه چرخه اقدام", search: "جست‌وجوی اقدام، دستگاه یا شناسه",
    allStates: "همه وضعیت‌ها", allDevices: "همه دستگاه‌ها", action: "اقدام", device: "دستگاه", lifecycle: "چرخه", risk: "ریسک",
    updated: "به‌روزرسانی", controls: "کنترل‌ها", review: "بررسی", details: "جزئیات ActionPlan", close: "بستن جزئیات",
    edit: "ویرایش پارامترها", save: "ذخیره پارامترها", selectDevice: "انتخاب دستگاه", applyDevice: "اعمال دستگاه",
    selectCredential: "انتخاب اعتبارنامه", applyCredential: "اعمال اعتبارنامه", preview: "پیش‌نمایش دستورها", confirm: "تأیید",
    execute: "اجرا", retry: "تلاش دوباره", cancel: "لغو", evidence: "مشاهده شواهد", connectorResult: "مشاهده نتیجه Connector",
    openDevice: "باز کردن فضای کاری دستگاه", commandPreview: "پیش‌نمایش فرمان", backend: "پاسخ Backend", connector: "نتیجه Connector",
    audit: "شواهد و Audit", loading: "در حال دریافت ActionPlanها…", empty: "ActionPlan مطابق این فیلتر وجود ندارد.",
    unauthorized: "برای مشاهده Action Center باید وارد شوید.", notFound: "ActionPlan درخواست‌شده پیدا نشد.", previous: "قبلی", next: "بعدی",
    unsupported: "این اقدام Connector پشتیبانی‌شده و تأییدشده ندارد؛ اجرا غیرفعال است.", connectorRequired: "موفقیت فقط با connectorInvoked=true پذیرفته می‌شود.",
    noFields: "پارامتر قابل ویرایشی برای این ActionPlan وجود ندارد."
  } : {
    create: "Create ActionPlan", refresh: "Refresh", summary: "Action lifecycle summary", search: "Search action, device, or ID",
    allStates: "All states", allDevices: "All devices", action: "Action", device: "Device", lifecycle: "Lifecycle", risk: "Risk",
    updated: "Updated", controls: "Controls", review: "Review", details: "ActionPlan details", close: "Close details",
    edit: "Edit parameters", save: "Save parameters", selectDevice: "Select device", applyDevice: "Apply device",
    selectCredential: "Select credential", applyCredential: "Apply credential", preview: "Preview commands", confirm: "Confirm",
    execute: "Execute", retry: "Retry", cancel: "Cancel", evidence: "View evidence", connectorResult: "View connector result",
    openDevice: "Open related device workspace", commandPreview: "Command preview", backend: "Backend response", connector: "Connector result",
    audit: "Evidence and audit", loading: "Loading ActionPlans…", empty: "No ActionPlan matches these filters.",
    unauthorized: "Sign in to view Action Center.", notFound: "The requested ActionPlan was not found.", previous: "Previous", next: "Next",
    unsupported: "This action has no verified connector support; Execute is disabled.", connectorRequired: "Success is accepted only when connectorInvoked=true.",
    noFields: "This ActionPlan has no editable parameters."
  };

  const labels: Record<ActionLifecycle, string> = isFa ? {
    draft: "پیش‌نویس", needs_input: "نیازمند اطلاعات", ready_for_confirmation: "آماده تأیید", confirmed: "تأییدشده",
    executing: "در حال اجرا", succeeded: "موفق", failed: "ناموفق", cancelled: "لغوشده"
  } : {
    draft: "Draft", needs_input: "Needs input", ready_for_confirmation: "Ready for confirmation", confirmed: "Confirmed",
    executing: "Executing", succeeded: "Succeeded", failed: "Failed", cancelled: "Cancelled"
  };

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await listActionCenter({ view, q: query, status, deviceId: deviceFilter, offset, limit: 25 });
      setItems(result.items); setSummary(result.summary); setTotal(result.total);
    } catch (failure) {
      const statusCode = (failure as Error & { status?: number }).status;
      setError(statusCode === 401 || statusCode === 403 ? copy.unauthorized : failure instanceof Error ? failure.message : "Action Center failed.");
    } finally { setLoading(false); }
  }, [copy.unauthorized, deviceFilter, offset, query, status, view]);

  const loadDetail = useCallback(async (id: string) => {
    setNotFound(false); setError("");
    try {
      const item = await getActionCenterItem(id);
      setSelected(item); setTargetDeviceId(item.deviceId ?? ""); setFields(editableParameters(item)); setEditing(false);
      setCredentialId("");
    } catch (failure) {
      if ((failure as Error & { status?: number }).status === 404) { setSelected(null); setNotFound(true); }
      else setError(failure instanceof Error ? failure.message : "Action detail failed.");
    }
  }, []);

  useEffect(() => { void Promise.all([listDevices().then(setDevices), listCredentials().then(setCredentials)]).catch(() => undefined); }, []);
  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => { if (initialActionPlanId) void loadDetail(initialActionPlanId); else { setSelected(null); setNotFound(false); } }, [initialActionPlanId, loadDetail]);

  const run = async (name: string, operation: () => Promise<unknown>, options?: { selectReturned?: boolean }) => {
    if (!selected) return;
    setWorking(name); setError("");
    try {
      const result = await operation();
      const nextId = options?.selectReturned && result && typeof result === "object" && "id" in result ? String((result as { id: unknown }).id) : selected.id;
      await loadList(); await loadDetail(nextId);
      if (nextId !== initialActionPlanId) navigate(`/actions/${nextId}`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : `${name} failed.`); await loadDetail(selected.id).catch(() => undefined); }
    finally { setWorking(""); }
  };

  const saveParameters = () => run("edit", () => correctActionFields(selected!.id, fields));
  const visiblePages = Math.max(1, Math.ceil(total / 25));
  const currentPage = Math.floor(offset / 25) + 1;
  const detailConnectorInvoked = selected?.evidence.connectorInvoked === true;

  return (
    <section className="action-workspace" aria-label="Action Center">
      <div className="action-workspace__toolbar">
        <button className="primary-button" type="button" onClick={onCreate}>{copy.create}</button>
        <button className="secondary-button" type="button" disabled={loading} onClick={() => void loadList()}>{copy.refresh}</button>
        <nav className="action-workspace__views" aria-label={copy.summary}>
          <Link aria-current={view === "all" ? "page" : undefined} to="/actions">{isFa ? "همه" : "All"}</Link>
          <Link aria-current={view === "pending" ? "page" : undefined} to="/actions/pending">{isFa ? "در انتظار" : "Pending"}</Link>
          <Link aria-current={view === "history" ? "page" : undefined} to="/actions/history">{isFa ? "تاریخچه" : "History"}</Link>
        </nav>
      </div>

      <section className="action-lifecycle-summary" aria-label={copy.summary}>
        {LIFECYCLE.map((state) => <button key={state} type="button" aria-pressed={status === state} onClick={() => { setStatus(status === state ? "" : state); setOffset(0); }}><span>{labels[state]}</span><strong>{summary[state]}</strong></button>)}
      </section>

      <div className="filter-bar action-workspace__filters">
        <input aria-label={copy.search} placeholder={copy.search} value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0); }} />
        <select aria-label={copy.lifecycle} value={status} onChange={(event) => { setStatus(event.target.value); setOffset(0); }}><option value="">{copy.allStates}</option>{LIFECYCLE.map((state) => <option key={state} value={state}>{labels[state]}</option>)}</select>
        <select aria-label={copy.device} value={deviceFilter} onChange={(event) => { setDeviceFilter(event.target.value); setOffset(0); }}><option value="">{copy.allDevices}</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.name} · {device.vendor}</option>)}</select>
      </div>

      {error && <div className="state-panel state-panel--error" role="alert">{error}</div>}
      {notFound && <div className="state-panel state-panel--error"><p>{copy.notFound}</p><Link className="secondary-link" to="/actions">Action Center</Link></div>}
      <div className={`action-workspace__body ${selected ? "has-detail" : ""}`}>
        <section className="table-shell action-list" aria-busy={loading}>
          {loading ? <div className="state-panel">{copy.loading}</div> : items.length === 0 ? <div className="state-panel">{copy.empty}</div> : <table><thead><tr><th>{copy.action}</th><th>{copy.device}</th><th>{copy.lifecycle}</th><th>{copy.risk}</th><th>{copy.updated}</th><th>{copy.controls}</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className={selected?.id === item.id ? "is-selected" : ""}><td><strong>{item.actionType.replace(/_/g, " ")}</strong><small>{item.id}</small></td><td>{item.device?.name ?? "—"}<small>{item.device?.vendor ?? ""}</small></td><td><StatusBadge value={labels[item.lifecycleState]} tone={item.lifecycleState === "succeeded" ? "good" : item.lifecycleState === "failed" ? "danger" : TERMINAL.has(item.lifecycleState) ? "neutral" : "warning"} /></td><td>{item.riskLevel}</td><td>{date(item.updatedAt, locale)}</td><td><button className="text-button" type="button" onClick={() => navigate(`/actions/${item.id}`)}>{copy.review}</button></td></tr>)}</tbody></table>}
          {!loading && total > 0 && <div className="action-pagination"><button className="secondary-button" type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))}>{copy.previous}</button><span>{currentPage} / {visiblePages}</span><button className="secondary-button" type="button" disabled={offset + 25 >= total} onClick={() => setOffset(offset + 25)}>{copy.next}</button></div>}
        </section>

        {selected && <aside className="action-detail" aria-label={copy.details}>
          <header><div><p>ActionPlan</p><h2>{selected.actionType.replace(/_/g, " ")}</h2><small>{selected.id}</small></div><button className="text-button" type="button" onClick={() => navigate(view === "pending" ? "/actions/pending" : view === "history" ? "/actions/history" : "/actions")}>{copy.close}</button></header>
          <div className="action-detail__status"><StatusBadge value={labels[selected.lifecycleState]} tone={selected.lifecycleState === "succeeded" ? "good" : selected.lifecycleState === "failed" ? "danger" : "warning"} /><span>{selected.riskLevel}</span><span>{selected.support.state} / {selected.support.execution}</span></div>
          {!selected.support.executable && <p className="action-detail__warning">{copy.unsupported}</p>}
          {selected.evidence.integrityError && <p className="action-detail__error">{selected.evidence.integrityError}</p>}
          <p className="action-detail__truth">{copy.connectorRequired} <strong>{detailConnectorInvoked ? "connectorInvoked=true" : "connectorInvoked=false"}</strong></p>

          <section className="action-detail__selectors">
            <label>{copy.selectDevice}<select value={targetDeviceId} disabled={!selected.controls.canSelectDevice || Boolean(working)} onChange={(event) => setTargetDeviceId(event.target.value)}><option value="">—</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.name} · {device.vendor}</option>)}</select></label>
            <button className="secondary-button" type="button" disabled={!selected.controls.canSelectDevice || !targetDeviceId || targetDeviceId === selected.deviceId || Boolean(working)} onClick={() => void run("target", () => updateActionCenterTarget(selected.id, targetDeviceId))}>{copy.applyDevice}</button>
            <label>{copy.selectCredential}<select value={credentialId} disabled={!selected.controls.canSelectCredential || !selected.deviceId || Boolean(working)} onChange={(event) => setCredentialId(event.target.value)}><option value="">—</option>{credentials.map((credential) => <option key={credential.id} value={credential.id}>{credential.name} · {credential.type}</option>)}</select></label>
            <button className="secondary-button" type="button" disabled={!selected.controls.canSelectCredential || !selected.deviceId || !credentialId || Boolean(working)} onClick={() => void run("credential", () => updateDevice(selected.deviceId!, { credentialId }))}>{copy.applyCredential}</button>
          </section>

          <section className="action-parameter-editor">
            <button className="secondary-button" type="button" disabled={!selected.controls.canEditParameters || Boolean(working)} onClick={() => setEditing(!editing)}>{copy.edit}</button>
            {editing && <div className="action-parameter-editor__fields">{Object.keys(fields).length ? Object.entries(fields).map(([key, value]) => <label key={key}>{key}<input value={value} onChange={(event) => setFields((current) => ({ ...current, [key]: event.target.value }))} /></label>) : <p>{copy.noFields}</p>}<button className="primary-button" type="button" disabled={!Object.keys(fields).length || Boolean(working)} onClick={() => void saveParameters()}>{copy.save}</button></div>}
          </section>

          <EvidenceBlock title={copy.commandPreview} value={selected.commandPreview} />
          <div className="action-detail__evidence-controls">
            <button className="text-button" type="button" onClick={() => setShowEvidence(!showEvidence)}>{copy.evidence}</button>
            <button className="text-button" type="button" onClick={() => setShowResult(!showResult)}>{copy.connectorResult}</button>
            {selected.controls.relatedDevicePath && <Link className="secondary-link" to={selected.controls.relatedDevicePath}>{copy.openDevice}</Link>}
          </div>
          {showEvidence && <><EvidenceBlock title={copy.backend} value={selected.validationJson} /><EvidenceBlock title={copy.audit} value={{ evidence: selected.evidence, audit: selected.audit }} /></>}
          {showResult && <EvidenceBlock title={copy.connector} value={selected.connectorResult} />}

          <footer className="action-detail__controls">
            <button className="secondary-button" type="button" disabled={!selected.controls.canPreview || Boolean(working)} onClick={() => void run("preview", () => dryRunAction(selected.id))}>{copy.preview}</button>
            <button className="secondary-button" type="button" disabled={!selected.controls.canConfirm || Boolean(working)} onClick={() => void run("confirm", () => approveAction(selected.id, { reason: "Confirmed from Action Center" }))}>{copy.confirm}</button>
            <button className="primary-button" type="button" disabled={!selected.controls.canExecute || Boolean(working)} onClick={() => void run("execute", () => executeAction(selected.id, { intent: "execute", reason: "Execute from Action Center" }))}>{copy.execute}</button>
            <button className="secondary-button" type="button" disabled={!selected.controls.canRetry || Boolean(working)} onClick={() => void run("retry", () => retryActionCenterItem(selected.id), { selectReturned: true })}>{copy.retry}</button>
            <button className="text-button" type="button" disabled={!selected.controls.canCancel || Boolean(working)} onClick={() => void run("cancel", () => cancelActionCenterItem(selected.id))}>{copy.cancel}</button>
          </footer>
        </aside>}
      </div>
    </section>
  );
}
