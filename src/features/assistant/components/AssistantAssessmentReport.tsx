import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { AlertTriangle, Check, ChevronDown, CircleGauge, Clock3, Database, Server, ShieldCheck, Wrench } from "lucide-react";
import type { HardeningRecommendation, SecurityAssessment } from "@/lib/ai";
import { normalizeArray, normalizeObject } from "@/lib/ai";
import { formatDateTime, riskClass } from "../assistantUiHelpers";
import "./AssistantAssessmentReport.css";

type Props = {
  assessment: SecurityAssessment;
  isFa: boolean;
  recommendationWorking: string | null;
  onCreatePlan: (recommendationId: string) => void;
};

const severityFa: Record<string, string> = { low: "کم", medium: "متوسط", high: "زیاد", critical: "بحرانی" };
const confidenceFa: Record<string, string> = { high: "زیاد", medium: "متوسط", low: "کم", insufficient: "ناکافی" };
const areaFa: Record<string, string> = {
  "SSH posture": "وضعیت SSH", "listening ports": "پورت‌های در حال گوش‌دادن", "users/sudo": "کاربران و sudo",
  "firewall/ufw/nft/iptables": "فایروال میزبان", "fail2ban/auditd": "Fail2ban و Auditd", "docker/nginx/apache": "Docker و وب‌سرور",
  "auth/system/kernel logs": "لاگ‌های احراز هویت و سیستم", "package/update posture": "وضعیت بسته‌ها و به‌روزرسانی",
  "management services": "سرویس‌های مدیریتی", "admin access": "دسترسی مدیریتی", "firewall policies": "قوانین فایروال",
  "NAT/port forwards": "NAT و Port Forward", "logs/auth failures": "لاگ و خطاهای ورود", "connectivity": "اتصال دستگاه",
  "exposed services": "سرویس‌های در معرض", "available capabilities": "قابلیت‌های قابل بررسی", "missing telemetry": "داده‌های پایشی ناقص"
};

function localizeArea(value: unknown, isFa: boolean) {
  const text = String(value ?? "");
  if (!isFa) return text;
  return areaFa[text] ?? text.replace("data not collected", "داده جمع‌آوری نشده");
}

function compactEvidence(value: unknown, depth = 0): string {
  if (value === null || value === undefined || value === "") return "ثبت نشده";
  if (typeof value === "boolean") return value ? "بله" : "خیر";
  if (typeof value === "string" || typeof value === "number") return String(value).slice(0, 220);
  if (depth >= 2) return "جزئیات بیشتر ثبت شده";
  if (Array.isArray(value)) return value.slice(0, 5).map((item) => compactEvidence(item, depth + 1)).join("، ") || "موردی ثبت نشده";
  if (typeof value === "object") return Object.entries(value as Record<string, unknown>).slice(0, 6).map(([key, item]) => `${key}: ${compactEvidence(item, depth + 1)}`).join("؛ ");
  return String(value);
}

function RecommendationCard({ item, isFa, working, onCreate }: { item: HardeningRecommendation; isFa: boolean; working: boolean; onCreate: () => void }) {
  const canCreate = item.createActionSupported && Boolean(item.id);
  return (
    <article className="assessment-recommendation" data-severity={item.severity}>
      <div className="assessment-recommendation__rank"><ShieldCheck aria-hidden="true" /></div>
      <div className="assessment-recommendation__content">
        <div className="assessment-card-heading">
          <div>
            <h5>{item.title}</h5>
            <p>{item.device?.name ?? (isFa ? "همه دستگاه‌ها" : "All devices")} · {item.vendor}</p>
          </div>
          <span className={riskClass(item.severity)}>{isFa ? severityFa[item.severity] ?? item.severity : item.severity}</span>
        </div>
        <div className="assessment-recommendation__why"><strong>{isFa ? "چرا مهم است؟" : "Why it matters"}</strong><span>{item.reason}</span></div>
        <div className="assessment-recommendation__action"><strong>{isFa ? "اقدام پیشنهادی" : "Recommended action"}</strong><span>{item.recommendation}</span></div>
        <details>
          <summary>{isFa ? "مشاهده شواهد و جزئیات فنی" : "Evidence and technical details"}<ChevronDown aria-hidden="true" /></summary>
          <p>{compactEvidence(item.evidenceJson)}</p>
          {item.catalogActionId ? <code>{item.catalogActionId}</code> : null}
        </details>
      </div>
      <div className="assessment-recommendation__status">
        {item.actionPlanId ? <span className="is-created"><Check aria-hidden="true" />{isFa ? "در مرکز عملیات" : "In Action Center"}</span> : canCreate ? (
          <button type="button" onClick={onCreate} disabled={working}><Wrench aria-hidden="true" />{working ? (isFa ? "در حال ساخت..." : "Creating...") : (isFa ? "ساخت برنامه اقدام" : "Create ActionPlan")}</button>
        ) : <span className="is-manual"><AlertTriangle aria-hidden="true" />{isFa ? "نیازمند بررسی کارشناس" : "Expert review required"}</span>}
      </div>
    </article>
  );
}

export function AssistantAssessmentReport({ assessment, isFa, recommendationWorking, onCreatePlan }: Props) {
  const details = normalizeObject(assessment.findingsJson);
  const coverage = normalizeObject(details.coverage);
  const evidence = normalizeObject(details.evidence);
  const findings = normalizeArray<Record<string, unknown>>(details.findings);
  const analyses = useMemo(() => normalizeArray<Record<string, unknown>>(details.vendorAnalyses), [details.vendorAnalyses]);
  const [activeDeviceId, setActiveDeviceId] = useState(String(analyses[0]?.deviceId ?? ""));

  useEffect(() => setActiveDeviceId(String(analyses[0]?.deviceId ?? "")), [assessment.id, analyses]);
  const activeAnalysis = analyses.find((item) => String(item.deviceId) === activeDeviceId) ?? analyses[0];
  const collected = normalizeArray<unknown>(activeAnalysis?.collectedData);
  const missing = normalizeArray<unknown>(activeAnalysis?.missingData);
  const vendorFindings = normalizeArray<Record<string, unknown>>(activeAnalysis?.findings);
  const sortedRecommendations = useMemo(() => [...assessment.recommendations].sort((a, b) => {
    const rank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    return (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0) || Number(b.createActionSupported) - Number(a.createActionSupported);
  }), [assessment.recommendations]);
  const riskTone = assessment.riskScore >= 70 ? "critical" : assessment.riskScore >= 40 ? "high" : assessment.riskScore >= 20 ? "medium" : "low";
  const confidence = String(coverage.confidence ?? evidence.confidence ?? "insufficient");
  const reportTime = formatDateTime(assessment.createdAt);

  return (
    <section className="assistant-assessment" dir={isFa ? "rtl" : "ltr"} aria-labelledby="assessment-report-title">
      <header className="assistant-assessment__header">
        <div className="assistant-assessment__title">
          <span><CircleGauge aria-hidden="true" /></span>
          <div><p>{isFa ? "گزارش ساختاریافته امنیت" : "Structured security report"}</p><h3 id="assessment-report-title">{isFa ? "نتیجه تحلیل کامل" : "Full analysis result"}</h3></div>
        </div>
        <div className="assistant-assessment__meta"><span><Clock3 aria-hidden="true" />{reportTime}</span><span><Server aria-hidden="true" />{assessment.scopeType === "device" ? (isFa ? "دستگاه انتخابی" : "Selected device") : (isFa ? "کل سامانه" : "All devices")}</span></div>
      </header>

      <div className="assistant-assessment__overview">
        <div className="assessment-risk" data-tone={riskTone}><div className="assessment-risk__dial" style={{ "--risk": `${Math.min(100, Math.max(0, assessment.riskScore)) * 3.6}deg` } as CSSProperties}><strong>{assessment.riskScore}</strong><small>/ 100</small></div><div><small>{isFa ? "امتیاز ریسک مشاهده‌شده" : "Observed risk score"}</small><p>{assessment.summary}</p></div></div>
        <div className="assessment-kpis">
          <div><AlertTriangle /><strong>{findings.length}</strong><span>{isFa ? "یافته نیازمند توجه" : "findings"}</span></div>
          <div><Database /><strong>{String(coverage.coveragePercent ?? 0)}٪</strong><span>{isFa ? "پوشش داده دستگاه" : "device coverage"}</span></div>
          <div><ShieldCheck /><strong>{isFa ? confidenceFa[confidence] ?? confidence : confidence}</strong><span>{isFa ? "اطمینان تحلیل" : "confidence"}</span></div>
        </div>
      </div>

      <div className="assessment-notice"><Database aria-hidden="true" /><div><strong>{isFa ? "مبنای نتیجه" : "Evidence basis"}</strong><p>{String(details.dataNotice ?? (isFa ? "وضعیت پوشش داده مشخص نشده است." : "Data coverage is not available."))}</p></div></div>

      {analyses.length ? <section className="assessment-device-section">
        <div className="assessment-section-title"><div><h4>{isFa ? "بررسی دستگاه و Vendor" : "Device and vendor review"}</h4><p>{isFa ? "داده موجود، شکاف پوشش و یافته‌های تأییدشده جدا نمایش داده می‌شوند." : "Collected evidence, gaps, and confirmed findings are separated."}</p></div></div>
        <div className="assessment-device-tabs" role="tablist" aria-label={isFa ? "انتخاب دستگاه گزارش" : "Select report device"}>{analyses.map((item) => <button key={String(item.deviceId)} type="button" role="tab" aria-selected={String(item.deviceId) === String(activeAnalysis?.deviceId)} onClick={() => setActiveDeviceId(String(item.deviceId))}><Server aria-hidden="true" /><span>{String(item.device)}</span><small>{String(item.vendorLabel ?? item.vendor)}</small></button>)}</div>
        {activeAnalysis ? <div className="assessment-device-grid">
          <div className="assessment-data-card is-collected"><header><Check /><div><h5>{isFa ? "داده‌های بررسی‌شده" : "Collected data"}</h5><span>{collected.length}</span></div></header>{collected.length ? <ul>{collected.map((item, index) => <li key={`${String(item)}-${index}`}><Check />{localizeArea(item, isFa)}</li>)}</ul> : <p>{isFa ? "snapshot معتبر تازه‌ای از این دستگاه در دسترس نیست." : "No fresh valid snapshot is available."}</p>}</div>
          <div className="assessment-data-card is-missing"><header><AlertTriangle /><div><h5>{isFa ? "نیازمند داده بیشتر" : "Missing evidence"}</h5><span>{missing.length}</span></div></header>{missing.length ? <ul>{missing.map((item, index) => <li key={`${String(item)}-${index}`}><AlertTriangle />{localizeArea(item, isFa)}</li>)}</ul> : <p>{isFa ? "شکاف مشخصی در پوشش این پروفایل دیده نشد." : "No known profile gap was detected."}</p>}</div>
          <div className="assessment-data-card is-findings"><header><CircleGauge /><div><h5>{isFa ? "یافته‌های اختصاصی Vendor" : "Vendor findings"}</h5><span>{vendorFindings.length}</span></div></header>{vendorFindings.length ? <ul>{vendorFindings.map((item) => <li key={String(item.id)}><strong>{String(item.title)}</strong><span>{String(item.evidence ?? "")}</span></li>)}</ul> : <p>{isFa ? "در داده موجود یافته اختصاصی تأییدشده‌ای ثبت نشد؛ این نتیجه به معنی نبود قطعی ضعف نیست." : "No confirmed vendor-specific finding in available evidence."}</p>}</div>
        </div> : null}
      </section> : null}

      <section className="assessment-findings-section">
        <div className="assessment-section-title"><div><h4>{isFa ? "یافته‌های اولویت‌دار" : "Prioritized findings"}</h4><p>{isFa ? "هر مورد همراه با دلیل، شاهد و قدم بعدی ارائه شده است." : "Each item includes rationale, evidence, and next step."}</p></div><span>{findings.length}</span></div>
        {findings.length ? <div className="assessment-findings-list">{findings.map((finding, index) => <article key={String(finding.id ?? index)} data-severity={String(finding.severity ?? "medium")}><span className="assessment-finding-number">{index + 1}</span><div><div className="assessment-card-heading"><h5>{String(finding.title ?? (isFa ? "یافته امنیتی" : "Security finding"))}</h5><span className={riskClass(String(finding.severity ?? "medium"))}>{isFa ? severityFa[String(finding.severity)] ?? String(finding.severity) : String(finding.severity)}</span></div><p>{String(finding.explanation ?? "")}</p><details><summary>{isFa ? "شواهد" : "Evidence"}<ChevronDown /></summary><p>{compactEvidence(finding.evidence)}</p></details><div className="assessment-next-step"><strong>{isFa ? "قدم بعدی:" : "Next step:"}</strong>{String(finding.recommendedNextStep ?? (isFa ? "بررسی دستی" : "Manual review"))}</div></div></article>)}</div> : <div className="assessment-empty"><Check /><div><strong>{isFa ? "یافته فعالی در محدوده تحلیل ثبت نشد" : "No active finding in this scope"}</strong><p>{isFa ? "پوشش داده و پایش دوره‌ای را ادامه دهید؛ این پیام تضمین نبود آسیب‌پذیری نیست." : "Continue monitoring; this does not guarantee absence of vulnerabilities."}</p></div></div>}
      </section>

      {sortedRecommendations.length ? <section className="assessment-hardening-section"><div className="assessment-section-title"><div><h4>{isFa ? "برنامه پیشنهادی ایمن‌سازی" : "Hardening plan"}</h4><p>{isFa ? "پیشنهادهای تأییدمحور؛ ساخت برنامه اقدام به معنی اجرا نیست." : "Evidence-led recommendations; creating a plan does not execute it."}</p></div><span>{sortedRecommendations.length}</span></div><div className="assessment-recommendations">{sortedRecommendations.map((item) => <RecommendationCard key={item.id || `${item.deviceId}-${item.title}`} item={item} isFa={isFa} working={recommendationWorking === item.id} onCreate={() => onCreatePlan(item.id)} />)}</div></section> : null}
    </section>
  );
}
