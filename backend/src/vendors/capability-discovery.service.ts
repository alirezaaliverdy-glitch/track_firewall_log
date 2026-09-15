import { DeviceStatus, type Device, type Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { CAPABILITY_REGISTRY, getCapabilitiesForVendor } from "./capability.registry.js";
import { getPlatformsForVendor } from "./platform.registry.js";
import { getVendor, VENDOR_REGISTRY } from "./vendor.registry.js";
import type { CapabilitySupport, PlatformDetectionResult } from "./vendor.types.js";
import {
  buildCiscoIosCapabilityProfile,
  buildCiscoIosCollection,
  CISCO_IOS_CLASSIC_DISCOVERY_COMMANDS,
  CISCO_IOS_CLASSIC_INVENTORY_COMMANDS
} from "../connectors/cisco/ios-xe/cisco-iosxe.inventory.js";
import {
  CiscoConnectorError,
  ciscoIosXeSshConnector,
  redactCiscoCliOutput
} from "../connectors/cisco/ios-xe/cisco-iosxe.ssh.connector.js";
import { detectCiscoPlatform, isSupportedCiscoAutomationPlatform } from "../connectors/cisco/ios-xe/cisco-iosxe.parsers.js";

function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function asObject(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function asString(value: unknown) { return typeof value === "string" ? value : ""; }

export class VendorCapabilityRefreshError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode = 502) {
    super(message);
    this.name = "VendorCapabilityRefreshError";
  }
}

export function listVendors() { return VENDOR_REGISTRY; }
export function vendorDetail(vendorKey: string) { const vendor = getVendor(vendorKey); return vendor ? { ...vendor, platforms: getPlatformsForVendor(vendorKey), capabilities: getCapabilitiesForVendor(vendorKey) } : null; }

function defaultDetection(device: { vendor: string; capabilities: unknown }): PlatformDetectionResult {
  const capabilities = asObject(device.capabilities);
  const cisco = asObject(capabilities.cisco);
  const showVersion = asString(cisco.showVersion ?? cisco.show_version ?? cisco.versionOutput);
  if (showVersion) return detectCiscoPlatform(showVersion);
  const vendor = device.vendor.toLowerCase();
  if (vendor.includes("cisco")) return { vendor: "cisco", platform: "cisco-unknown", version: null, model: null, hostname: null, confidence: 35, evidence: ["device vendor field contains cisco but no show version evidence is cached"], supported: false };
  return { vendor, platform: `${vendor}-unknown`, version: null, model: null, hostname: null, confidence: 20, evidence: ["no platform evidence cached"], supported: false };
}

function supportsFromDetection(detection: PlatformDetectionResult): CapabilitySupport[] {
  return CAPABILITY_REGISTRY.filter((capability) => capability.vendorKey === detection.vendor).map((capability) => {
    const platformAllowed = capability.platformKeys.includes(detection.platform);
    const implemented = capability.implementationState === "implemented";
    const supported = implemented && platformAllowed && detection.supported;
    return {
      capabilityKey: capability.key,
      state: capability.implementationState,
      supported,
      executable: false,
      reason: supported ? "Read-only capability is available through the Cisco SSH2 capability foundation." : platformAllowed ? `Capability is ${capability.implementationState}.` : `Platform ${detection.platform} is not enabled for this capability.`,
      evidence: detection.evidence
    };
  });
}

export async function getDeviceVendorCapabilities(deviceId: string) {
  const device = await prisma.device.findUnique({ where: { id: deviceId }, include: { deviceCapabilityCaches: { orderBy: { refreshedAt: "desc" }, take: 1 } } });
  if (!device) return null;
  const cached = device.deviceCapabilityCaches[0];
  if (cached && cached.expiresAt > new Date()) {
    return { deviceId, cached: true, vendorKey: cached.vendorKey, platformKey: cached.platformKey, connectorType: cached.connectorType, detection: cached.detectionJson, capabilities: cached.capabilitiesJson, facts: cached.factsJson, warnings: cached.warningsJson, refreshedAt: cached.refreshedAt, expiresAt: cached.expiresAt };
  }
  return refreshDeviceVendorCapabilities(deviceId, false);
}

function isCiscoDevice(device: Pick<Device, "vendor" | "capabilities">) {
  return device.vendor.toLowerCase().includes("cisco") || JSON.stringify(device.capabilities ?? {}).toLowerCase().includes("cisco");
}

async function collectCiscoLive(device: Device) {
  const commandIds = Array.from(new Set([
    ...CISCO_IOS_CLASSIC_DISCOVERY_COMMANDS,
    ...CISCO_IOS_CLASSIC_INVENTORY_COMMANDS
  ]));
  const startedAt = Date.now();

  try {
    const result = await ciscoIosXeSshConnector.runReadOnlyCommands(device, commandIds);
    const outputs = Object.fromEntries(result.results.map((item) => [item.commandId, redactCiscoCliOutput(item.stdout)]));
    const collection = buildCiscoIosCollection(outputs, result.warnings);
    const detection = detectCiscoPlatform(outputs.platform ?? "");
    if (!result.connectorInvoked || !outputs.platform?.trim()) {
      throw new VendorCapabilityRefreshError("CISCO_LIVE_COLLECTION_EMPTY", "Cisco connected, but no verified platform output was returned.");
    }

    const existing = asObject(device.capabilities);
    const cisco = asObject(existing.cisco);
    const collectedAt = collection.collectedAt;
    const capabilities = {
      ...existing,
      cisco: {
        ...cisco,
        showVersion: outputs.platform,
        outputs,
        facts: collection.system,
        collection,
        capabilityProfile: collection.capabilityProfile,
        inventoryStatus: collection.inventoryStatus,
        capabilityStatus: collection.capabilityStatus
      },
      ciscoDetection: detection,
      ciscoDiscovery: {
        connectorInvoked: true,
        connectorType: ciscoIosXeSshConnector.connectorType,
        collectedAt,
        system: collection.system,
        interfaceCount: Math.max(collection.interfaces.summary.length, collection.interfaces.switchports.length),
        vlanCount: collection.network.vlans.entries.length,
        inventoryStatus: collection.inventoryStatus,
        capabilityStatus: collection.capabilityStatus,
        warnings: result.warnings
      }
    };

    const updated = await prisma.$transaction(async (tx) => {
      const nextDevice = await tx.device.update({
        where: { id: device.id },
        data: { status: DeviceStatus.online, capabilities: json(capabilities) }
      });
      await tx.deviceStatusCheck.create({
        data: {
          deviceId: device.id,
          status: DeviceStatus.online,
          message: "Cisco read-only inventory collection succeeded.",
          latencyMs: Math.max(0, Date.now() - startedAt)
        }
      });
      return nextDevice;
    });
    return { device: updated, detection, collection, outputs, warnings: result.warnings };
  } catch (error) {
    const diagnostic = error instanceof CiscoConnectorError ? error.toDiagnostic() : null;
    const safeCode = diagnostic?.code ?? (error instanceof VendorCapabilityRefreshError ? error.code : "CISCO_LIVE_COLLECTION_FAILED");
    const safeMessage = diagnostic?.userMessage ?? (error instanceof VendorCapabilityRefreshError ? error.message : "Cisco live collection failed.");
    await prisma.$transaction([
      prisma.device.update({ where: { id: device.id }, data: { status: DeviceStatus.error } }),
      prisma.deviceStatusCheck.create({
        data: {
          deviceId: device.id,
          status: DeviceStatus.error,
          message: `${safeCode}: ${safeMessage}`,
          latencyMs: Math.max(0, Date.now() - startedAt)
        }
      })
    ]);
    if (error instanceof VendorCapabilityRefreshError) throw error;
    throw new VendorCapabilityRefreshError(safeCode, safeMessage, error instanceof CiscoConnectorError ? error.statusCode : 502);
  }
}

export async function refreshDeviceVendorCapabilities(deviceId: string, forceLive = false) {
  let device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device) return null;
  const live = forceLive && isCiscoDevice(device) ? await collectCiscoLive(device) : null;
  if (live) device = live.device;
  const detection = live?.detection ?? defaultDetection(device);
  const deviceCapabilities = asObject(device.capabilities);
  const cisco = asObject(deviceCapabilities.cisco);
  const outputs = (live?.outputs ?? asObject(cisco.outputs)) as Record<string, string>;
  const savedCollection = live?.collection ?? asObject(cisco.collection);
  const profile = Object.keys(outputs).length > 0 ? buildCiscoIosCapabilityProfile(outputs) : asObject(cisco.capabilityProfile);
  const supports = supportsFromDetection(detection);
  const warnings = live?.warnings ?? [];
  const collection = asObject(savedCollection);
  const interfaces = asObject(collection.interfaces);
  const facts = Object.keys(collection).length > 0 ? {
    ...asObject(collection.system),
    interfaces: interfaces.summary ?? [],
    switchports: interfaces.switchports ?? [],
    health: asObject(collection.health),
    network: asObject(collection.network),
    collection
  } : { version: detection.version, model: detection.model, hostname: detection.hostname };
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  const connectorType = isSupportedCiscoAutomationPlatform(detection.platform) ? "cisco-iosxe-ssh" : "unsupported";
  const capabilitiesJson = Object.keys(profile).length > 0 ? { support: supports, profile } : supports;
  const cache = await prisma.deviceCapabilityCache.create({ data: { deviceId, vendorKey: detection.vendor, platformKey: detection.platform, connectorType, detectionJson: json(detection), capabilitiesJson: json(capabilitiesJson), factsJson: json(facts), warningsJson: json(warnings), expiresAt } });
  return { deviceId, cached: false, vendorKey: cache.vendorKey, platformKey: cache.platformKey, connectorType: cache.connectorType, detection, capabilities: capabilitiesJson, facts, warnings, refreshedAt: cache.refreshedAt, expiresAt };
}
