import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarDays, CheckCheck, ClipboardList, LoaderCircle, Plus, Search, UserRound, X, ExternalLink } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { collaborationApi, messageKey, type Person, type Task, type TaskStatus } from "./communityApi";

type Translate = (fa: string, en: string) => string;
const statuses = (t: Translate): Record<TaskStatus, string> => ({ todo: t("برای انجام", "To do"), in_progress: t("در حال انجام", "In progress"), done: t("انجام‌شده", "Done") });
export function collaborationError(error: unknown, t: Translate) {
  const e = error as { status?: number; code?: string };
  if (e.code === "COMMUNITY_STORAGE_QUOTA") return t("سهمیهٔ فایل پر شده است؛ با مدیر فضای کاری هماهنگ کن.", "Attachment quota reached. Contact your workspace administrator.");
  if (e.status === 413) return t("هر فایل حداکثر ۵ مگابایت و هر پیام حداکثر سه فایل.", "Up to three files per message, 5 MB per file.");
  if (e.status === 415) return t("نوع یا نام فایل مجاز نیست. تصویر، PDF یا متن ساده انتخاب کن.", "Unsupported file type or name. Choose an image, PDF or plain text.");
  if (e.status === 409) return t("این مورد تغییر کرده است؛ تازه‌سازی کن و دوباره بررسی کن. متن تو حفظ شد.", "This item changed. Refresh and review; your draft is kept.");
  if (e.status === 403) return t("اجازهٔ این تغییر را نداری.", "You do not have permission to make this change.");
  if (e.status === 404) return t("این مورد در دسترس نیست؛ صفحه را تازه‌سازی کن.", "This item is unavailable. Refresh to check.");
  if (e.status === 429) return t("کمی صبر کن و دوباره تلاش کن.", "Please wait a moment and retry.");
  return t("درخواست انجام نشد؛ دوباره تلاش کن. متن تو حفظ شد.", "Request failed. Retry; your draft is kept.");
}

export function TaskBoard({ isFa, onThread }: { isFa: boolean; onThread: (id: string) => void }) {
  const { user } = useAuth(), t: Translate = (fa, en) => isFa ? fa : en;
  const [tasks, setTasks] = useState<Task[]>([]), [mine, setMine] = useState(false), [search, setSearch] = useState("");
  const [filter, setFilter] = useState(""), [offset, setOffset] = useState(0), [more, setMore] = useState(false);
  const [error, setError] = useState(""), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
  const [dialog, setDialog] = useState<Task | "new" | null>(null);
  useEffect(() => { const timer = setTimeout(() => { setFilter(search.trim()); setOffset(0); }, 300); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    const abort = new AbortController(); let running = false;
    const load = async () => {
      if (running || document.hidden) return; running = true;
      try {
        const data = await collaborationApi<{ tasks: Task[]; hasMore: boolean }>(`/tasks?${new URLSearchParams({ mine: String(mine), search: filter, offset: String(offset) })}`, { signal: abort.signal });
        if (!abort.signal.aborted) { setTasks(data.tasks); setMore(data.hasMore); setError(""); }
      } catch (e) { if (!abort.signal.aborted) setError(collaborationError(e, (fa, en) => isFa ? fa : en)); }
      finally { running = false; if (!abort.signal.aborted) setLoading(false); }
    };
    setLoading(true); void load(); const timer = setInterval(() => void load(), 10000);
    return () => { abort.abort(); clearInterval(timer); };
  }, [mine, filter, offset, revision, isFa]);
  return <section className="hub-task-board" aria-label={t("مدیریت کارهای تیم", "Team tasks")}>
    <header className="hub-task-toolbar"><div><span className="hub-eyebrow">{t("از گفتگو تا انجام", "From conversation to completion")}</span><h2>{t("هر کار، یک مسئول روشن", "Every task, a clear owner")}</h2><p>{t("کارها برای تیم قابل مشاهده‌اند؛ سپردن کار، دستور دستگاه اجرا نمی‌کند.", "Tasks are shared with the team. Assignment never executes a device action.")}</p></div>
      <button className="hub-primary" onClick={() => setDialog("new")}><Plus size={18}/>{t("کار جدید", "New task")}</button></header>
    <div className="hub-task-filters"><label className="hub-search"><Search size={17}/><input maxLength={100} value={search} onChange={e => setSearch(e.target.value)} placeholder={t("جست‌وجوی کار…", "Search tasks…")} aria-label={t("جست‌وجوی کارها", "Search tasks")}/></label><button aria-pressed={mine} onClick={() => { setMine(v => !v); setOffset(0); }}><UserRound size={16}/>{t("سپرده‌شده به من", "Assigned to me")}</button><span>{loading ? <LoaderCircle size={17}/> : t(`${tasks.length} کار در این صفحه`, `${tasks.length} tasks on this page`)}</span></div>
    {error && <p className="hub-error" role="alert">{error}<button onClick={() => setRevision(n => n + 1)}>{t("تلاش دوباره", "Retry")}</button></p>}
    <div className="hub-task-columns" aria-busy={loading}>{(Object.entries(statuses(t)) as [TaskStatus, string][]).map(([status, label]) => {
      const items = tasks.filter(task => task.status === status);
      return <section className={`hub-task-column is-${status}`} key={status}><h3><i/>{label}<span>{items.length.toLocaleString(isFa ? "fa-IR" : "en-US")}</span></h3>
        {items.map(task => {
          const late = task.dueAt && task.status !== "done" && new Date(task.dueAt).getTime() < Date.now();
          return <button key={task.id} className="hub-task-card" onClick={() => setDialog(task)}>
            <span className="hub-task-card__top"><ClipboardList size={17}/>{task.priority === "urgent" && <small className="hub-urgent">{t("فوری", "Urgent")}</small>}{task.assigneeId === user?.id && <small>{t("برای شما", "For you")}</small>}</span>
            <strong>{task.title}</strong><p>{task.description || t("بدون توضیح اضافه", "No additional description")}</p>
            <span className="hub-task-owner"><span>{task.assignee?.displayName.slice(0, 1) ?? "—"}</span>{task.assignee?.displayName ?? t("بدون مسئول", "Unassigned")}</span>
            <span className={`hub-task-due ${late ? "is-late" : ""}`}><CalendarDays size={13}/>{task.dueAt ? new Date(task.dueAt).toLocaleDateString(isFa ? "fa-IR" : "en-US") : t("بدون مهلت", "No due date")}{late && <small>{t("گذشته از مهلت", "Overdue")}</small>}</span>
          </button>;
        })}
        {!items.length && <div className="hub-task-empty"><CheckCheck size={22}/><p>{t("فعلاً کاری در این مرحله نیست.", "No tasks in this stage yet.")}</p></div>}
      </section>;
    })}</div>
    {(offset > 0 || more) && <footer className="hub-task-paging"><button disabled={!offset || loading} onClick={() => setOffset(n => Math.max(0, n - 60))}>{t("صفحهٔ قبل", "Previous")}</button><button disabled={!more || loading} onClick={() => setOffset(n => n + 60)}>{t("صفحهٔ بعد", "Next")}</button></footer>}
    {dialog && <TaskDialog key={typeof dialog === "string" ? "new" : dialog.id} task={dialog === "new" ? undefined : dialog} isFa={isFa} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); setRevision(n => n + 1); }} onThread={onThread}/>}
  </section>;
}

export function TaskDialog({ task, source, isFa, onClose, onSaved, onThread }: { task?: Task; source?: { id: string; body: string }; isFa: boolean; onClose: () => void; onSaved: () => void; onThread?: (id: string) => void }) {
  const { user } = useAuth(), t: Translate = (fa, en) => isFa ? fa : en;
  const dialog = useRef<HTMLDialogElement>(null), pending = useRef({ signature: "", key: "" });
  const [title, setTitle] = useState(task?.title ?? source?.body.slice(0, 100) ?? ""), [description, setDescription] = useState(task?.description ?? source?.body ?? "");
  const [assignee, setAssignee] = useState(task?.assigneeId ?? ""), [due, setDue] = useState(task?.dueAt?.slice(0, 10) ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "todo"), [priority, setPriority] = useState(task?.priority ?? "normal");
  const [members, setMembers] = useState<Person[]>([]), [membersReady, setMembersReady] = useState(false), [memberRevision, setMemberRevision] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const owner = !task || task.creatorId === user?.id || user?.role === "admin", canSave = owner || task?.assigneeId === user?.id;
  useEffect(() => { dialog.current?.showModal(); dialog.current?.querySelector<HTMLInputElement>("input:not(:disabled)")?.focus(); }, []);
  useEffect(() => {
    const abort = new AbortController();
    void collaborationApi<{ members: Person[] }>("/members", { signal: abort.signal }).then(data => { setMembers(data.members); setMembersReady(true); })
      .catch(e => { if (!abort.signal.aborted) setError(collaborationError(e, (fa, en) => isFa ? fa : en)); });
    return () => abort.abort();
  }, [memberRevision, isFa]);
  async function submit(e: FormEvent) {
    e.preventDefault(); if (busy || !canSave || !title.trim() || (owner && !membersReady)) return; setBusy(true); setError("");
    const full = { title: title.trim(), description: description.trim(), assigneeId: assignee || null,
      priority, dueAt: due ? new Date(`${due}T23:59:59`).toISOString() : null };
    const signature = JSON.stringify(full);
    if (pending.current.signature !== signature) pending.current = { signature, key: messageKey() };
    try {
      await collaborationApi(task ? `/tasks/${task.id}` : "/tasks", { method: task ? "PATCH" : "POST", body: task ? { ...(owner ? full : {}), status, expectedVersion: task.version } : { ...full, clientKey: pending.current.key, ...(source ? { sourceMessageId: source.id } : {}) } });
      onSaved();
    } catch (e) { setError(collaborationError(e, t)); } finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="hub-dialog community-hub hub-task-dialog" aria-labelledby="task-title" onCancel={e => { if (busy) e.preventDefault(); else onClose(); }} onClick={e => {
    if (e.target === dialog.current && !busy) { const r = dialog.current.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); }
  }}><form onSubmit={submit}>
    <header><span className="hub-avatar"><ClipboardList/></span><h2 id="task-title">{task ? t("جزئیات کار", "Task details") : t("سپردن یک کار", "Assign a task")}</h2><button type="button" onClick={onClose} disabled={busy} aria-label={t("بستن", "Close")}><X size={20}/></button></header>
    <p className="hub-dialog__privacy">{t("برای کاربران همین فضای کاری قابل مشاهده است؛ اطلاعات محرمانه ننویس.", "Visible to this workspace. Do not include confidential information.")}</p>
    <label>{t("عنوان کار", "Task title")}<input required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} disabled={busy || !owner}/></label>
    <label>{t("توضیحات", "Description")}<textarea rows={3} maxLength={4000} value={description} onChange={e => setDescription(e.target.value)} disabled={busy || !owner}/></label>
    <div className="hub-task-form-grid"><label>{t("مسئول", "Assignee")}<select value={assignee} onChange={e => setAssignee(e.target.value)} disabled={busy || !owner || !membersReady}><option value="">{t("بدون مسئول", "Unassigned")}</option>{task?.assignee && !members.some(m => m.id === task.assigneeId) && <option value={task.assignee.id}>{task.assignee.displayName} · {t("در دسترس نیست", "Unavailable")}</option>}{members.map(member => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label>
      <label>{t("مهلت", "Due date")}<input type="date" min="2000-01-01" max="2100-12-31" value={due} onChange={e => setDue(e.target.value)} disabled={busy || !owner}/></label>
      <label>{t("اولویت", "Priority")}<select value={priority} onChange={e => setPriority(e.target.value as "normal" | "urgent")} disabled={busy || !owner}><option value="normal">{t("عادی", "Normal")}</option><option value="urgent">{t("فوری", "Urgent")}</option></select></label>
      {task && <label>{t("وضعیت", "Status")}<select value={status} onChange={e => setStatus(e.target.value as TaskStatus)} disabled={busy || !canSave}>{Object.entries(statuses(t)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
    </div>
    {!membersReady && owner && <button type="button" className="hub-more" onClick={() => setMemberRevision(n => n + 1)}>{t("دریافت فهرست افراد", "Reload team members")}</button>}
    {task?.sourceMessage && !task.sourceMessage.deletedAt && onThread && <button type="button" className="hub-more" onClick={() => onThread(task.sourceMessage!.threadId)}><ExternalLink size={14}/>{t("دیدن گفتگوی مرتبط", "Open source conversation")}</button>}
    {error && <p className="hub-error" role="alert">{error}</p>}
    <footer><button type="button" onClick={onClose} disabled={busy}>{t("بستن", "Close")}</button>{canSave && <button className="hub-primary" type="submit" disabled={busy || !title.trim() || (owner && !membersReady)}>{busy ? t("در حال ثبت…", "Saving…") : task ? t("ذخیرهٔ تغییرات", "Save changes") : t("ثبت کار", "Create task")}</button>}</footer>
  </form></dialog>;
}
