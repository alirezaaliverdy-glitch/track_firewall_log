import { CheckCircle2, Fingerprint, RefreshCw, SearchCheck } from "lucide-react";
import type { FindingDecision } from "@/lib/platform";
import "./FindingAnalysis.css";

export function FindingAnalysis({ decision, isFa, busy, onRefresh }: { decision: FindingDecision; isFa: boolean; busy: boolean; onRefresh: () => void }) {
  const analysis = decision.analysis;
  if (!analysis) return null;
  const locale = isFa ? "fa-IR" : "en-US";
  return <section className={`finding-analysis is-${analysis.verdict}`} aria-labelledby="finding-analysis-title">
    <header><div><SearchCheck size={22} /><h2 id="finding-analysis-title">{isFa ? "تحلیل یافته" : "Finding analysis"}</h2></div><button type="button" disabled={busy} onClick={onRefresh}><RefreshCw size={15} className={busy ? "is-spinning" : ""} />{busy ? (isFa ? "در حال بررسی…" : "Checking…") : (isFa ? "بازتحلیل" : "Reanalyze")}</button></header>
    <div className="finding-analysis__conclusion"><CheckCircle2 size={20} /><div><h3>{isFa ? analysis.titleFa : analysis.titleEn}</h3><p>{isFa ? analysis.summaryFa : analysis.summaryEn}</p></div></div>
    <div className="finding-analysis__accounts">{analysis.actors.length ? <span><Fingerprint size={16} />{isFa ? "حساب اجراکننده" : "Invoking account"}<b dir="ltr">{analysis.actors.join(", ")}</b></span> : null}<span>{isFa ? "پوشش شواهد" : "Evidence coverage"}<b>{decision.resolvedReferenceCount.toLocaleString(locale)} / {decision.referenceCount.toLocaleString(locale)}</b></span></div>
    {decision.deviceContext?.observedAt ? <p className="finding-analysis__state">{isFa ? "آخرین بررسی تجهیز: " : "Last device observation: "}{new Date(decision.deviceContext.observedAt).toLocaleString(locale)}{!decision.deviceContext.fresh ? (isFa ? " · داده قدیمی" : " · stale") : ""}{decision.deviceContext.permitRootLogin ? <span dir="ltr"> · PermitRootLogin {decision.deviceContext.permitRootLogin}</span> : null}</p> : <p className="finding-analysis__state">{isFa ? "وضعیت فعلی تنظیمات تجهیز هنوز ثبت نشده است." : "Current device configuration has not been observed."}</p>}
    <details className="finding-analysis__evidence"><summary>{isFa ? "تفسیر رویدادها" : "Event interpretation"}<span>{analysis.events.length.toLocaleString(locale)}</span></summary><ol>{analysis.events.map(event => <li key={event.id}><div><time>{new Date(event.timestamp).toLocaleString(locale)}</time>{event.applicationOwned ? <small>{isFa ? "متعلق به برنامه" : "Application-owned"}</small> : null}</div><p>{isFa ? event.explanationFa : event.explanationEn}</p><dl>{event.actor ? <div><dt>{isFa ? "اجراکننده" : "Actor"}</dt><dd dir="ltr">{event.actor}</dd></div> : null}{event.effectiveUser ? <div><dt>{isFa ? "سطح اجرا" : "Run as"}</dt><dd dir="ltr">{event.effectiveUser}</dd></div> : null}{event.sourceIp ? <div><dt>IP</dt><dd dir="ltr">{event.sourceIp}</dd></div> : null}{event.hostname ? <div><dt>{isFa ? "میزبان" : "Host"}</dt><dd dir="ltr">{event.hostname}</dd></div> : null}</dl></li>)}</ol></details>
    {(isFa ? analysis.limitationsFa : analysis.limitationsEn).map(text => <p className="finding-analysis__limit" key={text}>{text}</p>)}
  </section>;
}
