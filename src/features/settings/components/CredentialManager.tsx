import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { KeyRound, Pencil, Plus, RefreshCw, Save, Server, ShieldCheck, Trash2, X } from "lucide-react";
import { createCredential, deleteCredential, listCredentials, updateCredential, type CredentialInput, type DeviceCredential } from "@/lib/credentials";
import "./CredentialManager.css";

type Props = { isFa: boolean };
type Editor = CredentialInput & { id?: string };

const emptyEditor = (): Editor => ({ name: "", username: "", type: "password", password: "", privateKey: "", passphrase: "", sudo: false });

export function CredentialManager({ isFa }: Props) {
  const [items, setItems] = useState<DeviceCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setItems(await listCredentials()); }
    catch { setError(isFa ? "دریافت اعتبارنامه‌ها ناموفق بود." : "Could not load credentials."); }
    finally { setLoading(false); }
  }, [isFa]);

  useEffect(() => { void load(); }, [load]);
  const assignedCount = useMemo(() => items.filter((item) => item.deviceCount > 0).length, [items]);

  function edit(item?: DeviceCredential) {
    setError(""); setNotice("");
    setEditor(item ? { id: item.id, name: item.name, username: item.username, type: item.type, password: "", privateKey: "", passphrase: "", sudo: item.sudo } : emptyEditor());
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    if (!editor.name.trim() || !editor.username.trim()) return setError(isFa ? "نام و نام کاربری الزامی است." : "Name and username are required.");
    if (!editor.id && editor.type === "password" && !editor.password) return setError(isFa ? "گذرواژه را وارد کنید." : "Enter a password.");
    if (!editor.id && editor.type === "private_key" && !editor.privateKey) return setError(isFa ? "کلید خصوصی را وارد کنید." : "Enter a private key.");
    setBusyId(editor.id ?? "new"); setError(""); setNotice("");
    try {
      if (editor.id) {
        const changes: Partial<CredentialInput> = { name: editor.name, username: editor.username, sudo: editor.sudo };
        if (editor.type === "password" && editor.password) changes.password = editor.password;
        if (editor.type === "private_key" && editor.privateKey) {
          changes.privateKey = editor.privateKey;
        }
        if (editor.type === "private_key" && editor.passphrase) changes.passphrase = editor.passphrase;
        await updateCredential(editor.id, changes);
      } else {
        await createCredential(editor);
      }
      setEditor(null);
      setNotice(isFa ? "اعتبارنامه با موفقیت ذخیره شد." : "Credential saved.");
      await load();
    } catch {
      setError(isFa ? "ذخیره ناموفق بود؛ نام تکراری و ورودی‌ها را بررسی کنید." : "Save failed. Check duplicate names and fields.");
    } finally { setBusyId(""); }
  }

  async function remove(item: DeviceCredential) {
    const warning = item.deviceCount > 0
      ? (isFa ? `این اعتبارنامه به ${item.deviceCount} دستگاه متصل است. حذف آن اتصال این دستگاه‌ها را قطع می‌کند. ادامه می‌دهید؟` : `This credential is assigned to ${item.deviceCount} device(s). Deleting it disconnects those devices. Continue?`)
      : (isFa ? "این اعتبارنامه حذف شود؟" : "Delete this credential?");
    if (!window.confirm(warning)) return;
    setBusyId(item.id); setError(""); setNotice("");
    try {
      await deleteCredential(item.id, true);
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      if (editor?.id === item.id) setEditor(null);
      setNotice(isFa ? "اعتبارنامه حذف شد." : "Credential deleted.");
    } catch { setError(isFa ? "حذف اعتبارنامه ناموفق بود." : "Credential deletion failed."); }
    finally { setBusyId(""); }
  }

  return <div className="credential-management-workspace">
    <section className="credential-summary">
      <div><KeyRound /><span>{isFa ? "اعتبارنامه‌های امن" : "Secure credentials"}<strong>{items.length}</strong></span></div>
      <div><Server /><span>{isFa ? "در حال استفاده" : "Assigned"}<strong>{assignedCount}</strong></span></div>
      <div><ShieldCheck /><span>{isFa ? "نمایش رمز" : "Secret exposure"}<strong>{isFa ? "هرگز" : "Never"}</strong></span></div>
    </section>
    <section className="credential-panel">
      <header><div><h2>{isFa ? "اعتبارنامه‌های دستگاه" : "Device credentials"}</h2><p>{isFa ? "مرجع‌های رمزگذاری‌شده اتصال به تجهیزات را از اینجا مدیریت کنید." : "Manage encrypted device connection references here."}</p></div><div><button className="icon-button" type="button" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "is-spinning" : ""} /></button><button className="primary-button" type="button" onClick={() => edit()}><Plus />{isFa ? "اعتبارنامه جدید" : "New credential"}</button></div></header>
      {error ? <p className="credential-message is-error" role="alert">{error}</p> : null}
      {notice ? <p className="credential-message is-success" role="status">{notice}</p> : null}
      {loading ? <div className="credential-empty"><RefreshCw className="is-spinning" />{isFa ? "در حال دریافت..." : "Loading..."}</div> : null}
      {!loading ? <div className="credential-list">{items.map((item) => <article key={item.id}><span className="credential-icon"><KeyRound /></span><div className="credential-identity"><strong>{item.name}</strong><small dir="ltr">{item.username}</small></div><span className="credential-type">{item.type === "password" ? (isFa ? "گذرواژه" : "Password") : (isFa ? "کلید خصوصی" : "Private key")}</span><span className={`credential-usage ${item.deviceCount ? "is-used" : ""}`}>{item.deviceCount ? (isFa ? `${item.deviceCount} دستگاه` : `${item.deviceCount} devices`) : (isFa ? "بدون استفاده" : "Unused")}</span><div className="credential-actions"><button className="icon-button" type="button" aria-label={isFa ? "ویرایش" : "Edit"} onClick={() => edit(item)}><Pencil /></button><button className="icon-button danger-text" type="button" aria-label={isFa ? "حذف" : "Delete"} disabled={busyId === item.id} onClick={() => void remove(item)}><Trash2 /></button></div></article>)}{!items.length ? <div className="credential-empty"><KeyRound />{isFa ? "هنوز اعتبارنامه‌ای ذخیره نشده است." : "No credential has been stored yet."}</div> : null}</div> : null}
    </section>
    {editor ? <section className="credential-editor"><header><div><span><KeyRound /></span><div><h2>{editor.id ? (isFa ? "ویرایش اعتبارنامه" : "Edit credential") : (isFa ? "اعتبارنامه جدید" : "New credential")}</h2><p>{editor.id ? (isFa ? "برای نگه‌داشتن رمز فعلی، فیلد رمز جدید را خالی بگذارید." : "Leave the new secret empty to keep the current one.") : (isFa ? "رمز فقط به‌صورت رمزگذاری‌شده ذخیره می‌شود." : "The secret is stored encrypted only.")}</p></div></div><button className="icon-button" type="button" onClick={() => setEditor(null)}><X /></button></header><form onSubmit={save}><label>{isFa ? "نام مرجع" : "Reference name"}<input value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} required /></label><label>{isFa ? "نام کاربری دستگاه" : "Device username"}<input dir="ltr" autoComplete="username" value={editor.username} onChange={(event) => setEditor({ ...editor, username: event.target.value })} required /></label><label>{isFa ? "نوع" : "Type"}<select value={editor.type} disabled={Boolean(editor.id)} onChange={(event) => setEditor({ ...editor, type: event.target.value as CredentialInput["type"] })}><option value="password">{isFa ? "گذرواژه" : "Password"}</option><option value="private_key">{isFa ? "کلید خصوصی" : "Private key"}</option></select></label>{editor.type === "password" ? <label>{editor.id ? (isFa ? "گذرواژه جدید (اختیاری)" : "New password (optional)") : (isFa ? "گذرواژه" : "Password")}<input type="password" autoComplete="new-password" value={editor.password ?? ""} onChange={(event) => setEditor({ ...editor, password: event.target.value })} required={!editor.id} /></label> : <><label className="is-wide">{editor.id ? (isFa ? "کلید خصوصی جدید (اختیاری)" : "New private key (optional)") : (isFa ? "کلید خصوصی" : "Private key")}<textarea dir="ltr" value={editor.privateKey ?? ""} onChange={(event) => setEditor({ ...editor, privateKey: event.target.value })} required={!editor.id} /></label><label>{isFa ? "Passphrase اختیاری" : "Optional passphrase"}<input type="password" autoComplete="new-password" value={editor.passphrase ?? ""} onChange={(event) => setEditor({ ...editor, passphrase: event.target.value })} /></label></>}<label className="credential-sudo"><input type="checkbox" checked={editor.sudo} onChange={(event) => setEditor({ ...editor, sudo: event.target.checked })} />{isFa ? "اجازه sudo برای این مرجع" : "Allow sudo for this reference"}</label><footer><button className="secondary-button" type="button" onClick={() => setEditor(null)}>{isFa ? "انصراف" : "Cancel"}</button><button className="primary-button" type="submit" disabled={Boolean(busyId)}><Save />{busyId ? (isFa ? "در حال ذخیره..." : "Saving...") : (isFa ? "ذخیره امن" : "Save securely")}</button></footer></form></section> : null}
  </div>;
}
