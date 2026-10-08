import { useMemo, useState } from "react";
import type { VendorUserActivity } from "@/lib/platform";

type TimelineEvent = VendorUserActivity["timeline"][number];
type TimelineFilter = "all" | "review" | "login";

const kindFa: Record<TimelineEvent["kind"], string> = {
  login: "ورود موفق", failed_login: "تلاش ورود ناموفق", logout: "خروج ثبت‌شده",
  privileged: "دستور ویژه", change: "تغییر پیکربندی", activity: "فعالیت حساب"
};
const kindEn: Record<TimelineEvent["kind"], string> = {
  login: "Successful login", failed_login: "Failed login", logout: "Recorded logout",
  privileged: "Privileged command", change: "Configuration change", activity: "Account activity"
};

export default function VendorUserTimeline({ events, total, loading, isFa, locale }: { events: TimelineEvent[]; total: number; loading: boolean; isFa: boolean; locale: string }) {
  const [filter, setFilter] = useState<TimelineFilter>("all");
  const [visibleCount, setVisibleCount] = useState(6);
  const filtered = useMemo(() => events.filter((event) => filter === "all" || (filter === "review" ? event.risk !== "normal" : event.kind === "login")), [events, filter]);
  const visible = filtered.slice(0, visibleCount);
  const date = (value: string) => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
  };

  return <section className="attacker-detail__section vendor-user-timeline-section">
    <header><div><h3>{isFa ? "خط زمانی فعالیت" : "Activity timeline"}</h3><p>{isFa ? "رویدادهای تازه‌تر، با شاهد قابل بازکردن" : "Newest first; expand an event for evidence"}</p></div><span className="vendor-user-timeline-count">{events.length.toLocaleString(locale)}</span></header>
    <div className="vendor-user-timeline-filters" role="group" aria-label={isFa ? "فیلتر رویدادها" : "Event filter"}>
      {(["all", "review", "login"] as const).map((item) => <button key={item} type="button" aria-pressed={filter === item} onClick={() => { setFilter(item); setVisibleCount(6); }}>
        {item === "all" ? (isFa ? "همه" : "All") : item === "review" ? (isFa ? "نیازمند بررسی" : "Review") : (isFa ? "ورودها" : "Logins")}
      </button>)}
    </div>
    {visible.length ? <div className="vendor-user-timeline">{visible.map((event) => <article key={event.id} className={`vendor-user-event is-${event.risk}`}>
      <div className="vendor-user-event-heading"><span className={`vendor-user-kind is-${event.kind}`}>{isFa ? kindFa[event.kind] : kindEn[event.kind]}</span><time dateTime={event.observedAt}>{date(event.observedAt)}</time></div>
      <p className="vendor-user-event-source"><strong>{event.deviceName ?? (isFa ? "تجهیز نامشخص" : "Unknown device")}</strong>{event.sourceIp ? <code dir="ltr">{event.sourceIp}</code> : null}</p>
      {event.evidence ? <details className="vendor-user-event-evidence"><summary>{isFa ? "مشاهدهٔ شاهد رویداد" : "View event evidence"}</summary><code dir="auto">{event.evidence}</code>{event.risk !== "normal" ? <small>{isFa ? "این نشانه، به‌تنهایی سوءاستفاده را ثابت نمی‌کند." : "This signal alone does not prove misuse."}</small> : null}</details> : null}
    </article>)}</div> : <p className="attacker-empty-inline">{loading ? (isFa ? "در حال دریافت رویدادها..." : "Loading events...") : (isFa ? "در این فیلتر رویدادی نیست." : "No events in this filter.")}</p>}
    {visibleCount < filtered.length ? <button type="button" className="vendor-user-show-more" onClick={() => setVisibleCount((count) => count + 6)}>{isFa ? "نمایش ۶ رویداد دیگر" : "Show 6 more events"}</button> : null}
    {total > events.length ? <p className="attacker-empty-inline">{isFa ? `فقط ${events.length.toLocaleString(locale)} رویداد تازه‌تر دریافت شده؛ برای پوشش بیشتر، بازه یا تجهیز را محدود کنید.` : `Only the latest ${events.length.toLocaleString(locale)} events were loaded; narrow the device or time window for more coverage.`}</p> : null}
  </section>;
}
