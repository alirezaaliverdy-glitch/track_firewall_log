import type { Prisma } from "@prisma/client";
import type { DeviceConnectionTestResult } from "../connectors/types.js";
import { prisma } from "../db/prisma.js";

type Measurement = { metricKey: string; value: number; unit: string; labels?: Record<string, string> };
export function routerOsBytes(value: unknown) {
  const match = String(value ?? "").trim().match(/^(\d+(?:\.\d+)?)\s*(B|KiB|MiB|GiB|TiB)?$/i);
  if (!match) return null;
  const power = ({ b:0, kib:1, mib:2, gib:3, tib:4 } as Record<string,number>)[(match[2] ?? "B").toLowerCase()];
  const bytes = Number(match[1]) * 1024 ** power;
  return Number.isFinite(bytes) ? bytes : null;
}
function usedPercent(freeValue: unknown, totalValue: unknown) {
  const free = routerOsBytes(freeValue), total = routerOsBytes(totalValue);
  return free !== null && total !== null && total > 0 && free <= total ? (1-free/total)*100 : null;
}
function numeric(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = typeof value === "number" ? value : Number(String(value ?? "").replace(/%$/, ""));
  return Number.isFinite(number) && number >= 0 ? number : null;
}
function add(measurements: Measurement[], metricKey: string, value: unknown, unit: string, labels?: Record<string, string>) {
  const number = numeric(value);
  if (number !== null) measurements.push({ metricKey, value: number, unit, labels });
}

export function vendorMeasurements(result: DeviceConnectionTestResult): Measurement[] {
  if (!result.connected) return [];
  const measurements: Measurement[] = [];
  if (result.esxi) {
    add(measurements, "cpu.usage_percent", result.esxi.cpuPercent, "percent");
    add(measurements, "memory.usage_percent", result.esxi.memoryPercent, "percent");
    add(measurements, "vm.count", result.esxi.vmCount, "count");
    add(measurements, "datastore.count", result.esxi.datastoreCount, "count");
    for(const item of result.esxi.interfaceCounters?.slice(0,16) ?? []) {
      add(measurements,"network.rx_bytes",item.rxBytes,"bytes",{interface:item.name});
      add(measurements,"network.tx_bytes",item.txBytes,"bytes",{interface:item.name});
    }
    for (const datastore of result.esxi.datastores) {
      if (datastore.capacityBytes && datastore.freeBytes !== null)
        add(measurements, "datastore.usage_percent", (1 - datastore.freeBytes / datastore.capacityBytes) * 100, "percent", { datastore: datastore.name });
    }
  }
  if (result.mikrotik) {
    add(measurements, "cpu.usage_percent", result.mikrotik.cpuLoad, "percent");
    add(measurements, "memory.usage_percent", usedPercent(result.mikrotik.memoryFree,result.mikrotik.memoryTotal), "percent");
    add(measurements, "disk.usage_percent", usedPercent(result.mikrotik.storageFree,result.mikrotik.storageTotal), "percent");
    for (const item of result.mikrotik.interfaceCounters?.slice(0, 32) ?? []) {
      add(measurements, "network.rx_bytes", item.rxBytes, "bytes", { interface: item.name });
      add(measurements, "network.tx_bytes", item.txBytes, "bytes", { interface: item.name });
    }
  }
  if (result.fortigate) {
    add(measurements, "cpu.usage_percent", result.fortigate.cpuUsage, "percent");
    add(measurements, "memory.usage_percent", result.fortigate.memoryUsage, "percent");
    add(measurements, "sessions.count", result.fortigate.sessionCount, "count");
    for (const item of result.fortigate.interfaceCounters?.slice(0, 32) ?? []) {
      add(measurements, "network.rx_bytes", item.rxBytes, "bytes", { interface: item.name });
      add(measurements, "network.tx_bytes", item.txBytes, "bytes", { interface: item.name });
    }
  }
  if (result.sophos) {
    if (result.sophos.interfaces.length) {
      add(measurements, "interfaces.up_count", result.sophos.interfaces.filter((item) => item.operationalStatus === "up").length, "count");
      add(measurements, "interfaces.down_count", result.sophos.interfaces.filter((item) => item.operationalStatus === "down").length, "count");
    }
    if (result.sophos.vpnConnections.length) {
      add(measurements, "vpn.active_count", result.sophos.vpnConnections.filter((item) => /^(?:up|active|connected)$/i.test(item.status ?? "")).length, "count");
    }
  }
  return measurements;
}

export async function recordVendorMetricSamples(deviceId: string, result: DeviceConnectionTestResult) {
  const measurements = vendorMeasurements(result);
  if (!measurements.length) return;
  try {
    await prisma.metricSample.createMany({
      data: measurements.map((item) => ({
        deviceId,
        metricKey: item.metricKey,
        value: item.value,
        unit: item.unit,
        source: result.vendor ?? "vendor_connector",
        labelsJson: (item.labels ?? {}) as Prisma.InputJsonValue
      }))
    });
  } catch (error) {
    // Monitoring storage must never turn a verified connection test into a failed action.
    console.warn("[vendor-metrics] Could not persist optional metric samples.", error instanceof Error ? error.name : "unknown");
  }
}

export function ciscoMeasurements(outputs: Record<string, string>): Measurement[] {
  const measurements: Measurement[] = [];
  const cpu = outputs.cpu?.match(/five seconds:\s*(\d+)%/i)?.[1];
  add(measurements, "cpu.usage_percent", cpu, "percent");
  const memory = outputs.memory?.match(/Processor\s+Pool\s+Total:\s*(\d+)\s+Used:\s*(\d+)\s+Free:\s*(\d+)/i);
  if (memory && Number(memory[1]) > 0 && Number(memory[2]) <= Number(memory[1]))
    add(measurements, "memory.usage_percent", Number(memory[2])/Number(memory[1])*100, "percent", {pool:"processor"});
  const sections = (outputs.interfacesDetailed ?? "").split(/(?=^\S+\s+is\s+(?:up|down|administratively down)\b)/gim);
  for (const section of sections.slice(0, 32)) {
    const name = section.match(/^(\S+)\s+is\s+(?:up|down|administratively down)/im)?.[1];
    const rx = section.match(/5\s+minute\s+input\s+rate\s+(\d+)\s+bits\/sec/i)?.[1];
    const tx = section.match(/5\s+minute\s+output\s+rate\s+(\d+)\s+bits\/sec/i)?.[1];
    if (!name) continue;
    const labels = { interface: name, window: "5m" };
    if (rx !== undefined) add(measurements, "network.rx_mbps", Number(rx) / 1_000_000, "Mbps", labels);
    if (tx !== undefined) add(measurements, "network.tx_mbps", Number(tx) / 1_000_000, "Mbps", labels);
  }
  return measurements;
}

export async function recordCiscoMetricSamples(deviceId: string, outputs: Record<string, string>) {
  const measurements = ciscoMeasurements(outputs);
  if (!measurements.length) return;
  try {
    await prisma.metricSample.createMany({
      data: measurements.map((item) => ({
        deviceId,
        metricKey: item.metricKey,
        value: item.value,
        unit: item.unit,
        source: "cisco-iosxe-ssh",
        labelsJson: (item.labels ?? {}) as Prisma.InputJsonValue
      }))
    });
  } catch (error) {
    console.warn("[cisco-metrics] Could not persist optional metric samples.", error instanceof Error ? error.name : "unknown");
  }
}
