# Device / Asset Inventory Status Contract

This is the canonical contract for equipment inventory. It records the Phase A decision; it does not change the visible onboarding UI or current database schema.

## Ownership and projection

- `Device` is the authoritative control and connection entity.
- `Asset` is the inventory projection displayed by the equipment page.
- One Device may have zero or one linked Asset (`Asset.deviceId` is optional and unique).
- One active Device plus its linked Asset is one equipment item, not two independent records.
- Removing an active Device must atomically remove or archive its linked Asset projection. A projection detached by Device removal must not remain in the active equipment inventory.

The current Prisma relation uses `onDelete: SetNull`. Consequently, deletion currently leaves the Asset active and visible. Phase A preserves that behavior only to capture it in a regression test; Phase B must implement the contract.

## Independent status dimensions

| Dimension | Allowed values | Meaning |
| --- | --- | --- |
| `inventoryStatus` | `active`, `archived` | Whether the item belongs in active inventory |
| `connectionStatus` | `unknown`, `online`, `offline`, `error` | Latest connection observation |
| `verificationStatus` | `pending`, `verified`, `failed` | Whether onboarding/connection evidence verified the item |
| `managementStatus` | `managed`, `unmanaged` | Whether controlled management is enabled |

Diagnostics use nullable `lastErrorCode`, `lastErrorStage`, and `lastVerifiedAt`. These dimensions must not be collapsed into one ambiguous status field.

## List and removal rules

- The equipment list is an Asset projection and must include only active inventory records.
- A successful removal response means the item is absent from the next authoritative equipment fetch.
- Client cache invalidation is required after Phase B removal, but it cannot compensate for an orphan Asset returned by `/api/assets`.
- Imported Asset-only records may remain valid inventory records; Device removal semantics apply specifically to the linked projection for that Device.
