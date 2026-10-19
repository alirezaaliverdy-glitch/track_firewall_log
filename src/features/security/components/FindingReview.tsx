import { useEffect, useState, type ReactNode } from "react";
import { AccessLink as Link } from "@/components/auth/AccessLink";
import { ArrowUpLeft, Copy, RefreshCw, ShieldAlert } from "lucide-react";
import { apiRequest } from "@/lib/apiTransport";
import type { FindingCampaign, FindingDecision, SecurityFinding } from "@/lib/platform";
import { securityDisplayText } from "../securityPresentation";
import "./FindingReview.css";

export function FindingReview({ finding, decision, onAction, onRefresh, busy, isFa, children }: { finding: SecurityFinding; decision: FindingDecision | null; onAction: () => void; onRefresh: () => void; busy: boolean; isFa: boolean; children: ReactNode }) {
  const [campaign, setCampaign] = useState<FindingCampaign | null>(null), [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState("");
  const copy = (fa: string, en: string) => isFa ? fa : en, locale = isFa ? "fa-IR" : "en-US";
  useEffect(() => {
    let active = true; setCampaign(null); setFailed(false);
    const load = () => void apiRequest(`/security/findings/${encodeURIComponent(finding.id)}/campaign`).then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<FindingCampaign>; }).then(row => { if (active) { setCampaign(row); setFailed(false); } }).catch(() => { if (active) setFailed(true); });
    load(); const timer = window.setInterval(() => { if (!document.hidden) load(); }, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [finding.id]);
  const analysis = decision?.analysis, contradicted = analysis?.verdict === "contradicted";
  const time = (date: string) => new Date(date).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const title = contradicted ? (isFa ? analysis.titleFa : analysis.titleEn) : securityDisplayText(finding.title, isFa ? "fa" : "en");
  return <section className="finding-review" dir={isFa ? "rtl" : "ltr"}>
    <header className="finding-review__heading"><div><Link to="/security/findings">{copy("یافته‌های امنیتی", "Security findings")}</Link><h1>{title}</h1></div><button type="button" onClick={onRefresh} disabled={busy}><RefreshCw size={16} />{copy("بررسی دوباره", "Recheck")}</button></header>
    <section className={`finding-review__summary ${contradicted ? "is-corrected" : ""}`}><div className="finding-review__verdict"><ShieldAlert size={22} /><div><strong>{contradicted ? copy("ورود root تأیید نمی‌شود", "Root login not supported") : decision?.mode === "review_action" ? copy("فعالیت مشکوک؛ اقدام قابل بررسی است", "Suspicious activity — review a response") : copy("نیازمند بررسی", "Needs review")}</strong><p>{contradicted ? (isFa ? analysis.summaryFa : analysis.summaryEn) : decision ? (isFa ? decision.explanationFa : decision.explanationEn) : copy("در حال بررسی شواهد…", "Reviewing evidence…")}</p></div></div><dl>
      <div><dt>{copy("تجهیز هدف", "Target")}</dt><dd>{finding.device?.name ?? finding.asset?.name ?? "—"}<small dir="ltr">{finding.device?.host ?? finding.asset?.managementIp ?? "—"}</small></dd></div>
      <div><dt>{copy("IPهای مبدأ", "Source IPs")}</dt><dd>{campaign ? campaign.sourceCount.toLocaleString(locale) : "—"}</dd></div><div><dt>{copy("تلاش‌های ثبت‌شده", "Observed attempts")}</dt><dd>{campaign ? campaign.observedEvents.toLocaleString(locale) : "—"}</dd></div><div><dt>{copy("بازهٔ بررسی", "Review window")}</dt><dd>{campaign ? `${time(campaign.start)} – ${time(campaign.end)}` : "—"}<small>{campaign ? new Date(campaign.start).toLocaleDateString(locale) : ""}</small></dd></div>
    </dl></section>
    <section className="finding-review__sources"><header><h2>{copy("مبدأهای فعالیت", "Activity sources")}</h2><span>{copy("یک تجهیز · یک نوع رخداد · ۱۵ دقیقه", "One target · one event type · 15 minutes")}</span></header>
      {campaign?.sources.length ? <div className="finding-review__table">{campaign.sources.map(source => <article key={source.ip}><div className="finding-review__ip"><bdi>{source.ip}</bdi><button type="button" aria-label={copy("کپی IP", "Copy IP")} onClick={() => { void navigator.clipboard?.writeText(source.ip).then(() => setCopied(source.ip)).catch(() => undefined); }}><Copy size={15} /></button><small>{copied === source.ip ? copy("کپی شد", "Copied") : copy("مبدأ ثبت‌شده؛ هویت مهاجم تأیید نشده", "Observed source; attacker identity unverified")}</small></div><div><small>{copy("تلاش", "Attempts")}</small><strong>{source.events.toLocaleString(locale)}</strong></div><div><small>{copy("حساب هدف", "Target account")}</small><bdi>{source.accounts.join(", ") || "—"}</bdi></div><div><small>{copy("آخرین فعالیت", "Last activity")}</small><time>{time(source.lastSeen)}</time></div><Link className="finding-review__row-action" to={`/security/findings/${source.findingIds[0]}`}>{copy("بررسی مبدأ", "Review source")}<ArrowUpLeft size={15} /></Link></article>)}</div> : <p className="finding-review__empty">{failed ? copy("دریافت مبدأها ناموفق بود؛ صفحه را دوباره بررسی کن.", "Could not load sources. Please recheck.") : !campaign ? copy("دریافت شواهد…", "Loading evidence…") : finding.srcIp ? <><bdi>{finding.srcIp}</bdi> · {copy("IP یافته است؛ شاهد قابل‌بازیابی در این بازه پیدا نشد.", "Finding source; no retrievable attack evidence in this window.")}</> : copy("IP مبدأ قابل اتکایی در شواهد این بازه ثبت نشده است.", "No reliable source IP was recorded in this window.")}</p>}
      {campaign?.partial ? <p className="finding-review__note">{copy("فقط شواهد موجود نمایش داده می‌شوند؛ بخشی از ارجاع‌ها ناقص یا محدود است.", "Available evidence only; some references are missing or capped.")}</p> : null}{campaign && campaign.sourceCount > 1 ? <p className="finding-review__note">{copy("هم‌زمانی این IPها به‌تنهایی حملهٔ هماهنگ را ثابت نمی‌کند.", "Timing alone does not prove coordination.")}</p> : null}
    </section>
    <div className="finding-review__actions"><button type="button" className="is-primary" onClick={onAction} disabled={busy || !decision?.suggestedAction}>{busy ? copy("در حال بررسی…", "Preparing…") : decision?.suggestedAction ? (isFa ? decision.suggestedAction.labelFa : decision.suggestedAction.labelEn) : copy("ابتدا شواهد بررسی شود", "Review evidence first")}{decision?.suggestedAction?.kind === "containment" && finding.srcIp ? <bdi>{finding.srcIp}</bdi> : null}<ArrowUpLeft size={17} /></button><span>{campaign && campaign.sourceCount > 1 && decision?.suggestedAction?.kind === "containment" ? copy("این اقدام برای همین IP است؛ مبدأهای دیگر جداگانه بررسی می‌شوند.", "This action targets this IP; other sources require their own review.") : copy("اجرا فقط پس از پیش‌نمایش و تأیید شما", "Execution requires preview and confirmation")}</span></div>
    <details className="finding-review__details"><summary>{copy("لاگ‌ها و جزئیات فنی", "Logs and technical details")}</summary>{children}</details>
  </section>;
}
