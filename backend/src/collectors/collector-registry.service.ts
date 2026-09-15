import type { Device } from "@prisma/client";
import type { DeviceCollector } from "./types.js";
import { linuxSshLogCollector } from "./linux-ssh-log.collector.js";
import { ciscoLogCollector, fortiGateLogCollector, mikroTikLogCollector, pfSenseLogCollector } from "./vendor-ssh-log.collector.js";

const collectors: DeviceCollector[] = [
  linuxSshLogCollector,
  mikroTikLogCollector,
  fortiGateLogCollector,
  ciscoLogCollector,
  pfSenseLogCollector
];

export function getCollectors() {
  return collectors;
}

export function selectCollector(device: Device | null) {
  return collectors.find((collector) => collector.supports(device)) ?? null;
}
