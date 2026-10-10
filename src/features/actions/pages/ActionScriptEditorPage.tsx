import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  CircleAlert,
  Code2,
  Copy,
  FileCheck2,
  LoaderCircle,
  Play,
  RotateCcw,
  Server,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import { quickExecuteAction, type ActionPlan } from "@/lib/actions";
import {
  createEditedScriptPreview,
  getEditableActionScript,
  ScriptEditorApiError,
  type EditableActionScript,
  type ScriptEditorIssue,
} from "@/lib/actionScriptEditor";
import type { RouteComponentProps } from "@/routes/appRoutes";
import "./ActionScriptEditorPage.css";

type EditorTab = "script" | "verification";

function lineCount(value: string) {
  return value ? value.replace(/\r\n/g, "\n").split("\n").length : 1;
}

function LineNumbers({ value }: { value: string }) {
  return <div className="script-editor__line-numbers" aria-hidden="true">{Array.from({ length: lineCount(value) }, (_, index) => <span key={index}>{index + 1}</span>)}</div>;
}

function statusCopy(plan: ActionPlan | null, isFa: boolean) {
  if (!plan) return isFa ? "هنوز پیش‌نمایش ساخته نشده" : "Preview not generated";
  if (plan.status === "succeeded") return isFa ? "روی وندور اعمال و تأیید شد" : "Applied and verified";
  if (plan.status === "failed") return isFa ? "اجرا ناموفق بود" : "Execution failed";
  return isFa ? "پیش‌نمایش معتبر و آماده تأیید" : "Validated preview ready";
}

export default function ActionScriptEditorPage({ params }: RouteComponentProps) {
  const actionId = params.actionId ?? "";
  const { i18n } = useTranslation();
  const isFa = i18n.language?.startsWith("fa") ?? false;
  const [draft, setDraft] = useState<EditableActionScript | null>(null);
  const [script, setScript] = useState("");
  const [verification, setVerification] = useState("");
  const [tab, setTab] = useState<EditorTab>("script");
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [previewPlan, setPreviewPlan] = useState<ActionPlan | null>(null);
  const [issues, setIssues] = useState<ScriptEditorIssue[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getEditableActionScript(actionId)
      .then((next) => {
        if (cancelled) return;
        setDraft(next);
        setScript(next.script);
        setVerification(next.verificationScript);
      })
      .catch((error: unknown) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "بارگذاری اسکریپت انجام نشد.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [actionId]);

  const changed = Boolean(draft && (script !== draft.script || verification !== draft.verificationScript));
  const activeValue = tab === "script" ? script : verification;
  const activeIssues = useMemo(() => issues.filter((issue) => issue.section === tab || issue.section === "general"), [issues, tab]);
  const sourcePath = `/actions/${encodeURIComponent(actionId)}`;

  function updateActive(value: string) {
    if (tab === "script") setScript(value);
    else setVerification(value);
    setPreviewPlan(null);
    setIssues([]);
    setMessage("");
  }

  function reset() {
    if (!draft) return;
    setScript(draft.script);
    setVerification(draft.verificationScript);
    setPreviewPlan(null);
    setIssues([]);
    setMessage(isFa ? "نسخه تولیدشده اولیه بازیابی شد." : "Original generated version restored.");
  }

  async function makePreview() {
    if (!draft || previewing || executing) return;
    setPreviewing(true);
    setIssues([]);
    setMessage("");
    try {
      const result = await createEditedScriptPreview(actionId, {
        sourceRevision: draft.sourceRevision,
        script,
        verificationScript: verification,
      });
      setPreviewPlan(result.actionPlan);
      setMessage(isFa
        ? `هر ${result.validation.normalizedLines.toLocaleString("fa-IR")} خط اجرا و ${result.validation.verificationLines.toLocaleString("fa-IR")} خط بررسی تأیید شدند. هنوز چیزی روی تجهیز اجرا نشده است.`
        : "The edited script passed policy validation. Nothing has executed yet.");
    } catch (error) {
      if (error instanceof ScriptEditorApiError) {
        setIssues(error.issues);
        if (error.issues.some((issue) => issue.section === "script")) setTab("script");
        else if (error.issues.some((issue) => issue.section === "verification")) setTab("verification");
      }
      setMessage(error instanceof Error ? error.message : "ساخت پیش‌نمایش انجام نشد.");
    } finally {
      setPreviewing(false);
    }
  }

  async function confirmAndExecute() {
    if (!previewPlan || executing) return;
    setExecuting(true);
    setMessage("");
    try {
      const result = await quickExecuteAction(previewPlan.id, { intent: "execute" });
      setPreviewPlan(result);
      setMessage(result.status === "succeeded"
        ? (isFa ? "Connector واقعی اجرا شد و نتیجه روی وندور ثبت شد." : "The registered connector executed and the result was recorded.")
        : (isFa ? "اجرای Connector پایان یافت؛ نتیجه و جزئیات را بررسی کنید." : "Connector execution finished; review the result."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "اجرای اسکریپت انجام نشد.");
    } finally {
      setExecuting(false);
    }
  }

  if (loading) return <section className="script-editor-loading"><LoaderCircle className="is-spinning" /><span>{isFa ? "در حال آماده‌سازی محیط ویرایش…" : "Preparing editor…"}</span></section>;

  return (
    <section className="script-editor-page" dir={isFa ? "rtl" : "ltr"}>
      <header className="script-editor-hero">
        <div className="script-editor-hero__identity">
          <span className="script-editor-hero__icon"><TerminalSquare aria-hidden="true" /></span>
          <div>
            <span className="script-editor-eyebrow">{isFa ? "محیط حرفه‌ای دستیار هوشمند" : "AI assistant pro workspace"}</span>
            <h1>{isFa ? "ویرایش اسکریپت وندور" : "Vendor script editor"}</h1>
            <p>{isFa ? "هر خط را آزادانه کم یا زیاد کنید؛ اجرای نهایی فقط از مسیر کنترل‌شده پروژه انجام می‌شود." : "Edit every line freely; final execution remains controlled."}</p>
          </div>
        </div>
        <Link className="script-editor-back" to={sourcePath}><ArrowRight aria-hidden="true" />{isFa ? "بازگشت به عملیات" : "Back to action"}</Link>
      </header>

      {draft ? <div className="script-editor-context">
        <div><Server aria-hidden="true" /><span><small>{isFa ? "تجهیز مقصد" : "Target device"}</small><strong>{draft.device.name}</strong></span></div>
        <div><Code2 aria-hidden="true" /><span><small>{isFa ? "وندور و اتصال" : "Vendor"}</small><strong>{draft.vendor} · SSH</strong></span></div>
        <div><CircleAlert aria-hidden="true" /><span><small>{isFa ? "سطح ریسک" : "Risk"}</small><strong>{draft.riskLevel}</strong></span></div>
        <div><BadgeCheck aria-hidden="true" /><span><small>{isFa ? "نسخه منبع" : "Source revision"}</small><strong>#{draft.sourceRevision}</strong></span></div>
      </div> : null}

      <div className="script-editor-progress" aria-label={isFa ? "مراحل اعمال اسکریپت" : "Script workflow"}>
        <span className="is-active"><b>۱</b>{isFa ? "ویرایش آزاد" : "Free edit"}</span>
        <span className={previewPlan ? "is-active" : ""}><b>۲</b>{isFa ? "اعتبارسنجی و پیش‌نمایش" : "Validate and preview"}</span>
        <span className={previewPlan?.status === "succeeded" ? "is-active" : ""}><b>۳</b>{isFa ? "تأیید و اجرای Connector" : "Confirm and execute"}</span>
      </div>

      <div className="script-editor-layout">
        <main className="script-editor-workbench">
          <div className="script-editor-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "script"} onClick={() => setTab("script")}><Play aria-hidden="true" />{isFa ? "اسکریپت اجرا" : "Execution script"}<em>{lineCount(script)}</em></button>
            <button type="button" role="tab" aria-selected={tab === "verification"} onClick={() => setTab("verification")}><FileCheck2 aria-hidden="true" />{isFa ? "بررسی پس از اجرا" : "Post-check"}<em>{lineCount(verification)}</em></button>
          </div>
          <div className="script-editor-toolbar">
            <span>{draft ? `${draft.vendor.toUpperCase()} / ${draft.actionType}` : "ActionPlan"}</span>
            <div>
              <button type="button" onClick={() => void navigator.clipboard?.writeText(activeValue)}><Copy aria-hidden="true" />{isFa ? "کپی" : "Copy"}</button>
              <button type="button" disabled={!changed} onClick={reset}><RotateCcw aria-hidden="true" />{isFa ? "بازنشانی" : "Reset"}</button>
            </div>
          </div>
          <div className="script-editor-code" dir="ltr">
            <LineNumbers value={activeValue} />
            <textarea
              aria-label={tab === "script" ? (isFa ? "متن اسکریپت اجرا" : "Execution script") : (isFa ? "متن بررسی پس از اجرا" : "Verification script")}
              spellCheck={false}
              value={activeValue}
              onChange={(event) => updateActive(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  void makePreview();
                }
              }}
            />
          </div>
          <footer className="script-editor-workbench__footer">
            <span>{isFa ? "Ctrl + Enter برای ساخت پیش‌نمایش" : "Ctrl + Enter to preview"}</span>
            <span>{draft ? `${lineCount(activeValue).toLocaleString(isFa ? "fa-IR" : "en-US")} / ${draft.limits.maxExecutionLines.toLocaleString(isFa ? "fa-IR" : "en-US")} ${isFa ? "خط" : "lines"}` : null}</span>
          </footer>
        </main>

        <aside className="script-editor-review">
          <section className="script-editor-safety">
            <span><ShieldCheck aria-hidden="true" /></span>
            <div><strong>{isFa ? "اجرای خام غیرفعال است" : "Raw execution is disabled"}</strong><p>{draft?.safety.messageFa ?? (isFa ? "اسکریپت پس از اعتبارسنجی قابل اجراست." : "The script must pass validation.")}</p></div>
          </section>

          <section className={`script-editor-status ${issues.length ? "has-error" : previewPlan ? "is-ready" : ""}`}>
            <div className="script-editor-status__title">
              {issues.length ? <CircleAlert aria-hidden="true" /> : previewPlan ? <CheckCircle2 aria-hidden="true" /> : <Code2 aria-hidden="true" />}
              <div><small>{isFa ? "وضعیت جاری" : "Current state"}</small><strong>{issues.length ? (isFa ? "نیازمند اصلاح" : "Needs changes") : statusCopy(previewPlan, isFa)}</strong></div>
            </div>
            {message ? <p className="script-editor-message" role="status">{message}</p> : null}
            {activeIssues.length ? <ul className="script-editor-issues">{activeIssues.map((issue, index) => <li key={`${issue.section}-${issue.line}-${index}`}><b>{issue.line ? `${isFa ? "خط" : "Line"} ${issue.line.toLocaleString(isFa ? "fa-IR" : "en-US")}` : (isFa ? "کل اسکریپت" : "Script")}</b><span>{isFa ? issue.messageFa : issue.message}</span>{issue.command ? <code dir="ltr">{issue.command}</code> : null}</li>)}</ul> : null}
            {previewPlan ? <dl className="script-editor-proof"><div><dt>ActionPlan</dt><dd dir="ltr">{previewPlan.id}</dd></div><div><dt>{isFa ? "وضعیت" : "Status"}</dt><dd>{previewPlan.status}</dd></div><div><dt>{isFa ? "اجرای واقعی" : "Connector"}</dt><dd>{previewPlan.resultJson.connectorInvoked === true ? (isFa ? "ثبت شد" : "Recorded") : (isFa ? "هنوز اجرا نشده" : "Not invoked")}</dd></div></dl> : null}
          </section>

          <div className="script-editor-actions">
            <button className="script-editor-preview-button" type="button" disabled={!draft || previewing || executing} onClick={() => void makePreview()}>{previewing ? <LoaderCircle className="is-spinning" /> : <FileCheck2 />}<span>{previewing ? (isFa ? "در حال بررسی…" : "Validating…") : (isFa ? "بررسی و ساخت پیش‌نمایش" : "Validate & preview")}</span></button>
            <button className="script-editor-execute-button" type="button" disabled={!previewPlan || previewPlan.status === "succeeded" || executing} onClick={() => void confirmAndExecute()}>{executing ? <LoaderCircle className="is-spinning" /> : <ShieldCheck />}<span>{executing ? (isFa ? "در حال اعمال روی وندور…" : "Applying…") : (isFa ? "تأیید و اعمال روی وندور" : "Confirm & apply")}</span></button>
          </div>
          {previewPlan ? <Link className="script-editor-result-link" to={`/actions/${encodeURIComponent(previewPlan.id)}`}>{isFa ? "مشاهده جزئیات و Audit عملیات" : "View operation details and audit"}</Link> : null}
        </aside>
      </div>
    </section>
  );
}
