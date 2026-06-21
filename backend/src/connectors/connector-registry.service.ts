import { ActionType, DeviceProtocol, DeviceType, type Device } from "@prisma/client";
import type { ConnectorCapability, VendorPlanner } from "./types.js";
import { fortigatePlanner } from "./vendors/fortigate.planner.js";
import { linuxEdgePlanner } from "./vendors/linux-edge.planner.js";
import { mikrotikPlanner } from "./vendors/mikrotik.planner.js";
import { pfsensePlanner } from "./vendors/pfsense.planner.js";

const planners: VendorPlanner[] = [
  fortigatePlanner,
  mikrotikPlanner,
  linuxEdgePlanner,
  pfsensePlanner
];

export function getVendorPlanners() {
  return planners;
}

export function selectPlanner(device: Device | null) {
  return planners.find((planner) => planner.supports(device)) ?? null;
}

export function getConnectorVendors() {
  return planners.map((planner) => planner.vendor);
}

export function getConnectorCapabilities(): ConnectorCapability[] {
  return [
    {
      vendor: "fortigate",
      deviceTypes: [DeviceType.fortigate],
      protocols: [DeviceProtocol.ssh, DeviceProtocol.api],
      supportedActions: fortigatePlanner.supportedActions,
      executionEnabled: false
    },
    {
      vendor: "mikrotik",
      deviceTypes: [DeviceType.mikrotik],
      protocols: [DeviceProtocol.ssh, DeviceProtocol.api],
      supportedActions: mikrotikPlanner.supportedActions,
      executionEnabled: false
    },
    {
      vendor: "linux_edge",
      deviceTypes: [DeviceType.linux_edge],
      protocols: [DeviceProtocol.ssh, DeviceProtocol.agent],
      supportedActions: linuxEdgePlanner.supportedActions,
      executionEnabled: false
    },
    {
      vendor: "pfsense",
      deviceTypes: [DeviceType.pfsense],
      protocols: [DeviceProtocol.api, DeviceProtocol.ssh],
      supportedActions: pfsensePlanner.supportedActions,
      executionEnabled: false
    },
    {
      vendor: "generic",
      deviceTypes: [DeviceType.generic_firewall, DeviceType.generic_syslog_source],
      protocols: [DeviceProtocol.ssh, DeviceProtocol.api, DeviceProtocol.syslog, DeviceProtocol.agent],
      supportedActions: Object.values(ActionType),
      executionEnabled: false
    }
  ];
}
