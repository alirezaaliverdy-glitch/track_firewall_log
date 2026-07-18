import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { RouteComponentProps } from "@/routes/appRoutes";
import { PageHeader } from "@/components/ui/PageHeader";
import { createCredential, listCredentials, type CredentialInput, type DeviceCredential } from "@/lib/credentials";
import {
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

type Step = 1 | 2 | 3;

function initialVendor(params: Record<string, string>) {
  const query = new URLSearchParams(window.location.search).get("vendor");
  const value = (params.vendorKey || query || "linux").toLowerCase();
  return (["linux", "cisco", "fortigate", "mikrotik"].includes(value) ? value : "linux") as OnboardingDraft["vendor"];
}

function statusText(session: OnboardingSession | null) {
  if (!session?.test) return "Not tested yet";
  if (session.test.connected === true && session.test.connectorInvoked === true) return "Connection verified";
  return String(session.test.error ?? session.result?.verificationStatus ?? "Connection not verified");
}

export default function DeviceOnboardingPage({ params }: RouteComponentProps) {
  const navigate = useNavigate();
  const started = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
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
    }).catch((failure: Error) => setError(failure.message));
  }, [params.deviceId, params.vendorKey]);

  const selectedCredential = useMemo(() => credentials.find((item) => item.id === form?.credentialId) ?? null, [credentials, form?.credentialId]);
  const verified = session?.test?.connected === true && session.test.connectorInvoked === true && session.status === "preview_ready";
  const connectionFailed = Boolean(session?.test && !verified);

  if (!form || !session) {
    return <section className="page-stack"><PageHeader title="Register device" eyebrow="Device onboarding" /><div className="state-card">Preparing guided registration...</div>{error ? <div className="state-card is-error">{error}</div> : null}</section>;
  }

  const activeForm = form;
  const activeSession = session;
  const change = <K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]) => setForm((current) => current ? { ...current, [key]: value } : current);

  function validateIdentity() {
    if (!activeForm.name.trim()) { setError("Device name is required."); nameInput.current?.focus(); return false; }
    if (!activeForm.host.trim()) { setError("Management IP or hostname is required."); return false; }
    if (!Number.isInteger(activeForm.managementPort) || activeForm.managementPort < 1 || activeForm.managementPort > 65535) { setError("SSH port must be between 1 and 65535."); return false; }
    setError("");
    return true;
  }

  async function ensureCredential() {
    if (credentialMode === "existing") return { credentialId: activeForm.credentialId, enableCredentialId: activeForm.enableCredentialId ?? "" };
    if (!credentialForm.name.trim() || !credentialForm.username.trim()) throw new Error("Credential name and username are required.");
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
    return { credentialId: created.id, enableCredentialId };
  }

  async function saveAnswersForTest() {
    if (!validateIdentity()) return null;
    const credential = await ensureCredential();
    if (!credential.credentialId) throw new Error("Choose or create a credential before testing.");
    const draft: OnboardingDraft = { ...activeForm, credentialId: credential.credentialId, enableCredentialId: credential.enableCredentialId, platform: activeForm.platform || platforms[activeForm.vendor] };
    setForm(draft);
    return answerOnboarding(activeSession.id, draft);
  }

  async function runTest() {
    setBusy("test"); setError(""); setMessage("");
    try {
      let next = await saveAnswersForTest();
      if (!next) return;
      next = await testOnboarding(next.id);
      if (next.test?.connected === true && next.test.connectorInvoked === true) {
        next = await detectOnboarding(next.id);
        next = await discoverOnboarding(next.id);
        next = await previewOnboarding(next.id);
        setMessage("Connection verified. Review and register the device.");
      } else {
        setMessage("Connection was not verified. You can still register it as unverified.");
      }
      setSession(next); setForm(next.draft); setStep(3);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Connection test failed.");
      await getOnboarding(activeSession.id).then((current) => { setSession(current); setForm(current.draft); setStep(3); }).catch(() => undefined);
    } finally { setBusy(""); }
  }

  async function skipTest() {
    if (!validateIdentity()) return;
    setStep(3);
    setMessage("The device will be registered as unverified and will not be marked online.");
  }

  async function register() {
    setBusy("register"); setError("");
    try {
      const next = verified ? await commitOnboarding(activeSession.id) : await registerUnverifiedOnboarding(activeSession.id, activeForm);
      setSession(next); setForm(next.draft);
      if (next.result?.route) navigate(next.result.route, { replace: true });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Registration failed.");
    } finally { setBusy(""); }
  }

  return (
    <section className="page-stack device-onboarding-simple">
      <PageHeader title={params.deviceId ? "Update device connection" : "Register device"} eyebrow="Guided onboarding" description="Three short steps: identity, credential and test, then review." actions={<Link className="secondary-link" to="/assets/devices">Back to equipment</Link>} />

      <ol className="simple-steps" aria-label="Device registration steps">
        {["1. Identity", "2. Credential", "3. Review"].map((label, index) => <li key={label} className={step >= index + 1 ? "is-active" : ""}>{label}</li>)}
      </ol>

      {error ? <div role="alert" className="state-card is-error">{error}</div> : null}
      {message ? <div role="status" className="state-card">{message}</div> : null}

      {step === 1 && <section className="content-panel onboarding-form">
        <h2>Step 1: device identity</h2>
        <div className="form-grid">
          <label>Device name<input ref={nameInput} value={activeForm.name} onChange={(event) => change("name", event.target.value)} placeholder="edge-switch-01" /></label>
          <label>Vendor<select value={activeForm.vendor} onChange={(event) => { const vendor = event.target.value as OnboardingDraft["vendor"]; setForm({ ...activeForm, vendor, platform: platforms[vendor], connectionMethod: "ssh", managementPort: 22 }); }}><option value="linux">Linux</option><option value="cisco">Cisco</option><option value="fortigate">FortiGate</option><option value="mikrotik">MikroTik</option></select></label>
          <label>Management IP or hostname<input value={activeForm.host} onChange={(event) => change("host", event.target.value)} dir="ltr" placeholder="192.0.2.10 or switch.example" /></label>
          <label>SSH port<input type="number" min="1" max="65535" value={activeForm.managementPort} onChange={(event) => change("managementPort", Number(event.target.value))} /></label>
          <label>Platform<select value={activeForm.platform || platforms[activeForm.vendor]} onChange={(event) => change("platform", event.target.value)}><option value={platforms[activeForm.vendor]}>Auto-detect after connection</option></select></label>
        </div>
        <div className="button-row"><button className="primary-button" type="button" onClick={() => validateIdentity() && setStep(2)}>Continue</button></div>
      </section>}

      {step === 2 && <section className="content-panel onboarding-form">
        <h2>Step 2: credential and connection</h2>
        <div className="segmented-control" role="tablist"><button type="button" aria-pressed={credentialMode === "existing"} onClick={() => setCredentialMode("existing")}>Existing credential</button><button type="button" aria-pressed={credentialMode === "new"} onClick={() => setCredentialMode("new")}>Create inline</button></div>
        {credentialMode === "existing" ? <label>Credential<select value={activeForm.credentialId} onChange={(event) => change("credentialId", event.target.value)}><option value="">Choose credential</option>{credentials.map((item) => <option key={item.id} value={item.id}>{item.name} - {item.username}</option>)}</select></label> : <div className="form-grid"><label>Name<input value={credentialForm.name} onChange={(event) => setCredentialForm({ ...credentialForm, name: event.target.value })} /></label><label>Username<input autoComplete="username" value={credentialForm.username} onChange={(event) => setCredentialForm({ ...credentialForm, username: event.target.value })} /></label><label>Type<select value={credentialForm.type} onChange={(event) => setCredentialForm({ ...credentialForm, type: event.target.value as CredentialInput["type"] })}><option value="password">Password</option><option value="private_key">Private key</option></select></label>{credentialForm.type === "password" ? <label>Password<input type="password" autoComplete="new-password" value={credentialForm.password ?? ""} onChange={(event) => setCredentialForm({ ...credentialForm, password: event.target.value })} /></label> : <><label>Private key<textarea value={credentialForm.privateKey ?? ""} onChange={(event) => setCredentialForm({ ...credentialForm, privateKey: event.target.value })} /></label><label>Passphrase<input type="password" autoComplete="new-password" value={credentialForm.passphrase ?? ""} onChange={(event) => setCredentialForm({ ...credentialForm, passphrase: event.target.value })} /></label></>} {activeForm.vendor === "cisco" ? <label>Optional enable secret<input type="password" autoComplete="new-password" value={enableSecret} onChange={(event) => setEnableSecret(event.target.value)} /></label> : null}</div>}
        {activeForm.vendor === "cisco" && <details className="advanced-section"><summary>Advanced</summary><label className="warning-check"><input type="checkbox" checked={activeForm.ciscoLegacyCompatibilityApproved === true} onChange={(event) => change("ciscoLegacyCompatibilityApproved", event.target.checked)} /> Allow legacy Cisco SSH algorithms only for this onboarding session after modern negotiation fails.</label><p>Security warning: this permits older SSH algorithms for this selected Cisco device only. Leave it off unless you approved support for a legacy appliance.</p></details>}
        <div className="button-row"><button className="secondary-button" type="button" onClick={() => setStep(1)}>Back</button><button className="primary-button" type="button" disabled={busy === "test"} onClick={() => void runTest()}>{busy === "test" ? "Testing..." : "Test connection"}</button><button className="secondary-button" type="button" disabled={Boolean(busy)} onClick={() => void skipTest()}>Skip test and register</button></div>
      </section>}

      {step === 3 && <section className="content-panel onboarding-form">
        <h2>Step 3: review</h2>
        <dl className="detail-list"><dt>Name</dt><dd>{activeForm.name}</dd><dt>Vendor / platform</dt><dd>{activeForm.vendor} / {activeForm.platform || "auto-detect"}</dd><dt>Management</dt><dd dir="ltr">{activeForm.host}:{activeForm.managementPort}</dd><dt>Credential</dt><dd>{selectedCredential?.name ?? (activeForm.credentialId ? "Stored credential selected" : "Not selected")}</dd><dt>Connection result</dt><dd>{statusText(session)}</dd><dt>Inventory status after save</dt><dd>{verified ? "Verified device, online after real connector success" : "Unverified device, not marked online"}</dd></dl>
        {connectionFailed ? <div className="state-card is-error">Connection is not verified. Registration will keep the device offline/unknown until a future successful test.</div> : null}
        <div className="button-row"><button className="secondary-button" type="button" onClick={() => setStep(2)}>Back</button><button className="primary-button" type="button" disabled={busy === "register"} onClick={() => void register()}>{busy === "register" ? "Registering..." : verified ? "Register verified device" : "Register unverified device"}</button></div>
      </section>}
    </section>
  );
}
