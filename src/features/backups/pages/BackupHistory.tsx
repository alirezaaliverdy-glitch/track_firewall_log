import { useEffect, useState } from "react";
import { Download, History, Loader2, Search } from "lucide-react";
import { apiRequest } from "@/lib/apiTransport";
type Activity = {
  id: string; backupId: string | null; deviceName: string; companyName: string;
  host: string; vendor: string; actor: string; actorName: string; createdAt: string;
  action: "create" | "failed" | "download"; code: string | null; durationMs: number;
  filename: string; bytes: number; sha256: string;
};
type Result = { items: Activity[]; total: number; page: number; pageSize: number };
export function backupTime(value: string) {
  return new Date(value).toLocaleString("fa-IR", { timeZone: "Asia/Tehran", dateStyle: "medium", timeStyle: "medium" });
}
export default function BackupHistory({ companies, explain, onDownload, downloading, revision }: {
  companies: { id: string; name: string }[]; explain: (code: string) => string;
  onDownload: (record: { id: string; filename: string }) => Promise<void>;
  downloading: string; revision: number;
}) {
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<Result>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ page: String(page), action, search, companyId: company });
      void apiRequest("/backups/activity?" + params).then(async response => {
        if (!response.ok) throw new Error("بارگذاری تاریخچه انجام نشد.");
        return response.json() as Promise<Result>;
      }).then(data => { if (active) setResult(data); })
        .catch(() => { if (active) setError("ارتباط با تاریخچه برقرار نشد. دوباره تلاش کنید."); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [search, company, action, page, revision, retry]);
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  return <section className="backup-panel" aria-label="تاریخچه بک‌آپ">
    <div className="backup-history-heading"><h2><History size={22} /> تاریخچه عملیات</h2><span>{result.total.toLocaleString("fa-IR")} رویداد</span></div>
    <div className="backup-history-filters">
      <label>جست‌وجو<span className="backup-search"><Search size={18} /><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="کاربر، دستگاه، IP یا وندور" /></span></label>
      <label>شرکت<select value={company} onChange={event => { setCompany(event.target.value); setPage(1); }}><option value="">همه شرکت‌ها</option>{companies.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label>نوع رویداد<select value={action} onChange={event => { setAction(event.target.value); setPage(1); }}><option value="">همه رویدادها</option><option value="create">بک‌آپ موفق</option><option value="failed">بک‌آپ ناموفق</option><option value="download">دریافت فایل</option></select></label>
    </div>
    {loading ? <div className="backup-empty" role="status"><Loader2 className="backup-spin" size={24} />در حال بارگذاری…</div>
      : error ? <div className="backup-message error" role="alert">{error}<button onClick={() => setRetry(value => value + 1)}>تلاش دوباره</button></div>
      : !result.items.length ? <div className="backup-empty"><History size={30} /><p>رویدادی برای این انتخاب پیدا نشد.</p></div>
      : <div className="backup-history">{result.items.map(item => <article key={item.id} className="backup-record">
        <div className="backup-record-info">
          <div className="backup-event-title"><h3>{item.deviceName}<span dir="ltr">{item.vendor}</span></h3><span className={"backup-event-status " + item.action}>{item.action === "create" ? "بک‌آپ موفق" : item.action === "failed" ? "ناموفق" : "فایل دریافت شد"}</span></div>
          <p>{item.companyName || "شرکت ثبت نشده"} <bdi>· {item.host}</bdi></p>
          <div className="backup-audit-meta"><span>کاربر: <strong>{item.actorName || item.actor || "ثبت نشده"}</strong>{item.actorName !== item.actor && item.actor && <bdi> (@{item.actor})</bdi>}</span><time dateTime={item.createdAt}>{backupTime(item.createdAt)} · تهران</time></div>
          {item.action === "failed" ? <div className="backup-failure-reason">{explain(item.code || "BACKUP_COLLECTION_FAILED")}</div> : item.filename && <p dir="ltr" className="backup-artifact-name">{item.filename}</p>}
          {item.durationMs > 0 && item.action !== "download" && <small className="backup-duration">مدت دریافت: {(item.durationMs / 1000).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} ثانیه</small>}
        </div>
        {item.action === "create" && item.backupId && item.filename && <button className="backup-download" disabled={Boolean(downloading)} onClick={() => void onDownload({ id: item.backupId!, filename: item.filename })} aria-label={"دریافت بک‌آپ " + item.deviceName}>{downloading === item.backupId ? <Loader2 className="backup-spin" size={18} /> : <Download size={18} />}دریافت فایل</button>}
      </article>)}</div>}
    <nav className="backup-pagination" aria-label="صفحه‌های تاریخچه"><button disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}>قبلی</button><span>صفحه {page.toLocaleString("fa-IR")} از {totalPages.toLocaleString("fa-IR")}</span><button disabled={loading || page >= totalPages} onClick={() => setPage(value => value + 1)}>بعدی</button></nav>
  </section>;
}
