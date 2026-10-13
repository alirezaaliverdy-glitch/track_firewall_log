import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Cable, Check, ChevronDown, LoaderCircle, LockKeyhole, Network, Plus, RefreshCw, Settings2, ShieldCheck, Trash2, Upload, Wifi } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { CameraDialog } from "@/features/cameras/CameraDialog";
import { importWireguard, vpnError, vpnRequest, type VpnInput, type VpnList, type VpnProfile } from "@/lib/vpn";
import "@/features/cameras/CamerasPage.css";
import "./VpnPage.css";

const blank: VpnInput = { name: "", protocol: "wireguard", endpoint: "", endpointPort: 51820, routes: ["192.168.18.0/24"], address: "", privateKey: "", publicKey: "", presharedKey: "", username: "", password: "", ipsecPsk: "" };
const stateLabels: Record<string, string> = { connected: "متصل", disconnected: "قطع", waiting: "در انتظار پاسخ VPN", stale: "پاسخ تونل قدیمی است", error: "نیاز به بررسی", unavailable: "سرویس آماده نیست", unknown: "وضعیت نامشخص" };
function VpnForm({ profile, onClose, onSaved }: { profile?: VpnProfile; onClose: () => void; onSaved: () => void }) {
  const [input, setInput] = useState<VpnInput>(profile ? { ...blank, name: profile.name, protocol: profile.protocol, endpoint: profile.endpoint, endpointPort: profile.endpointPort, routes: profile.routesJson, address: undefined, publicKey: undefined, username: undefined } : blank);
  const [routes, setRoutes] = useState(input.routes.join("\n")), [busy, setBusy] = useState(false), [error, setError] = useState(""), [imported, setImported] = useState(false);
  const change = (key: keyof VpnInput, value: string | number) => setInput(current => ({ ...current, [key]: value }));
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const payload = { ...input, routes: routes.split(/[\n,]+/).map(value => value.trim()).filter(Boolean) };
      if (profile) for (const key of ["address", "publicKey", "username"] as const) if (!payload[key]) delete payload[key];
      await vpnRequest(profile ? `/${profile.id}` : "", profile ? "PATCH" : "POST", payload); onSaved(); onClose();
    } catch (failure) { setError(vpnError(failure)); } finally { setBusy(false); }
  };
  const readConfig = async (file?: File) => {
    if (!file) return; setError("");
    try { const config = importWireguard(await file.text()); setInput(current => ({ ...current, ...config, name: current.name || file.name.replace(/\.(conf|txt)$/i, "").slice(0, 100) })); setRoutes((config.routes ?? []).join("\n")); setImported(true); }
    catch (failure) { setError(vpnError(failure)); }
  };
  return <CameraDialog title={profile ? "تنظیمات اتصال" : "افزودن اتصال VPN"} onClose={() => { if (!busy) onClose(); }} wide>
    <form className="vpn-form" onSubmit={event => void save(event)}>
      <div className="vpn-protocols" role="group" aria-label="نوع VPN">{(["wireguard", "l2tp"] as const).map(protocol => <button type="button" disabled={Boolean(profile) || busy} aria-pressed={input.protocol === protocol} key={protocol} onClick={() => setInput(current => ({ ...current, protocol }))}><span><ShieldCheck size={20} />{protocol === "wireguard" ? "WireGuard" : "L2TP / IPsec"}</span><small>{protocol === "wireguard" ? "کلید اختصاصی" : "نام کاربری، رمز و PSK"}</small>{input.protocol === protocol && <Check size={17} />}</button>)}</div>
      {!profile && input.protocol === "wireguard" ? <label className="vpn-import"><Upload size={17} />ورود فایل WireGuard<input type="file" accept=".conf,.txt" onChange={event => { void readConfig(event.target.files?.[0]); event.target.value = ""; }} /></label> : null}
      {imported ? <p className="vpn-note">کلیدها وارد شد؛ فقط بازه‌های زیر استفاده می‌شوند. DNS و مسیر عمومی فایل اعمال نمی‌شوند.</p> : null}
      {imported && !routes.trim() ? <p className="camera-alert" role="status">بازهٔ خصوصی دستگاه‌ها را وارد کن؛ فایل فقط مسیر عمومی داشت و آن مسیر وارد برنامه نمی‌شود.</p> : null}
      <div className="vpn-form-grid"><label>نام اتصال<input required maxLength={100} value={input.name} onChange={event => change("name", event.target.value)} placeholder="مثلاً دوربین‌های دفتر" /></label><label>سرور VPN<input required dir="ltr" value={input.endpoint} onChange={event => change("endpoint", event.target.value)} placeholder="vpn.example.com" autoComplete="off" /></label></div>
      {input.protocol === "wireguard" ? <>
        <div className="vpn-form-grid"><label>IP تونل<input dir="ltr" required={!profile} value={input.address ?? ""} onChange={event => change("address", event.target.value)} placeholder={profile ? "خالی = بدون تغییر" : "10.20.0.2/32"} /></label><label>پورت WireGuard<input type="number" min={1} max={65535} dir="ltr" value={input.endpointPort} onChange={event => change("endpointPort", Number(event.target.value))} /></label></div>
        <label>کلید عمومی سرور<input dir="ltr" required={!profile} autoComplete="off" value={input.publicKey ?? ""} onChange={event => change("publicKey", event.target.value)} placeholder={profile ? "خالی = بدون تغییر" : "PublicKey"} /></label>
        <label>کلید خصوصی اتصال<input type="password" dir="ltr" required={!profile} autoComplete="new-password" value={input.privateKey} onChange={event => change("privateKey", event.target.value)} placeholder={profile ? "خالی = بدون تغییر" : "PrivateKey"} /></label>
        <details className="vpn-advanced"><summary>کلید مشترک اختیاری <ChevronDown size={15} /></summary><label>PresharedKey<input type="password" autoComplete="new-password" dir="ltr" value={input.presharedKey} onChange={event => change("presharedKey", event.target.value)} placeholder={profile ? "خالی = بدون تغییر" : "در صورت تنظیم روی VPN"} /></label></details>
      </> : <><div className="vpn-form-grid"><label>نام کاربری VPN<input dir="ltr" required={!profile} autoComplete="off" value={input.username ?? ""} onChange={event => change("username", event.target.value)} placeholder={profile ? "خالی = بدون تغییر" : "Username"} /></label><label>رمز VPN<input dir="ltr" type="password" required={!profile} autoComplete="new-password" value={input.password} onChange={event => change("password", event.target.value)} placeholder={profile ? "خالی = بدون تغییر" : "Password"} /></label></div><label>کلید مشترک IPsec (PSK)<input dir="ltr" type="password" required={!profile} autoComplete="new-password" value={input.ipsecPsk} onChange={event => change("ipsecPsk", event.target.value)} placeholder={profile ? "خالی = بدون تغییر" : "Pre-shared key"} /></label></>}
      <label className="vpn-routes-field"><span><Network size={17} />شبکه‌های پشت VPN</span><textarea required dir="ltr" value={routes} onChange={event => setRoutes(event.target.value)} rows={3} placeholder="192.168.18.0/24" /><small>هر خط یک بازه؛ فقط همین مقصدها از VPN عبور می‌کنند.</small></label>
      {input.protocol === "wireguard" ? <details className="vpn-advanced"><summary>اندازهٔ بسته‌ها <ChevronDown size={15} /></summary><label>MTU<input type="number" dir="ltr" min={1280} max={1420} value={input.mtu ?? ""} placeholder={profile ? "خالی = بدون تغییر" : "1420"} onChange={event => setInput(current => ({ ...current, mtu: event.target.value ? Number(event.target.value) : undefined }))} /></label></details> : null}
      {error && <p className="camera-alert" role="alert">{error}</p>}
      <footer className="camera-dialog__actions"><button type="button" className="camera-button" disabled={busy} onClick={onClose}>انصراف</button><button type="submit" className="camera-button camera-button--primary" disabled={busy}>{busy ? <LoaderCircle size={17} className="camera-spin" /> : <Check size={17} />}ذخیره اتصال</button></footer>
    </form>
  </CameraDialog>;
}
function VpnCard({ profile, admin, available, onEdit, onAction, busy }: { profile: VpnProfile; admin: boolean; available: boolean; onEdit: () => void; onAction: (action: "connect" | "disconnect" | "delete") => void; busy: boolean }) {
  const [target, setTarget] = useState(""), [port, setPort] = useState(80), [testing, setTesting] = useState(false), [result, setResult] = useState(""), [error, setError] = useState("");
  const state = profile.runtime.state, active = !["disconnected", "unavailable", "unknown"].includes(state);
  const test = async () => { setTesting(true); setResult(""); setError(""); try { const response = await vpnRequest<{ reachable: boolean }>(`/${profile.id}/test`, "POST", { target, port }); setResult(response.reachable ? "تجهیز از مسیر VPN در دسترس است." : "مسیر VPN انتخاب شد، اما تجهیز روی این پورت پاسخ نداد."); } catch (failure) { setError(vpnError(failure)); } finally { setTesting(false); } };
  return <article className="vpn-card">
    <header><span className="vpn-card-icon"><Cable size={23} /></span><div><h2>{profile.name}</h2><small>{profile.protocol === "wireguard" ? "WireGuard" : "L2TP / IPsec"}</small></div><span className={`vpn-status is-${state}`}><i />{busy ? "در حال انجام…" : stateLabels[state] ?? "نامشخص"}</span></header>
    <p className="vpn-server" dir="ltr">{profile.endpoint}{profile.protocol === "wireguard" ? `:${profile.endpointPort}` : ""}</p>
    <div className="vpn-route-tags">{profile.routesJson.map(range => <code key={range}>{range}</code>)}</div>
    {profile.lastErrorCode && <p className="camera-alert" role="alert">{vpnError(new Error(profile.lastErrorCode))}</p>}
    <footer>{admin && <><button type="button" className={`camera-button ${active ? "camera-button--danger" : "camera-button--primary"}`} disabled={busy || !available} onClick={() => onAction(active ? "disconnect" : "connect")}>{busy ? <LoaderCircle size={17} className="camera-spin" /> : <Wifi size={17} />}{active ? "قطع اتصال" : "اتصال"}</button><button type="button" className="camera-icon-button" disabled={busy || active} onClick={onEdit} aria-label={`تنظیمات ${profile.name}`}><Settings2 size={18} /></button></>}{state === "connected" && <Link className="vpn-card-link" to="/assets/cameras">دوربین‌ها</Link>}</footer>
    <details className="vpn-details"><summary>تست و جزئیات <ChevronDown size={16} /></summary>
      <dl><div><dt>آخرین پاسخ تونل</dt><dd>{profile.runtime.handshakeAt ? new Date(profile.runtime.handshakeAt).toLocaleString("fa-IR") : state === "connected" ? "اتصال برقرار است" : "هنوز تأیید نشده"}</dd></div><div><dt>دریافت / ارسال</dt><dd dir="ltr">{((profile.runtime.rxBytes ?? 0) / 1024).toFixed(1)} / {((profile.runtime.txBytes ?? 0) / 1024).toFixed(1)} KB</dd></div></dl>
      {admin && <div className="vpn-test"><label>IP تجهیز<input dir="ltr" placeholder="192.168.18.50" value={target} onChange={event => setTarget(event.target.value)} /></label><label>پورت<input type="number" min={1} max={65535} value={port} onChange={event => setPort(Number(event.target.value))} /></label><button type="button" className="camera-button" disabled={!active || !target || testing} onClick={() => void test()}>{testing ? <LoaderCircle size={16} className="camera-spin" /> : <Network size={16} />}تست</button></div>}
      {result && <p className="vpn-note" role="status">{result}</p>}{error && <p className="camera-alert" role="alert">{error}</p>}
      <div className="vpn-details-links"><Link to="/assets/devices/new">ثبت تجهیز</Link>{admin && <button className="vpn-remove" disabled={active || busy} type="button" onClick={() => onAction("delete")}><Trash2 size={14} />حذف اتصال</button>}</div>
    </details>
  </article>;
}
export default function VpnPage({ embedded = false }: { embedded?: boolean; params?: Record<string, string> }) {
  const { user } = useAuth(), admin = user?.role === "admin";
  const [data, setData] = useState<VpnList>({ available: false, splitOnly: true, profiles: [] }), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [form, setForm] = useState<VpnProfile | "new" | null>(null), [confirm, setConfirm] = useState<{ profile: VpnProfile; action: "connect" | "disconnect" | "delete" } | null>(null), [busyId, setBusyId] = useState("");
  const load = useCallback(async (quiet = false) => { if (!quiet) setLoading(true); try { setData(await vpnRequest<VpnList>()); setError(""); } catch (failure) { setError(vpnError(failure)); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); const timer = setInterval(() => { if (!document.hidden && !busyId) void load(true); }, 10000); return () => clearInterval(timer); }, [load, busyId]);
  const run = async () => {
    if (!confirm) return; const { profile, action } = confirm; setBusyId(profile.id); setError("");
    try { await vpnRequest(`/${profile.id}${action === "delete" ? "" : `/${action}`}`, action === "delete" ? "DELETE" : "POST", action === "delete" ? undefined : { intent: "execute", confirmed: true, revision: profile.revision }); setConfirm(null); await load(true); }
    catch (failure) { setError(vpnError(failure)); setConfirm(null); await load(true); } finally { setBusyId(""); }
  };
  return <section className="vpn-page" dir="rtl">
    <header className="vpn-heading"><div>{!embedded && <small><LockKeyhole size={16} />اتصال شبکه</small>}<h1>اتصال VPN</h1><p>دسترسی به تجهیزات پشت VPN، بدون تغییر مسیر اینترنت برنامه.</p></div><div><button className="camera-icon-button" disabled={loading} type="button" aria-label="به‌روزرسانی وضعیت VPN" onClick={() => void load()}><RefreshCw size={18} className={loading ? "camera-spin" : ""} /></button>{admin && <button className="camera-button camera-button--primary" type="button" onClick={() => setForm("new")}><Plus size={18} />افزودن اتصال</button>}</div></header>
    <div className="vpn-routing-summary"><span><ShieldCheck size={19} />فقط شبکه‌های انتخاب‌شده</span><span>اینترنت برنامه <b>مسیر عادی</b></span></div>
    {error && <p className="camera-alert" role="alert">{error}</p>}
    {!loading && !data.available && <p className="camera-alert" role="status">سرویس VPN در دسترس نیست. تنظیمات را می‌توان ذخیره کرد؛ اتصال بعد از آماده‌شدن سرویس فعال می‌شود.</p>}
    {data.available && data.l2tpReady === false && <p className="vpn-note" role="status">برای اجرای L2TP، درایور PPP این میزبان باید فعال شود.</p>}
    {loading && !data.profiles.length ? <div className="vpn-empty"><LoaderCircle size={28} className="camera-spin" /><p>دریافت اتصال‌ها…</p></div> : data.profiles.length ? <div className="vpn-card-grid">{data.profiles.map(profile => <VpnCard key={profile.id} profile={profile} admin={admin} available={data.available} busy={busyId === profile.id} onEdit={() => setForm(profile)} onAction={action => setConfirm({ profile, action })} />)}</div> : <div className="vpn-empty"><span><Cable size={38} /></span><h2>شبکهٔ دوربین‌ها یا تجهیزات را وصل کن</h2><p>یک اتصال بساز و بازهٔ شبکهٔ مقصد را انتخاب کن.</p>{admin && <button className="camera-button camera-button--primary" type="button" onClick={() => setForm("new")}><Plus size={17} />افزودن اتصال</button>}</div>}
    <details className="vpn-help"><summary>بعد از اتصال چه کنم؟ <ChevronDown size={15} /></summary><p>IP دوربین یا تجهیز را مثل همیشه ثبت کن. اگر داخل بازهٔ انتخاب‌شده باشد، ارتباط سرور با آن از VPN می‌گذرد. اتصال VPN به‌تنهایی دسترسی دوربین یا حساب تجهیز را ایجاد نمی‌کند.</p><div><Link to="/assets/cameras">افزودن دوربین</Link><Link to="/assets/devices/new">ثبت تجهیز</Link></div></details>
    {form && <VpnForm profile={form === "new" ? undefined : form} onClose={() => setForm(null)} onSaved={() => void load(true)} />}
    {confirm && <CameraDialog title={confirm.action === "connect" ? "اتصال به VPN" : confirm.action === "disconnect" ? "قطع VPN" : "حذف اتصال"} onClose={() => { if (!busyId) setConfirm(null); }}><div className="vpn-confirm"><h3>{confirm.profile.name}</h3><p>{confirm.action === "connect" ? "فقط شبکه‌های زیر از تونل عبور می‌کنند:" : confirm.action === "disconnect" ? "ارتباط تجهیزات این شبکه‌ها از VPN قطع می‌شود:" : "تنظیمات این اتصال از برنامه حذف می‌شود."}</p><div className="vpn-route-tags">{confirm.profile.routesJson.map(range => <code key={range}>{range}</code>)}</div><p className="vpn-note">مسیر اینترنت برنامه تغییر نمی‌کند.</p><div className="camera-dialog__actions"><button className="camera-button" type="button" disabled={Boolean(busyId)} onClick={() => setConfirm(null)}>انصراف</button><button className="camera-button camera-button--primary" type="button" disabled={Boolean(busyId)} onClick={() => void run()}>{busyId ? <LoaderCircle size={17} className="camera-spin" /> : <Check size={17} />}{busyId ? "در حال انجام…" : "تأیید"}</button></div></div></CameraDialog>}
  </section>;
}
