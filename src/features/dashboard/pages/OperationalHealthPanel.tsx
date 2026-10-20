import { ArrowUpLeft, Check, CircleAlert, Clock3, ShieldCheck } from "lucide-react";
import { AccessLink as Link } from "@/components/auth/AccessLink";
import type { MonitoringCoverage, SecurityMonitoringStatus } from "@/lib/platform";
import "./OperationalHealthPanel.css";

export function OperationalHealthPanel({ monitoring, issueCount, criticalCount, offlineCount, pendingCount, failedCount, total, online, isFa, unavailable }: {
  monitoring: SecurityMonitoringStatus | null; issueCount: number; criticalCount: number; offlineCount: number; pendingCount: number; failedCount: number;
  total: number; online: number; isFa: boolean; unavailable: boolean;
}) {
  const copy = (fa: string, en: string) => isFa ? fa : en, locale = isFa ? "fa-IR" : "en-US", number = (n: number) => n.toLocaleString(locale);
  const coverage = monitoring?.coverage, gaps = coverage?.summary.gaps;
  const cycle = monitoring?.lastCycleAt ? Date.parse(monitoring.lastCycleAt) : NaN;
  const current = Boolean(monitoring?.running) && !monitoring?.lastErrorCode && Number.isFinite(cycle) && Date.now() - cycle >= -30_000 && Date.now() - cycle <= Math.max(120, (monitoring?.tickSeconds ?? 30) * 3) * 1000;
  const healthy = !unavailable && current && total > 0 && issueCount === 0 && offlineCount === 0 && failedCount === 0 && gaps === 0;
  const date = (v?: string | null) => v ? new Date(v).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" }) : copy("هنوز دریافت نشده", "Not received yet");
  const rows = [
    { title: copy("تجهیزات در دسترس", "Reachable devices"), value: `${number(online)} / ${number(total)}`, note: total ? copy(`${number(offlineCount)} تجهیز قطع یا نامشخص`, `${number(offlineCount)} offline or unknown`) : copy("ابتدا یک تجهیز اضافه کنید", "Add a device to start"), ok: total > 0 && offlineCount === 0, to: "/assets" },
    { title: copy("مشکلات امنیتی باز", "Open security issues"), value: number(issueCount), note: copy(`${number(criticalCount)} مورد بحرانی؛ شواهد را بررسی کنید`, `${number(criticalCount)} critical; review evidence`), ok: issueCount === 0, to: "/security/findings" },
    { title: copy("پایش تازهٔ رویدادها", "Fresh event monitoring"), value: coverage ? `${number(coverage.summary.fresh)} / ${number(coverage.summary.total)}` : "—", note: current ? copy("وضعیت هر تجهیز در پوشش پایش", "See per-device monitoring coverage") : copy("وضعیت پایش تازه تأیید نشد", "Fresh monitoring is not confirmed"), ok: current && !!coverage && coverage.summary.total > 0 && gaps === 0, to: "#monitoring-coverage" },
    { title: copy("پیگیری عملیات", "Response follow-up"), value: number(pendingCount + failedCount), note: copy(`${number(pendingCount)} منتظر تأیید · ${number(failedCount)} اجرای ناموفق`, `${number(pendingCount)} awaiting confirmation · ${number(failedCount)} failed`), ok: !unavailable && failedCount === 0 && pendingCount === 0, to: "/actions" },
  ];
  const labels: Record<MonitoringCoverage["devices"][number]["state"], [string, string]> = {
    fresh: ["داده تازه", "Fresh data"], stale: ["داده قدیمی", "Stale data"], failed: ["دریافت ناموفق", "Collection failed"], disabled: ["پایش خاموش", "Monitoring disabled"], not_checked: ["هنوز بررسی نشده", "Not checked yet"], not_configured: ["جمع‌آوری تنظیم نشده", "Collection not configured"], unsupported: ["جمع‌آوری زنده پشتیبانی نمی‌شود", "No live collector supported"],
  };
  const dailyLabel = (value: string) => value === "implemented" ? copy("قابل اجرا با تأیید", "Available with confirmation") : value === "manualOnly" ? copy("چک‌لیست دستی", "Manual checklist") : copy("اجرای خودکار پشتیبانی نمی‌شود", "Automatic execution unsupported");
  return <article className={`command-panel operational-health command-panel--${healthy ? "good" : "warning"}`}>
    <header><span className="command-panel__icon"><ShieldCheck /></span><div><h2>{copy("الان چه چیزی نیاز به رسیدگی دارد؟", "What needs attention now?")}</h2><p>{copy("خلاصهٔ مشکلات و قدم بعدی؛ نه وضعیت داخلی برنامه", "Issues and next steps, not internal service counters")}</p></div><em>{healthy ? copy("بدون مورد باز", "No open issues") : copy("نیازمند بررسی", "Review needed")}</em></header>
    <ul className="operational-health__rows">{rows.map(row => <li key={row.to}><span className={row.ok ? "is-ok" : "is-alert"}>{row.ok ? <Check size={16}/> : <CircleAlert size={16}/>}</span><div><strong>{row.title}</strong><small>{row.note}</small></div><b>{row.value}</b>{row.to.startsWith("#") ? <a href={row.to} aria-label={row.title} onClick={() => { const detail=document.getElementById("monitoring-coverage"); if(detail instanceof HTMLDetailsElement) detail.open=true; }}><ArrowUpLeft size={16}/></a> : <Link to={row.to} aria-label={row.title}><ArrowUpLeft size={16}/></Link>}</li>)}</ul>
    {unavailable && <p className="operational-health__notice" role="status">{copy("بخشی از داده‌ها دریافت نشد؛ آخرین داده، وضعیت فعلی را تضمین نمی‌کند.", "Some data is unavailable; cached data does not confirm the current state.")}</p>}
    <details id="monitoring-coverage" className="operational-health__coverage"><summary>{copy("پوشش پایش و موارد بررسی‌نشده", "Monitoring coverage and unchecked areas")}<span>{gaps === undefined ? "—" : copy(`${number(gaps)} نیازمند تکمیل`, `${number(gaps)} gaps`)}</span></summary>
      <p>{copy("پایش براساس معیارها و داده‌های پشتیبانی‌شدهٔ هر تجهیز است؛ تمام الزامات سازنده یا گواهی انطباق را شامل نمی‌شود. نبود هشدار، سلامت قطعی نیست.", "Coverage includes supported checks and available data, not every vendor requirement or a compliance certification. No alert is not proof of health.")}</p>
      {coverage?.devices.map(device => <div className="operational-coverage-device" key={device.deviceId}><div><strong>{device.deviceName}</strong><span data-state={device.state}>{labels[device.state][isFa ? 0 : 1]}</span></div><small>{device.vendor} · {copy("آخرین داده", "Last data")}: {date(device.observedAt)}</small><small>{copy("قوانین تعریف‌شده", "Defined rules")}: {number(device.eventRuleCount)} {copy("رویدادی", "event")} · {number(device.snapshotRuleCount)} {copy("پیکربندی؛ نیازمند دادهٔ واقعی", "snapshot; requires actual evidence")}</small><small>{copy("بررسی روزانه", "Daily check")}: {dailyLabel(device.dailyCheck)}</small><footer><Link to={`/assets/devices/${encodeURIComponent(device.deviceId)}/monitoring`}>{copy("بررسی و تنظیم پایش", "Review monitoring")}<ArrowUpLeft size={13}/></Link>{device.officialGuide && <a href={device.officialGuide.url} target="_blank" rel="noopener noreferrer">{copy("مرجع سازنده", "Vendor reference")}</a>}</footer></div>)}
      {!coverage?.devices.length && <p>{copy("هنوز پوشش پایش قابل‌تأییدی دریافت نشده است.", "No verifiable monitoring coverage received yet.")}</p>}
    </details>
    <footer className="operational-health__updated"><Clock3 size={14}/>{copy("آخرین بررسی", "Last assessment")}: {date(coverage?.assessedAt)} · {copy("تازه‌سازی نما: ۵ ثانیه؛ دریافت تجهیز طبق زمان‌بندی خودش", "View refresh: 5 seconds; collection follows each device schedule")}</footer>
  </article>;
}
