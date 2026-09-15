export type CredentialUsageDevice = {
  credentialId: string | null;
  capabilities: unknown;
};

export function credentialUsageCount(devices: CredentialUsageDevice[], credentialId: string) {
  return devices.reduce((count, device) => {
    const capabilities = device.capabilities && typeof device.capabilities === "object" && !Array.isArray(device.capabilities)
      ? device.capabilities as Record<string, unknown>
      : {};
    return count + Number(device.credentialId === credentialId || capabilities.enableCredentialId === credentialId);
  }, 0);
}
