import { useEffect, useState } from "react";
import { configureEsxiSecondaryChannel } from "@/lib/devices";
import { createCredential, listCredentials, type DeviceCredential } from "@/lib/credentials";

export function EsxiSecondarySetup({ deviceId, method, initialPort, initialCredentialId, isFa, onRefresh }: {
  deviceId: string; method: string; initialPort: number; initialCredentialId: string | null; isFa: boolean;
  onRefresh: () => Promise<unknown> | unknown;
}) {
  const [credentials, setCredentials] = useState<DeviceCredential[]>([]);
  const [credentialId, setCredentialId] = useState(initialCredentialId ?? "");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [caCertificate, setCaCertificate] = useState("");
  const [port, setPort] = useState(initialPort);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { void listCredentials().then(setCredentials).catch(() => setCredentials([])); }, []);

  const save = async () => {
    setSaving(true); setMessage(""); setError("");
    try {
      let selected = credentialId;
      if (!selected) {
        if (!name.trim() || !username.trim() || !password) throw new Error(isFa ? "نام اعتبارنامه، کاربر و رمز را وارد کنید." : "Enter a credential name, user, and password.");
        const created = await createCredential({ name: name.trim(), type: "password", username: username.trim(), password, sudo: false });
        selected = created.id;
        setCredentialId(selected);
        setCredentials((current) => [created, ...current]);
        setPassword("");
      }
      await configureEsxiSecondaryChannel(deviceId, { credentialId: selected, port,
        ...(method === "ssh" ? { fingerprint: fingerprint.trim() || undefined } : { caCertificate: caCertificate.trim() || undefined }) });
      setMessage(isFa ? "ذخیره شد. اکنون تست اتصال را اجرا کنید تا پاسخ واقعی هاست بررسی شود." : "Saved. Run the connection test to verify a real host response.");
      await onRefresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : (isFa ? "ذخیره انجام نشد." : "Could not save.")); }
    finally { setSaving(false); }
  };

  return <details className="device-channel__guide"><summary>{isFa ? "تنظیم مسیر دوم ESXi" : "Configure secondary ESXi path"}</summary>
    <div className="device-channel__form">
      <label>{isFa ? "اعتبارنامه این مسیر" : "Credential for this path"}<select value={credentialId} onChange={(event) => setCredentialId(event.target.value)}><option value="">{isFa ? "اعتبارنامه جدید" : "New credential"}</option>{credentials.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.username}</option>)}</select></label>
      {!credentialId ? <><label>{isFa ? "نام اعتبارنامه" : "Credential name"}<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" /></label><label>{isFa ? "نام کاربری ESXi" : "ESXi username"}<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="off" /></label><label>{isFa ? "رمز عبور" : "Password"}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /></label></> : null}
      <label>{isFa ? "پورت" : "Port"}<input type="number" min="1" max="65535" value={port} onChange={(event) => setPort(Number(event.target.value))} /></label>
      {method === "ssh" ? <label className="device-channel__form-wide">{isFa ? "اثر انگشت SHA256 کلید هاست (از مدیر هاست)" : "Host key SHA256 fingerprint (from host admin)"}<input dir="ltr" placeholder="SHA256:..." value={fingerprint} onChange={(event) => setFingerprint(event.target.value)} autoComplete="off" /></label>
        : <label className="device-channel__form-wide">{isFa ? "گواهی CA معتبر، در صورت خودامضا بودن هاست" : "Trusted CA certificate, for a self-signed host"}<textarea dir="ltr" rows={4} value={caCertificate} onChange={(event) => setCaCertificate(event.target.value)} placeholder="-----BEGIN CERTIFICATE-----" /></label>}
      <button className="secondary-button" type="button" disabled={saving} onClick={() => void save()}>{saving ? (isFa ? "در حال ذخیره…" : "Saving…") : (isFa ? "ذخیره تنظیمات" : "Save settings")}</button>
    </div>
    {message ? <p role="status" className="device-channel__message">{message}</p> : null}
    {error ? <p role="alert" className="device-connection-hub__error">{error}</p> : null}
  </details>;
}
