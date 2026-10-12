import type { FindingDecision } from "@/lib/platform";
import { ArrowUpLeft, CheckCircle2, CircleAlert, Fingerprint, Layers3, ShieldCheck } from "lucide-react";
import "./FindingDecisionCard.css";

export function FindingDecisionCard({ decision, isFa, busy, onAction, onEvidence }: { decision: FindingDecision; isFa: boolean; busy: boolean; onAction: () => void; onEvidence: () => void }) {
  const strong = decision.mode === "review_action";
  const closed = decision.mode === "closed";
  return <section className={`finding-decision finding-decision--${decision.mode}`} aria-labelledby="finding-decision-title">
    <header className="finding-decision__header">
      <div className="finding-decision__identity"><span className="finding-decision__icon">{strong ? <ShieldCheck /> : closed ? <CheckCircle2 /> : <CircleAlert />}</span><div><small>{isFa ? "تصمیم بر پایهٔ شواهد" : "Evidence-based decision"}</small><h2 id="finding-decision-title">{strong ? (isFa ? "اقدام پیشنهادی آمادهٔ بررسی است" : "A proposed action is ready to review") : closed ? (isFa ? "این یافته بسته شده است" : "This finding is closed") : (isFa ? "ابتدا بررسی کنید" : "Investigate first")}</h2></div></div>
      <span className="finding-decision__score"><Fingerprint size={16} />{isFa ? decision.evidenceLabelFa : decision.evidenceLabelEn}</span>
    </header>
    <p className="finding-decision__summary">{isFa ? decision.explanationFa : decision.explanationEn}</p>
    <div className="finding-decision__facts"><span><Layers3 />{isFa ? "تجهیزهای مرتبط" : "Related devices"}<b>{decision.deviceCount.toLocaleString(isFa ? "fa-IR" : "en-US")}</b></span><span><Fingerprint />{isFa ? "لاگ‌های مؤید" : "Supporting logs"}<b>{decision.supportingReferenceCount.toLocaleString(isFa ? "fa-IR" : "en-US")} / {decision.referenceCount.toLocaleString(isFa ? "fa-IR" : "en-US")}</b></span>{decision.authSuccessCount ? <span><CircleAlert />{isFa ? "ورود موفق بعدی" : "Later successful login"}<b>{decision.authSuccessCount.toLocaleString(isFa ? "fa-IR" : "en-US")}</b></span> : null}</div>
    <ul className="finding-decision__signals">{decision.signals.map((signal) => <li key={signal.key} className={`is-${signal.level}`}><i />{isFa ? signal.fa : signal.en}</li>)}</ul>
    <footer><p>{isFa ? decision.nextStepFa : decision.nextStepEn}</p><div><button type="button" className="finding-decision__evidence" onClick={onEvidence}>{isFa ? "دیدن لاگ‌ها" : "View logs"}</button>{strong ? <button type="button" className="finding-decision__action" onClick={onAction} disabled={busy}>{busy ? (isFa ? "در حال آماده‌سازی…" : "Preparing…") : (isFa ? "بررسی و تأیید اقدام" : "Review & confirm action")}<ArrowUpLeft size={16} /></button> : null}</div></footer>
  </section>;
}
