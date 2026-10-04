import {
  DeviceProtocol,
  EventSourceType,
  type Device,
  type DeviceConnectionChannel,
  type Prisma
} from "@prisma/client";
import { selectDeviceConnector } from "../connectors/connector-registry.service.js";
import type { DeviceConnectionTestResult } from "../connectors/types.js";
import { prisma } from "../db/prisma.js";
import { getConnectionProfile, type ConnectionMethodKey, type VendorConnectionKey } from "../vendors/connection-method.registry.js";
import { env } from "../config/env.js";
import { pollSnmpv3, recordSnmpSamples } from "./snmpv3-collector.service.js";
import { getCredential } from "./credential.service.js";

type ConnectionChannelResult = {
  id: string;
  role: string;
  method: string;
  purposes: string[];
  status: string;
  connected: boolean | null;
  tested: boolean;
  message: string;
  actionRequired: boolean;
  lastTestAt: string | null;
  lastSuccessAt: string | null;
  errorCode?: string;
};

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function vendorKey(device: Pick<Device, "vendor" | "type">): VendorConnectionKey | null {
  const value = `${device.vendor} ${device.type}`.toLowerCase();
  if (/linux|ubuntu|debian|centos|rhel/.test(value)) return "linux";
  if (/cisco/.test(value)) return "cisco";
  if (/mikrotik|routeros/.test(value)) return "mikrotik";
  if (/fortigate|fortinet|fortios/.test(value)) return "fortigate";
  if (/sophos|sfos|cyberoam/.test(value)) return "sophos";
  if (/esxi|vmware/.test(value)) return "esxi";
  return null;
}

function primaryMethod(device: Pick<Device, "vendor" | "type" | "protocol">): ConnectionMethodKey {
  if (device.protocol !== DeviceProtocol.api) return "ssh";
  if (vendorKey(device) === "esxi") return "soap_api";
  return vendorKey(device) === "sophos" ? "xml_api" : "rest_api";
}

function protocolForMethod(method: string): DeviceProtocol {
  if (method === "ssh") return DeviceProtocol.ssh;
  if (method === "syslog") return DeviceProtocol.syslog;
  if (method === "agent") return DeviceProtocol.agent;
  return DeviceProtocol.api;
}

function secondaryDefinition(device: Device) {
  const key = vendorKey(device);
  if (key === "linux") return null; // SSH already collects Linux health and logs; no standalone agent or Syslog listener is shipped.
  const profile = key ? getConnectionProfile(key) : null;
  if (!profile) return null;
  const primary = primaryMethod(device);
  if (key === "esxi") return profile.methods.find((item) => item.key === (primary === "ssh" ? "soap_api" : "ssh")) ?? null;
  return profile.methods.find((item) => item.key === profile.recommendedSecondary && item.key !== primary)
    ?? profile.methods.find((item) => item.key !== primary && item.readiness === "ready")
    ?? profile.methods.find((item) => item.key !== primary)
    ?? null;
}

export async function syncDefaultDeviceConnectionChannels(tx: Prisma.TransactionClient, device: Device) {
  const key = vendorKey(device);
  const profile = key ? getConnectionProfile(key) : null;
  const managementMethod = primaryMethod(device);
  const managementProfile = profile?.methods.find((item) => item.key === managementMethod);
  const secondary = secondaryDefinition(device);

  await tx.deviceConnectionChannel.upsert({
    where: { deviceId_role: { deviceId: device.id, role: "management" } },
    update: {
      method: managementMethod,
      purposes: managementProfile?.purposes ?? ["control", "inventory"],
      host: device.host,
      port: device.managementPort,
      credentialId: device.credentialId,
      enabled: true,
      priority: 1
    },
    create: {
      deviceId: device.id,
      role: "management",
      method: managementMethod,
      purposes: managementProfile?.purposes ?? ["control", "inventory"],
      host: device.host,
      port: device.managementPort,
      credentialId: device.credentialId,
      enabled: true,
      priority: 1,
      status: device.status === "online" ? "verified" : "configured",
      settingsJson: json({ readiness: managementProfile?.readiness ?? "ready", managedBy: "vendor_profile" })
    }
  });

  if (!secondary) return;
  const pullChannel = secondary.key !== "syslog" && secondary.key !== "agent";
  const existing = await tx.deviceConnectionChannel.findUnique({ where: { deviceId_role: { deviceId: device.id, role: "observability" } } });
  const existingSettings = existing?.settingsJson && typeof existing.settingsJson === "object" && !Array.isArray(existing.settingsJson)
    ? existing.settingsJson as Record<string, unknown> : {};
  const resetDefault = existingSettings.managedBy !== "user" && existing?.method !== secondary.key;
  await tx.deviceConnectionChannel.upsert({
    where: { deviceId_role: { deviceId: device.id, role: "observability" } },
    update: resetDefault ? {
      method: secondary.key, purposes: secondary.purposes, host: null, port: secondary.defaultPort,
      credentialId: secondary.key === "snmpv3" ? null : pullChannel ? device.credentialId : null,
      enabled: false, status: "setup_required", lastSuccessAt: null,
      settingsJson: json({ readiness: secondary.readiness, prerequisites: secondary.prerequisites,
        prerequisitesFa: secondary.prerequisitesFa, managedBy: "vendor_profile" })
    } : {},
    create: {
      deviceId: device.id,
      role: "observability",
      method: secondary.key,
      purposes: secondary.purposes,
      host: null,
      port: secondary.defaultPort,
      credentialId: secondary.key === "snmpv3" ? null : pullChannel ? device.credentialId : null,
      enabled: secondary.readiness === "ready",
      priority: 2,
      status: secondary.readiness === "ready" ? "available" : "setup_required",
      settingsJson: json({ readiness: secondary.readiness, prerequisites: secondary.prerequisites, prerequisitesFa: secondary.prerequisitesFa, managedBy: "vendor_profile" })
    }
  });
}

async function passiveEvidence(deviceId: string, method: "syslog" | "agent") {
  const sourceType = method === "agent" ? EventSourceType.agent : EventSourceType.syslog;
  const [source, event] = await Promise.all([
    prisma.eventSource.findFirst({ where: { deviceId, type: sourceType }, orderBy: { lastSeenAt: "desc" }, select: { lastSeenAt: true } }),
    prisma.securityEvent.findFirst({ where: { deviceId, sourceType: { contains: method, mode: "insensitive" } }, orderBy: { receivedAt: "desc" }, select: { receivedAt: true } })
  ]);
  const evidenceAt = source?.lastSeenAt ?? event?.receivedAt ?? null;
  const freshnessMs = Math.max(60, env.deviceConnectivityIntervalSeconds * 3) * 1000;
  return evidenceAt && Date.now() - evidenceAt.getTime() <= freshnessMs ? evidenceAt : null;
}

export async function configureSnmpv3Channel(device: Device, input: Record<string, unknown>) {
  const key = vendorKey(device);
  if (!key || !getConnectionProfile(key)?.methods.some((item) => item.key === "snmpv3")) {
    throw new Error("SNMPv3 برای این وندور پشتیبانی نمی‌شود.");
  }
  const credentialId = typeof input.credentialId === "string" ? input.credentialId.trim() : "";
  if (!credentialId || !await getCredential(credentialId)) throw new Error("اعتبارنامه SNMPv3 معتبر انتخاب کنید.");
  const port = Number(input.port ?? 161);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("پورت SNMP نامعتبر است.");
  const authProtocol = input.authProtocol === "SHA256" ? "SHA256" : input.authProtocol === "SHA" || input.authProtocol === undefined ? "SHA" : null;
  if (!authProtocol) throw new Error("فقط SHA یا SHA256 پشتیبانی می‌شود.");
  const channel = await prisma.deviceConnectionChannel.upsert({
    where: { deviceId_role: { deviceId: device.id, role: "observability" } },
    create: { deviceId: device.id, role: "observability", method: "snmpv3", purposes: ["telemetry"],
      host: null, port, credentialId, enabled: false, status: "configured", priority: 2,
      settingsJson: json({ managedBy: "user", authProtocol, privProtocol: "AES" }) },
    update: { method: "snmpv3", purposes: ["telemetry"], host: null, port, credentialId,
      enabled: false, status: "configured", lastSuccessAt: null, lastError: null,
      settingsJson: json({ managedBy: "user", authProtocol, privProtocol: "AES" }) }
  });
  return { id: channel.id, method: channel.method, port: channel.port, status: channel.status };
}

async function testSecondaryChannel(device: Device, channel: DeviceConnectionChannel): Promise<ConnectionChannelResult> {
  const testedAt = new Date();
  if (channel.method === "agent") {
    const message = "بسته مستقل Agent هنوز ارائه نشده است؛ پایش فعال فعلاً از مسیر SSH تأییدشده انجام می‌شود.";
    await prisma.deviceConnectionChannel.update({
      where: { id: channel.id },
      data: { enabled: false, status: "setup_required", lastTestAt: testedAt, lastSuccessAt: null, lastError: message }
    });
    return { id: channel.id, role: channel.role, method: channel.method, purposes: channel.purposes, status: "setup_required", connected: null, tested: false, message, actionRequired: true, lastTestAt: testedAt.toISOString(), lastSuccessAt: null };
  }
  if (channel.method === "syslog") {
    const evidenceAt = await passiveEvidence(device.id, channel.method);
    const connected = Boolean(evidenceAt);
    const status = connected ? "receiving" : "waiting_data";
    const message = connected
      ? `Inbound ${channel.method} data was received successfully.`
      : "Remote Syslog forwarding must be completed on the device; this push channel cannot be tested like SSH.";
    await prisma.deviceConnectionChannel.update({
      where: { id: channel.id },
      data: { enabled: connected, status, lastTestAt: testedAt, lastSuccessAt: evidenceAt, lastError: connected ? null : message }
    });
    return { id: channel.id, role: channel.role, method: channel.method, purposes: channel.purposes, status, connected: connected ? true : null, tested: true, message, actionRequired: !connected, lastTestAt: testedAt.toISOString(), lastSuccessAt: evidenceAt?.toISOString() ?? null };
  }

  if (channel.method === "snmpv3") {
    const result = await pollSnmpv3(device, channel);
    const status = result.connected ? "verified" : result.errorCode === "SNMP_CREDENTIAL_REQUIRED" ? "setup_required" : "error";
    await prisma.deviceConnectionChannel.update({ where: { id: channel.id }, data: {
      enabled: result.connected, status, lastTestAt: testedAt,
      lastSuccessAt: result.connected ? testedAt : channel.lastSuccessAt,
      lastError: result.connected ? null : result.message
    } });
    if (result.connected) await recordSnmpSamples(device.id, result);
    return { id: channel.id, role: channel.role, method: channel.method, purposes: channel.purposes, status,
      connected: result.connected, tested: true, message: result.message, actionRequired: !result.connected,
      lastTestAt: testedAt.toISOString(), lastSuccessAt: result.connected ? testedAt.toISOString() : channel.lastSuccessAt?.toISOString() ?? null,
      errorCode: result.errorCode };
  }

  if (!["ssh", "soap_api", "rest_api", "xml_api"].includes(channel.method)) {
    const message = "این روش هنوز کانکتور اجرایی ندارد؛ از مسیر اصلی تأییدشده استفاده کنید.";
    await prisma.deviceConnectionChannel.update({ where: { id: channel.id }, data: { enabled: false, status: "setup_required", lastTestAt: testedAt, lastError: message } });
    return { id: channel.id, role: channel.role, method: channel.method, purposes: channel.purposes, status: "setup_required", connected: null,
      tested: false, message, actionRequired: true, lastTestAt: testedAt.toISOString(), lastSuccessAt: channel.lastSuccessAt?.toISOString() ?? null };
  }

  const channelDevice: Device = {
    ...device,
    host: channel.host ?? device.host,
    managementPort: channel.port ?? device.managementPort,
    credentialId: channel.credentialId ?? device.credentialId,
    protocol: protocolForMethod(channel.method)
  };
  const connector = selectDeviceConnector(channelDevice);
  if (!connector) {
    const message = `${channel.method.toUpperCase()} is defined as the second vendor channel but requires device-side setup or a compatible platform before it can be tested.`;
    await prisma.deviceConnectionChannel.update({ where: { id: channel.id }, data: { enabled: false, status: "setup_required", lastTestAt: testedAt, lastError: message } });
    return { id: channel.id, role: channel.role, method: channel.method, purposes: channel.purposes, status: "setup_required", connected: null, tested: false, message, actionRequired: true, lastTestAt: testedAt.toISOString(), lastSuccessAt: channel.lastSuccessAt?.toISOString() ?? null };
  }

  const result = await connector.testConnection(channelDevice);
  const status = result.connected ? "verified" : "error";
  const message = result.message ?? (result.connected ? `${channel.method} connection succeeded.` : `${channel.method} connection failed.`);
  const statusKey = connector.name === "mikrotik" ? "mikrotikStatus"
    : connector.name === "fortigate" ? "fortigateStatus"
      : connector.name === "sophos" ? "sophosStatus"
        : connector.name === "esxi" ? "esxiStatus"
        : connector.name.includes("cisco") ? "ciscoStatus"
          : "linuxStatus";
  await prisma.$transaction([
    prisma.deviceConnectionChannel.update({
      where: { id: channel.id },
      data: { enabled: true, status, lastTestAt: testedAt, lastSuccessAt: result.connected ? testedAt : channel.lastSuccessAt, lastError: result.connected ? null : message }
    }),
    ...(result.connected ? [prisma.device.update({
      where: { id: device.id },
      data: {
        capabilities: json({
          ...(device.capabilities && typeof device.capabilities === "object" && !Array.isArray(device.capabilities) ? device.capabilities : {}),
          [statusKey]: result,
          connectionRouting: {
            preferredReadMethod: channel.method,
            preferredReadRole: channel.role,
            selectedAt: testedAt.toISOString(),
            fallbackMethod: primaryMethod(device)
          }
        })
      }
    })] : [])
  ]);
  return { id: channel.id, role: channel.role, method: channel.method, purposes: channel.purposes, status, connected: result.connected, tested: true, message, actionRequired: !result.connected, lastTestAt: testedAt.toISOString(), lastSuccessAt: result.connected ? testedAt.toISOString() : channel.lastSuccessAt?.toISOString() ?? null, errorCode: result.errorCode };
}

export async function recordAndTestDeviceConnectionChannels(device: Device, managementResult: DeviceConnectionTestResult) {
  await prisma.$transaction(async (tx) => syncDefaultDeviceConnectionChannels(tx, device));
  const channels = await prisma.deviceConnectionChannel.findMany({ where: { deviceId: device.id }, orderBy: [{ priority: "asc" }, { role: "asc" }] });
  const management = channels.find((item) => item.role === "management");
  const managementTestAt = new Date();
  const managementMessage = managementResult.message ?? (managementResult.connected ? "Management connection succeeded." : "Management connection failed.");
  if (management) {
    await prisma.deviceConnectionChannel.update({
      where: { id: management.id },
      data: { enabled: true, status: managementResult.connected ? "verified" : "error", lastTestAt: managementTestAt, lastSuccessAt: managementResult.connected ? managementTestAt : management.lastSuccessAt, lastError: managementResult.connected ? null : managementMessage }
    });
  }
  const managementView: ConnectionChannelResult | null = management ? {
    id: management.id, role: management.role, method: management.method, purposes: management.purposes,
    status: managementResult.connected ? "verified" : "error", connected: managementResult.connected, tested: true,
    message: managementMessage, actionRequired: !managementResult.connected, lastTestAt: managementTestAt.toISOString(),
    lastSuccessAt: managementResult.connected ? managementTestAt.toISOString() : management.lastSuccessAt?.toISOString() ?? null,
    errorCode: managementResult.errorCode
  } : null;
  const secondary = vendorKey(device) === "linux" ? undefined : channels.find((item) => item.role === "observability");
  const secondaryView = secondary ? await testSecondaryChannel(device, secondary) : null;
  const results = [managementView, secondaryView].filter((item): item is ConnectionChannelResult => Boolean(item));
  const preferredDataChannel = results.find((item) => item.role === "observability" && item.connected === true && item.purposes.includes("inventory"))
    ?? results.find((item) => item.role === "management" && item.connected === true)
    ?? null;
  return { channels: results, preferredDataChannel: preferredDataChannel ? { id: preferredDataChannel.id, method: preferredDataChannel.method, role: preferredDataChannel.role } : null };
}
