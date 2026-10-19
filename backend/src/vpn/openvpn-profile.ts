/** Import data, never execute an uploaded .ovpn configuration verbatim. */
export class OpenVpnProfileError extends Error { constructor(public code = "VPN_OPENVPN_PROFILE_INVALID") { super(code); } }
export type OpenVpnProfile = {
  endpoint: string; endpointPort: number; transport: "udp4" | "tcp4-client";
  ca: string; cert?: string; key?: string; tlsAuth?: string; tlsCrypt?: string;
  keyDirection?: "0" | "1"; authUserPass: boolean; auth: string; ciphers: string;
  verifyName?: string; verifyType?: "name" | "name-prefix"; mtu: number; tlsMin: "1.2" | "1.3";
};
const fail = (code?: string): never => { throw new OpenVpnProfileError(code); };
function words(line: string) {
  const tokens: string[] = []; let value = "", quote = "", active = false;
  for (const ch of line) {
    if (!quote && (ch === "#" || ch === ";") && !active) break;
    if (ch === "\\" || /[\x00-\x08\x0b-\x1f\x7f]/.test(ch)) fail();
    if (quote) { if (ch === quote) quote = ""; else value += ch; active = true; }
    else if (ch === '"' || ch === "'") { quote = ch; active = true; }
    else if (/\s/.test(ch)) { if (active) { tokens.push(value); value = ""; active = false; } }
    else { value += ch; active = true; }
  }
  if (quote) fail(); if (active) tokens.push(value); return tokens;
}
export function parseOpenVpnProfile(raw: unknown): OpenVpnProfile {
  if (typeof raw !== "string" || Buffer.byteLength(raw) > 131072) fail("VPN_OPENVPN_PROFILE_SIZE");
  const text = (raw as string).replace(/^\uFEFF/, ""), values = new Map<string, string[]>(), blocks = new Map<string, string>();
  const ignored = new Set(["route", "route-ipv6", "redirect-gateway", "redirect-private", "dhcp-option", "block-outside-dns", "register-dns", "route-metric", "route-delay"]);
  const accepted = new Set(["client", "dev", "dev-type", "proto", "remote", "port", "resolv-retry", "nobind", "persist-key", "persist-tun", "remote-cert-tls", "auth-user-pass", "auth-nocache", "auth-retry", "cipher", "data-ciphers", "data-ciphers-fallback", "auth", "key-direction", "verify-x509-name", "tls-version-min", "verb", "mute", "connect-retry", "connect-retry-max", "connect-timeout", "server-poll-timeout", "ping", "ping-restart", "keepalive", "reneg-sec", "explicit-exit-notify", "tun-mtu", "mssfix", "sndbuf", "rcvbuf", "remote-random", "pull", "float"]);
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim(); if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const start = /^<(ca|cert|key|tls-auth|tls-crypt)>$/.exec(line);
    if (start) {
      const name = start[1]; if (blocks.has(name)) fail(); const body: string[] = [];
      while (++i < lines.length && lines[i].trim() !== `</${name}>`) body.push(lines[i]);
      if (i === lines.length || body.length > 1600) fail(); const data = body.filter(v=>!v.trim().startsWith("#")).join("\n").trim();
      const pattern = name === "ca" || name === "cert" ? /^(?:-----BEGIN CERTIFICATE-----\n[A-Za-z0-9+/=\n]+\n-----END CERTIFICATE-----\s*)+$/ : name === "key" ? /^-----BEGIN ((?:RSA |EC |ENCRYPTED )?PRIVATE KEY)-----\n[A-Za-z0-9+/=\n]+\n-----END \1-----$/ : /^-----BEGIN OpenVPN Static key V1-----\n[0-9a-fA-F\n]+\n-----END OpenVPN Static key V1-----$/;
      if (!pattern.test(data) || /[\x00\r]/.test(data)) fail(); blocks.set(name, data); continue;
    }
    const [name, ...args] = words(line); if (!name) continue;
    if (ignored.has(name)) continue; // These options NEVER reach the daemon.
    if (!accepted.has(name)) fail("VPN_OPENVPN_OPTION_UNSUPPORTED");
    if (values.has(name)) fail(); values.set(name, args);
  }
  if (!values.has("client") || !blocks.has("ca") || values.get("client")!.length) fail();
  if (values.get("dev")?.[0] !== "tun" || values.get("dev-type")?.[0] === "tap") fail("VPN_OPENVPN_TUN_REQUIRED");
  const remote = values.get("remote") ?? []; if (remote.length < 1 || remote.length > 3) fail();
  const proto = remote[2] ?? values.get("proto")?.[0] ?? "udp";
  const transport = ["udp", "udp4"].includes(proto) ? "udp4" : ["tcp", "tcp-client", "tcp4-client"].includes(proto) ? "tcp4-client" : fail("VPN_OPENVPN_PROTOCOL_UNSUPPORTED");
  const endpoint = remote[0], endpointPort = Number(remote[1] ?? values.get("port")?.[0] ?? 1194);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/.test(endpoint) || !Number.isInteger(endpointPort) || endpointPort < 1 || endpointPort > 65535) fail();
  if (values.get("auth-user-pass")?.length) fail("VPN_OPENVPN_EXTERNAL_FILE");
  const cert = blocks.get("cert"), key = blocks.get("key"), authUserPass = values.has("auth-user-pass");
  if (!!cert !== !!key || !authUserPass && !key) fail();
  if (blocks.has("tls-auth") && blocks.has("tls-crypt")) fail();
  const direction = values.get("key-direction")?.[0]; if (direction && direction !== "0" && direction !== "1") fail();
  const auth = values.get("auth")?.[0] ?? "SHA256"; if (!["SHA1", "SHA256", "SHA384", "SHA512"].includes(auth)) fail("VPN_OPENVPN_CRYPTO_UNSUPPORTED");
  const ciphers = values.get("data-ciphers")?.[0] ?? values.get("cipher")?.[0] ?? "AES-256-GCM:AES-128-GCM:CHACHA20-POLY1305";
  if (!ciphers.split(":").every(v => ["AES-256-GCM", "AES-128-GCM", "CHACHA20-POLY1305", "AES-256-CBC", "AES-128-CBC"].includes(v))) fail("VPN_OPENVPN_CRYPTO_UNSUPPORTED");
  const fallback = values.get("data-ciphers-fallback")?.[0]; if (fallback && !ciphers.split(":").includes(fallback)) fail("VPN_OPENVPN_CRYPTO_UNSUPPORTED");
  const verify = values.get("verify-x509-name"), verifyType = verify?.[1] ?? "name";
  if (verify && (verify.length > 2 || !/^[a-zA-Z0-9_.@* -]{1,128}$/.test(verify[0]) || !["name", "name-prefix"].includes(verifyType))) fail();
  if (values.has("tls-version-min") && !["1.2", "1.3"].includes(values.get("tls-version-min")![0])) fail("VPN_OPENVPN_CRYPTO_UNSUPPORTED");
  const mtu = Number(values.get("tun-mtu")?.[0] ?? 1400); if (!Number.isInteger(mtu) || mtu < 1280 || mtu > 1500) fail();
  return { endpoint, endpointPort, transport, ca: blocks.get("ca")!, cert, key, tlsAuth: blocks.get("tls-auth"), tlsCrypt: blocks.get("tls-crypt"), keyDirection: direction as "0" | "1" | undefined, authUserPass, auth, ciphers, verifyName: verify?.[0], verifyType: verifyType as "name" | "name-prefix", mtu, tlsMin:values.get("tls-version-min")?.[0]==="1.3"?"1.3":"1.2" };
}
export function openVpnConfig(profile: OpenVpnProfile, endpointIp: string, iface: string, dir: string, passphrase: boolean) {
  const blocks: Array<[string, string | undefined]> = [["ca", profile.ca], ["cert", profile.cert], ["key", profile.key], ["tls-auth", profile.tlsAuth], ["tls-crypt", profile.tlsCrypt]];
  return `client\ndev ${iface}\ndev-type tun\nproto ${profile.transport}\nremote ${endpointIp} ${profile.endpointPort}\nnobind\nremote-cert-tls server\ntls-version-min ${profile.tlsMin}\nauth ${profile.auth}\ndata-ciphers ${profile.ciphers}\ndata-ciphers-fallback ${profile.ciphers.split(":")[0]}\nauth-nocache\nauth-retry none\nscript-security 1\nroute-nopull\nroute-noexec\nifconfig-noexec\npull-filter ignore redirect-\npull-filter ignore route\npull-filter ignore dhcp-option\npull-filter ignore dns\npull-filter ignore ifconfig-ipv6\npull-filter ignore block-\npull-filter ignore client-nat\npull-filter ignore compress\npull-filter ignore comp-lzo\nallow-compression no\ndisable-dco\nmanagement ${dir}/management.sock unix\ntun-mtu ${profile.mtu}\nping 10\nping-restart 40\nconnect-timeout 10\nconnect-retry 2 10\nverb 2\n${profile.authUserPass ? `auth-user-pass ${dir}/auth.txt\n` : ""}${passphrase ? `askpass ${dir}/pass.txt\n` : ""}${profile.keyDirection ? `key-direction ${profile.keyDirection}\n` : ""}${profile.verifyName ? `verify-x509-name "${profile.verifyName}" ${profile.verifyType}\n` : ""}${blocks.filter(([,v]) => v).map(([name, v]) => `<${name}>\n${v}\n</${name}>\n`).join("")}`;
}
