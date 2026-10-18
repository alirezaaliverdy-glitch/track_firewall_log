import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, ArrowDown, CheckCheck, CircleHelp, Hash, LockKeyhole, MessageCircle, MessagesSquare, Plus, Search, Send, Ticket, X, ClipboardList, MoreHorizontal, Reply, Pencil, Trash2, Paperclip, Download, FileText, Check } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { communityApi, mergeMessages, messageKey, attachmentUrl, type Detail, type Kind, type ChatMessage, type Thread, type ThreadStatus, type Attachment } from "./communityApi";
import { TaskBoard, TaskDialog, collaborationError } from "./TaskBoard";
import "./CommunityPage.css";
import { RetentionDialog } from "./RetentionDialog";
import { HardDrive } from "lucide-react";

type Translate = (fa: string, en: string) => string;
const labels = (t: Translate): Record<ThreadStatus, string> => ({ open: t("باز", "Open"), in_progress: t("در حال رسیدگی", "In progress"), resolved: t("بسته‌شده", "Closed") });
const requestError = collaborationError;

export default function CommunityPage() {
  const { i18n } = useTranslation(), isFa = i18n.language.startsWith("fa");
  const t: Translate = (fa, en) => isFa ? fa : en;
  const [query, setQuery] = useSearchParams();
  const kind: Kind = query.get("tab") === "ticket" ? "ticket" : "discussion", selected = query.get("thread") ?? "";
  const taskView = query.get("tab") === "task";
  const [threads, setThreads] = useState<Thread[]>([]), [search, setSearch] = useState(""), [filter, setFilter] = useState("");
  const [status, setStatus] = useState(""), [limit, setLimit] = useState(30), [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true), [error, setError] = useState(false), [revision, setRevision] = useState(0);
  const [creating, setCreating] = useState(false), [storage, setStorage] = useState(false);
  const drafts = useRef<Record<string, string>>({});
  const workspace = useRef<HTMLDivElement>(null);
  // Reserve the shell navigation and visual viewport (including a touch keyboard).
  useLayoutEffect(() => {
    const measure = () => {
      const node = workspace.current;
      if (!node || !window.matchMedia("(max-width:740px)").matches) return;
      const visual = window.visualViewport;
      let bottom = (visual?.height ?? innerHeight) + (visual?.offsetTop ?? 0);
      const nav = document.querySelector(".platform-bottom-nav")?.getBoundingClientRect();
      if (nav && nav.height && nav.top < bottom) bottom = nav.top;
      node.style.setProperty("--hub-mobile-height", `${Math.max(220, bottom - node.getBoundingClientRect().top - 12)}px`);
    };
    measure(); const frame = requestAnimationFrame(measure);
    window.addEventListener("resize", measure); window.visualViewport?.addEventListener("resize", measure);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", measure); window.visualViewport?.removeEventListener("resize", measure); };
  }, [selected, isFa]);
  const refresh = useCallback(() => setRevision(n => n + 1), []);
  useEffect(() => { const timer = setTimeout(() => { setFilter(search.trim()); setLimit(30); }, 300); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    if (taskView) return;
    const abort = new AbortController(); let running = false;
    setLoading(true);
    const load = async () => {
      if (running) return; running = true;
      try {
        const all: Thread[] = []; let more = false;
        for (let offset = 0; offset < limit; offset += 30) {
          const data = await communityApi<{ threads: Thread[]; hasMore: boolean }>(`?${new URLSearchParams({ kind, search: filter, ...(status ? { status } : {}), offset: String(offset) })}`, { signal: abort.signal });
          all.push(...data.threads); more = data.hasMore; if (!more) break;
        }
        if (!abort.signal.aborted) { setThreads([...new Map(all.map(item => [item.id, item])).values()]); setHasMore(more); setError(false); }
      } catch { if (!abort.signal.aborted) setError(true); }
      finally { running = false; if (!abort.signal.aborted) setLoading(false); }
    };
    void load(); const timer = setInterval(() => { if (!document.hidden) void load(); }, 10000);
    const visible = () => { if (!document.hidden) void load(); }; document.addEventListener("visibilitychange", visible);
    return () => { abort.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [kind, filter, status, limit, revision, taskView]);
  function changeTab(next: Kind) { setQuery({ tab: next }); setSearch(""); setFilter(""); setStatus(""); setThreads([]); setLimit(30); }
  return <section className={`community-hub ${selected && !taskView ? "has-conversation" : ""}`} dir={isFa ? "rtl" : "ltr"}>
    <header className="hub-heading"><div className="hub-heading__icon"><MessagesSquare size={25}/></div><div><span>EOSNET · {t("کنار هم", "Together")}</span><h1>{t("گفت‌وگو و پشتیبانی", "Community & support")}</h1><p>{t("سؤال بپرس، تجربه به اشتراک بگذار یا درخواستت را پیگیری کن.", "Ask, share an idea, or follow up on a request.")}</p></div><button className="hub-storage-access" onClick={() => setStorage(true)} aria-label={t("فضای فایل‌ها و نگهداری پیام‌ها", "File storage & message retention")} title={t("فضای فایل‌ها و نگهداری پیام‌ها", "File storage & message retention")}><HardDrive size={18}/><span>{t("فضا و پیام‌ها", "Storage & retention")}</span></button></header>
    {taskView ? <><div className="hub-tabs hub-tabs--board"><button onClick={() => changeTab("discussion")}><MessagesSquare size={17}/>{t("گفت‌وگوها", "Community")}</button><button onClick={() => changeTab("ticket")}><Ticket size={17}/>{t("تیکت‌ها", "Tickets")}</button><button aria-pressed="true"><ClipboardList size={17}/>{t("کارها", "Tasks")}</button></div><TaskBoard isFa={isFa} onThread={id => setQuery({ tab: "discussion", thread: id })}/></> : <div className="hub-workspace" ref={workspace}>
      <aside className="hub-inbox" aria-label={t("فهرست گفت‌وگوها", "Conversations")}>
        <div className="hub-tabs" aria-label={t("نوع گفت‌وگو", "Conversation type")}>
          <button aria-pressed={kind === "discussion"} onClick={() => changeTab("discussion")}><MessagesSquare size={17}/>{t("گفت‌وگوها", "Community")}</button>
          <button aria-pressed={kind === "ticket"} onClick={() => changeTab("ticket")}><Ticket size={17}/>{t("تیکت‌ها", "Tickets")}</button>
          <button onClick={() => setQuery({ tab: "task" })}><ClipboardList size={17}/>{t("کارها", "Tasks")}</button>
        </div>
        <div className="hub-inbox__tools"><label className="hub-search"><Search size={17}/><input value={search} maxLength={100} onChange={e => setSearch(e.target.value)} placeholder={t("جست‌وجوی عنوان…", "Search titles…")} aria-label={t("جست‌وجوی گفت‌وگوها", "Search conversations")}/></label>
          <div className="hub-inbox__actions"><select value={status} aria-label={t("وضعیت", "Status")} onChange={e => { setStatus(e.target.value); setLimit(30); }}><option value="">{t("همه وضعیت‌ها", "All statuses")}</option>{Object.entries(labels(t)).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select>
          <button className="hub-primary" onClick={() => setCreating(true)}><Plus size={17}/>{kind === "ticket" ? t("ثبت تیکت", "New ticket") : t("گفت‌وگوی تازه", "Start a topic")}</button></div>
        </div>
        <div className="hub-thread-list" aria-busy={loading}>
          {error && <div className="hub-error" role="alert">{t("فهرست به‌روز نشد.", "Could not refresh.")} <button onClick={refresh}>{t("تلاش دوباره", "Retry")}</button></div>}
          {!threads.length && !error && <div className="hub-list-empty">{loading ? t("در حال دریافت…", "Loading…") : filter || status ? t("موردی با این فیلتر پیدا نشد.", "No matching conversations.") : t("هنوز گفت‌وگویی ثبت نشده.", "No conversations yet.")}</div>}
          {threads.map(thread => <button className={`hub-thread ${selected === thread.id ? "is-selected" : ""}`} key={thread.id} aria-current={selected === thread.id ? "true" : undefined} onClick={() => setQuery({ tab: kind, thread: thread.id })}>
            <span className={`hub-avatar ${thread.kind === "ticket" ? "is-ticket" : ""}`}>{thread.kind === "ticket" ? <Ticket size={19}/> : <Hash size={19}/>}</span>
            <span className="hub-thread__copy"><span className="hub-thread__title"><strong>{thread.title}</strong>{thread.unread && <i aria-label={t("خوانده‌نشده", "Unread")}/>}</span><span className="hub-thread__preview">{thread.preview}</span><span className="hub-thread__meta"><span className={`hub-status is-${thread.status}`}>{labels(t)[thread.status]}</span>{thread.priority === "urgent" && <span className="hub-urgent">{t("فوری", "Urgent")}</span>}<span>{thread.messageCount?.toLocaleString(isFa ? "fa-IR" : "en-US")} <MessageCircle size={12}/></span></span></span>
          </button>)}
          {hasMore && <button className="hub-more" disabled={loading} onClick={() => setLimit(n => Math.min(300, n + 30))}>{limit < 300 ? t("نمایش بیشتر", "Show more") : t("برای موارد قدیمی‌تر جست‌وجو کن", "Search for older conversations")}</button>}
        </div>
        <p className="hub-privacy"><LockKeyhole size={14}/>{kind === "ticket" ? t("تیکت خصوصی · فقط شما و مدیر", "Private tickets · you and your administrator") : t("برای کاربران همین فضای کاری", "Shared with this workspace only")}</p>
      </aside>
      {selected ? <Conversation key={selected} id={selected} isFa={isFa} draft={drafts.current[selected] ?? ""} saveDraft={body => { drafts.current[selected] = body; }} onBack={() => setQuery({ tab: kind })} refreshList={refresh}/> : <div className="hub-welcome"><div className="hub-welcome__art"><span/><MessagesSquare size={48}/><i><CheckCheck size={21}/></i></div><span className="hub-eyebrow">{kind === "ticket" ? t("پشتیبانی، قابل پیگیری", "Support, with a clear next step") : t("جایی برای هم‌فکری", "A space to connect")}</span><h2>{kind === "ticket" ? t("هر درخواست، یک مسیر روشن", "Every request has a place") : t("گفت‌وگوی خوب از یک سؤال شروع می‌شود", "Good conversations start with a question")}</h2><p>{kind === "ticket" ? t("مشکلت را بنویس؛ پاسخ‌ها و وضعیت رسیدگی همین‌جا می‌مانند.", "Describe the issue. Replies and progress stay together here.") : t("یک موضوع را انتخاب کن یا تجربه و سؤال خودت را با دیگر کاربران در میان بگذار.", "Choose a topic, or share your question and experience with other users.")}</p><button className="hub-primary" onClick={() => setCreating(true)}><Plus size={18}/>{kind === "ticket" ? t("ثبت اولین درخواست", "Create a request") : t("شروع گفت‌وگو", "Start a conversation")}</button><small><LockKeyhole size={13}/>{t("رمز، کلید API یا اطلاعات محرمانه نفرست.", "Never share passwords, API keys or confidential information.")}</small></div>}
    </div>}
    {storage && <RetentionDialog isFa={isFa} onClose={() => setStorage(false)}/>}
    {creating && <CreateConversation kind={kind} t={t} onClose={() => setCreating(false)} onCreated={id => { setCreating(false); setSearch(""); setFilter(""); setStatus(""); setQuery({ tab: kind, thread: id }); refresh(); }}/ >}
  </section>;
}

function Conversation({ id, isFa, draft, saveDraft, onBack, refreshList }: { id: string; isFa: boolean; draft: string; saveDraft: (s: string) => void; onBack: () => void; refreshList: () => void }) {
  const { user } = useAuth(); const t: Translate = (fa, en) => isFa ? fa : en;
  const [thread, setThread] = useState<Thread | null>(null), [messages, setMessages] = useState<ChatMessage[]>([]);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null), [editing, setEditing] = useState<ChatMessage | null>(null);
  const [deleting, setDeleting] = useState<ChatMessage | null>(null), [deleteBusy, setDeleteBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]), [taskSource, setTaskSource] = useState<ChatMessage | null>(null), [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null), previousDraft = useRef(""), changeCursor = useRef(0);
  const [body, setBody] = useState(draft), [sending, setSending] = useState(false), [busyStatus, setBusyStatus] = useState(false);
  const [error, setError] = useState(""), [sendError, setSendError] = useState(""), [hasOlder, setHasOlder] = useState(false), [olderBusy, setOlderBusy] = useState(false);
  const [atBottom, setAtBottom] = useState(true), [revision, setRevision] = useState(0);
  const viewport = useRef<HTMLDivElement>(null), latest = useRef(0), read = useRef(0), stick = useRef(true), alive = useRef(true);
  const composer = useRef<HTMLTextAreaElement>(null), pending = useRef({ signature: "", key: "" });
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const close = (event: Event) => { if (event.type === "keydown" && (event as KeyboardEvent).key !== "Escape") return;
      if (event.type !== "keydown" && (event.target as HTMLElement).closest(".hub-message-menu")) return;
      document.querySelectorAll(".hub-message-menu[open]").forEach(el => el.removeAttribute("open")); };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, []);
  useEffect(() => {
    const abort = new AbortController(); let running = false;
    const load = async () => {
      if (running || document.hidden) return; running = true;
      try {
        const first = latest.current === 0;
        const data = await communityApi<Detail>(`/${id}${first ? "" : changeCursor.current ? `?changeAfter=${changeCursor.current}` : `?after=${latest.current}`}`, { signal: abort.signal });
        if (abort.signal.aborted) return;
        setThread(data.thread); setError(""); if (first) setHasOlder(data.hasMore);
        latest.current = Math.max(latest.current, data.thread.prunedThroughSequence ?? 0, ...data.messages.map(m => m.sequence));
        setMessages(items => mergeMessages(items, data.messages, data.thread.prunedThroughSequence ?? 0));
        if (data.thread.prunedThroughSequence) { setReplyTo(item => item && item.sequence <= data.thread.prunedThroughSequence! ? null : item); setEditing(item => item && item.sequence <= data.thread.prunedThroughSequence! ? null : item); }
        if (data.changeCursor) changeCursor.current = Math.max(changeCursor.current, data.changeCursor);
      } catch (e) { if (!abort.signal.aborted) setError(requestError(e, (fa, en) => isFa ? fa : en)); }
      finally { running = false; }
    };
    void load(); const timer = setInterval(() => void load(), 5000);
    const visible = () => { if (!document.hidden) void load(); }; document.addEventListener("visibilitychange", visible);
    return () => { abort.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [id, isFa, revision]);
  useEffect(() => {
    if (stick.current && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [messages]);
  useEffect(() => {
    if (!atBottom || !latest.current || document.hidden || read.current >= latest.current) return;
    const sequence = latest.current; read.current = sequence;
    void communityApi(`/${id}/read`, { method: "POST", body: { sequence } }).then(refreshList).catch(() => { read.current = 0; });
  }, [messages, atBottom, id, refreshList]);
  async function older() {
    if (olderBusy || !messages.length) return; setOlderBusy(true);
    const height = viewport.current?.scrollHeight ?? 0;
    try { const data = await communityApi<Detail>(`/${id}?before=${messages[0].sequence}`); if (!alive.current) return;
      stick.current = false; setMessages(items => mergeMessages(items, data.messages, Math.max(thread?.prunedThroughSequence ?? 0, data.thread.prunedThroughSequence ?? 0))); setHasOlder(data.hasMore);
      requestAnimationFrame(() => { if (viewport.current) viewport.current.scrollTop += viewport.current.scrollHeight - height; });
    } catch (e) { if (alive.current) setError(requestError(e, t)); } finally { if (alive.current) setOlderBusy(false); }
  }
  async function send(event?: FormEvent) {
    event?.preventDefault(); if (sending || (!body.trim() && (!files.length || editing)) || body.length > 4000 || thread?.status === "resolved") return;
    const text = body.trim(), signature = JSON.stringify([text, replyTo?.id, files.map(file => [file.name, file.size, file.lastModified])]);
    if (pending.current.signature !== signature) pending.current = { signature, key: messageKey() };
    setSending(true); setSendError("");
    try {
      if (editing) {
        const data = await communityApi<{ message: ChatMessage }>(`/${id}/messages/${editing.id}`, { method: "PATCH", body: { body: text, expectedRevision: editing.changeSequence } });
        if (!alive.current) return;
        setMessages(items => mergeMessages(items, [data.message])); setEditing(null); setBody(previousDraft.current); saveDraft(previousDraft.current); refreshList(); return;
      }
      let input: unknown = { body: text, clientKey: pending.current.key, ...(replyTo ? { replyToId: replyTo.id } : {}) };
      if (files.length) { const form = new FormData(); form.set("body", text); form.set("clientKey", pending.current.key); if (replyTo) form.set("replyToId", replyTo.id); files.forEach(file => form.append("files", file)); input = form; }
      const data = await communityApi<{ message: ChatMessage }>(`/${id}/messages${files.length ? "/files" : ""}`, { method: "POST", body: input });
      saveDraft(""); if (!alive.current) return;
      // Do not advance the polling cursor here: a concurrent user's reply may precede ours.
      stick.current = true; setAtBottom(true); setMessages(items => mergeMessages(items, [data.message])); setBody(""); setReplyTo(null); setFiles([]); pending.current = { signature: "", key: "" }; refreshList(); setRevision(n => n + 1);
      requestAnimationFrame(() => composer.current?.focus());
    } catch (e) { if (alive.current) setSendError(requestError(e, t)); }
    finally { if (alive.current) setSending(false); }
  }
  function cancelEdit() { setEditing(null); setBody(previousDraft.current); saveDraft(previousDraft.current); setSendError(""); }
  function chooseFiles(next: FileList | null) {
    const chosen = [...files, ...Array.from(next ?? [])];
    if (chosen.length > 3 || chosen.some(file => file.size > 50 * 1024 * 1024 || !file.size)) { setSendError(t("حداکثر سه فایل، هر فایل تا ۵۰ مگابایت.", "Up to three files, 50 MiB each.")); return; }
    if (chosen.some(file => !/\.(png|jpe?g|webp|pdf|txt|log|csv)$/i.test(file.name))) { setSendError(t("تصویر، PDF یا متن ساده انتخاب کن؛ فایل اجرایی مجاز نیست.", "Choose an image, PDF or plain text. Executables are not allowed.")); return; }
    setFiles(chosen); setSendError("");
  }
  async function removeMessage() {
    if (!deleting || deleteBusy) return; setDeleteBusy(true);
    try { const data = await communityApi<{ message: ChatMessage }>(`/${id}/messages/${deleting.id}`, { method: "DELETE", body: { expectedRevision: deleting.changeSequence } });
      if (!alive.current) return; setMessages(items => mergeMessages(items, [data.message])); if (replyTo?.id === deleting.id) setReplyTo(null); setDeleting(null); refreshList();
    } catch (e) { if (alive.current) setSendError(requestError(e, t)); } finally { if (alive.current) setDeleteBusy(false); }
  }
  async function download(file: Attachment) {
    try {
      const response = await fetch(attachmentUrl(id, file.id), { credentials: "include" });
      if (!response.ok) throw { status: response.status };
      const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a"); link.href = url; link.download = file.fileName; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) { if (alive.current) setSendError(requestError(e, t)); }
  }
  async function changeStatus(status: ThreadStatus) {
    setBusyStatus(true);
    try { await communityApi(`/${id}`, { method: "PATCH", body: { status } }); if (alive.current) { setThread(item => item ? { ...item, status } : item); refreshList(); } }
    catch (e) { if (alive.current) setError(requestError(e, t)); } finally { if (alive.current) setBusyStatus(false); }
  }
  return <article className="hub-conversation" aria-label={thread?.title ?? t("گفت‌وگو", "Conversation")}>
    <header className="hub-conversation__header"><button className="hub-back" onClick={onBack} aria-label={t("بازگشت به فهرست", "Back to conversations")}><ArrowRight size={20}/></button><span className="hub-avatar">{thread?.kind === "ticket" ? <Ticket size={21}/> : <Hash size={21}/>}</span><div><h2>{thread?.title ?? t("در حال دریافت…", "Loading…")}</h2><p>{thread?.creator.displayName}<span> · </span>{thread?.kind === "ticket" ? t("تیکت خصوصی", "Private ticket") : t("گفت‌وگوی فضای کاری", "Workspace discussion")}</p></div>
      {thread && (user?.role === "admin" ? <select className={`hub-status is-${thread.status}`} value={thread.status} disabled={busyStatus} onChange={e => void changeStatus(e.target.value as ThreadStatus)} aria-label={t("تغییر وضعیت", "Change status")}>{Object.entries(labels(t)).map(([value, title]) => <option value={value} key={value}>{title}</option>)}</select> : <span className={`hub-status is-${thread.status}`}>{labels(t)[thread.status]}</span>)}
    </header>
    {error && <div className="hub-error" role="alert">{error}<button onClick={() => setRevision(n => n + 1)}>{t("تلاش دوباره", "Retry")}</button></div>}
    <div className="hub-messages" ref={viewport} tabIndex={0} aria-label={t("پیام‌های گفت‌وگو", "Conversation messages")} onScroll={() => { const el = viewport.current!; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; setAtBottom(stick.current); }}>
      {hasOlder && <button className="hub-more" disabled={olderBusy} onClick={() => void older()}>{olderBusy ? t("در حال دریافت…", "Loading…") : t("پیام‌های قبلی", "Earlier messages")}</button>}
      {messages.map((message, index) => {
        const mine = message.authorId === user?.id, day = new Date(message.createdAt).toLocaleDateString(isFa ? "fa-IR" : "en-US");
        const showDay = index === 0 || new Date(messages[index - 1].createdAt).toLocaleDateString(isFa ? "fa-IR" : "en-US") !== day;
        return <div key={message.id}>{showDay && <div className="hub-day"><span>{day}</span></div>}<div id={`message-${message.id}`} className={`hub-message ${mine ? "is-mine" : ""} ${message.deletedAt ? "is-deleted" : ""}`}><span className="hub-message__avatar" aria-hidden="true">{message.author.displayName.slice(0, 1)}</span><div className="hub-bubble">
          <div className="hub-bubble-top"><strong>{mine ? t("شما", "You") : message.author.displayName}</strong>{!message.deletedAt && <details className="hub-message-menu" onToggle={e => {
            const menu = e.currentTarget; if (!menu.open) return;
            const boundary = menu.closest(".hub-messages")!.getBoundingClientRect(), rect = menu.getBoundingClientRect();
            const above = rect.top - boundary.top - 8, below = boundary.bottom - rect.bottom - 8;
            const up = below < 190 && above > below; menu.classList.toggle("opens-up", up);
            menu.style.setProperty("--hub-menu-height", `${Math.max(70, up ? above : below)}px`);
          }}><summary aria-label={t("گزینه‌های پیام", "Message actions")}><MoreHorizontal size={18}/></summary><div>
            <button type="button" disabled={sending || !!editing || thread?.status === "resolved"} onClick={e => { e.currentTarget.closest("details")?.removeAttribute("open"); setReplyTo(message); composer.current?.focus(); }}><Reply size={15}/>{t("پاسخ", "Reply")}</button>
            {mine && <><button type="button" disabled={sending || !!editing || thread?.status === "resolved"} onClick={e => { e.currentTarget.closest("details")?.removeAttribute("open"); previousDraft.current = body; setEditing(message); setBody(message.body); setReplyTo(null); composer.current?.focus(); }}><Pencil size={15}/>{t("ویرایش", "Edit")}</button><button type="button" disabled={sending || !!editing} onClick={e => { e.currentTarget.closest("details")?.removeAttribute("open"); setDeleting(message); }}><Trash2 size={15}/>{t("حذف", "Delete")}</button></>}
            {thread?.kind === "discussion" && <button type="button" onClick={e => { e.currentTarget.closest("details")?.removeAttribute("open"); setTaskSource(message); }}><ClipboardList size={15}/>{t("تبدیل به کار", "Create task")}</button>}
          </div></details>}</div>
          {message.replyTo && !message.deletedAt && <blockquote className="hub-quote"><strong>{message.replyTo.author.displayName}</strong><span>{message.replyTo.deletedAt ? t("پیام حذف شده است", "Message deleted") : message.replyTo.body || t("پیوست", "Attachment")}</span></blockquote>}
          <p dir="auto">{message.deletedAt ? t("این پیام حذف شده است.", "This message was deleted.") : message.body}</p>
          {!message.deletedAt && message.attachments?.map(file => <button type="button" key={file.id} className="hub-file" onClick={() => void download(file)}><span><FileText size={20}/></span><span><strong dir="auto">{file.fileName}</strong><small>{(file.size / 1024).toLocaleString(isFa ? "fa-IR" : "en-US", { maximumFractionDigits: 0 })} KB · {t("دانلود فایل", "Download file")}</small></span><Download size={16}/></button>)}
          <time dateTime={message.createdAt}>{message.editedAt && !message.deletedAt && <span>{t("ویرایش‌شده", "Edited")} · </span>}{new Date(message.createdAt).toLocaleTimeString(isFa ? "fa-IR" : "en-US", { hour: "2-digit", minute: "2-digit" })}{mine && <CheckCheck size={13} aria-label={t("ثبت‌شده", "Saved")}/>}</time></div></div></div>;
      })}
      {!messages.length && !error && <p className="hub-list-empty">{thread ? t("پیامی باقی نمانده؛ پیام‌های قدیمی ممکن است طبق سیاست نگهداری حذف شده باشند.", "No retained messages. Older messages may have expired under the retention policy.") : t("در حال دریافت پیام‌ها…", "Loading messages…")}</p>}
    </div>
    {!atBottom && <button className="hub-jump" onClick={() => { stick.current = true; setAtBottom(true); if (viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight; }}><ArrowDown size={15}/>{t("آخرین پیام‌ها", "Latest messages")}</button>}
    <div className="hub-composer-wrap">{sendError && <p role="alert" className="hub-error">{sendError}</p>}
      {notice && <p className="hub-success" role="status"><Check size={16}/>{notice}<button onClick={() => setNotice("")} aria-label={t("بستن", "Close")}><X size={15}/></button></p>}
      {(replyTo || editing) && <div className="hub-compose-context">{editing ? <Pencil size={17}/> : <Reply size={17}/>}<div><strong>{editing ? t("ویرایش پیام", "Editing message") : `${t("پاسخ به", "Reply to")} ${replyTo!.author.displayName}`}</strong><span>{(editing ?? replyTo)?.body.slice(0, 130) || t("پیوست", "Attachment")}</span></div><button type="button" disabled={sending} onClick={() => editing ? cancelEdit() : setReplyTo(null)} aria-label={t("انصراف", "Cancel")}><X size={17}/></button></div>}
      {!!files.length && !editing && <div className="hub-pending-files">{files.map((file, i) => <span key={`${file.name}-${i}`}><Paperclip size={13}/><span dir="auto">{file.name}</span><button type="button" disabled={sending} onClick={() => setFiles(items => items.filter((_, index) => index !== i))} aria-label={t("برداشتن فایل", "Remove file")}><X size={14}/></button></span>)}</div>}
      {thread?.status === "resolved" ? <p className="hub-closed"><CheckCheck size={18}/>{t("گفت‌وگو بسته شده؛ مدیر می‌تواند دوباره بازش کند.", "Closed. An administrator can reopen this conversation.")}</p> : <form onSubmit={send} className="hub-composer">
        {!editing && <><input ref={fileInput} type="file" multiple hidden accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.log,.csv" aria-label={t("انتخاب پیوست", "Choose attachments")} onChange={e => { chooseFiles(e.target.files); e.target.value = ""; }}/><button className="hub-attach" type="button" disabled={sending || !thread || files.length >= 3} onClick={() => fileInput.current?.click()} aria-label={t("پیوست فایل", "Attach files")} title={t("حداکثر سه فایل، هر فایل ۵۰ مگابایت", "Three files, 50 MiB each")}><Paperclip size={20}/></button></>}
        <label className="sr-only" htmlFor="community-message">{t("متن پیام", "Your message")}</label><textarea id="community-message" ref={composer} value={body} maxLength={4000} disabled={sending || !thread} rows={2} dir="auto" placeholder={t("پیامت را بنویس…", "Write a message…")} onChange={e => { setBody(e.target.value); if (!editing) saveDraft(e.target.value); }} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !window.matchMedia("(pointer: coarse)").matches) { e.preventDefault(); void send(); } }}/><button className="hub-send" type="submit" disabled={sending || !thread || (!body.trim() && (!files.length || !!editing))} aria-label={editing ? t("ذخیرهٔ پیام", "Save message") : t("ارسال پیام", "Send message")}>{editing ? <Check size={19}/> : <Send size={19}/>}<span>{sending ? t("ارسال…", "Sending…") : editing ? t("ذخیره", "Save") : t("ارسال", "Send")}</span></button></form>}
      <div className="hub-composer__hint"><span><LockKeyhole size={12}/>{files.length ? t("فایل‌ها اسکن آنتی‌ویروس نشده‌اند.", "Files are not antivirus-scanned.") : t("اطلاعات محرمانه نفرست.", "Keep confidential information private.")}</span><span>{files.length ? t("هر فایل تا ۵۰ MB", "50 MiB per file") : `${body.length.toLocaleString(isFa ? "fa-IR" : "en-US")} / ${Number(4000).toLocaleString(isFa ? "fa-IR" : "en-US")}`}</span></div>
    </div>
    {deleting && <DeleteMessageDialog busy={deleteBusy} error={sendError} t={t} onClose={() => setDeleting(null)} onConfirm={() => void removeMessage()}/>}
    {taskSource && <TaskDialog source={taskSource} isFa={isFa} onClose={() => setTaskSource(null)} onSaved={() => { setTaskSource(null); setNotice(t("کار ثبت شد؛ از تب کارها پیگیری کن.", "Task created. Follow up in Tasks.")); }}/ >}
    <span className="sr-only" role="status">{messages.length ? t(`${messages.length} پیام دریافت شد`, `${messages.length} messages loaded`) : ""}</span>
  </article>;
}

function DeleteMessageDialog({ busy, error, t, onClose, onConfirm }: { busy: boolean; error: string; t: Translate; onClose: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="hub-dialog community-hub" aria-labelledby="delete-message-title" onCancel={e => { if (busy) e.preventDefault(); else onClose(); }}>
    <header><span className="hub-avatar"><Trash2/></span><h2 id="delete-message-title">{t("پیام حذف شود؟", "Delete this message?")}</h2></header><p className="hub-dialog__privacy">{t("متن و پیوست‌های این پیام برای همه حذف می‌شوند. جای پیام باقی می‌ماند و بازگردانی ندارد.", "Text and attachments will be removed for everyone. A deleted-message marker remains. This cannot be undone.")}</p>
    {error && <p className="hub-error" role="alert">{error}</p>}<footer><button disabled={busy} onClick={onClose}>{t("انصراف", "Cancel")}</button><button className="hub-primary hub-delete-confirm" disabled={busy} onClick={onConfirm}>{busy ? t("در حال حذف…", "Deleting…") : t("حذف پیام", "Delete message")}</button></footer>
  </dialog>;
}

function CreateConversation({ kind, t, onClose, onCreated }: { kind: Kind; t: Translate; onClose: () => void; onCreated: (id: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null), pending = useRef({ signature: "", key: "" });
  const [title, setTitle] = useState(""), [body, setBody] = useState(""), [priority, setPriority] = useState("normal"), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); dialog.current?.querySelector("input")?.focus(); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy || !title.trim() || !body.trim()) return; setBusy(true); setError("");
    const signature = JSON.stringify([kind, title.trim(), body.trim(), priority]);
    if (pending.current.signature !== signature) pending.current = { signature, key: messageKey() };
    try { const created = await communityApi<{ id: string }>("", { method: "POST", body: { kind, title: title.trim(), body: body.trim(), priority, clientKey: pending.current.key } }); onCreated(created.id); }
    catch (e) { setError(requestError(e, t)); } finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="hub-dialog community-hub" aria-labelledby="new-conversation-title" onCancel={e => { if (busy) e.preventDefault(); else onClose(); }} onClick={e => { if (e.target === dialog.current && !busy) { const rect = dialog.current.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) onClose(); } }}>
    <form onSubmit={submit}><header><span className="hub-avatar">{kind === "ticket" ? <Ticket/> : <MessagesSquare/>}</span><h2 id="new-conversation-title">{kind === "ticket" ? t("ثبت تیکت", "Create a ticket") : t("شروع گفت‌وگو", "Start a conversation")}</h2><button type="button" disabled={busy} onClick={onClose} aria-label={t("بستن", "Close")}><X size={20}/></button></header>
      <p className="hub-dialog__privacy"><LockKeyhole size={16}/>{kind === "ticket" ? t("فقط شما و مدیر فضای کاری می‌بینید.", "Only you and your workspace administrator can see this.") : t("همه کاربران همین فضای کاری می‌توانند بخوانند و پاسخ دهند.", "Everyone in this workspace can read and reply.")}</p>
      <label>{t("عنوان", "Subject")}<input autoFocus required maxLength={120} value={title} disabled={busy} onChange={e => setTitle(e.target.value)} placeholder={t("موضوع را کوتاه بنویس", "A short, clear subject")}/></label>
      {kind === "ticket" && <label>{t("اولویت", "Priority")}<select value={priority} disabled={busy} onChange={e => setPriority(e.target.value)}><option value="normal">{t("عادی", "Normal")}</option><option value="urgent">{t("فوری", "Urgent")}</option></select></label>}
      <label>{t("پیام", "Message")}<textarea required rows={5} maxLength={4000} value={body} disabled={busy} dir="auto" onChange={e => setBody(e.target.value)} placeholder={kind === "ticket" ? t("چه اتفاقی افتاده و انتظار داشتی چه شود؟", "What happened, and what did you expect?") : t("سؤال یا تجربه‌ات را بنویس…", "Share your question or experience…")}/></label>
      <small><CircleHelp size={14}/>{t("رمز و اطلاعات حساس را ننویس.", "Do not include credentials or sensitive information.")}</small>{error && <p role="alert" className="hub-error">{error}</p>}
      <footer><button type="button" disabled={busy} onClick={onClose}>{t("انصراف", "Cancel")}</button><button className="hub-primary" disabled={busy || !title.trim() || !body.trim()} type="submit"><Send size={17}/>{busy ? t("در حال ثبت…", "Saving…") : t("ثبت و ارسال", "Create & send")}</button></footer>
    </form>
  </dialog>;
}
