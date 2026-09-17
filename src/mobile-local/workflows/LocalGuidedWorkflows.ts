import type { CreatePlanInput, DeviceVendor } from "../../../packages/contracts/src/index";
import { LOCAL_VENDOR_TEMPLATES } from "../../../packages/vendor-schemas/src/index";

export type LocalGuidedWorkflow = {
  id: string;
  vendor: DeviceVendor | "any";
  title: string;
  offlineAvailable: boolean;
  steps: Array<{ id: string; title: string; actionType: string; monitoring: boolean }>;
};

export const LOCAL_GUIDED_WORKFLOWS: LocalGuidedWorkflow[] = [
  {
    id: "local.monitoring.snapshot",
    vendor: "any",
    title: "Local monitoring snapshot",
    offlineAvailable: true,
    steps: [
      { id: "linux-resources", title: "Linux CPU memory storage ports logs", actionType: "monitoring.linux.resources", monitoring: true },
      { id: "mikrotik-routing", title: "MikroTik routes and neighbors", actionType: "monitoring.mikrotik.routing_neighbors", monitoring: true },
      { id: "fortigate-vpn", title: "FortiGate config and VPN state", actionType: "monitoring.fortigate.config_vpn", monitoring: true },
      { id: "cisco-interfaces", title: "Cisco interfaces routes neighbors", actionType: "monitoring.cisco.interfaces_routes", monitoring: true }
    ]
  },
  {
    id: "local.host-key-readiness",
    vendor: "any",
    title: "Host-key and credential readiness",
    offlineAvailable: true,
    steps: [
      { id: "inventory", title: "Save inventory without credential", actionType: "local.inventory.save", monitoring: true },
      { id: "credential-ref", title: "Attach credential reference", actionType: "local.credential.reference", monitoring: true },
      { id: "host-key", title: "Probe and trust host key", actionType: "local.host_key.trust", monitoring: true },
      { id: "test-ssh", title: "Test SSH after trust", actionType: "local.ssh.test", monitoring: true }
    ]
  }
];

export function monitoringTemplatesFor(vendor: DeviceVendor) {
  return LOCAL_VENDOR_TEMPLATES.filter((template) => template.vendor === vendor && template.monitoring);
}

export function ensureMonitoringBatchIsReadOnly(actionTypes: string[]) {
  const templates = actionTypes.map((actionType) => LOCAL_VENDOR_TEMPLATES.find((template) => template.actionType === actionType));
  if (templates.some((template) => !template)) throw new Error("LOCAL_MONITORING_TEMPLATE_NOT_FOUND");
  if (templates.some((template) => template?.commandSpecs.some((command) => !command.readOnly))) {
    throw new Error("LOCAL_MONITORING_MUTATION_REJECTED");
  }
  return true;
}

export function planInputForMonitoring(deviceId: string, vendor: DeviceVendor, actionType: string): CreatePlanInput {
  const template = LOCAL_VENDOR_TEMPLATES.find((item) => item.vendor === vendor && item.actionType === actionType);
  if (!template || !template.monitoring) throw new Error("LOCAL_MONITORING_TEMPLATE_NOT_FOUND");
  ensureMonitoringBatchIsReadOnly([actionType]);
  return { deviceId, actionType, parameters: { monitoring: true }, source: "monitoring" };
}

