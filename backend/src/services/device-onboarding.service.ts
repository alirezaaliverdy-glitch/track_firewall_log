import { randomUUID } from "node:crypto";
import { DeviceEnvironment, DeviceProtocol, DeviceStatus, DeviceType, type Device } from "@prisma/client";
import { ciscoIosXeSshConnector } from "../connectors/cisco/ios-xe/cisco-iosxe.ssh.connector.js";
import { detectCiscoPlatform, parseCiscoInterfacesStatus, parseCiscoVlans } from "../connectors/cisco/ios-xe/cisco-iosxe.parsers.js";
import { selectDeviceConnector } from "../connectors/connector-registry.service.js";
import { prisma } from "../db/prisma.js";
import { syncDeviceToAsset } from "../assets/asset-intelligence.service.js";
import { createDevice, getDeviceById, updateDevice } from "./device.service.js";

type OnboardingVendor = "linux" | "cisco" | "fortigate" | "mikrotik";
type SessionStatus =
  | "draft"
  | "answers_saved"
  | "connection_testing"
  | "connection_verified"
  | "connection_failed"
  | "platform_detecting"
  | "platform_detected"
  | "platform_unsupported"
  | "discovery_running"
  | "discovery_completed"
  | "discovery_failed"
  | "preview_ready"
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
  cisco: ["cisco-ios-xe"],
  fortigate: ["fortios"],
  mikrotik: ["routeros"]
};

function normalizeVendor(value: unknown): OnboardingVendor {
  const vendor = String(value ?? "linux").trim().toLowerCase().replace(/[_-]edge$/, "");
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
  const { privateEvidence: _privateEvidence, ...safe } = session;
  return safe;
}

function activeSession(id: string) {
  const session = sessions.get(id);
  if (!session) throw new Error("Onboarding session not found.");
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    sessions.delete(id);
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

function asDevice(session: OnboardingSession): Device {
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
    capabilities: { onboarding: true, vendor: draft.vendor, platform: draft.platform },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function requireConnectionDraft(session: OnboardingSession) {
  const { draft } = session;
  if (!draft.name.trim()) throw new Error("Device name is required.");
  if (!draft.host.trim()) throw new Error("Management address is required.");
  if (!Number.isInteger(draft.managementPort) || draft.managementPort < 1 || draft.managementPort > 65535) throw new Error("Management port must be between 1 and 65535.");
  if (!draft.credentialId) throw new Error("A stored credential reference is required.");
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
      host: String(input.host ?? existing?.host ?? ""),
      managementPort: Number(input.managementPort ?? existing?.managementPort ?? defaultPort(method)),
      credentialId: String(input.credentialId ?? existing?.credentialId ?? ""),
      site: String(input.site ?? ""),
      location: String(input.location ?? ""),
      environment: String(input.environment ?? existing?.environment ?? "lab") as Draft["environment"]
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
  sessions.set(session.id, session);
  return publicSession(session);
}

export function getOnboardingSession(id: string) { return publicSession(activeSession(id)); }

export function answerOnboardingSession(id: string, input: Record<string, unknown>) {
  assertNoSecrets(input);
  const session = activeSession(id);
  if (session.status === "completed") throw new Error("Completed onboarding sessions are immutable.");
  const nextVendor = input.vendor === undefined ? session.draft.vendor : normalizeVendor(input.vendor);
  const nextMethod = input.connectionMethod === undefined ? session.draft.connectionMethod : String(input.connectionMethod) === "api" ? "api" : "ssh";
  session.draft = {
    vendor: nextVendor,
    platform: String(input.platform ?? (nextVendor === session.draft.vendor ? session.draft.platform : defaultPlatform(nextVendor))),
    connectionMethod: nextMethod,
    name: String(input.name ?? session.draft.name).trim(),
    host: String(input.host ?? session.draft.host).trim(),
    managementPort: Number(input.managementPort ?? (nextMethod === session.draft.connectionMethod ? session.draft.managementPort : defaultPort(nextMethod))),
    credentialId: String(input.credentialId ?? session.draft.credentialId).trim(),
    site: String(input.site ?? session.draft.site).trim(),
    location: String(input.location ?? session.draft.location).trim(),
    environment: String(input.environment ?? session.draft.environment) as Draft["environment"]
  };
  try {
    requireConnectionDraft(session);
  } catch (error) {
    fail(session, "validation_failed", "answers", error);
    throw error;
  }
  session.test = null;
  session.detection = null;
  session.discovery = null;
  session.preview = null;
  session.result = null;
  return touch(session, "answers_saved", "connection");
}

export async function testOnboardingConnection(id: string) {
  const session = activeSession(id);
  requireConnectionDraft(session);
  const device = asDevice(session);
  touch(session, "connection_testing", "connection");
  try {
    if (session.draft.vendor === "cisco") {
      const result = await ciscoIosXeSshConnector.runReadOnlyCommands(device, ["platform"]);
      const platformResult = result.results[0];
      session.privateEvidence.showVersion = platformResult?.stdout ?? "";
      session.test = {
        connected: result.connectorInvoked && Boolean(platformResult),
        connectorInvoked: result.connectorInvoked,
        connectorType: ciscoIosXeSshConnector.connectorType,
        readOnlyProbe: "show version",
        durationMs: platformResult?.durationMs ?? 0,
        warnings: result.warnings
      };
    } else {
      const connector = selectDeviceConnector(device);
      if (!connector) throw new Error(`No registered connector supports ${session.draft.vendor}/${session.draft.connectionMethod}.`);
      const result = await connector.testConnection(device);
      session.test = {
        connected: result.connected,
        connectorInvoked: true,
        connectorType: connector.name,
        stages: result.stages,
        warnings: result.warnings,
        capabilities: result.capabilities
      };
    }
    if (session.test.connected !== true || session.test.connectorInvoked !== true) throw new Error("The connector did not complete a successful connection test.");
    return touch(session, "connection_verified", "detect");
  } catch (error) {
    session.test = { connected: false, connectorInvoked: false, error: error instanceof Error ? error.message : "Connection test failed." };
    fail(session, "connection_failed", "connection", error);
    throw error;
  }
}

export async function detectOnboardingPlatform(id: string) {
  const session = activeSession(id);
  if (session.test?.connected !== true || session.test?.connectorInvoked !== true) throw new Error("Run a successful connector-backed connection test first.");
  touch(session, "platform_detecting", "platform");
  if (session.draft.vendor === "cisco") {
    const detection = detectCiscoPlatform(session.privateEvidence.showVersion ?? "");
    session.detection = detection;
    if (!detection.supported || detection.platform !== "cisco-ios-xe") {
      fail(session, "platform_unsupported", "platform", `Detected platform ${detection.platform} is not supported by the Cisco IOS-XE onboarding path.`);
      throw new Error(`Detected platform ${detection.platform} is not supported by the Cisco IOS-XE onboarding path.`);
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
  return touch(session, "platform_detected", "discover");
}

export async function discoverOnboardingInventory(id: string) {
  const session = activeSession(id);
  if (session.detection?.supported !== true) throw new Error("A supported platform must be detected before discovery.");
  touch(session, "discovery_running", "discover");
  try {
    if (session.draft.vendor === "cisco") {
      const result = await ciscoIosXeSshConnector.runReadOnlyCommands(asDevice(session), ["inventory", "interfacesStatus", "ipInterfaceBrief", "vlanBrief"]);
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
    return touch(session, "discovery_completed", "preview");
  } catch (error) {
    fail(session, "discovery_failed", "discover", error);
    throw error;
  }
}

export async function previewOnboardingSession(id: string) {
  const session = activeSession(id);
  if (session.discovery?.connectorInvoked !== true) throw new Error("Connector-backed discovery is required before preview.");
  session.preview = {
    operation: session.deviceId ? "update" : "create",
    device: { ...session.draft, credentialId: session.draft.credentialId ? "stored-reference-selected" : "missing" },
    detection: session.detection,
    discovery: session.discovery,
    initialHealthCollection: true,
    deviceMutation: false
  };
  return touch(session, "preview_ready", "preview");
}

function slug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, "-").replace(/^-|-$/g, "") || "default";
}

export async function commitOnboardingSession(id: string) {
  const session = activeSession(id);
  if (session.status !== "preview_ready" || session.test?.connectorInvoked !== true || session.discovery?.connectorInvoked !== true) {
    throw new Error("A connector-backed test, supported detection, discovery, and preview are required before save.");
  }
  touch(session, "saving", "save");
  const draft = session.draft;
  const capabilities: Record<string, unknown> = {
    onboarding: { sessionId: session.id, platform: draft.platform, connectorType: session.test.connectorType, verifiedAt: now() }
  };
  if (draft.vendor === "cisco") {
    capabilities.cisco = { showVersion: session.privateEvidence.showVersion };
    capabilities.ciscoDetection = session.detection;
    capabilities.ciscoDiscovery = session.discovery;
  }
  const input = {
    name: draft.name,
    vendor: draft.vendor,
    type: deviceType(draft.vendor),
    host: draft.host,
    managementPort: draft.managementPort,
    protocol: draft.connectionMethod === "api" ? DeviceProtocol.api : DeviceProtocol.ssh,
    credentialId: draft.credentialId,
    environment: draft.environment,
    tags: [draft.site ? `site:${draft.site}` : "", draft.location ? `location:${draft.location}` : ""].filter(Boolean),
    status: DeviceStatus.online,
    capabilities
  };
  let device;
  let asset;
  try {
    device = session.deviceId ? await updateDevice(session.deviceId, input) : await createDevice(input);
    asset = await syncDeviceToAsset(device.id);
  } catch (error) {
    fail(session, "save_failed", "save", error);
    throw error;
  }
  if (asset && draft.site) {
    const site = await prisma.assetSite.upsert({ where: { slug: slug(draft.site) }, update: { name: draft.site }, create: { slug: slug(draft.site), name: draft.site } });
    let locationId: string | undefined;
    if (draft.location) {
      const location = await prisma.assetLocation.upsert({
        where: { siteId_slug: { siteId: site.id, slug: slug(draft.location) } },
        update: { name: draft.location },
        create: { siteId: site.id, slug: slug(draft.location), name: draft.location }
      });
      locationId = location.id;
    }
    await prisma.asset.update({ where: { id: asset.id }, data: { siteId: site.id, ...(locationId ? { locationId } : {}) } });
  }
  session.deviceId = device.id;
  session.result = {
    deviceId: device.id,
    assetId: asset?.id ?? null,
    route: `/assets/devices/${device.id}`,
    connectorInvoked: true,
    connectionVerified: true,
    platform: draft.platform,
    capabilityDiscovery: session.discovery,
    initialHealth: { status: "online", connectorInvoked: true }
  };
  return touch(session, "completed", "result");
}

export function cancelOnboardingSession(id: string) {
  const session = activeSession(id);
  return touch(session, "cancelled", "cancelled");
}

export function resetOnboardingSessionsForTest() { sessions.clear(); }
