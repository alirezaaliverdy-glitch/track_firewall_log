import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { listCredentials, type DeviceCredential } from "@/lib/credentials";
import {
  commitDeviceVerification,
  detectOnboarding,
  discoverOnboarding,
  getDeviceVerification,
  retryDeviceVerification,
  startOnboarding,
  testDeviceVerification,
  type DeviceVerification
} from "@/lib/deviceOnboarding";
import { StatusBadge } from "@/components/ui/StatusBadge";

function date(value: string | null, locale: string) {
  return value ? new Date(value).toLocaleString(locale) : "—";
}

export function DeviceVerificationPanel({ deviceId }: { deviceId: string }) {
  const { t, i18n } = useTranslation();
  const isFa = i18n.language?.startsWith("fa") ?? false;
  const locale = isFa ? "fa-IR" : "en-US";
  const [verification, setVerification] = useState<DeviceVerification | null>(null);
  const [credentials, setCredentials] = useState<DeviceCredential[]>([]);
  const [credentialId, setCredentialId] = useState("");
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");

  const copy = isFa ? {
    title: "اتصال و راستی‌آزمایی",
    description: "وضعیت اتصال واقعی این دستگاه، مرجع اعتبارنامه و تاریخچه تلاش‌های Connector.",
    status: "وضعیت راستی‌آزمایی", vendor: "Vendor / Platform", target: "مقصد مدیریت", method: "روش اتصال",
    credential: "مرجع اعتبارنامه", lastAttempt: "آخرین تلاش", lastSuccess: "آخرین موفقیت", connector: "Connector",
    invoked: "Connector اجرا شد", notInvoked: "Connector اجرا نشد", test: "تست اتصال", retry: "تلاش دوباره",
    detect: "تشخیص پلتفرم", discover: "کشف موجودی", verify: "تأیید و ذخیره راستی‌آزمایی", newSession: "شروع جلسه جدید",
    history: "تاریخچه راستی‌آزمایی", replace: "مدیریت اعتبارنامه‌ها", select: "انتخاب اعتبارنامه", noCredential: "بدون اعتبارنامه",
    refresh: "تازه‌سازی", connected: "متصل", failed: "ناموفق", empty: "هنوز تلاشی ثبت نشده است."
  } : {
    title: "Connection & Verification",
    description: "Real connection state, credential reference, and persisted connector attempt history for this device.",
    status: "Verification status", vendor: "Vendor / platform", target: "Management target", method: "Connection method",
    credential: "Credential reference", lastAttempt: "Last attempt", lastSuccess: "Last success", connector: "Connector",
    invoked: "Connector invoked", notInvoked: "Connector not invoked", test: "Test connection", retry: "Retry",
    detect: "Detect platform", discover: "Discover inventory", verify: "Verify and commit", newSession: "Start new session",
    history: "Verification history", replace: "Manage credentials", select: "Select credential", noCredential: "No credential",
    refresh: "Refresh", connected: "Connected", failed: "Failed", empty: "No verification attempt has been recorded."
  };

  const statusText = (status: string) => {
    const keys: Record<string, string> = {
      verified: "workspace.values.verified", failed: "workspace.values.failed", unverified: "workspace.values.pendingVerification",
      draft: "workspace.status.draft", connection_verified: "workspace.status.connectionVerified", platform_detected: "workspace.status.platformDetected",
      discovery_completed: "workspace.status.discoveryCompleted", preview_ready: "workspace.status.previewReady", connection_failed: "workspace.status.connectionFailed",
      discovery_failed: "workspace.status.discoveryFailed", platform_unsupported: "workspace.status.platformUnsupported"
    };
    return t(keys[status] ?? "common.unknown");
  };

  const load = useCallback(async () => {
    const [nextVerification, nextCredentials] = await Promise.all([getDeviceVerification(deviceId), listCredentials()]);
    setVerification(nextVerification);
    setCredentials(nextCredentials);
    setCredentialId((current) => current || nextVerification.credential?.id || "");
  }, [deviceId]);

  useEffect(() => { void load().catch((failure: Error) => setError(failure.message)); }, [load]);

  const run = async (name: string, operation: () => Promise<unknown>) => {
    setWorking(name);
    setError("");
    try { await operation(); await load(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : copy.failed); await load().catch(() => undefined); }
    finally { setWorking(""); }
  };

  if (!verification) return <section className="content-panel verification-panel" aria-busy="true"><h2>{copy.title}</h2><p>{error || copy.refresh}…</p></section>;
  const sessionId = verification.activeSessionId;
  const sessionStatus = verification.history[0]?.status ?? "draft";
  const canDetect = sessionStatus === "connection_verified";
  const canDiscover = sessionStatus === "platform_detected";
  const canVerify = ["connection_verified", "platform_detected", "discovery_completed", "preview_ready"].includes(sessionStatus) && verification.connectorInvoked && verification.connected;
  const disabled = Boolean(working) || verification.busy;

  return (
    <section className="content-panel verification-panel" aria-labelledby="device-verification-title">
      <div className="verification-panel__header">
        <div><h2 id="device-verification-title">{copy.title}</h2><p>{copy.description}</p></div>
        <StatusBadge value={statusText(verification.verificationStatus)} tone={verification.verificationStatus === "verified" ? "good" : verification.verificationStatus === "failed" ? "danger" : "warning"} />
      </div>
      <div className="verification-panel__grid">
        <dl className="detail-list">
          <dt>{copy.status}</dt><dd>{statusText(verification.verificationStatus)}</dd>
          <dt>{copy.vendor}</dt><dd>{verification.vendor} / {verification.platform}</dd>
          <dt>{copy.target}</dt><dd dir="ltr">{verification.host}:{verification.port}</dd>
          <dt>{copy.method}</dt><dd>{verification.method}</dd>
        </dl>
        <dl className="detail-list">
          <dt>{copy.credential}</dt><dd>{verification.credential?.name ?? copy.noCredential}</dd>
          <dt>{copy.lastAttempt}</dt><dd>{date(verification.lastAttemptAt, locale)}</dd>
          <dt>{copy.lastSuccess}</dt><dd>{date(verification.lastSuccessAt, locale)}</dd>
          <dt>{copy.connector}</dt><dd>{verification.connectorType ?? "—"} · {verification.connectorInvoked ? copy.invoked : copy.notInvoked}</dd>
        </dl>
      </div>
      <div className="verification-panel__credential">
        <label>{copy.select}<select value={credentialId} onChange={(event) => setCredentialId(event.target.value)}><option value="">{copy.noCredential}</option>{credentials.map((credential) => <option key={credential.id} value={credential.id}>{credential.name} · {credential.type}</option>)}</select></label>
        <Link className="secondary-link" to="/settings">{copy.replace}</Link>
      </div>
      {verification.error || error ? <p className="verification-panel__error" role="alert">{error || verification.error}</p> : null}
      <div className="button-row verification-panel__controls">
        <button className="primary-button" type="button" disabled={disabled || !credentialId} onClick={() => void run("test", () => testDeviceVerification(deviceId, credentialId))}>{working === "test" ? `${copy.test}…` : copy.test}</button>
        <button className="secondary-button" type="button" disabled={disabled || !credentialId} onClick={() => void run("retry", () => retryDeviceVerification(deviceId, credentialId))}>{copy.retry}</button>
        <button className="secondary-button" type="button" disabled={disabled || !sessionId || !canDetect} onClick={() => void run("detect", () => detectOnboarding(sessionId!))}>{copy.detect}</button>
        <button className="secondary-button" type="button" disabled={disabled || !sessionId || !canDiscover} onClick={() => void run("discover", () => discoverOnboarding(sessionId!))}>{copy.discover}</button>
        <button className="primary-button" type="button" disabled={disabled || !sessionId || !canVerify} onClick={() => void run("verify", () => commitDeviceVerification(deviceId, sessionId))}>{copy.verify}</button>
        <button className="text-button" type="button" disabled={disabled} onClick={() => void run("new", () => startOnboarding({ deviceId }))}>{copy.newSession}</button>
        <button className="text-button" type="button" disabled={disabled} onClick={() => void run("refresh", async () => undefined)}>{copy.refresh}</button>
      </div>
      <details className="verification-history">
        <summary>{copy.history} ({verification.history.length})</summary>
        {verification.history.length ? verification.history.map((attempt) => <article key={attempt.sessionId} className="verification-history__item"><div><strong>{statusText(attempt.status)}</strong><span>{date(attempt.attemptedAt, locale)}</span></div><p>{attempt.connectorType ?? "—"} · {attempt.connectorInvoked ? copy.invoked : copy.notInvoked} · {attempt.connected ? copy.connected : copy.failed}</p>{attempt.error ? <p className="verification-panel__error">{attempt.error}</p> : null}</article>) : <p>{copy.empty}</p>}
      </details>
    </section>
  );
}
