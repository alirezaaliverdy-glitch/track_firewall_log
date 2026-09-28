import type { Device } from "@prisma/client";
import type { EsxiDiscovery } from "./esxi-inventory.js";
import { EsxiSoapError } from "./esxi-soap.transport.js";

// Fixed read-only commands: neither user input nor AI text becomes shell code.
export const ESXI_SSH_READ_COMMANDS = {
  identity: "vmware -v",
  hostname: "esxcli system hostname get",
  hardware: "esxcli hardware platform get",
  memory: "esxcli hardware memory get",
  cpu: "esxcli hardware cpu global get",
  maintenance: "esxcli system maintenanceMode get",
  datastores: "esxcli --formatter=csv storage filesystem list",
  nics: "esxcli --formatter=csv network nic list",
  vmkernel: "esxcli --formatter=csv network ip interface ipv4 get",
  portgroups: "esxcli --formatter=csv network vswitch standard portgroup list"
} as const;
export type EsxiSshOutputs = Partial<Record<keyof typeof ESXI_SSH_READ_COMMANDS, string>>;
const numeric = (v: string | undefined) => {
  if (!v?.trim()) return null;
  const n = Number(v.trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
};
function labels(text: string) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap(line => {
    const m = /^\s*([^:]+):\s*(.*?)\s*$/.exec(line);
    return m ? [[m[1]!.trim(), m[2]!]] : [];
  }));
}
// ESXCLI CSV supports quoted values, escaped quotes, CRLF and trailing commas.
export function esxiCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (c === "," || c === "\n")) {
      row.push(cell.replace(/\r$/, "")); cell = "";
      if (c === "\n") { if (row.some(v => v.trim())) rows.push(row); row = []; }
    } else cell += c;
  }
  if (quoted) throw new EsxiSoapError("ESXI_SSH_CSV_INVALID", "ESXi returned incomplete CSV.");
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  const headers = rows.shift()?.map(v => v.trim().toLowerCase().replace(/[^a-z0-9]/g, "")) ?? [];
  return rows.map(values => Object.fromEntries(headers.filter(Boolean).map(key => [key, values[headers.indexOf(key)]?.trim() ?? ""])));
}
export function parseEsxiSshInventory(outputs: EsxiSshOutputs, device: Pick<Device, "id" | "host">): EsxiDiscovery {
  const identity = /^\s*VMware ESXi\s+([\d.]+)\s+build-([\d]+)\s*$/m.exec(outputs.identity ?? "");
  if (!identity) throw new EsxiSoapError("ESXI_SSH_PLATFORM_MISMATCH", "SSH is reachable but the target did not identify itself as VMware ESXi.");
  const host = labels(outputs.hostname ?? ""), hardware = labels(outputs.hardware ?? "");
  const memory = labels(outputs.memory ?? ""), cpu = labels(outputs.cpu ?? "");
  const filesystems = esxiCsv(outputs.datastores ?? "");
  const datastores = filesystems.filter(v => /^(VMFS(?:-?\d+)?|NFS(?:-?[\d.]+)?|vsan)$/i.test(v.type ?? ""));
  const nics = esxiCsv(outputs.nics ?? ""), vmkernel = esxiCsv(outputs.vmkernel ?? "");
  const portgroups = esxiCsv(outputs.portgroups ?? "").map(v => ({
    name: v.name ?? "", vlanId: numeric(v.vlanid), vSwitch: v.virtualswitch ?? v.vswitch ?? ""
  })).filter(v => v.name);
  return {
    hostId: device.id, hostname: host["Fully Qualified Domain Name"] || host["Host Name"] || "",
    version: identity[1]!, build: identity[2]!, model: hardware["Product Name"] || "",
    hardwareVendor: hardware["Vendor Name"] || "", serialNumber: hardware["Serial Number"] || "",
    biosVersion: "", lockdownMode: "", connectionState: "connected", overallStatus: "unknown",
    maintenanceMode: /^Enabled\s*$/i.test(outputs.maintenance?.trim() ?? "") ? true : /^Disabled\s*$/i.test(outputs.maintenance?.trim() ?? "") ? false : null,
    bootTime: null, cpuPercent: null, memoryPercent: null,
    cpuCores: numeric(cpu["CPU Cores"]), memoryBytes: numeric(memory["Physical Memory"]?.replace(/\s+Bytes$/i, "")),
    vmCount: null, vms: [], vmsTruncated: false,
    datastores: datastores.map(v => ({
      id: v.uuid || v.mountpoint || v.volumename || "", name: v.volumename || v.mountpoint || "",
      capacityBytes: numeric(v.size), freeBytes: numeric(v.free),
      accessible: v.mounted === "true" ? true : v.mounted === "false" ? false : null
    })), datastoreCount: outputs.datastores === undefined ? null : datastores.length,
    networks: portgroups.map(v => v.name), sensors: [], services: [], storageAdapters: [], storageDevices: [],
    firewallRulesets: [], physicalNics: nics.filter(v => v.name).map(v => ({
      name: v.name!, linkUp: /^Up$/i.test(v.linkstatus ?? "") ? true : /^Down$/i.test(v.linkstatus ?? "") ? false : null,
      speedMb: numeric(v.speed)
    })), vmkernelNics: vmkernel.filter(v => v.name).map(v => ({ name: v.name!, ip: v.ipv4address ?? "" })),
    virtualSwitches: [], portGroups: portgroups,
    dns: {hostName: host["Host Name"] || "", domainName: host["Domain Name"] || "", servers: []},
    time: {ntpServers: [], lastSyncTime: null, protocol: ""},
    serviceSystemId: null, dateTimeSystemId: null, collectedAt: new Date().toISOString()
  };
}
