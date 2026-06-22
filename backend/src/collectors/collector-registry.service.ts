import type { Device } from "@prisma/client";
import type { DeviceCollector } from "./types.js";
import { linuxSshLogCollector } from "./linux-ssh-log.collector.js";

const collectors: DeviceCollector[] = [
  linuxSshLogCollector
];

export function getCollectors() {
  return collectors;
}

export function selectCollector(device: Device | null) {
  return collectors.find((collector) => collector.supports(device)) ?? null;
}
