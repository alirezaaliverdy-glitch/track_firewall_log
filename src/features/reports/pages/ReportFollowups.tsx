import { Link } from "react-router-dom";
import type { CompanyStatusReport } from "@/lib/reports";

export function ReportFollowups({ report }: { report: CompanyStatusReport }) {
  const issues = report.equipment.filter(item => item.status !== "active");
  return <section className="report-followups"><header><h2>وضعیت و راهنمای پیگیری</h2><p>«محدود» یعنی نیازمند بررسی؛ می‌تواند هشدار سلامت یا دادهٔ ناقص باشد، نه الزاماً مشکل مجوز.</p></header>
    {issues.length ? issues.slice(0, 6).map(item => <article key={item.id}><header><strong>{item.name}</strong><span>{item.status === "inactive" ? "قطع کانال مدیریتی" : "نیازمند بررسی"}</span></header><p>{item.statusReason || item.description}</p><p className="report-followups__action"><b>قدم بعدی: </b>{item.recommendation || "نمای کلی و سنسورها را بررسی و جمع‌آوری تازه اجرا کنید."}</p><nav><Link to={`/assets/devices/${encodeURIComponent(item.id)}/overview`}>مشاهده وضعیت و سنسورها</Link><Link to={`/assets/devices/${encodeURIComponent(item.id)}/setup`}>بررسی اتصال</Link><Link to={`/actions?deviceId=${encodeURIComponent(item.id)}`}>ساخت اقدام با پیش‌نمایش</Link></nav></article>) : <p>در بررسی گزارش‌شده مورد نیازمند پیگیری ثبت نشده است.</p>}
    {issues.length > 6 ? <p>سایر موارد در پیش‌نمایش و فایل Excel قابل مشاهده‌اند.</p> : null}
  </section>;
}
