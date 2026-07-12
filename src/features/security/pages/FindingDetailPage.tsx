import { useState } from "react";
import type { RouteComponentProps } from "@/routes/appRoutes";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { createFindingActionPlan } from "@/lib/platform";
import { publishActionPlanCreated } from "@/lib/actionPlanHandoff";
import { useFinding } from "../hooks/useFinding";

export default function FindingDetailPage({ params }: RouteComponentProps) {
  const { finding, loading, error, refresh } = useFinding(params.findingId);
  const [message, setMessage] = useState("");
  const createPlan = () => {
    if (!finding) return;
    setMessage("در حال ساخت ActionPlan پیشنهادی...");
    createFindingActionPlan(finding.id)
      .then((result) => {
        publishActionPlanCreated(result.actionPlan.id);
        setMessage("ActionPlan پیشنهادی ساخته شد. اجرا فقط در Action Center انجام می شود.");
      })
      .catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : "ActionPlan creation failed"));
  };
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;
  if (!finding) return <ErrorState title="یافته پیدا نشد" />;
  return (
    <section className="page-stack">
      <PageHeader title={finding.title} eyebrow="Finding Detail" description={finding.summary} actions={<button type="button" onClick={createPlan}>ساخت ActionPlan</button>} />
      <div className="summary-grid">
        <article className="metric-panel"><span>Severity</span><StatusBadge value={finding.severity} tone={["critical", "high"].includes(finding.severity) ? "danger" : "warning"} /></article>
        <article className="metric-panel"><span>Status</span><StatusBadge value={finding.status} tone="warning" /></article>
        <article className="metric-panel"><span>Asset</span><strong>{finding.asset?.name ?? finding.device?.name ?? "-"}</strong></article>
        <article className="metric-panel"><span>Count</span><strong>{finding.count}</strong></article>
      </div>
      <div className="content-grid">
        <section className="content-panel"><h2>مشکل چیست؟</h2><p>{finding.summary}</p></section>
        <section className="content-panel"><h2>چرا تشخیص داده شد؟</h2><p>این یافته توسط قانون تشخیص ثبت شده و شواهد در بخش فنی قابل بازبینی است.</p></section>
        <section className="content-panel"><h2>روی چه دارایی ای؟</h2><p>{finding.asset?.managementIp ?? finding.device?.host ?? "دارایی مشخص نشده است."}</p></section>
        <section className="content-panel"><h2>شواهد</h2><p>شواهد ساختاریافته در API موجود است؛ نمایش خام JSON برای کاربر نهایی انجام نمی شود.</p></section>
        <section className="content-panel"><h2>اقدام پیشنهادی</h2><p>ساخت ActionPlan فقط پیشنهاد بازبینی می سازد و connector را اجرا نمی کند.</p></section>
      </div>
      {message ? <p className="content-panel text-sm text-slate-300">{message}</p> : null}
    </section>
  );
}
