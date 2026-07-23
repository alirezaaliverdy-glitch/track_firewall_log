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
    id: "fortigate.monitor.sessions",
    vendor: "fortigate",
    actionType: "monitoring.fortigate.sessions",
    title: "FortiGate sessions",
    riskLevel: "low",
    monitoring: true,
    commandSpecs: [{ id: "session-list", command: "diagnose sys session list", readOnly: true, timeoutMs: 15000 }]
  },
  {
    id: "cisco.monitor.vlans",
    vendor: "cisco",
    actionType: "monitoring.cisco.vlans",
    title: "Cisco VLANs",
    riskLevel: "low",
    monitoring: true,
    commandSpecs: [{ id: "show-vlan", command: "show vlan brief", readOnly: true, timeoutMs: 15000 }]
  }
];

export function templateFor(vendor: DeviceVendor, actionType: string) {
  return LOCAL_VENDOR_TEMPLATES.find((template) => template.vendor === vendor && template.actionType === actionType) ?? null;
}
