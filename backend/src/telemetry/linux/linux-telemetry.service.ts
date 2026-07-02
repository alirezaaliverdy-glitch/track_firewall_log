import { DeviceProtocol, DeviceType, type Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { ConnectorError, isLinuxSshCapable, LINUX_TELEMETRY_COMMANDS, resolveLinuxConnectionPort, runLinuxTelemetryCommands } from "../../connectors/linux-ssh.connector.js";
import { analyzeLinuxSecuritySnapshot } from "./linux-security-analyzer.service.js";
import type { LinuxSecuritySnapshot } from "./linux-telemetry.types.js";

const SECRET_PATTERNS = [
  /(password|passwd|token|api[_-]?key|secret|authorization)\s*[:=]\s*[^\s,;]+/gi,
  /(-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----)[\s\S]*?(-----END (?:RSA |OPENSSH )?PRIVATE KEY-----)/gi,
  /\b(Bearer)\s+[A-Za-z0-9._~+/-]+=*/gi
];

export function redactLinuxTelemetry(value: string) {
  return SECRET_PATTERNS.reduce((current, pattern) => current.replace(pattern, "$1=[REDACTED]"), value).slice(0, 200000);
}

function lines(value: string, limit = 500) {
  return redactLinuxTelemetry(value).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, limit);
}

function configValue(source: string, key: string, fallback = "unknown") {
  return source.match(new RegExp(`^${key}\\s+(.+)$`, "im"))?.[1]?.trim().toLowerCase() ?? fallback;
}

function sourceIps(source: string) {
  const counts: Record<string, number> = {};
  for (const match of source.matchAll(/\bfrom\s+((?:\d{1,3}\.){3}\d{1,3})\b/gi)) counts[match[1]] = (counts[match[1]] ?? 0) + 1;
  return counts;
}

function exposedPorts(source: string) {
  return Array.from(new Set(Array.from(source.matchAll(/(?:0\.0\.0\.0|\[::\]|\*):(\d{1,5})\b/g)).map((match) => Number(match[1])).filter((port) => port > 0 && port <= 65535)));
}

function shellUsers(source: string) {
  return lines(source).filter((line) => /\/([^/:]*sh|bash|zsh|fish)$/.test(line)).map((line) => line.split(":", 1)[0]).slice(0, 100);
}

function groupUsers(source: string) {
  return Array.from(new Set(lines(source).filter((line) => /^(sudo|wheel):/.test(line)).flatMap((line) => (line.split(":")[3] ?? "").split(",")).filter(Boolean)));
}

function parseHost(identity: string) {
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

function firewallStatus(source: string): "active" | "inactive" | "unknown" {
  if (/status:\s*active|table\s+(?:inet|ip)|^-P\s+\w+\s+(?:DROP|REJECT)|^running$/im.test(source)) return "active";
  if (/status:\s*inactive|not running|FirewallD is not running/i.test(source)) return "inactive";
  return source.trim() ? "unknown" : "inactive";
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
  return snapshot;
}

export async function getLatestLinuxSecuritySnapshot(deviceId: string) {
  const record = await prisma.deviceSnapshot.findFirst({ where: { deviceId, vendor: "linux", snapshotType: "linux_security" }, orderBy: { collectedAt: "desc" } });
  return record ? { id: record.id, collectedAt: record.collectedAt, snapshot: record.dataJson as unknown as LinuxSecuritySnapshot } : null;
}

export async function analyzeLinuxTelemetry(deviceId: string) {
  const latest = await getLatestLinuxSecuritySnapshot(deviceId);
  if (!latest) throw new Error("No Linux telemetry snapshot is available.");
  return { ...latest, analysis: analyzeLinuxSecuritySnapshot(latest.snapshot) };
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
