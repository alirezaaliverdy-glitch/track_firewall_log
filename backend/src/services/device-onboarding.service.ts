import { randomUUID } from "node:crypto";
import { DeviceEnvironment, DeviceProtocol, DeviceStatus, DeviceType, Prisma, type Device } from "@prisma/client";
import { CiscoConnectorError, ciscoIosXeSshConnector } from "../connectors/cisco/ios-xe/cisco-iosxe.ssh.connector.js";
import { detectCiscoPlatform, parseCiscoInterfacesStatus, parseCiscoVlans } from "../connectors/cisco/ios-xe/cisco-iosxe.parsers.js";
import { selectDeviceConnector } from "../connectors/connector-registry.service.js";
import { prisma } from "../db/prisma.js";
import { syncDeviceRecordToAsset } from "../assets/asset-intelligence.service.js";
import { getDeviceById } from "./device.service.js";
import { resolveCredentialById } from "./credential.service.js";

type OnboardingVendor = "linux" | "cisco" | "fortigate" | "mikrotik";
export class OnboardingCredentialInvalidError extends Error {}
type SessionStatus =
  | "draft"
  | "answers_saved"
  | "connection_testing"
  | "connection_verified"
  | "connection_failed"
  | "credential_missing"
  | "credential_invalid"
  | "platform_detecting"
  | "platform_detected"
  | "platform_unsupported"
  | "discovery_running"
  | "discovery_completed"
  | "discovery_failed"
  | "preview_ready"
  | "preview_failed"
  | "saving"
  | "completed"
  | "save_failed"
  | "validation_failed"
  | "cancelled";

type Draft = {
  vendor: OnboardingVendor;
  platform: string;
  connectionMethod: "ssh" | "api";
  name: string;
  host: string;
  managementPort: number;
  credentialId: string;
  enableCredentialId: string;
  ciscoLegacyCompatibilityApproved?: boolean;
  site: string;
  location: string;
  environment: "lab" | "staging" | "production";
};

type OnboardingSession = {
  id: string;
  deviceId?: string;
  status: SessionStatus;
  step: string;
  draft: Draft;
  test: Record<string, unknown> | null;
  detection: Record<string, unknown> | null;
  discovery: Record<string, unknown> | null;
  preview: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  privateEvidence: { showVersion?: string };
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

const sessions = new Map<string, OnboardingSession>();
const SENSITIVE_KEYS = /password|passphrase|private.?key|token|api.?key|secret/i;
const SUPPORTED_PLATFORMS: Record<OnboardingVendor, string[]> = {
  linux: ["linux"],
  cisco: ["cisco-ios-xe", "cisco-ios-classic", "cisco-nx-os", "cisco-asa"],
  fortigate: ["fortios"],
  mikrotik: ["routeros"]
};

function normalizeVendor(value: unknown): OnboardingVendor {
  const vendor = String(value ?? "linux").trim().toLowerCase().replace(/[\s_-]+edge$/, "").replace(/[\s_-]+/g, "");
  if (vendor === "linux" || vendor === "cisco" || vendor === "fortigate" || vendor === "mikrotik") return vendor;
  throw new Error("Unsupported vendor. Choose Linux, Cisco, FortiGate, or MikroTik.");
}

function defaultPlatform(vendor: OnboardingVendor) { return SUPPORTED_PLATFORMS[vendor][0]; }
function defaultPort(method: string) { return method === "api" ? 443 : 22; }
function now() { return new Date().toISOString(); }
function expiresAt() { return new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); }

function assertNoSecrets(input: Record<string, unknown>) {
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEYS.test(key)) throw new Error("Onboarding accepts credential references only; plaintext secrets are forbidden.");
    if (value && typeof value === "object" && !Array.isArray(value)) assertNoSecrets(value as Record<string, unknown>);
  }
}

function publicSession(session: OnboardingSession) {
  const safe = { ...session } as Partial<OnboardingSession>;
  delete safe.privateEvidence;
  return safe as Omit<OnboardingSession, "privateEvidence">;
}

function nullableJson(value: Record<string, unknown> | null) {
  return value ? json(value) : Prisma.DbNull;
}

function hydrateSession(row: {
  id: string; deviceId: string | null; status: string; step: string; draftJson: unknown;
  testJson: unknown; detectionJson: unknown; discoveryJson: unknown; previewJson: unknown;
  resultJson: unknown; privateEvidenceJson: unknown; createdAt: Date; updatedAt: Date; expiresAt: Date;
}): OnboardingSession {
  return {
    id: row.id, deviceId: row.deviceId ?? undefined, status: row.status as SessionStatus, step: row.step,
    draft: row.draftJson as Draft,
    test: row.testJson as Record<string, unknown> | null,
    detection: row.detectionJson as Record<string, unknown> | null,
    discovery: row.discoveryJson as Record<string, unknown> | null,
    preview: row.previewJson as Record<string, unknown> | null,
    result: row.resultJson as Record<string, unknown> | null,
    privateEvidence: (row.privateEvidenceJson ?? {}) as OnboardingSession["privateEvidence"],
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), expiresAt: row.expiresAt.toISOString()
  };
}

async function persistSession(session: OnboardingSession) {
  const data = {
    deviceId: session.deviceId ?? null, status: session.status, step: session.step,
    draftJson: json(session.draft), testJson: nullableJson(session.test), detectionJson: nullableJson(session.detection),
    discoveryJson: nullableJson(session.discovery), previewJson: nullableJson(session.preview), resultJson: nullableJson(session.result),
    privateEvidenceJson: json(session.privateEvidence), expiresAt: new Date(session.expiresAt)
  };
  await prisma.deviceOnboardingSession.upsert({
    where: { id: session.id }, update: data,
    create: { id: session.id, createdAt: new Date(session.createdAt), ...data }
  });
  sessions.set(session.id, session);
}

async function activeSession(id: string) {
  let session = sessions.get(id);
  if (!session) {
    const row = await prisma.deviceOnboardingSession.findUnique({ where: { id } });
    session = row ? hydrateSession(row) : undefined;
    if (session) sessions.set(id, session);
  }
  if (!session) throw new Error("Onboarding session not found.");
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    throw new Error("Onboarding session expired. Start a new session.");
  }
  return session;
}

function touch(session: OnboardingSession, status: SessionStatus, step: string) {
  session.status = status;
  session.step = step;
  session.updatedAt = now();
  return publicSession(session);
}

function fail(session: OnboardingSession, status: SessionStatus, step: string, error: unknown) {
  session.result = {
    recoverable: true,
    error: error instanceof Error ? error.message : "Onboarding step failed.",
    status
  };
  touch(session, status, step);
}

function deviceType(vendor: OnboardingVendor) {
  if (vendor === "linux") return DeviceType.linux_edge;
  if (vendor === "fortigate") return DeviceType.fortigate;
  if (vendor === "mikrotik") return DeviceType.mikrotik;
  return DeviceType.generic_firewall;
}

function asDevice(session: OnboardingSession, compatibilityProfile?: "modern" | "legacy_cisco"): Device {
  const draft = session.draft;
  const timestamp = new Date();
  return {
    id: session.deviceId ?? session.id,
    name: draft.name || `${draft.vendor}-device`,
    vendor: draft.vendor,
    type: deviceType(draft.vendor),
    host: draft.host,
    managementPort: draft.managementPort,
    protocol: draft.connectionMethod === "api" ? DeviceProtocol.api : DeviceProtocol.ssh,
    credentialId: draft.credentialId || null,
    credentialRef: null,
    environment: draft.environment as DeviceEnvironment,
    tags: [],
    status: DeviceStatus.unknown,
    capabilities: { onboarding: true, vendor: draft.vendor, platform: draft.platform, ...(draft.enableCredentialId ? { enableCredentialId: draft.enableCredentialId } : {}), ...(compatibilityProfile === "legacy_cisco" ? { sshCompatibilityProfile: "legacy_cisco" } : {}) },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function requireConnectionDraft(session: OnboardingSession) {
  const { draft } = session;
  if (!draft.name.trim()) throw new Error("Device name is required.");
  if (!draft.host.trim()) throw new Error("Management address is required.");
  if (!Number.isInteger(draft.managementPort) || draft.managementPort < 1 || draft.managementPort > 65535) throw new Error("Management port must be between 1 and 65535.");
  if (!draft.credentialId) {
    fail(session, "credential_missing", "credential", "A stored credential reference is required.");
    throw new Error("A stored credential reference is required.");
  }
  if (draft.connectionMethod !== "ssh") throw new Error(`No registered onboarding connector supports ${draft.vendor}/${draft.connectionMethod}. Use SSH or register unverified.`);
  if (!SUPPORTED_PLATFORMS[draft.vendor].includes(draft.platform)) throw new Error(`Platform ${draft.platform} is not supported for ${draft.vendor} onboarding.`);
}

export async function createOnboardingSession(input: Record<string, unknown> = {}) {
  assertNoSecrets(input);
  const existing = typeof input.deviceId === "string" && input.deviceId ? await getDeviceById(input.deviceId) : null;
  const vendor = normalizeVendor(input.vendor ?? existing?.vendor ?? existing?.type ?? "linux");
  const method = String(input.connectionMethod ?? existing?.protocol ?? "ssh") === "api" ? "api" : "ssh";
  const session: OnboardingSession = {
    id: randomUUID(),
    deviceId: existing?.id,
    status: "draft",
    step: "vendor",
    draft: {
      vendor,
      platform: String(input.platform ?? defaultPlatform(vendor)),
      connectionMethod: method,
      name: String(input.name ?? existing?.name ?? ""),
      host: normalizeManagementAddress(String(input.host ?? existing?.host ?? "")),
      managementPort: Number(input.managementPort ?? existing?.managementPort ?? defaultPort(method)),
      credentialId: String(input.credentialId ?? existing?.credentialId ?? ""),
      enableCredentialId: String(input.enableCredentialId ?? ((existing?.capabilities && typeof existing.capabilities === "object" && !Array.isArray(existing.capabilities) ? existing.capabilities as Record<string, unknown> : {}).enableCredentialId ?? "")),
      site: String(input.site ?? ""),
      location: String(input.location ?? ""),
      environment: String(input.environment ?? existing?.environment ?? "lab") as Draft["environment"],
      ciscoLegacyCompatibilityApproved: (input.ciscoLegacyCompatibilityApproved === true) || ((existing?.capabilities && typeof existing.capabilities === "object" && !Array.isArray(existing.capabilities) ? existing.capabilities as Record<string, unknown> : {}).sshCompatibilityProfile === "legacy_cisco")
    },
    test: null,
    detection: null,
    discovery: null,
    preview: null,
    result: null,
    privateEvidence: {},
    createdAt: now(),
    updatedAt: now(),
    expiresAt: expiresAt()
  };
  await persistSession(session);
  return publicSession(session);
}

export async function getOnboardingSession(id: string) { return publicSession(await activeSession(id)); }

export async function answerOnboardingSession(id: string, input: Record<string, unknown>) {
  assertNoSecrets(input);
  const session = await activeSession(id);
  if (session.status === "completed") throw new Error("Completed onboarding sessions are immutable.");
  const nextVendor = input.vendor === undefined ? session.draft.vendor : normalizeVendor(input.vendor);
  const nextMethod = input.connectionMethod === undefined ? session.draft.connectionMethod : String(input.connectionMethod) === "api" ? "api" : "ssh";
  session.draft = {
    vendor: nextVendor,
    platform: String(input.platform ?? (nextVendor === session.draft.vendor ? session.draft.platform : defaultPlatform(nextVendor))),
    connectionMethod: nextMethod,
    name: String(input.name ?? session.draft.name).trim(),
    host: normalizeManagementAddress(String(input.host ?? session.draft.host).trim()),
    managementPort: Number(input.managementPort ?? (nextMethod === session.draft.connectionMethod ? session.draft.managementPort : defaultPort(nextMethod))),
    credentialId: String(input.credentialId ?? session.draft.credentialId).trim(),
    enableCredentialId: String(input.enableCredentialId ?? session.draft.enableCredentialId ?? "").trim(),
    ciscoLegacyCompatibilityApproved: input.ciscoLegacyCompatibilityApproved === undefined ? session.draft.ciscoLegacyCompatibilityApproved === true : input.ciscoLegacyCompatibilityApproved === true,
    site: String(input.site ?? session.draft.site).trim(),
    location: String(input.location ?? session.draft.location).trim(),
    environment: String(input.environment ?? session.draft.environment) as Draft["environment"]
  };
  try {
    requireConnectionDraft(session);
  } catch (error) {
    if (session.status !== "credential_missing") fail(session, "validation_failed", "answers", error);
    await persistSession(session);
    throw error;
  }
  session.test = null;
  session.detection = null;
  session.discovery = null;
  session.preview = null;
  session.result = null;
  const response = touch(session, "answers_saved", "connection");
  await persistSession(session);
  return response;
}

export async function testOnboardingConnection(id: string) {
  const session = await activeSession(id);
  try {
    requireConnectionDraft(session);
    try {
      const credential = await resolveCredentialById(session.draft.credentialId);
      if (!credential) throw new Error("missing");
    } catch {
      throw new Error("CREDENTIAL_INVALID: Stored credential cannot be decrypted with the active credential key. Replace or re-enter the credential.");
    }
    const device = asDevice(session);
    const connector = session.draft.vendor === "cisco" ? null : selectDeviceConnector(device);
    if (session.draft.vendor !== "cisco" && !connector) throw new Error(`No registered connector supports ${session.draft.vendor}/${session.draft.connectionMethod}.`);
    session.test = { connected: false, connectorInvoked: true, connectorType: session.draft.vendor === "cisco" ? ciscoIosXeSshConnector.connectorType : connector!.name, startedAt: now() };
    touch(session, "connection_testing", "connection");
    await persistSession(session);
    if (session.draft.vendor === "cisco") {
      let result: Awaited<ReturnType<typeof ciscoIosXeSshConnector.runReadOnlyCommands>>;
      let legacyRetry = false;
      try {
        result = await ciscoIosXeSshConnector.runReadOnlyCommands(asDevice(session, "modern"), ["platform"]);
      } catch (error) {
        const diagnostic = error instanceof CiscoConnectorError ? error.toDiagnostic() : null;
        const negotiationFailed = diagnostic?.stage === "ssh_negotiation" || diagnostic?.code === "CISCO_SSH_NEGOTIATION_FAILED";
        if (!negotiationFailed || session.draft.ciscoLegacyCompatibilityApproved !== true) throw error;
        legacyRetry = true;
        result = await ciscoIosXeSshConnector.runReadOnlyCommands(asDevice(session, "legacy_cisco"), ["platform"]);
      }
      const platformResult = result.results[0];
      session.privateEvidence.showVersion = platformResult?.stdout ?? "";
      session.test = {
        connected: result.connectorInvoked && Boolean(platformResult),
        connectorInvoked: result.connectorInvoked,
        connectorType: ciscoIosXeSshConnector.connectorType,
        legacyCompatibilityRequested: result.connection.diagnostic.legacyCompatibilityRequested,
        legacyCompatibilityApplied: result.connection.diagnostic.legacyCompatibilityApplied,
        connectionPhase: result.connection.diagnostic.connectionPhase,
        readOnlyProbe: "show version",
        durationMs: platformResult?.durationMs ?? 0,
        warnings: result.warnings,
        semantic: result.connection.semantic,
        diagnostic: result.connection.diagnostic,
        promptMode: result.connection.promptMode,
        compatibilityProfile: result.connection.compatibilityProfile,
        legacyRetry
      };
    } else {
      const result = await connector!.testConnection(device);
      session.test = {
        connected: result.connected,
        connectorInvoked: true,
        connectorType: connector!.name,
        stages: result.stages,
        warnings: result.warnings,
        capabilities: result.capabilities
      };
    }
    if (session.test.connected !== true || session.test.connectorInvoked !== true) throw new Error("The connector did not complete a successful connection test.");
    const response = touch(session, "connection_verified", "detect");
    await persistSession(session);
    return response;
  } catch (error) {
    const credentialInvalid = error instanceof Error && error.message.startsWith("CREDENTIAL_INVALID:");
    const safeError = credentialInvalid ? new Error(error.message.replace(/^CREDENTIAL_INVALID:\s*/, "")) : error;
    const ciscoDiagnostic = error instanceof CiscoConnectorError ? error.toDiagnostic() : null;
    session.test = {
      connected: false,
      connectorInvoked: ciscoDiagnostic?.connectorInvoked ?? session.test?.connectorInvoked === true,
      connectorType: session.test?.connectorType,
      error: safeError instanceof Error ? safeError.message : "Connection test failed.",
      diagnostic: ciscoDiagnostic,
      legacyCompatibilityRequested: ciscoDiagnostic?.legacyCompatibilityRequested ?? session.draft.ciscoLegacyCompatibilityApproved === true,
      legacyCompatibilityApplied: ciscoDiagnostic?.legacyCompatibilityApplied ?? false,
      connectionPhase: ciscoDiagnostic?.connectionPhase ?? (session.test?.connectorInvoked === true ? "ssh_negotiation" : "input")
    };
    fail(session, credentialInvalid ? "credential_invalid" : "connection_failed", credentialInvalid ? "credential" : "connection", safeError);
    await persistSession(session);
    throw credentialInvalid ? new OnboardingCredentialInvalidError(safeError instanceof Error ? safeError.message : "Stored credential is invalid.") : safeError;
  }
}

export async function detectOnboardingPlatform(id: string) {
  const session = await activeSession(id);
  if (session.test?.connected !== true || session.test?.connectorInvoked !== true) throw new Error("Run a successful connector-backed connection test first.");
  touch(session, "platform_detecting", "platform");
  if (session.draft.vendor === "cisco") {
    const detection = detectCiscoPlatform(session.privateEvidence.showVersion ?? "");
    session.detection = detection;
    if (!detection.supported || detection.platform !== "cisco-ios-xe") {
      session.draft.platform = detection.platform;
      session.result = { recoverable: true, status: "platform_unsupported", error: `Detected platform ${detection.platform} is not supported by the Cisco IOS-XE automation path.`, connectivityVerified: true, connectorInvoked: session.test?.connectorInvoked === true, platform: detection.platform };
      const response = touch(session, "platform_unsupported", "review");
      await persistSession(session);
      return response;
    }
    session.draft.platform = detection.platform;
  } else {
    session.detection = {
      vendor: session.draft.vendor,
      platform: session.draft.platform,
      supported: SUPPORTED_PLATFORMS[session.draft.vendor].includes(session.draft.platform),
      confidence: 100,
      evidence: ["registered connector completed its safe connection test"]
    };
  }
  const response = touch(session, "platform_detected", "discover");
  await persistSession(session);
  return response;
}

export async function discoverOnboardingInventory(id: string) {
  const session = await activeSession(id);
  if (session.detection?.supported !== true) throw new Error("A supported platform must be detected before discovery.");
  touch(session, "discovery_running", "discover");
  try {
    if (session.draft.vendor === "cisco") {
      const result = await ciscoIosXeSshConnector.runReadOnlyCommands(asDevice(session, session.draft.ciscoLegacyCompatibilityApproved ? "legacy_cisco" : "modern"), ["inventory", "interfacesStatus", "ipInterfaceBrief", "vlanBrief"]);
      if (!result.connectorInvoked) throw new Error("Cisco inventory connector was not invoked.");
      const byId = Object.fromEntries(result.results.map((item) => [item.commandId, item]));
      session.discovery = {
        connectorInvoked: true,
        connectorType: ciscoIosXeSshConnector.connectorType,
        commandsVerified: result.results.map((item) => item.commandId),
        inventoryAvailable: Boolean(byId.inventory?.stdout.trim()),
        interfaceCount: parseCiscoInterfacesStatus(byId.interfacesStatus?.stdout ?? "").length,
        vlanCount: parseCiscoVlans(byId.vlanBrief?.stdout ?? "").length,
        capabilities: ["system.version.read", "system.inventory.read", "interfaces.status.read", "interfaces.ip.brief.read", "vlan.read"],
        warnings: result.warnings
      };
    } else {
      session.discovery = {
        connectorInvoked: session.test?.connectorInvoked === true,
        connectorType: session.test?.connectorType,
        capabilities: session.test?.capabilities ?? {},
        warnings: session.test?.warnings ?? []
      };
    }
    const response = touch(session, "discovery_completed", "preview");
    await persistSession(session);
    return response;
  } catch (error) {
    fail(session, "discovery_failed", "discover", error);
    await persistSession(session);
    throw error;
  }
}

export async function previewOnboardingSession(id: string) {
  const session = await activeSession(id);
  if (session.discovery?.connectorInvoked !== true) throw new Error("Connector-backed discovery is required before preview.");
  try {
    session.preview = {
      operation: session.deviceId ? "update" : "create",
      device: { ...session.draft, credentialId: session.draft.credentialId ? "stored-reference-selected" : "missing" },
      detection: session.detection,
      discovery: session.discovery,
      initialHealthCollection: true,
      deviceMutation: false
    };
    const response = touch(session, "preview_ready", "preview");
    await persistSession(session);
    return response;
  } catch (error) {
    fail(session, "preview_failed", "preview", error);
    await persistSession(session);
    throw error;
  }
}

function slug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, "-").replace(/^-|-$/g, "") || "default";
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function archivedInventory(value: unknown) {
  const capabilities = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const inventory = capabilities.inventory && typeof capabilities.inventory === "object" && !Array.isArray(capabilities.inventory) ? capabilities.inventory as Record<string, unknown> : {};
  return capabilities.inventoryStatus === "archived" || inventory.status === "archived" || Boolean(inventory.removedAt);
}

export class OnboardingDuplicateDeviceError extends Error {
  constructor(public readonly deviceId: string) {
    super("A Device with the same vendor, host, and management port already exists.");
  }

  get route() { return `/assets/devices/${this.deviceId}`; }
}

export class OnboardingManagementIpConflictError extends Error {
  constructor(public readonly managementIp: string, public readonly deviceId: string | null, public readonly assetId: string | null) {
    super("Another device or asset already owns this management address.");
  }

  get route() { return this.deviceId ? `/assets/devices/${this.deviceId}` : undefined; }
}

function normalizeManagementAddress(value: string) {
  const raw = value.trim().toLowerCase();
  const ipv4 = raw.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return raw;
  const octets = ipv4.slice(1).map((item) => Number(item));
  return octets.every((item) => Number.isInteger(item) && item >= 0 && item <= 255) ? octets.join(".") : raw;
}

function sameVendor(a: string | null | undefined, b: string) {
  return String(a ?? "").trim().toLowerCase() === b.trim().toLowerCase();
}

function mergeReactivatedCapabilities(existing: unknown, next: Record<string, unknown>) {
  const merged = { ...((existing && typeof existing === "object" && !Array.isArray(existing)) ? existing as Record<string, unknown> : {}), ...next };
  delete merged.inventoryStatus;
  const inventory = merged.inventory && typeof merged.inventory === "object" && !Array.isArray(merged.inventory) ? { ...merged.inventory as Record<string, unknown> } : null;
  if (inventory) {
    delete inventory.status;
    delete inventory.removedAt;
    delete inventory.removedReason;
    delete inventory.reason;
    if (Object.keys(inventory).length > 0) merged.inventory = inventory;
    else delete merged.inventory;
  }
  return merged;
}

type RegistrationTarget = { deviceId: string | null; assetId: string | null; reactivated: boolean };

async function resolveOnboardingRegistrationTarget(tx: Prisma.TransactionClient, draft: Draft, sessionDeviceId?: string): Promise<RegistrationTarget> {
  const managementIp = normalizeManagementAddress(draft.host);
  const asset = await tx.asset.findUnique({ where: { managementIp }, include: { device: true } });
  const devices = await tx.device.findMany({ where: { host: { equals: managementIp, mode: "insensitive" } }, orderBy: { updatedAt: "desc" }, take: 10 });
  const byId = new Map<string, typeof devices[number]>();
  for (const device of devices) byId.set(device.id, device);
  if (asset?.device) byId.set(asset.device.id, asset.device);
  if (sessionDeviceId) {
    const existing = byId.get(sessionDeviceId) ?? await tx.device.findUnique({ where: { id: sessionDeviceId } });
    if (existing) byId.set(existing.id, existing);
  }
  const candidates = [...byId.values()];
  const reusable = candidates.find((device) => {
    if (sessionDeviceId && device.id === sessionDeviceId) return true;
    const sameAddress = normalizeManagementAddress(device.host) === managementIp && device.managementPort === draft.managementPort;
    return sameAddress && (sameVendor(device.vendor, draft.vendor) || archivedInventory(device.capabilities));
  }) ?? null;
  const conflicting = candidates.find((device) => device.id !== reusable?.id && normalizeManagementAddress(device.host) === managementIp && !archivedInventory(device.capabilities));
  if (conflicting) throw new OnboardingManagementIpConflictError(managementIp, conflicting.id, asset?.id ?? null);
  if (asset?.device && reusable?.id !== asset.device.id && !archivedInventory(asset.device.capabilities)) {
    throw new OnboardingManagementIpConflictError(managementIp, asset.device.id, asset.id);
  }
  return { deviceId: sessionDeviceId ?? reusable?.id ?? null, assetId: asset?.id ?? null, reactivated: Boolean(reusable && archivedInventory(reusable.capabilities)) || asset?.managedState === "archived" };
}
function validateUnverifiedDraft(session: OnboardingSession, input: Record<string, unknown>) {
  assertNoSecrets(input);
  const vendor = input.vendor === undefined ? session.draft.vendor : normalizeVendor(input.vendor);
  const platform = String(input.platform ?? (vendor === session.draft.vendor ? session.draft.platform : defaultPlatform(vendor))).trim();
  const name = String(input.name ?? session.draft.name).trim();
  const host = normalizeManagementAddress(String(input.host ?? session.draft.host).trim());
  const managementPort = Number(input.managementPort ?? session.draft.managementPort);
  const environment = String(input.environment ?? session.draft.environment) as Draft["environment"];
  const connectionMethod = String(input.connectionMethod ?? session.draft.connectionMethod) === "api" ? "api" : "ssh";
  if (!SUPPORTED_PLATFORMS[vendor].includes(platform)) throw new Error(`Platform ${platform} is not supported for ${vendor} onboarding.`);
  if (!name) throw new Error("Device name is required.");
  if (!host) throw new Error("Management address is required.");
  if (!Number.isInteger(managementPort) || managementPort < 1 || managementPort > 65535) throw new Error("Management port must be an integer between 1 and 65535.");
  if (!(["lab", "staging", "production"] as string[]).includes(environment)) throw new Error("Environment must be lab, staging, or production.");
  return {
    vendor, platform, name, host, managementPort, environment, connectionMethod,
    credentialId: String(input.credentialId ?? session.draft.credentialId).trim(),
    enableCredentialId: String(input.enableCredentialId ?? session.draft.enableCredentialId ?? "").trim(),
    ciscoLegacyCompatibilityApproved: input.ciscoLegacyCompatibilityApproved === undefined ? session.draft.ciscoLegacyCompatibilityApproved === true : input.ciscoLegacyCompatibilityApproved === true,
    site: String(input.site ?? session.draft.site).trim(),
    location: String(input.location ?? session.draft.location).trim()
  } satisfies Draft;
}

export async function registerUnverifiedOnboardingSession(id: string, input: Record<string, unknown> = {}) {
  const session = await activeSession(id);
  if (session.status === "completed") throw new Error("Completed onboarding sessions are immutable.");
  const draft = validateUnverifiedDraft(session, input);
  const normalizedVendor = draft.vendor.toLowerCase();

  touch(session, "saving", "save");
  const createdAt = now();
  const nextCapabilities: Record<string, unknown> = {
    onboarding: {
      sessionId: session.id,
      verificationStatus: "unverified",
      connectorInvoked: false,
      connectionVerified: false,
      platform: draft.platform,
      createdAt,
      ...(draft.enableCredentialId ? { enableCredentialId: draft.enableCredentialId } : {}),
      ...(draft.ciscoLegacyCompatibilityApproved ? { sshCompatibilityProfile: "legacy_cisco" } : {})
    },
    ...(draft.enableCredentialId ? { enableCredentialId: draft.enableCredentialId } : {}),
    ...(draft.ciscoLegacyCompatibilityApproved ? { sshCompatibilityProfile: "legacy_cisco" } : {})
  };
  try {
    const persisted = await prisma.$transaction(async (tx) => {
      const target = await resolveOnboardingRegistrationTarget(tx, draft, session.deviceId);
      const existingDevice = target.deviceId ? await tx.device.findUnique({ where: { id: target.deviceId } }) : null;
      const wasUpdate = Boolean(target.deviceId);
      const data = {
        name: draft.name,
        vendor: normalizedVendor,
        type: deviceType(draft.vendor),
        host: draft.host,
        managementPort: draft.managementPort,
        protocol: draft.connectionMethod === "api" ? DeviceProtocol.api : DeviceProtocol.ssh,
        environment: draft.environment as DeviceEnvironment,
        tags: [draft.site ? `site:${draft.site}` : "", draft.location ? `location:${draft.location}` : ""].filter(Boolean),
        status: DeviceStatus.unknown,
        capabilities: json(mergeReactivatedCapabilities(existingDevice?.capabilities, nextCapabilities)),
        credentialId: draft.credentialId || null
      };
      const device = target.deviceId
        ? await tx.device.update({ where: { id: target.deviceId }, data })
        : await tx.device.create({ data });
      const { asset } = await syncDeviceRecordToAsset(tx, device);
      let siteId: string | undefined;
      let locationId: string | undefined;
      if (draft.site) {
        const site = await tx.assetSite.upsert({
          where: { slug: slug(draft.site) },
          update: { name: draft.site },
          create: { slug: slug(draft.site), name: draft.site }
        });
        siteId = site.id;
        if (draft.location) {
          const location = await tx.assetLocation.upsert({
            where: { siteId_slug: { siteId: site.id, slug: slug(draft.location) } },
            update: { name: draft.location },
            create: { siteId: site.id, slug: slug(draft.location), name: draft.location }
          });
          locationId = location.id;
        }
        await tx.asset.update({ where: { id: asset.id }, data: { siteId, locationId: locationId ?? null } });
      }
      await tx.auditLog.create({
        data: {
          deviceId: device.id,
          action: wasUpdate ? "device.onboarding_unverified_updated" : "device.onboarding_unverified_created",
          targetType: "Device",
          targetId: device.id,
          dryRun: false,
          approvalStatus: "not_required",
          metadata: json({ verificationStatus: "unverified", connectorInvoked: false, connectionVerified: false, assetId: asset.id, siteId, locationId, reactivated: target.reactivated })
        }
      });
      return { device, asset };
    });
    session.draft = draft;
    session.deviceId = persisted.device.id;
    session.test = { connected: false, connectorInvoked: false, verificationStatus: "unverified" };
    session.result = {
      deviceId: persisted.device.id,
      assetId: persisted.asset.id,
      route: `/assets/devices/${persisted.device.id}`,
      verificationStatus: "unverified",
      connectorInvoked: false,
      connectionVerified: false
    };
    const response = touch(session, "completed", "result");
    await persistSession(session);
    return response;
  } catch (error) {
    fail(session, "save_failed", "save", error);
    await persistSession(session);
    throw error;
  }
}

export async function commitOnboardingSession(id: string) {
  const session = await activeSession(id);
  if (session.status !== "preview_ready" || session.test?.connectorInvoked !== true || session.discovery?.connectorInvoked !== true) {
    throw new Error("A connector-backed test, supported detection, discovery, and preview are required before save.");
  }
  touch(session, "saving", "save");
  const draft = session.draft;

  const capabilities: Record<string, unknown> = {
    onboarding: { sessionId: session.id, platform: draft.platform, connectorType: session.test.connectorType, verifiedAt: now(), ...(draft.enableCredentialId ? { enableCredentialId: draft.enableCredentialId } : {}), ...(draft.ciscoLegacyCompatibilityApproved ? { sshCompatibilityProfile: "legacy_cisco" } : {}) },
    ...(draft.enableCredentialId ? { enableCredentialId: draft.enableCredentialId } : {}),
    ...(draft.ciscoLegacyCompatibilityApproved ? { sshCompatibilityProfile: "legacy_cisco" } : {})
  };
  if (draft.vendor === "cisco") {
    capabilities.cisco = { showVersion: session.privateEvidence.showVersion };
    capabilities.ciscoDetection = session.detection;
    capabilities.ciscoDiscovery = session.discovery;
  }
  try {
    const persisted = await prisma.$transaction(async (tx) => {
      const target = await resolveOnboardingRegistrationTarget(tx, draft, session.deviceId);
      const existingDevice = target.deviceId ? await tx.device.findUnique({ where: { id: target.deviceId } }) : null;
      const wasUpdate = Boolean(target.deviceId);
      const data = {
        name: draft.name, vendor: draft.vendor, type: deviceType(draft.vendor), host: draft.host,
        managementPort: draft.managementPort, protocol: DeviceProtocol.ssh, credentialId: draft.credentialId,
        environment: draft.environment as DeviceEnvironment,
        tags: [draft.site ? `site:${draft.site}` : "", draft.location ? `location:${draft.location}` : ""].filter(Boolean),
        status: DeviceStatus.online, capabilities: json(mergeReactivatedCapabilities(existingDevice?.capabilities, capabilities))
      };
      const device = target.deviceId
        ? await tx.device.update({ where: { id: target.deviceId }, data })
        : await tx.device.create({ data });
      const { asset } = await syncDeviceRecordToAsset(tx, device);
      let siteId: string | undefined;
      let locationId: string | undefined;
      if (draft.site) {
        const site = await tx.assetSite.upsert({ where: { slug: slug(draft.site) }, update: { name: draft.site }, create: { slug: slug(draft.site), name: draft.site } });
        siteId = site.id;
        if (draft.location) {
          const location = await tx.assetLocation.upsert({
            where: { siteId_slug: { siteId: site.id, slug: slug(draft.location) } },
            update: { name: draft.location }, create: { siteId: site.id, slug: slug(draft.location), name: draft.location }
          });
          locationId = location.id;
        }
        await tx.asset.update({ where: { id: asset.id }, data: { siteId, locationId: locationId ?? null } });
      }
      const health = await tx.healthSnapshot.create({
        data: {
          deviceId: device.id, assetId: asset.id, score: 100, state: "healthy",
          summary: "Initial connector-backed onboarding verification succeeded.",
          metricsJson: json({ connectionVerified: true, connectorInvoked: true }), warningsJson: json([])
        }
      });
      await tx.auditLog.create({
        data: {
          deviceId: device.id, action: wasUpdate ? "device.onboarding_verified_updated" : "device.onboarding_verified_created",
          targetType: "Device", targetId: device.id, dryRun: false, approvalStatus: "not_required",
          metadata: json({ verificationStatus: "verified", connectorInvoked: true, connectionVerified: true, assetId: asset.id, healthSnapshotId: health.id, siteId, locationId, reactivated: target.reactivated })
        }
      });
      return { device, asset, health };
    });
    session.deviceId = persisted.device.id;
    session.result = {
      deviceId: persisted.device.id,
      assetId: persisted.asset.id,
      route: `/assets/devices/${persisted.device.id}`,
      verificationStatus: "verified",
      connectorInvoked: true,
      connectionVerified: true,
      platform: draft.platform,
      capabilityDiscovery: session.discovery,
      initialHealth: { id: persisted.health.id, status: "healthy", connectorInvoked: true }
    };
    const response = touch(session, "completed", "result");
    await persistSession(session);
    return response;
  } catch (error) {
    fail(session, "save_failed", "save", error);
    await persistSession(session);
    throw error;
  }
}

export async function cancelOnboardingSession(id: string) {
  const session = await activeSession(id);
  const response = touch(session, "cancelled", "cancelled");
  await persistSession(session);
  return response;
}

export async function retryOnboardingSession(id: string) {
  const session = await activeSession(id);
  if (session.status === "completed") throw new Error("Completed onboarding sessions cannot be retried.");
  if (session.status === "cancelled") throw new Error("Cancelled onboarding sessions cannot be retried. Start a new session.");
  if (session.status === "draft") {
    session.result = {
      recoverable: true,
      retryFrom: "draft",
      previousStatus: "draft"
    };
    const response = touch(session, "draft", "vendor");
    await persistSession(session);
    return response;
  }
  const recoverableStatuses = new Set<SessionStatus>([
    "validation_failed",
    "credential_missing",
    "credential_invalid",
    "connection_failed",
    "platform_unsupported",
    "discovery_failed",
    "preview_failed",
    "save_failed"
  ]);
  if (!recoverableStatuses.has(session.status)) return publicSession(session);
  const nextStatus: SessionStatus = session.status === "save_failed" && session.preview ? "preview_ready" : "answers_saved";
  session.result = {
    recoverable: true,
    retryFrom: nextStatus,
    previousStatus: session.status
  };
  const response = touch(session, nextStatus, nextStatus === "preview_ready" ? "preview" : "connection");
  await persistSession(session);
  return response;
}

export function resetOnboardingSessionsForTest() { sessions.clear(); }
