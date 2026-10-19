import { useEffect, useState } from "react";
import { AccessLink as Link } from "@/components/auth/AccessLink";
import { vpnRequest, type VpnList, type VpnProfile } from "@/lib/vpn";
import { useAuth } from "@/context/AuthContext";
import { canAccessPage } from "@/lib/pageAccess";
import "./VpnAccessField.css";

export function VpnAccessField({ value, onChange, host, isFa = true }: { value: string; onChange: (id: string) => void; host?: string; isFa?: boolean }) {
  const { user } = useAuth();
  const allowed = canAccessPage(user, "tools.vpn");
  const [profiles, setProfiles] = useState<VpnProfile[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let mounted = true;
    if (!allowed) return;
    void vpnRequest<VpnList>().then(data => { if (mounted) { setProfiles(data.profiles); setFailed(false); } }).catch(() => { if (mounted) setFailed(true); });
    return () => { mounted = false; };
  }, [allowed]);
  if (!allowed) return value ? <p className="camera-hint">{isFa ? "مسیر اتصال ذخیره‌شده حفظ می‌شود؛ تغییر VPN نیازمند دسترسی مدیر است." : "The saved connection route is preserved. Ask your manager for VPN access to change it."}</p> : null;
  const selected = profiles.find(profile => profile.id === value);
  const unavailable = selected && selected.runtime.state !== "connected";
  return <div className="vpn-access-field">
    <label htmlFor="vpn-access-select">{isFa ? "مسیر دسترسی" : "Access route"}</label>
    <select id="vpn-access-select" value={value} onChange={event => onChange(event.target.value)}>
      <option value="">{isFa ? "شبکهٔ مستقیم" : "Direct network"}</option>
      {profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name} · {profile.protocol === "wireguard" ? "WireGuard" : profile.protocol === "openvpn" ? "OpenVPN" : "L2TP"} · {profile.routesJson.join(", ")}</option>)}
    </select>
    {value && !selected ? <small role="alert">{isFa ? "این اتصال در دسترس نیست؛ فهرست VPN را به‌روز کن." : "This VPN is unavailable. Reload the VPN list."}</small>
      : unavailable ? <small>{isFa ? "VPN قطع است؛ پیش از تست یا مشاهده، آن را وصل کن." : "Connect this VPN before testing or viewing."}</small>
      : selected ? <small>{isFa ? "فقط IPهای بازهٔ همین VPN از تونل می‌گذرند." : "Only this VPN's selected IP ranges use the tunnel."}</small>
      : <small>{isFa ? "اگر دستگاه پشت VPN است، اتصال آن را انتخاب کن." : "Select a VPN if this device is behind one."}</small>}
    {host && value && selected && !selected.routesJson.some(range => ipInRange(host, range)) ? <small role="alert">{isFa ? "IP در بازهٔ این VPN نیست؛ بازه یا اتصال را تغییر بده." : "IP is outside this VPN's ranges."}</small> : null}
    {!profiles.length && !failed ? <Link to="/tools/vpn">{isFa ? "افزودن VPN" : "Add VPN"}</Link> : null}
    {failed ? <small role="alert">{isFa ? "فهرست VPN دریافت نشد؛ صفحه را دوباره باز کن." : "VPN list could not load. Reopen this form."}</small> : null}
  </div>;
}

function ipInRange(host: string, range: string) {
  const bytes = host.split(".").map(Number), [network, prefixText] = range.split("/"), networkBytes = network.split(".").map(Number);
  if (bytes.length !== 4 || networkBytes.length !== 4 || [...bytes, ...networkBytes].some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)) return false;
  const prefix = Number(prefixText), address = bytes.reduce((n, byte) => (n * 256 + byte) >>> 0, 0), start = networkBytes.reduce((n, byte) => (n * 256 + byte) >>> 0, 0), mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return prefix >= 0 && prefix <= 32 && (address & mask) === (start & mask);
}
