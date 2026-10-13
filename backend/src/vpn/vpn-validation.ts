import { isIP } from "node:net";

export class VpnError extends Error {
  constructor(public code: string, public statusCode = 400) { super(code); }
}
export type VpnConfig = {
  protocol: "wireguard" | "l2tp"; endpoint: string; endpointPort: number; routes: string[];
  address?: string; privateKey?: string; publicKey?: string; presharedKey?: string;
  mtu?: number;
  username?: string; password?: string; ipsecPsk?: string;
};
export function ipv4(value: string) {
  if (isIP(value) !== 4) throw new VpnError("VPN_IP_INVALID");
  return value.split(".").reduce((sum, byte) => sum * 256 + Number(byte), 0) >>> 0;
}
export function cidr(value: string) {
  const [host, prefix, extra] = value.split("/");
  if (extra !== undefined || !/^\d{1,2}$/.test(prefix ?? "")) throw new VpnError("VPN_ROUTES_INVALID");
  const bits = Number(prefix); if (bits < 0 || bits > 32) throw new VpnError("VPN_ROUTES_INVALID");
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  const start = (ipv4(host) & mask) >>> 0, end = start + 2 ** (32 - bits) - 1;
  return { host, bits, start, end, network: `${[24, 16, 8, 0].map(shift => (start >>> shift) & 255).join(".")}/${bits}` };
}
export const overlaps = (a: string, b: string) => { const x = cidr(a), y = cidr(b); return x.start <= y.end && y.start <= x.end; };
export const contains = (range: string, host: string) => { const x = cidr(range), n = ipv4(host); return n >= x.start && n <= x.end; };
const privateRanges = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"].map(cidr);
export function privateRoute(value: string) {
  const x = cidr(value);
  if (x.bits < 16 || !privateRanges.some(p => x.start >= p.start && x.end <= p.end)) throw new VpnError("VPN_ROUTES_INVALID");
  return x.network;
}
function key(value: unknown, optional = false) {
  if (optional && !value) return undefined;
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(value) || Buffer.from(value, "base64").length !== 32) throw new VpnError("VPN_KEY_INVALID");
  return value;
}
function secret(value: unknown) {
  if (typeof value !== "string" || !value.length || value.length > 256 || /[\x00-\x1f\x7f]/.test(value)) throw new VpnError("VPN_CREDENTIAL_INVALID");
  return value;
}
export function validateVpn(input: Record<string, unknown>): VpnConfig {
  if (!["wireguard", "l2tp"].includes(String(input.protocol))) throw new VpnError("VPN_PROTOCOL_INVALID");
  const endpoint = String(input.endpoint ?? "").trim();
  if (endpoint.length > 253 || !/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?)$/.test(endpoint) || endpoint === "localhost" || isIP(endpoint) === 6) throw new VpnError("VPN_ENDPOINT_INVALID");
  if (/^[\d.]+$/.test(endpoint) && isIP(endpoint) !== 4) throw new VpnError("VPN_ENDPOINT_INVALID");
  if (isIP(endpoint) === 4 && (endpoint.startsWith("127.") || endpoint.startsWith("0.") || ipv4(endpoint) >= ipv4("224.0.0.0"))) throw new VpnError("VPN_ENDPOINT_INVALID");
  const rawRoutes = Array.isArray(input.routes) ? input.routes : [];
  if (!rawRoutes.length || rawRoutes.length > 8) throw new VpnError("VPN_ROUTES_INVALID");
  const routes = [...new Set(rawRoutes.map(value => privateRoute(String(value).trim())))];
  if (routes.some((a, i) => routes.some((b, j) => j > i && overlaps(a, b)))) throw new VpnError("VPN_ROUTE_OVERLAP");
  const protocol = input.protocol as VpnConfig["protocol"], endpointPort = protocol === "l2tp" ? 1701 : Number(input.endpointPort ?? 51820);
  if (!Number.isInteger(endpointPort) || endpointPort < 1 || endpointPort > 65535) throw new VpnError("VPN_PORT_INVALID");
  if (isIP(endpoint) === 4 && routes.some(route => contains(route, endpoint))) throw new VpnError("VPN_ENDPOINT_IN_ROUTE");
  const config: VpnConfig = { protocol, endpoint, endpointPort, routes };
  if (protocol === "wireguard") {
    const mtu = Number(input.mtu ?? 1420);
    if (!Number.isInteger(mtu) || mtu < 1280 || mtu > 1420) throw new VpnError("VPN_MTU_INVALID");
    config.mtu = mtu;
    const address = String(input.address ?? "").trim(), parsed = cidr(address);
    privateRoute(address);
    if (parsed.host.endsWith(".0") || parsed.host.endsWith(".255")) throw new VpnError("VPN_ADDRESS_INVALID");
    config.address = `${parsed.host}/32`; // No implicit subnet route from the tunnel's address.
    config.privateKey = key(input.privateKey); config.publicKey = key(input.publicKey); config.presharedKey = key(input.presharedKey, true);
  } else {
    config.username = secret(input.username); config.password = secret(input.password); config.ipsecPsk = secret(input.ipsecPsk);
  }
  return config;
}
export const configQuote = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
export function wireguardConfig(config: VpnConfig, endpointIp: string) {
  return `[Interface]\nPrivateKey = ${config.privateKey}\n[Peer]\nPublicKey = ${config.publicKey}\n${config.presharedKey ? `PresharedKey = ${config.presharedKey}\n` : ""}Endpoint = ${endpointIp}:${config.endpointPort}\nAllowedIPs = ${config.routes.join(", ")}\nPersistentKeepalive = 25\n`;
}
export function l2tpConfigs(config: VpnConfig, endpointIp: string, id: string, directory: string) {
  const ipsec = `config setup\n  uniqueids=no\nconn ${id}\n  keyexchange=ikev1\n  authby=secret\n  type=transport\n  left=%defaultroute\n  leftprotoport=17/1701\n  right=${endpointIp}\n  rightprotoport=17/1701\n  ike=aes256-sha256-modp2048,aes128-sha1-modp2048!\n  esp=aes256-sha256,aes128-sha1!\n  forceencaps=yes\n  dpddelay=15\n  dpdtimeout=45\n  dpdaction=clear\n  keyingtries=1\n  auto=add\n`;
  const ipsecSecrets = `%any ${endpointIp} : PSK ${configQuote(config.ipsecPsk!)}\n`;
  const ppp = `noauth\nrefuse-eap\nrefuse-pap\nrefuse-chap\nrefuse-mschap\nname ${configQuote(config.username!)}\npassword ${configQuote(config.password!)}\nnodefaultroute\nnoipv6\nnoipdefault\nnoccp\nhide-password\nlogfd 2\nmtu 1400\nmru 1400\nlcp-echo-interval 10\nlcp-echo-failure 3\nmaxfail 1\nifname ${id}\nipparam ${id}\n`;
  const l2tp = `[global]\nport = 1701\n[lac appvpn]\nlns = ${endpointIp}\npppoptfile = ${directory}/ppp.options\nlength bit = yes\nredial = no\nautodial = no\n`;
  return { ipsec, ipsecSecrets, ppp, l2tp };
}
