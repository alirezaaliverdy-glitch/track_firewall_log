export const INVENTORY_STATUSES = ["active", "archived"] as const;
export const CONNECTION_STATUSES = ["unknown", "online", "offline", "error"] as const;
export const VERIFICATION_STATUSES = ["pending", "verified", "failed"] as const;
export const MANAGEMENT_STATUSES = ["managed", "unmanaged"] as const;

export type InventoryStatus = (typeof INVENTORY_STATUSES)[number];
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
export type ManagementStatus = (typeof MANAGEMENT_STATUSES)[number];

export type CanonicalInventoryStatus = {
  inventoryStatus: InventoryStatus;
  connectionStatus: ConnectionStatus;
  verificationStatus: VerificationStatus;
  managementStatus: ManagementStatus;
  lastErrorCode: string | null;
  lastErrorStage: string | null;
  lastVerifiedAt: string | null;
};

export const DEVICE_ASSET_INVENTORY_CONTRACT = Object.freeze({
  controlEntity: "Device" as const,
  projectionEntity: "Asset" as const,
  relationship: "one-device-to-zero-or-one-asset" as const,
  activeInventoryRule: "An active Device and its linked Asset represent one visible equipment item." as const,
  removalRule: "Removing an active Device must atomically remove or archive its linked Asset projection." as const,
  orphanRule: "An Asset detached by Device removal must not remain in the active equipment inventory." as const
});

export function isInventoryStatus(value: unknown): value is InventoryStatus {
  return typeof value === "string" && (INVENTORY_STATUSES as readonly string[]).includes(value);
}
