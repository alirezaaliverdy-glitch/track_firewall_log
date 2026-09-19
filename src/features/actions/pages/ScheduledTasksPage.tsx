import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, CheckCircle2, CirclePause, Clock3, History, LoaderCircle, Pause, Play, RotateCcw, ShieldCheck, TimerReset, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { searchCommands, type CatalogItem, type CatalogParam } from "@/lib/commandCatalog";
import { listDevices, type Device } from "@/lib/devices";
import {
  cancelScheduledTask,
  createScheduledTask,
  formatBothCalendars,
  getScheduledTaskHistory,
  getScheduledTasks,
  pauseScheduledTask,
  runScheduledTaskNow,
  scheduleDateToIso,
  type CalendarType,
  type ScheduledTask,
  type ScheduledTaskRun,
} from "@/lib/scheduledTasks";
import "./ScheduledTasksPage.css";

type Tab = "upcoming" | "history";

const persianNumber = new Intl.NumberFormat("fa-IR", { minimumIntegerDigits: 2, useGrouping: false });
const toLatinDigits = (value: string) => value
  .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
  .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
const toPersianDigits = (value: string) => value.replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
const operationCategoryCopy: Record<string, string> = {
  system: "کنترل دستگاه",
  firewall: "فایروال و دسترسی",
  interfaces: "پورت‌ها و اینترفیس‌ها",
  identity: "کاربران و دسترسی‌ها",
  management: "سرویس‌های مدیریتی",
  backup: "پشتیبان‌گیری",
  network: "تنظیمات شبکه",
  routing: "مسیریابی",
  vlan: "شبکه مجازی",
  monitoring: "ارسال رخدادها",
};

function PersianTimePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [hour = "00", minute = "00"] = value.split(":");
  const [hourDraft, setHourDraft] = useState(() => toPersianDigits(hour));
  const [minuteDraft, setMinuteDraft] = useState(() => toPersianDigits(minute));
  useEffect(() => { setHourDraft(toPersianDigits(hour)); }, [hour]);
  useEffect(() => { setMinuteDraft(toPersianDigits(minute)); }, [minute]);
  const commitPart = (raw: string, part: "hour" | "minute") => {
    const digits = toLatinDigits(raw).replace(/\D/g, "").slice(0, 2);
    if (!digits) {
      if (part === "hour") setHourDraft(toPersianDigits(hour));
      else setMinuteDraft(toPersianDigits(minute));
      return;
    }
    const max = part === "hour" ? 23 : 59;
    const normalized = String(Math.min(Number(digits), max)).padStart(2, "0");
    if (part === "hour") setHourDraft(toPersianDigits(normalized));
    else setMinuteDraft(toPersianDigits(normalized));
    onChange(part === "hour" ? `${normalized}:${minute}` : `${hour}:${normalized}`);
  };
  const editPart = (raw: string, part: "hour" | "minute") => {
    const digits = toLatinDigits(raw).replace(/\D/g, "").slice(0, 2);
    if (part === "hour") setHourDraft(toPersianDigits(digits));
    else setMinuteDraft(toPersianDigits(digits));
    if (digits.length === 2) commitPart(digits, part);
  };
  return <div className="persian-time-picker" dir="ltr">
    <div><span>ساعت</span><input aria-label="ساعت به‌صورت ۲۴ ساعته" inputMode="numeric" pattern="[0-9۰-۹]*" maxLength={2} value={hourDraft} onFocus={(event) => event.currentTarget.select()} onChange={(event) => editPart(event.target.value, "hour")} onBlur={(event) => commitPart(event.target.value, "hour")} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitPart(event.currentTarget.value, "hour"); event.currentTarget.blur(); } }} /></div>
    <b aria-hidden="true">:</b>
    <div><span>دقیقه</span><input aria-label="دقیقه" inputMode="numeric" pattern="[0-9۰-۹]*" maxLength={2} value={minuteDraft} onFocus={(event) => event.currentTarget.select()} onChange={(event) => editPart(event.target.value, "minute")} onBlur={(event) => commitPart(event.target.value, "minute")} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitPart(event.currentTarget.value, "minute"); event.currentTarget.blur(); } }} /></div>
    <output dir="rtl">ساعت {persianNumber.format(Number(hour))}:{persianNumber.format(Number(minute))}</output>
  </div>;
}

function initialDate(calendar: CalendarType) {
  const value = new Date(Date.now() + 60 * 60 * 1000);
  if (calendar === "gregorian") return value.toISOString().slice(0, 10);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-u-ca-persian", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Tehran" }).formatToParts(value).map((part) => [part.type, part.value]));
  return `${parts.year}/${parts.month}/${parts.day}`;
}

function initialTime() {
  const value = new Date(Date.now() + 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Tehran" }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.hour}:${map.minute}`;
}

const statusCopy: Record<string, string> = {
  scheduled: "آماده اجرا",
  paused: "متوقف‌شده",
  running: "در حال اجرا",
  completed: "پایان‌یافته",
  cancelled: "لغوشده",
  succeeded: "موفق",
  failed: "ناموفق",
  skipped: "ردشده",
};

const riskCopy: Record<string, string> = { low: "کم", medium: "متوسط", high: "زیاد", critical: "بحرانی" };

function ParameterInput({ field, value, onChange }: { field: CatalogParam; value: unknown; onChange: (value: unknown) => void }) {
  if (field.type === "boolean") {
    return <select value={String(value ?? "false")} onChange={(event) => onChange(event.target.value === "true")}><option value="false">خیر</option><option value="true">بله</option></select>;
  }
  return <input type={field.type === "number" ? "number" : "text"} value={String(value ?? "")} placeholder={field.placeholderFa} onChange={(event) => onChange(field.type === "number" ? Number(event.target.value) : event.target.value)} />;
}

function DatePair({ value }: { value: string }) {
  const pair = formatBothCalendars(value);
  return <div className="schedule-date-pair"><strong>{pair.jalali}</strong><span>{pair.gregorian}</span></div>;
}

export default function ScheduledTasksPage() {
  const [tab, setTab] = useState<Tab>("upcoming");
  const [devices, setDevices] = useState<Device[]>([]);
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [history, setHistory] = useState<ScheduledTaskRun[]>([]);
  const [commands, setCommands] = useState<CatalogItem[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [commandId, setCommandId] = useState("");
  const [name, setName] = useState("");
  const [calendar, setCalendar] = useState<CalendarType>("jalali");
  const [localDate, setLocalDate] = useState(() => initialDate("jalali"));
  const [localTime, setLocalTime] = useState(initialTime);
  const [timeZone, setTimeZone] = useState("Asia/Tehran");
  const [parameters, setParameters] = useState<Record<string, unknown>>({});
  const initializedSelectionRef = useRef("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const selectedCommand = useMemo(() => commands.find((item) => item.id === commandId) ?? null, [commands, commandId]);
  const commandGroups = useMemo(() => {
    const groups = new Map<string, CatalogItem[]>();
    commands.forEach((command) => groups.set(command.category, [...(groups.get(command.category) ?? []), command]));
    return [...groups.entries()];
  }, [commands]);
  const upcoming = useMemo(() => tasks.filter((task) => !["completed", "cancelled"].includes(task.status)), [tasks]);
  const terminal = useMemo(() => tasks.filter((task) => ["completed", "cancelled"].includes(task.status)), [tasks]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [deviceRows, taskRows, runRows] = await Promise.all([listDevices(), getScheduledTasks(), getScheduledTaskHistory()]);
      setDevices(deviceRows);
      setTasks(taskRows);
      setHistory(runRows);
      if (!deviceId && deviceRows.length) setDeviceId(deviceRows[0].id);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "دریافت اطلاعات زمان‌بندی ناموفق بود." });
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(true); }, 20_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!deviceId) { setCommands([]); setCommandId(""); return; }
    let active = true;
    void searchCommands({ deviceId, executable: "true", readOnly: "false" }).then((result) => {
      if (!active) return;
      const executable = result.items.filter((item) => item.implementationState === "implemented" && item.supportState === "verified" && item.executionSupport === "connector" && item.readOnly === false);
      setCommands(executable);
      setCommandId((current) => executable.some((item) => item.id === current) ? current : executable[0]?.id ?? "");
    }).catch((error) => setMessage({ tone: "error", text: error instanceof Error ? error.message : "دریافت عملیات دستگاه ناموفق بود." }));
    return () => { active = false; };
  }, [deviceId]);

  useEffect(() => {
    if (!selectedCommand) return;
    const selectionKey = `${deviceId}:${selectedCommand.id}`;
    if (initializedSelectionRef.current === selectionKey) return;
    initializedSelectionRef.current = selectionKey;
    setParameters({ ...selectedCommand.defaultParams });
    setName((current) => current || `${selectedCommand.titleFa} - ${devices.find((device) => device.id === deviceId)?.name ?? "دستگاه"}`);
  }, [selectedCommand, deviceId, devices]);

  function switchCalendar(next: CalendarType) {
    setCalendar(next);
    setLocalDate(initialDate(next));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedCommand) return;
    setMessage(null);
    try {
      const runAt = scheduleDateToIso(calendar, localDate, localTime, timeZone);
      setSubmitting(true);
      await createScheduledTask({ name, deviceId, catalogCommandId: selectedCommand.id, parametersJson: parameters, calendarType: calendar, localDate, localTime, timeZone, runAt, confirmed: true });
      setMessage({ tone: "ok", text: "تسک بدون مرحله اضافه در صف مرکز عملیات قرار گرفت و در زمان تعیین‌شده از مسیر کنترل‌شده اجرا می‌شود." });
      setName("");
      await load(true);
      setTab("upcoming");
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "ثبت تسک ناموفق بود." });
    } finally { setSubmitting(false); }
  }

  async function taskAction(task: ScheduledTask, action: "pause" | "resume" | "run" | "cancel") {
    const question = action === "run" ? `عملیات «${task.name}» همین حالا اجرا شود؟` : action === "cancel" ? `زمان‌بندی «${task.name}» لغو شود؟ تاریخچه باقی می‌ماند.` : null;
    if (question && !window.confirm(question)) return;
    setBusyId(task.id); setMessage(null);
    try {
      if (action === "pause") await pauseScheduledTask(task.id, true);
      if (action === "resume") await pauseScheduledTask(task.id, false);
      if (action === "run") await runScheduledTaskNow(task.id);
      if (action === "cancel") await cancelScheduledTask(task.id);
      await load(true);
      setMessage({ tone: "ok", text: action === "run" ? "درخواست اجرا پایان یافت؛ نتیجه در تاریخچه ثبت شد." : "وضعیت زمان‌بندی به‌روزرسانی شد." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "انجام عملیات ناموفق بود." });
    } finally { setBusyId(""); }
  }

  return <main className="scheduled-page" dir="rtl">
    <header className="scheduled-hero">
      <div className="scheduled-hero__icon"><CalendarClock aria-hidden="true" /></div>
      <div><span>اجرای خودکار و کنترل‌شده</span><h1>زمان‌بندی عملیات وندورها</h1><p>عملیات واقعی را برای دستگاه مشخص، تاریخ دقیق و ساعت دلخواه آماده کنید؛ نتیجه هر اجرا در تاریخچه قابل پیگیری است.</p></div>
      <div className="scheduled-hero__trust"><ShieldCheck aria-hidden="true" /><strong>فقط فرمان‌های تأییدشده</strong><small>PolicyGuard و Audit همیشه فعال‌اند</small></div>
    </header>

    <section className="scheduled-stats" aria-label="خلاصه زمان‌بندی">
      <div><CalendarClock /><span>آماده اجرا</span><strong>{upcoming.filter((task) => task.status === "scheduled").length}</strong></div>
      <div><CirclePause /><span>متوقف‌شده</span><strong>{upcoming.filter((task) => task.status === "paused").length}</strong></div>
      <div><CheckCircle2 /><span>اجرای موفق</span><strong>{history.filter((run) => run.status === "succeeded").length}</strong></div>
      <div><History /><span>کل سوابق</span><strong>{history.length}</strong></div>
    </section>

    {message ? <div className={`scheduled-message is-${message.tone}`}>{message.text}</div> : null}

    <section className="scheduled-layout">
      <form className="schedule-composer" onSubmit={submit}>
        <div className="schedule-section-title"><TimerReset /><div><h2>تسک جدید</h2><p>دستگاه، عملیات و زمان اجرا را تعیین کنید.</p></div></div>

        <label><span>دستگاه هدف</span><select value={deviceId} onChange={(event) => { setDeviceId(event.target.value); setName(""); }}>{devices.map((device) => <option key={device.id} value={device.id}>{device.name} · {device.vendor}</option>)}</select></label>
        <label><span>عملیات اثرگذار</span><select value={commandId} onChange={(event) => { setCommandId(event.target.value); setName(""); }}>{commandGroups.map(([category, items]) => <optgroup key={category} label={operationCategoryCopy[category] ?? "سایر عملیات"}>{items.map((command) => <option key={command.id} value={command.id}>{command.titleFa}</option>)}</optgroup>)}</select></label>
        {selectedCommand ? <div className="schedule-command-summary"><div><strong>{selectedCommand.titleFa}</strong><small>{selectedCommand.descriptionFa}</small><em>این عملیات واقعاً تنظیمات یا وضعیت دستگاه را تغییر می‌دهد.</em></div><span className={`risk-${selectedCommand.riskLevel}`}>ریسک {riskCopy[selectedCommand.riskLevel] ?? selectedCommand.riskLevel}</span></div> : <div className="schedule-empty">برای این دستگاه هنوز عملیات تغییردهنده و تأییدشده‌ای وجود ندارد. فرمان‌های صرفاً مشاهده‌ای عمداً در زمان‌بندی نمایش داده نمی‌شوند.</div>}
        <label><span>نام تسک</span><input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="مثلاً بکاپ شبانه روتر شعبه" /></label>

        {selectedCommand && [...selectedCommand.requiredParams, ...selectedCommand.optionalParams].length ? <div className="schedule-parameters"><h3>تنظیمات عملیات</h3>{[...selectedCommand.requiredParams, ...selectedCommand.optionalParams].map((field, index) => <label key={field.key}><span>{field.labelFa}{index >= selectedCommand.requiredParams.length ? <small> اختیاری</small> : null}</span><ParameterInput field={field} value={parameters[field.key]} onChange={(value) => setParameters((current) => ({ ...current, [field.key]: value }))} /><em>{field.helpFa}</em></label>)}</div> : null}

        <div className="calendar-switch"><button type="button" className={calendar === "jalali" ? "is-active" : ""} onClick={() => switchCalendar("jalali")}>تاریخ شمسی</button><button type="button" className={calendar === "gregorian" ? "is-active" : ""} onClick={() => switchCalendar("gregorian")}>تاریخ میلادی</button></div>
        <div className="schedule-time-grid">
          <label><span>{calendar === "jalali" ? "تاریخ شمسی" : "تاریخ میلادی"}</span><input type={calendar === "gregorian" ? "date" : "text"} value={localDate} placeholder="۱۴۰۵/۰۶/۲۰" onChange={(event) => setLocalDate(event.target.value.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))))} /></label>
          <label><span>زمان اجرا (۲۴ ساعته)</span><PersianTimePicker value={localTime} onChange={setLocalTime} /></label>
          <label><span>منطقه زمانی</span><select value={timeZone} onChange={(event) => setTimeZone(event.target.value)}><option value="Asia/Tehran">تهران</option><option value="UTC">UTC</option></select></label>
        </div>
        <button className="schedule-submit" disabled={!selectedCommand || submitting || !name.trim()}>{submitting ? <LoaderCircle className="is-spin" /> : <CalendarClock />} ثبت و ارسال به صف</button>
      </form>

      <section className="schedule-board">
        <nav className="schedule-tabs"><button className={tab === "upcoming" ? "is-active" : ""} onClick={() => setTab("upcoming")}><Clock3 /> برنامه‌های آینده <b>{upcoming.length}</b></button><button className={tab === "history" ? "is-active" : ""} onClick={() => setTab("history")}><History /> تاریخچه <b>{history.length}</b></button></nav>
        <div className="schedule-board__content">
        {loading ? <div className="schedule-loading"><LoaderCircle className="is-spin" /> در حال دریافت زمان‌بندی‌ها…</div> : null}
        {!loading && tab === "upcoming" ? <div className="schedule-list">{upcoming.length ? upcoming.map((task) => <article className={`schedule-card status-${task.status}`} key={task.id}>
          <div className="schedule-card__head"><div><span>{task.device.vendor}</span><h3>{task.name}</h3><small>{task.device.name} · {task.actionType.replaceAll("_", " ")}</small></div><b>{statusCopy[task.status]}</b></div>
          <DatePair value={task.runAt} />
          <div className="schedule-card__meta"><span>ریسک {riskCopy[task.riskLevel] ?? task.riskLevel}</span><span>{task.timeZone}</span><span>ثبت‌کننده: {task.createdBy?.displayName ?? "کاربر حذف‌شده"}</span></div>
          <div className="schedule-card__actions">
            {task.status === "scheduled" ? <button disabled={busyId === task.id} onClick={() => void taskAction(task, "pause")}><Pause /> توقف</button> : <button disabled={busyId === task.id} onClick={() => void taskAction(task, "resume")}><Play /> فعال‌سازی</button>}
            <button disabled={busyId === task.id} onClick={() => void taskAction(task, "run")}><RotateCcw /> اجرای اکنون</button>
            <button className="is-danger" disabled={busyId === task.id} onClick={() => void taskAction(task, "cancel")}><XCircle /> لغو</button>
          </div>
        </article>) : <div className="schedule-empty-state"><CalendarClock /><h3>زمان‌بندی فعالی ندارید</h3><p>فرم کنار صفحه را کامل کنید تا اولین عملیات خودکار ثبت شود.</p></div>}</div> : null}
        {!loading && tab === "history" ? <div className="schedule-history">{history.length ? history.map((run) => <article key={run.id} className={`schedule-history-row run-${run.status}`}><div className="schedule-history-row__state">{run.status === "succeeded" ? <CheckCircle2 /> : run.status === "running" ? <LoaderCircle className="is-spin" /> : <XCircle />}<b>{statusCopy[run.status]}</b></div><div><strong>{run.scheduledTask?.name ?? "تسک زمان‌بندی‌شده"}</strong><small>{run.scheduledTask?.device.name} · {run.trigger === "manual" ? "اجرای دستی" : "اجرای زمان‌بندی‌شده"}</small></div><DatePair value={run.startedAt} /><div className="schedule-history-row__result">{run.errorMessage ? <span>{run.errorMessage}</span> : <span>Connector اجرا و نتیجه تأیید شد.</span>}{run.actionPlanId ? <Link to={`/actions/${run.actionPlanId}`}>مشاهده ActionPlan</Link> : null}</div></article>) : <div className="schedule-empty-state"><History /><h3>هنوز اجرایی ثبت نشده</h3><p>نتیجه اجراهای موفق، ناموفق و ردشده اینجا باقی می‌ماند.</p></div>}</div> : null}
        {tab === "history" && terminal.length ? <details className="schedule-archive"><summary>نمایش {terminal.length} زمان‌بندی پایان‌یافته یا لغوشده</summary>{terminal.map((task) => <div key={task.id}><span>{task.name}</span><b>{statusCopy[task.status]}</b><DatePair value={task.runAt} /></div>)}</details> : null}
        </div>
      </section>
    </section>
  </main>;
}
