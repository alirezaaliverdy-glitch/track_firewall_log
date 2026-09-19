import { Link } from "react-router-dom";

type UnknownRecord = Record<string, unknown>;

type CiscoAssetDashboardProps = {
  details: UnknownRecord | null;
  deviceId: string;
  availability: string;
  lastCollected?: string | null;
  collecting: boolean;
  isFa: boolean;
  onCollect: () => void;
};

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function rows(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object" && !Array.isArray(item)).map((item) => item as UnknownRecord) : [];
}

function text(value: unknown, fallback = "—") {
  return value === null || value === undefined || value === "" || typeof value === "object" ? fallback : String(value);
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function domain(source: UnknownRecord, key: string) {
  const item = record(source[key]);
  return { state: text(item.state, "not_collected"), count: number(item.count) ?? rows(item.entries).length, entries: rows(item.entries) };
}

function interfaceName(item: UnknownRecord) {
  return text(item.name ?? item.interface ?? item.port, "unknown");
}

function interfaceState(item: UnknownRecord) {
  const state = text(item.operationalStatus ?? item.protocolStatus ?? item.status, "unknown").toLowerCase();
  if (state === "up" || state === "connected") return "up";
  if (["down", "notconnect", "disabled", "err-disabled", "inactive"].includes(state)) return "down";
  return "unknown";
}

function mergeInterfaces(summary: UnknownRecord[], switchports: UnknownRecord[]) {
  const merged = new Map<string, UnknownRecord>();
  for (const item of [...switchports, ...summary]) {
    const name = interfaceName(item);
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    merged.set(key || name, { ...merged.get(key || name), ...item, name });
  }
  return [...merged.values()];
}

function stateLabel(state: string, isFa: boolean) {
  const labels: Record<string, [string, string]> = {
    collected: ["جمع‌آوری شده", "Collected"],
    partial: ["ناقص", "Partial"],
    read_only: ["فقط خواندنی", "Read only"],
    write_supported: ["قابل تغییر", "Write supported"],
    not_configured: ["پیکربندی نشده", "Not configured"],
    not_collected: ["داده ندارد", "No data"],
    not_supported: ["پشتیبانی نمی‌شود", "Unsupported"],
    command_failed: ["خطای دریافت", "Collection failed"],
    unknown: ["نامشخص", "Unknown"]
  };
  return labels[state]?.[isFa ? 0 : 1] ?? state;
}

function domainTone(state: string) {
  if (["collected", "read_only", "write_supported", "supported"].includes(state)) return "is-good";
  if (["command_failed", "failed"].includes(state)) return "is-bad";
  return "is-muted";
}

function healthPercent(health: UnknownRecord, key: "cpu" | "memory") {
  const item = record(health[key]);
  if (key === "cpu") return number(item.fiveSeconds ?? item.oneMinute);
  const memoryRows = rows(health[key]);
  if (memoryRows.length) {
    const total = memoryRows.reduce((sum, row) => sum + (number(row.totalBytes) ?? 0), 0);
    const used = memoryRows.reduce((sum, row) => sum + (number(row.usedBytes) ?? 0), 0);
    return total > 0 ? Math.round((used / total) * 100) : null;
  }
  return number(item.usedPercent);
}

function entryTitle(item: UnknownRecord) {
  return text(item.name ?? item.deviceId ?? item.key ?? item.vlanId ?? item.destination ?? item.ipAddress ?? item.address, "—");
}

function entryMeta(item: UnknownRecord) {
  const parts = [item.value, item.status, item.localInterface, item.port, item.nextHop, item.model, item.description]
    .map((value) => text(value, ""))
    .filter(Boolean);
  return parts.slice(0, 3).join(" · ") || "—";
}

export function CiscoAssetDashboard({ details, deviceId, availability, lastCollected, collecting, isFa, onCollect }: CiscoAssetDashboardProps) {
  if (!details) {
    return <section className="cisco-empty-state">
      <span className="cisco-empty-state__icon" aria-hidden="true">◎</span>
      <div><h2>{isFa ? "هنوز داده زنده سیسکو دریافت نشده" : "Cisco live data is not available yet"}</h2><p>{isFa ? "با جمع‌آوری امن و فقط‌خواندنی، هویت، پورت‌ها، VLAN، همسایه‌ها، مسیرها و وضعیت سرویس‌ها دریافت می‌شود." : "Run a safe read-only collection to retrieve identity, ports, VLANs, neighbors, routes, and services."}</p></div>
      <button className="primary-button" type="button" disabled={collecting} onClick={onCollect}>{collecting ? (isFa ? "در حال جمع‌آوری…" : "Collecting…") : (isFa ? "جمع‌آوری اطلاعات سیسکو" : "Collect Cisco data")}</button>
    </section>;
  }

  const system = record(details.system);
  const interfaceData = record(details.interfaces);
  const interfaces = mergeInterfaces(rows(interfaceData.summary), rows(interfaceData.switchports));
  const network = record(details.network);
  const security = record(details.security);
  const configuration = record(details.configuration);
  const health = record(details.health);
  const inventory = rows(details.inventory);
  const upCount = interfaces.filter((item) => interfaceState(item) === "up").length;
  const downCount = interfaces.filter((item) => interfaceState(item) === "down").length;
  const unknownCount = Math.max(0, interfaces.length - upCount - downCount);
  const cpu = healthPercent(health, "cpu");
  const memory = healthPercent(health, "memory");
  const vlans = domain(network, "vlans");
  const routes = domain(network, "routingTable");
  const arp = domain(network, "arp");
  const mac = domain(network, "macAddressTable");
  const cdp = domain(network, "cdpNeighbors");
  const lldp = domain(network, "lldpNeighbors");
  const accessLists = domain(security, "accessLists");
  const serviceDomains = ["ssh", "snmp", "syslogDestinations", "ntp", "dhcpPools", "dhcpBindings", "aaa", "localUsers"];
  const readableDate = lastCollected || details.collectedAt
    ? new Date(String(lastCollected ?? details.collectedAt)).toLocaleString(isFa ? "fa-IR" : "en-US")
    : "—";
  const operationalScore = interfaces.length ? Math.round((upCount / interfaces.length) * 100) : 0;
  const previewNeighbors = [...cdp.entries, ...lldp.entries].slice(0, 6);

  return <section className="cisco-asset-dashboard">
    <header className="cisco-command-deck">
      <div className="cisco-command-deck__brand"><span className="cisco-mark" aria-hidden="true"><i /><i /><i /><i /><i /></span><div><small>{isFa ? "نمای عملیاتی دستگاه" : "Device operational view"}</small><h2>Cisco {text(details.platformFamily ?? system.platformFamily, "IOS")}</h2><p>{text(system.hostname)} · {text(system.model)} · {text(system.iosVersion)}</p></div></div>
      <div className="cisco-command-deck__state"><span className={availability === "online" ? "is-online" : "is-warning"}>{availability === "online" ? (isFa ? "آنلاین" : "Online") : (isFa ? "نیازمند بررسی" : "Needs review")}</span><small>{isFa ? `آخرین داده: ${readableDate}` : `Last data: ${readableDate}`}</small><button className="secondary-button" type="button" disabled={collecting} onClick={onCollect}>{collecting ? (isFa ? "در حال دریافت…" : "Refreshing…") : (isFa ? "تازه‌سازی داده زنده" : "Refresh live data")}</button></div>
    </header>

    <div className="cisco-kpi-grid">
      <article><span>{isFa ? "اینترفیس" : "Interfaces"}</span><strong>{interfaces.length.toLocaleString(isFa ? "fa-IR" : "en-US")}</strong><small>{isFa ? "شناسایی‌شده" : "discovered"}</small></article>
      <article className="is-up"><span>{isFa ? "لینک فعال" : "Links up"}</span><strong>{upCount.toLocaleString(isFa ? "fa-IR" : "en-US")}</strong><small>{isFa ? `${operationalScore.toLocaleString("fa-IR")}٪ از پورت‌ها` : `${operationalScore}% of ports`}</small></article>
      <article className="is-down"><span>{isFa ? "لینک قطع" : "Links down"}</span><strong>{downCount.toLocaleString(isFa ? "fa-IR" : "en-US")}</strong><small>{unknownCount ? (isFa ? `${unknownCount.toLocaleString("fa-IR")} نامشخص` : `${unknownCount} unknown`) : (isFa ? "وضعیت‌ها کامل است" : "States complete")}</small></article>
      <article><span>VLAN</span><strong>{vlans.count.toLocaleString(isFa ? "fa-IR" : "en-US")}</strong><small>{stateLabel(vlans.state, isFa)}</small></article>
      <article><span>{isFa ? "همسایه شبکه" : "Neighbors"}</span><strong>{(cdp.count + lldp.count).toLocaleString(isFa ? "fa-IR" : "en-US")}</strong><small>CDP / LLDP</small></article>
      <article><span>{isFa ? "مسیر" : "Routes"}</span><strong>{routes.count.toLocaleString(isFa ? "fa-IR" : "en-US")}</strong><small>{stateLabel(routes.state, isFa)}</small></article>
    </div>

    <div className="cisco-dashboard-grid">
      <article className="cisco-panel cisco-port-health">
        <header><div><small>{isFa ? "سلامت پورت‌ها" : "Port health"}</small><h3>{isFa ? "نقشه سریع وضعیت لینک" : "Quick link-state map"}</h3></div><Link className="secondary-link" to={`/assets/devices/${deviceId}/interfaces`}>{isFa ? "جزئیات همه پورت‌ها" : "All port details"}</Link></header>
        <div className="cisco-port-dots" aria-label={isFa ? "وضعیت اینترفیس‌ها" : "Interface states"}>{interfaces.slice(0, 96).map((item) => <span key={interfaceName(item)} className={`is-${interfaceState(item)}`} title={`${interfaceName(item)}: ${interfaceState(item)}`} />)}</div>
        <div className="cisco-legend"><span><i className="is-up" />{isFa ? "فعال" : "Up"} {upCount}</span><span><i className="is-down" />{isFa ? "قطع" : "Down"} {downCount}</span><span><i />{isFa ? "نامشخص" : "Unknown"} {unknownCount}</span></div>
      </article>

      <article className="cisco-panel cisco-health-panel">
        <header><div><small>{isFa ? "منابع دستگاه" : "Device resources"}</small><h3>{isFa ? "سلامت لحظه‌ای" : "Live health"}</h3></div></header>
        {[{ label: "CPU", value: cpu }, { label: isFa ? "حافظه" : "Memory", value: memory }].map((item) => <div className="cisco-meter" key={item.label}><span>{item.label}<b>{item.value === null ? "—" : `${item.value}%`}</b></span><i><em style={{ width: `${Math.min(100, Math.max(0, item.value ?? 0))}%` }} /></i></div>)}
        <dl className="cisco-system-facts"><div><dt>{isFa ? "مدل" : "Model"}</dt><dd dir="ltr">{text(system.model)}</dd></div><div><dt>{isFa ? "سریال" : "Serial"}</dt><dd dir="ltr">{text(system.serialNumber)}</dd></div><div><dt>{isFa ? "زمان کارکرد" : "Uptime"}</dt><dd dir="ltr">{text(system.uptime)}</dd></div><div><dt>{isFa ? "ایمیج راه‌اندازی" : "Boot image"}</dt><dd dir="ltr">{text(system.bootImage ?? system.imageName)}</dd></div></dl>
      </article>

      <article className="cisco-panel cisco-network-panel">
        <header><div><small>{isFa ? "دید شبکه" : "Network visibility"}</small><h3>{isFa ? "جداول و همسایه‌ها" : "Tables and neighbors"}</h3></div></header>
        <div className="cisco-mini-metrics"><span><small>ARP</small><strong>{arp.count}</strong></span><span><small>MAC</small><strong>{mac.count}</strong></span><span><small>CDP</small><strong>{cdp.count}</strong></span><span><small>LLDP</small><strong>{lldp.count}</strong></span></div>
        {previewNeighbors.length ? <div className="cisco-compact-list">{previewNeighbors.map((item, index) => <div key={`${entryTitle(item)}-${index}`}><span><strong dir="ltr">{entryTitle(item)}</strong><small dir="ltr">{entryMeta(item)}</small></span><b>{index < cdp.entries.length ? "CDP" : "LLDP"}</b></div>)}</div> : <p className="cisco-no-data">{isFa ? "همسایه‌ای در آخرین جمع‌آوری ثبت نشده است." : "No neighbors were recorded in the latest collection."}</p>}
      </article>

      <article className="cisco-panel cisco-security-panel">
        <header><div><small>{isFa ? "پیکربندی و امنیت" : "Configuration and security"}</small><h3>{isFa ? "پوشش سرویس‌های مهم" : "Critical service coverage"}</h3></div><span>{isFa ? `${accessLists.count.toLocaleString("fa-IR")} رکورد ACL` : `${accessLists.count} ACL records`}</span></header>
        <div className="cisco-domain-grid">{serviceDomains.map((key) => { const item = domain(security, key); const labels: Record<string, string> = { ssh: "SSH", snmp: "SNMP", syslogDestinations: "Syslog", ntp: "NTP", dhcpPools: "DHCP", dhcpBindings: "DHCP Bind", aaa: "AAA", localUsers: isFa ? "کاربران محلی" : "Local users" }; return <div key={key}><span>{labels[key]}</span><b className={domainTone(item.state)}>{stateLabel(item.state, isFa)}</b><small>{item.count ? item.count.toLocaleString(isFa ? "fa-IR" : "en-US") : "—"}</small></div>; })}</div>
        <div className="cisco-config-strip"><span><small>{isFa ? "پیکربندی جاری" : "Running config"}</small><b>{stateLabel(text(record(configuration.runningConfigMetadata).state, "not_collected"), isFa)}</b></span><span><small>{isFa ? "پیکربندی راه‌اندازی" : "Startup config"}</small><b>{stateLabel(text(record(configuration.startupConfigMetadata).state, "not_collected"), isFa)}</b></span><span><small>{isFa ? "پشتیبان امن" : "Safe backup"}</small><b>{stateLabel(text(configuration.safeBackupExport, "unknown"), isFa)}</b></span></div>
      </article>

      {inventory.length ? <article className="cisco-panel cisco-wide-panel"><header><div><small>{isFa ? "موجودی سخت‌افزار" : "Hardware inventory"}</small><h3>{isFa ? "قطعات شناسایی‌شده" : "Detected components"}</h3></div><span>{inventory.length.toLocaleString(isFa ? "fa-IR" : "en-US")}</span></header><div className="cisco-inventory-grid">{inventory.slice(0, 12).map((item, index) => <div key={`${text(item.serialNumber)}-${index}`}><span aria-hidden="true">▣</span><strong>{text(item.name, isFa ? "قطعه" : "Component")}</strong><small dir="ltr">{text(item.model)}</small><small dir="ltr">{text(item.serialNumber)}</small></div>)}</div></article> : null}

      {vlans.entries.length ? <article className="cisco-panel cisco-wide-panel"><header><div><small>VLAN</small><h3>{isFa ? "شبکه‌های مجازی فعال" : "Virtual networks"}</h3></div><span>{vlans.count}</span></header><div className="cisco-vlan-list">{vlans.entries.slice(0, 16).map((item, index) => <div key={`${text(item.vlanId)}-${index}`}><strong>{text(item.vlanId)}</strong><span>{text(item.name)}</span><small>{text(item.status)}</small><em>{Array.isArray(item.ports) ? item.ports.length : 0} {isFa ? "پورت" : "ports"}</em></div>)}</div></article> : null}
    </div>
  </section>;
}
