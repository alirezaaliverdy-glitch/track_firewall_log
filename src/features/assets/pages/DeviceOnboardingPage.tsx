import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Link, useNavigate } from "react-router-dom";
import { Cable, CheckCircle2, ChevronLeft, CircleCheck, KeyRound, LockKeyhole, Network, RadioTower, Router, Server, Shield, ShieldAlert, ShieldCheck, Sparkles, Wifi } from "lucide-react";
import type { RouteComponentProps } from "@/routes/appRoutes";
import { PageHeader } from "@/components/ui/PageHeader";
import { WorkflowPrimaryAction, WorkflowReviewSummary, WorkflowStateCallout, WorkflowStepper, type WorkflowStepStatus } from "@/components/workflows";
import { createCredential, listCredentials, type CredentialInput, type DeviceCredential } from "@/lib/credentials";
import { nextAvailableCredentialName } from "@/lib/credentialNames";
import { ACTIVE_COMPANY_STORAGE_KEY, listCompanies, type Company } from "@/lib/companies";
import { listConnectionProfiles, onboardingProtocol, type VendorConnectionMethod, type VendorConnectionProfile } from "@/lib/connectionMethods";
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
import "./DeviceOnboardingPage.css";

const platforms: Record<OnboardingDraft["vendor"], string> = {
  linux: "linux",
  cisco: "cisco-ios-xe",
  fortigate: "fortios",
  mikrotik: "routeros",
  sophos: "sophos-sfos"
};

const emptyCredential: CredentialInput = { name: "", type: "password", username: "", password: "", privateKey: "", passphrase: "", sudo: false };
const stepKeys = ["onboarding.steps.identity", "onboarding.steps.credential", "onboarding.steps.review"];

type Step = 1 | 2 | 3;
type InvalidField = "name" | "host" | "port" | null;
type ConflictState = { route?: string; existingDeviceId?: string };

const vendorChoices = [
  { key: "linux", title: "Linux", icon: Server, tone: "cyan", descriptionKey: "onboarding.vendor.linux" },
  { key: "cisco", title: "Cisco", icon: Router, tone: "violet", descriptionKey: "onboarding.vendor.cisco" },
  { key: "fortigate", title: "FortiGate", icon: Shield, tone: "rose", descriptionKey: "onboarding.vendor.fortigate" },
  { key: "mikrotik", title: "MikroTik", icon: Wifi, tone: "amber", descriptionKey: "onboarding.vendor.mikrotik" },
  { key: "sophos", title: "Sophos Firewall", icon: ShieldCheck, tone: "emerald", descriptionKey: "onboarding.vendor.sophos" },
] as const;

function initialVendor(params: Record<string, string>) {
  const query = new URLSearchParams(window.location.search).get("vendor");
  const value = (params.vendorKey || query || "linux").toLowerCase();
  return (["linux", "cisco", "fortigate", "mikrotik", "sophos"].includes(value) ? value : "linux") as OnboardingDraft["vendor"];
}

function statusText(session: OnboardingSession | null, t: TFunction) {
  if (!session?.test) return t("onboarding.status.notTested");
  if (session.test.connected === true && session.test.connectorInvoked === true) return t("onboarding.status.verified");
  return String(session.test.error ?? session.result?.verificationStatus ?? t("onboarding.status.notVerified"));
}

function mappedError(failure: unknown, fallbackKey: string, t: TFunction, isFa = true) {
  if (failure instanceof OnboardingApiError) {
    const code = failure.code ?? "";
    const message = failure.message.toLowerCase();
    let key = "onboarding.errors.generic";
    if (code.includes("NEGOTIATION") || /algorithm negotiation|no matching.*algorithm/.test(message)) {
      return {
        message: isFa ? "این Cisco از الگوریتم SSH قدیمی استفاده می‌کند. سازگاری Cisco را فعال و اتصال را دوباره تست کنید." : "This Cisco device uses legacy SSH algorithms. Enable Cisco compatibility and test the connection again.",
        diagnostic: `${failure.code ?? failure.status}: ${failure.message}`
      };
    }
    if (code.includes("DEVICE_MANAGEMENT_IP_CONFLICT") || code.includes("CONFLICT")) key = "onboarding.errors.managementIpConflict";
    else if (code.includes("DUPLICATE")) key = "onboarding.errors.duplicate";
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
  const { t, i18n } = useTranslation();
  const isFa = i18n.resolvedLanguage?.startsWith("fa") ?? true;
  const isEditing = Boolean(params.deviceId);
  const started = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const hostInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>(1);
  const [session, setSession] = useState<OnboardingSession | null>(null);
  const [form, setForm] = useState<OnboardingDraft | null>(null);
  const [credentials, setCredentials] = useState<DeviceCredential[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [connectionProfiles, setConnectionProfiles] = useState<VendorConnectionProfile[]>([]);
  const [credentialMode, setCredentialMode] = useState<"existing" | "new">("existing");
  const [credentialForm, setCredentialForm] = useState<CredentialInput>(emptyCredential);
  const [enableSecret, setEnableSecret] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [diagnostic, setDiagnostic] = useState("");
  const [invalidField, setInvalidField] = useState<InvalidField>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const vendor = initialVendor({ vendorKey: params.vendorKey ?? "" });
    Promise.all([listCompanies("active"), listCredentials(), listConnectionProfiles()]).then(async ([companyRows, refs, profiles]) => {
      const storedCompanyId = localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY) ?? "";
      const initialCompanyId = companyRows.some((company) => company.id === storedCompanyId) ? storedCompanyId : companyRows[0]?.id ?? "";
      if (!params.deviceId && !initialCompanyId) throw new Error("برای ثبت دستگاه ابتدا یک شرکت در بخش دارایی‌ها تعریف کنید.");
      const next = await startOnboarding({ vendor, platform: platforms[vendor], deviceId: params.deviceId || undefined, ...(!params.deviceId ? { companyId: initialCompanyId } : {}) });
      setCompanies(companyRows);
      setConnectionProfiles(profiles);
      setSession(next);
      setForm({ ...next.draft, platform: next.draft.platform || platforms[vendor] });
      setCredentials(refs);
      setCredentialMode(refs.length ? "existing" : "new");
    }).catch((failure: unknown) => {
      const next = mappedError(failure, "onboarding.errors.generic", t, isFa);
      setError(next.message);
      setDiagnostic(next.diagnostic);
    });
  }, [isFa, params.deviceId, params.vendorKey, t]);

  const selectedCredential = useMemo(() => credentials.find((item) => item.id === form?.credentialId) ?? null, [credentials, form?.credentialId]);
  const verified = session?.test?.connected === true && session.test.connectorInvoked === true && session.status === "preview_ready";
  const unverifiedResult = session?.result?.verificationStatus === "unverified" && session.result.connectorInvoked === false;
  const connectionFailed = Boolean(session?.test && !verified);

  if (!form || !session) {
    return <section className="page-stack"><PageHeader title={t("onboarding.title.register")} eyebrow={t("onboarding.eyebrow")} /><div className="state-card">{t("onboarding.loading")}</div>{error ? <div className="state-card is-error">{error}</div> : null}</section>;
  }

  const activeForm = form;
  const activeSession = session;
  const change = <K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]) => {
    setForm((current) => current ? { ...current, [key]: value } : current);
    if (["companyId", "host", "managementPort", "credentialId", "enableCredentialId", "ciscoLegacyCompatibilityApproved"].includes(key)) {
      setSession((current) => current ? { ...current, status: "draft", test: null, detection: null, discovery: null, preview: null } : current);
      setMessage("");
    }
  };

  function selectVendor(vendor: OnboardingDraft["vendor"]) {
    const profile = connectionProfiles.find((item) => item.vendor === vendor);
    const method = profile?.methods.find((item) => item.selectable && item.readiness === "ready" && item.recommended)
      ?? profile?.methods.find((item) => item.selectable && item.readiness === "ready");
    const connectionMethod = method ? onboardingProtocol(method) : vendor === "sophos" ? "api" : "ssh";
    const managementPort = method?.defaultPort ?? (connectionMethod === "api" ? (vendor === "sophos" ? 4444 : 443) : 22);
    setForm({
      ...activeForm,
      vendor,
      platform: platforms[vendor],
      connectionMethod,
      managementPort,
      enableCredentialId: vendor === "cisco" ? activeForm.enableCredentialId : "",
      ciscoLegacyCompatibilityApproved: false
    });
    setSession((current) => current ? { ...current, status: "draft", test: null, detection: null, discovery: null, preview: null } : current);
    setMessage(""); setError(""); setDiagnostic("");
  }

  function selectConnectionMethod(method: VendorConnectionMethod) {
    if (!method.selectable || method.readiness !== "ready") return;
    const connectionMethod = onboardingProtocol(method);
    setForm({ ...activeForm, connectionMethod, managementPort: method.defaultPort ?? activeForm.managementPort });
    setSession((current) => current ? { ...current, status: "draft", test: null, detection: null, discovery: null, preview: null } : current);
    setMessage(""); setError(""); setDiagnostic("");
  }

  function validateIdentity(candidate: OnboardingDraft = activeForm) {
    if (!candidate.companyId.trim()) { setError("انتخاب شرکت الزامی است."); return false; }
    if (!candidate.name.trim()) { setError(t("onboarding.errors.nameRequired")); setInvalidField("name"); nameInput.current?.focus(); return false; }
    if (!candidate.host.trim()) { setError(t("onboarding.errors.hostRequired")); setInvalidField("host"); hostInput.current?.focus(); return false; }
    if (!Number.isInteger(candidate.managementPort) || candidate.managementPort < 1 || candidate.managementPort > 65535) { setError(t("onboarding.errors.portRange")); setInvalidField("port"); return false; }
    setError(""); setDiagnostic(""); setInvalidField(null); setConflict(null);
    return true;
  }

  async function ensureCredential() {
    if (credentialMode === "existing") return { credentialId: activeForm.credentialId, enableCredentialId: activeForm.enableCredentialId ?? "" };
    if (!credentialForm.name.trim() || !credentialForm.username.trim()) throw new Error(t("onboarding.errors.credentialFields"));
    const credentialName = nextAvailableCredentialName(credentialForm.name, credentials.map((item) => item.name));
    const created = await createCredential({ ...credentialForm, name: credentialName });
    let enableCredentialId = activeForm.enableCredentialId ?? "";
    if (activeForm.vendor === "cisco" && enableSecret.trim()) {
      const enableName = nextAvailableCredentialName(`${credentialName} enable`, [created.name, ...credentials.map((item) => item.name)]);
      const enable = await createCredential({ name: enableName, type: "password", username: credentialForm.username, password: enableSecret, sudo: false });
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

  async function saveAnswersForTest(candidate: OnboardingDraft = activeForm) {
    if (!validateIdentity(candidate)) return null;
    const credential = await ensureCredential();
    if (!credential.credentialId) throw new Error(t("onboarding.errors.credentialRequired"));
    const draft: OnboardingDraft = { ...candidate, credentialId: credential.credentialId, enableCredentialId: credential.enableCredentialId, platform: candidate.platform || platforms[candidate.vendor] };
    setForm(draft);
    return answerOnboarding(activeSession.id, draft);
  }

  async function runTest(candidate: OnboardingDraft = activeForm) {
    setBusy("test"); setError(""); setMessage(""); setDiagnostic(""); setConflict(null);
    try {
      let next = await saveAnswersForTest(candidate);
      if (!next) return;
      next = await testOnboarding(next.id);
      if (next.test?.connected === true && next.test.connectorInvoked === true) {
        next = await detectOnboarding(next.id);
        if (next.detection && (next.detection as Record<string, unknown>).supported === true) {
          next = await discoverOnboarding(next.id);
          next = await previewOnboarding(next.id);
          setMessage(t("onboarding.messages.verified"));
        } else {
          setMessage(t("onboarding.messages.platformUnsupported"));
        }
      } else {
        setMessage(t("onboarding.messages.notVerified"));
      }
      setSession(next); setForm(next.draft); setStep(3);
    } catch (failure) {
      const nextError = mappedError(failure, "onboarding.errors.connectionFailed", t, isFa);
      setError(nextError.message);
      setDiagnostic(nextError.diagnostic);
      await getOnboarding(activeSession.id).then((current) => { setSession(current); setForm(current.draft); setStep(current.test?.connectorInvoked === true ? 3 : 2); }).catch(() => undefined);
    } finally { setBusy(""); }
  }

  function retryCiscoWithCompatibility() {
    const candidate = { ...activeForm, ciscoLegacyCompatibilityApproved: true };
    setForm(candidate);
    void runTest(candidate);
  }

  async function skipTest() {
    if (!validateIdentity()) return;
    setStep(3);
    setMessage(t("onboarding.messages.skip"));
  }

  async function register() {
    setBusy("register"); setError(""); setDiagnostic(""); setConflict(null);
    try {
      const next = verified ? await commitOnboarding(activeSession.id) : await registerUnverifiedOnboarding(activeSession.id, activeForm);
      setSession(next); setForm(next.draft);
      if (next.result?.route) navigate(next.result.route, { replace: true });
    } catch (failure) {
      const nextError = mappedError(failure, "onboarding.errors.registrationFailed", t, isFa);
      setError(nextError.message);
      if (failure instanceof OnboardingApiError && failure.code === "DEVICE_MANAGEMENT_IP_CONFLICT") setConflict({ route: failure.route, existingDeviceId: failure.existingDeviceId });
      setDiagnostic(nextError.diagnostic);
    } finally { setBusy(""); }
  }

  const steps = stepKeys.map((key, index) => ({ id: key, label: t(key), status: stepStatus(step, index, connectionFailed) }));
  const selectedVendorChoice = vendorChoices.find((item) => item.key === activeForm.vendor) ?? vendorChoices[0];
  const SelectedVendorIcon = selectedVendorChoice.icon;
  const selectedConnectionProfile = connectionProfiles.find((item) => item.vendor === activeForm.vendor) ?? null;
  const primaryMethods = selectedConnectionProfile?.methods.filter((item) => item.selectable && item.readiness === "ready") ?? [];
  const companionMethods = selectedConnectionProfile?.methods.filter((item) => !item.selectable) ?? [];
  const selectedConnectionMethod = primaryMethods.find((item) => onboardingProtocol(item) === activeForm.connectionMethod && item.defaultPort === activeForm.managementPort)
    ?? primaryMethods.find((item) => onboardingProtocol(item) === activeForm.connectionMethod)
    ?? primaryMethods[0];
  const legacyRescueAvailable = activeForm.vendor === "cisco"
    && activeForm.ciscoLegacyCompatibilityApproved !== true
    && diagnostic.includes("CISCO_SSH_NEGOTIATION_FAILED");

  return (
    <section className="page-stack device-onboarding-simple device-onboarding-experience">
      <PageHeader title={isEditing ? t("onboarding.title.update") : t("onboarding.title.register")} eyebrow={t("onboarding.eyebrow")} description={isEditing ? (isFa ? "مشخصات اتصال را اصلاح، دوباره تست و سپس تغییرات را ذخیره کنید." : "Update the connection, test it again, then save the changes.") : t("onboarding.description")} actions={<Link className="secondary-link" to="/assets/devices">{t("onboarding.backToDevices")}</Link>} />
      <div className="onboarding-experience-layout">
        <aside className="onboarding-guide">
          <div className="onboarding-guide__badge"><Sparkles size={16} />{t("onboarding.guide.badge")}</div>
          <h2>{t("onboarding.guide.title")}</h2>
          <p>{t("onboarding.guide.description")}</p>
          <ol>
            {stepKeys.map((key, index) => <li key={key} className={step === index + 1 ? "is-current" : step > index + 1 ? "is-complete" : ""}><span>{step > index + 1 ? <CircleCheck size={15} /> : index + 1}</span><div><strong>{t(key)}</strong><small>{t(`onboarding.guide.step${index + 1}`)}</small></div></li>)}
          </ol>
          <div className={`onboarding-selected-vendor onboarding-selected-vendor--${selectedVendorChoice.tone}`}>
            <span><SelectedVendorIcon size={22} /></span>
            <div><small>{t("onboarding.guide.selectedVendor")}</small><strong>{selectedVendorChoice.title}</strong><b dir="ltr">{activeForm.host ? `${activeForm.host}:${activeForm.managementPort}` : `${activeForm.connectionMethod.toUpperCase()} · ${activeForm.managementPort}`}</b></div>
          </div>
          <div className="onboarding-trust-note"><LockKeyhole size={17} /><span>{t("onboarding.guide.security")}</span></div>
        </aside>

        <main className="onboarding-workflow-card">
          <WorkflowStepper steps={steps} ariaLabel={t("onboarding.steps.label")} />
          <div className="onboarding-context-bar">
            <div><span className={`onboarding-context-bar__icon onboarding-selected-vendor--${selectedVendorChoice.tone}`}><SelectedVendorIcon size={18} /></span><span><small>{isEditing ? (isFa ? "در حال ویرایش دستگاه" : "Editing device") : (isFa ? "دستگاه جدید" : "New device")}</small><strong>{activeForm.name || selectedVendorChoice.title}</strong><b dir="ltr">{activeForm.host ? `${activeForm.host}:${activeForm.managementPort}` : "—"}</b></span></div>
            <nav aria-label={isFa ? "رفتن به مرحله" : "Go to step"}>{step > 1 ? <button type="button" onClick={() => setStep(1)}>{isFa ? "مشخصات" : "Identity"}</button> : null}{step > 2 ? <button type="button" onClick={() => setStep(2)}>{isFa ? "اتصال و تست" : "Connection"}</button> : null}</nav>
          </div>
          {error ? <div role="alert" className="state-card is-error onboarding-feedback"><span>{error}</span>{legacyRescueAvailable ? <button className="primary-button" type="button" disabled={busy === "test"} onClick={retryCiscoWithCompatibility}>{isFa ? "فعال‌سازی سازگاری Cisco و تست دوباره" : "Enable Cisco compatibility and retry"}</button> : null}</div> : null}
          {conflict ? <div className="state-card onboarding-feedback" role="group" aria-label={t("onboarding.conflict.title")}><strong>{t("onboarding.conflict.title")}</strong><p>{t("onboarding.conflict.message")}</p><div className="button-row">{conflict.route ? <button className="primary-button" type="button" onClick={() => navigate(conflict.route!)}>{t("onboarding.conflict.openExisting")}</button> : null}<button className="secondary-button" type="button" onClick={() => { setStep(1); setConflict(null); hostInput.current?.focus(); }}>{t("onboarding.conflict.editAddress")}</button><button className="secondary-button" type="button" onClick={() => setConflict(null)}>{t("onboarding.conflict.cancel")}</button></div></div> : null}
          {diagnostic ? <details className="advanced-section onboarding-feedback"><summary>{t("onboarding.advanced.diagnostics")}</summary><p dir="ltr">{diagnostic}</p></details> : null}
          {message ? <WorkflowStateCallout tone={verified ? "success" : "warning"} title={verified ? t("onboarding.status.verified") : t("onboarding.status.notVerified")} message={message} /> : null}

          {step === 1 && <section className="onboarding-stage onboarding-stage--identity" data-testid="onboarding-step-identity">
            <header className="onboarding-stage__heading"><span><Server size={21} /></span><div><small>{t("onboarding.stage.step", { current: 1, total: 3 })}</small><h2>{t("onboarding.step1.title")}</h2><p>{t("onboarding.step1.description")}</p></div></header>
            <fieldset className="onboarding-vendor-fieldset"><legend>{t("onboarding.fields.vendor")}</legend><p>{t("onboarding.vendor.help")}</p><div className="onboarding-vendor-grid" role="radiogroup" aria-label={t("onboarding.fields.vendor")}>
              {vendorChoices.map((item) => { const Icon = item.icon; const selected = activeForm.vendor === item.key; return <button key={item.key} type="button" role="radio" aria-checked={selected} className={`onboarding-vendor-choice onboarding-vendor-choice--${item.tone}`} onClick={() => selectVendor(item.key)}><span className="onboarding-vendor-choice__icon"><Icon size={22} /></span><span><strong>{item.title}</strong><small>{t(item.descriptionKey)}</small></span>{selected ? <CircleCheck className="onboarding-vendor-choice__check" size={18} /> : null}</button>; })}
            </div></fieldset>
            {selectedConnectionProfile ? <fieldset className="onboarding-method-fieldset"><legend>{isFa ? "روش اتصال مدیریتی" : "Management connection"}</legend><p>{isFa ? selectedConnectionProfile.strategyFa : selectedConnectionProfile.strategy}</p><div className="onboarding-method-grid" role="radiogroup" aria-label={isFa ? "روش اتصال مدیریتی" : "Management connection method"}>
              {primaryMethods.map((method) => { const selected = selectedConnectionMethod?.key === method.key; return <button key={method.key} type="button" role="radio" aria-checked={selected} className={`onboarding-method-card ${selected ? "is-selected" : ""}`} onClick={() => selectConnectionMethod(method)}><span className="onboarding-method-card__icon">{method.key === "ssh" ? <Cable size={20} /> : <Network size={20} />}</span><span><strong>{isFa ? method.titleFa : method.title}{method.recommended ? <b>{isFa ? "پیشنهادی" : "Recommended"}</b> : null}</strong><small>{isFa ? method.summaryFa : method.summary}</small><em dir="ltr">{method.defaultPort ? `TCP ${method.defaultPort}` : "Auto"}</em></span>{selected ? <CircleCheck size={19} /> : null}</button>; })}
            </div>{selectedConnectionMethod ? <div className="onboarding-method-requirements"><ShieldCheck size={17} /><span><strong>{isFa ? "پیش‌نیاز اتصال" : "Connection prerequisites"}</strong><small>{(isFa ? selectedConnectionMethod.prerequisitesFa : selectedConnectionMethod.prerequisites).join(" • ")}</small></span></div> : null}</fieldset> : null}
            <div className="onboarding-field-grid">
              <label className="onboarding-field onboarding-field--wide"><span>شرکت مالک دستگاه<b>{t("onboarding.required")}</b></span><select value={activeForm.companyId} onChange={(event) => { change("companyId", event.target.value); localStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, event.target.value); }}><option value="">انتخاب شرکت</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name} — {company.code}</option>)}</select><small>این دستگاه و همه اطلاعات جمع‌آوری‌شده فقط در دارایی‌های همین شرکت نمایش داده می‌شود.</small></label>
              <label className="onboarding-field"><span>{t("onboarding.fields.name")}<b>{t("onboarding.required")}</b></span><input ref={nameInput} value={activeForm.name} onChange={(event) => change("name", event.target.value)} placeholder={t("onboarding.placeholders.name")} aria-invalid={invalidField === "name"} /><small>{t("onboarding.help.name")}</small></label>
              <label className="onboarding-field"><span>{t("onboarding.fields.management")}<b>{t("onboarding.required")}</b></span><input ref={hostInput} value={activeForm.host} onChange={(event) => change("host", event.target.value)} dir="ltr" placeholder={t("onboarding.placeholders.host")} aria-invalid={invalidField === "host"} /><small>{activeForm.vendor === "sophos" ? (isFa ? "آدرس مدیریتی Sophos Firewall؛ دسترسی API باید برای IP سرور برنامه مجاز باشد." : "Sophos management address; API access must allow the application server IP.") : t("onboarding.help.management")}</small></label>
              <label className="onboarding-field onboarding-field--port"><span>{t("onboarding.fields.port")}<b>{t("onboarding.required")}</b></span><input type="number" min="1" max="65535" value={activeForm.managementPort} onChange={(event) => change("managementPort", Number(event.target.value))} aria-invalid={invalidField === "port"} dir="ltr" /><small>{t("onboarding.help.port")}</small></label>
              <div className="onboarding-field onboarding-platform-preview"><span>{t("onboarding.fields.platform")}</span><div><Sparkles size={16} /><strong dir="ltr">{activeForm.platform || platforms[activeForm.vendor]}</strong></div><small>{t("onboarding.platform.auto")}</small></div>
            </div>
            <footer className="onboarding-stage__actions"><span>{t("onboarding.step1.footer")}</span><button className="primary-button" type="button" onClick={() => validateIdentity() && setStep(2)}>{t("common.continue")}<ChevronLeft aria-hidden="true" /></button></footer>
          </section>}

          {step === 2 && <section className="onboarding-stage onboarding-stage--credential" data-testid="onboarding-step-credential">
            <header className="onboarding-stage__heading"><span><KeyRound size={21} /></span><div><small>{t("onboarding.stage.step", { current: 2, total: 3 })}</small><h2>{t("onboarding.step2.title")}</h2><p>{t("onboarding.step2.description")}</p></div></header>
            <div className="onboarding-credential-modes" role="tablist"><button type="button" aria-pressed={credentialMode === "existing"} onClick={() => setCredentialMode("existing")}><LockKeyhole size={18} /><span><strong>{t("onboarding.credentials.existing")}</strong><small>{t("onboarding.credentials.existingHelp")}</small></span></button><button type="button" aria-pressed={credentialMode === "new"} onClick={() => setCredentialMode("new")}><KeyRound size={18} /><span><strong>{t("onboarding.credentials.new")}</strong><small>{t("onboarding.credentials.newHelp")}</small></span></button></div>
            {credentialMode === "existing" ? <label className="onboarding-field onboarding-field--wide"><span>{t("onboarding.fields.credential")}<b>{t("onboarding.required")}</b></span><select value={activeForm.credentialId} onChange={(event) => change("credentialId", event.target.value)}><option value="">{t("onboarding.credentials.choose")}</option>{credentials.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.username}</option>)}</select><small>{credentials.length ? t("onboarding.credentials.safeReference") : t("onboarding.credentials.empty")}</small></label> : <div className="onboarding-field-grid onboarding-new-credential"><label className="onboarding-field"><span>{t("onboarding.fields.credentialName")}</span><input value={credentialForm.name} onChange={(event) => setCredentialForm({ ...credentialForm, name: event.target.value })} /></label><label className="onboarding-field"><span>{t("onboarding.fields.username")}</span><input autoComplete="username" value={credentialForm.username} onChange={(event) => setCredentialForm({ ...credentialForm, username: event.target.value })} /></label><label className="onboarding-field"><span>{t("onboarding.fields.credentialType")}</span><select value={credentialForm.type} onChange={(event) => setCredentialForm({ ...credentialForm, type: event.target.value as CredentialInput["type"] })}><option value="password">{t("onboarding.fields.password")}</option><option value="private_key">{t("onboarding.fields.privateKey")}</option></select></label>{credentialForm.type === "password" ? <label className="onboarding-field"><span>{t("onboarding.fields.password")}</span><input type="password" autoComplete="new-password" value={credentialForm.password ?? ""} onChange={(event) => setCredentialForm({ ...credentialForm, password: event.target.value })} /></label> : <><label className="onboarding-field onboarding-field--wide"><span>{t("onboarding.fields.privateKey")}</span><textarea value={credentialForm.privateKey ?? ""} onChange={(event) => setCredentialForm({ ...credentialForm, privateKey: event.target.value })} /></label><label className="onboarding-field"><span>{t("onboarding.fields.passphrase")}</span><input type="password" autoComplete="new-password" value={credentialForm.passphrase ?? ""} onChange={(event) => setCredentialForm({ ...credentialForm, passphrase: event.target.value })} /></label></>} {activeForm.vendor === "cisco" ? <label className="onboarding-field"><span>{t("onboarding.fields.enableSecret")}</span><input type="password" autoComplete="new-password" value={enableSecret} onChange={(event) => setEnableSecret(event.target.value)} /></label> : null}</div>}
            <div className="onboarding-credential-manager-link"><span><KeyRound size={17} />{isFa ? "نیاز به تغییر یا حذف اعتبارنامه ذخیره‌شده دارید؟" : "Need to edit or delete a stored credential?"}</span><Link to="/settings?tab=credentials">{isFa ? "مدیریت اعتبارنامه‌ها" : "Manage credentials"}</Link></div>
            {activeForm.vendor === "cisco" ? <section className={`onboarding-cisco-compatibility ${activeForm.ciscoLegacyCompatibilityApproved ? "is-enabled" : ""}`}><div><ShieldAlert size={20} /><span><strong>{t("onboarding.advanced.ciscoTitle")}</strong><small>{t("onboarding.advanced.ciscoWarning")}</small></span></div><label className="warning-check"><input type="checkbox" checked={activeForm.ciscoLegacyCompatibilityApproved === true} onChange={(event) => change("ciscoLegacyCompatibilityApproved", event.target.checked)} /><span>{t("onboarding.advanced.ciscoLegacy")}</span></label></section> : null}
            {companionMethods.length ? <section className="onboarding-companion-methods"><header><RadioTower size={19} /><span><strong>{isFa ? "کانال‌های تکمیلی پایش" : "Companion monitoring channels"}</strong><small>{isFa ? "این کانال‌ها جای اتصال مدیریتی را نمی‌گیرند و پس از ثبت دستگاه فعال می‌شوند." : "These channels complement, rather than replace, the management connection."}</small></span></header><div>{companionMethods.map((method) => <article key={method.key}><span><strong>{isFa ? method.titleFa : method.title}</strong><small>{isFa ? method.summaryFa : method.summary}</small></span><b className={`is-${method.readiness}`}>{method.readiness === "ready" ? (isFa ? "آماده" : "Ready") : method.readiness === "planned" ? (isFa ? "در نقشه راه" : "Planned") : (isFa ? "نیازمند تنظیم" : "Setup required")}</b></article>)}</div></section> : null}
            <div className="onboarding-connection-preview"><span className={`onboarding-connection-preview__icon onboarding-selected-vendor--${selectedVendorChoice.tone}`}><Network size={20} /></span><div><small>{t("onboarding.connection.target")}</small><strong dir="ltr">{activeForm.host}:{activeForm.managementPort}</strong><span>{selectedVendorChoice.title} · {activeForm.connectionMethod.toUpperCase()} · {t("onboarding.connection.readOnly")}</span></div></div>
            <footer className="onboarding-stage__actions onboarding-stage__actions--split"><button className="secondary-button" type="button" onClick={() => setStep(1)}><ChevronLeft aria-hidden="true" />{t("common.back")}</button><div><button className="onboarding-skip-button" type="button" disabled={Boolean(busy)} onClick={() => void skipTest()}>{t("onboarding.actions.skip")}</button><WorkflowPrimaryAction busy={busy === "test"} busyLabel={t("onboarding.actions.testing")} disabled={busy === "test"} onClick={() => void runTest()} icon={<Network aria-hidden="true" />}>{t("onboarding.actions.test")}</WorkflowPrimaryAction></div></footer>
          </section>}

          {step === 3 && <section className="onboarding-stage onboarding-stage--review" data-testid="onboarding-step-review">
            <header className="onboarding-stage__heading"><span>{verified ? <CheckCircle2 size={21} /> : <ShieldAlert size={21} />}</span><div><small>{t("onboarding.stage.step", { current: 3, total: 3 })}</small><h2>{t("onboarding.step3.title")}</h2><p>{t("onboarding.step3.description")}</p></div></header>
            <div className={`onboarding-result-hero ${verified ? "is-verified" : "is-unverified"}`}><span>{verified ? <CheckCircle2 size={27} /> : <ShieldAlert size={27} />}</span><div><strong>{verified ? t("onboarding.status.verified") : t("onboarding.status.notVerified")}</strong><p>{verified ? t("onboarding.messages.verified") : t("onboarding.messages.unverifiedWarning")}</p></div></div>
            <WorkflowReviewSummary title={t("workflowLab.reviewTitle")} items={[
              { id: "company", label: "شرکت", value: companies.find((company) => company.id === activeForm.companyId)?.name ?? "—" },
              { id: "name", label: t("onboarding.fields.name"), value: activeForm.name },
              { id: "vendor", label: t("onboarding.result.vendorPlatform"), value: `${activeForm.vendor} / ${activeForm.platform || "auto-detect"}`, technical: true },
              { id: "management", label: t("onboarding.result.management"), value: `${activeForm.host}:${activeForm.managementPort}`, technical: true },
              { id: "credential", label: t("onboarding.fields.credential"), value: selectedCredential?.name ?? (activeForm.credentialId ? t("onboarding.credentials.storedSelected") : t("onboarding.credentials.notSelected")) },
              { id: "connection", label: t("onboarding.result.connection"), value: statusText(session, t) },
              { id: "inventory", label: t("onboarding.result.inventory"), value: verified ? t("onboarding.result.verified") : t("onboarding.result.unverified") }
            ]} />
            {connectionFailed || unverifiedResult ? <WorkflowStateCallout tone="warning" title={t("onboarding.status.notVerified")} message={t("onboarding.messages.unverifiedWarning")} meta={<span>{t("onboarding.messages.unverifiedMeta")}</span>} /> : null}
            <footer className="onboarding-stage__actions onboarding-stage__actions--split"><button className="secondary-button" type="button" onClick={() => setStep(2)}><ChevronLeft aria-hidden="true" />{t("common.back")}</button><WorkflowPrimaryAction busy={busy === "register"} busyLabel={isEditing ? (isFa ? "در حال ذخیره..." : "Saving...") : t("onboarding.actions.registering")} disabled={busy === "register"} onClick={() => void register()} icon={verified ? <CheckCircle2 aria-hidden="true" /> : <ShieldAlert aria-hidden="true" />}>{isEditing ? (isFa ? "ذخیره تغییرات دستگاه" : "Save device changes") : verified ? t("onboarding.actions.registerVerified") : t("onboarding.actions.registerUnverified")}</WorkflowPrimaryAction></footer>
          </section>}
        </main>
      </div>
    </section>
  );
}
