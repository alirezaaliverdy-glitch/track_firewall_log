import { ActionType, DeviceProtocol, DeviceType, type Device } from "@prisma/client";
import type { ConnectorCapability, DeviceConnector, VendorPlanner } from "./types.js";
import { fortigateSshConnector } from "./fortigate-ssh.connector.js";
import { linuxSshConnector } from "./linux-ssh.connector.js";
import { mikrotikSshConnector } from "./mikrotik-ssh.connector.js";
import { fortigatePlanner } from "./vendors/fortigate.planner.js";
import { linuxEdgePlanner } from "./vendors/linux-edge.planner.js";
import { mikrotikPlanner } from "./vendors/mikrotik.planner.js";
import { pfsensePlanner } from "./vendors/pfsense.planner.js";
import { ciscoIosXePlanner } from "./vendors/cisco-ios-xe.planner.js";
import { ciscoIosXeConnector } from "./cisco-ios-xe.connector.js";
import { sophosApiConnector } from "./sophos-api.connector.js";
import { sophosPlanner } from "./vendors/sophos.planner.js";

const planners: VendorPlanner[] = [
  fortigatePlanner,
  mikrotikPlanner,
  linuxEdgePlanner,
  ciscoIosXePlanner,
  sophosPlanner,
  pfsensePlanner
];

const connectors: DeviceConnector[] = [
  fortigateSshConnector,
  mikrotikSshConnector,
  linuxSshConnector,
  ciscoIosXeConnector,
  sophosApiConnector
];

export function getVendorPlanners() {
  return planners;
}

export function selectPlanner(device: Device | null) {
  return planners.find((planner) => planner.supports(device)) ?? null;
}

export function getDeviceConnectors() {
  return connectors;
}

export function selectDeviceConnector(device: Device | null) {
  return connectors.find((connector) => connector.supports(device)) ?? null;
}

export function getConnectorVendors() {
  return planners.map((planner) => planner.vendor);
}

export function getConnectorCapabilities(): ConnectorCapability[] {
  return [
    {
      vendor: "fortigate",
      deviceTypes: [DeviceType.fortigate],
      protocols: [DeviceProtocol.ssh],
      supportedActions: fortigatePlanner.supportedActions,
      executionEnabled: true
    },
    {
      vendor: "mikrotik",
      deviceTypes: [DeviceType.mikrotik],
      protocols: [DeviceProtocol.ssh, DeviceProtocol.api],
      supportedActions: mikrotikPlanner.supportedActions,
      executionEnabled: true
    },
    {
      vendor: "linux_edge",
      deviceTypes: [DeviceType.linux_edge],
      protocols: [DeviceProtocol.ssh, DeviceProtocol.agent],
      supportedActions: linuxEdgePlanner.supportedActions,
      executionEnabled: true
    },
    {
      vendor: "cisco",
      deviceTypes: [DeviceType.generic_firewall],
      protocols: [DeviceProtocol.ssh],
      supportedActions: ciscoIosXePlanner.supportedActions,
      executionEnabled: true
    },
    {
      vendor: "sophos",
      deviceTypes: [DeviceType.generic_firewall],
      protocols: [DeviceProtocol.api],
      supportedActions: sophosPlanner.supportedActions,
      executionEnabled: true
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
