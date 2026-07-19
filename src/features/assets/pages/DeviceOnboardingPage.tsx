import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronLeft, Network, ShieldAlert } from "lucide-react";
import type { RouteComponentProps } from "@/routes/appRoutes";
import { PageHeader } from "@/components/ui/PageHeader";
import { WorkflowPrimaryAction, WorkflowReviewSummary, WorkflowStateCallout, WorkflowStepper, type WorkflowStepStatus } from "@/components/workflows";
import { createCredential, listCredentials, type CredentialInput, type DeviceCredential } from "@/lib/credentials";
import {
  OnboardingApiError,
  answerOnboarding,
  commitOnboarding,
  detectOnboarding,
  discoverOnboarding,
  getOnboarding,
  previewOnboarding,
  registerUnverifiedOnboarding,
  startOnboarding,
  testOnboarding,
  type OnboardingDraft,
  type OnboardingSession
} from "@/lib/deviceOnboarding";

const platforms: Record<OnboardingDraft["vendor"], string> = {
  linux: "linux",
  cisco: "cisco-ios-xe",
  fortigate: "fortios",
  mikrotik: "routeros"
};

const emptyCredential: CredentialInput = { name: "", type: "password", username: "", password: "", privateKey: "", passphrase: "", sudo: false };
const stepKeys = ["onboarding.steps.identity", "onboarding.steps.credential", "onboarding.steps.review"];

type Step = 1 | 2 | 3;
type InvalidField = "name" | "host" | "port" | null;

function initialVendor(params: Record<string, string>) {
  const query = new URLSearchParams(window.location.search).get("vendor");
  const value = (params.vendorKey || query || "linux").toLowerCase();
  return (["linux", "cisco", "fortigate", "mikrotik"].includes(value) ? value : "linux") as OnboardingDraft["vendor"];
}

function statusText(session: OnboardingSession | null, t: TFunction) {
  if (!session?.test) return t("onboarding.status.notTested");
  if (session.test.connected === true && session.test.connectorInvoked === true) return t("onboarding.status.verified");
  return String(session.test.error ?? session.result?.verificationStatus ?? t("onboarding.status.notVerified"));
}

function mappedError(failure: unknown, fallbackKey: string, t: TFunction) {
  if (failure instanceof OnboardingApiError) {
    const code = failure.code ?? "";
    const message = failure.message.toLowerCase();
    let key = "onboarding.errors.generic";
    if (code.includes("DUPLICATE")) key = "onboarding.errors.duplicate";
    else if (code.includes("SESSION")) key = "onboarding.errors.session";
    else if (code.includes("CREDENTIAL") || /auth|password|key/.test(message)) key = "onboarding.errors.auth";
    else if (code.includes("PLATFORM") || /platform|unsupported/.test(message)) key = "onboarding.errors.platform";
    else if (/timeout|timed out/.test(message)) key = "onboarding.errors.timeout";
    else if (code.includes("CONNECTION") || /unreach|refused|network|connect/.test(message)) key = "onboarding.errors.network";
    return { message: t(key), diagnostic: `${failure.code ?? failure.status}: ${failure.message}` };
  }
  if (failure instanceof Error) return { message: failure.message || t(fallbackKey), diagnostic: failure.message };
  return { message: t(fallbackKey), diagnostic: "" };
}

function stepStatus(step: Step, index: number, connectionFailed: boolean): WorkflowStepStatus {
  const current = index + 1;
  if (connectionFailed && current === 2) return "failed";
  if (step > current) return "complete";
  if (step === current) return "current";
  return "pending";
}

export default function DeviceOnboardingPage({ params }: RouteComponentProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const started = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const hostInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>(1);
  const [session, setSession] = useState<OnboardingSession | null>(null);
  const [form, setForm] = useState<OnboardingDraft | null>(null);
  const [credentials, setCredentials] = useState<DeviceCredential[]>([]);
  const [credentialMode, setCredentialMode] = useState<"existing" | "new">("existing");
  const [credentialForm, setCredentialForm] = useState<CredentialInput>(emptyCredential);
  const [enableSecret, setEnableSecret] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [diagnostic, setDiagnostic] = useState("");
  const [invalidField, setInvalidField] = useState<InvalidField>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const vendor = initialVendor(params);
    Promise.all([
      startOnboarding({ vendor, platform: platforms[vendor], deviceId: params.deviceId || undefined }),
      listCredentials()
    ]).then(([next, refs]) => {
      setSession(next);
      setForm({ ...next.draft, platform: next.draft.platform || platforms[vendor] });
      setCredentials(refs);
    }).catch((failure: unknown) => {
      const next = mappedError(failure, "onboarding.errors.generic", t);
      setError(next.message);
      setDiagnostic(next.diagnostic);
    });
  }, [params.deviceId, params.vendorKey, t]);

  const selectedCredential = useMemo(() => credentials.find((item) => item.id === form?.credentialId) ?? null, [credentials, form?.credentialId]);
  const verified = session?.test?.connected === true && session.test.connectorInvoked === true && session.status === "preview_ready";
  const unverifiedResult = session?.result?.verificationStatus === "unverified" && session.result.connectorInvoked === false;
  const connectionFailed = Boolean(session?.test && !verified);

  if (!form || !session) {
    return <section className="page-stack"><PageHeader title={t("onboarding.title.register")} eyebrow={t("onboarding.eyebrow")} /><div className="state-card">{t("onboarding.loading")}</div>{error ? <div className="state-card is-error">{error}</div> : null}</section>;
  }

  const activeForm = form;
  const activeSession = session;
  const change = <K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]) => setForm((current) => current ? { ...current, [key]: value } : current);

  function validateIdentity() {
    if (!activeForm.name.trim()) { setError(t("onboarding.errors.nameRequired")); setInvalidField("name"); nameInput.current?.focus(); return false; }
    if (!activeForm.host.trim()) { setError(t("onboarding.errors.hostRequired")); setInvalidField("host"); hostInput.current?.focus(); return false; }
    if (!Number.isInteger(activeForm.managementPort) || activeForm.managementPort < 1 || activeForm.managementPort > 65535) { setError(t("onboarding.errors.portRange")); setInvalidField("port"); return false; }
    setError(""); setDiagnostic(""); setInvalidField(null);
    return true;
  }

  async function ensureCredential() {
    if (credentialMode === "existing") return { credentialId: activeForm.credentialId, enableCredentialId: activeForm.enableCredentialId ?? "" };
    if (!credentialForm.name.trim() || !credentialForm.username.trim()) throw new Error(t("onboarding.errors.credentialFields"));
    const created = await createCredential(credentialForm);
    let enableCredentialId = activeForm.enableCredentialId ?? "";
    if (activeForm.vendor === "cisco" && enableSecret.trim()) {
      const enable = await createCredential({ name: `${credentialForm.name.trim()} enable`, type: "password", username: credentialForm.username, password: enableSecret, sudo: false });
      enableCredentialId = enable.id;
      setCredentials((current) => [enable, created, ...current]);
    } else {
      setCredentials((current) => [created, ...current]);
    }
    setForm((current) => current ? { ...current, credentialId: created.id, enableCredentialId } : current);
    setCredentialForm(emptyCredential);
    setEnableSecret("");
    setCredentialMode("existing");
    return { credentialId: created.id, enableCredentialId };
  }

  async function saveAnswersForTest() {
    if (!validateIdentity()) return null;
    const credential = await ensureCredential();
    if (!credential.credentialId) throw new Error(t("onboarding.errors.credentialRequired"));
    const draft: OnboardingDraft = { ...activeForm, credentialId: credential.credentialId, enableCredentialId: credential.enableCredentialId, platform: activeForm.platform || platforms[activeForm.vendor] };
    setForm(draft);
    return answerOnboarding(activeSession.id, draft);
  }

  async function runTest() {
    setBusy("test"); setError(""); setMessage(""); setDiagnostic("");
    try {
      let next = await saveAnswersForTest();
      if (!next) return;
      next = await testOnboarding(next.id);
      if (next.test?.connected === true && next.test.connectorInvoked === true) {
        next = await detectOnboarding(next.id);
        next = await discoverOnboarding(next.id);
        next = await previewOnboarding(next.id);
        setMessage(t("onboarding.messages.verified"));
      } else {
        setMessage(t("onboarding.messages.notVerified"));
      }
      setSession(next); setForm(next.draft); setStep(3);
    } catch (failure) {
      const nextError = mappedError(failure, "onboarding.errors.connectionFailed", t);
      setError(nextError.message);
      setDiagnostic(nextError.diagnostic);
      await getOnboarding(activeSession.id).then((current) => { setSession(current); setForm(current.draft); setStep(3); }).catch(() => undefined);
    } finally { setBusy(""); }
  }

  async function skipTest() {
    if (!validateIdentity()) return;
    setStep(3);
    setMessage(t("onboarding.messages.skip"));
  }

  async function register() {
    setBusy("register"); setError(""); setDiagnostic("");
    try {
      const next = verified ? await commitOnboarding(activeSession.id) : await registerUnverifiedOnboarding(activeSession.id, activeForm);
      setSession(next); setForm(next.draft);
      if (next.result?.route) navigate(next.result.route, { replace: true });
    } catch (failure) {
      const nextError = mappedError(failure, "onboarding.errors.registrationFailed", t);
      setError(nextError.message);
      setDiagnostic(nextError.diagnostic);
    } finally { setBusy(""); }
  }

  const steps = stepKeys.map((key, index) => ({ id: key, label: t(key), status: stepStatus(step, index, connectionFailed) }));

  return (
    <section className="page-stack device-onboarding-simple">
      <PageHeader title={params.deviceId ? t("onboarding.title.update") : t("onboarding.title.register")} eyebrow={t("onboarding.eyebrow")} description={t("onboarding.description")} actions={<Link className="secondary-link" to="/assets/devices">{t("onboarding.backToDevices")}</Link>} />

      <WorkflowStepper steps={steps} ariaLabel={t("onboarding.steps.label")} />
      {error ? <div role="alert" className="state-card is-error">{error}</div> : null}
      {diagnostic ? <details className="advanced-section"><summary>{t("onboarding.advanced.diagnostics")}</summary><p dir="ltr">{diagnostic}</p></details> : null}
      {message ? <WorkflowStateCallout tone={verified ? "success" : "warning"} title={verified ? t("onboarding.status.verified") : t("onboarding.status.notVerified")} message={message} /> : null}

      {step === 1 && <section className="content-panel onboarding-form">
        <h2>{t("onboarding.step1.title")}</h2>
        <div className="form-grid">
          <label>{t("onboarding.fields.name")}<input ref={nameInput} value={activeForm.name} onChange={(event) => change("name", event.target.value)} placeholder={t("onboarding.placeholders.name")} aria-invalid={invalidField === "name"} /></label>
          <label>{t("onboarding.fields.vendor")}<select value={activeForm.vendor} onChange={(event) => { const vendor = event.target.value as OnboardingDraft["vendor"]; setForm({ ...activeForm, vendor, platform: platforms[vendor], connectionMethod: "ssh", managementPort: 22 }); }}><option value="linux">Linux</option><option value="cisco">Cisco</option><option value="fortigate">FortiGate</option><option value="mikrotik">MikroTik</option></select></label>
          <label>{t("onboarding.fields.management")}<input ref={hostInput} value={activeForm.host} onChange={(event) => change("host", event.target.value)} dir="ltr" placeholder={t("onboarding.placeholders.host")} aria-invalid={invalidField === "host"} /></label>
          <label>{t("onboarding.fields.port")}<input type="number" min="1" max="65535" value={activeForm.managementPort} onChange={(event) => change("managementPort", Number(event.target.value))} aria-invalid={invalidField === "port"} /></label>
          <label>{t("onboarding.fields.platform")}<select value={activeForm.platform || platforms[activeForm.vendor]} onChange={(event) => change("platform", event.target.value)}><option value={platforms[activeForm.vendor]}>{t("onboarding.platform.auto")}</option></select></label>
        </div>
        <div className="button-row"><button className="primary-button" type="button" onClick={() => validateIdentity() && setStep(2)}>{t("common.continue")}</button></div>
      </section>}

      {step === 2 && <section className="content-panel onboarding-form">
        <h2>{t("onboarding.step2.title")}</h2>
        <div className="segmented-control" role="tablist"><button type="button" aria-pressed={credentialMode === "existing"} onClick={() => setCredentialMode("existing")}>{t("onboarding.credentials.existing")}</button><button type="button" aria-pressed={credentialMode === "new"} onClick={() => setCredentialMode("new")}>{t("onboarding.credentials.new")}</button></div>
        {credentialMode === "existing" ? <label>{t("onboarding.fields.credential")}<select value={activeForm.credentialId} onChange={(event) => change("credentialId", event.target.value)}><option value="">{t("onboarding.credentials.choose")}</option>{credentials.map((item) => <option key={item.id} value={item.id}>{item.name} - {item.username}</option>)}</select></label> : <div className="form-grid"><label>{t("onboarding.fields.credentialName")}<input value={credentialForm.name} onChange={(event) => setCredentialForm({ ...credentialForm, name: event.target.value })} /></label><label>{t("onboarding.fields.username")}<input autoComplete="username" value={credentialForm.username} onChange={(event) => setCredentialForm({ ...credentialForm, username: event.target.value })} /></label><label>{t("onboarding.fields.credentialType")}<select value={credentialForm.type} onChange={(event) => setCredentialForm({ ...credentialForm, type: event.target.value as CredentialInput["type"] })}><option value="password">{t("onboarding.fields.password")}</option><option value="private_key">{t("onboarding.fields.privateKey")}</option></select></label>{credentialForm.type === "password" ? <label>{t("onboarding.fields.password")}<input type="password" autoComplete="new-password" value={credentialForm.password ?? ""} onChange={(event) => setCredentialForm({ ...credentialForm, password: event.target.value })} /></label> : <><label>{t("onboarding.fields.privateKey")}<textarea value={credentialForm.privateKey ?? ""} onChange={(event) => setCredentialForm({ ...credentialForm, privateKey: event.target.value })} /></label><label>{t("onboarding.fields.passphrase")}<input type="password" autoComplete="new-password" value={credentialForm.passphrase ?? ""} onChange={(event) => setCredentialForm({ ...credentialForm, passphrase: event.target.value })} /></label></>} {activeForm.vendor === "cisco" ? <label>{t("onboarding.fields.enableSecret")}<input type="password" autoComplete="new-password" value={enableSecret} onChange={(event) => setEnableSecret(event.target.value)} /></label> : null}</div>}
        {activeForm.vendor === "cisco" && <details className="advanced-section"><summary>{t("onboarding.advanced.ciscoTitle")}</summary><label className="warning-check"><input type="checkbox" checked={activeForm.ciscoLegacyCompatibilityApproved === true} onChange={(event) => change("ciscoLegacyCompatibilityApproved", event.target.checked)} /> {t("onboarding.advanced.ciscoLegacy")}</label><p>{t("onboarding.advanced.ciscoWarning")}</p></details>}
        <div className="button-row"><button className="secondary-button" type="button" onClick={() => setStep(1)}><ChevronLeft aria-hidden="true" />{t("common.back")}</button><WorkflowPrimaryAction busy={busy === "test"} busyLabel={t("onboarding.actions.testing")} disabled={busy === "test"} onClick={() => void runTest()} icon={<Network aria-hidden="true" />}>{t("onboarding.actions.test")}</WorkflowPrimaryAction><button className="secondary-button" type="button" disabled={Boolean(busy)} onClick={() => void skipTest()}>{t("onboarding.actions.skip")}</button></div>
      </section>}

      {step === 3 && <section className="content-panel onboarding-form">
        <h2>{t("onboarding.step3.title")}</h2>
        <WorkflowReviewSummary title={t("workflowLab.reviewTitle")} items={[
          { id: "name", label: t("onboarding.fields.name"), value: activeForm.name },
          { id: "vendor", label: t("onboarding.result.vendorPlatform"), value: `${activeForm.vendor} / ${activeForm.platform || "auto-detect"}`, technical: true },
          { id: "management", label: t("onboarding.result.management"), value: `${activeForm.host}:${activeForm.managementPort}`, technical: true },
          { id: "credential", label: t("onboarding.fields.credential"), value: selectedCredential?.name ?? (activeForm.credentialId ? t("onboarding.credentials.storedSelected") : t("onboarding.credentials.notSelected")) },
          { id: "connection", label: t("onboarding.result.connection"), value: statusText(session, t) },
          { id: "inventory", label: t("onboarding.result.inventory"), value: verified ? t("onboarding.result.verified") : t("onboarding.result.unverified") }
        ]} />
        {connectionFailed || unverifiedResult ? <WorkflowStateCallout tone="warning" title={t("onboarding.status.notVerified")} message={t("onboarding.messages.unverifiedWarning")} meta={<span dir="ltr">verificationStatus === "unverified" ? connectorInvoked === false</span>} /> : null}
        <div className="button-row"><button className="secondary-button" type="button" onClick={() => setStep(2)}><ChevronLeft aria-hidden="true" />{t("common.back")}</button><WorkflowPrimaryAction busy={busy === "register"} busyLabel={t("onboarding.actions.registering")} disabled={busy === "register"} onClick={() => void register()} icon={verified ? <CheckCircle2 aria-hidden="true" /> : <ShieldAlert aria-hidden="true" />}>{verified ? t("onboarding.actions.registerVerified") : t("onboarding.actions.registerUnverified")}</WorkflowPrimaryAction></div>
      </section>}
    </section>
  );
}
