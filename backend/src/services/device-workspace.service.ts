import { prisma } from "../db/prisma.js";
import { buildDeviceTrafficSeries } from "./device-traffic-series.js";
import { mergeCiscoWorkspaceInterfaces, projectCiscoWorkspaceDetails, safeCiscoDetail } from "./device-workspace-cisco.js";
import { diagnoseDeviceIssues } from "./device-issue-guide.js";
import { metricSourceForVendor } from "./device-metric-source.js";

const PENDING_ACTION_STATES = ["proposed", "validation_failed", "dry_run_ready", "pending_approval", "approved", "executing", "rollback_pending"] as const;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function collectedRows(value: unknown) {
  return asArray(value).map((entry) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) return entry;
    const raw = String(entry ?? "").trim();
    const name = raw.match(/(?:^|\s)(?:name|default-name)=([^\s]+)/i)?.[1] ?? raw;
    return { name, raw };
  });
}

function timestamp(value: unknown) {
  const parsed = value ? new Date(String(value)).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

const SENSITIVE_FIELD = /password|secret|token|credential|private.?key|api.?key|stdout|stderr|raw/i;

function safeOverviewText(value: unknown, limit = 360) {
  const redacted = String(value ?? "")
    .replace(/(password|token|secret|api[_-]?key)\s*[:=]\s*\S+/gi, "$1=[REDACTED]");
  return Array.from(redacted)
    .map((character) => character.charCodeAt(0) < 32 ? " " : character)
    .join("")
    .trim()
    .slice(0, limit);
}

function overviewItems(value: unknown) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\r?\n/) : value ? [value] : [];
  return source.slice(0, 64).map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return { title: safeOverviewText(entry) || `#${index + 1}`, fields: [] as Array<{ key: string; value: string }> };
    }
    const row = entry as Record<string, unknown>;
    const titleKey = ["name", "defaultName", "interface", "id", "address", "hostname", "ruleName", "serviceName", "chain", "dstAddress"].find((key) => row[key] !== null && row[key] !== undefined && row[key] !== "");
    const title = safeOverviewText(titleKey ? row[titleKey] : `#${index + 1}`, 120);
    const fields = Object.entries(row)
      .filter(([key, item]) => key !== titleKey && !SENSITIVE_FIELD.test(key) && ["string", "number", "boolean"].includes(typeof item) && item !== "")
      .slice(0, 8)
      .map(([key, item]) => ({ key: safeOverviewText(key, 60), value: safeOverviewText(item, 180) }));
    return { title, fields };
  }).filter((item) => item.title.length > 0);
}

function vendorSection(key: string, titleFa: string, titleEn: string, value: unknown) {
  const items = overviewItems(value);
  return { key, titleFa, titleEn, count: items.length, items };
}

export function projectVendorOverview(vendorKey: string, factsValue: unknown, refreshedAt: unknown) {
  const facts = asObject(factsValue);
  const healthFacts = asObject(facts.health);
  const fact = (key: string, labelFa: string, labelEn: string, source: unknown = facts[key]) => source === null || source === undefined || source === "" ? null : { key, labelFa, labelEn, value: safeOverviewText(source, 180) };
  const compact = <T>(items: Array<T | null>) => items.filter((item): item is T => item !== null);
  const base = {
    vendorKey,
    collectedAt: timestamp(refreshedAt) !== null ? new Date(timestamp(refreshedAt)!).toISOString() : null,
    source: "verified_connector" as const,
    summary: [] as Array<{ key: string; labelFa: string; labelEn: string; value: string }>,
    sections: [] as Array<ReturnType<typeof vendorSection>>
  };

  if (vendorKey === "esxi") return { ...base,
    summary: compact([
      fact("hostname", "نام هاست", "Host"),
      fact("version", "نسخه ESXi", "ESXi version"),
      fact("model", "مدل", "Model"),
      fact("connectionState", "وضعیت اتصال", "Connection"),
      fact("maintenanceMode", "حالت نگهداری", "Maintenance mode"),
      fact("serialNumber", "شماره سریال", "Serial number"),
      fact("biosVersion", "نسخه BIOS", "BIOS version"),
      fact("lockdownMode", "حالت قفل", "Lockdown mode"),
      fact("vmCount", "تعداد VM", "Virtual machines"),
      fact("cpuPercent", "مصرف CPU", "CPU usage", facts.cpuPercent === null ? null : `${facts.cpuPercent}%`),
      fact("memoryPercent", "مصرف حافظه", "Memory usage", facts.memoryPercent === null ? null : `${facts.memoryPercent}%`)
    ]),
    sections: [
      vendorSection("vms", "ماشین‌های مجازی", "Virtual machines", facts.vms),
      vendorSection("datastores", "دیتاستورها", "Datastores", facts.datastores),
      vendorSection("networks", "شبکه‌ها", "Networks", facts.networks),
      vendorSection("sensors", "سنسورهای سخت‌افزار", "Hardware sensors", facts.sensors),
      vendorSection("services", "سرویس‌های هاست", "Host services", facts.services),
      vendorSection("storageAdapters", "کنترلرهای ذخیره‌سازی", "Storage adapters", facts.storageAdapters),
      vendorSection("storageDevices", "دیسک‌های فیزیکی", "Storage devices", facts.storageDevices),
      vendorSection("firewallRulesets", "قوانین فایروال هاست", "Host firewall rulesets", facts.firewallRulesets),
      vendorSection("physicalNics", "کارت‌های شبکه فیزیکی", "Physical NICs", facts.physicalNics),
      vendorSection("vmkernelNics", "اینترفیس‌های VMkernel", "VMkernel NICs", facts.vmkernelNics),
      vendorSection("virtualSwitches", "سوئیچ‌های مجازی", "Virtual switches", facts.virtualSwitches),
      vendorSection("portGroups", "گروه‌های پورت", "Port groups", facts.portGroups),
      vendorSection("dns", "تنظیمات DNS", "DNS", facts.dns),
      vendorSection("time", "تنظیمات زمان", "Time settings", facts.time)
    ].filter(item=>item.count>0)
  };

  if (vendorKey === "mikrotik") return { ...base,
    summary: compact([fact("hostname", "نام دستگاه", "Identity"), fact("version", "نسخه RouterOS", "RouterOS version"), fact("uptime", "زمان فعالیت", "Uptime"), fact("architecture", "معماری", "Architecture"), fact("cpuLoad", "بار CPU", "CPU load", healthFacts.cpuLoad), fact("memoryFree", "حافظه آزاد", "Free memory", healthFacts.memoryFree)]),
    sections: [vendorSection("interfaces", "اینترفیس‌ها", "Interfaces", facts.interfaces), vendorSection("addresses", "آدرس‌های IP", "IP addresses", facts.ipAddresses), vendorSection("routing", "مسیرها", "Routes", facts.routes), vendorSection("firewall", "قوانین فایروال", "Firewall rules", facts.firewallFilterRules), vendorSection("nat", "قوانین NAT", "NAT rules", facts.natRules), vendorSection("services", "سرویس‌ها", "Services", facts.services), vendorSection("logs", "رویدادهای اخیر", "Recent events", facts.recentLogs)].filter((item) => item.count > 0)
  };
  if (vendorKey === "fortigate") return { ...base,
    summary: compact([fact("hostname", "نام دستگاه", "Hostname"), fact("model", "مدل", "Model"), fact("serialNumber", "سریال", "Serial"), fact("version", "نسخه FortiOS", "FortiOS version"), fact("vdomMode", "حالت VDOM", "VDOM mode"), fact("currentVdom", "VDOM فعال", "Current VDOM")]),
    sections: [vendorSection("zones", "Zoneها", "Zones", facts.zones), vendorSection("interfaces", "اینترفیس‌ها", "Interfaces", facts.interfaces), vendorSection("firewall", "Policyهای فایروال", "Firewall policies", facts.policies), vendorSection("routing", "مسیرها", "Routes", facts.routes), vendorSection("objects", "آبجکت‌های آدرس", "Address objects", facts.addressObjects), vendorSection("services", "سرویس‌ها", "Services", facts.services), vendorSection("ha", "وضعیت HA", "HA status", facts.haStatus)].filter((item) => item.count > 0)
  };
  if (vendorKey === "sophos") return { ...base,
    summary: compact([fact("product", "محصول", "Product"), fact("apiVersion", "نسخه API", "API version")]),
    sections: [vendorSection("interfaces", "اینترفیس‌ها", "Interfaces", facts.interfaces), vendorSection("zones", "ناحیه‌ها", "Zones", facts.zones), vendorSection("gateways", "Gatewayها", "Gateways", facts.gateways), vendorSection("firewall", "قوانین فایروال", "Firewall rules", facts.firewallRules), vendorSection("hosts", "میزبان‌های IP", "IP hosts", facts.ipHosts), vendorSection("services", "سرویس‌ها", "Services", facts.services), vendorSection("vpn", "اتصال‌های VPN", "VPN connections", facts.vpnConnections)].filter((item) => item.count > 0)
  };
  if (vendorKey === "linux") return { ...base,
    summary: compact([fact("hostname", "نام میزبان", "Hostname"), fact("version", "سیستم‌عامل", "Operating system"), fact("firewallStatus", "فایروال میزبان", "Host firewall"), fact("sshServiceStatus", "سرویس SSH", "SSH service"), fact("currentSshPort", "پورت SSH", "SSH port")]),
    sections: [vendorSection("ports", "پورت‌های شنونده", "Listening ports", facts.listeningPorts), vendorSection("warnings", "هشدارهای جمع‌آوری", "Collection warnings", facts.warnings)].filter((item) => item.count > 0)
  };
  const network = asObject(facts.network);
  return { ...base,
    summary: compact([fact("hostname", "نام دستگاه", "Hostname"), fact("model", "مدل", "Model"), fact("serialNumber", "سریال", "Serial"), fact("iosVersion", "نسخه نرم‌افزار", "Software version"), fact("uptime", "زمان فعالیت", "Uptime")]),
    sections: [vendorSection("inventory", "موجودی سخت‌افزار", "Hardware inventory", facts.inventory), vendorSection("interfaces", "اینترفیس‌ها", "Interfaces", facts.interfaces), vendorSection("switchports", "پورت‌های سوئیچ", "Switchports", facts.switchports), vendorSection("vlans", "VLANها", "VLANs", asObject(network.vlans).entries), vendorSection("routing", "مسیریابی", "Routing", network.routes), vendorSection("security", "سرویس‌های امنیتی", "Security services", facts.securityServices)].filter((item) => item.count > 0)
  };
}

export function resolveWorkspaceConnectionState(
  latestStatus: { status: string; checkedAt: Date | string } | null | undefined,
  persistedStatus: string | null | undefined,
  successfulEvidence: unknown[],
  staleAfterMs = 90_000
) {
  const latestSuccessAt = successfulEvidence
    .map(timestamp)
    .filter((value): value is number => value !== null)
    .sort((left, right) => right - left)[0] ?? null;
  const latestCheckAt = timestamp(latestStatus?.checkedAt);
  if (latestStatus && latestCheckAt !== null) {
    if (Date.now() - latestCheckAt > staleAfterMs) {
      return { availability: "unknown", verificationStatus: "needs_review", lastContact: latestStatus.checkedAt };
    }
    return {
      availability: latestStatus.status,
      verificationStatus: latestStatus.status === "online" ? "verified" : "needs_review",
      lastContact: latestStatus.checkedAt
    };
  }
  if (latestSuccessAt !== null && (latestCheckAt === null || latestSuccessAt >= latestCheckAt)) {
    return { availability: "online", verificationStatus: "verified", lastContact: new Date(latestSuccessAt) };
  }
  const availability = latestStatus?.status ?? persistedStatus ?? "unknown";
  return {
    availability,
    verificationStatus: availability === "online" ? "verified" : latestStatus ? "needs_review" : "not_verified",
    lastContact: latestStatus?.checkedAt ?? null
  };
}

export function liveVendorProjection(vendorKey: string, capabilities: Record<string, unknown>, refreshedAt: Date | string | null) {
  const statusKey = vendorKey === "mikrotik" ? "mikrotikStatus" : vendorKey === "fortigate" ? "fortigateStatus" : vendorKey === "sophos" ? "sophosStatus" : vendorKey === "esxi" ? "esxiStatus" : vendorKey === "linux" ? "linuxStatus" : "";
  const status = statusKey ? asObject(capabilities[statusKey]) : {};
  if (status.connected !== true) return null;
  const connectorCapabilities = asObject(status.capabilities);
  const capabilityList = Object.entries(connectorCapabilities)
    .filter(([, enabled]) => enabled === true)
    .map(([key]) => ({ domain: key, key, state: "read_only", mode: "read" }));
  const section = (key: string, titleFa: string, titleEn: string, value: unknown) => {
    const hasData = Array.isArray(value) ? value.length > 0 : typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined;
    return hasData ? { key, titleFa, titleEn, state: "available" as const, reason: null, requirement: "", nextAction: "" } : null;
  };

  if (vendorKey === "esxi") {
    const data=asObject(status.esxi);
    return {
      connectorType:asObject(status.diagnostic).transport === "ssh" ? "esxi-ssh" : "esxi-soap",
      facts:{
        hostname:data.hostname??status.hostname??null,
        version:data.version??null,
        build:data.build??null,
        model:data.model??null,
        hardwareVendor:data.hardwareVendor??null,
        serialNumber:data.serialNumber??null,
        biosVersion:data.biosVersion??null,
        lockdownMode:data.lockdownMode??null,
        connectionState:data.connectionState??null,
        overallStatus:data.overallStatus??null,
        maintenanceMode:data.maintenanceMode??null,
        cpuPercent:data.cpuPercent??null,
        memoryPercent:data.memoryPercent??null,
        vmCount:data.vmCount??null,
        cpuCores:data.cpuCores??null,
        memoryBytes:data.memoryBytes??null,
        bootTime:data.bootTime??null,
        vms:data.vms??[],
        datastores:data.datastores??[],
        networks:data.networks??[],
        sensors:data.sensors??[],
        services:data.services??[],
        storageAdapters:data.storageAdapters??[],
        storageDevices:data.storageDevices??[],
        firewallRulesets:data.firewallRulesets??[],
        physicalNics:data.physicalNics??[],
        interfaces:asArray(data.physicalNics).slice(0,100).map(item=>{
          const nic=asObject(item);
          return {name:nic.name??"",operationalStatus:nic.linkUp===true?"up":nic.linkUp===false?"down":"unknown",administrativeStatus:"unknown",speed:nic.speedMb??null};
        }),
        vmkernelNics:data.vmkernelNics??[],
        virtualSwitches:data.virtualSwitches??[],
        portGroups:data.portGroups??[],
        dns:data.dns??null,
        time:data.time??null,
        coverage:data.coverage??[],
        interfaceCounters:data.interfaceCounters??[],
        collection:{inventoryStatus:"collected",capabilityStatus:asArray(status.warnings).length?"partial":"available"}
      },
      capabilities:capabilityList,
      warnings:asArray(status.warnings),
      refreshedAt:data.collectedAt??status.collectedAt??refreshedAt,
      sections:[
        section("host","هاست","Host",data.hostname),
        section("vms","ماشین‌های مجازی","Virtual machines",data.vms),
        section("datastores","دیتاستورها","Datastores",data.datastores),
        section("networks","شبکه‌ها","Networks",data.networks),
        section("sensors","سنسورهای سخت‌افزار","Hardware sensors",data.sensors),
        section("services","سرویس‌های هاست","Host services",data.services),
        section("storageAdapters","کنترلرهای ذخیره‌سازی","Storage adapters",data.storageAdapters),
        section("storageDevices","دیسک‌های فیزیکی","Storage devices",data.storageDevices),
        section("firewallRulesets","قوانین فایروال هاست","Host firewall rulesets",data.firewallRulesets),
        section("physicalNics","کارت‌های شبکه فیزیکی","Physical NICs",data.physicalNics),
        section("vmkernelNics","اینترفیس‌های VMkernel","VMkernel NICs",data.vmkernelNics),
        section("virtualSwitches","سوئیچ‌های مجازی","Virtual switches",data.virtualSwitches),
        section("portGroups","گروه‌های پورت","Port groups",data.portGroups)
      ].filter((item):item is NonNullable<typeof item>=>item!==null)
    };
  }

  if (vendorKey === "mikrotik") {
    const data = asObject(status.mikrotik);
    return {
      connectorType: "mikrotik",
      facts: {
        hostname: data.identity ?? null,
        version: data.routerosVersion ?? null,
        uptime: data.uptime ?? null,
        architecture: data.architecture ?? null,
        interfaces: collectedRows(data.interfaces),
        ipAddresses: data.ipAddresses ?? [],
        routes: data.routes ?? [],
        firewallFilterRules: data.firewallFilterRules ?? [],
        natRules: data.natRules ?? [],
        services: data.services ?? [],
        recentLogs: data.recentLogs ?? [],
        health: { cpuLoad: data.cpuLoad ?? null, memoryFree: data.memoryFree ?? null },
        collection: { inventoryStatus: "collected", capabilityStatus: asArray(status.warnings).length ? "partial" : "available" }
      },
      capabilities: capabilityList,
      warnings: asArray(status.warnings),
      refreshedAt: status.collectedAt ?? refreshedAt,
      sections: [
        section("system", "سامانه", "System", data.identity ?? data.routerosVersion),
        section("interfaces", "اینترفیس‌ها", "Interfaces", data.interfaces),
        section("routing", "مسیریابی", "Routing", data.routes),
        section("firewall", "فایروال", "Firewall", data.firewallFilterRules),
        section("nat", "NAT", "NAT", data.natRules),
        section("services", "سرویس‌ها", "Services", data.services),
        section("logs", "رویدادها", "Logs", data.recentLogs)
      ].filter((item): item is NonNullable<typeof item> => item !== null)
    };
  }

  if (vendorKey === "fortigate") {
    const data = asObject(status.fortigate);
    return {
      connectorType: "fortigate",
      facts: {
        hostname: data.hostname ?? status.hostname ?? null,
        model: data.model ?? null,
        serialNumber: data.serial ?? null,
        version: data.version ?? null,
        interfaces: collectedRows(data.interfaces),
        zones: data.zones ?? [],
        policies: data.policies ?? [],
        routes: data.routes ?? [],
        addressObjects: data.addressObjects ?? [],
        services: data.services ?? [],
        haStatus: data.haStatus ?? [],
        vdomMode: data.vdomMode ?? null,
        currentVdom: data.currentVdom ?? null,
        collection: { inventoryStatus: "collected", capabilityStatus: asArray(status.warnings).length ? "partial" : "available" }
      },
      capabilities: capabilityList,
      warnings: asArray(status.warnings),
      refreshedAt: status.collectedAt ?? refreshedAt,
      sections: [
        section("system", "سامانه", "System", data.hostname ?? data.version),
        section("interfaces", "اینترفیس‌ها", "Interfaces", data.interfaces),
        section("routing", "مسیریابی", "Routing", data.routes),
        section("firewall", "Policy و فایروال", "Firewall and policy", data.policies),
        section("services", "سرویس‌ها", "Services", data.services),
        section("ha", "دسترس‌پذیری بالا", "High availability", data.haStatus)
      ].filter((item): item is NonNullable<typeof item> => item !== null)
    };
  }

  if (vendorKey === "sophos") {
    const data = asObject(status.sophos);
    return {
      connectorType: "sophos-api",
      facts: {
        product: data.product ?? "Sophos Firewall",
        apiVersion: data.apiVersion ?? null,
        interfaces: collectedRows(data.interfaces),
        zones: data.zones ?? [],
        gateways: data.gateways ?? [],
        firewallRules: data.firewallRules ?? [],
        ipHosts: data.ipHosts ?? [],
        services: data.services ?? [],
        vpnConnections: data.vpnConnections ?? [],
        vpnProfiles: data.vpnProfiles ?? [],
        collectionWarnings: data.collectionWarnings ?? [],
        collection: { inventoryStatus: "collected", capabilityStatus: asArray(status.warnings).length ? "partial" : "available" }
      },
      capabilities: capabilityList,
      warnings: asArray(status.warnings),
      refreshedAt: data.collectedAt ?? status.collectedAt ?? refreshedAt,
      sections: [
        section("system", "سامانه", "System", data.product ?? data.apiVersion),
        section("interfaces", "اینترفیس‌ها", "Interfaces", data.interfaces),
        section("zones", "ناحیه‌ها", "Zones", data.zones),
        section("routing", "درگاه‌ها و مسیریابی", "Gateways and routing", data.gateways),
        section("firewall", "قوانین فایروال", "Firewall rules", data.firewallRules),
        section("objects", "میزبان‌ها و سرویس‌ها", "Hosts and services", [...asArray(data.ipHosts), ...asArray(data.services)]),
        section("vpn", "تنظیمات VPN (نه وضعیت SA)", "VPN configuration (not SA state)", data.vpnConnections),
        section("vpnProfiles", "پروفایل‌های IPsec", "IPsec profiles", data.vpnProfiles)
      ].filter((item): item is NonNullable<typeof item> => item !== null)
    };
  }

  return {
    connectorType: "linux_edge",
    facts: {
      hostname: status.hostname ?? null,
      version: status.os ?? null,
      listeningPorts: status.listeningPorts ?? null,
      firewallStatus: status.ufwStatus ?? null,
      sshServiceStatus: status.sshServiceStatus ?? null,
      currentSshPort: status.currentSshPort ?? null,
      warnings: asArray(status.warnings),
      collection: { inventoryStatus: "collected", capabilityStatus: asArray(status.warnings).length ? "partial" : "available" }
    },
    capabilities: capabilityList,
    warnings: asArray(status.warnings),
    refreshedAt: status.collectedAt ?? status.listeningPortsCheckedAt ?? refreshedAt,
    sections: [
      section("system", "سامانه", "System", status.hostname ?? status.os),
      section("ports", "پورت‌های شنونده", "Listening ports", status.listeningPorts),
      section("firewall", "فایروال", "Firewall", status.ufwStatus),
      section("services", "سرویس‌ها", "Services", status.sshServiceStatus)
    ].filter((item): item is NonNullable<typeof item> => item !== null)
  };
}

let optionalTablesPromise: Promise<Set<string>> | null = null;
function optionalTables() {
  optionalTablesPromise ??= prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('HealthSnapshot', 'CollectionRun', 'MetricSample', 'DeviceCapabilityCache', 'DeviceSnapshot')
  `.then((rows) => new Set(rows.map((row) => row.table_name)));
  return optionalTablesPromise;
}

async function loadWorkspaceMetrics(deviceId: string, vendor: string) {
  const timestamp = { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
  const source = metricSourceForVendor(vendor);
  const select = { metricKey: true, value: true, unit: true, timestamp: true, source: true, labelsJson: true } as const;
  // Interface counters must not evict CPU/memory/disk readings from one global limit.
  const keys = ["cpu.usage_percent", "memory.usage_percent", "disk.usage_percent", "swap.usage_percent", "cpu.load_1m", "sessions.count", "interfaces.up_count", "interfaces.down_count", "vpn.active_count", "services.failed_count", "ports.listening_count", "firewall.enabled", "system.uptime_seconds", "interfaces.count"];
  const groups = await Promise.all([
    ...keys.map((metricKey) => prisma.metricSample.findMany({ where: { deviceId, metricKey, timestamp, ...(source ? { source } : {}) }, orderBy: { timestamp: "desc" }, take: 240, select })),
    prisma.metricSample.findMany({ where: { deviceId, metricKey: { in: ["network.rx_bytes", "network.tx_bytes", "network.rx_mbps", "network.tx_mbps"] }, timestamp, ...(source ? { source } : {}) }, orderBy: { timestamp: "desc" }, take: 8192, select })
  ]);
  return groups.flat().sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

export async function getDeviceWorkspace(reference: string) {
  const directDevice = await prisma.device.findUnique({ where: { id: reference } });
  const directAsset = directDevice
    ? await prisma.asset.findUnique({ where: { deviceId: directDevice.id }, include: { site: true, location: true, vendor: true, platform: true } })
    : await prisma.asset.findUnique({ where: { id: reference }, include: { site: true, location: true, vendor: true, platform: true } });
  const device = directDevice ?? (directAsset?.deviceId ? await prisma.device.findUnique({ where: { id: directAsset.deviceId } }) : null);
  if (!device && !directAsset) return null;
  const deviceId = device?.id;
  const assetId = directAsset?.id;
  const relatedRecords = { OR: [deviceId ? { deviceId } : null, assetId ? { assetId } : null].filter((item): item is { deviceId: string } | { assetId: string } => item !== null) };
  const tables = await optionalTables();
  const [statusChecks, healthHistory, metricSamples, findings, actions, audit, capabilityCache, configBackup, collections, connectionChannels] = await Promise.all([
    deviceId ? prisma.deviceStatusCheck.findMany({ where: { deviceId }, orderBy: { checkedAt: "desc" }, take: 240 }) : [],
    tables.has("HealthSnapshot") ? prisma.healthSnapshot.findMany({ where: { OR: [{ ...(deviceId ? { deviceId } : { deviceId: "__none__" }) }, { ...(assetId ? { assetId } : { assetId: "__none__" }) }] }, orderBy: { collectedAt: "desc" }, take: 240 }) : [],
    deviceId && tables.has("MetricSample") ? loadWorkspaceMetrics(deviceId, device?.vendor ?? "") : [],
    prisma.finding.findMany({ where: relatedRecords, orderBy: { lastSeen: "desc" }, take: 250 }),
    prisma.actionPlan.findMany({ where: relatedRecords, orderBy: { updatedAt: "desc" }, take: 100, select: { id: true, actionType: true, status: true, riskLevel: true, createdAt: true, updatedAt: true } }),
    deviceId ? prisma.auditLog.findMany({ where: { deviceId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, actor: true, action: true, dryRun: true, approvalStatus: true, createdAt: true } }) : [],
    deviceId && tables.has("DeviceCapabilityCache") ? prisma.deviceCapabilityCache.findFirst({ where: { deviceId }, orderBy: { refreshedAt: "desc" } }) : null,
    deviceId && tables.has("DeviceSnapshot") ? prisma.deviceSnapshot.findFirst({ where: { deviceId, snapshotType: { contains: "config", mode: "insensitive" } }, orderBy: { collectedAt: "desc" }, select: { collectedAt: true, snapshotType: true } }) : null,
    tables.has("CollectionRun") ? prisma.collectionRun.findMany({ where: relatedRecords, orderBy: { startedAt: "desc" }, take: 100, select: { id: true, provider: true, status: true, startedAt: true, completedAt: true, durationMs: true, errorCode: true } }) : [],
    deviceId ? prisma.deviceConnectionChannel.findMany({
      where: { deviceId },
      orderBy: [{ priority: "asc" }, { role: "asc" }],
      select: { id: true, role: true, method: true, purposes: true, host: true, port: true, credentialId: true, enabled: true, priority: true, status: true, lastTestAt: true, lastSuccessAt: true, lastError: true, settingsJson: true }
    }) : []
  ]);
  const health = healthHistory[0] ?? null;
  const severityCounts = findings.reduce<Record<string, number>>((counts, finding) => {
    counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
    return counts;
  }, {});
  const deviceCapabilities = asObject(device?.capabilities);
  const onboarding = asObject(deviceCapabilities.onboarding);
  const ciscoDetection = asObject(deviceCapabilities.ciscoDetection);
  const latestStatus = statusChecks[0];
  const point = (timestamp: Date | string, value: number, label?: string) => ({ timestamp, value, ...(label ? { label } : {}) });
  const successfulCollection = (status: string) => status === "succeeded" || status === "completed";
  const charts = {
    healthScore: healthHistory.map((item) => point(item.collectedAt, item.score, item.state)).reverse(),
    connectorResults: collections.map((item) => point(item.completedAt ?? item.startedAt, successfulCollection(item.status) ? 1 : 0, item.status)).reverse(),
    availability: statusChecks.map((item) => point(item.checkedAt, item.status === "online" ? 1 : item.status === "offline" || item.status === "error" ? 0 : 0.5, item.status)).reverse(),
    resources: metricSamples.filter((item) => /cpu|memory|mem|load|disk|swap|sessions|interfaces\.(?:up|down)|vpn\.active/i.test(item.metricKey)).map((item) => ({ timestamp: item.timestamp, value: item.value, label: item.metricKey, unit: item.unit })).reverse(),
    findings: findings.map((item) => point(item.lastSeen, item.count, item.severity)).reverse(),
    actions: actions.map((item) => point(item.updatedAt, item.status === "succeeded" ? 1 : item.status === "failed" ? 0 : 0.5, item.status)).reverse(),
    recentChanges: audit.map((item) => ({ timestamp: item.createdAt, label: item.action })).reverse()
  };
  const traffic = buildDeviceTrafficSeries(metricSamples);
  const normalizedVendor = String(device?.vendor ?? device?.type ?? directAsset?.vendor?.slug ?? "unknown").toLowerCase();
  const vendorKey = normalizedVendor.includes("cisco") ? "cisco"
    : normalizedVendor.includes("mikrotik") ? "mikrotik"
      : normalizedVendor.includes("forti") ? "fortigate"
        : device?.type === "linux_edge" || normalizedVendor.includes("linux") ? "linux"
          : normalizedVendor;
  const cisco = asObject(deviceCapabilities.cisco);
  const ciscoCollection = asObject(cisco.collection);
  const ciscoSystem = asObject(ciscoCollection.system);
  const ciscoInterfaces = asObject(ciscoCollection.interfaces);
  const ciscoHealth = asObject(ciscoCollection.health);
  const ciscoNetwork = asObject(ciscoCollection.network);
  const ciscoProfile = asObject(cisco.capabilityProfile ?? ciscoCollection.capabilityProfile);
  const ciscoCapabilityGroups = asObject(ciscoProfile.groups);
  const ciscoFacts = Object.keys(ciscoCollection).length > 0
    ? {
      ...ciscoSystem,
      inventory: safeCiscoDetail(asArray(ciscoSystem.inventory)),
      interfaces: safeCiscoDetail(mergeCiscoWorkspaceInterfaces(ciscoInterfaces.summary, ciscoInterfaces.switchports)),
      switchports: safeCiscoDetail(asArray(ciscoInterfaces.switchports)),
      health: safeCiscoDetail(ciscoHealth),
      network: safeCiscoDetail(ciscoNetwork),
      configuration: safeCiscoDetail(asObject(ciscoCollection.configuration)),
      securityServices: safeCiscoDetail(asObject(ciscoCollection.securityServices)),
      collection: {
        collectedAt: ciscoCollection.collectedAt ?? null,
        inventoryStatus: ciscoCollection.inventoryStatus ?? "unknown",
        capabilityStatus: ciscoCollection.capabilityStatus ?? "unknown"
      }
    }
    : asObject(cisco.facts);
  const liveProjection = liveVendorProjection(vendorKey, deviceCapabilities, latestStatus?.checkedAt ?? null);
  const latestSuccessfulCollection = collections.find((item) => successfulCollection(item.status))?.completedAt ?? null;
  const connectionState = resolveWorkspaceConnectionState(latestStatus, device?.status ?? directAsset?.healthState, [
    latestSuccessfulCollection,
    ciscoCollection.collectedAt,
    onboarding.verifiedAt,
    liveProjection?.refreshedAt
  ]);
  const workspaceFacts = liveProjection?.facts ?? capabilityCache?.factsJson ?? (Object.keys(ciscoFacts).length > 0 ? ciscoFacts : null);
  const workspaceDetection = capabilityCache?.detectionJson ?? (Object.keys(ciscoDetection).length > 0 ? ciscoDetection : null);
  const workspaceCapabilityList = liveProjection?.capabilities ?? (Array.isArray(capabilityCache?.capabilitiesJson)
    ? capabilityCache.capabilitiesJson.map((item) => asObject(item))
    : Object.entries(ciscoCapabilityGroups).map(([domain, state]) => ({ domain, key: String(domain).toLowerCase(), state, mode: state === "read_only" ? "read" : "capability" })));
  const factHealth = asObject(asObject(workspaceFacts).health);
  const sensorTimestampValue = liveProjection?.refreshedAt ?? capabilityCache?.refreshedAt ?? ciscoCollection.collectedAt ?? null;
  const sensorTimestamp = typeof sensorTimestampValue === "string" || sensorTimestampValue instanceof Date ? sensorTimestampValue : null;
  const sensorReadings: Array<{ key: string; titleFa: string; titleEn: string; value: string | number; unit: string | null; measuredAt: Date | string | null; source: string; state: string }> = [];
  const addSensor = (key: string, titleFa: string, titleEn: string, value: unknown, unit: string | null, measuredAt: Date | string | null, source: string, state = "ok") => {
    if (value === null || value === undefined || value === "") return;
    if (typeof value !== "string" && typeof value !== "number") return;
    sensorReadings.push({ key, titleFa, titleEn, value: typeof value === "string" ? safeOverviewText(value, 100) : value, unit, measuredAt, source, state });
  };
  if (latestStatus) addSensor("reachability", "دسترسی", "Reachability", latestStatus.status, null, latestStatus.checkedAt, "connectivity", latestStatus.status === "online" ? "ok" : "attention");
  const managementChannel = connectionChannels.find((channel) => channel.role === "management");
  if (managementChannel) addSensor("management", "اتصال مدیریتی", "Management", managementChannel.status, null, managementChannel.lastTestAt, managementChannel.method, managementChannel.status === "verified" ? "ok" : "attention");
  if (health) {
    addSensor("health.state", "وضعیت سلامت", "Health state", health.state, null, health.collectedAt, "health_snapshot", health.state === "healthy" ? "ok" : "attention");
    addSensor("health.score", "امتیاز سلامت", "Health score", health.score, "%", health.collectedAt, "health_snapshot", health.state === "healthy" ? "ok" : "attention");
  }
  const latestMetrics = new Map<string, typeof metricSamples[number]>();
  for (const metric of metricSamples) if (!latestMetrics.has(metric.metricKey)) latestMetrics.set(metric.metricKey, metric);
  const metricLabels: Record<string, [string, string]> = {
    "cpu.usage_percent": ["مصرف CPU", "CPU usage"],
    "memory.usage_percent": ["مصرف حافظه", "Memory usage"],
    "disk.usage_percent": ["مصرف دیسک", "Disk usage"],
    "swap.usage_percent": ["مصرف Swap", "Swap usage"],
    "cpu.load_1m": ["بار CPU", "CPU load"],
    "services.failed_count": ["سرویس‌های ناموفق", "Failed services"],
    "ports.listening_count": ["پورت‌های شنونده", "Listening ports"],
    "firewall.enabled": ["فایروال میزبان", "Host firewall"]
  };
  for (const [key, metric] of latestMetrics) {
    const labels = metricLabels[key];
    if (labels) addSensor(key, labels[0], labels[1], metric.value, metric.unit ?? null, metric.timestamp, metric.source,
      /^(cpu|memory|disk|swap)\.usage_percent$/.test(key) && metric.value >= 85 ? "attention" : "ok");
  }
  if (!latestMetrics.has("cpu.usage_percent")) addSensor("vendor.cpu", "بار CPU", "CPU load", factHealth.cpuLoad ?? asObject(factHealth.cpu).fiveSeconds ?? asObject(factHealth.cpu).oneMinute, null, sensorTimestamp, "vendor_connector");
  if (!latestMetrics.has("memory.usage_percent")) addSensor("vendor.memory", "حافظه آزاد", "Free memory", factHealth.memoryFree ?? asObject(factHealth.memory).usedPercent, null, sensorTimestamp, "vendor_connector");
  const factInterfaces = asArray(asObject(workspaceFacts).interfaces);
  if (factInterfaces.length) {
    addSensor("interfaces.total", "اینترفیس‌ها", "Interfaces", factInterfaces.length, "count", sensorTimestamp, "vendor_connector");
    const down = factInterfaces.filter((item) => /^(down|disabled|notconnect)$/i.test(String(asObject(item).operationalStatus ?? asObject(item).status ?? asObject(item).state ?? ""))).length;
    addSensor("interfaces.down", "لینک‌های قطع", "Links down", down, "count", sensorTimestamp, "vendor_connector", down ? "attention" : "ok");
  }
  for (const [key, titleFa, titleEn] of [
    ["vpnConnections", "اتصال‌های VPN", "VPN connections"],
    ["gateways", "درگاه‌ها", "Gateways"],
    ["routes", "مسیرها", "Routes"],
    ["policies", "قوانین فایروال", "Firewall policies"],
    ["services", "سرویس‌ها", "Services"]
  ]) {
    const entries = asObject(workspaceFacts)[key];
    if (Array.isArray(entries)) addSensor(`vendor.${key}`, titleFa, titleEn, entries.length, "count", sensorTimestamp, "vendor_connector");
  }
  const newestCollection = collections[0];
  if (newestCollection) addSensor("collection", "جمع‌آوری", "Collection", newestCollection.status, null, newestCollection.completedAt ?? newestCollection.startedAt, newestCollection.provider, successfulCollection(newestCollection.status) ? "ok" : "attention");
  const issues = diagnoseDeviceIssues({
    status: latestStatus ? { status: latestStatus.status, checkedAt: latestStatus.checkedAt, message: latestStatus.message } : null,
    collection: newestCollection ? { status: newestCollection.status, startedAt: newestCollection.startedAt, completedAt: newestCollection.completedAt, errorCode: newestCollection.errorCode } : null,
    credentialConfigured: Boolean(device?.credentialId || device?.credentialRef),
    findings: findings.map((item) => ({ id: item.id, title: item.title, severity: item.severity, status: item.status, lastSeen: item.lastSeen })),
    sensors: sensorReadings.map((item) => ({ key: item.key, value: item.value, measuredAt: item.measuredAt }))
  });
  const section = (key: string, titleFa: string, titleEn: string, hasData: boolean, requirement: string, nextAction: string) => ({ key, titleFa, titleEn, state: hasData ? "available" : "no_data", reason: hasData ? null : "No verified collection has been stored for this capability.", requirement, nextAction });
  const ciscoSection = (key: string, group: string, titleFa: string, titleEn: string) => {
    const capabilityState = String(ciscoCapabilityGroups[group] ?? "unknown");
    return { ...section(key, titleFa, titleEn, capabilityState !== "unknown", "Refresh verified Cisco capabilities.", "Run safe read-only Cisco validation."), capabilityState };
  };
  const vendorSections = liveProjection?.sections ?? (vendorKey === "cisco" ? [
    ciscoSection("system", "System", "سامانه", "System"),
    ciscoSection("inventory", "Inventory", "موجودی سخت‌افزار", "Inventory"),
    ciscoSection("interfaces", "Interfaces", "اینترفیس‌ها", "Interfaces"),
    ciscoSection("switching", "Switching", "سوئیچینگ", "Switching"),
    ciscoSection("vlan", "VLAN", "VLAN", "VLAN"),
    ciscoSection("routing", "Routing", "مسیریابی", "Routing"),
    ciscoSection("acl", "ACL", "کنترل دسترسی (ACL)", "ACL"),
    ciscoSection("nat", "NAT", "NAT", "NAT"),
    ciscoSection("dhcp", "DHCP", "DHCP", "DHCP"),
    ciscoSection("aaa", "AAA", "احراز هویت (AAA)", "AAA"),
    ciscoSection("monitoring", "Monitoring", "پایش", "Monitoring"),
    ciscoSection("backup", "Backup", "پشتیبان تنظیمات", "Backup"),
    ciscoSection("diagnostics", "Diagnostics", "عیب‌یابی", "Diagnostics"),
    ciscoSection("security", "Security", "امنیت", "Security"),
    ciscoSection("services", "Services", "سرویس‌ها", "Services")
  ].filter((item) => item.capabilityState !== "unknown") : []);
  return {
    reference,
    device: device ? {
      id: device.id,
      name: device.name,
      vendor: device.vendor,
      type: device.type,
      host: device.host,
      managementPort: device.managementPort,
      protocol: device.protocol,
      environment: device.environment,
      status: device.status,
      credentialConfigured: Boolean(device.credentialId || device.credentialRef),
      tags: device.tags,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt
    } : null,
    asset: directAsset ? {
      id: directAsset.id,
      name: directAsset.name,
      hostname: directAsset.hostname,
      managementIp: directAsset.managementIp,
      managedState: directAsset.managedState,
      healthState: directAsset.healthState,
      lastSeenAt: directAsset.lastSeenAt,
      site: directAsset.site?.name ?? null,
      location: directAsset.location?.name ?? null,
      vendor: directAsset.vendor?.name ?? null,
      platform: directAsset.platform?.name ?? null
    } : null,
    overview: {
      name: device?.name ?? directAsset?.name,
      vendor: device?.vendor ?? directAsset?.vendor?.name ?? "unknown",
      platform: capabilityCache?.platformKey ?? ciscoCollection.platform ?? onboarding.platform ?? ciscoDetection.platform ?? directAsset?.platform?.name ?? device?.type ?? "unknown",
      version: asObject(workspaceFacts).iosVersion ?? asObject(workspaceFacts).version ?? ciscoDetection.version ?? null,
      site: directAsset?.site?.name ?? null,
      location: directAsset?.location?.name ?? null,
      managementIp: directAsset?.managementIp ?? device?.host ?? null,
      availability: connectionState.availability,
      healthScore: health?.score ?? null,
      healthState: health?.state ?? directAsset?.healthState ?? device?.status ?? "unknown",
      connectorState: onboarding.connectorType && connectionState.verificationStatus === "verified" ? "verified" : connectionState.availability,
      connectorType: liveProjection?.connectorType ?? onboarding.connectorType ?? capabilityCache?.connectorType ?? (Object.keys(ciscoCollection).length > 0 ? "cisco-ios-xe-ssh" : null),
      lastContact: connectionState.lastContact ?? directAsset?.lastSeenAt ?? null,
      lastSuccessfulCollection: latestSuccessfulCollection ?? ciscoCollection.collectedAt ?? null,
      findingsBySeverity: severityCounts,
      pendingActions: actions.filter((item) => PENDING_ACTION_STATES.includes(item.status as typeof PENDING_ACTION_STATES[number])).length,
      recentChanges: audit.slice(0, 5),
      configBackup: configBackup ? { state: "available", collectedAt: configBackup.collectedAt, snapshotType: configBackup.snapshotType } : { state: "not_available", collectedAt: null },
      verificationStatus: connectionState.verificationStatus
    },
    statusChecks,
    health,
    findings,
    actions,
    audit,
    capabilities: liveProjection ? {
      vendorKey,
      platformKey: String(onboarding.platform ?? directAsset?.platform?.name ?? device?.type ?? vendorKey),
      connectorType: liveProjection.connectorType,
      detection: workspaceDetection,
      capabilities: liveProjection.capabilities,
      facts: liveProjection.facts,
      warnings: liveProjection.warnings,
      refreshedAt: liveProjection.refreshedAt,
      expiresAt: undefined
    } : capabilityCache ? {
      vendorKey: capabilityCache.vendorKey,
      platformKey: capabilityCache.platformKey,
      connectorType: capabilityCache.connectorType,
      detection: capabilityCache.detectionJson,
      capabilities: capabilityCache.capabilitiesJson,
      facts: capabilityCache.factsJson,
      warnings: capabilityCache.warningsJson,
      refreshedAt: capabilityCache.refreshedAt,
      expiresAt: capabilityCache.expiresAt
    } : Object.keys(cisco).length > 0 ? {
      vendorKey: "cisco",
      platformKey: String(ciscoCollection.platform ?? ciscoDetection.platform ?? "cisco-unknown"),
      connectorType: Object.keys(ciscoCollection).length > 0 ? "cisco-ios-xe-ssh" : undefined,
      detection: workspaceDetection,
      capabilities: workspaceCapabilityList,
      facts: workspaceFacts,
      warnings: asObject(ciscoCollection).warnings ?? [],
      refreshedAt: typeof ciscoCollection.collectedAt === "string" ? ciscoCollection.collectedAt : undefined,
      expiresAt: undefined
    } : null,
    collections,
    connections: (vendorKey === "linux" ? connectionChannels.filter((channel) => channel.role === "management") : connectionChannels).map((channel) => ({
      ...channel,
      telemetry: channel.method === "snmpv3" ? {
        uptimeSeconds: metricSamples.find((sample) => sample.source === "snmpv3" && sample.metricKey === "system.uptime_seconds" && channel.lastSuccessAt && sample.timestamp >= channel.lastSuccessAt)?.value ?? null,
        interfaceCount: metricSamples.find((sample) => sample.source === "snmpv3" && sample.metricKey === "interfaces.count" && channel.lastSuccessAt && sample.timestamp >= channel.lastSuccessAt)?.value ?? null
      } : null
    })),
    sensors: sensorReadings,
    issues,
    charts,
    traffic,
    vendor: { key: vendorKey, sections: vendorSections },
    vendorOverview: projectVendorOverview(vendorKey, workspaceFacts, liveProjection?.refreshedAt ?? capabilityCache?.refreshedAt ?? ciscoCollection.collectedAt ?? latestSuccessfulCollection),
    vendorDetails: vendorKey === "cisco" ? projectCiscoWorkspaceDetails(ciscoCollection) : null
  };
}
