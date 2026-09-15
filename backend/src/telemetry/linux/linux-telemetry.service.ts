import { DeviceProtocol, DeviceType, type Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { ConnectorError, isLinuxSshCapable, LINUX_TELEMETRY_COMMANDS, resolveLinuxConnectionPort, runLinuxTelemetryCommands } from "../../connectors/linux-ssh.connector.js";
import { analyzeLinuxSecuritySnapshot } from "./linux-security-analyzer.service.js";
import type { LinuxSecuritySnapshot, LinuxServerOverview } from "./linux-telemetry.types.js";
import { processVendorTelemetry, type RawTelemetryEvent } from "../vendor-finding-engine.js";
import { boundedTelemetryStore, type StoredTelemetryEvent } from "../bounded-telemetry-store.js";

const SECRET_PATTERNS = [
  /(password|passwd|token|api[_-]?key|secret|authorization)\s*[:=]\s*[^\s,;]+/gi,
  /(-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----)[\s\S]*?(-----END (?:RSA |OPENSSH )?PRIVATE KEY-----)/gi,
  /\b(Bearer)\s+[A-Za-z0-9._~+/-]+=*/gi
];

function safeText(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function redactLinuxTelemetry(value: unknown) {
  return SECRET_PATTERNS.reduce((current, pattern) => current.replace(pattern, "$1=[REDACTED]"), safeText(value)).slice(0, 200000);
}

function lines(value: unknown, limit = 500) {
  return redactLinuxTelemetry(value).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, limit);
}

function sections(output: unknown) {
  const result: Record<string, string[]> = {};
  let current = "unknown";
  for (const line of redactLinuxTelemetry(output).split(/\r?\n/)) {
    const marker = line.match(/^__FLA_([A-Z_]+)__$/)?.[1]?.toLowerCase();
    if (marker) {
      current = marker;
      result[current] = [];
    } else {
      (result[current] ??= []).push(line);
    }
  }
  return Object.fromEntries(Object.entries(result).map(([key, value]) => [key, value.join("\n").trim()]));
}

function configValue(source: unknown, key: string, fallback = "unknown") {
  return safeText(source).match(new RegExp(`^${key}\\s+(.+)$`, "im"))?.[1]?.trim().toLowerCase() ?? fallback;
}

function sourceIps(source: unknown) {
  const counts: Record<string, number> = {};
  for (const match of safeText(source).matchAll(/\bfrom\s+((?:\d{1,3}\.){3}\d{1,3})\b/gi)) counts[match[1]] = (counts[match[1]] ?? 0) + 1;
  return counts;
}

function exposedPorts(source: unknown) {
  return Array.from(new Set(Array.from(safeText(source).matchAll(/(?:0\.0\.0\.0|\[::\]|\*):(\d{1,5})\b/g)).map((match) => Number(match[1])).filter((port) => port > 0 && port <= 65535)));
}

function shellUsers(source: unknown) {
  return lines(source).filter((line) => /\/([^/:]*sh|bash|zsh|fish)$/.test(line)).map((line) => line.split(":", 1)[0]).slice(0, 100);
}

function groupUsers(source: unknown) {
  return Array.from(new Set(lines(source).filter((line) => /^(sudo|wheel):/.test(line)).flatMap((line) => (line.split(":")[3] ?? "").split(",")).filter(Boolean)));
}

function parseHost(identity: unknown) {
  const data = lines(identity, 100);
  const uname = data.find((line) => /linux/i.test(line)) ?? "unknown";
  return {
    hostname: data[0] ?? "unknown",
    os: data.find((line) => /Operating System:/i.test(line))?.split(":").slice(1).join(":").trim() ?? "unknown",
    kernel: data.find((line) => /Kernel:/i.test(line))?.split(":").slice(1).join(":").trim() ?? uname,
    uptime: data.find((line) => /up\s+/i.test(line)) ?? "unknown",
    timezone: data.find((line) => /Time zone:/i.test(line))?.split(":").slice(1).join(":").trim() ?? "unknown",
    architecture: data.find((line) => /Architecture:/i.test(line))?.split(":").slice(1).join(":").trim() ?? uname.split(/\s+/).at(-2) ?? "unknown",
    virtualization: data.find((line) => /Virtualization:/i.test(line))?.split(":").slice(1).join(":").trim() ?? "unknown"
  };
}

function firewallStatus(source: unknown): "active" | "inactive" | "unknown" {
  const text = safeText(source);
  if (/status:\s*active|table\s+(?:inet|ip)|^-P\s+\w+\s+(?:DROP|REJECT)|^running$/im.test(text)) return "active";
  if (/status:\s*inactive|not running|FirewallD is not running/i.test(text)) return "inactive";
  return text.trim() ? "unknown" : "inactive";
}

function percent(value: unknown) {
  const parsed = Number.parseInt(safeText(value).replace("%", ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function overviewStatus(value: number | null, warning = 75, critical = 90) {
  if (value === null) return "unknown" as const;
  if (value >= critical) return "critical" as const;
  if (value >= warning) return "warning" as const;
  return "normal" as const;
}

function parseCpu(section = ""): LinuxServerOverview["cpu"] {
  const data = lines(section, 10);
  const coreCount = Number.parseInt(data[0] ?? "", 10) || null;
  const loadAverage = (data.find((line) => /^\d+\.\d+\s+\d+\.\d+/.test(line)) ?? "").split(/\s+/).slice(0, 3).map(Number).filter(Number.isFinite);
  const cpuLine = data.find((line) => /Cpu|%Cpu/i.test(line)) ?? "";
  const idleText = cpuLine.match(/([\d.]+)\s*id/i)?.[1];
  const idle = idleText === undefined ? null : Number(idleText);
  const usagePercent = idle !== null && Number.isFinite(idle) ? Math.max(0, Math.min(100, Math.round((100 - idle) * 10) / 10)) : null;
  const loadPerCore = coreCount && loadAverage[0] ? loadAverage[0] / coreCount : null;
  const status = usagePercent !== null ? overviewStatus(usagePercent) : loadPerCore !== null ? overviewStatus(loadPerCore * 100, 80, 120) : "unknown";
  const summary = status === "normal" ? "CPU is normal" : status === "critical" ? "CPU is overloaded" : status === "warning" ? "CPU load is elevated" : "CPU data is unavailable";
  return { status, usagePercent, loadAverage, coreCount, summary };
}

function parseMemory(section = ""): LinuxServerOverview["memory"] {
  const mem = lines(section).find((line) => /^Mem:/i.test(line))?.split(/\s+/) ?? [];
  const swap = lines(section).find((line) => /^Swap:/i.test(line))?.split(/\s+/) ?? [];
  const totalMb = Number(mem[1]) || null;
  const usedMb = Number(mem[2]) || null;
  const usedPercent = totalMb && usedMb !== null ? Math.round((usedMb / totalMb) * 1000) / 10 : null;
  const swapTotal = Number(swap[1]) || null;
  const swapUsed = Number(swap[2]) || null;
  const swapUsedPercent = swapTotal && swapUsed !== null ? Math.round((swapUsed / swapTotal) * 1000) / 10 : null;
  const status = overviewStatus(usedPercent, 80, 92);
  const summary = status === "normal" ? "Memory is normal" : status === "critical" ? "Memory is under heavy pressure" : status === "warning" ? "Memory usage is high" : "Memory data is unavailable";
  return { status, totalMb, usedMb, usedPercent, swapUsedPercent, summary };
}

function parseDisks(section = ""): LinuxServerOverview["disks"] {
  return lines(section).filter((line) => !/^Filesystem/i.test(line)).map((line) => {
    const parts = line.split(/\s+/);
    const type = parts[1] ?? "unknown";
    const useIndex = parts.findIndex((part) => /^\d+%$/.test(part));
    const usedPercent = useIndex >= 0 ? percent(parts[useIndex]) : null;
    return {
      filesystem: parts[0] ?? "unknown",
      type,
      size: parts[2] ?? "unknown",
      used: parts[3] ?? "unknown",
      available: parts[4] ?? "unknown",
      usedPercent,
      mount: parts.slice(useIndex + 1).join(" ") || parts.at(-1) || "unknown",
      status: overviewStatus(usedPercent, 80, 92)
    };
  }).filter((disk) => disk.filesystem !== "tmpfs" && disk.filesystem !== "devtmpfs").slice(0, 20);
}

function parseServices(section = ""): LinuxServerOverview["services"] {
  return lines(section).filter((line) => line.includes("=")).map((line) => {
    const [name, value = "unknown"] = line.split("=");
    const state: LinuxServerOverview["services"][number]["state"] = /failed/i.test(value) ? "failed" : /inactive|dead|stopped/i.test(value) ? "inactive" : /not.?found|unrecognized/i.test(value) ? "not_found" : /\b(active|running)\b/i.test(value) ? "active" : "unknown";
    return { name: (name ?? "unknown").trim(), state, summary: `${(name ?? "service").trim()} is ${state}` };
  }).filter((service) => service.name && service.name !== "unknown");
}

function parsePorts(section = ""): LinuxServerOverview["listeningPorts"] {
  return lines(section, 120).filter((line) => /LISTEN|udp/i.test(line)).map((line) => {
    const protocol = line.match(/^(tcp|udp)\S*/i)?.[1]?.toLowerCase() ?? "unknown";
    const endpoint = line.match(/(?:\s|^)(\[?[0-9a-fA-F:.]+\]?:\d+|\*:\d+|0\.0\.0\.0:\d+)(?:\s|$)/)?.[1] ?? "";
    const port = Number(endpoint.match(/:(\d+)$/)?.[1] ?? "") || null;
    const process = line.match(/users:\(\("([^"]+)"/)?.[1] ?? line.match(/pid=\d+,fd=\d+.*?\"?([a-zA-Z0-9_.-]+)\"?/)?.[1] ?? null;
    return { protocol, localAddress: endpoint || "unknown", port, process };
  }).filter((port) => port.port !== null).slice(0, 50);
}

function parseProcesses(section = ""): LinuxServerOverview["topProcesses"] {
  return lines(section).filter((line) => !/^\s*PID\s+/i.test(line)).map((line) => {
    const parts = line.trim().split(/\s+/);
    return { pid: Number(parts[0]) || null, command: parts[1] ?? "unknown", cpuPercent: Number(parts[2]) || null, memoryPercent: Number(parts[3]) || null };
  }).filter((item) => item.command !== "unknown").slice(0, 8);
}

function parseNetwork(section = ""): LinuxServerOverview["network"] {
  const interfaces = new Map<string, { name: string; ips: string[]; rxBytes?: number; txBytes?: number; errors?: number }>();
  const networkLines = lines(section, 300);
  for (const line of networkLines) {
    const ipLine = line.match(/^\d+:\s+([^:\s]+)\s+inet6?\s+([^\s]+)/);
    if (ipLine) {
      const entry = interfaces.get(ipLine[1]) ?? { name: ipLine[1], ips: [] };
      entry.ips.push(ipLine[2]);
      interfaces.set(entry.name, entry);
    }
    const link = line.match(/^\d+:\s+([^:]+):/);
    if (link && !interfaces.has(link[1])) interfaces.set(link[1], { name: link[1], ips: [] });
  }
  const values = Array.from(interfaces.values()).filter((item) => item.name !== "lo").slice(0, 20);
  return { interfaces: values, summary: values.length ? `${values.length} network interfaces detected` : "Network interface data is unavailable" };
}

function parseSecurity(section = ""): LinuxServerOverview["securitySignals"] {
  const warnings = lines(section, 20).filter((line) => /fail|invalid|error|denied|authentication|warning|critical|alert/i.test(line)).slice(0, 10);
  const critical = warnings.some((line) => /accepted password|critical|alert|root/i.test(line));
  return {
    status: critical ? "critical" : warnings.length ? "warning" : "normal",
    summary: warnings.length ? `${warnings.length} recent security warnings found` : "No recent security warnings found",
    recentWarnings: warnings
  };
}

export function parseLinuxServerOverview(input: { deviceId: string; host: string; connectionPort: number; output?: string | null; warnings?: string[]; collectedAt?: string }): LinuxServerOverview {
  const parsed = sections(input.output);
  const parserWarnings = [...(input.warnings ?? [])];
  if (!safeText(input.output).trim()) parserWarnings.push("Overview command returned no output; partial data may be shown.");
  const hostLines = lines(parsed.host ?? "", 8);
  const cpu = parseCpu(parsed.cpu);
  const memory = parseMemory(parsed.memory);
  const disks = parseDisks(parsed.disk);
  const services = parseServices(parsed.services);
  const ports = parsePorts(parsed.ports);
  const network = parseNetwork(parsed.net);
  const securitySignals = parseSecurity(parsed.security);
  const diskIoDevices = lines(parsed.io, 30).filter((line) => line.trim() && !/^Linux|Device/i.test(line)).slice(0, 12);
  const recentProblems = [
    ...disks.filter((disk) => disk.status === "warning" || disk.status === "critical").map((disk) => `Disk ${disk.mount} is ${disk.usedPercent}% full`),
    ...services.filter((service) => service.state === "failed" || ["ssh", "sshd", "nginx", "apache2", "httpd"].includes(service.name) && service.state === "inactive").map((service) => `${service.name} is ${service.state}`),
    ...securitySignals.recentWarnings.slice(0, 3)
  ].slice(0, 8);
  const reasons = [
    cpu.status === "critical" ? "CPU is overloaded" : null,
    memory.status === "critical" ? "Memory is under heavy pressure" : null,
    disks.some((disk) => disk.status === "critical") ? "Disk is almost full" : null,
    securitySignals.status === "critical" ? "Critical security signals found" : null,
    services.some((service) => service.state === "failed") ? "A service is failed" : null
  ].filter(Boolean) as string[];
  const warningReasons = [
    cpu.status === "warning" ? "CPU load is elevated" : null,
    memory.status === "warning" ? "Memory usage is high" : null,
    disks.some((disk) => disk.status === "warning") ? "Disk usage is high" : null,
    securitySignals.status === "warning" ? "Recent security warnings found" : null,
    ...parserWarnings
  ].filter(Boolean) as string[];
  const status = reasons.length ? "critical" : warningReasons.length ? "warning" : "healthy";
  return {
    deviceId: input.deviceId,
    collectedAt: input.collectedAt ?? new Date().toISOString(),
    connection: { host: input.host, connectionPort: input.connectionPort, status: parserWarnings.length ? "partial" : "online" },
    health: { status, summary: status === "healthy" ? "Server is online and health looks normal" : status === "critical" ? "Server needs attention now" : "Server is online with warnings", reasons: [...reasons, ...warningReasons].slice(0, 10) },
    host: { hostname: hostLines[0] ?? "unknown", os: hostLines[1] ?? "unknown", kernel: hostLines[2] ?? "unknown", uptime: hostLines[3] ?? "unknown" },
    cpu,
    memory,
    disks,
    diskIo: { summary: diskIoDevices.length ? "Disk I/O data collected" : "Disk I/O data is unavailable", devices: diskIoDevices },
    network,
    topProcesses: parseProcesses(parsed.procs),
    services,
    listeningPorts: ports,
    securitySignals,
    recentProblems,
    warnings: parserWarnings,
    rawSections: parsed
  };
}

async function linuxDevice(deviceId: string) {
  if (!deviceId.trim()) throw new LinuxTelemetryError("NO_DEVICE_SELECTED", "No Linux SSH device is selected.", 400);
  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device) throw new LinuxTelemetryError("DEVICE_NOT_FOUND", "Selected Linux device does not exist.", 404);
  if (!isLinuxSshCapable(device)) throw new LinuxTelemetryError("LINUX_SSH_REQUIRED", "Selected device is not Linux/SSH capable.", 404);
  if (!device.credentialId && !device.credentialRef) throw new LinuxTelemetryError("SSH_CREDENTIAL_MISSING", "Linux device exists but no credential is configured.", 400);
  return device;
}

export class LinuxTelemetryError extends Error {
  constructor(public code: string, message: string, public statusCode: number) { super(message); this.name = "LinuxTelemetryError"; }
}

export async function collectLinuxSecuritySnapshot(deviceId: string) {
  const device = await linuxDevice(deviceId);
  const commandIds = Object.keys(LINUX_TELEMETRY_COMMANDS) as Array<keyof typeof LINUX_TELEMETRY_COMMANDS>;
  const connectionPort = resolveLinuxConnectionPort(device);
  let collected: Awaited<ReturnType<typeof runLinuxTelemetryCommands>>;
  try {
    collected = await runLinuxTelemetryCommands(device, commandIds);
  } catch (error) {
    if (error instanceof ConnectorError && error.code === "SSH_CREDENTIAL_MISSING") throw new LinuxTelemetryError(error.code, "Linux device exists but no credential is configured.", 400);
    if (error instanceof ConnectorError && ["SSH_TCP_CONNECT_FAILED", "SSH_HANDSHAKE_TIMEOUT"].includes(error.code)) throw new LinuxTelemetryError(error.code, `Linux telemetry could not connect to configured SSH endpoint ${device.host}:${connectionPort}.`, error.statusCode);
    throw error;
  }
  const output = (id: keyof typeof LINUX_TELEMETRY_COMMANDS) => redactLinuxTelemetry(collected.results[id]?.stdout ?? "");
  const auth = output("sshLogs");
  const sshConfig = output("sshConfig");
  const network = output("network");
  const users = output("users");
  const firewall = output("firewall");
  const tools = output("securityTools");
  const containers = output("containers");
  const web = output("web");
  const warnings = output("warnings");
  const listening = lines(network).filter((line) => /LISTEN|UNCONN/i.test(line));
  const ports = exposedPorts(network);
  const failureLines = lines(auth).filter((line) => /failed password|invalid user|authentication failure/i.test(line));
  const successLines = lines(auth).filter((line) => /accepted (?:password|publickey)/i.test(line));
  const failureIps = sourceIps(failureLines.join("\n"));
  const successIps = Object.keys(sourceIps(successLines.join("\n")));
  const detectedSshServicePort = Number(configValue(sshConfig, "port", "")) || null;
  const containerLines = lines(containers).filter((line) => /^\{|\bCONTAINER ID\b|\bUp\b/.test(line));
  const containerPorts = Array.from(new Set(containerLines.flatMap((line) => Array.from(line.matchAll(/(?:0\.0\.0\.0|:::)(\d+)->/g)).map((match) => Number(match[1])))));
  const snapshot: LinuxSecuritySnapshot = {
    deviceId,
    collectedAt: new Date().toISOString(),
    privilegeLevel: collected.privilegeLevel,
    sudoAvailable: collected.sudoAvailable,
    connection: { host: device.host, connectionPort: collected.connectionPort },
    host: parseHost(output("identity")),
    network: { interfaces: lines(network).filter((line) => /inet |state UP|^[0-9]+:/.test(line)).slice(0, 100), routes: lines(network).filter((line) => /^(default|\d{1,3}\.)/.test(line)).slice(0, 100), listeningPorts: listening, exposedPorts: ports, publicExposureSummary: ports.length ? `${ports.length} wildcard-bound listening ports detected.` : "No wildcard-bound listening ports detected." },
    ssh: { port: detectedSshServicePort ?? 22, detectedSshServicePort, permitRootLogin: configValue(sshConfig, "permitrootlogin"), passwordAuthentication: configValue(sshConfig, "passwordauthentication"), pubkeyAuthentication: configValue(sshConfig, "pubkeyauthentication"), recentFailures: failureLines.length, recentSuccesses: successLines.length, failureIps, successfulAfterFailureIps: successIps.filter((address) => (failureIps[address] ?? 0) >= 5), findings: [] },
    users: { shellUsers: shellUsers(users), sudoUsers: groupUsers(users), recentLogins: lines(users).filter((line) => /pts\/|tty/.test(line)).slice(0, 50), failedLoginsSummary: lines(output("failedLogins"), 50), findings: [] },
    firewall: { ufw: lines(firewall).filter((line) => /ufw|status:/i.test(line)).slice(0, 30).join("\n"), iptables: lines(firewall).filter((line) => /^-[PAN]/.test(line)).slice(0, 100).join("\n"), nftables: lines(firewall).filter((line) => /table |chain |hook /i.test(line)).slice(0, 100).join("\n"), firewalld: lines(firewall).filter((line) => /running|zone|services:/i.test(line)).slice(0, 50).join("\n"), effectiveStatus: firewallStatus(firewall), findings: [] },
    securityTools: { fail2ban: lines(tools).filter((line) => /fail2ban|jail/i.test(line)).slice(0, 20).join("\n") || "not_detected", auditd: lines(tools).find((line) => /^auditd=/.test(line))?.split("=")[1] ?? "unknown", unattendedUpgrades: /unattended-upgrade/i.test(tools) ? "installed" : "not_detected", findings: [] },
    containers: { dockerDetected: containerLines.length > 0, runningContainers: containerLines.slice(0, 100), exposedPorts: containerPorts, privilegedContainers: containerLines.filter((line) => /privileged/i.test(line)), findings: [] },
    services: { importantServices: Object.fromEntries(["ssh", "fail2ban", "auditd", "ufw", "firewalld", "nginx", "apache2"].map((name) => [name, new RegExp(name, "i").test(`${tools}\n${web}`) ? "detected" : "unknown"])), enabledWebSites: lines(web).filter((line) => !/active|inactive|failed/i.test(line)).slice(0, 100), findings: [] },
    recentLogs: { warnings: lines(warnings, 300), authSignals: [...failureLines, ...successLines].slice(0, 300), systemSignals: lines(warnings, 100) },
    riskSummary: { score: 0, severity: "info" as const, topFindings: [] },
    findings: [],
    rawCommandResultsMetadata: commandIds.map((commandId) => { const result = collected.results[commandId]; return { commandId, ok: result?.exitCode === 0, skipped: Boolean(result?.skipped), outputLines: lines(result?.stdout ?? "").length, ...(result?.stderr ? { warning: redactLinuxTelemetry(result.stderr).slice(0, 300) } : {}) }; })
  };
  const analysis = analyzeLinuxSecuritySnapshot(snapshot);
  snapshot.findings = analysis.findings;
  snapshot.riskSummary = analysis.riskSummary;
  await prisma.deviceSnapshot.create({ data: { deviceId, vendor: "linux", snapshotType: "linux_security", dataJson: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue } });
  await processVendorTelemetry({ device, snapshot });
  return snapshot;
}

export async function collectLinuxServerOverview(deviceId: string) {
  const device = await linuxDevice(deviceId);
  const connectionPort = resolveLinuxConnectionPort(device);
  let collected: Awaited<ReturnType<typeof runLinuxTelemetryCommands>>;
  try {
    collected = await runLinuxTelemetryCommands(device, ["overview"]);
  } catch (error) {
    if (error instanceof ConnectorError && error.code === "SSH_CREDENTIAL_MISSING") throw new LinuxTelemetryError(error.code, "Linux device exists but no credential is configured.", 400);
    if (error instanceof ConnectorError && ["SSH_TCP_CONNECT_FAILED", "SSH_HANDSHAKE_TIMEOUT", "SSH_AUTH_FAILED"].includes(error.code)) throw new LinuxTelemetryError(error.code, `Linux overview could not connect to configured SSH endpoint ${device.host}:${connectionPort}.`, error.statusCode);
    throw error;
  }
  const overview = collected.results.overview;
  const warnings = [
    ...(overview?.stderr ? lines(overview.stderr, 5) : []),
    ...(overview?.exitCode && overview.exitCode !== 0 ? [`Overview command exited with code ${overview.exitCode}; partial data may be shown.`] : []),
    ...(overview?.skipped ? ["Overview command was skipped because privileges were unavailable."] : [])
  ];
  return parseLinuxServerOverview({
    deviceId,
    host: device.host,
    connectionPort: collected.connectionPort,
    output: overview?.stdout ?? "",
    warnings
  });
}

export async function getLatestLinuxSecuritySnapshot(deviceId: string) {
  const record = await prisma.deviceSnapshot.findFirst({ where: { deviceId, vendor: "linux", snapshotType: "linux_security" }, orderBy: { collectedAt: "desc" } });
  return record ? { id: record.id, collectedAt: record.collectedAt, snapshot: record.dataJson as unknown as LinuxSecuritySnapshot } : null;
}

export async function analyzeLinuxTelemetry(deviceId: string) {
  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device) throw new LinuxTelemetryError("DEVICE_NOT_FOUND", "Selected Linux device does not exist.", 404);
  const latest = await getLatestLinuxSecuritySnapshot(deviceId);
  const storedEvents = await boundedTelemetryStore.readEvents(deviceId).catch(() => [] as StoredTelemetryEvent[]);
  const rawEvents = storedEvents.map(storedTelemetryToRawEvent);
  const snapshotAnalysis = latest ? analyzeLinuxSecuritySnapshot(latest.snapshot) : { findings: [], riskSummary: { score: 0, severity: "info" as const, topFindings: [] } };
  const liveAnalysis = await processVendorTelemetry({ device, events: rawEvents, snapshot: latest?.snapshot, now: new Date() });
  const findings = liveAnalysis.findings;
  const countsBySeverity = findings.reduce<Record<string, number>>((acc, finding) => {
    acc[finding.severity] = (acc[finding.severity] ?? 0) + 1;
    return acc;
  }, {});
  return {
    id: latest?.id ?? null,
    collectedAt: latest?.collectedAt ?? null,
    snapshot: latest?.snapshot ?? null,
    analysis: snapshotAnalysis,
    deterministic: true,
    findings,
    counts: {
      storedEvents: storedEvents.length,
      analyzedEvents: rawEvents.length,
      findings: findings.length,
      bySeverity: countsBySeverity
    },
    lastAnalyzedAt: new Date().toISOString(),
    aiSummary: null,
    aiAvailable: false,
    aiError: null
  };
}

function storedTelemetryToRawEvent(event: StoredTelemetryEvent): RawTelemetryEvent {
  const parsed = event.parsedFields ?? {};
  return {
    id: event.id,
    timestamp: event.timestamp,
    source: event.source,
    raw: event.rawMessage,
    message: event.normalizedMessage,
    summary: event.normalizedMessage,
    severity: event.severity,
    srcIp: typeof parsed.sourceIp === "string" ? parsed.sourceIp : undefined,
    dstIp: typeof parsed.destinationIp === "string" ? parsed.destinationIp : undefined,
    dstPort: typeof parsed.port === "number" ? parsed.port : undefined,
    username: typeof parsed.username === "string" ? parsed.username : undefined,
    affectedObject: typeof parsed.service === "string" ? parsed.service : undefined,
    ...parsed
  };
}

export async function getLinuxTelemetryOptions(deviceId: string) {
  const device = await linuxDevice(deviceId);
  const latest = await getLatestLinuxSecuritySnapshot(deviceId);
  return buildLinuxTelemetryOptions(device, latest);
}

export function buildLinuxTelemetryOptions(
  device: Pick<Awaited<ReturnType<typeof linuxDevice>>, "id" | "host" | "managementPort" | "status" | "capabilities"> & Record<string, unknown>,
  latest: Awaited<ReturnType<typeof getLatestLinuxSecuritySnapshot>>
) {
  return {
    deviceId: device.id, connectionStatus: device.status, connection: { host: device.host, connectionPort: resolveLinuxConnectionPort(device) }, connectionPort: resolveLinuxConnectionPort(device), detectedSshServicePort: latest ? (latest.snapshot.ssh.detectedSshServicePort === undefined ? latest.snapshot.ssh.port : latest.snapshot.ssh.detectedSshServicePort) : null,
    privilegeLevel: latest?.snapshot.privilegeLevel ?? "unknown", sudoAvailable: latest ? latest.snapshot.sudoAvailable : "unknown",
    lastSnapshotAt: latest?.collectedAt ?? null,
    availableLogSources: ["auth", "system", "kernel", "firewall", "nginx", "docker"], logSourcesAvailable: ["auth", "system", "kernel", "firewall", "nginx", "docker"],
    snapshotSections: Object.keys(LINUX_TELEMETRY_COMMANDS),
    readOnly: true,
    warnings: latest?.snapshot.privilegeLevel === "limited" ? ["Connected with limited privilege. Some telemetry requires sudo -n/NOPASSWD."] : [],
    suggestions: latest?.snapshot.findings.slice(0, 8).map((item) => ({ title: item.title, severity: item.severity, relatedActionHints: item.relatedActionHints, canCreateActionPlan: item.canCreateActionPlan })) ?? []
  };
}
