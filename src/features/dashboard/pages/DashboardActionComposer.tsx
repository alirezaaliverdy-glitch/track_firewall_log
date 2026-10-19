import { actionPlanPath, publishActionPlanCreated } from "@/lib/actionPlanHandoff";
import { proposeWithAi } from "@/lib/commandCatalog";
import { startGuidedSession } from "@/lib/guidedActions";
import type { PlatformAsset } from "@/lib/platform";
import { ArrowUpLeft, LoaderCircle, Sparkles } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AccessLink as Link } from "@/components/auth/AccessLink";

type Proposal = { title: string; detail: string; path: string };

export function DashboardActionComposer({ assets, isFa }: { assets: PlatformAsset[]; isFa: boolean }) {
  const navigate = useNavigate();
  const devices = useMemo(() => assets.filter((asset) => asset.device?.id), [assets]);
  const [deviceId, setDeviceId] = useState("");
  const [requestText, setRequestText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const selected = devices.find((asset) => asset.device?.id === deviceId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected?.device?.id || !requestText.trim() || busy) return;
    setBusy(true);
    setError("");
    setProposal(null);
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

  return <article className="command-panel dashboard-action-composer">
    <div className="dashboard-action-composer__heading"><span className="command-panel__icon"><Sparkles /></span><div><h2>{isFa ? "اقدام با یک جمله" : "Action in one sentence"}</h2><p>{isFa ? "درخواستتان به یک اقدام ثبت‌شده نگاشت می‌شود؛ اجرا فقط بعد از پیش‌نمایش و تأیید است." : "Your request is mapped to a registered action. Execution requires preview and confirmation."}</p></div></div>
    <form onSubmit={(event) => void submit(event)}>
      <label className="sr-only" htmlFor="dashboard-action-device">{isFa ? "تجهیز هدف" : "Target device"}</label>
      <select id="dashboard-action-device" value={deviceId} onChange={(event) => { setDeviceId(event.target.value); setProposal(null); }} required>
        <option value="">{isFa ? "تجهیز را انتخاب کنید" : "Select a device"}</option>
        {devices.map((asset) => <option key={asset.device!.id} value={asset.device!.id}>{asset.name} · {asset.managementIp ?? asset.device!.host}</option>)}
      </select>
      <label className="sr-only" htmlFor="dashboard-action-request">{isFa ? "درخواست عملیات" : "Action request"}</label>
      <input id="dashboard-action-request" value={requestText} onChange={(event) => { setRequestText(event.target.value); setProposal(null); }} placeholder={isFa ? "مثلاً IP 192.0.2.10 را مسدود کن" : "For example: block IP 192.0.2.10"} maxLength={1000} required />
      <button type="submit" disabled={busy || !deviceId || !requestText.trim()}>{busy ? <LoaderCircle className="is-spinning" /> : <Sparkles />}{isFa ? "ساخت پیشنهاد" : "Prepare proposal"}</button>
    </form>
    {error ? <p className="dashboard-action-composer__error" role="alert">{error}</p> : null}
    {proposal ? <div className="dashboard-action-composer__result" role="status"><div><strong>{proposal.title}</strong><small>{proposal.detail}</small></div><Link to={proposal.path}>{isFa ? "بررسی و تأیید" : "Review & confirm"}<ArrowUpLeft /></Link></div> : null}
  </article>;
}
