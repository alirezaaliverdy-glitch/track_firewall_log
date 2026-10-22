import { actionPlanPath, publishActionPlanCreated } from "@/lib/actionPlanHandoff";
import { proposeWithAi } from "@/lib/commandCatalog";
import { startGuidedSession } from "@/lib/guidedActions";
import type { PlatformAsset } from "@/lib/platform";
import { ArrowUpLeft, LoaderCircle, Sparkles } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AccessLink as Link } from "@/components/auth/AccessLink";
import { dryRunAction, normalizeObject, quickExecuteAction, type ActionPlan } from "@/lib/actions";
import { LinuxLiveLogs } from "@/components/actions/LinuxLiveLogs";
import { apiRequest } from "@/lib/apiTransport";

type Proposal = { title: string; detail: string; path: string };

export function DashboardActionComposer({ assets, isFa }: { assets: PlatformAsset[]; isFa: boolean }) {
  const navigate = useNavigate();
  const devices = useMemo(() => assets.filter((asset) => asset.device?.id), [assets]);
  const [deviceId, setDeviceId] = useState("");
  const [requestText, setRequestText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [logPlan,setLogPlan]=useState<ActionPlan|null>(null);
  const [logSession,setLogSession]=useState("");
  const selected = devices.find((asset) => asset.device?.id === deviceId);
  const logQueryPreview=useMemo(()=>{try{return normalizeObject(JSON.parse(String(logPlan?.parametersJson.logQuery??"null")));}catch{return {}; }},[logPlan]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected?.device?.id || !requestText.trim() || busy) return;
    setBusy(true);
    setError("");
    setProposal(null);
    setLogPlan(null);
    try {
      const vendor = selected.vendor?.name ?? selected.device.type;
      const result = await proposeWithAi({
        requestText: requestText.trim(),
        vendor,
        selectedDeviceName: selected.device.name,
        deviceId: selected.device.id,
      });
      const resolution = result.resolution as { catalogItem?: { titleFa?: string; titleEn?: string }; targetSupportedAction?: { titleFa?: string; titleEn?: string } } | undefined;
      const matched = resolution?.catalogItem ?? resolution?.targetSupportedAction;
      const title = (isFa ? matched?.titleFa : matched?.titleEn) || requestText.trim();
      if (result.mode === "executable_action_plan") {
        if(result.liveLogQuery){setLogPlan(await dryRunAction(result.actionPlanId));return;}
        publishActionPlanCreated(result.actionPlanId);
        setProposal({ title, detail: isFa ? "اقدام شناسایی شد. پیش‌نمایش را بررسی و سپس تأیید کنید." : "Action recognized. Review its preview before confirming.", path: actionPlanPath(result.actionPlanId) });
      } else if (result.mode === "needs_input" && "actionPlanId" in result && typeof result.actionPlanId === "string") {
        publishActionPlanCreated(result.actionPlanId);
        setProposal({ title, detail: result.messageFa, path: `/actions/${encodeURIComponent(result.actionPlanId)}/configure` });
      } else if (result.mode === "guided_workflow") {
        if ("actionPlanId" in result && typeof result.actionPlanId === "string") {
          publishActionPlanCreated(result.actionPlanId);
          setProposal({ title, detail: result.messageFa, path: `/actions/${encodeURIComponent(result.actionPlanId)}/configure` });
        } else {
          const session = await startGuidedSession({ blueprintId: result.blueprintId, initialValues: result.initialValues, initialRequest: requestText.trim(), vendor: result.vendor ?? vendor, deviceId: selected.device.id });
          navigate(`/guided-actions/${encodeURIComponent(session.sessionId)}`);
        }
      } else if (result.mode === "clarification") {
        setError(result.questionFa);
      } else if ("actionPlanId" in result && typeof result.actionPlanId === "string") {
        publishActionPlanCreated(result.actionPlanId);
        setProposal({ title, detail: result.messageFa ?? (isFa ? "پیشنهاد نیازمند بررسی دستی است." : "This proposal needs manual review."), path: actionPlanPath(result.actionPlanId) });
      } else {
        setError(result.messageFa ?? (isFa ? "برای این درخواست اقدام اجرایی ثبت‌شده‌ای پیدا نشد." : "No supported action was found for this request."));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isFa ? "ساخت پیشنهاد ناموفق بود." : "Could not create a proposal."));
    } finally {
      setBusy(false);
    }
  }

  async function startLogs(){
    if(!logPlan||busy)return;setBusy(true);setError("");
    try{if(logSession){const stopped=await apiRequest(`/commands/live-logs/${encodeURIComponent(logSession)}/stop`,{method:"POST"});if(!stopped.ok&&stopped.status!==404)throw new Error("ابتدا پایش قبلی را متوقف کنید.");setLogSession("");}const result=await quickExecuteAction(logPlan.id,{intent:"execute"});const session=normalizeObject(normalizeObject(result.resultJson).parsedResult);
      if(result.status!=="succeeded"||typeof session.sessionId!=="string")throw new Error(String(normalizeObject(result.resultJson).message??"شروع جریان لاگ موفق نبود؛ نتیجهٔ اقدام را بررسی کنید."));
      setLogSession(session.sessionId);setLogPlan(null);
    }catch(e){setError(e instanceof Error?e.message:"شروع پایش ناموفق بود.");}finally{setBusy(false);}
  }

  return <article className="command-panel dashboard-action-composer">
    <div className="dashboard-action-composer__heading"><span className="command-panel__icon"><Sparkles /></span><div><h2>{isFa ? "اقدام با یک جمله" : "Action in one sentence"}</h2><p>{isFa ? "درخواستتان به یک اقدام ثبت‌شده نگاشت می‌شود؛ اجرا فقط بعد از پیش‌نمایش و تأیید است." : "Your request is mapped to a registered action. Execution requires preview and confirmation."}</p></div></div>
    <form onSubmit={(event) => void submit(event)}>
      <label className="sr-only" htmlFor="dashboard-action-device">{isFa ? "تجهیز هدف" : "Target device"}</label>
      <select id="dashboard-action-device" value={deviceId} onChange={(event) => { setDeviceId(event.target.value); setProposal(null); setLogPlan(null); }} required>
        <option value="">{isFa ? "تجهیز را انتخاب کنید" : "Select a device"}</option>
        {devices.map((asset) => <option key={asset.device!.id} value={asset.device!.id}>{asset.name} · {asset.managementIp ?? asset.device!.host}</option>)}
      </select>
      <label className="sr-only" htmlFor="dashboard-action-request">{isFa ? "درخواست عملیات" : "Action request"}</label>
      <input id="dashboard-action-request" value={requestText} onChange={(event) => { setRequestText(event.target.value); setProposal(null); setLogPlan(null); }} placeholder={isFa ? "مثلاً لاگ زندهٔ nginx یا لاگ IP 192.0.2.10" : "For example: live nginx logs, or logs for IP 192.0.2.10"} maxLength={1000} required />
      <button type="submit" disabled={busy || !deviceId || !requestText.trim()}>{busy ? <LoaderCircle className="is-spinning" /> : <Sparkles />}{isFa ? "ساخت پیشنهاد" : "Prepare proposal"}</button>
    </form>
    {error ? <p className="dashboard-action-composer__error" role="alert">{error}</p> : null}
    {logPlan?<div className="linux-live-preview"><strong>{isFa?"پیش‌نمایش پایش زندهٔ لینوکس":"Preview Linux log monitoring"}</strong><p>{logPlan.device?.name??selected?.name} · <bdi>{(()=>{try{const q=JSON.parse(String(logPlan.parametersJson.logQuery));return [q.source==="auto"?`${isFa?"چندمنبعی":"Multiple sources"}: ${q.scope}`:q.container??q.file??q.unit??(q.kernel?"kernel":"journal"),q.ip,q.text,q.errorsOnly?"خطاها":""].filter(Boolean).join(" · ");}catch{return "";}})()}</bdi></p><p>{isFa?"فقط‌خواندنی، ۵۰ خط اخیر هر منبع و سپس رویدادهای تازه؛ حداکثر ۳۰ دقیقه و ۵۰۰ رویداد در پنجره. دادهٔ خام دائماً ذخیره نمی‌شود. پس از تأیید اتصال واقعی شروع می‌شود.":"Read-only: 50 recent lines per source, then new events. Up to 30 minutes and 500 events in memory. Confirmation starts the real connection."}</p><code>{String(logPlan.parametersJson.liveLogFingerprint??"")}</code>{logPlan.parametersJson.liveLogFirstTrust?<p>{isFa?"این کلید SSH برای اولین بار در همین پیش‌نمایش مشاهده شده؛ قبل از تأیید با کلید تجهیز تطبیق دهید.":"First observed SSH key: compare with the device before confirming."}</p>:null}<button type="button" disabled={busy} onClick={()=>void startLogs()}>{busy?(isFa?"در حال اتصال…":"Connecting…"):(isFa?"تأیید و شروع پایش":"Confirm & monitor")}</button></div>:null}
    {logPlan&&logQueryPreview.source==="auto"?<p className="linux-live-logs__notice">{isFa?"با همین تأیید، منابع واقعی فایل، journal و کانتینرها هم‌زمان خوانده می‌شوند (حداکثر ۴۸ منبع). مسیرهای ثبت لاگ Nginx نیز روی میزبان و کانتینر مرتبط بررسی می‌شوند؛ فقط فرمان‌های ثابت خواندن تنظیمات مسیر و لاگ اجرا می‌شوند. Python 3 لازم است؛ هیچ تنظیمی تغییر نمی‌کند. محدودیت یا خطای هر منبع در پنجره مشخص است.":"This confirmation allows read-only discovery of files, journal and container logs (up to 48 sources), including fixed Nginx log-path inspection on host/related containers. Requires Python 3; no settings are changed. Coverage limits and source failures are shown."}</p>:null}
    {logSession?<LinuxLiveLogs key={logSession} sessionId={logSession} isFa={isFa}/>:null}
    {proposal ? <div className="dashboard-action-composer__result" role="status"><div><strong>{proposal.title}</strong><small>{proposal.detail}</small></div><Link to={proposal.path}>{isFa ? "بررسی و تأیید" : "Review & confirm"}<ArrowUpLeft /></Link></div> : null}
  </article>;
}
