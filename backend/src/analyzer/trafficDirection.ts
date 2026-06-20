import type { NormalizedLog, TrafficDirection } from "./types.js";
import { getIpCategory } from "./ipUtils.js";

export const TRAFFIC_DIRECTION_LABELS: Record<TrafficDirection, string> = {
  inbound: "Internet -> Internal",
  outbound: "Internal -> Internet",
  internal: "Internal -> Internal",
  external: "Internet -> Internet",
  loopback: "Localhost",
  unknown: "Not enough IP data"
};

export function getTrafficDirection(log: NormalizedLog): TrafficDirection {
  const srcCategory = getIpCategory(log.srcIp);
  const dstCategory = getIpCategory(log.dstIp);

  if (srcCategory === "loopback" || dstCategory === "loopback") return "loopback";
  if (srcCategory === "missing" || dstCategory === "missing" || srcCategory === "invalid" || dstCategory === "invalid") return "unknown";
  if (srcCategory === "public" && dstCategory === "private") return "inbound";
  if (srcCategory === "private" && dstCategory === "public") return "outbound";
  if (srcCategory === "private" && dstCategory === "private") return "internal";
  if (srcCategory === "public" && dstCategory === "public") return "external";
  return "unknown";
}

export function enrichLogWithTrafficDirection(log: NormalizedLog): NormalizedLog {
  return {
    ...log,
    srcIpCategory: getIpCategory(log.srcIp),
    dstIpCategory: getIpCategory(log.dstIp),
    trafficDirection: getTrafficDirection(log)
  };
}

export function enrichLogsWithTrafficDirection(logs: NormalizedLog[]): NormalizedLog[] {
  return logs.map(enrichLogWithTrafficDirection);
}
