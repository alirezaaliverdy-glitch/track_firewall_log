import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { CAPABILITY_REGISTRY, getCapabilitiesForVendor } from "./capability.registry.js";
import { getPlatformsForVendor } from "./platform.registry.js";
import { getVendor, VENDOR_REGISTRY } from "./vendor.registry.js";
import type { CapabilitySupport, PlatformDetectionResult } from "./vendor.types.js";
import { buildCiscoIosCapabilityProfile } from "../connectors/cisco/ios-xe/cisco-iosxe.inventory.js";
import { detectCiscoPlatform, isSupportedCiscoAutomationPlatform } from "../connectors/cisco/ios-xe/cisco-iosxe.parsers.js";

function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function asObject(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function asString(value: unknown) { return typeof value === "string" ? value : ""; }

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

export async function refreshDeviceVendorCapabilities(deviceId: string, forceLive = false) {
  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device) return null;
  const detection = defaultDetection(device);
  const deviceCapabilities = asObject(device.capabilities);
  const cisco = asObject(deviceCapabilities.cisco);
  const outputs = asObject(cisco.outputs) as Record<string, string>;
  const savedCollection = asObject(cisco.collection);
  const profile = Object.keys(outputs).length > 0 ? buildCiscoIosCapabilityProfile(outputs) : asObject(cisco.capabilityProfile);
  const supports = supportsFromDetection(detection);
  const warnings = forceLive ? ["Live Cisco probing is not enabled from this endpoint; using cached connector evidence only."] : [];
  const facts = Object.keys(savedCollection).length > 0 ? asObject(savedCollection.system) : { version: detection.version, model: detection.model, hostname: detection.hostname };
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  const connectorType = isSupportedCiscoAutomationPlatform(detection.platform) ? "cisco-iosxe-ssh" : "unsupported";
  const capabilitiesJson = Object.keys(profile).length > 0 ? { support: supports, profile } : supports;
  const cache = await prisma.deviceCapabilityCache.create({ data: { deviceId, vendorKey: detection.vendor, platformKey: detection.platform, connectorType, detectionJson: json(detection), capabilitiesJson: json(capabilitiesJson), factsJson: json(facts), warningsJson: json(warnings), expiresAt } });
  return { deviceId, cached: false, vendorKey: cache.vendorKey, platformKey: cache.platformKey, connectorType: cache.connectorType, detection, capabilities: capabilitiesJson, facts, warnings, refreshedAt: cache.refreshedAt, expiresAt };
}
