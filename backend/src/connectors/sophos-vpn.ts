import net from "node:net";
import type { SophosDiscovery } from "./types.js";
import { resolveEphemeralSecretRef } from "../services/ephemeral-secret.service.js";

export const SOPHOS_VPN_SECRET_PURPOSE = "sophos_ipsec_psk";
export function xmlEscape(value: unknown) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
export function normalizeSophosVpn(input: Record<string, unknown>) {
  const value = (key: string) => String(input[key] ?? "").trim();
  const values = {
    vpnName: value("vpnName"), wanInterface: value("wanInterface"), remoteGateway: value("remoteGateway"),
    localHost: value("localHost"), remoteHost: value("remoteHost"), profileName: value("profileName"),
    localId: value("localId"), remoteId: value("remoteId"), pskSecretRef: value("pskSecretRef"),
    startupMode: value("startupMode") || "RespondOnly", enableAfterCreate: input.enableAfterCreate === true,
    profileIkev2Confirmed: input.profileIkev2Confirmed === true,
  };
  if (!/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(values.vpnName)) throw new Error("SOPHOS_VPN_NAME_INVALID: نام تونل باید با حرف لاتین شروع شود؛ فقط حروف، عدد و زیرخط، حداکثر ۱۰۰ نویسه.");
  for (const key of ["wanInterface", "localHost", "remoteHost", "profileName"] as const) {
    if (!values[key] || values[key].length > (key === "localHost" || key === "remoteHost" ? 60 : 128) || /[<>\u0000-\u001f]/.test(values[key])) throw new Error(`SOPHOS_VPN_PARAMETER_INVALID: ${key}`);
  }
  // Start with explicit IPv4 endpoints/IDs; dynamic peers, NAT and certificate auth are separate scenarios.
  for (const key of ["remoteGateway", "localId", "remoteId"] as const) {
    if (net.isIP(values[key]) !== 4) throw new Error(`SOPHOS_VPN_IPV4_REQUIRED: ${key}`);
  }
  if (!["RespondOnly", "Initiate", "Disable"].includes(values.startupMode)) throw new Error("SOPHOS_VPN_STARTUP_INVALID");
  if (!/^tmpsec_[a-f0-9-]{36}$/.test(values.pskSecretRef)) throw new Error("SOPHOS_VPN_SECRET_REFERENCE_REQUIRED");
  if (!values.profileIkev2Confirmed) throw new Error("SOPHOS_VPN_IKEV2_CONFIRM_REQUIRED: تنظیم IKEv2 پروفایل را در دستگاه بررسی و تأیید کنید.");
  return values;
}

function networkRange(address?: string, mask?: string) {
  if (!address || !mask || net.isIP(address) !== 4 || net.isIP(mask) !== 4) throw new Error("SOPHOS_VPN_NETWORK_UNVERIFIED: آدرس و ماسک شبکه از دستگاه خوانده نشد.");
  const number = (ip: string) => ip.split(".").reduce((sum, octet) => ((sum << 8) | Number(octet)) >>> 0, 0);
  const bits = number(mask), inverse = (~bits) >>> 0;
  if (((inverse + 1) & inverse) !== 0 || bits === 0) throw new Error("SOPHOS_VPN_NETWORK_MASK_INVALID");
  const start = (number(address) & bits) >>> 0;
  if (start !== number(address)) throw new Error("SOPHOS_VPN_NETWORK_ADDRESS_REQUIRED");
  return { start, end: (start | inverse) >>> 0 };
}

export function preflightSophosVpn(input: Record<string, unknown>, snapshot: SophosDiscovery) {
  const p = normalizeSophosVpn(input);
  if (snapshot.vpnConnections.some(row => row.name.toLowerCase() === p.vpnName.toLowerCase())) throw new Error("SOPHOS_VPN_ALREADY_EXISTS: این نام وجود دارد؛ ساخت تونل، تنظیمات موجود را بازنویسی نمی‌کند.");
  const wan = snapshot.interfaces.find(row => row.hardware === p.wanInterface && row.zone?.toUpperCase() === "WAN");
  if (!wan || wan.administrativeStatus === "down") throw new Error("SOPHOS_VPN_WAN_UNAVAILABLE: پورت WAN انتخاب‌شده موجود یا فعال نیست.");
  const local = snapshot.ipHosts.find(row => row.name === p.localHost && row.hostType?.toLowerCase() === "network" && row.ipFamily === "IPv4");
  const remote = snapshot.ipHosts.find(row => row.name === p.remoteHost && row.hostType?.toLowerCase() === "network" && row.ipFamily === "IPv4");
  if (!local || !remote) throw new Error("SOPHOS_VPN_NETWORK_OBJECT_REQUIRED: دو IP Host از نوع Network و IPv4 در دستگاه انتخاب کنید.");
  const a = networkRange(local.address, local.netmask), b = networkRange(remote.address, remote.netmask);
  if (a.start <= b.end && b.start <= a.end) throw new Error("SOPHOS_VPN_NETWORKS_OVERLAP: شبکه‌های دو طرف نباید هم‌پوشانی داشته باشند.");
  const profile = snapshot.vpnProfiles?.find(row => row.name === p.profileName);
  if (!profile) throw new Error("SOPHOS_VPN_PROFILE_MISSING");
  const aes = (values: string[]) => values.length > 0 && values.every(value => /^AES(?:128|192|256)(?:GCM)?$/i.test(value.replace(/[-_\s]/g, "")));
  const sha = (values: string[]) => values.length > 0 && values.every(value => /^SHA(?:2)?(?:256|384|512)$/i.test(value.replace(/[-_\s]/g, "")));
  if (profile.keyingMethod !== "Automatic" || !aes(profile.phase1Encryption) || !aes(profile.phase2Encryption) || !sha(profile.phase1Authentication) || !sha(profile.phase2Authentication) || !profile.dhGroups.length || profile.dhGroups.some(value => ![14, 15, 16, 19, 20, 21].includes(Number(value.match(/^\d+/)?.[0])))) throw new Error("SOPHOS_VPN_WEAK_OR_UNKNOWN_PROFILE: پروفایل باید Automatic، AES، SHA2 و DH امن داشته باشد؛ مقادیر ناخوانده یا ضعیف پذیرفته نمی‌شوند.");
  if (profile.ikeVersion && !/^(2|IKEv?2)$/i.test(profile.ikeVersion)) throw new Error("SOPHOS_VPN_PROFILE_NOT_IKEV2");
  return { parameters: p, networks: { local: `${local.address} / ${local.netmask}`, remote: `${remote.address} / ${remote.netmask}` }, profile, runtimeState: "unknown" as const };
}

export function buildSophosVpnXml(input: Record<string, unknown>, secret: string) {
  const p = normalizeSophosVpn(input);
  if (secret.length < 16 || secret.length > 64 || /[\u0000-\u001f]/.test(secret)) throw new Error("SOPHOS_VPN_PSK_INVALID: رمز مشترک باید بین ۱۶ و ۶۴ نویسه باشد.");
  const fields: Record<string, unknown> = {
    Name: p.vpnName, Description: "Managed site-to-site IPsec", ConnectionType: "SiteToSite", Policy: p.profileName,
    ActionOnVPNRestart: p.startupMode, AuthenticationType: "PresharedKey", PresharedKey: secret,
    SubnetFamily: "IPv4", EndpointFamily: "IPv4", LocalWANPort: p.wanInterface, RemoteHost: p.remoteGateway,
    LocalSubnet: p.localHost, LocalIDType: "IP Address", LocalID: p.localId, RemoteIDType: "IP Address", RemoteID: p.remoteId,
    UserAuthenticationMode: "Disable", Protocol: "ALL", LocalPort: "*", RemotePort: "*", Status: p.enableAfterCreate ? "Active" : "Deactive",
  };
  return `<Set operation="add"><VPNIPSecConnection><Configuration>${Object.entries(fields).map(([key, value]) => `<${key}>${xmlEscape(value)}</${key}>`).join("")}<RemoteNetwork><Network>${xmlEscape(p.remoteHost)}</Network></RemoteNetwork></Configuration></VPNIPSecConnection></Set>`;
}

export function resolveSophosVpnSecret(input: Record<string, unknown>) {
  const p = normalizeSophosVpn(input);
  const secret = resolveEphemeralSecretRef(p.pskSecretRef, SOPHOS_VPN_SECRET_PURPOSE);
  if (!secret) throw new Error("SOPHOS_VPN_SECRET_EXPIRED: رمز موقت منقضی شده؛ فرم را دوباره تکمیل کنید.");
  return secret;
}

export function verifySophosVpn(input: Record<string, unknown>, snapshot: SophosDiscovery) {
  const p = normalizeSophosVpn(input);
  const actual = snapshot.vpnConnections.find(row => row.name === p.vpnName);
  if (!actual || actual.connectionType !== "SiteToSite" || actual.profile !== p.profileName || actual.wanInterface !== p.wanInterface || actual.remoteGateway !== p.remoteGateway || actual.localSubnet !== p.localHost || actual.remoteNetworks?.length !== 1 || actual.remoteNetworks[0] !== p.remoteHost || actual.localId !== p.localId || actual.remoteId !== p.remoteId || actual.startupMode !== p.startupMode || actual.authenticationType !== "PresharedKey" || actual.status !== (p.enableAfterCreate ? "Active" : "Deactive")) throw new Error("SOPHOS_VPN_POST_VERIFY_FAILED: تغییر ارسال شد ولی تنظیمات مورد انتظار از دستگاه تأیید نشد؛ پیش از تلاش مجدد دستگاه را بررسی کنید.");
  return { verified: true, after: actual, runtimeState: "unknown", summaryFa: "تنظیمات تونل از دستگاه تأیید شد؛ برقراری واقعی تونل هنوز تأیید نشده است.", nextStepsFa: ["پروفایل IKEv2، PSK و شبکه‌های طرف مقابل را تطبیق دهید.", "برای عبور ترافیک، قوانین LAN ↔ VPN با شبکه‌های مشخص را بررسی کنید؛ این عملیات قانون بازِ عمومی ایجاد نمی‌کند.", "وضعیت SA و ترافیک را در VPN > IPsec connections دستگاه بررسی کنید."] };
}
