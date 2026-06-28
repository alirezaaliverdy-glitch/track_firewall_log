import { AiIntentType } from "@prisma/client";

export type NormalizedVendor = "mikrotik" | "fortigate" | "linux_edge";

function normalizedToken(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/[\s_-]+/g, "") : "";
}

export function normalizeVendor(value: unknown): NormalizedVendor | null {
  const token = normalizedToken(value);
  if (["mikrotik", "routeros", "mt", "mkt"].includes(token)) return "mikrotik";
  if (["fortigate", "fortinet", "fortios", "forti"].includes(token)) return "fortigate";
  if (["linux", "linuxedge", "ubuntu"].includes(token)) return "linux_edge";
  return null;
}

export function normalizeIntentType(value: unknown, vendorValue?: unknown): AiIntentType | null {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  const vendor = normalizeVendor(vendorValue) ?? (raw.startsWith("mikrotik_") ? "mikrotik" : null);
  if (vendor === "mikrotik" && ["change_ssh_port", "mikrotik_change_ssh_port", "mikrotik_change_service_port"].includes(raw)) {
    return AiIntentType.mikrotik_change_service_port;
  }
  return Object.values(AiIntentType).includes(raw as AiIntentType) ? raw as AiIntentType : null;
}

export type DeviceResolutionCandidate = {
  id: string;
  name: string;
  vendor: string;
  host: string;
  type: string;
};

export type DeviceResolutionResult =
  | { status: "resolved"; deviceId: string; candidates: DeviceResolutionCandidate[] }
  | { status: "selection_required"; message: string; candidates: DeviceResolutionCandidate[] }
  | { status: "not_found"; message: string; candidates: [] };

function isVendorDevice(device: DeviceResolutionCandidate, vendor: NormalizedVendor) {
  const deviceVendor = normalizeVendor(device.vendor);
  if (vendor === "mikrotik") return device.type === "mikrotik" || deviceVendor === "mikrotik";
  if (vendor === "fortigate") return device.type === "fortigate" || deviceVendor === "fortigate";
  return device.type === "linux_edge" || deviceVendor === "linux_edge";
}

export function resolveDeviceIdFromCandidates(
  devices: DeviceResolutionCandidate[],
  input: { deviceId?: unknown; vendor?: unknown; deviceHint?: unknown }
) {
  const explicitDeviceId = typeof input.deviceId === "string" ? input.deviceId.trim() : "";
  if (explicitDeviceId && devices.some((device) => device.id === explicitDeviceId)) return explicitDeviceId;

  const vendor = normalizeVendor(input.vendor) ?? normalizeVendor(input.deviceHint);
  const compatible = vendor ? devices.filter((device) => isVendorDevice(device, vendor)) : devices;
  if (compatible.length === 1) return compatible[0].id;

  const hint = typeof input.deviceHint === "string" ? input.deviceHint.trim().toLowerCase() : "";
  if (!hint || normalizeVendor(hint) || hint.length < 2) return undefined;
  const exact = compatible.filter((device) => [device.name, device.host].some((value) => value.toLowerCase() === hint));
  if (exact.length === 1) return exact[0].id;
  const partial = compatible.filter((device) => [device.name, device.host].some((value) => value.toLowerCase().includes(hint)));
  return partial.length === 1 ? partial[0].id : undefined;
}

export function resolveDeviceFromCandidates(
  devices: DeviceResolutionCandidate[],
  input: { deviceId?: unknown; vendor?: unknown; deviceHint?: unknown }
): DeviceResolutionResult {
  const explicit = typeof input.deviceId === "string" ? input.deviceId.trim() : "";
  if (explicit) {
    const selected = devices.find((device) => device.id === explicit);
    return selected
      ? { status: "resolved", deviceId: selected.id, candidates: [selected] }
      : { status: "not_found", message: "No device found. Add one in Device Registry.", candidates: [] };
  }
  const vendor = normalizeVendor(input.vendor) ?? normalizeVendor(input.deviceHint);
  const compatible = vendor ? devices.filter((device) => isVendorDevice(device, vendor)) : devices;
  if (compatible.length === 0) return { status: "not_found", message: "No device found. Add one in Device Registry.", candidates: [] };
  const resolved = resolveDeviceIdFromCandidates(devices, input);
  if (resolved) return { status: "resolved", deviceId: resolved, candidates: compatible.filter((device) => device.id === resolved) };
  return { status: "selection_required", message: "Choose a target device.", candidates: compatible };
}
