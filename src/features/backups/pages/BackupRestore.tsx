import { useEffect, useMemo, useRef, useState } from "react";
import { Upload, Download, RotateCcw, Loader2, Trash2, X } from "lucide-react";
import { apiRequest } from "@/lib/apiTransport";
import { useAuth } from "@/context/AuthContext";
import { backupTime } from "./BackupHistory";
import BackupDeleteDialog from "./BackupDeleteDialog";
import "./BackupRestore.css";
type Device = { id: string; name: string; host: string; vendor: string; company: { id: string; name: string } | null };
type Artifact = { id: string; deviceId: string; deviceName: string; companyName: string; filename: string; bytes: number; sha256: string; vendor: string; actorName: string; createdAt: string; origin: string };
type Plan = { id: string; vendor: string; method: string; filename: string; sha256: string; deviceName: string; host: string; expiresAt: string };
type Job = { id: string; status: string; device: { name: string; vendor: string } | null; createdAt: string; interrupted: boolean;
  preview: { filename?: string; actorName?: string }; result: { state?: string; safetyBackupId?: string; code?: string } | null };
const messages: Record<string, string> = {
  RESTORE_INVALID_FILE: "این فایل بک‌آپ معتبر و کامل نیست.",
  RESTORE_UNSAFE_PATH: "آرشیو مسیر نامعتبر یا لینک ناسازگار دارد.",
  RESTORE_ARCHIVE_FORMAT_UNSUPPORTED: "نوع این آرشیو برای بازگردانی پشتیبانی نمی‌شود.",
  RESTORE_VERSION_MISSING: "نسخه دستگاه در فایل مشخص نیست؛ بک‌آپ اصلی را انتخاب کنید.",
  RESTORE_DEVICE_VERSION_MISMATCH: "نسخه، مدل یا شناسه فایل با دستگاه مطابقت ندارد.",
  RESTORE_MASKED_SECRETS: "رمزهای فایل فورتی‌گیت پوشانده شده‌اند.",
  RESTORE_ROUTEROS_DRY_RUN_REQUIRED: "بازگردانی متنی به RouterOS 7.16 یا بالاتر نیاز دارد.",
  RESTORE_TARGET_CHANGED: "تنظیم اتصال تغییر کرده؛ پیش‌نمایش تازه بسازید.",
  RESTORE_PREVIEW_EXPIRED: "پیش‌نمایش منقضی شده؛ دوباره بررسی کنید.",
  RESTORE_ALREADY_STARTED: "این عملیات قبلاً شروع شده؛ تاریخچه را بررسی کنید.",
  RESTORE_BUSY: "عملیات دیگری روی دستگاه در حال اجراست.",
  RESTORE_COMMAND_FAILED: "مرحله اجرا پذیرفته نشد؛ مجوز و پیش‌نیاز دستگاه را بررسی کنید.",
  RESTORE_SCP_REQUIRED: "SCP دستگاه فعال یا مجاز نیست.",
  RESTORE_SFTP_REQUIRED: "SFTP دستگاه در دسترس نیست.",
  RESTORE_VERIFICATION_FAILED: "بازگردانی تأیید نشده؛ دستگاه و بک‌آپ ایمنی را بررسی کنید.",
  RESTORE_REVIEW_REQUIRED: "نتیجه نیاز به بررسی دارد؛ عملیات را خودکار تکرار نکنید.",
  RESTORE_VAULT_FULL: "مخزن ۱۰۰ فایل دارد؛ فایل‌های غیرضروری را حذف کنید.",
  BACKUP_TOO_LARGE: "حداکثر حجم فایل ۲۰ مگابایت است.",
  BACKUP_NOT_FOUND: "فایل دیگر در دسترس نیست.",
  BACKUP_INTEGRITY_FAILED: "صحت فایل تأیید نشد.",
  ADMIN_REQUIRED: "بازگردانی فقط برای مدیر فعال است.",
  SSH_AUTH_FAILED: "اعتبارنامه دستگاه پذیرفته نشد.",
  SSH_HANDSHAKE_TIMEOUT: "دستگاه به اتصال SSH پاسخ نداد."
};
const states: Record<string, string> = {
  taking_safety_backup: "در حال گرفتن بک‌آپ ایمنی", applying: "در حال اعمال",
  awaiting_verification: "منتظر بازگشت دستگاه و بررسی نتیجه", applied_merge_needs_review: "Import انجام شد؛ تطبیق کامل تأیید نشده",
  files_verified_activation_required: "فایل‌ها تأیید شدند؛ سرویس‌ها ری‌استارت نشدند",
  running_configuration_verified: "تنظیمات جاری تأیید شدند؛ Startup تغییر نکرد",
  configuration_verified: "تنظیمات دستگاه تأیید شدند", needs_review: "نتیجه نامشخص؛ نیازمند بررسی",
  failed_before_apply: "متوقف شد؛ مرحله اعمال شروع نشد"
};
const methods: Record<string, string> = {
  etc_overlay: "محتوای /etc بازگردانی می‌شود؛ فایل‌های اضافی حذف نمی‌شوند و سرویس‌ها ری‌استارت نمی‌شوند. کاربران، رمزها، SSH و شبکه ممکن است تغییر کنند.",
  import_merge: "فایل Import می‌شود؛ جایگزینی کامل نیست. تنظیمات قبلی باقی می‌مانند و موارد تکراری ممکن است خطا بدهند.",
  replace_running: "Running-config جایگزین می‌شود؛ تایمر برگشت فقط پس از تطبیق تأیید می‌شود. Startup-config تغییر نمی‌کند.",
  native_scp: "بک‌آپ بومی اعمال می‌شود؛ دستگاه ممکن است ری‌استارت شود. دریافت فایل به معنی موفقیت نهایی نیست."
};
async function checked(response: Response) {
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(messages[body.error] || "عملیات کامل نشد؛ اتصال و دسترسی دستگاه را بررسی کنید."); }
  return response;
}
export default function BackupRestore({ devices, onChanged }: { devices: Device[]; onChanged: () => void }) {
  const { user } = useAuth(), admin = user?.role === "admin";
  const [company, setCompany] = useState(""), [target, setTarget] = useState("");
  const [files, setFiles] = useState<Artifact[]>([]), [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState(""), [upload, setUpload] = useState<File | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null), [fullEtc, setFullEtc] = useState(false);
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [deleteFile, setDeleteFile] = useState<Artifact | null>(null), [now, setNow] = useState(Date.now());
  const dialog = useRef<HTMLDialogElement>(null), uploadInput = useRef<HTMLInputElement>(null);
  const companies = useMemo(() => [...new Map(devices.filter(d => d.company).map(d => [d.company!.id, d.company!])).values()], [devices]);
  const filtered = devices.filter(d => (!company || d.company?.id === company) && ["linux", "linux_edge", "cisco", "mikrotik", "fortigate", "fortinet"].includes(d.vendor));
  const visibleFiles = files.filter(f => !target || f.deviceId === target).filter(f => !company || devices.find(d => d.id === f.deviceId)?.company?.id === company);
  const artifact = files.find(f => f.id === selected);
  async function refresh() {
    const [vault, history] = await Promise.all([checked(await apiRequest("/backups/vault")), checked(await apiRequest("/backups/restores"))]);
    setFiles((await vault.json()).files); setJobs((await history.json()).items);
  }
  useEffect(() => {
    let live = true, timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const [vault, history] = await Promise.all([checked(await apiRequest("/backups/vault")), checked(await apiRequest("/backups/restores"))]);
        const v = await vault.json(), h = await history.json();
        if (live) { setFiles(v.files); setJobs(h.items); setNow(Date.now()); timer = setTimeout(() => void poll(), h.items.some((j: Job) => j.status === "executing" && !j.interrupted) ? 2000 : 10000); }
      } catch (e) { if (live) { setError(e instanceof Error ? e.message : "بارگذاری انجام نشد."); timer = setTimeout(() => void poll(), 10000); } }
    };
    void poll(); return () => { live = false; clearTimeout(timer); };
  }, []);
  useEffect(() => { if (plan && dialog.current && !dialog.current.open) dialog.current.showModal(); if (!plan) dialog.current?.close(); }, [plan]);
  async function work(key: string, task: () => Promise<void>) {
    if (busy) return; setBusy(key); setError(""); setNotice("");
    try { await task(); } catch (e) { setError(e instanceof Error ? e.message : "انجام نشد."); }
    finally { setBusy(""); }
  }
  async function addUpload() {
    if (!upload || !target) return;
    if (upload.size > 20 * 1024 * 1024) { setError(messages.BACKUP_TOO_LARGE); return; }
    await work("upload", async () => {
      const form = new FormData(); form.append("file", upload);
      const response = await checked(await apiRequest("/backups/vault?deviceId=" + encodeURIComponent(target), { method: "POST", body: form }));
      const record = await response.json(); setSelected(record.id); setUpload(null); if (uploadInput.current) uploadInput.current.value = "";
      setNotice("فایل ذخیره شد؛ هنوز روی دستگاه اعمال نشده است."); await refresh();
    });
  }
  async function preview() {
    if (!artifact) return;
    await work("preview", async () => {
      const response = await checked(await apiRequest("/backups/restores/preview", { method: "POST", body: JSON.stringify({ artifactId: artifact.id }) }));
      setFullEtc(false); setPlan(await response.json()); await refresh();
    });
  }
  async function execute() {
    if (!plan) return;
    await work("execute", async () => {
      await checked(await apiRequest("/backups/restores/" + encodeURIComponent(plan.id) + "/execute", { method: "POST", body: JSON.stringify({
        intent: "execute", sha256: plan.sha256, confirmation: "RESTORE BACKUP", ...(plan.vendor === "linux" ? { fullEtcConfirmation: "RESTORE FULL ETC" } : {})
      }) }));
      setPlan(null); setNotice("عملیات شروع شد؛ نتیجه در تاریخچه نمایش داده می‌شود."); await refresh(); onChanged();
    });
  }
  async function download(file: Artifact) {
    await work("download", async () => {
      const response = await checked(await apiRequest("/backups/vault/" + encodeURIComponent(file.id) + "/download"));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob), anchor = document.createElement("a"); anchor.href = url; anchor.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] || file.filename;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    });
  }
  return <div className="backup-restore">
    {error && <div className="backup-message error" role="alert">{error}</div>}
    {notice && <div className="backup-message success" role="status">{notice}</div>}
    <section className="backup-panel">
      <div className="backup-history-heading"><h2>مخزن و بازگردانی</h2><span>{visibleFiles.length.toLocaleString("fa-IR")} فایل</span></div>
      <div className="backup-fields">
        <label>شرکت<select disabled={Boolean(busy)} value={company} onChange={e => { setCompany(e.target.value); setTarget(""); setSelected(""); }}><option value="">همه شرکت‌ها</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>دستگاه مبدأ و مقصد<select disabled={Boolean(busy)} value={target} onChange={e => { setTarget(e.target.value); setSelected(""); }}><option value="">انتخاب دستگاه</option>{filtered.map(d => <option key={d.id} value={d.id}>{d.name} · {d.vendor} · {d.host}</option>)}</select></label>
      </div>
      {admin && <div className="restore-upload">
        <label htmlFor="restore-upload-file">آپلود بک‌آپ همین دستگاه <small>CFG · RSC · CONF · TAR.GZ — حداکثر ۲۰ MB</small></label>
        <div><input id="restore-upload-file" ref={uploadInput} type="file" accept=".cfg,.conf,.rsc,.tar.gz,.tgz" disabled={Boolean(busy) || !target} onChange={e => setUpload(e.target.files?.[0] || null)} /><button disabled={Boolean(busy) || !target || !upload} onClick={() => void addUpload()}>{busy === "upload" ? <Loader2 size={18} className="backup-spin" /> : <Upload size={18} />}آپلود</button></div>
      </div>}
      <div className="restore-files" role="group" aria-label="انتخاب فایل بک‌آپ">
        {!visibleFiles.length ? <p className="backup-empty">فایلی برای این انتخاب ندارید.</p> : visibleFiles.map(file => <article key={file.id} className={selected === file.id ? "restore-file selected" : "restore-file"}>
          <label><input className="restore-radio" type="radio" name="restore-artifact" disabled={Boolean(busy) || !admin} checked={selected === file.id} onChange={() => setSelected(file.id)} />
            <span><strong>{file.deviceName}</strong><code dir="ltr">{file.filename}</code><small>{file.origin === "uploaded" ? "آپلودی" : "گرفته‌شده از دستگاه"} · {backupTime(file.createdAt)} · {file.actorName}</small></span></label>
          <div className="restore-file-actions"><button disabled={Boolean(busy)} aria-label={"دانلود " + file.filename} onClick={() => void download(file)}><Download size={18} /></button>
            {admin && file.origin === "uploaded" && <button className="backup-delete-button" disabled={Boolean(busy)} aria-label={"حذف " + file.filename} onClick={() => setDeleteFile(file)}><Trash2 size={18} /></button>}</div>
        </article>)}
      </div>
      <footer className="restore-preview-footer"><span>{artifact ? artifact.deviceName + " · " + artifact.vendor : "فایل را انتخاب کنید"}</span>
        {admin && <button className="backup-primary" disabled={!artifact || Boolean(busy)} onClick={() => void preview()}>{busy === "preview" ? <Loader2 size={18} className="backup-spin" /> : <RotateCcw size={18} />}بررسی و پیش‌نمایش</button>}</footer>
    </section>
    <section className="backup-panel"><h2>تاریخچه بازگردانی</h2>
      {!jobs.length ? <p className="backup-empty">هنوز بازگردانی ثبت نشده است.</p> : <div className="backup-history">{jobs.map(job => <article className="restore-job" key={job.id}>
        <div><h3>{job.device?.name || "دستگاه حذف‌شده"} <small>{job.device?.vendor}</small></h3><code dir="ltr">{job.preview?.filename}</code><p>{job.preview?.actorName} · <time dateTime={job.createdAt}>{backupTime(job.createdAt)} · تهران</time></p></div>
        <div><strong className="restore-state" role="status">{job.interrupted ? "اجرای قطع‌شده؛ نیازمند بررسی دستی" : states[job.result?.state || ""] || (job.status === "dry_run_ready" ? "پیش‌نمایش؛ اجرا نشده" : "نیازمند بررسی")}</strong>
          {job.result?.code && <p>{messages[job.result.code] || "مرحله اجرا کامل نشد؛ اتصال و مجوز را بررسی کنید."}</p>}
          {job.result?.safetyBackupId && <button disabled={Boolean(busy)} onClick={() => void download({ id: job.result!.safetyBackupId!, filename: "safety-backup-" + job.device?.name, } as Artifact)}><Download size={16} />بک‌آپ قبل از تغییر</button>}
          {admin && ["awaiting_verification", "applied_merge_needs_review"].includes(job.result?.state || "") && <button disabled={Boolean(busy)} onClick={() => void work("verify", async () => { await checked(await apiRequest("/backups/restores/" + encodeURIComponent(job.id) + "/verify", { method: "POST" })); await refresh(); setNotice("تنظیمات فعلی دستگاه با فایل مطابقت دارد."); })}>بررسی نتیجه دستگاه</button>}
        </div>
      </article>)}</div>}
    </section>
    <BackupDeleteDialog open={Boolean(deleteFile)} busy={busy === "delete"} title="حذف فایل آپلودی؟" description="فایل از مخزن حذف می‌شود؛ تنظیمات دستگاه و سوابق عملیات تغییر نمی‌کنند." onCancel={() => setDeleteFile(null)} onConfirm={() => void work("delete", async () => {
      await checked(await apiRequest("/backups/vault/" + encodeURIComponent(deleteFile!.id), { method: "DELETE", body: JSON.stringify({ confirmation: "DELETE UPLOADED BACKUP" }) }));
      if (selected === deleteFile!.id) setSelected(""); setDeleteFile(null); await refresh();
    })} />
    <dialog className="backup-delete-dialog restore-confirm" ref={dialog} aria-labelledby="restore-confirm-title" onCancel={e => { e.preventDefault(); if (!busy) setPlan(null); }} onClick={e => { if (e.target === e.currentTarget && !busy) setPlan(null); }}>
      <header><h2 id="restore-confirm-title">تأیید بازگردانی</h2><button disabled={Boolean(busy)} aria-label="بستن" onClick={() => setPlan(null)}><X size={18} /></button></header>
      {plan && <><dl><dt>دستگاه مقصد</dt><dd>{plan.deviceName} <bdi>{plan.host}</bdi></dd><dt>فایل</dt><dd><code dir="ltr">{plan.filename}</code></dd></dl>
        <p className="restore-warning">{methods[plan.method]}</p><p>پیش از تغییر، بک‌آپ تازه گرفته می‌شود. برای قطع احتمالی اتصال، دسترسی کنسول یا مسیر بازیابی داشته باشید.</p>
        {plan.vendor === "linux" && <label className="restore-etc-confirm"><input type="checkbox" checked={fullEtc} disabled={Boolean(busy)} onChange={e => setFullEtc(e.target.checked)} />بازگردانی کل محتوای /etc و احتمال تغییر کاربران، SSH و شبکه را تأیید می‌کنم.</label>}
        <details><summary>شناسه فایل و اعتبار پیش‌نمایش</summary><code dir="ltr">SHA-256: {plan.sha256}</code><p>معتبر تا {backupTime(plan.expiresAt)}</p></details>
        <footer><button autoFocus disabled={Boolean(busy)} onClick={() => setPlan(null)}>انصراف</button><button className="backup-primary" disabled={Boolean(busy) || (plan.vendor === "linux" && !fullEtc) || Date.parse(plan.expiresAt) < now} onClick={() => void execute()}>{busy === "execute" ? "در حال ثبت…" : "تأیید و بازگردانی"}</button></footer></>}
    </dialog>
  </div>;
}
