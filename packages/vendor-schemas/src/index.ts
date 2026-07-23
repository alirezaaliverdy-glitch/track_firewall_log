import type { ActionCommandSpec, DeviceVendor, RiskLevel } from "../../contracts/src/index";

export type LocalTemplate = {
  id: string;
  vendor: DeviceVendor;
  actionType: string;
  title: string;
  riskLevel: RiskLevel;
  monitoring: boolean;
  commandSpecs: ActionCommandSpec[];
};

export const LOCAL_VENDOR_TEMPLATES: LocalTemplate[] = [
  {
    id: "linux.monitor.services",
    vendor: "linux",
    actionType: "monitoring.linux.services",
    title: "Linux services",
    riskLevel: "low",
    monitoring: true,
    commandSpecs: [{ id: "systemctl-list", command: "systemctl --no-pager --type=service --state=running", readOnly: true, timeoutMs: 15000 }]
  },
  {
    id: "linux.monitor.resources",
    vendor: "linux",
    actionType: "monitoring.linux.resources",
    title: "Linux CPU memory storage ports logs",
    riskLevel: "low",
    monitoring: true,
    commandSpecs: [
      { id: "cpu-memory", command: "top -b -n 1 | head -20", readOnly: true, timeoutMs: 15000 },
      { id: "storage", command: "df -h", readOnly: true, timeoutMs: 15000 },
      { id: "ports", command: "ss -tulpen", readOnly: true, timeoutMs: 15000 },
      { id: "logs", command: "journalctl --no-pager -n 100", readOnly: true, timeoutMs: 15000 }
    ]
  },
  {
    id: "linux.service.status",
    vendor: "linux",
    actionType: "linux_check_service_status",
    title: "Linux service status",
    riskLevel: "low",
    monitoring: true,
    commandSpecs: [{ id: "systemctl-status", command: "systemctl --no-pager status ${serviceName}", readOnly: true, timeoutMs: 15000 }]
  },
  {
    id: "mikrotik.monitor.interfaces",
    vendor: "mikrotik",
    actionType: "monitoring.mikrotik.interfaces",
    title: "MikroTik interfaces",
    riskLevel: "low",
    monitoring: true,
    commandSpecs: [{ id: "interface-print", command: "/interface print detail without-paging", readOnly: true, timeoutMs: 15000 }]
  },
  {
    id: "mikrotik.monitor.routing-neighbors",
    vendor: "mikrotik",
    actionType: "monitoring.mikrotik.routing_neighbors",
    title: "MikroTik routes and neighbors",
    riskLevel: "low",
    monitoring: true,
    commandSpecs: [
      { id: "routes", command: "/ip route print detail without-paging", readOnly: true, timeoutMs: 15000 },
      { id: "neighbors", command: "/ip neighbor print detail without-paging", readOnly: true, timeoutMs: 15000 }
    ]
  },
  {
    id: "fortigate.monitor.sessions",
    vendor: "fortigate",
    actionType: "monitoring.fortigate.sessions",
    title: "FortiGate sessions",
    riskLevel: "low",
    monitoring: true,
    commandSpecs: [{ id: "session-list", command: "diagnose sys session list", readOnly: true, timeoutMs: 15000 }]
  },
  {
    id: "fortigate.monitor.config-vpn",
    vendor: "fortigate",
    actionType: "monitoring.fortigate.config_vpn",
    title: "FortiGate config and VPN inspection",
    riskLevel: "low",
    monitoring: true,
    commandSpecs: [
      { id: "system-status", command: "get system status", readOnly: true, timeoutMs: 15000 },
      { id: "interfaces", command: "show system interface", readOnly: true, timeoutMs: 15000 },
      { id: "vpn", command: "get vpn ipsec tunnel summary", readOnly: true, timeoutMs: 15000 }
    ]
  },
  {
    id: "cisco.monitor.vlans",
    vendor: "cisco",
    actionType: "monitoring.cisco.vlans",
    title: "Cisco VLANs",
    riskLevel: "low",
    monitoring: true,
    commandSpecs: [{ id: "show-vlan", command: "show vlan brief", readOnly: true, timeoutMs: 15000 }]
  },
  {
    id: "cisco.monitor.interfaces-routes",
    vendor: "cisco",
    actionType: "monitoring.cisco.interfaces_routes",
    title: "Cisco interfaces routes neighbors",
    riskLevel: "low",
    monitoring: true,
    commandSpecs: [
      { id: "interfaces", command: "show interfaces status", readOnly: true, timeoutMs: 15000 },
      { id: "routes", command: "show ip route", readOnly: true, timeoutMs: 15000 },
      { id: "neighbors", command: "show cdp neighbors detail", readOnly: true, timeoutMs: 15000 }
    ]
  }
];

export function templateFor(vendor: DeviceVendor, actionType: string) {
  return LOCAL_VENDOR_TEMPLATES.find((template) => template.vendor === vendor && template.actionType === actionType) ?? null;
}
