import { useEffect, useMemo, useState } from "react";
import { Archive, Download, Loader2, ShieldCheck, Search } from "lucide-react";
import { apiRequest } from "@/lib/apiTransport";
import { Link } from "react-router-dom";
import "./BackupsPage.css";
type Profile = { title: string; extension: string; scope: string; supported: boolean };
type Target = { id: string; name: string; vendor: string; host: string; company: { id: string; name: string } | null; profile: Profile };
type Record = { id: string; deviceId: string; deviceName: string; vendor: string; filename: string; bytes: number; scope: string; title: string; actor: string; createdAt: string; sha256: string };
type Data = { devices: Target[]; history: Record[] };
const errors: { [key: string]: string } = {
  SSH_HANDSHAKE_TIMEOUT: "دستگاه پاسخ SSH نمی‌دهد. IP، پورت ثبت‌شده و اجازه اتصال از سرور برنامه را بررسی کنید.",
  SSH_AUTH_FAILED: "احراز هویت دستگاه ناموفق بود. اعتبارنامه اتصال را بررسی کنید.",
  SSH_RECONNECT_BACKOFF: "اتصال قبلی ناموفق بوده؛ کمی بعد دوباره تلاش کنید.",
  SSH_TCP_CONNECT_FAILED: "سرور برنامه به پورت SSH دستگاه دسترسی ندارد.",
  BACKUP_INCOMPLETE_CONFIG: "خروجی تنظیمات ناقص بود؛ فایل ذخیره نشد.",
  BACKUP_COMMAND_REJECTED: "دستگاه دستور بک‌آپ را نپذیرفت؛ دسترسی حساب را بررسی کنید.",
  BACKUP_INVALID_ARCHIVE: "آرشیو معتبر دریافت نشد؛ فایل ذخیره نشد.",
  BACKUP_INCOMPLETE_ARCHIVE: "آرشیو کامل دریافت نشد؛ فایل ذخیره نشد.",
  BACKUP_FORTIGATE_SCP_REQUIRED: "دریافت SCP کامل نشد. در FortiGate فعال بودن admin-scp و دسترسی حساب به بک‌آپ را بررسی کنید.",
  BACKUP_ACCESS_DENIED: "دسترسی مدیریت تجهیزات برای بک‌آپ لازم است.",
  BACKUP_SSH_REQUIRED: "برای این دستگاه ابتدا مسیر SSH را در تنظیم اتصال ثبت و فعال کنید.",
  BACKUP_CREDENTIAL_REQUIRED: "اعتبارنامه اتصال دستگاه را ثبت کنید.",
  BACKUP_ENCRYPTION_REQUIRED: "کلید رمزنگاری روی سرور برنامه تنظیم نشده است.",
  BACKUP_COMMAND_FAILED: "دستگاه نتوانست بک‌آپ کامل تهیه کند. مجوز خواندن تنظیمات و sudo بدون رمز را بررسی کنید.",
  BACKUP_BUSY: "یک بک‌آپ در حال اجراست؛ کمی بعد دوباره تلاش کنید.",
  BACKUP_TIMEOUT: "دریافت فایل بیش از حد طول کشید. اتصال دستگاه را بررسی کنید.",
  BACKUP_TOO_LARGE: "اندازه بک‌آپ بیشتر از ۲۰ مگابایت است.",
  BACKUP_COLLECTION_FAILED: "دریافت تنظیمات کامل نشد. اتصال، مجوز حساب و سازگاری نسخه دستگاه را بررسی کنید.",
  BACKUP_VENDOR_UNSUPPORTED: "بک‌آپ خودکار این وندور هنوز پشتیبانی نمی‌شود.",
  BACKUP_ROUTEROS_VERSION_UNSUPPORTED: "این مسیر برای RouterOS نسخه ۶ و ۷ است.",
  BACKUP_NOT_FOUND: "این فایل در دسترس نیست.",
  BACKUP_DECRYPTION_FAILED: "فایل با کلید فعلی سرور قابل خواندن نیست.",
  BACKUP_INTEGRITY_FAILED: "صحت فایل تأیید نشد؛ فایل تحویل داده نشد.",
  AUTH_REQUIRED: "برای ادامه دوباره وارد حساب شوید."
};
async function checked(response: Response) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(errors[body.error] ?? "عملیات انجام نشد. ارتباط با برنامه را بررسی کنید.");
  }
  return response;
}
export default function BackupsPage() {
  const [data, setData] = useState<Data>({ devices: [], history: [] });
  const [company, setCompany] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const companies = useMemo(() => Array.from(new Map(data.devices.filter(d => d.company).map(d => [d.company!.id, d.company!])).values()), [data.devices]);
  const devices = data.devices.filter(d => (!company || d.company?.id === company) && `${d.name} ${d.host} ${d.vendor}`.toLowerCase().includes(query.toLowerCase()));
  const selected = data.devices.find(d => d.id === deviceId);
  const history = data.history.filter(r => (!company || data.devices.find(d => d.id === r.deviceId)?.company?.id === company) && (!deviceId || r.deviceId === deviceId));
  async function load() {
    const response = await checked(await apiRequest("/backups"));
    const result = await response.json() as Data; setData(result);
  }
  useEffect(() => { let mounted = true; void (async () => {
    try { const response = await checked(await apiRequest("/backups")); const result = await response.json() as Data; if (mounted) setData(result); }
    catch (e) { if (mounted) setError(e instanceof Error ? e.message : "بارگذاری انجام نشد."); }
    finally { if (mounted) setLoading(false); }
  })(); return () => { mounted = false; }; }, []);
  async function create() {
    if (!selected || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await checked(await apiRequest("/backups", { method: "POST", body: JSON.stringify({ deviceId }) }));
      const record = await response.json() as Record;
      setData(current => ({ ...current, history: [record, ...current.history].slice(0, 100) }));
      setNotice("بک‌آپ ذخیره شد. برای دریافت فایل، دکمه دانلود را بزنید.");
    } catch (e) { setError(e instanceof Error ? e.message : "بک‌آپ انجام نشد."); }
    finally { setBusy(false); }
  }
  async function download(record: Record) {
    setDownloading(record.id); setError("");
    try {
      const response = await checked(await apiRequest(`/backups/${encodeURIComponent(record.id)}/download`));
      const blob = await response.blob(); const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = record.filename;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) { setError(e instanceof Error ? e.message : "دریافت فایل انجام نشد."); }
    finally { setDownloading(""); }
  }
  return <main className="backup-page" dir="rtl">
    <header className="backup-heading"><span className="backup-icon"><Archive size={28} /></span><div><h1>بک‌آپ تجهیزات</h1><p>تنظیمات دستگاه‌ها، در یک جای امن</p></div></header>
    {error && <div className="backup-message error" role="alert">{error}{!data.devices.length && !loading && <button onClick={() => { setLoading(true); void load().then(() => setError("")).catch(e => setError(e.message)).finally(() => setLoading(false)); }}>تلاش دوباره</button>}</div>}
    {notice && <div className="backup-message success" role="status">{notice}</div>}
    <section className="backup-panel" aria-label="گرفتن بک‌آپ">
      <h2>بک‌آپ جدید</h2>
      <div className="backup-fields">
        <label>شرکت<select disabled={busy || loading} value={company} onChange={e => { setCompany(e.target.value); setDeviceId(""); }}><option value="">همه شرکت‌ها</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>جست‌وجوی دستگاه<span className="backup-search"><Search size={18} /><input value={query} disabled={busy} onChange={e => { setQuery(e.target.value); setDeviceId(""); }} placeholder="نام، IP یا وندور" /></span></label>
        <label className="backup-device-field">دستگاه<select disabled={busy || loading} value={deviceId} onChange={e => { setDeviceId(e.target.value); setNotice(""); }}><option value="">انتخاب دستگاه</option>{devices.map(d => <option key={d.id} value={d.id}>{d.name} · {d.vendor} · {d.host}</option>)}</select></label>
      </div>
      {selected && <div className="backup-scope"><div><strong>{selected.profile.title}</strong>{selected.profile.extension && <span className="backup-format" dir="ltr">.{selected.profile.extension}</span>}</div><p>{selected.profile.scope}</p><small>فایل می‌تواند شامل کلید و رمز باشد؛ پس از دریافت در محل امن نگهداری کنید.</small><Link to={`/assets/devices/${selected.id}/setup`}>تنظیم اتصال دستگاه</Link></div>}
      <footer className="backup-create-footer"><span><ShieldCheck size={18} />ذخیره رمزنگاری‌شده · بدون تغییر تنظیمات دستگاه</span><button className="backup-primary" onClick={() => void create()} disabled={!selected?.profile.supported || busy || loading}>{busy ? <Loader2 className="backup-spin" size={18} /> : <Archive size={18} />}{busy ? "در حال دریافت از دستگاه…" : "گرفتن بک‌آپ"}</button></footer>
    </section>
    <section className="backup-panel"><div className="backup-history-heading"><h2>فایل‌های بک‌آپ</h2><span>{history.length.toLocaleString("fa-IR")} فایل</span></div>
      {loading ? <p role="status">در حال بارگذاری…</p> : !history.length ? <div className="backup-empty"><Archive size={32} /><p>هنوز بک‌آپی برای این انتخاب ندارید.</p></div> : <div className="backup-history">{history.map(r => <article className="backup-record" key={r.id}>
        <span className="backup-file-icon"><Archive size={22} /></span><div className="backup-record-info"><h3>{r.deviceName}<span dir="ltr">{r.vendor}</span></h3><p>{r.title}</p><div className="backup-record-meta"><time dateTime={r.createdAt}>{new Date(r.createdAt).toLocaleString("fa-IR", { timeZone: "Asia/Tehran", dateStyle: "medium", timeStyle: "short" })}</time><span>توسط {r.actor}</span><span dir="ltr">{(r.bytes / 1024).toFixed(1)} KB</span></div><details><summary>مشخصات فایل</summary><p>{r.scope}</p><code dir="ltr">{r.filename}</code><code dir="ltr">SHA-256: {r.sha256}</code></details></div>
        <button className="backup-download" disabled={Boolean(downloading)} onClick={() => void download(r)} aria-label={`دریافت بک‌آپ ${r.deviceName}`}>{downloading === r.id ? <Loader2 className="backup-spin" size={18} /> : <Download size={18} />}دریافت فایل</button>
      </article>)}</div>}
    </section>
  </main>;
}
