import net from "node:net";
import type { Device, Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { syncDeviceRecordToAsset } from "./asset-intelligence.service.js";
import { testDeviceConnection } from "../services/device.service.js";
import { probeLinuxListeningPorts } from "../connectors/linux-ssh.connector.js";
import { refreshDeviceVendorCapabilities, VendorCapabilityRefreshError } from "../vendors/capability-discovery.service.js";

type PortMetadata = {
  operationalStatus?: "up" | "down" | "unknown";
  administrativeStatus?: "up" | "down" | "unknown";
  speed?: string;
  vlan?: string;
  description?: string;
  ipAddresses?: string[];
  source?: "discovered" | "inferred" | "manual";
  confidence?: number;
  sourceProtocol?: string;
  peerName?: string;
  peerPort?: string;
  peerIp?: string;
  cableType?: string;
  note?: string;
  manualOverride?: boolean;
  lastDiscoveredAt?: string;
  updatedByUserId?: string;
};

type ServiceEndpoint = {
  key: string;
  protocol: "tcp" | "udp" | "sctp" | "other";
  address: string;
  port: number;
  state: "listening" | "allowed" | "disabled" | "unknown";
  exposure: "all_interfaces" | "loopback" | "interface" | "policy" | "unknown";
  process?: string;
  serviceName?: string;
  source: string;
  confidence: number;
  note?: string;
  manualOverride?: boolean;
  discoveredAt?: string;
  bindings?: ServiceBinding[];
  replacesKey?: string;
};

type ServiceBinding = Pick<ServiceEndpoint, "address" | "exposure" | "state" | "source" | "confidence" | "discoveredAt"> & {
  process?: string;
  serviceName?: string;
};

type ServiceTopologyMetadata = {
  servicePortOverrides?: Record<string, ServiceEndpoint>;
};

const PORT_NAME = /^[\p{L}\p{N}][\p{L}\p{N}._:/ -]{0,79}$/u;
const TEXT_LIMIT = 160;
const SERVICE_LIMIT = 256;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function text(value: unknown, limit = TEXT_LIMIT) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function portName(value: unknown) {
  const name = text(value, 80);
  if (!PORT_NAME.test(name)) throw new Error("INVALID_PORT_NAME");
  return name;
}

function status(value: unknown): PortMetadata["operationalStatus"] {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["up", "running", "connected", "active", "yes", "true"].includes(normalized)) return "up";
  if (["down", "disabled", "notconnect", "inactive", "no", "false", "administratively down", "err-disabled", "suspended", "sfpabsent"].includes(normalized)) return "down";
  return "unknown";
}

function administrativeStatus(value: unknown): PortMetadata["administrativeStatus"] {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["administratively down", "disabled", "shutdown", "false", "no"].includes(normalized)) return "down";
  // In IOS `show ip interface brief`, Status=down means the interface is enabled but
  // has no carrier. Only "administratively down" means a configured shutdown.
  if (["up", "down", "enabled", "true", "yes"].includes(normalized)) return "up";
  return "unknown";
}

function canonicalCiscoInterfaceName(value: unknown) {
  const name = text(value, 80).replace(/\s+/g, "");
  const aliases: Array<[RegExp, string]> = [
    [/^Gi(?=\d)/i, "GigabitEthernet"],
    [/^Fa(?=\d)/i, "FastEthernet"],
    [/^Te(?=\d)/i, "TenGigabitEthernet"],
    [/^Fo(?=\d)/i, "FortyGigabitEthernet"],
    [/^Hu(?=\d)/i, "HundredGigE"],
    [/^Twe(?=\d)/i, "TwentyFiveGigE"],
    [/^Po(?=\d)/i, "Port-channel"],
    [/^Vl(?=\d)/i, "Vlan"],
    [/^Et(?=\d)/i, "Ethernet"]
  ];
  return aliases.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), name);
}

function interfaceAddresses(value: unknown) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,]+/) : [];
  return [...new Set(values.map(String).map((item) => item.trim().replace(/^addr(?:ess)?=/i, "")).filter((item) => {
    const [address, prefix] = item.replace(/^\[|\]$/g, "").split("/");
    const version = net.isIP(address);
    if (!version) return false;
    if (prefix === undefined) return true;
    const parsed = Number(prefix);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= (version === 4 ? 32 : 128);
  }))].slice(0, 16);
}

function metadata(value: unknown): PortMetadata {
  return object(value) as PortMetadata;
}

function protocol(value: unknown): ServiceEndpoint["protocol"] {
  const normalized = String(value ?? "").toLowerCase();
  return normalized.startsWith("tcp") ? "tcp" : normalized.startsWith("udp") ? "udp" : normalized.startsWith("sctp") ? "sctp" : "other";
}

function endpointKey(item: Pick<ServiceEndpoint, "protocol" | "port">) {
  return `${item.protocol}:${item.port}`.toLowerCase();
}

function endpointKeyFromStoredKey(value: string) {
  const match = value.toLowerCase().match(/^(tcp|udp|sctp|other):(?:.*:)?(\d{1,5})$/);
  if (!match) return "";
  const port = Number(match[2]);
  return port >= 1 && port <= 65535 ? `${match[1]}:${port}` : "";
}

function exposure(addressValue: string): ServiceEndpoint["exposure"] {
  const address = addressValue.replace(/^\[|\]$/g, "").toLowerCase();
  if (["*", "0.0.0.0", "::", ":::"].includes(address)) return "all_interfaces";
  if (address === "localhost" || address === "::1" || address.startsWith("127.")) return "loopback";
  return net.isIP(address) ? "interface" : "unknown";
}

function serviceCandidate(input: Partial<ServiceEndpoint>) {
  const port = Number(input.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const item: ServiceEndpoint = {
    key: "",
    protocol: protocol(input.protocol),
    address: text(input.address, 100) || "*",
    port,
    state: input.state ?? "unknown",
    exposure: input.exposure ?? exposure(text(input.address, 100) || "*"),
    process: text(input.process, 100) || undefined,
    serviceName: text(input.serviceName, 100) || undefined,
    source: text(input.source, 60) || "inventory",
    confidence: Math.min(1, Math.max(0, Number(input.confidence) || 0.7)),
    discoveredAt: input.discoveredAt ?? new Date().toISOString()
  };
  item.key = endpointKey(item);
  item.bindings = [serviceBinding(item)];
  return item;
}

function serviceBinding(item: ServiceBinding): ServiceBinding {
  return {
    address: item.address,
    exposure: item.exposure,
    state: item.state,
    process: item.process,
    serviceName: item.serviceName,
    source: item.source,
    confidence: item.confidence,
    discoveredAt: item.discoveredAt
  };
}

function normalizedAddress(value: string) {
  return value.replace(/^\[|\]$/g, "").toLowerCase();
}

function mergeBindings(left: ServiceEndpoint, right: ServiceEndpoint) {
  const bindings: ServiceBinding[] = [];
  const add = (candidate: ServiceBinding) => {
    const address = normalizedAddress(candidate.address);
    const processName = (candidate.process ?? candidate.serviceName ?? "").toLowerCase();
    const existingIndex = bindings.findIndex((item) => {
      if (normalizedAddress(item.address) !== address) return false;
      const existingProcess = (item.process ?? item.serviceName ?? "").toLowerCase();
      return !processName || !existingProcess || processName === existingProcess;
    });
    if (existingIndex < 0) {
      bindings.push(serviceBinding(candidate));
      return;
    }
    const existing = bindings[existingIndex];
    bindings[existingIndex] = {
      ...existing,
      ...candidate,
      process: candidate.process ?? existing.process,
      serviceName: candidate.serviceName ?? existing.serviceName,
      confidence: Math.max(existing.confidence, candidate.confidence)
    };
  };
  for (const binding of left.bindings?.length ? left.bindings : [serviceBinding(left)]) add(binding);
  for (const binding of right.bindings?.length ? right.bindings : [serviceBinding(right)]) add(binding);
  return bindings;
}

const stateRank: Record<ServiceEndpoint["state"], number> = { listening: 4, allowed: 3, unknown: 2, disabled: 1 };
const exposureRank: Record<ServiceEndpoint["exposure"], number> = { all_interfaces: 5, interface: 4, policy: 3, loopback: 2, unknown: 1 };

function endpointRank(item: ServiceEndpoint) {
  const ipv4AllInterfaces = item.address === "0.0.0.0" ? 1 : 0;
  return stateRank[item.state] * 100 + exposureRank[item.exposure] * 10 + item.confidence + ipv4AllInterfaces;
}

function mergeServiceEndpoints(left: ServiceEndpoint, right: ServiceEndpoint, preferRight = false): ServiceEndpoint {
  const preferred = preferRight || endpointRank(right) > endpointRank(left) ? right : left;
  const fallback = preferred === right ? left : right;
  return {
    ...fallback,
    ...preferred,
    key: endpointKey(preferred),
    process: preferred.process ?? fallback.process,
    serviceName: preferred.serviceName ?? fallback.serviceName,
    confidence: Math.max(left.confidence, right.confidence),
    bindings: mergeBindings(left, right)
  };
}

function parseListeningLine(line: string) {
  const kind = protocol(line.match(/^\s*(tcp|udp|sctp)\S*/i)?.[1]);
  const matches = Array.from(line.matchAll(/(?:^|\s)(\[[^\]]+\]|\*|[0-9a-fA-F:.%]+):(\d+)(?=\s|$)/g));
  const local = matches[0];
  if (!local) return null;
  const process = line.match(/users:\(\("([^"]+)"/)?.[1] ?? line.match(/\b(?:users?|process)=([^\s,]+)/i)?.[1];
  return serviceCandidate({
    protocol: kind,
    address: local[1],
    port: Number(local[2]),
    state: /LISTEN|UNCONN/i.test(line) ? "listening" : "unknown",
    process,
    serviceName: process,
    source: "linux-ss",
    confidence: 0.96
  });
}

function parseLinuxFirewallPorts(output: string) {
  const items: ServiceEndpoint[] = [];
  let adapter = "firewall";
  const add = (kind: unknown, portValue: unknown) => {
    const item = serviceCandidate({
      protocol: protocol(kind),
      address: "firewall",
      port: Number(portValue),
      state: "allowed",
      exposure: "policy",
      serviceName: `${adapter} allow rule`,
      source: `linux-${adapter}`,
      confidence: 0.92
    });
    if (item) items.push(item);
  };

  for (const rawLine of output.split(/\r?\n/).slice(0, 2_000)) {
    const line = rawLine.trim();
    const marker = line.match(/^__(UFW|FIREWALLD|NFT|IPTABLES)__$/i)?.[1];
    if (marker) { adapter = marker.toLowerCase(); continue; }
    if (!line) continue;

    if (adapter === "ufw" || /\bALLOW\b/i.test(line)) {
      const match = line.match(/^(\d{1,5})(?:[:\d-]*)\/(tcp|udp)\s+ALLOW\b/i);
      if (match) add(match[2], match[1]);
      continue;
    }
    if (adapter === "firewalld") {
      for (const match of line.matchAll(/(?:^|\s)(\d{1,5})\/(tcp|udp)(?=\s|$)/gi)) add(match[2], match[1]);
      continue;
    }
    if (adapter === "nft") {
      const match = line.match(/\b(tcp|udp)\s+dport\s+(\d{1,5})\b.*\baccept\b/i);
      if (match) add(match[1], match[2]);
      continue;
    }
    if (adapter === "iptables") {
      const match = line.match(/(?:^|\s)-p\s+(tcp|udp)\b.*(?:^|\s)--dport\s+(\d{1,5})\b.*(?:^|\s)-j\s+ACCEPT\b/i);
      if (match) add(match[1], match[2]);
    }
  }
  return items;
}

function parseMikroTikService(line: string) {
  const values = Object.fromEntries(Array.from(line.matchAll(/([\w-]+)=("[^"]*"|\S+)/g)).map((match) => [match[1], match[2].replace(/^"|"$/g, "")]));
  const port = Number(values.port);
  if (!port) return null;
  const disabled = values.disabled === "true" || /(?:^|\s)X(?:\s|$)/.test(line);
  return serviceCandidate({
    protocol: protocol(values.protocol ?? "tcp"),
    address: values.address && values.address !== "0.0.0.0/0" ? values.address.split("/")[0] : "0.0.0.0",
    port,
    state: disabled ? "disabled" : "listening",
    serviceName: values.name,
    source: "mikrotik-ip-service",
    confidence: 0.94
  });
}

function parseFortiGateServices(output: string) {
  const items: ServiceEndpoint[] = [];
  for (const block of output.split(/^\s*edit\s+/m).slice(1, SERVICE_LIMIT + 1)) {
    const serviceName = block.match(/^"?([^"\r\n]+)"?/)?.[1]?.trim();
    for (const [kind, ranges] of [["tcp", block.match(/^\s*set\s+tcp-portrange\s+(.+)$/m)?.[1]], ["udp", block.match(/^\s*set\s+udp-portrange\s+(.+)$/m)?.[1]]] as const) {
      for (const token of (ranges ?? "").split(/\s+/).slice(0, 64)) {
        const firstPort = Number(token.match(/^(\d+)/)?.[1]);
        const item = serviceCandidate({ protocol: kind, address: "policy", port: firstPort, state: "allowed", exposure: "policy", serviceName, source: "fortigate-service-object", confidence: 0.82 });
        if (item) items.push(item);
      }
    }
  }
  return items;
}

export function collectServiceEndpoints(device: Device, snapshot?: unknown, options: { includeLiveStatus?: boolean; includeExplicitInventory?: boolean } = {}) {
  const found = new Map<string, ServiceEndpoint>();
  const add = (entry: ServiceEndpoint | null) => {
    if (!entry) return;
    const existing = found.get(entry.key);
    found.set(entry.key, existing ? mergeServiceEndpoints(existing, entry) : entry);
  };
  const root = object(device.capabilities);
  const linuxStatus = object(root.linuxStatus);
  if (options.includeLiveStatus !== false) {
    for (const line of text(linuxStatus.listeningPorts, 100_000).split(/\r?\n/).slice(0, SERVICE_LIMIT)) add(parseListeningLine(line));
    for (const item of parseLinuxFirewallPorts(`${text(linuxStatus.firewallPorts, 300_000)}\n__UFW__\n${text(linuxStatus.ufwStatus, 100_000)}`)) add(item);
  }

  const snapshotNetwork = object(object(snapshot).network);
  for (const line of Array.isArray(snapshotNetwork.listeningPorts) ? snapshotNetwork.listeningPorts.slice(0, SERVICE_LIMIT) : []) {
    if (typeof line === "string") add(parseListeningLine(line));
  }

  const mikrotik = object(object(root.mikrotikStatus).mikrotik);
  for (const line of Array.isArray(mikrotik.services) ? mikrotik.services.slice(0, SERVICE_LIMIT) : []) {
    if (typeof line === "string") add(parseMikroTikService(line));
  }

  const fortigate = object(object(root.fortigateStatus).fortigate);
  const fortiRaw = object(fortigate.raw);
  for (const item of parseFortiGateServices(text(fortiRaw["show firewall service custom"], 300_000))) add(item);

  const sophos = object(object(root.sophosStatus).sophos);
  for (const item of Array.isArray(sophos.services) ? sophos.services.slice(0, SERVICE_LIMIT) : []) {
    const row = object(item);
    const serviceName = text(row.name, TEXT_LIMIT) || undefined;
    const serviceProtocol = protocol(row.protocol ?? "tcp");
    for (const value of Array.isArray(row.ports) ? row.ports.slice(0, 128) : []) {
      const port = Number(String(value).match(/\b(\d{1,5})\b/)?.[1]);
      add(serviceCandidate({
        protocol: serviceProtocol,
        address: "policy",
        port,
        state: "allowed",
        exposure: "policy",
        serviceName,
        source: "sophos-xml-api-service",
        confidence: 0.92
      }));
    }
  }

  const inventoryExposure: ServiceEndpoint["exposure"] = /forti|sophos|sfos|pfsense|cisco|mikrotik/i.test(`${device.vendor} ${device.type}`) ? "policy" : "unknown";
  const visitExplicitPorts = (value: unknown, key = "", depth = 0) => {
    if (depth > 5) return;
    if (Array.isArray(value)) {
      for (const item of value.slice(0, SERVICE_LIMIT)) visitExplicitPorts(item, key, depth + 1);
      return;
    }
    if (value && typeof value === "object") {
      for (const [nestedKey, nested] of Object.entries(object(value))) visitExplicitPorts(nested, nestedKey, depth + 1);
      return;
    }
    if (!/service|listen|open.?port/i.test(key)) return;
    if (typeof value === "number") {
      add(serviceCandidate({ protocol: "tcp", address: inventoryExposure === "policy" ? "policy" : "*", port: value, state: inventoryExposure === "policy" ? "allowed" : "unknown", exposure: inventoryExposure, source: `${device.vendor}-inventory`, confidence: 0.62 }));
      return;
    }
    if (typeof value === "string") {
      for (const line of value.split(/\r?\n/).slice(0, SERVICE_LIMIT)) {
        const listener = parseListeningLine(line);
        if (listener) { add(listener); continue; }
        const port = Number(line.match(/(?:port|listen|dst-port|destination-port)[\s=:]+(\d{1,5})/i)?.[1]);
        if (port) add(serviceCandidate({ protocol: protocol(line.match(/\b(tcp|udp|sctp)\b/i)?.[1] ?? "tcp"), address: inventoryExposure === "policy" ? "policy" : "*", port, state: inventoryExposure === "policy" ? "allowed" : "unknown", exposure: inventoryExposure, serviceName: line.match(/(?:name|service)[\s=:]+"?([^"\s]+)/i)?.[1], source: `${device.vendor}-inventory`, confidence: 0.62 }));
      }
      return;
    }
  };
  if (!found.size && options.includeExplicitInventory !== false) for (const [key, value] of Object.entries(root)) visitExplicitPorts(value, key);

  return [...found.values()].slice(0, SERVICE_LIMIT);
}

type ServiceSnapshot = { dataJson: unknown; collectedAt: Date };

export function collectFreshServiceEndpoints(device: Device, snapshot?: ServiceSnapshot) {
  const isLinux = /linux/i.test(`${device.vendor} ${device.type}`);
  if (!isLinux) {
    return { endpoints: collectServiceEndpoints(device, snapshot?.dataJson), source: "inventory" as const, observedAt: snapshot?.collectedAt ?? null };
  }

  const linuxStatus = object(object(device.capabilities).linuxStatus);
  const liveObservedAt = new Date(text(linuxStatus.listeningPortsCheckedAt, 64));
  const liveObservedMs = Number.isFinite(liveObservedAt.getTime()) ? liveObservedAt.getTime() : 0;
  const snapshotObservedMs = snapshot?.collectedAt.getTime() ?? 0;
  const hasReliableLiveInventory = linuxStatus.listeningPortsCollected === true && typeof linuxStatus.listeningPorts === "string";

  if (hasReliableLiveInventory && (!snapshot || liveObservedMs >= snapshotObservedMs)) {
    return {
      endpoints: collectServiceEndpoints(device, undefined, { includeLiveStatus: true, includeExplicitInventory: false }),
      source: "live" as const,
      observedAt: liveObservedAt
    };
  }
  if (snapshot) {
    return {
      endpoints: collectServiceEndpoints(device, snapshot.dataJson, { includeLiveStatus: false, includeExplicitInventory: false }),
      source: "snapshot" as const,
      observedAt: snapshot.collectedAt
    };
  }
  return { endpoints: [], source: "unavailable" as const, observedAt: null };
}

function candidate(nameValue: unknown, details: Record<string, unknown> = {}) {
  const name = text(nameValue, 80);
  if (!PORT_NAME.test(name) || /^(lo|loopback)$/i.test(name)) return null;
  const operationalStatus = status(details.operationalStatus ?? details.protocolStatus ?? details.status ?? details.state ?? details.running ?? details.link);
  const adminStatus = administrativeStatus(details.administrativeStatus ?? details.adminStatus ?? details.adminState ?? details.enabled);
  const rawType = text(details.type ?? details.kind, 40).toLowerCase();
  const normalizedType = /^(ether|ethernet|1000base|10gbase)/.test(rawType)
    ? "ethernet"
    : /sfp|qsfp|fiber|fibre/.test(rawType)
      ? "fiber"
      : /wlan|wifi|wireless/.test(rawType)
        ? "wireless"
        : rawType;
  const addresses = interfaceAddresses(details.ipAddresses ?? details.addresses ?? details.ipv4 ?? details.ipAddress ?? (!details.peerName ? details.address ?? details.ip : undefined));
  return {
    name,
    type: normalizedType || (/sfp|qsfp/i.test(name) ? "fiber" : /wlan|wifi|wireless/i.test(name) ? "wireless" : "ethernet"),
    macAddress: text(details.macAddress ?? details.mac ?? details["mac-address"], 40) || null,
    meta: {
      operationalStatus,
      administrativeStatus: adminStatus,
      speed: text(details.speed, 40) || undefined,
      vlan: text(details.vlan ?? details.pvid, 30) || undefined,
      description: text(details.description ?? details.comment ?? details.nameDescription, TEXT_LIMIT) || undefined,
      ipAddresses: addresses.length ? addresses : undefined,
      source: "discovered" as const,
      confidence: Number(details.confidence) || 0.78,
      sourceProtocol: text(details.sourceProtocol ?? details.protocol, 30) || "inventory",
      peerName: text(details.peerName ?? details.identity ?? details.systemName ?? details.hostname ?? details.neighbor, TEXT_LIMIT) || undefined,
      peerPort: text(details.peerPort ?? details.remotePort ?? details.portId ?? details["port-id"], 80) || undefined,
      peerIp: text(details.peerIp ?? details.address ?? details.ip, 80) || undefined
    }
  };
}

function linuxInterfaceLine(line: string) {
  const match = line.trim().match(/^(\S+)\s+(UP|DOWN|UNKNOWN|LOWERLAYERDOWN|DORMANT|NOTPRESENT)\s*(.*)$/i);
  if (!match) return null;
  return candidate(match[1], { status: match[2], addresses: match[3], sourceProtocol: "ip-brief-address", confidence: 0.94 });
}

function routerOsLine(line: string) {
  const values = Object.fromEntries(Array.from(line.matchAll(/([\w-]+)=("[^"]*"|\S+)/g)).map((match) => [match[1], match[2].replace(/^"|"$/g, "")]));
  const operationalStatus = /(?:^|\s)R(?:\s|$)/.test(line) ? "up" : /(?:^|\s)X(?:\s|$)/.test(line) ? "down" : values.running;
  return candidate(values.name ?? values.interface ?? line.match(/\b(?:ether|sfp|qsfp|wlan|bridge)\S*/i)?.[0], {
    ...values,
    status: operationalStatus,
    peerName: values.identity,
    peerPort: values["interface-name"] ?? values["port-id"],
    peerIp: values.address,
    sourceProtocol: values.identity ? "neighbor-discovery" : "inventory",
    confidence: values.identity ? 0.88 : 0.78
  });
}

export function collectPortCandidates(device: Device) {
  const found = new Map<string, NonNullable<ReturnType<typeof candidate>>>();
  const add = (entry: ReturnType<typeof candidate>, canonicalizeCisco = false) => {
    if (!entry) return;
    const name = canonicalizeCisco ? canonicalCiscoInterfaceName(entry.name) : entry.name;
    const normalized = { ...entry, name };
    const existing = found.get(name);
    if (!existing) { found.set(name, normalized); return; }
    const preferNewStatus = normalized.meta.operationalStatus !== "unknown";
    found.set(name, {
      ...existing,
      ...normalized,
      type: normalized.type === "ethernet" && existing.type !== "ethernet" ? existing.type : normalized.type,
      macAddress: normalized.macAddress ?? existing.macAddress,
      meta: {
        ...existing.meta,
        ...normalized.meta,
        operationalStatus: preferNewStatus ? normalized.meta.operationalStatus : existing.meta.operationalStatus,
        administrativeStatus: normalized.meta.administrativeStatus !== "unknown" ? normalized.meta.administrativeStatus : existing.meta.administrativeStatus,
        ipAddresses: normalized.meta.ipAddresses ?? existing.meta.ipAddresses,
        description: normalized.meta.description ?? existing.meta.description,
        speed: normalized.meta.speed ?? existing.meta.speed,
        vlan: normalized.meta.vlan ?? existing.meta.vlan,
        peerName: normalized.meta.peerName ?? existing.meta.peerName,
        peerPort: normalized.meta.peerPort ?? existing.meta.peerPort,
        peerIp: normalized.meta.peerIp ?? existing.meta.peerIp,
        sourceProtocol: normalized.meta.sourceProtocol === "inventory" ? existing.meta.sourceProtocol ?? normalized.meta.sourceProtocol : normalized.meta.sourceProtocol
      }
    });
  };
  const root = object(device.capabilities);

  // Cisco inventory contains raw command output, timestamps and several representations of
  // the same interface. Read only the two normalized tables and merge Gi/Fa abbreviations
  // with their long IOS names. Recursively walking this payload creates phantom ports.
  const ciscoDevice = /cisco/i.test(`${device.vendor} ${device.type}`);
  if (ciscoDevice) {
    const cisco = object(root.cisco);
    const collection = object(cisco.collection);
    const interfaces = object(collection.interfaces);
    for (const value of [interfaces.summary, interfaces.switchports]) {
      for (const item of Array.isArray(value) ? value.slice(0, 512) : []) {
        const row = object(item);
        add(candidate(row.name ?? row.interface, { ...row, sourceProtocol: "cisco-ios-inventory", confidence: 0.98 }), true);
      }
    }
    if (found.size) return [...found.values()].slice(0, 512);
  }

  // Sophos XML API already returns normalized interface objects. Consume only that
  // collection so status timestamps and service/rule objects never become fake ports.
  const sophosDevice = /sophos|sfos|cyberoam/i.test(`${device.vendor} ${device.type}`);
  if (sophosDevice) {
    const sophos = object(object(root.sophosStatus).sophos);
    for (const item of Array.isArray(sophos.interfaces) ? sophos.interfaces.slice(0, 512) : []) {
      const row = object(item);
      const hardware = row.hardware ?? row.name;
      add(candidate(hardware, {
        operationalStatus: row.operationalStatus,
        administrativeStatus: row.administrativeStatus === "down" ? "disabled" : row.administrativeStatus,
        ipAddresses: row.ipAddresses,
        macAddress: row.macAddress,
        speed: row.speed,
        vlan: row.zone,
        description: row.name !== hardware ? row.name : undefined,
        sourceProtocol: "sophos-xml-api",
        confidence: 0.99
      }));
    }
    if (found.size) return [...found.values()].slice(0, 512);
  }

  const visit = (value: unknown, key = "", depth = 0) => {
    if (depth > 6 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      if (/interface|port|switchport/i.test(key)) {
        for (const item of value.slice(0, 256)) {
          if (typeof item === "string") add(routerOsLine(item) ?? candidate(item));
          else if (item && typeof item === "object") {
            const row = object(item);
            add(candidate(row.name ?? row.interface ?? row.port ?? row.localInterface, row));
          }
        }
      }
      for (const item of value.slice(0, 256)) visit(item, key, depth + 1);
      return;
    }
    if (typeof value === "object") {
      const row = object(value);
      const localName = row.localInterface ?? row.localPort ?? row.interface ?? row.name ?? row.port;
      const peerName = row.peerName ?? row.identity ?? row.systemName ?? row.hostname ?? row.neighbor;
      if (localName && peerName) {
        add(candidate(localName, {
          ...row,
          peerName,
          peerPort: row.peerPort ?? row.remotePort ?? row.portId ?? row["port-id"],
          peerIp: row.peerIp ?? row.address ?? row.ip,
          sourceProtocol: row.protocol ?? (/lldp/i.test(key) ? "lldp" : /cdp/i.test(key) ? "cdp" : "neighbor-discovery"),
          confidence: 0.88
        }));
      }
      for (const [nestedKey, nested] of Object.entries(row)) visit(nested, nestedKey, depth + 1);
      return;
    }
    if (typeof value === "string" && /interface|port|switchport/i.test(key)) {
      for (const line of value.split(/\r?\n/).slice(0, 256)) add(routerOsLine(line) ?? linuxInterfaceLine(line) ?? candidate(line.split(/\s+/)[0]));
    }
  };
  visit(root);

  const fortigate = object(object(root.fortigateStatus).fortigate);
  for (const item of Array.isArray(fortigate.interfaceDetails) ? fortigate.interfaceDetails : []) {
    const row = object(item); add(candidate(row.name, row));
  }
  if (!found.size) add(candidate(device.type === "linux_edge" || device.vendor.toLowerCase().includes("linux") ? "eth0" : "port1", { status: device.status, description: "Management path inferred from the registered device" }));
  return [...found.values()].slice(0, 256);
}

async function ensureAsset(device: Device) {
  return prisma.$transaction(async (tx) => (await syncDeviceRecordToAsset(tx, device)).asset);
}

async function mergeDiscoveredPorts(device: Device) {
  const asset = await ensureAsset(device);
  const entries = collectPortCandidates(device);
  const now = new Date().toISOString();
  const existingInterfaces = await prisma.assetInterface.findMany({ where: { assetId: asset.id } });
  const existingByName = new Map(existingInterfaces.map((item) => [item.name, item]));
  const operations = entries.map((entry) => {
    const existing = existingByName.get(entry.name);
    const previous = metadata(existing?.metadataJson);
    const next = previous.manualOverride ? { ...entry.meta, ...previous, lastDiscoveredAt: now } : { ...previous, ...entry.meta, lastDiscoveredAt: now };
    const enabled = next.administrativeStatus === "down" ? false : next.administrativeStatus === "up" ? true : existing?.enabled ?? true;
    return prisma.assetInterface.upsert({
      where: { assetId_name: { assetId: asset.id, name: entry.name } },
      update: { type: entry.type, macAddress: entry.macAddress ?? undefined, enabled, metadataJson: toJson(next) },
      create: { assetId: asset.id, name: entry.name, type: entry.type, macAddress: entry.macAddress, enabled, metadataJson: toJson(next) }
    });
  });
  const discoveredNames = new Set(entries.map((entry) => entry.name));
  const staleIds = existingInterfaces.filter((item) => !metadata(item.metadataJson).manualOverride && !discoveredNames.has(item.name)).map((item) => item.id);
  if (staleIds.length) operations.push(prisma.assetInterface.deleteMany({ where: { id: { in: staleIds } } }) as never);
  if (operations.length) await prisma.$transaction(operations);
  return entries.length;
}

function portResponse(item: { id: string; name: string; type: string | null; macAddress: string | null; enabled: boolean; metadataJson: unknown; updatedAt: Date }) {
  const meta = metadata(item.metadataJson);
  return {
    id: item.id,
    name: item.name,
    type: item.type ?? "ethernet",
    macAddress: item.macAddress,
    enabled: item.enabled,
    operationalStatus: meta.operationalStatus ?? (item.enabled ? "unknown" : "down"),
    administrativeStatus: meta.administrativeStatus ?? (item.enabled ? "unknown" : "down"),
    speed: meta.speed,
    vlan: meta.vlan,
    description: meta.description,
    ipAddresses: meta.ipAddresses,
    source: meta.source,
    confidence: meta.confidence,
    sourceProtocol: meta.sourceProtocol,
    peerName: meta.peerName,
    peerPort: meta.peerPort,
    peerIp: meta.peerIp,
    cableType: meta.cableType,
    note: meta.note,
    manualOverride: Boolean(meta.manualOverride),
    lastDiscoveredAt: meta.lastDiscoveredAt,
    updatedAt: item.updatedAt
  };
}

function serviceOverrides(metadataJson: unknown) {
  return object(object(metadataJson).servicePortOverrides) as Record<string, ServiceEndpoint>;
}

function effectiveServiceEndpoints(discovered: ServiceEndpoint[], metadataJson: unknown) {
  const overrides = serviceOverrides(metadataJson);
  const merged = new Map<string, ServiceEndpoint>();
  for (const item of discovered) {
    const key = endpointKey(item);
    const existing = merged.get(key);
    merged.set(key, existing ? mergeServiceEndpoints(existing, item) : { ...item, key });
  }
  for (const item of Object.values(overrides)) {
    const normalized = serviceCandidate(item);
    if (!normalized) continue;
    const key = endpointKey(normalized);
    const override = { ...normalized, ...item, key, manualOverride: true, bindings: normalized.bindings };
    if (override.replacesKey && override.replacesKey !== key) merged.delete(override.replacesKey);
    const existing = merged.get(key);
    merged.set(key, existing ? mergeServiceEndpoints(existing, override, true) : override);
  }
  return [...merged.values()].sort((left, right) => left.port - right.port || left.protocol.localeCompare(right.protocol)).slice(0, SERVICE_LIMIT);
}

export async function listPortTopology(deviceId?: string) {
  const [devices, snapshots] = await Promise.all([
    prisma.device.findMany({ where: deviceId ? { id: deviceId } : undefined, orderBy: { name: "asc" }, include: { asset: { include: { interfaces: { orderBy: { name: "asc" } } } } } }),
    prisma.deviceSnapshot.findMany({ where: { ...(deviceId ? { deviceId } : {}), snapshotType: "linux_security" }, orderBy: { collectedAt: "desc" }, take: deviceId ? 1 : 100, select: { deviceId: true, dataJson: true, collectedAt: true } })
  ]);
  const latestSnapshots = new Map<string, { dataJson: unknown; collectedAt: Date }>();
  for (const snapshot of snapshots) if (!latestSnapshots.has(snapshot.deviceId)) latestSnapshots.set(snapshot.deviceId, snapshot);
  return {
    generatedAt: new Date(),
    devices: devices.map((device) => {
      const snapshot = latestSnapshots.get(device.id);
      const serviceEvidence = collectFreshServiceEndpoints(device, snapshot);
      return {
        id: device.id, name: device.name, vendor: device.vendor, type: device.type, host: device.host, status: device.status,
        model: text(object(object(object(device.capabilities).sophosStatus).sophos).product)
          || text(object(object(object(device.capabilities).fortigateStatus).fortigate).model)
          || text(object(object(device.capabilities).fortigateStatus).model)
          || text(object(object(object(object(device.capabilities).cisco).collection).system).model)
          || text(object(object(device.capabilities).ciscoDetection).platform)
          || null,
        ports: (device.asset?.interfaces ?? []).map(portResponse),
        serviceEndpoints: effectiveServiceEndpoints(serviceEvidence.endpoints, device.asset?.metadataJson),
        serviceSnapshotAt: serviceEvidence.observedAt,
        serviceDataSource: serviceEvidence.source
      };
    })
  };
}

function validatedServiceInput(input: Record<string, unknown>): ServiceEndpoint {
  const port = Number(input.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("INVALID_SERVICE_PORT");
  const address = text(input.address, 100) || "*";
  if (!/^[\p{L}\p{N}.*:[\]_%/-]{1,100}$/u.test(address)) throw new Error("INVALID_SERVICE_ADDRESS");
  const endpoint = serviceCandidate({
    protocol: protocol(input.protocol),
    address,
    port,
    state: ["listening", "allowed", "disabled", "unknown"].includes(String(input.state)) ? input.state as ServiceEndpoint["state"] : "unknown",
    exposure: ["all_interfaces", "loopback", "interface", "policy", "unknown"].includes(String(input.exposure)) ? input.exposure as ServiceEndpoint["exposure"] : exposure(address),
    process: text(input.process, 100) || undefined,
    serviceName: text(input.serviceName, 100) || undefined,
    source: "manual",
    confidence: 1
  });
  if (!endpoint) throw new Error("INVALID_SERVICE_PORT");
  return { ...endpoint, note: text(input.note, 500) || undefined, manualOverride: true };
}

export async function saveServiceEndpointOverride(deviceId: string, rawKey: unknown, input: Record<string, unknown>, userId?: string) {
  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device) return null;
  const asset = await ensureAsset(device);
  const requestedKey = text(rawKey, 220);
  if (!requestedKey || !/^[\p{L}\p{N}._:*:[\] %/-]{1,220}$/u.test(requestedKey)) throw new Error("INVALID_SERVICE_KEY");
  const currentMetadata = object(asset.metadataJson) as ServiceTopologyMetadata & Record<string, unknown>;
  const storedOverrides = serviceOverrides(currentMetadata);
  const endpoint = validatedServiceInput(input);
  const key = endpointKey(endpoint);
  const existingOverride = storedOverrides[requestedKey];
  const requestedCanonicalKey = existingOverride?.replacesKey ?? (existingOverride ? endpointKey(existingOverride) : endpointKeyFromStoredKey(requestedKey));
  const savedEndpoint = { ...endpoint, replacesKey: requestedCanonicalKey && requestedCanonicalKey !== key ? requestedCanonicalKey : undefined };
  const overrides = Object.fromEntries(Object.entries(storedOverrides).filter(([storedKey, item]) => storedKey !== requestedKey && endpointKey(item) !== key));
  await prisma.asset.update({ where: { id: asset.id }, data: { metadataJson: toJson({ ...currentMetadata, servicePortOverrides: { ...overrides, [key]: savedEndpoint } }) } });
  await prisma.auditLog.create({ data: { deviceId, action: "asset.service_port.override_saved", targetType: "asset", targetId: asset.id, dryRun: false, approvalStatus: "not_required", metadata: toJson({ endpointKey: key, protocol: endpoint.protocol, port: endpoint.port, userId }) } });
  return savedEndpoint;
}

export async function clearServiceEndpointOverride(deviceId: string, rawKey: unknown, userId?: string) {
  const key = text(rawKey, 220);
  const asset = await prisma.asset.findUnique({ where: { deviceId } });
  if (!asset) return null;
  const currentMetadata = object(asset.metadataJson) as ServiceTopologyMetadata & Record<string, unknown>;
  const storedOverrides = serviceOverrides(currentMetadata);
  const targetKey = storedOverrides[key] ? endpointKey(storedOverrides[key]) : key;
  const overrides = Object.fromEntries(Object.entries(storedOverrides).filter(([storedKey, item]) => storedKey !== key && endpointKey(item) !== targetKey));
  if (Object.keys(overrides).length === Object.keys(storedOverrides).length) return null;
  await prisma.asset.update({ where: { id: asset.id }, data: { metadataJson: toJson({ ...currentMetadata, servicePortOverrides: overrides }) } });
  await prisma.auditLog.create({ data: { deviceId, action: "asset.service_port.override_cleared", targetType: "asset", targetId: asset.id, dryRun: false, approvalStatus: "not_required", metadata: toJson({ endpointKey: key, userId }) } });
  return { cleared: true, key };
}

export async function discoverDevicePorts(deviceId: string, userId?: string) {
  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device) return null;
  const ciscoDevice = /cisco/i.test(`${device.vendor} ${device.type}`);
  let liveConnected = false;
  let connectionErrorCode: string | null = null;
  if (ciscoDevice) {
    try {
      await refreshDeviceVendorCapabilities(deviceId, true);
      liveConnected = true;
    } catch (error) {
      connectionErrorCode = error instanceof VendorCapabilityRefreshError ? error.code : "CISCO_LIVE_COLLECTION_FAILED";
    }
  } else {
    const liveResult = await testDeviceConnection(deviceId);
    liveConnected = Boolean(liveResult && "connected" in liveResult && liveResult.connected);
    connectionErrorCode = liveResult && "errorCode" in liveResult ? text(liveResult.errorCode, 80) || null : null;
  }
  const refreshed = await prisma.device.findUniqueOrThrow({ where: { id: deviceId } });
  const discoveredCount = await mergeDiscoveredPorts(refreshed);
  const serviceEndpointCount = collectServiceEndpoints(refreshed).length;
  await prisma.auditLog.create({ data: { deviceId, action: "asset.port_topology.discovered", targetType: "device", targetId: deviceId, dryRun: true, approvalStatus: "not_required", metadata: toJson({ discoveredCount, serviceEndpointCount, connected: liveConnected, connectionErrorCode, userId, source: "read_only_inventory" }) } });
  return { discoveredCount, serviceEndpointCount, liveConnected, connectionErrorCode, topology: await listPortTopology(deviceId) };
}

export async function refreshLinuxServicePorts(deviceId: string, userId?: string) {
  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device) return null;
  if (!/linux/i.test(`${device.vendor} ${device.type}`)) throw new Error("LINUX_DEVICE_REQUIRED");

  const result = await probeLinuxListeningPorts(device);
  const capabilities = object(device.capabilities);
  const previousLinuxStatus = object(capabilities.linuxStatus);
  await prisma.device.update({
    where: { id: deviceId },
    data: {
      capabilities: toJson({
        ...capabilities,
        linuxStatus: result.connected
          ? {
              ...previousLinuxStatus,
              connected: true,
              listeningPorts: result.listeningPorts,
              listeningPortsCollected: true,
              firewallPorts: result.firewallPorts,
              firewallPortsCollected: result.firewallPortsCollected,
              listeningPortsCheckedAt: result.checkedAt,
              listeningPortsError: null
            }
          : {
              ...previousLinuxStatus,
              listeningPortsCollected: false,
              firewallPortsCollected: false,
              firewallPorts: "",
              listeningPortsCheckedAt: result.checkedAt,
              listeningPortsError: result.errorCode ?? "LISTENER_PROBE_FAILED"
            }
      })
    }
  });
  const serviceEndpointCount = result.connected
    ? collectServiceEndpoints({
        ...device,
        capabilities: {
          ...capabilities,
          linuxStatus: {
            ...previousLinuxStatus,
            listeningPorts: result.listeningPorts,
            firewallPorts: result.firewallPorts
          }
        }
      } as Device).length
    : 0;
  await prisma.auditLog.create({
    data: {
      deviceId,
      action: "asset.service_ports.refreshed",
      targetType: "device",
      targetId: deviceId,
      dryRun: true,
      approvalStatus: "not_required",
      metadata: toJson({ connected: result.connected, serviceEndpointCount, userId, source: "linux_ss_lightweight" })
    }
  });
  return { connected: result.connected, serviceEndpointCount, checkedAt: result.checkedAt, topology: await listPortTopology(deviceId) };
}

export async function savePortOverride(deviceId: string, rawPortName: unknown, input: Record<string, unknown>, userId?: string) {
  const name = portName(rawPortName);
  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device) return null;
  const asset = await ensureAsset(device);
  const existing = await prisma.assetInterface.findUnique({ where: { assetId_name: { assetId: asset.id, name } } });
  const previous = metadata(existing?.metadataJson);
  const peerIp = text(input.peerIp, 80);
  if (peerIp && net.isIP(peerIp) === 0) throw new Error("INVALID_PEER_IP");
  const next: PortMetadata = {
    ...previous,
    operationalStatus: status(input.operationalStatus ?? previous.operationalStatus),
    speed: text(input.speed, 40) || undefined,
    vlan: text(input.vlan, 30) || undefined,
    description: text(input.description) || undefined,
    ipAddresses: interfaceAddresses(input.ipAddresses ?? previous.ipAddresses),
    peerName: text(input.peerName) || undefined,
    peerPort: text(input.peerPort, 80) || undefined,
    peerIp: peerIp || undefined,
    cableType: text(input.cableType, 40) || undefined,
    note: text(input.note, 500) || undefined,
    source: "manual",
    confidence: 1,
    manualOverride: true,
    updatedByUserId: userId
  };
  const saved = await prisma.assetInterface.upsert({
    where: { assetId_name: { assetId: asset.id, name } },
    update: { type: text(input.type, 40) || existing?.type || "ethernet", enabled: next.operationalStatus !== "down", metadataJson: toJson(next) },
    create: { assetId: asset.id, name, type: text(input.type, 40) || "ethernet", enabled: next.operationalStatus !== "down", metadataJson: toJson(next) }
  });
  await prisma.auditLog.create({ data: { deviceId, action: "asset.port_topology.override_saved", targetType: "asset_interface", targetId: saved.id, dryRun: false, approvalStatus: "not_required", metadata: toJson({ portName: name, peerName: next.peerName, peerPort: next.peerPort, userId }) } });
  return portResponse(saved);
}

export async function clearPortOverride(deviceId: string, rawPortName: unknown, userId?: string) {
  const name = portName(rawPortName);
  const asset = await prisma.asset.findUnique({ where: { deviceId } });
  if (!asset) return null;
  const existing = await prisma.assetInterface.findUnique({ where: { assetId_name: { assetId: asset.id, name } } });
  if (!existing) return null;
  const previous = metadata(existing.metadataJson);
  const next: PortMetadata = { operationalStatus: previous.operationalStatus, speed: previous.speed, vlan: previous.vlan, description: previous.description, ipAddresses: previous.ipAddresses, source: "inferred", confidence: 0.55, lastDiscoveredAt: previous.lastDiscoveredAt };
  const saved = await prisma.assetInterface.update({ where: { id: existing.id }, data: { metadataJson: toJson(next) } });
  await prisma.auditLog.create({ data: { deviceId, action: "asset.port_topology.override_cleared", targetType: "asset_interface", targetId: saved.id, dryRun: false, approvalStatus: "not_required", metadata: toJson({ portName: name, userId }) } });
  return portResponse(saved);
}
