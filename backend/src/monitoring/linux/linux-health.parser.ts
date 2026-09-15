import type { LinuxMetric } from "./linux-health-score.js";

function lines(output: string) { return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean); }
function number(value: string | undefined) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }

export function parseLinuxHealthOutput(output: string): { metrics: LinuxMetric[]; warnings: string[] } {
  const metrics: LinuxMetric[] = [];
  const warnings: string[] = [];
  for (const line of lines(output)) {
    if (line.startsWith("load=")) {
      const [one, five, fifteen] = line.slice(5).split(/\s+/).map(Number);
      if (Number.isFinite(one)) metrics.push({ metricKey: "cpu.load_1m", value: one, unit: "load" });
      if (Number.isFinite(five)) metrics.push({ metricKey: "cpu.load_5m", value: five, unit: "load" });
      if (Number.isFinite(fifteen)) metrics.push({ metricKey: "cpu.load_15m", value: fifteen, unit: "load" });
    }
    if (line.startsWith("cpu_idle=")) { const idle = number(line.split("=")[1]); if (idle !== null) metrics.push({ metricKey: "cpu.usage_percent", value: Math.max(0, Math.min(100, 100 - idle)), unit: "percent" }); }
    if (line.startsWith("mem=")) { const [, total, available] = line.match(/mem=(\d+)\s+(\d+)/) ?? []; const t = number(total); const a = number(available); if (t && a !== null) { metrics.push({ metricKey: "memory.available_bytes", value: a, unit: "bytes" }); metrics.push({ metricKey: "memory.usage_percent", value: Math.round(((t - a) / t) * 1000) / 10, unit: "percent" }); } }
    if (line.startsWith("swap=")) { const [, total, free] = line.match(/swap=(\d+)\s+(\d+)/) ?? []; const t = number(total); const f = number(free); if (t && f !== null) metrics.push({ metricKey: "swap.usage_percent", value: Math.round(((t - f) / t) * 1000) / 10, unit: "percent" }); }
    if (line.startsWith("disk=")) { const match = line.match(/^disk=(\d+(?:\.\d+)?)\s+(\d+)\s*(.*)$/); const used = number(match?.[1]); const free = number(match?.[2]); const mount = match?.[3]?.trim() || "/"; if (used !== null) metrics.push({ metricKey: "disk.usage_percent", value: used, unit: "percent", labels: { mount } }); if (free !== null) metrics.push({ metricKey: "disk.free_bytes", value: free, unit: "bytes", labels: { mount } }); }
    if (line.startsWith("inode=")) { const value = number(line.split("=")[1]); if (value !== null) metrics.push({ metricKey: "inode.usage_percent", value, unit: "percent" }); }
    if (line.startsWith("net=")) { const [, rx, tx, rxe, txe] = line.match(/net=(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/) ?? []; for (const [metricKey, raw] of [["network.rx_bytes", rx], ["network.tx_bytes", tx], ["network.rx_errors", rxe], ["network.tx_errors", txe]] as const) { const value = number(raw); if (value !== null) metrics.push({ metricKey, value, unit: metricKey.endsWith("bytes") ? "bytes" : "count" }); } }
    if (line.startsWith("uptime=")) { const value = number(line.split("=")[1]); if (value !== null) metrics.push({ metricKey: "uptime.seconds", value, unit: "seconds" }); }
    if (line.startsWith("failed_services=")) { const value = number(line.split("=")[1]); if (value !== null) metrics.push({ metricKey: "services.failed_count", value, unit: "count" }); }
    if (line.startsWith("listening_ports=")) { const value = number(line.split("=")[1]); if (value !== null) metrics.push({ metricKey: "ports.listening_count", value, unit: "count" }); }
    if (line.startsWith("firewall=")) metrics.push({ metricKey: "firewall.enabled", value: /active|running|enabled|1/i.test(line) ? 1 : 0, unit: "boolean" });
    if (line.startsWith("processes=")) { const value = number(line.split("=")[1]); if (value !== null) metrics.push({ metricKey: "processes.count", value, unit: "count" }); }
    if (line.startsWith("warning=")) warnings.push(line.slice(8));
  }
  return { metrics, warnings };
}
