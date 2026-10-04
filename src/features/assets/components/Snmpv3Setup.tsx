import { useEffect, useState } from "react";
import { configureSnmpv3Channel } from "@/lib/devices";
import { createCredential, listCredentials, type DeviceCredential } from "@/lib/credentials";

export function Snmpv3Setup({ deviceId, isFa, initialPort, initialCredentialId, initialAuthProtocol, onRefresh }: {
  deviceId: string;
  isFa: boolean;
  initialPort: number;
  initialCredentialId: string | null;
  initialAuthProtocol: unknown;
  onRefresh: () => Promise<unknown> | unknown;
}) {
  const [credentials, setCredentials] = useState<DeviceCredential[]>([]);
  const [credentialId, setCredentialId] = useState(initialCredentialId ?? "");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [authSecret, setAuthSecret] = useState("");
  const [privSecret, setPrivSecret] = useState("");
  const [authProtocol, setAuthProtocol] = useState<"SHA" | "SHA256">(initialAuthProtocol === "SHA256" ? "SHA256" : "SHA");
  const [port, setPort] = useState(initialPort);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { void listCredentials().then(setCredentials).catch(() => setCredentials([])); }, []);

  const save = async () => {
    setSaving(true); setError(""); setMessage("");
    try {
      let selected = credentialId;
      if (!selected) {
        if (!name.trim() || !username.trim() || !authSecret || !privSecret) {
          throw new Error(isFa ? "نام، کاربر و هر دو رمز SNMPv3 را وارد کنید." : "Enter a name, user, and both SNMPv3 secrets.");
        }
        const created = await createCredential({ name: name.trim(), type: "password", username: username.trim(), password: authSecret, passphrase: privSecret, sudo: false });
        selected = created.id;
        setCredentialId(selected);
        setCredentials((current) => [created, ...current]);
        setAuthSecret(""); setPrivSecret("");
      }
      await configureSnmpv3Channel(deviceId, { credentialId: selected, port, authProtocol });
      setMessage(isFa ? "ذخیره شد. برای تأیید دریافت داده، تست اتصال را اجرا کنید." : "Saved. Run the connection test to verify data collection.");
      await onRefresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : (isFa ? "ذخیره انجام نشد." : "Could not save."));
    } finally { setSaving(false); }
  };

  return <details className="device-channel__guide"><summary>{isFa ? "تنظیم SNMPv3" : "Configure SNMPv3"}</summary>
    <div className="device-channel__form">
      <label>{isFa ? "اعتبارنامه" : "Credential"}<select value={credentialId} onChange={(event) => setCredentialId(event.target.value)}><option value="">{isFa ? "اعتبارنامه جدید" : "New credential"}</option>{credentials.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.username}</option>)}</select></label>
      {!credentialId ? <><label>{isFa ? "نام اعتبارنامه" : "Credential name"}<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" /></label><label>{isFa ? "نام کاربری SNMPv3" : "SNMPv3 username"}<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="off" /></label><label>{isFa ? "رمز احراز هویت" : "Authentication secret"}<input type="password" value={authSecret} onChange={(event) => setAuthSecret(event.target.value)} autoComplete="new-password" /></label><label>{isFa ? "رمز محرمانگی AES" : "AES privacy secret"}<input type="password" value={privSecret} onChange={(event) => setPrivSecret(event.target.value)} autoComplete="new-password" /></label></> : null}
      <label>{isFa ? "احراز هویت" : "Authentication"}<select value={authProtocol} onChange={(event) => setAuthProtocol(event.target.value as "SHA" | "SHA256")}><option value="SHA">SHA</option><option value="SHA256">SHA256</option></select></label>
      <label>{isFa ? "پورت UDP" : "UDP port"}<input type="number" min="1" max="65535" value={port} onChange={(event) => setPort(Number(event.target.value))} /></label>
      <button className="secondary-button" type="button" disabled={saving} onClick={() => void save()}>{saving ? (isFa ? "در حال ذخیره…" : "Saving…") : (isFa ? "ذخیره تنظیمات" : "Save settings")}</button>
    </div>
    {message ? <p role="status" className="device-channel__message">{message}</p> : null}
    {error ? <p role="alert" className="device-connection-hub__error">{error}</p> : null}
  </details>;
}
