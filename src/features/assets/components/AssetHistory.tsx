import { useState } from "react";

type Row = { id: string; action: string; time: string; category: string; count: number; oldest: string; status?: string };

export function historyRows(audit: Array<Record<string, unknown>>, collections: Array<Record<string, unknown>>) {
  const rows: Row[] = [
    ...audit.map((item) => ({ id: String(item.id), action: String(item.action), time: String(item.createdAt), oldest: String(item.createdAt), count: 1, category: String(item.action).startsWith("device.connectivity_") ? "connection" : "operation" })),
    ...collections.map((item) => ({ id: `collection-${item.id}`, action: String(item.provider), time: String(item.completedAt ?? item.startedAt), oldest: String(item.completedAt ?? item.startedAt), count: 1, category: "collection", status: String(item.status) }))
  ].filter((item) => Number.isFinite(Date.parse(item.time))).sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  const grouped: Row[] = [];
  for (const row of rows) {
    const previous = grouped.at(-1);
    // Only consecutive identical connectivity records; never hide intervening changes/operations.
    if (row.category === "connection" && previous?.category === "connection" && previous.action === row.action) {
      previous.count += 1; previous.oldest = row.time;
    } else grouped.push({ ...row });
  }
  return grouped;
}

export function AssetHistory({ audit, collections, isFa, locale }: { audit: Array<Record<string, unknown>>; collections: Array<Record<string, unknown>>; isFa: boolean; locale: string }) {
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const rows = historyRows(audit, collections).filter((item) => filter === "all" || item.category === filter);
  const pages = Math.max(1, Math.ceil(rows.length / 12));
  const current = Math.min(page, pages - 1);
  const labels: Record<string, string> = {
    "device.connectivity_online": isFa ? "اتصال برقرار شد" : "Connection restored",
    "device.connectivity_offline": isFa ? "ارتباط قطع شد" : "Connection lost",
    "device.connectivity_error": isFa ? "اتصال نیازمند بررسی" : "Connection degraded",
    "device.connectivity_unknown": isFa ? "وضعیت اتصال نامشخص" : "Connection unknown"
  };
  const categories: Record<string, string> = { all: isFa ? "همه" : "All", connection: isFa ? "اتصال" : "Connection", operation: isFa ? "تغییرات" : "Changes", collection: isFa ? "جمع‌آوری" : "Collections" };
  const states: Record<string, string> = { succeeded: "موفق", completed: "موفق", failed: "ناموفق", error: "خطا", running: "در حال اجرا", pending: "در انتظار" };
  const date = (time: string) => new Date(time).toLocaleString(locale, { timeZone: "Asia/Tehran" });
  return <section className="asset-history content-panel">
    <header><h2>{isFa ? "تاریخچه تجهیز" : "Device history"}</h2><small>{isFa ? "رویدادهای اخیر · ساعت تهران" : "Recent events · Tehran time"}</small></header>
    <nav aria-label={isFa ? "نوع رویداد" : "Event type"}>{Object.entries(categories).map(([key, label]) => <button type="button" key={key} aria-pressed={filter === key} onClick={() => { setFilter(key); setPage(0); }}>{label}</button>)}</nav>
    <ol>{rows.slice(current * 12, (current + 1) * 12).map((row) => <li key={row.id} className={`is-${row.category}`}>
      <div><strong>{labels[row.action] ?? (row.category === "collection" ? `${isFa ? "جمع‌آوری" : "Collection"} · ${row.action}` : row.action.replace(/[._]/g, " "))}</strong><small>{categories[row.category]}{row.status ? ` · ${isFa ? states[row.status] ?? row.status : row.status}` : ""}</small>
      {row.count > 1 ? <span className="asset-history__duplicates">{isFa ? `${row.count.toLocaleString(locale)} ثبت تکراری قدیمی` : `${row.count} repeated legacy records`} · {date(row.oldest)} — {date(row.time)}</span> : null}</div>
      <time dateTime={row.time}>{date(row.time)}</time>
    </li>)}</ol>
    {!rows.length ? <p>{isFa ? "رویدادی ثبت نشده است." : "No events recorded."}</p> : null}
    <footer><button type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>{isFa ? "قبلی" : "Previous"}</button><span>{(current + 1).toLocaleString(locale)} / {pages.toLocaleString(locale)}</span><button type="button" disabled={current + 1 === pages} onClick={() => setPage(current + 1)}>{isFa ? "بعدی" : "Next"}</button></footer>
  </section>;
}
